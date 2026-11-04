// @vitest-environment jsdom
// The SAPIENT panel's tabs and its canvas drawing, against a real simulation.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../src/game.js';
import { COMMS, STRUCTURES, WORLD, WAVES, resetAllFigures, setFigure } from '../src/sim/config/index.js';
import { view } from '../src/render/view.js';
import { GameContext } from '../src/ui/hooks.js';
import { Dock } from '../src/ui/dock/Dock.jsx';
import { summary } from '../src/ui/dock/MessagesTab.jsx';
import { safeHref, SourceLinks } from '../src/ui/dock/SourceLinks.jsx';
import { basisOf } from '../src/ui/dock/SourcesTab.jsx';
import { followMessages } from '../src/ui/dock/LearnTab.jsx';
import { createPlanCanvas } from '../src/ui/dock/plan-canvas.js';
import { createNetworkCanvas, pointAlong, linkColour, nodeList } from '../src/ui/dock/network-canvas.js';
import { drawSpectrum, jamConflicts } from '../src/ui/dock/spectrum-canvas.js';
import { createMinimap } from '../src/ui/minimap.js';
import { terrainState } from '../src/sim/terrain.js';
import { MIXED, setUp, play } from './support/scenarios.js';
import { createFakeApi, createFakeStorage } from './support/fake-api.js';

// a 2D context that accepts every drawing call
const fakeContext = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
const sized = (el) => { Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true }); Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true }); el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 }); return el; };
const newCanvas = () => sized(document.createElement('canvas'));

let game;
const $ = (sel) => document.querySelector(sel);
const refresh = () => act(() => game.bump());
const tab = (name) => fireEvent.click($(`[data-tab="${name}"]`));
function openDock(name) {
  render(<GameContext.Provider value={game}><Dock open onClose={() => {}} /></GameContext.Provider>);
  if (name) tab(name);
}
const running = (laydown = MIXED, steps = 2400) => {
  setUp(game.sim, { seed: '1', laydown });
  game.sim.state.warnedWire = true;
  game.sim.commands.startWave();
  game.sim.run(steps);
};

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = fakeContext;
  game = createGame({ seed: '1', terrainSeed: '1', api: createFakeApi(), storage: createFakeStorage() });
  Object.assign(view, { truth: true, labels: true, rings: true, trackHi: false, replayT: null });
});
afterEach(() => { cleanup(); resetAllFigures(); });

describe('dock', () => {
  it('switches tabs, keeps one visible, and grows', () => {
    openDock();
    expect($('[data-pane="messages"]').className).not.toContain('hidden');
    tab('nodes');
    expect($('[data-pane="messages"]').className).toContain('hidden');
    expect($('[data-pane="nodes"]').className).not.toContain('hidden');
    fireEvent.click($('#dock-max'));
    expect($('#dock').className).toContain('max');
  });
});

describe('messages tab', () => {
  it('lists messages, filters them, and shows one in detail', () => {
    running();
    openDock('messages');
    const rows = () => document.querySelectorAll('#msg-list .row');
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThanOrEqual(150);
    fireEvent.click($('.chip[data-type="status_report"]'));
    expect($('.chip[data-type="status_report"]').className).toContain('off');
    expect([...rows()].some((r) => r.className.includes('t-status_report'))).toBe(false);
    fireEvent.click($('.chip[data-type="status_report"]'));
    fireEvent.click(rows()[rows().length - 1]);
    expect($('#msg-detail').textContent).toContain('timestamp');
    fireEvent.click($('#log-explain'));
    expect($('#msg-detail').textContent).not.toBe('Select a message to see its JSON.');
    const node = game.sim.structures[0];
    fireEvent.change($('#node-filter'), { target: { value: node.nodeId } });
    expect(rows().length).toBeGreaterThan(0);
    expect([...rows()].every((r) => r.textContent.includes(node.name) || r.textContent.includes('Fusion'))).toBe(true);
  }, 30000);

  it('freezes, clears, exports and injects a fault', () => {
    running();
    openDock('messages');
    fireEvent.click($('#log-freeze'));
    expect($('#log-freeze').textContent).toBe('Resume');
    const n = document.querySelectorAll('#msg-list .row').length;
    game.sim.run(100);
    refresh();
    expect(document.querySelectorAll('#msg-list .row').length).toBe(n);
    fireEvent.click($('#log-freeze'));
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click($('#log-export'));
    expect(click).toHaveBeenCalled();
    click.mockRestore();
    fireEvent.click($('#log-clear'));
    expect(document.querySelectorAll('#msg-list .row').length).toBe(0);
    fireEvent.click($('#log-fault'));
    expect(screen.getAllByText('error').length).toBeGreaterThan(0);
  }, 30000);

  it('summarises every message type', () => {
    running(MIXED, 6000);
    const seen = new Set();
    for (const e of game.sim.bus.entries) { expect(typeof summary(e)).toBe('string'); seen.add(e.type); }
    expect(seen.size).toBeGreaterThan(4);
    const wrap = (type, body) => ({ type, msg: { [type]: body } });
    expect(summary(wrap('registration_ack', { acceptance: false }))).toBe('rejected');
    expect(summary(wrap('registration', { name: 'n', node_definition: [{ node_type: 'NODE_TYPE_RADAR' }] }))).toBe('n (RADAR)');
    expect(summary(wrap('error', { error_message: ['x', 'y'] }))).toBe('x; y');
    expect(summary(wrap('detection_report', { object_id: 'abcdefgh', detection_confidence: 1, location: {} }))).toContain('location');
    expect(summary({ type: 'other', msg: { other: {} } })).toBe('');
  }, 30000);

  it('shows only what had been sent while rewinding', () => {
    running();
    view.replayT = 10;
    openDock('messages');
    for (const r of document.querySelectorAll('#msg-list .tm')) expect(parseFloat(r.textContent)).toBeLessThanOrEqual(10);
  }, 30000);
});

describe('nodes tab', () => {
  it('lists every node, and what it is doing', () => {
    running();
    openDock('nodes');
    expect(document.querySelectorAll('#node-table tbody tr').length).toBe(game.sim.net.nodes.size);
    expect($('#node-table').textContent).toContain('RDR-01');
  }, 30000);
});

describe('plan tab', () => {
  it('offers coverage for each threat', () => {
    openDock('plan');
    expect($('#cov-legend').textContent).toBe('');
    fireEvent.click($('#cov-on'));
    expect($('#cov-legend').textContent).toContain('red: unseen');
    fireEvent.change($('#cov-threat'), { target: { value: 'fw' } });
    expect($('#cov-threat').value).toBe('fw');
  });
  it('draws a running game, with and without coverage', () => {
    running();
    terrainState.hillshade = document.createElement('canvas');
    const cv = newCanvas(), plan = createPlanCanvas(cv, game.sim);
    plan.draw(null);
    plan.draw('fpv');
    plan.draw('fpv'); // cached
    view.truth = false;
    plan.draw(null);
    expect(cv.width).toBe(600);
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
    expect(() => createPlanCanvas(document.createElement('canvas'), game.sim).draw(null)).not.toThrow();
    plan.dispose();
    terrainState.hillshade = null;
  }, 30000);
});

describe('network tab', () => {
  it('wires everything, shows the cost, and clears it', () => {
    setUp(game.sim, { seed: '1', laydown: [['rf', 900, 0], ['jammer', 500, 300]] });
    game.commands.clearAll();
    openDock('network');
    expect($('#net-cost').textContent).toContain('2 systems unwired');
    fireEvent.click($('#net-auto'));
    expect($('#net-cost').textContent).not.toContain('unwired');
    fireEvent.click($('#net-clear'));
    expect($('#net-cost').textContent).toContain('unwired');
    expect($('#net-static').textContent).toContain('Network design');
  });

  it('selects by clicking the diagram, and wires from the canvas and the side panel', async () => {
    setUp(game.sim, { seed: '1', laydown: [['rf', 900, 0], ['jammer', 500, 300]] });
    openDock('network');
    const cv = sized($('#net-canvas'));
    const click = (x, y) => fireEvent.click(cv, { clientX: x, clientY: y });
    // Starlink box, with nothing selected: only a hint
    const toasts = [];
    game.onToast((t) => toasts.push(t));
    await drawNow();
    click(120, 35);
    expect(toasts[0]).toMatch(/Select a system first/);
    fireEvent.mouseMove(cv, { clientX: 120, clientY: 35 });
    expect(cv.style.cursor).toBe('pointer');
    fireEvent.mouseMove(cv, { clientX: 590, clientY: 390 });
    expect(cv.style.cursor).toBe('default');
    click(300, 130); // fusion box
    expect($('#net-static').textContent).toContain('Fusion node');
    expect($('#net-live').textContent).toContain('Fusion links');
    fireEvent.click($('[data-fus="starlink"]'));
    expect(game.sim.net.fusion.uplinks.has('starlink')).toBe(false);
    click(120, 35); // wires the fusion node back to Starlink
    expect(game.sim.net.fusion.uplinks.has('starlink')).toBe(true);
    fireEvent.change($('[data-fusband]'), { target: { value: 'n78' } });
    expect(game.sim.net.fusion.cellBand).toBe('n78');
    click(50, 225); // the first sensor
    const rf = game.sim.structures.find((s) => s.def.id === 'rf');
    expect($('#net-static').textContent).toContain(rf.name);
    fireEvent.click($('input[name="uplink"][value=""]'));
    expect(rf.uplink).toBeNull();
    expect($('#net-live').textContent).toContain('No terminal wired');
    fireEvent.click($('input[name="uplink"][value="starlink"]'));
    expect(rf.uplink).toBe('starlink');
    fireEvent.change($('[data-band]'), { target: { value: 'B3' } });
    expect(rf.cellBand).toBe('B3');
    click(120, 35); // clicking its network again unplugs it
    expect(rf.uplink).toBeNull();
    click(590, 390); // empty space clears the selection
    expect($('#net-static').textContent).toContain('Network design');
    click(320, 225); // the jammer
    fireEvent.click($('[data-jam="gnss"]'));
    expect(game.sim.structures.find((s) => s.jamBands).jamBands.has('gnss')).toBe(true);
  });

  it('steps to the next packet, on the selected wire if there is one', () => {
    setUp(game.sim, { seed: '1', laydown: [['rf', 900, 0]] });
    openDock('network');
    const packets = game.sim.net.comms.packets, before = packets.length;
    fireEvent.click($('#net-step'));
    expect(game.clock.speed).toBe(0);
    expect(packets.length).toBeGreaterThan(before);
    fireEvent.change($('#net-pace'), { target: { value: '2' } });
    expect($('#net-pace').value).toBe('2');
  });

  it('taps a wire: link stats, packets, freeze and detail', async () => {
    running([['rf', 900, 0], ['rf', -900, 0], ['radar', 600, 0]], 400);
    openDock('network');
    const cv = sized($('#net-canvas'));
    await drawNow();
    fireEvent.click(cv, { clientX: 50, clientY: 225 });
    expect($('.lstats').textContent).toMatch(/Status|Sent/);
    const pk = () => document.querySelectorAll('#net-live .pk');
    expect(pk().length).toBeGreaterThan(0);
    fireEvent.click(pk()[0]);
    expect($('.pk.sel')).not.toBeNull();
    expect($('.pk-json').textContent).not.toContain('Click a packet');
    fireEvent.click($('#net-freeze'));
    expect($('#net-freeze').textContent).toBe('Resume');
    const first = pk()[0].textContent;
    game.sim.run(100);
    refresh();
    expect(pk()[0].textContent).toBe(first);
  }, 30000);

  it('shows pulses and helpers correctly', () => {
    expect(pointAlong([{ x: 0, y: 0 }], 0.5)).toBeNull();
    expect(pointAlong([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0.5)).toEqual({ x: 5, y: 0 });
    expect(pointAlong([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2)).toEqual({ x: 10, y: 0 });
    expect(linkColour(null)).toBe('#5c6b86');
    expect(linkColour({ up: false })).toBe('#ef5350');
    expect(linkColour({ up: true, quality: 0.3 })).toBe('#ffb300');
    expect(linkColour({ up: true, quality: 0.9 })).toBe('#66bb6a');

    running([['rf', 900, 0], ['radar', 600, 0], ['jammer', 500, 300]], 200);
    const rf = game.sim.structures.find((s) => s.def.id === 'rf');
    game.sim.commands.wireFusion('starlink', true);
    const cv = newCanvas();
    const d = createNetworkCanvas(cv, game.sim.net, { getSel: () => ({ kind: 'wire', id: rf.nodeId }), isVisible: () => true, getPace: () => 1 });
    d.draw();
    game.sim.run(200); // packets become pulses
    d.draw();
    d.setHover('starlink');
    d.draw();
    expect(d.hitTest({ x: 590, y: 395 })).toEqual({});
    rf.offline = true;
    d.draw();
    const pts = nodeList(game.sim.net);
    expect(pts.length).toBe(3);
    d.dispose();
  }, 30000);
});

// wait for the diagram's animation loop to draw
const drawNow = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

describe('spectrum tab', () => {
  it('warns when your jamming overlaps your own links', () => {
    setUp(game.sim, { seed: '1', laydown: [['rf', 900, 0], ['jammer', 500, 300]] });
    game.sim.commands.wireNode(game.sim.structures.find((s) => s.def.id === 'rf'), 'cellular');
    openDock('spectrum');
    expect($('#spec-notes').textContent).toContain('No overlap');
    game.sim.structures.find((s) => s.jamBands).jamBands.add('control900');
    refresh();
    expect($('#spec-notes').textContent).toContain('overlaps your');
    expect(jamConflicts(game.sim.net).length).toBeGreaterThan(0);
    const cv = newCanvas();
    drawSpectrum(cv, game.sim.net);
    game.sim.structures.find((s) => s.jamBands).mode = 'Jam';
    drawSpectrum(cv, game.sim.net);
    refresh();
    expect($('#spec-notes b').textContent).toContain('JAM');
    drawSpectrum(document.createElement('canvas'), game.sim.net);
  });
});

describe('learn tab', () => {
  it('finds examples from this run, or says there are none yet', () => {
    openDock('learn');
    fireEvent.click($('[data-step="7"]')); // kills: none yet
    expect($('#learn-json').textContent).toContain('No message of this kind');
    running();
    fireEvent.click($('[data-step="0"]'));
    expect($('#learn-json').textContent).toContain('A system joins the network');
    for (let i = 1; i < 9; i++) fireEvent.click($(`[data-step="${i}"]`));
  }, 30000);

  it('follows a track through its messages', () => {
    running(MIXED, 3600);
    openDock('learn');
    refresh();
    const tr = [...game.sim.net.tracks.values()].find((t) => t.short);
    expect(tr).toBeTruthy();
    expect(followMessages(tr).length).toBeGreaterThan(0);
    fireEvent.change($('#follow'), { target: { value: tr.id } });
    const rows = document.querySelectorAll('#follow-list .pk');
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.click(rows[0]);
    expect($('#learn-json').textContent).toContain(' at ');
    fireEvent.change($('#follow'), { target: { value: '' } });
    expect(document.querySelectorAll('#follow-list .pk').length).toBe(0);
  }, 30000);
});

describe('cost tab', () => {
  it('starts empty, then shows the laydown, shots and enemy', () => {
    openDock('cost');
    setUp(game.sim, { seed: '1', laydown: [] });
    game.commands.clearAll();
    refresh();
    expect($('#cost').textContent).toContain('Nothing placed yet');
    setUp(game.sim, { seed: '1', laydown: [['radar', 600, 0], ['interceptor', 490, 99], ['rf', 900, 0]] });
    game.sim.state.warnedWire = true;
    play(game.sim, 6);
    Object.assign(game.sim.ledger, { lost: { radar: 2 }, lostValue: 1800000 });
    refresh();
    const text = $('#cost').textContent;
    expect(text).toContain('Radar');
    expect(text).toContain('terminal');
    expect(text).toMatch(/\$[\d.]+ of shots/);
    expect(text).toContain('Lost to enemy strikes');
    expect($('#cost a')).not.toBeNull();
  }, 60000);
});

describe('sources tab', () => {
  it('edits a figure, shows a reset for it, and resets it', () => {
    const changed = vi.spyOn(game, 'figuresChanged');
    openDock('systems');
    const range = $('#systems input[data-key="published"]');
    const base = STRUCTURES.radar.published;
    fireEvent.change(range, { target: { value: '3000' } });
    expect(STRUCTURES.radar.range).toBe(3000);
    expect(changed).toHaveBeenCalled();
    const fig = range.closest('label');
    expect(fig.querySelector('.fr').className).not.toContain('hidden');
    fireEvent.click(fig.querySelector('.fr'));
    expect(STRUCTURES.radar.published).toBe(base);
    fireEvent.change(range, { target: { value: '-5' } });
    expect(STRUCTURES.radar.published).toBe(base);
    expect(range.value).toBe(String(base));
  });

  it('scales ranges, sets the gap, resets all and exports', () => {
    openDock('systems');
    fireEvent.change($('#src-rangescale'), { target: { value: '2' } });
    expect(WORLD.rangeScale).toBe(2);
    expect(STRUCTURES.radar.range).toBe(STRUCTURES.radar.published * 2);
    fireEvent.change($('#src-fpvgap'), { target: { value: '7' } });
    expect(WAVES.fpvGap).toBe(7);
    fireEvent.click($('#src-reset'));
    expect(WORLD.rangeScale).toBe(1);
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click($('#src-export'));
    expect(click).toHaveBeenCalled();
    click.mockRestore();
    const fileClick = vi.spyOn($('#src-file'), 'click').mockImplementation(() => {});
    fireEvent.click($('#src-import'));
    expect(fileClick).toHaveBeenCalled();
  });

  it('imports a valid file, and refuses a broken one with a message', async () => {
    const toasts = [];
    game.onToast((t) => toasts.push(t));
    openDock('systems');
    const file = (text) => ({ target: { files: [{ text: async () => text }], value: '' } });
    await act(async () => { fireEvent.change($('#src-file'), file(JSON.stringify({ structures: { radar: { published: 1234 } } }))); await Promise.resolve(); });
    expect(STRUCTURES.radar.published).toBe(1234);
    await act(async () => { fireEvent.change($('#src-file'), file('{not json')); await Promise.resolve(); });
    expect(toasts[0]).toMatch(/not a valid figures export/);
    await act(async () => { fireEvent.change($('#src-file'), { target: { files: [] } }); });
  });

  it('labels where each figure comes from', () => {
    const def = { ref: { confidence: 'ASSUMPTION', cost: { confidence: 'Press' } }, confidence: 'x', costRef: { confidence: 'ASSUMPTION' } };
    expect(basisOf('structures', def, 'published')).toBe('assumption');
    expect(basisOf('structures', def, 'cost')).toBe('price');
    expect(basisOf('structures', def, 'missileSpeed')).toBe('research');
    expect(basisOf('structures', def, 'damage')).toBe('rule');
    expect(basisOf('comms', def, 'cost')).toBe('price');
    expect(basisOf('comms', { confidence: 'ASSUMPTION' }, 'latency')).toBe('assumption');
    expect(basisOf('comms', def, 'latency')).toBe('research');
    expect(basisOf('drones', def, 'cost')).toBe('assumption');
    expect(basisOf('drones', def, 'hp')).toBe('rule');
    setFigure('comms', 'starlink', 'cost', COMMS.starlink.cost);
  });
});

describe('source links', () => {
  it('only ever link to https', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com');
    for (const bad of ['javascript:alert(1)', 'http://example.com', 'data:text/html,x', 'not a url']) expect(safeHref(bad)).toBeNull();
    render(<SourceLinks sources={[{ url: 'javascript:alert(1)', label: 'bad' }, { url: 'https://a.example', label: 'one' }, { url: 'https://b.example', label: 'two' }]} />);
    expect([...document.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['one', 'two']);
    cleanup();
    render(<SourceLinks sources={[]} />);
    expect(document.body.textContent).toContain('none found');
  });
});

describe('minimap', () => {
  it('draws, moves the camera and zooms', () => {
    setUp(game.sim, { seed: '1', laydown: MIXED });
    game.sim.spawnDrone('fpv', 0, {});
    const cv = newCanvas();
    cv.width = cv.height = 226;
    cv.setPointerCapture = () => {};
    const camera = { position: { x: 0, y: 300, z: 380 }, fov: 55, aspect: 1.5 };
    const controls = { target: { x: 0, y: 0, z: 0 } };
    terrainState.hillshade = document.createElement('canvas');
    const map = createMinimap(game.sim, cv, camera, controls);
    map.draw(); map.draw();
    view.rings = false; view.truth = false;
    map.draw(); map.draw();
    const at = (type) => { const e = new MouseEvent(type, { clientX: 100, clientY: 100 }); e.pointerId = 1; cv.dispatchEvent(e); };
    at('pointermove');
    expect(controls.target.x).toBe(0);
    at('pointerdown');
    expect(controls.target.x).not.toBe(0);
    at('pointermove');
    at('pointerup');
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
    terrainState.hillshade = null;
  });
});
