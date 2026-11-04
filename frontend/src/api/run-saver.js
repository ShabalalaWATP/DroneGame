// Saving finished runs without ever silently losing one. A run that can't reach the server is kept in this browser and
// retried; a run the server refuses outright is reported, because retrying would never help.

const KEY = 'site-guard.unsaved-runs';
const MAX_KEPT = 50;

export function createRunSaver({ api, storage, notify, onChange }) {
  let lastMessage = '';
  let flushing = false, savedCount = 0;
  const say = (msg, loud = true) => { lastMessage = msg; if (loud) notify(msg); onChange(); };

  function read() {
    try { return JSON.parse(storage.getItem(KEY)) || []; } catch { return []; }
  }
  function write(runs) {
    try {
      if (runs.length) storage.setItem(KEY, JSON.stringify(runs)); else storage.removeItem(KEY);
      return true;
    } catch { return false; }
  }

  // Keep a run for later. Synchronous, so it works while the page is closing.
  function keep(run) {
    const kept = [...read(), run].slice(-MAX_KEPT);
    if (!write(kept)) say('This run could not be saved or kept: the save server is down and browser storage is full or blocked.');
    else onChange();
  }

  async function save(run) {
    try {
      await api.runs.create(run);
      savedCount++;
      say('Run saved to your history.', false);
    } catch (e) {
      if (e.retryable) {
        keep(run);
        say('The save server is not running, so this run is being kept in this browser. It will be saved when the server is back.');
      } else say(`This run could not be saved: ${e.message}`);
    }
  }

  // Try again with every kept run. Returns how many were saved.
  async function flush() {
    if (flushing) return 0;
    flushing = true;
    let saved = 0, refused = 0;
    try {
      for (const run of read()) {
        try {
          await api.runs.create(run);
          saved++; savedCount++;
        } catch (e) {
          if (e.retryable) break; // still down: keep this one and the rest
          refused++;
          notify(`A kept run could not be saved: ${e.message}`);
        }
        write(read().slice(1));
      }
    } finally {
      flushing = false;
    }
    if (saved) say(`${saved} kept run${saved > 1 ? 's' : ''} saved to your history.`);
    else if (refused) onChange();
    return saved;
  }

  return { keep, save, flush, pending: () => read().length, message: () => lastMessage, saved: () => savedCount };
}
