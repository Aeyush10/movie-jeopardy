/* Wiring: screen routing, top-bar actions, board loading, keyboard shortcuts. */
(function () {
  'use strict';

  const screens = {
    setup: document.getElementById('screen-setup'),
    board: document.getElementById('screen-board'),
    leaderboard: document.getElementById('screen-leaderboard'),
    final: document.getElementById('screen-final')
  };

  const bannerEl = document.getElementById('error-banner');
  const bannerDetailEl = document.getElementById('error-detail');
  const setupTitleEl = document.getElementById('setup-board-title');
  const fileInput = document.getElementById('board-file-input');

  /* -------------------------------- errors ------------------------------- */

  function showError(message) {
    bannerDetailEl.textContent = message;
    bannerEl.hidden = false;
  }

  function hideError() {
    bannerEl.hidden = true;
  }

  /* ------------------------------- rendering ----------------------------- */

  function render() {
    const state = window.State.get();

    // A board is required for everything except setup.
    const active = state.board ? state.screen : 'setup';

    Object.keys(screens).forEach(function (name) {
      screens[name].classList.toggle('active', name === active);
    });

    // Naming the source matters: on file:// the app reads questions.js, so an
    // edit to questions.json that wasn't followed by `node sync.js` would
    // otherwise look like the edit silently didn't take.
    setupTitleEl.textContent = state.board
      ? (state.board.title || 'Untitled board') + ' — loaded from ' + state.boardSource
      : 'No board loaded';

    window.Players.render();

    if (active === 'board') window.Board.render();
    if (active === 'leaderboard') window.Leaderboard.render();
    if (active === 'final') window.Final.render();

    if (window.Clue.isOpen()) window.Clue.render();
  }

  window.State.subscribe(render);

  /* ------------------------------- actions ------------------------------- */

  const actions = {
    'dismiss-error': hideError,

    'start-game': function () {
      if (window.State.get().players.length === 0) {
        showError('Add at least one player before starting.');
        return;
      }
      hideError();
      window.State.setScreen('board');
    },

    'show-board': function () { window.State.setScreen('board'); },
    'show-setup': function () { window.State.setScreen('setup'); },
    'show-leaderboard': function () { window.State.setScreen('leaderboard'); },

    'start-final': function () {
      if (!window.State.allCluesUsed()) {
        const ok = confirm(
          'There are still clues left on the board.\n\n' +
          'Go to Final Jeopardy anyway?'
        );
        if (!ok) return;
      }
      window.Final.start();
    },

    'undo': function () { window.State.undo(); },

    'reset-scores': function () {
      if (confirm('Set every player back to $0? This also clears the undo history.')) {
        window.State.resetScores();
      }
    },

    'new-game': function () {
      if (confirm('Start a new game?\n\nScores reset to $0, the board refills, and Daily Doubles move. Players are kept.')) {
        window.State.newGame();
      }
    },

    'wipe': function () {
      if (confirm('Erase everything — players, scores, and the loaded board?\n\nThis cannot be undone.')) {
        window.State.wipe();
        loadBoard();
      }
    },

    'reload-questions': function () {
      loadBoard(true);
    }
  };

  document.addEventListener('click', function (event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const handler = actions[trigger.getAttribute('data-action')];
    if (handler) handler();
  });

  /* --------------------------- board file loading ------------------------ */

  fileInput.addEventListener('change', function () {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    window.Data.loadFromFile(file)
      .then(function (board) {
        hideError();
        window.State.setBoard(board, file.name, true);
        alert('Loaded "' + (board.title || file.name) + '".\n\nScores were kept; the board is fresh.');
      })
      .catch(function (err) {
        showError(err.message);
      })
      .then(function () {
        // Allow re-picking the same file after an edit.
        fileInput.value = '';
      });
  });

  /* Loads from questions.json / questions.js. `force` re-reads even when a
     board is already in play, discarding board progress but keeping players. */
  function loadBoard(force) {
    const state = window.State.get();

    if (state.board && !force) {
      render();
      return;
    }

    if (force && state.customBoard) {
      const ok = confirm(
        'You are using a board loaded from your own file.\n\n' +
        'Reload from data/questions.json instead?'
      );
      if (!ok) return;
    }

    window.Data.load()
      .then(function (result) {
        hideError();
        window.State.setBoard(result.board, result.source, false);
      })
      .catch(function (err) {
        showError(err.message + ' Use "Load JSON file…" to pick a board from disk.');
        render();
      });
  }

  /* ------------------------------- keyboard ------------------------------ */

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey) {
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        window.State.undo();
      }
      return;
    }

    if (window.Clue.isOpen()) {
      if (window.Clue.handleKey(event)) event.preventDefault();
      return;
    }

    const typing = event.target &&
      (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA');
    if (typing) return;

    const state = window.State.get();
    if (event.key === 'Escape' && state.screen !== 'board' && state.board) {
      window.State.setScreen('board');
    }
  });

  /* --------------------------------- boot -------------------------------- */

  window.State.init();
  render();
  loadBoard();
})();
