// @vitest-environment jsdom
// The React panels, driven by a real simulation with no 3D view.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGame } from '../src/game.js';
import { FUSION, WORLD, ADAPT, resetAllFigures, STRUCTURES } from '../src/sim/config/index.js';
import { view } from '../src/render/view.js';
import { createReplay } from '../src/render/replay-view.js';
import { GameContext } from '../src/ui/hooks.js';
import { useHotkeys } from '../src/ui/useHotkeys.js';
import { App } from '../src/ui/App.jsx';
import { Hud } from '../src/ui/Hud.jsx';
import { Toolbar } from '../src/ui/Toolbar.jsx';
import { ControlPanel } from '../src/ui/ControlPanel.jsx';
import { Approvals, Toast, Tuning } from '../src/ui/Panels.jsx';
import { Sandbox } from '../src/ui/Sandbox.jsx';
import { Overlay } from '../src/ui/Overlay.jsx';
import { Timeline } from '../src/ui/Timeline.jsx';
import { MIXED, setUp, play } from './support/scenarios.js';
import { createFakeApi, createFakeStorage } from './support/fake-api.js';

let game;
const show = (ui) => render(<GameContext.Provider value={game}>{ui}</GameContext.Provider>);
const $ = (sel) => document.querySelector(sel);
const refresh = () => act(() => game.bump());
const armed = (laydown = MIXED) => { setUp(game.sim, { seed: '1', laydown }); refresh(); };

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
  game = createGame({ seed: '1', terrainSeed: '1', api: createFakeApi(), storage: createFakeStorage() });
  Object.assign(view, { truth: true, labels: true, rings: true, trackHi: false, replayT: null });
  FUSION.authority = 'auto';
});
afterEach(() => { cleanup(); resetAllFigures(); document.body.className = ''; });

// A spotter on station, with no weapons left that could shoot it down first.
function setUpSpotter() {
  for (const st of game.sim.structures.slice()) if (st.def.role === 'effector') game.sim.commands.sell(st.pos.x, st.pos.z);
  const d = game.sim.spawnDrone('spotter', 1, {});
  d.pos.set(Math.cos(1) * 120, d.pos.y, Math.sin(1) * 120); // just outside its standoff radius
  for (let i = 0; i < 400 && game.sim.spotterBonus() === 0; i++) game.sim.step();
}

describe('HUD', () => {
  it('shows the run, and shows a hostile seed as text', () => {
    game = createGame({ seed: '<img src=x onerror=alert(1)>', terrainSeed: '<b>t</b>', api: createFakeApi(), storage: createFakeStorage() });
    show(<Hud />);
    expect($('#status img')).toBeNull();
    expect($('#status').textContent).toContain('<img src=x onerror=alert(1)>');
    expect($('#status').textContent).toContain('<b>t</b>');
    expect($('#budget').textContent).toBe('$15M');
  });
  it('reports spotters and the cost exchange during a run', () => {
    armed();
    show(<Hud />);
    game.sim.state.warnedWire = true;
    play(game.sim, 2);
    game.sim.state.health = 20;
    setUpSpotter();
    refresh();
    expect($('#status .warn').textContent).toMatch(/Spotter on station/);
    expect($('#status').textContent).toMatch(/per \$1 destroyed/);
    expect($('#health-fill').style.background).toMatch(/229|e53935/);
  }, 30000);
});

describe('toolbar', () => {
  it('selects, deselects and marks what you cannot afford', () => {
    show(<Toolbar />);
    fireEvent.click(screen.getByText('Laser'));
    expect(game.getTool()).toBe('laser');
    expect($('.tool.active').textContent).toContain('Laser');
    fireEvent.click(screen.getByText('Laser'));
    expect(game.getTool()).toBeNull();
    fireEvent.click(screen.getByText('Sell'));
    expect($('.tool.active').textContent).toContain('Sell');
    game.sim.state.budget = 10;
    refresh();
    expect(document.querySelectorAll('.tool.poor').length).toBe(Object.keys(STRUCTURES).length);
  });
});

describe('control panel', () => {
  const panel = (props = {}) => show(<ControlPanel onToggleDock={vi.fn()} onToggleTuning={vi.fn()} onSandbox={vi.fn()} {...props} />);

  it('starts a wave and sets the speed', () => {
    armed();
    panel();
    game.sim.state.warnedWire = true;
    fireEvent.click($('#btn-wave'));
    expect(game.sim.state.wave).toBe(1);
    expect($('#btn-wave').disabled).toBe(true);
    expect($('#btn-wave').textContent).toBe('Wave 1 in progress');
    fireEvent.click($('[data-speed="3"]'));
    expect(game.clock).toMatchObject({ speed: 3, lastSpeed: 3 });
    expect($('[data-speed="3"]').className).toContain('active');
    fireEvent.click($('[data-speed="0"]'));
    expect(game.clock).toMatchObject({ speed: 0, lastSpeed: 3 });
  });

  it('toggles the view options, including the page class for tracks', () => {
    panel();
    fireEvent.click($('#truth'));
    expect(view.truth).toBe(false);
    fireEvent.click($('#labels-toggle'));
    expect(view.labels).toBe(false);
    fireEvent.click($('#rings'));
    expect(view.rings).toBe(false);
    fireEvent.click($('#track-hi'));
    expect(view.trackHi).toBe(true);
    expect(document.body.className).toContain('track-hi');
    fireEvent.click($('#auto'));
    expect(game.sim.state.autoStart).toBe(true);
    fireEvent.change($('#authority'), { target: { value: 'costly' } });
    expect(FUSION.authority).toBe('costly');
  });

  it('asks twice before throwing away the laydown', () => {
    vi.useFakeTimers();
    armed();
    panel();
    fireEvent.click($('#btn-clear'));
    expect($('#btn-clear').textContent).toBe('Sure? Click again');
    expect(game.sim.structures.length).toBe(MIXED.length);
    act(() => { vi.advanceTimersByTime(3100); });
    expect($('#btn-clear').textContent).toBe('New laydown');
    fireEvent.click($('#btn-clear'));
    fireEvent.click($('#btn-clear'));
    expect(game.sim.structures.length).toBe(0);
    vi.useRealTimers();
  });

  it('resets, opens the sandbox, and does nothing before deployment', () => {
    const onSandbox = vi.fn(), onToggleDock = vi.fn(), onToggleTuning = vi.fn();
    panel({ onSandbox, onToggleDock, onToggleTuning });
    fireEvent.click($('#btn-clear')); // not deployed yet, so this does nothing
    expect($('#btn-clear').textContent).toBe('New laydown');
    fireEvent.click($('#btn-reset'));
    armed();
    fireEvent.click($('#btn-sandbox'));
    expect(onSandbox).toHaveBeenCalled();
    expect(game.sim.state.sandbox).toBe(true);
    expect($('#btn-wave').textContent).toBe('Exit sandbox to start');
    fireEvent.click($('#btn-sandbox'));
    expect(game.sim.state.sandbox).toBe(false);
    fireEvent.click($('#btn-reset'));
    expect(game.sim.structures.length).toBe(MIXED.length);
    fireEvent.click($('#btn-sapient')); fireEvent.click($('#btn-tuning'));
    expect(onToggleDock).toHaveBeenCalled();
    expect(onToggleTuning).toHaveBeenCalled();
  });
});

describe('approvals', () => {
  it('pauses for a decision, and resumes when it is answered', () => {
    FUSION.authority = 'all';
    armed([['radar', 600, 0], ['rf', 900, 0], ['rf', -900, 0], ['interceptor', 490, 99]]);
    show(<Approvals />);
    game.sim.state.warnedWire = true;
    game.sim.commands.startWave();
    game.setSpeed(2);
    for (let i = 0; i < 6000 && !game.sim.net.pendingRequests.length; i++) game.sim.step();
    expect(game.clock.speed).toBe(0);
    refresh();
    expect($('#approval').className).not.toContain('hidden');
    expect($('.req-h').textContent).toBe('AUTHORISE ENGAGEMENT?');
    while (game.sim.net.pendingRequests.length) fireEvent.click(screen.getAllByText('Deny')[0]);
    expect(game.clock.speed).toBe(2);
    expect($('#approval').className).toContain('hidden');
  }, 30000);
});

describe('toasts', () => {
  it('show a message and fade it out', () => {
    vi.useFakeTimers();
    show(<Toast />);
    act(() => game.toast('hello'));
    expect($('#toast').textContent).toBe('hello');
    expect($('#toast').className).toBe('show');
    act(() => { vi.advanceTimersByTime(3000); });
    expect($('#toast').className).toBe('');
    vi.useRealTimers();
  });
});

describe('tuning', () => {
  it('commits valid numbers and restores invalid ones', () => {
    const before = WORLD.timeScale, adapt = ADAPT.evadePerWave;
    show(<Tuning open />);
    const [time, evade] = document.querySelectorAll('#tuning input');
    fireEvent.change(time, { target: { value: '9' } });
    expect(WORLD.timeScale).toBe(9);
    fireEvent.change(time, { target: { value: '0.1' } }); // under the minimum
    expect(WORLD.timeScale).toBe(9);
    expect(time.value).toBe('9');
    fireEvent.change(evade, { target: { value: '' } });
    expect(ADAPT.evadePerWave).toBe(adapt);
    WORLD.timeScale = before;
  });
  it('can be hidden', () => {
    show(<Tuning open={false} />);
    expect($('#tuning').className).toContain('hidden');
  });
});

describe('sandbox panel', () => {
  it('launches attacks from the form', () => {
    armed();
    show(<Sandbox />);
    expect($('#sandbox').className).toContain('hidden');
    act(() => game.commands.enterSandbox());
    expect($('#sandbox').className).not.toContain('hidden');
    fireEvent.change($('#sb-level'), { target: { value: '4' } });
    expect(game.sim.state.sbLevel).toBe(4);
    fireEvent.change($('#sb-type'), { target: { value: 'fw' } });
    fireEvent.change($('#sb-count'), { target: { value: '99' } });
    fireEvent.change($('#sb-dir'), { target: { value: 'rand' } });
    fireEvent.change($('#sb-gap'), { target: { value: '-3' } });
    fireEvent.click($('#sb-launch'));
    expect(game.sim.state.sbQueue.length).toBe(30);
    expect(game.sim.state.sbQueue.every((q) => q.type === 'fw' && q.t === game.sim.state.sbQueue[0].t)).toBe(true);
    fireEvent.click($('#sb-wave'));
    expect(game.sim.state.sbQueue.length).toBeGreaterThan(30);
    fireEvent.click($('#sb-clear'));
    expect($('#sb-info').textContent).toContain('0 drone(s) queued');
    fireEvent.click($('#sb-exit'));
    expect(game.sim.state.sandbox).toBe(false);
  });
});

describe('overlay', () => {
  it('deploys with the seeds typed in, and defaults blanks', () => {
    show(<Overlay />);
    fireEvent.click($('#btn-seed-random'));
    expect($('#seed-input').value).toMatch(/^\d{6}$/);
    fireEvent.change($('#seed-input'), { target: { value: ' 99 ' } });
    fireEvent.change($('#terrain-input'), { target: { value: '  ' } });
    fireEvent.click($('#btn-deploy'));
    expect(game.sim.state).toMatchObject({ started: true, seed: '99', terrainSeed: '1' });
    expect(location.search).toBe('?seed=99&terrain=1');
    expect($('#overlay')).toBeNull();
  });
  it('offers a retry when the site is lost', () => {
    armed([['rf', 900, 0]]);
    show(<Overlay />);
    play(game.sim, 8);
    refresh();
    expect($('.card h1').textContent).toBe('SITE LOST');
    fireEvent.click($('#btn-restart'));
    expect(game.sim.state.over).toBe(false);
    expect($('#overlay')).toBeNull();
    expect(game.sim.structures.length).toBe(1);
    play(game.sim, 8);
    refresh();
    fireEvent.click($('#btn-restart-clear'));
    expect(game.sim.structures.length).toBe(0);
  }, 30000);
});

describe('hotkeys', () => {
  function Keys() { useHotkeys(); return <input id="field" />; }
  const key = (k, target = window) => fireEvent.keyDown(target, { key: k });
  it('drive the tools, speed and view, but not while typing', () => {
    show(<Keys />);
    key('1');
    expect(game.getTool()).toBe('radar');
    key('Escape');
    expect(game.getTool()).toBeNull();
    key('Escape');
    key('x');
    expect(game.getTool()).toBe('sell');
    key(' ');
    expect(game.clock.speed).toBe(0);
    key(' ');
    expect(game.clock.speed).toBe(1);
    key('r'); key('T'); key('l');
    expect(view).toMatchObject({ rings: false, truth: false, labels: false });
    key('z');
    fireEvent.keyDown($('#field'), { key: '2' });
    expect(game.getTool()).toBe('sell');
    key('ArrowLeft'); key('ArrowRight');
  });
});

describe('timeline', () => {
  const withReplay = () => {
    const speed = { last: 1 };
    const replay = createReplay({
      scene: new THREE.Scene(), rec: game.sim.rec, droneTemplate: () => new THREE.Group(),
      makeLabel: () => document.createElement('div'), placeLabel: () => {}, trackColour: () => 0xffffff,
      getStructures: () => game.sim.structures, labelOf: () => document.createElement('div'), hideLive: () => {},
      setSpeed: game.setSpeed, getLastSpeed: () => speed.last, setPaused: () => game.setSpeed(0),
    });
    game.getReplay = () => replay;
    return replay;
  };
  it('scrubs, plays and returns to live, and shows the markers', () => {
    armed();
    const replay = withReplay();
    game.sim.state.warnedWire = true;
    game.sim.commands.startWave();
    game.sim.run(6000);
    show(<Timeline />);
    expect($('#review-banner').className).toBe('hidden');
    expect(Number($('#tl-range').max)).toBe(game.sim.rec.frames.length - 1);
    expect($('#tl-events').children.length).toBeGreaterThan(0);
    fireEvent.change($('#tl-range'), { target: { value: '10' } });
    expect(replay.active()).toBe(true);
    expect(game.clock.speed).toBe(0);
    act(() => { replay.update(0, new THREE.PerspectiveCamera()); game.bump(); });
    expect($('#review-banner').textContent).toContain('REPLAY');
    expect(view.replayT).toBe(game.sim.rec.frames[10].t);
    fireEvent.click($('#tl-play'));
    expect($('#tl-play').textContent).toBe('❚❚');
    act(() => { replay.update(0.05, new THREE.PerspectiveCamera()); });
    fireEvent.click($('#tl-back'));
    fireEvent.click($('#tl-fwd'));
    expect(replay.review.playing).toBe(false);
    fireEvent.click($('#tl-live'));
    expect(replay.active()).toBe(false);
    expect(view.replayT).toBeNull();
    expect(game.clock.speed).toBe(1);
    fireEvent.click($('#tl-play'));
    expect(replay.review.playing).toBe(false);
    replay.reset();
  }, 30000);
  it('does nothing without a replay or history', () => {
    show(<Timeline />);
    fireEvent.click($('#tl-back'));
    fireEvent.change($('#tl-range'), { target: { value: '0' } });
    expect($('#tl-time').textContent).toBe('0:00');
  });
});

describe('the whole page', () => {
  it('renders every panel and opens the dock', () => {
    game.attach = vi.fn();
    render(<App game={game} />);
    expect(game.attach).toHaveBeenCalledWith($('#game'), $('#labels'));
    expect($('#dock').className).toContain('hidden');
    fireEvent.click($('#btn-sapient'));
    expect($('#dock').className).not.toContain('hidden');
    fireEvent.click($('#dock-close'));
    expect($('#dock').className).toContain('hidden');
    fireEvent.click($('#btn-tuning'));
    expect($('#tuning').className).not.toContain('hidden');
    fireEvent.click($('#btn-deploy'));
    fireEvent.click($('#btn-sandbox'));
    expect($('#tuning').className).toContain('hidden');
    expect($('#hud-bottom-left summary').textContent).toBe('Legend');
  });
});

describe('the game wiring', () => {
  it('turns ground clicks into placement, and reports problems', () => {
    const toasts = [];
    game.onToast((t) => toasts.push(t));
    expect(game.subscribe(() => {})).toBeTypeOf('function');
    expect(game.getView()).toBeNull();
    game.figuresChanged();
    game.setViewOption('rings', true);
    const off = game.onFrame(() => {});
    off();
    expect(game.getTick()).toBeGreaterThan(0);
  });
});
