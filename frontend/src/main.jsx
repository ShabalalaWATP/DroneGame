import { createRoot } from 'react-dom/client';
import { cleanSeed, createGame } from './game.js';
import { App } from './ui/App.jsx';
import './style.css';

// The scenario seed fixes every chance event: wave contents, sensor noise, message IDs. The terrain seed is separate, so you
// can change the attack without changing the ground.
const params = new URLSearchParams(location.search);
const game = createGame({ seed: cleanSeed(params.get('seed')), terrainSeed: cleanSeed(params.get('terrain')) });
createRoot(document.getElementById('root')).render(<App game={game} />);
addEventListener('pagehide', game.pageClosing); // a run still going when the page closes is kept, and saved next time
game.saver.flush();

// for the console and scripted browser runs
if (import.meta.env.DEV) window.game = game;
