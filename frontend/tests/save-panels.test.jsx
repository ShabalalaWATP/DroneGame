// @vitest-environment jsdom
// The client, the run saver and the panels that use them, with the backend up, refusing, and down.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, cleanSeed } from '../src/game.js';
import { ApiError, createApi } from '../src/api/client.js';
import { createRunSaver } from '../src/api/run-saver.js';
import { ADAPT, GAME_VERSION, STRUCTURES, resetAllFigures } from '../src/sim/config/index.js';
import { GameContext } from '../src/ui/hooks.js';
import { Overlay } from '../src/ui/Overlay.jsx';
import { SavedTab } from '../src/ui/dock/SavedTab.jsx';
import { RunsTab } from '../src/ui/dock/RunsTab.jsx';
import { FigureSets } from '../src/ui/dock/FigureSets.jsx';
import { MIXED, setUp, playWave } from './support/scenarios.js';
import { createFakeApi, createFakeStorage } from './support/fake-api.js';

const $ = (q) => document.querySelector(q);
const text = (q) => $(q) && $(q).textContent;
const type = (el, v) => fireEvent.change(el, { target: { value: v } });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const SAVE_KEY = 'site-guard.unsaved-runs';
const empty = { structures: [], fusionUplinks: [], fusionCell: 'B8' };

let game, api, storage;
const show = (ui) => render(<GameContext.Provider value={game}>{ui}</GameContext.Provider>);
const armed = () => { setUp(game.sim, { seed: '1', laydown: MIXED }); game.sim.state.warnedWire = true; };

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
  api = createFakeApi(); storage = createFakeStorage();
  game = createGame({ seed: '1', terrainSeed: '1', api, storage });
});
afterEach(() => { cleanup(); resetAllFigures(); vi.unstubAllGlobals(); });

describe('API client', () => {
  const stub = (impl) => { const f = vi.fn(impl); vi.stubGlobal('fetch', f); return f; };
  const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });

  it('sends JSON and reads it back, on the same origin', async () => {
    const f = stub(async () => reply(201, { id: 3 }));
    expect(await createApi().laydowns.create({ name: 'a' })).toEqual({ id: 3 });
    expect(f).toHaveBeenCalledWith('/api/v1/laydowns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"a"}' });
  });
  it('covers every route', async () => {
    const f = stub(async () => reply(200, []));
    const a = createApi();
    await a.laydowns.list(); await a.laydowns.get(1); await a.laydowns.replace(1, {}); await a.figureSets.list(); await a.runs.page(20, 40);
    expect(f.mock.calls.map(([url, o]) => `${o.method} ${url}`)).toEqual(['GET /api/v1/laydowns', 'GET /api/v1/laydowns/1', 'PUT /api/v1/laydowns/1', 'GET /api/v1/figure-sets', 'GET /api/v1/runs?limit=20&offset=40']);
  });
  it('treats delete as having no body', async () => {
    stub(async () => reply(204));
    expect(await createApi().runs.remove(1)).toBeNull();
  });
  it('says the server is down when it cannot be reached, or the proxy answers for it', async () => {
    stub(async () => { throw new TypeError('network'); });
    await expect(createApi().runs.list()).rejects.toMatchObject({ retryable: true, message: expect.stringMatching(/not running/) });
    stub(async () => reply(502));
    await expect(createApi().runs.list()).rejects.toMatchObject({ retryable: true });
  });
  it('says when a request is refused, which retrying will not help', async () => {
    for (const [status, msg] of [[404, /no longer exists/], [413, /too large/], [422, /invalid/], [415, /415/]]) {
      stub(async () => reply(status));
      await expect(createApi().runs.create({})).rejects.toMatchObject({ retryable: false, message: expect.stringMatching(msg) });
    }
  });
});

describe('run saver', () => {
  const make = () => {
    const notes = [];
    return { notes, saver: createRunSaver({ api, storage, notify: (m) => notes.push(m), onChange: () => {} }) };
  };
  it('saves straight away when the server is up', async () => {
    const { saver, notes } = make();
    await saver.save({ kills: 1 });
    expect(api.runs.rows.size).toBe(1);
    expect(saver.pending()).toBe(0);
    expect(saver.saved()).toBe(1);
    expect(notes).toEqual([]);
    expect(saver.message()).toMatch(/saved to your history/);
  });
  it('keeps a run when the server is down, says so, and saves it later', async () => {
    const { saver, notes } = make();
    api.state.down = true;
    await saver.save({ kills: 1 });
    await saver.save({ kills: 2 });
    expect(saver.pending()).toBe(2);
    expect(notes[0]).toMatch(/kept in this browser/);
    expect(await saver.flush()).toBe(0);
    expect(saver.pending()).toBe(2);
    api.state.down = false;
    expect(await saver.flush()).toBe(2);
    expect(saver.pending()).toBe(0);
    expect([...api.runs.rows.values()].map((r) => r.kills)).toEqual([1, 2]);
    expect(notes.at(-1)).toMatch(/2 kept runs saved/);
  });
  it('reports a run the server refuses, instead of retrying it for ever', async () => {
    const { saver, notes } = make();
    api.state.refuse = true;
    await saver.save({ kills: 1 });
    expect(saver.pending()).toBe(0);
    expect(notes[0]).toMatch(/could not be saved/);
    saver.keep({ kills: 2 });
    await saver.flush();
    expect(saver.pending()).toBe(0);
    expect(notes.at(-1)).toMatch(/kept run could not be saved/);
  });
  it('says so when storage is full too, so nothing is lost silently', async () => {
    const { saver, notes } = make();
    api.state.down = true;
    storage.full = true;
    await saver.save({ kills: 1 });
    expect(notes[0]).toMatch(/could not be saved or kept/);
  });
  it('copes with blocked or corrupt storage, and caps what it keeps', async () => {
    const { saver } = make();
    storage.setItem(SAVE_KEY, '{not json');
    expect(saver.pending()).toBe(0);
    for (let i = 0; i < 55; i++) saver.keep({ i });
    expect(saver.pending()).toBe(50);
    expect(JSON.parse(storage.getItem(SAVE_KEY))[0].i).toBe(5);
    const blocked = createRunSaver({ api, storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} }, notify: () => {}, onChange: () => {} });
    expect(blocked.pending()).toBe(0);
    blocked.keep({});
  });
  it('does not run two flushes at once', async () => {
    const { saver } = make();
    saver.keep({ kills: 1 });
    const [a, b] = await Promise.all([saver.flush(), saver.flush()]);
    expect(a + b).toBe(1);
    expect(api.runs.rows.size).toBe(1);
  });
});

describe('the game saves runs', () => {
  it('sends a finished run to the server', async () => {
    armed();
    game.sim.commands.startWave();
    game.sim.run(50);
    await act(async () => { game.commands.reset('keep'); });
    await settle();
    expect(api.runs.rows.size).toBe(1);
    expect(api.runs.rows.get(1).game_version).toBe(GAME_VERSION);
  });
  it('keeps a run in progress when the page closes, rather than racing the close', () => {
    armed();
    game.sim.commands.startWave();
    game.sim.run(50);
    game.pageClosing();
    expect(api.state.calls).not.toContain('runs.create');
    expect(game.saver.pending()).toBe(1);
  });
  it('shows on the game over card whether it was saved', async () => {
    setUp(game.sim, { seed: '1', laydown: [['rf', 900, 0]] });
    game.sim.state.warnedWire = true;
    show(<Overlay />);
    await act(async () => { while (!game.sim.state.over) { if (!game.sim.state.waveActive) game.sim.commands.startWave(); game.sim.run(200); } game.bump(); });
    await settle();
    expect(text('#save-status')).toMatch(/saved to your history/);
  }, 30000);
  it('cleans seeds to what can be saved', () => {
    expect(cleanSeed('a\nb\x00c')).toBe('abc');
    expect(cleanSeed('x'.repeat(100)).length).toBe(64);
    expect(cleanSeed('')).toBe('1');
    expect(cleanSeed(null)).toBe('1');
    expect(cleanSeed('\n')).toBe('1');
  });
});

describe('saved laydowns panel', () => {
  it('saves, lists, and needs a name', async () => {
    armed();
    show(<SavedTab active />);
    await settle();
    expect(screen.getByText('Nothing saved yet.')).toBeTruthy();
    expect($('#save-laydown').disabled).toBe(true);
    expect($('#save-laydown').textContent).toBe(`Save ${MIXED.length} systems`);
    fireEvent.submit($('.saved-form'));
    expect(api.laydowns.rows.size).toBe(0);
    type($('#save-name'), '  Outer ring ');
    fireEvent.click($('#save-laydown'));
    await settle();
    expect(api.laydowns.rows.get(1)).toMatchObject({ world: '1', game_version: GAME_VERSION });
    expect(api.laydowns.rows.get(1).spec.structures.length).toBe(MIXED.length);
    expect(text('#saved-note')).toContain('Outer ring');
    expect(text('#saved-list')).toContain('Outer ring');
    expect($('#save-name').value).toBe('');
  });

  it('keeps the name you typed when saving fails, and says why', async () => {
    armed();
    show(<SavedTab active />);
    await settle();
    api.state.refuse = true;
    type($('#save-name'), 'Rejected');
    fireEvent.click($('#save-laydown'));
    await settle();
    expect(text('#saved-note')).toMatch(/refused/);
    expect($('#save-name').value).toBe('Rejected');
  });

  it('loads on a second click, switches ground, and updates the address', async () => {
    armed();
    const spec = game.sim.currentLaydown();
    await api.laydowns.create({ name: 'Saved', world: 'hills', spec, game_version: GAME_VERSION });
    game.commands.reset('clear');
    show(<SavedTab active />);
    await settle();
    const load = () => screen.getByText(/^(Load|Replace run\?)$/);
    fireEvent.click(load());
    expect(load().textContent).toBe('Replace run?');
    expect(game.sim.structures.length).toBe(0);
    fireEvent.click(load());
    await settle();
    expect(game.sim.structures.length).toBe(MIXED.length);
    expect(game.sim.state.terrainSeed).toBe('hills');
    expect(location.search).toContain('terrain=hills');
    expect(text('#saved-note')).toBe('Loaded "Saved".');
  });

  it('warns when a laydown came from another version, and refuses one it cannot afford', async () => {
    armed();
    await api.laydowns.create({ name: 'Old', world: '1', spec: game.sim.currentLaydown(), game_version: '0.0.1' });
    show(<SavedTab active />);
    await settle();
    fireEvent.click(screen.getByText('Load'));
    fireEvent.click(screen.getByText('Replace run?'));
    await settle();
    expect(text('#saved-note')).toMatch(/saved by version 0.0.1/);
    STRUCTURES.radar.cost = 2e9;
    fireEvent.click(screen.getByText('Load'));
    fireEvent.click(screen.getByText('Replace run?'));
    await settle();
    expect(text('#saved-note')).toMatch(/more than the/);
  });

  it('updates and deletes on a second click', async () => {
    armed();
    await api.laydowns.create({ name: 'Mine', world: '1', spec: empty, game_version: GAME_VERSION });
    show(<SavedTab active />);
    await settle();
    fireEvent.click(screen.getByText('Update'));
    expect(api.laydowns.rows.get(1).spec).toEqual(empty);
    fireEvent.click(screen.getByText('Overwrite?'));
    await settle();
    expect(api.laydowns.rows.get(1).spec.structures.length).toBe(MIXED.length);
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Sure?'));
    await settle();
    expect(api.laydowns.rows.size).toBe(0);
  });

  it('forgets a half-finished click after a while', async () => {
    vi.useFakeTimers();
    await api.laydowns.create({ name: 'Mine', world: '1', spec: empty, game_version: GAME_VERSION });
    show(<SavedTab active />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('Sure?')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(screen.getByText('Delete')).toBeTruthy();
    vi.useRealTimers();
  });

  it('tells you when the server is down, keeps the game playable, and recovers', async () => {
    armed();
    api.state.down = true;
    show(<SavedTab active />);
    await settle();
    expect(text('#saved-error')).toMatch(/not running/);
    game.sim.run(10); // still playing
    api.state.down = false;
    fireEvent.click(screen.getByText('Try again'));
    await settle();
    expect($('#saved-error')).toBeNull();
  });

  it('does not fetch while hidden', async () => {
    show(<SavedTab active={false} />);
    await settle();
    expect(api.state.calls).toEqual([]);
  });
});

describe('run history panel', () => {
  const addRun = (over = {}) => api.runs.create({ scenario_seed: '7', world: '1', waves_completed: 3, kills: 9, leaks: 1, health: 45, capex: 1e6, consumables: 2e5, budget_left: 13.8e6, enemy_cost: 5e4, ...over });

  it('lists runs and says they are self-reported', async () => {
    await addRun();
    show(<RunsTab active />);
    await settle();
    expect(text('#runs-list')).toContain('45%');
    expect(document.body.textContent).toContain('not proof of a score');
  });
  it('explains an empty history', async () => {
    show(<RunsTab active />);
    await settle();
    expect(document.body.textContent).toContain('No runs recorded yet');
  });
  it('pages through them', async () => {
    for (let i = 0; i < 25; i++) await addRun({ kills: i });
    show(<RunsTab active />);
    await settle();
    expect(text('.runs-paging')).toContain('1–20 of 25');
    fireEvent.click(screen.getByText('Older'));
    await settle();
    expect(text('.runs-paging')).toContain('21–25 of 25');
    expect(screen.getByText('Older').disabled).toBe(true);
    fireEvent.click(screen.getByText('Newer'));
    await settle();
    expect(screen.getByText('Newer').disabled).toBe(true);
  });
  it('deletes on a second click', async () => {
    await addRun();
    show(<RunsTab active />);
    await settle();
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Sure?'));
    await settle();
    expect(api.runs.rows.size).toBe(0);
    expect(text('#runs-note')).toBe('Run deleted.');
    await addRun();
    await act(async () => { game.bump(); });
  });
  it('shows a new run when it is saved, even with the same message as last time', async () => {
    show(<RunsTab active />);
    await settle();
    for (let i = 1; i <= 2; i++) {
      await act(async () => { await game.saver.save({ scenario_seed: 's', world: '1', waves_completed: i, kills: i, leaks: 0, health: 100, capex: 0, consumables: 0, budget_left: 0, enemy_cost: 0 }); });
      await settle();
      expect(document.querySelectorAll('#runs-list tbody tr').length).toBe(i);
    }
  });
  it('shows kept runs and saves them when the server is back', async () => {
    api.state.down = true;
    await act(async () => { await game.saver.save({ scenario_seed: 's', world: '1', waves_completed: 1, kills: 1, leaks: 0, health: 100, capex: 0, consumables: 0, budget_left: 0, enemy_cost: 0 }); });
    show(<RunsTab active />);
    await settle();
    expect(text('#runs-error')).toMatch(/not running/);
    expect(text('#runs-pending')).toContain('1 run kept');
    fireEvent.click($('#runs-retry'));
    await settle();
    expect(text('#runs-note')).toMatch(/still not running/);
    api.state.down = false;
    fireEvent.click($('#runs-retry'));
    await waitFor(() => expect($('#runs-pending')).toBeNull());
    expect(api.runs.rows.size).toBe(1);
    expect($('#runs-error')).toBeNull();
    expect(document.querySelectorAll('#runs-list tbody tr').length).toBe(1);
  });
  it('reports a failed delete', async () => {
    await addRun();
    show(<RunsTab active />);
    await settle();
    api.state.down = true;
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Sure?'));
    await settle();
    expect(text('#runs-note')).toMatch(/not running/);
  });
});

describe('saved figure sets', () => {
  it('saves your changes and applies them over the researched values', async () => {
    const onApplied = vi.fn();
    game.commands.setFigure('structures', 'radar', 'published', 4242);
    game.commands.setAdapt('evadePerWave', 0.3);
    show(<FigureSets active onApplied={onApplied} />);
    await settle();
    expect($('#figset-save').disabled).toBe(true);
    fireEvent.submit($('#figure-sets .saved-form'));
    expect(api.figureSets.rows.size).toBe(0);
    type($('#figset-name'), 'Long range');
    fireEvent.click($('#figset-save'));
    await settle();
    const saved = api.figureSets.rows.get(1);
    expect(saved.figures.structures.radar.published).toBe(4242);
    expect(saved.figures.adapt.evadePerWave).toBe(0.3);
    expect(text('#figset-note')).toContain('Long range');

    resetAllFigures();
    game.commands.setFigure('drones', 'fpv', 'hp', 999); // not in the set, so applying must clear it
    fireEvent.click(screen.getByText('Apply'));
    expect(STRUCTURES.radar.published).not.toBe(4242);
    fireEvent.click(screen.getByText('Replace figures?'));
    await settle();
    expect(STRUCTURES.radar.published).toBe(4242);
    expect(ADAPT.evadePerWave).toBe(0.3);
    expect(game.sim.log.at(-1).name).toBe('applyFigures');
    expect(onApplied).toHaveBeenCalled();
    expect(text('#figset-note')).toContain('Applied');
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Sure?'));
    await settle();
    expect(api.figureSets.rows.size).toBe(0);
  });

  it('says when the server is down, and keeps what you typed', async () => {
    api.state.down = true;
    show(<FigureSets active onApplied={() => {}} />);
    await settle();
    expect(text('#figset-error')).toMatch(/not running/);
    type($('#figset-name'), 'Mine');
    fireEvent.click($('#figset-save'));
    await settle();
    expect(text('#figset-note')).toMatch(/not running/);
    expect($('#figset-name').value).toBe('Mine');
    api.state.down = false;
    fireEvent.click(screen.getByText('Try again'));
    await settle();
    expect($('#figset-error')).toBeNull();
  });
});

describe('ApiError', () => {
  it('carries whether retrying can help', () => {
    expect(new ApiError('x', true).retryable).toBe(true);
    expect(new ApiError('x', false).message).toBe('x');
  });
});
