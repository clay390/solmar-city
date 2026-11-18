// Solmar City v2 — save and load through localStorage: cash, the story jobs
// finished, the side jobs' run counts, and the best (lifetime) earnings.
// Nothing else is kept — the city is rebuilt from the seed every visit. The
// save key changed with v2 (solmar-city.save.v2), so a v1 save does not carry
// over: the jobs and the radio are different enough that a fresh start is
// the honest one.

import { SAVE_KEY } from './config.js';

/** Keep only the fields the game knows, and only in the shapes it expects. */
function cleanSideCompletions(raw) {
  const out = {};
  if (raw && typeof raw === 'object') {
    for (const key of ['6', '7']) {
      const value = raw[key];
      if (Number.isInteger(value) && value > 0) out[key] = value;
    }
  }
  return out;
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      cash: Number.isFinite(data.cash) ? data.cash : 0,
      missionsDone: Array.isArray(data.missionsDone) ? data.missionsDone.filter((n) => Number.isInteger(n)) : [],
      sideCompletions: cleanSideCompletions(data.sideCompletions),
      bestCash: Number.isFinite(data.bestCash) ? data.bestCash : 0,
    };
  } catch {
    return null;
  }
}

export function saveGame(game) {
  try {
    const data = {
      cash: Math.round(game.player.cash),
      missionsDone: game.missionsDone.slice(),
      sideCompletions: { ...game.sideCompletions },
      bestCash: Math.max(game.bestCash || 0, Math.round(game.player.cash)),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    game.bestCash = data.bestCash;
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}
