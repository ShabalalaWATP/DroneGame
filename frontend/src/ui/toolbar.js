// The purchase bar: which system is being placed, and what a click on the ground does.

import { BUILD, STRUCTURES } from '../sim/config/index.js';
import { money } from '../sim/economy.js';

export function createToolbar({ sim, bar, toast, onToolChange }) {
  let tool = null; // structure id | 'sell' | null
  const buttons = {};

  function build() {
    for (const def of Object.values(STRUCTURES)) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.style.borderLeftColor = '#' + def.color.toString(16).padStart(6, '0');
      b.title = `${def.desc}\nModelled on: ${def.ref.analogues.join(', ')}`;
      b.title += `\nCost ${money(def.cost)}${def.shotCost ? `, ${money(def.shotCost)} per shot` : ''}`;
      b.innerHTML = `<div class="n">${def.name}</div><div class="c">${money(def.cost)}</div>${def.shotCost ? `<div class="s">${money(def.shotCost)}/shot</div>` : ''}<div class="k">[${def.key}]</div>`;
      b.onclick = () => setTool(def.id);
      bar.appendChild(b);
      buttons[def.id] = b;
    }
    const sell = document.createElement('button');
    sell.className = 'tool';
    sell.title = 'Click a structure to sell it for a refund';
    sell.innerHTML = `<div class="n">Sell</div><div class="c">${Math.round(BUILD.sellRefund * 100)}%</div><div class="k">[X]</div>`;
    sell.onclick = () => setTool('sell');
    bar.appendChild(sell);
    buttons.sell = sell;
  }

  function rebuild() {
    bar.innerHTML = '';
    for (const k of Object.keys(buttons)) delete buttons[k];
    build();
    if (tool) buttons[tool]?.classList.add('active');
  }

  function setTool(t) {
    tool = tool === t ? null : t;
    for (const [id, b] of Object.entries(buttons)) b.classList.toggle('active', id === tool);
    onToolChange();
  }

  function groundClick(x, z) {
    const { state, commands } = sim;
    if (!tool || state.over || !state.started) return;
    if (tool === 'sell') { commands.sell(x, z); return; }
    const problem = commands.place(tool, x, z);
    if (problem) toast(problem);
  }

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Escape') { if (tool) setTool(tool); return; }
    if (e.key === 'x' || e.key === 'X') { setTool('sell'); return; }
    const def = Object.values(STRUCTURES).find((d) => d.key === e.key);
    if (def) setTool(def.id);
  });

  build();
  return {
    rebuild, groundClick, getTool: () => tool,
    update() { for (const def of Object.values(STRUCTURES)) buttons[def.id].classList.toggle('poor', sim.state.budget < def.cost); },
  };
}
