/* The full-screen clue overlay, including the Daily Double sequence.
 *
 * Phases:
 *   normal clue   ->  'clue'
 *   daily double  ->  'dd-splash' -> 'dd-picker' -> 'dd-wager' -> 'clue'
 */
window.Clue = (function () {
  'use strict';

  const overlayEl = document.getElementById('clue-overlay');
  const innerEl = document.getElementById('clue-inner');

  const MIN_WAGER = 5;
  const BONUS_AMOUNT = 100;

  let current = null;

  function isOpen() { return current !== null; }

  /* --------------------------------- open -------------------------------- */

  function open(ci, qi) {
    const state = window.State.get();
    const category = state.board.categories[ci];
    const clue = category.clues[qi];
    if (!clue || window.State.isUsed(ci, qi)) return;

    const isDD = window.State.isDailyDouble(ci, qi);

    current = {
      ci: ci,
      qi: qi,
      clue: clue,
      categoryName: category.name,
      key: window.State.clueKey(ci, qi),
      isDailyDouble: isDD,
      phase: isDD ? 'dd-splash' : 'clue',
      answerRevealed: false,
      selectedId: null,   // player currently picked, awaiting correct/wrong
      wrongIds: [],       // already answered wrong on this clue
      lockedId: null,     // Daily Double: only this player may answer
      wager: 0,
      wagerError: '',
      resolved: false,    // clue has been scored; only Close may dismiss it now
      resolution: null    // 'correct' | 'wrong' | 'pass'
    };

    overlayEl.hidden = false;
    render();
  }

  function close() {
    current = null;
    overlayEl.hidden = true;
    innerEl.innerHTML = '';
  }

  /* Marks the clue spent with no score change. Stays open for review — only
     the Close button (or Escape) dismisses it. */
  function passOnClue() {
    window.State.apply({ label: 'No answer', clueKey: current.key });
    current.resolved = true;
    current.resolution = 'pass';
    current.answerRevealed = true;
    render();
  }

  /* Abandon the clue and leave it playable — for a misclick. */
  function cancel() {
    // Any wrong answers already recorded stay recorded; undo them explicitly.
    close();
  }

  /* -------------------------------- scoring ------------------------------ */

  function stake() {
    return current.isDailyDouble ? current.wager : current.clue.value;
  }

  /* Correct always ends the clue's active life, but — like a wrong Daily
     Double or "no one answered" — it only marks the clue resolved. The
     overlay stays up so the host can let it sink in; Close dismisses it. */
  function markCorrect() {
    if (!current.selectedId || current.resolved) return;
    window.State.apply({
      label: 'Correct',
      playerId: current.selectedId,
      delta: stake(),
      clueKey: current.key
    });
    current.resolved = true;
    current.resolution = 'correct';
    current.answerRevealed = true;
    render();
  }

  function markWrong() {
    if (!current.selectedId || current.resolved) return;
    const playerId = current.selectedId;

    if (current.isDailyDouble) {
      // Only the wagering player gets a shot, so the clue ends here.
      window.State.apply({
        label: 'Wrong',
        playerId: playerId,
        delta: -stake(),
        clueKey: current.key
      });
      current.resolved = true;
      current.resolution = 'wrong';
      current.answerRevealed = true;
      render();
      return;
    }

    // Normal clue: deduct, but leave it open for someone else to try.
    window.State.apply({ label: 'Wrong', playerId: playerId, delta: -stake() });
    current.wrongIds.push(playerId);
    current.selectedId = null;
    current.answerRevealed = false;
    render();
  }

  /* A host's discretionary award — a funny answer, a good guess that wasn't
     quite it, whatever. Independent of the clue's own scoring: it doesn't
     touch wrongIds or mark the clue resolved, so Correct/Wrong/Pass still
     work normally afterward. */
  function markBonus() {
    if (!current.selectedId || current.resolved) return;
    window.State.apply({
      label: 'Bonus',
      playerId: current.selectedId,
      delta: BONUS_AMOUNT
    });
    render();
  }

  /* Undo from inside the overlay: roll back the score, re-enable the player
     it locked out, and — if that undo reopened the clue — un-resolve it so
     the overlay matches what the history stack now says. */
  function undoInOverlay() {
    if (!window.State.canUndo()) return;
    const inverse = window.State.undo();
    if (inverse && inverse.playerId) {
      const at = current.wrongIds.lastIndexOf(inverse.playerId);
      if (at !== -1) current.wrongIds.splice(at, 1);
    }
    if (inverse && inverse.clueKey) {
      current.resolved = false;
      current.resolution = null;
    }
    current.selectedId = null;
    render();
  }

  /* ---------------------------- daily double ----------------------------- */

  function maxWagerFor(player) {
    // Real rule: you may always wager up to the highest clue value on the
    // board, even sitting at zero or in the red.
    return Math.max(player.score, window.Data.maxClueValue(window.State.get().board));
  }

  function submitWager(raw) {
    const player = window.State.findPlayer(current.lockedId);
    if (!player) return;

    const amount = Math.floor(Number(raw));
    const max = maxWagerFor(player);

    if (!isFinite(amount) || isNaN(amount)) {
      current.wagerError = 'Enter a number.';
    } else if (amount < MIN_WAGER) {
      current.wagerError = 'Minimum wager is $' + MIN_WAGER + '.';
    } else if (amount > max) {
      current.wagerError = 'Maximum wager is ' + window.Players.money(max) + '.';
    } else {
      current.wager = amount;
      current.wagerError = '';
      current.phase = 'clue';
      current.selectedId = current.lockedId;
      render();
      return;
    }
    render();
  }

  /* -------------------------------- render ------------------------------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, className, onClick) {
    const btn = el('button', className, label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function render() {
    if (!current) return;
    innerEl.innerHTML = '';

    if (current.phase === 'dd-splash') return renderSplash();
    if (current.phase === 'dd-picker') return renderPicker();
    if (current.phase === 'dd-wager') return renderWager();
    return renderClue();
  }

  function renderSplash() {
    innerEl.appendChild(el('div', 'dd-splash', 'Daily\nDouble!'));
    innerEl.lastChild.style.whiteSpace = 'pre-line';

    const actions = el('div', 'clue-actions');
    actions.appendChild(button('Who found it?', 'btn btn-gold btn-big', function () {
      current.phase = 'dd-picker';
      render();
    }));
    innerEl.appendChild(actions);
  }

  function renderPicker() {
    innerEl.appendChild(el('div', 'clue-meta', current.categoryName));
    innerEl.appendChild(el('div', 'clue-prompt', 'Which player selected this clue?'));

    const row = el('div', 'answerer-row');
    window.State.get().players.forEach(function (player, index) {
      row.appendChild(button(player.name, 'answerer', function () {
        current.lockedId = player.id;
        current.phase = 'dd-wager';
        render();
      }, index));
      const btn = row.lastChild;
      btn.innerHTML = '<span class="key">' + (index + 1) + '</span>' + escapeHtml(player.name);
    });
    innerEl.appendChild(row);

    const actions = el('div', 'clue-actions');
    actions.appendChild(button('Cancel', 'btn btn-quiet', cancel));
    innerEl.appendChild(actions);
  }

  function renderWager() {
    const player = window.State.findPlayer(current.lockedId);
    if (!player) { current.phase = 'dd-picker'; return render(); }

    const max = maxWagerFor(player);

    innerEl.appendChild(el('div', 'clue-meta', current.categoryName));
    innerEl.appendChild(el('div', 'dd-splash', player.name + ', wager?'));

    const form = el('form', 'wager-form');
    // min/max stay on the input as spinner hints, but native validation would
    // silently block submit and hide our own message, so opt out of it.
    form.noValidate = true;

    const input = el('input', 'wager-input');
    input.type = 'number';
    input.min = String(MIN_WAGER);
    input.max = String(max);
    input.step = '1';
    input.value = current.wager || '';
    input.placeholder = '0';
    input.setAttribute('aria-label', 'Wager amount');

    form.appendChild(input);
    form.appendChild(el(
      'div',
      'wager-limits',
      'Current score ' + window.Players.money(player.score) +
      '  •  wager $' + MIN_WAGER + ' to ' + window.Players.money(max)
    ));
    form.appendChild(el('div', 'wager-error', current.wagerError));

    const actions = el('div', 'clue-actions');
    const go = el('button', 'btn btn-gold btn-big', 'Lock it in');
    go.type = 'submit';
    actions.appendChild(go);
    actions.appendChild(button('Back', 'btn btn-quiet', function () {
      current.phase = 'dd-picker';
      current.wagerError = '';
      render();
    }));
    form.appendChild(actions);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitWager(input.value);
    });

    innerEl.appendChild(form);
    input.focus();
    input.select();
  }

  function renderClue() {
    const state = window.State.get();

    // Ground truth for "is this clue spent" lives in state, not on `current`.
    // It can change out from under the overlay — e.g. the host uses the
    // top-bar Undo instead of the in-overlay one — so resync here rather
    // than trusting whatever markCorrect/markWrong last set.
    current.resolved = window.State.isUsed(current.ci, current.qi);
    if (!current.resolved) current.resolution = null;

    const meta = current.isDailyDouble
      ? current.categoryName + ' — Daily Double for ' + window.Players.money(current.wager)
      : current.categoryName + ' — $' + current.clue.value.toLocaleString('en-US');
    innerEl.appendChild(el('div', 'clue-meta', meta));

    innerEl.appendChild(el('div', 'clue-text', current.clue.clue));

    if (current.answerRevealed) {
      innerEl.appendChild(el('div', 'clue-answer', current.clue.answer));
    }

    // Daily Double locks the board to one player; a normal clue is open to all.
    const candidates = current.isDailyDouble
      ? state.players.filter(function (p) { return p.id === current.lockedId; })
      : state.players;

    const eligible = candidates.filter(function (p) {
      return current.wrongIds.indexOf(p.id) === -1;
    });

    if (current.resolved) {
      const message = {
        correct: 'Correct! Press Close to continue.',
        wrong: 'Missed it. Press Close to continue.',
        pass: 'Clue closed. Press Close to continue.'
      }[current.resolution];
      innerEl.appendChild(el('div', 'clue-prompt', message));
    } else if (state.players.length === 0) {
      innerEl.appendChild(el('div', 'clue-prompt', 'No players yet — add some on the setup screen.'));
    } else if (eligible.length === 0) {
      innerEl.appendChild(el('div', 'clue-prompt', 'Everyone has had a turn on this clue.'));
    } else {
      innerEl.appendChild(el('div', 'clue-prompt', current.selectedId
        ? 'Judge the answer'
        : 'Who answered?'));
    }

    const row = el('div', 'answerer-row');
    candidates.forEach(function (player, index) {
      const isWrong = current.wrongIds.indexOf(player.id) !== -1;
      const btn = el('button', 'answerer' + (current.selectedId === player.id ? ' selected' : ''));
      btn.type = 'button';
      btn.innerHTML = '<span class="key">' + (index + 1) + '</span>' + escapeHtml(player.name);
      btn.disabled = isWrong || current.resolved;
      if (isWrong) btn.title = player.name + ' already answered this clue';
      btn.addEventListener('click', function () {
        current.selectedId = current.selectedId === player.id ? null : player.id;
        render();
      });
      row.appendChild(btn);
    });
    innerEl.appendChild(row);

    const actions = el('div', 'clue-actions');

    actions.appendChild(button(
      current.answerRevealed ? 'Hide answer' : 'Show answer',
      'btn btn-quiet',
      function () {
        current.answerRevealed = !current.answerRevealed;
        render();
      }
    ));

    const correct = button('Correct  +' + window.Players.money(stake()), 'btn btn-correct', markCorrect);
    correct.disabled = !current.selectedId || current.resolved;
    actions.appendChild(correct);

    const wrong = button('Wrong  −' + window.Players.money(stake()), 'btn btn-wrong', markWrong);
    wrong.disabled = !current.selectedId || current.resolved;
    actions.appendChild(wrong);

    const bonus = button('Bonus  +' + window.Players.money(BONUS_AMOUNT), 'btn btn-bonus', markBonus);
    bonus.disabled = !current.selectedId || current.resolved;
    actions.appendChild(bonus);

    const noOne = button('No one answered', 'btn btn-quiet', passOnClue);
    noOne.disabled = current.resolved;
    actions.appendChild(noOne);

    const undo = button('Undo', 'btn btn-quiet', undoInOverlay);
    undo.disabled = !window.State.canUndo();
    actions.appendChild(undo);

    // Once the clue is resolved, Close is the only way out — make it read that way.
    actions.appendChild(button('Close', current.resolved ? 'btn btn-gold btn-big' : 'btn btn-quiet', cancel));

    innerEl.appendChild(actions);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* ------------------------------- keyboard ------------------------------ */

  function handleKey(event) {
    if (!current) return false;

    // Never hijack typing in the wager box.
    if (event.target && event.target.tagName === 'INPUT') {
      if (event.key === 'Escape') { cancel(); return true; }
      return false;
    }

    if (event.key === 'Escape') { cancel(); return true; }

    if (current.phase !== 'clue') return false;

    if (event.key === ' ') {
      current.answerRevealed = !current.answerRevealed;
      render();
      return true;
    }

    if (/^[1-9]$/.test(event.key)) {
      if (current.resolved) return true;
      const players = current.isDailyDouble
        ? window.State.get().players.filter(function (p) { return p.id === current.lockedId; })
        : window.State.get().players;
      const player = players[Number(event.key) - 1];
      if (player && current.wrongIds.indexOf(player.id) === -1) {
        current.selectedId = current.selectedId === player.id ? null : player.id;
        render();
      }
      return true;
    }

    if (event.key === 'Enter' && current.selectedId && !current.resolved) { markCorrect(); return true; }
    if (event.key === 'Backspace' && current.selectedId && !current.resolved) { markWrong(); return true; }

    return false;
  }

  return { open: open, close: close, isOpen: isOpen, handleKey: handleKey, render: render };
})();
