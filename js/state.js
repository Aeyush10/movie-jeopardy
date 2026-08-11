/* Central game state, persisted to localStorage.
 *
 * Every mutation goes through State.apply(action), which records an inverse on
 * the history stack. That's why Undo works identically for normal clues, Daily
 * Doubles and Final Jeopardy — none of them are special-cased.
 */
window.State = (function () {
  'use strict';

  const KEY = 'movieJeopardy.v1';
  const MAX_HISTORY = 100;

  let state = null;
  const listeners = [];

  /* ------------------------------ persistence ---------------------------- */

  function blank() {
    return {
      players: [],
      board: null,
      boardSource: null,
      customBoard: false,   // true once the host loads their own .json
      usedClues: {},        // "ci-qi" -> true
      dailyDoubles: [],     // ["ci-qi", ...]
      screen: 'setup',
      final: null,
      history: []
    };
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      // Private-browsing or quota. The game still works for this session.
      console.warn('Could not save game state:', err.message);
    }
  }

  function loadStored() {
    let raw;
    try {
      raw = localStorage.getItem(KEY);
    } catch (err) {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      // Merge onto a blank so a state saved by an older build still opens.
      return Object.assign(blank(), parsed);
    } catch (err) {
      console.warn('Stored game state was unreadable; starting fresh.');
      return null;
    }
  }

  function init() {
    state = loadStored() || blank();
    return state;
  }

  function get() { return state; }

  /* --------------------------- change notification ----------------------- */

  function subscribe(fn) { listeners.push(fn); }

  function emit() {
    listeners.forEach(function (fn) { fn(state); });
  }

  /* Persist + redraw. Use after direct edits that aren't undoable actions
     (adding a player, switching screens, loading a board). */
  function commit() {
    save();
    emit();
  }

  /* Persist without redrawing. For live edits to a field the host is still
     typing in — a redraw would replace the input mid-interaction, and if the
     edit was triggered by a blur it would destroy the button being clicked. */
  function persist() {
    save();
  }

  /* ------------------------------- players ------------------------------- */

  let idSeed = 0;
  function newId() {
    idSeed += 1;
    return 'p' + Date.now().toString(36) + idSeed.toString(36);
  }

  function addPlayer(name) {
    const clean = String(name || '').trim().slice(0, 20);
    if (!clean) return null;
    const player = { id: newId(), name: clean, score: 0 };
    state.players.push(player);
    commit();
    return player;
  }

  function removePlayer(id) {
    state.players = state.players.filter(function (p) { return p.id !== id; });
    // History may reference this player; dropping it keeps undo honest.
    state.history = state.history.filter(function (h) { return h.playerId !== id; });
    commit();
  }

  function renamePlayer(id, name) {
    const player = findPlayer(id);
    const clean = String(name || '').trim().slice(0, 20);
    if (!player || !clean) return;
    player.name = clean;
    commit();
  }

  function findPlayer(id) {
    return state.players.filter(function (p) { return p.id === id; })[0] || null;
  }

  function resetScores() {
    state.players.forEach(function (p) { p.score = 0; });
    state.history = [];
    commit();
  }

  /* -------------------------------- actions ------------------------------ */

  /* An action is { label, playerId?, delta?, clueKey?, finalPatch? }.
     apply() performs it and pushes an inverse; undo() pops and performs that. */
  function apply(action) {
    const inverse = { label: action.label, playerId: action.playerId };

    if (typeof action.delta === 'number' && action.delta !== 0 && action.playerId) {
      const player = findPlayer(action.playerId);
      if (player) {
        player.score += action.delta;
        inverse.delta = -action.delta;
      }
    }

    if (action.clueKey) {
      const wasUsed = state.usedClues[action.clueKey] === true;
      if (action.markUsed === false) {
        delete state.usedClues[action.clueKey];
      } else {
        state.usedClues[action.clueKey] = true;
      }
      inverse.clueKey = action.clueKey;
      inverse.markUsed = wasUsed;
    }

    if (action.finalPatch && state.final) {
      inverse.finalPatch = {};
      Object.keys(action.finalPatch).forEach(function (key) {
        inverse.finalPatch[key] = clone(state.final[key]);
        state.final[key] = action.finalPatch[key];
      });
    }

    state.history.push(inverse);
    if (state.history.length > MAX_HISTORY) state.history.shift();

    commit();
  }

  function undo() {
    const inverse = state.history.pop();
    if (!inverse) return null;

    if (typeof inverse.delta === 'number' && inverse.playerId) {
      const player = findPlayer(inverse.playerId);
      if (player) player.score += inverse.delta;
    }

    if (inverse.clueKey) {
      if (inverse.markUsed) {
        state.usedClues[inverse.clueKey] = true;
      } else {
        delete state.usedClues[inverse.clueKey];
      }
    }

    if (inverse.finalPatch && state.final) {
      Object.keys(inverse.finalPatch).forEach(function (key) {
        state.final[key] = inverse.finalPatch[key];
      });
    }

    commit();
    return inverse;
  }

  function canUndo() {
    return state.history.length > 0;
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  /* ---------------------------- board lifecycle -------------------------- */

  function setBoard(board, source, isCustom) {
    state.board = board;
    state.boardSource = source || null;
    state.customBoard = isCustom === true;
    state.dailyDoubles = window.Data.pickDailyDoubles(board);
    state.usedClues = {};
    state.final = null;
    state.history = [];
    commit();
  }

  /* Fresh board, same players. Re-rolls Daily Doubles. */
  function newGame() {
    state.usedClues = {};
    state.final = null;
    state.history = [];
    if (state.board) {
      state.dailyDoubles = window.Data.pickDailyDoubles(state.board);
    }
    state.players.forEach(function (p) { p.score = 0; });
    commit();
  }

  function wipe() {
    try {
      localStorage.removeItem(KEY);
    } catch (err) { /* nothing we can do */ }
    state = blank();
    commit();
  }

  function setScreen(name) {
    state.screen = name;
    commit();
  }

  /* -------------------------------- queries ------------------------------ */

  function clueKey(ci, qi) { return ci + '-' + qi; }

  function isUsed(ci, qi) {
    return state.usedClues[clueKey(ci, qi)] === true;
  }

  function isDailyDouble(ci, qi) {
    return state.dailyDoubles.indexOf(clueKey(ci, qi)) !== -1;
  }

  function allCluesUsed() {
    if (!state.board) return false;
    return Object.keys(state.usedClues).length >= window.Data.totalClues(state.board);
  }

  function sortedPlayers() {
    return state.players.slice().sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });
  }

  return {
    init: init,
    get: get,
    subscribe: subscribe,
    commit: commit,
    persist: persist,
    addPlayer: addPlayer,
    removePlayer: removePlayer,
    renamePlayer: renamePlayer,
    findPlayer: findPlayer,
    resetScores: resetScores,
    apply: apply,
    undo: undo,
    canUndo: canUndo,
    setBoard: setBoard,
    newGame: newGame,
    wipe: wipe,
    setScreen: setScreen,
    clueKey: clueKey,
    isUsed: isUsed,
    isDailyDouble: isDailyDouble,
    allCluesUsed: allCluesUsed,
    sortedPlayers: sortedPlayers
  };
})();
