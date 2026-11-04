// Prints the reference digests as JSON. Only overwrite reference-digests.json when a change to behaviour is intended:
//   node tests/support/print-digests.js > tests/support/reference-digests.json
import { createSimulation } from '../../src/sim/simulation.js';
import { runReferences } from './scenarios.js';

console.log(JSON.stringify(runReferences(createSimulation()), null, 2));
