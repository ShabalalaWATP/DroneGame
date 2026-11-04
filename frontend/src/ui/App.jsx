// The whole page: the 3D canvas, with panels around it. Class names and ids match style.css.

import { useEffect, useRef, useState } from 'react';
import { GameContext, useGame } from './hooks.js';
import { useHotkeys } from './useHotkeys.js';
import { Hud } from './Hud.jsx';
import { Toolbar } from './Toolbar.jsx';
import { ControlPanel } from './ControlPanel.jsx';
import { Minimap } from './Minimap.jsx';
import { Timeline } from './Timeline.jsx';
import { Tuning, Legend, Toast, Approvals } from './Panels.jsx';
import { Sandbox } from './Sandbox.jsx';
import { Overlay } from './Overlay.jsx';
import { Dock } from './dock/Dock.jsx';
import { UnitPanel } from './UnitPanel.jsx';
import { Wizard, WizardButton } from './assistant/Wizard.jsx';

// Owns the canvas: the Three.js scene stays imperative, because per-frame updates should not go through React.
function GameCanvas() {
  const game = useGame();
  const canvas = useRef(null), labels = useRef(null);
  useEffect(() => { game.attach(canvas.current, labels.current); }, [game]);
  return (
    <>
      <canvas id="game" ref={canvas} />
      <div id="labels" ref={labels} />
    </>
  );
}

function Screen() {
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTab, setDockTab] = useState('messages');
  const [tuningOpen, setTuningOpen] = useState(false);
  const openDock = (tab) => { setDockTab(tab); setDockOpen(true); };
  useHotkeys();
  return (
    <>
      <GameCanvas />
      <div id="left-col">
        <Hud />
        <Toolbar />
      </div>
      <Minimap />
      <ControlPanel onToggleDock={() => setDockOpen((o) => !o)} onToggleTuning={() => setTuningOpen((o) => !o)} onSandbox={() => setTuningOpen(false)} />
      <Tuning open={tuningOpen} />
      <WizardButton />
      <Dock open={dockOpen} onClose={() => setDockOpen(false)} tab={dockTab} onTab={setDockTab} />
      <UnitPanel />
      <Sandbox />
      <Legend />
      <Toast />
      <Approvals />
      <Timeline />
      <Wizard openDock={openDock} closeDock={() => setDockOpen(false)} />
      <Overlay openDock={openDock} />
    </>
  );
}

export function App({ game }) {
  return (
    <GameContext.Provider value={game}>
      <Screen />
    </GameContext.Provider>
  );
}
