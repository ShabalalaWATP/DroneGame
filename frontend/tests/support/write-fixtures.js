// Writes the sample records the backend's tests post. Only rerun after a deliberate change of shape.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSimulation } from '../../src/sim/simulation.js';
import { sampleLaydown, sampleRun } from './replay.js';

const dir = join(import.meta.dirname, '../../../backend/tests/fixtures');
mkdirSync(dir, { recursive: true });
const sim = createSimulation();
const laydown = sampleLaydown(sim);
const run = sampleRun(sim);
const figureSet = { name: 'Sample figures', figures: run.figures, game_version: run.game_version };
writeFileSync(join(dir, 'laydown.json'), JSON.stringify(laydown, null, 2) + '\n');
writeFileSync(join(dir, 'run.json'), JSON.stringify(run, null, 2) + '\n');
writeFileSync(join(dir, 'figure-set.json'), JSON.stringify(figureSet, null, 2) + '\n');
console.log('written to', dir);
