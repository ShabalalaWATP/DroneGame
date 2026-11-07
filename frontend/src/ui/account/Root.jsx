// The login gate: the login page until someone signs in, then their profile hub, then the game. The game mounts once and stays,
// so going back to the profile and in again keeps the laydown. Signing out reloads the page, which leaves nothing behind. If the
// session runs out during a game, the login page comes back over it; signing in as someone else reloads, as signing out does.

import { useEffect, useMemo, useRef, useState } from 'react';
import { SIGNED_OUT } from '../../api/client.js';
import { App } from '../App.jsx';
import { AuthScreen } from './AuthScreen.jsx';
import { ProfileHub } from './ProfileHub.jsx';
import { AccountContext } from './pack.js';
import { initials } from './parts.jsx';
import './account.css';

function AccountChip({ user, onOpen }) {
  return (
    <button id="acct-chip" title="Your profile and deployment packs" onClick={onOpen}>
      <i aria-hidden="true">{initials(user.display_name)}</i>{user.display_name}
    </button>
  );
}

export function Root({ game, reload = () => location.reload() }) {
  const { api } = game;
  const [user, setUser] = useState(undefined); // undefined while checking, null when signed out
  const [screen, setScreen] = useState('hub'); // hub | game
  const [entered, setEntered] = useState(false);
  const [activeUnit, setActiveUnit] = useState(null); // the pack whose kit the tray lists
  const last = useRef(null); // who was signed in, so a lapsed session can only be picked up by the same person

  useEffect(() => { api.auth.me().then(setUser, () => setUser(null)); }, [api]);
  useEffect(() => { if (user) { last.current = user.username; game.saver.flush(); } }, [user, game]); // runs kept while signed out are saved now
  useEffect(() => {
    const lost = () => { if (game.sim.state.waveActive) game.setSpeed(0); setUser(null); }; // a wave waits under the login page
    addEventListener(SIGNED_OUT, lost);
    return () => removeEventListener(SIGNED_OUT, lost);
  }, [game]);

  const account = useMemo(() => ({
    user, setUser, activeUnit,
    covered: !user || screen === 'hub', // the game is out of sight, so its hotkeys stay off
    deploy: (pack) => { setActiveUnit(pack); if (pack) game.openCatalogue('unit', true); }, // the tray opens with it
    openProfile: () => { if (game.sim.state.waveActive) game.setSpeed(0); setScreen('hub'); },
    signOut: () => api.auth.signOut().catch(() => null).then(reload),
  }), [user, screen, activeUnit, api, game, reload]);

  if (user === undefined) return <main className="acct"><div className="acct-sky" aria-hidden="true" /></main>;
  const signedIn = (u) => { if (last.current && last.current !== u.username) reload(); else setUser(u); };
  if (user === null && !entered) return <AuthScreen api={api} onSignedIn={signedIn} />;
  const enter = () => { setEntered(true); setScreen('game'); };
  return (
    <AccountContext.Provider value={account}>
      {entered && <div inert={account.covered}><App game={game} /></div>}{/* out of reach of focus and screen readers while covered */}
      {user && screen === 'game' && <AccountChip user={user} onOpen={account.openProfile} />}
      {user && screen === 'hub' && <ProfileHub api={api} account={account} inGame={entered} onEnter={enter} />}
      {!user && <AuthScreen api={api} onSignedIn={signedIn} />}
    </AccountContext.Provider>
  );
}
