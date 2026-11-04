import { createRoot } from 'react-dom/client';
import { createGame } from './game.js';
import { App } from './ui/App.jsx';
import './style.css';

// The scenario seed fixes every chance event: wave contents, sensor noise, message IDs. The terrain seed is separate, so you
// can change the attack without changing the ground.
const params = new URLSearchParams(location.search);
const game = createGame({ seed: params.get('seed') || '1', terrainSeed: params.get('terrain') || '1' });
createRoot(document.getElementById('root')).render(<App game={game} />);

// for the console and scripted browser runs
if (import.meta.env.DEV) window.game = game;
