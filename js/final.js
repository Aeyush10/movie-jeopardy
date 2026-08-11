/* Final Jeopardy.
 *
 * Players write their wager on paper next to their answer, so the app collects
 * wagers during judging — after the clue and the answer have been revealed.
 * That keeps the laptop on the table instead of being passed around.
 *
 * Phases: 'category' -> 'clue' -> 'judge'
 */
window.Final = (function () {
  'use strict';

  const bodyEl = document.getElementById('final-body');

  /* Real rule: you need a positive score to play Final Jeopardy. */
  function eligiblePlayers() {
    return window.State.get().players.filter(function (p) { return p.score > 0; });
  }

  function freshRound() {
    const playing = eligiblePlayers();
    const startScores = {};
    playing.forEach(function (p) { startScores[p.id] = p.score; });
    return {
      phase: 'category',
      order: playing.map(function (p) { return p.id; }),
      // Wager caps come from the pre-Final scores, so judging one player (and
      // moving their score) can't change what anyone is allowed to have bet.
      startScores: startScores,
      wagers: {},
      verdicts: {}
    };
  }

  function start() {
    const state = window.State.get();
    if (!state.board || !state.board.final) return;

    // Re-derive while nothing has been committed yet, so backing out to play a
    // few more clues and returning picks up the new scores.
    if (!state.final || state.final.phase === 'category') {
      state.final = freshRound();
      window.State.commit();
    }
    window.State.setScreen('final');
  }

  /* The most a player may have wagered: their score when the round began. */
  function capFor(playerId) {
    const final = window.State.get().final;
    const stored = final.startScores && final.startScores[playerId];
    if (typeof stored === 'number') return Math.max(0, stored);
    const player = window.State.findPlayer(playerId);
    return player ? Math.max(0, player.score) : 0;
  }

  function clampWager(raw, cap) {
    const amount = Math.floor(Number(raw));
    if (!isFinite(amount) || isNaN(amount)) return 0;
    return Math.max(0, Math.min(amount, cap));
  }

  /* -------------------------------- helpers ------------------------------ */

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

  function setPhase(phase) {
    window.State.get().final.phase = phase;
    window.State.commit();
  }

  /* -------------------------------- render ------------------------------- */

  function render() {
    const state = window.State.get();
    bodyEl.innerHTML = '';

    if (!state.board || !state.board.final || !state.final) return;

    const phase = state.final.phase;
    if (phase === 'category') return renderCategory();
    if (phase === 'clue') return renderClue();
    return renderJudge();
  }

  function renderCategory() {
    const state = window.State.get();
    const order = state.final.order;
    const excluded = state.players.filter(function (p) {
      return order.indexOf(p.id) === -1;
    });

    bodyEl.appendChild(el('div', 'final-label', 'Final Jeopardy'));
    bodyEl.appendChild(el('div', 'final-category', state.board.final.category));

    if (order.length === 0) {
      bodyEl.appendChild(el('div', 'final-note',
        'Nobody has a positive score, so there is no Final Jeopardy round. ' +
        'Head to the leaderboard to see where things landed.'));
      const actions = el('div', 'clue-actions');
      actions.appendChild(button('Leaderboard', 'btn btn-gold btn-big', function () {
        window.State.setScreen('leaderboard');
      }));
      actions.appendChild(button('Back to board', 'btn btn-quiet', backToBoard));
      bodyEl.appendChild(actions);
      return;
    }

    bodyEl.appendChild(el('div', 'final-note',
      'Playing: ' + order.map(function (id) {
        return window.State.findPlayer(id).name;
      }).join(', ') + '.' +
      (excluded.length
        ? ' Sitting out with a non-positive score: ' +
          excluded.map(function (p) { return p.name; }).join(', ') + '.'
        : '')));

    bodyEl.appendChild(el('div', 'final-note',
      'Everyone sees the category and writes down a secret wager, up to their ' +
      'own score. Then the clue goes up and they write their answer beside it.'));

    const actions = el('div', 'clue-actions');
    actions.appendChild(button('Show the clue', 'btn btn-gold btn-big', function () {
      setPhase('clue');
    }));
    actions.appendChild(button('Back to board', 'btn btn-quiet', backToBoard));
    bodyEl.appendChild(actions);
  }

  function renderClue() {
    const state = window.State.get();

    bodyEl.appendChild(el('div', 'final-label', state.board.final.category));
    bodyEl.appendChild(el('div', 'clue-text', state.board.final.clue));
    bodyEl.appendChild(el('div', 'final-note',
      'Everyone writes their answer down. When time is up, reveal and score.'));

    const actions = el('div', 'clue-actions');
    actions.appendChild(button('Reveal answer & score', 'btn btn-gold btn-big', function () {
      setPhase('judge');
    }));
    bodyEl.appendChild(actions);
  }

  function renderJudge() {
    const state = window.State.get();
    const final = state.final;

    bodyEl.appendChild(el('div', 'final-label', 'Correct response'));
    bodyEl.appendChild(el('div', 'clue-answer', state.board.final.answer));
    bodyEl.appendChild(el('div', 'final-note',
      'Now go around the table: type each player\'s wager, then mark their ' +
      'answer. Changing a wager after judging re-scores it automatically.'));

    const list = el('ul', 'judge-list');

    final.order.forEach(function (playerId) {
      const player = window.State.findPlayer(playerId);
      if (!player) return;

      const verdict = final.verdicts[playerId] || null;
      const cap = capFor(playerId);

      const row = el('li', 'judge-row' + (verdict ? ' ' + verdict : ''));
      row.appendChild(el('span', 'judge-name', player.name));

      const field = el('label', 'judge-wager');
      field.appendChild(el('span', 'judge-wager-sign', '$'));

      const input = el('input', 'judge-wager-input');
      input.type = 'number';
      input.min = '0';
      input.max = String(cap);
      input.step = '1';
      input.value = final.wagers[playerId] !== undefined ? final.wagers[playerId] : '';
      input.placeholder = '0';
      input.setAttribute('aria-label', 'Wager for ' + player.name);

      // Write straight into state without a redraw. Committing here would
      // rebuild the row on blur — and destroy the very button whose click
      // caused that blur, swallowing the judgement.
      input.addEventListener('input', function () {
        final.wagers[playerId] = clampWager(input.value, cap);
      });
      input.addEventListener('change', function () {
        const amount = clampWager(input.value, cap);
        final.wagers[playerId] = amount;
        input.value = amount;
        window.State.persist();
      });

      field.appendChild(input);
      row.appendChild(field);
      row.appendChild(el('span', 'judge-cap', 'of ' + window.Players.money(cap)));

      if (verdict) {
        const swung = (verdict === 'correct' ? '+' : '−') +
          window.Players.money(final.wagers[playerId] || 0);
        row.appendChild(el('span', 'judge-verdict',
          (verdict === 'correct' ? 'Correct ' : 'Incorrect ') + swung));
      }

      // Read the box at click time rather than trusting the last change event,
      // so a wager typed and judged in one motion still counts.
      const judgeAs = function (result) {
        return function () {
          judge(playerId, clampWager(input.value, cap), result);
        };
      };
      const correctBtn = button('Correct', 'btn btn-correct', judgeAs('correct'));
      const wrongBtn = button('Wrong', 'btn btn-wrong', judgeAs('wrong'));

      // Both stay clickable after judging: fixing a mistyped wager means
      // re-pressing the verdict that's already set. The active one is ringed
      // instead of disabled, and judge() ignores a no-op re-press.
      if (verdict === 'correct') correctBtn.classList.add('is-verdict');
      if (verdict === 'wrong') wrongBtn.classList.add('is-verdict');

      row.appendChild(correctBtn);
      row.appendChild(wrongBtn);
      list.appendChild(row);
    });

    bodyEl.appendChild(list);

    const judged = final.order.filter(function (id) { return final.verdicts[id]; }).length;
    const actions = el('div', 'clue-actions');

    const results = button('See final results', 'btn btn-gold btn-big', function () {
      window.State.setScreen('leaderboard');
    });
    results.disabled = judged < final.order.length;
    if (results.disabled) {
      results.title = 'Score every player first (' + judged + ' of ' + final.order.length + ' done)';
    }
    actions.appendChild(results);

    const undo = button('Undo', 'btn btn-quiet', function () {
      window.State.undo();
    });
    undo.disabled = !window.State.canUndo();
    actions.appendChild(undo);

    actions.appendChild(button('Back to board', 'btn btn-quiet', backToBoard));
    bodyEl.appendChild(actions);
  }

  /* Records a wager and a verdict together, applying only the *difference*
     from whatever was there before. So re-judging a player, or correcting a
     mistyped wager after the fact, adjusts their score in one undoable step
     instead of double-counting. */
  function judge(playerId, wager, verdict) {
    const final = window.State.get().final;

    // Re-pressing the same verdict with the same wager changes nothing — don't
    // push a no-op onto the undo stack.
    if (final.verdicts[playerId] === verdict && (final.wagers[playerId] || 0) === wager) {
      return;
    }

    const swing = function (result, amount) {
      if (result === 'correct') return amount;
      if (result === 'wrong') return -amount;
      return 0;
    };

    const previous = swing(final.verdicts[playerId] || null, final.wagers[playerId] || 0);

    const nextWagers = Object.assign({}, final.wagers);
    nextWagers[playerId] = wager;
    const nextVerdicts = Object.assign({}, final.verdicts);
    nextVerdicts[playerId] = verdict;

    window.State.apply({
      label: 'Final Jeopardy',
      playerId: playerId,
      delta: swing(verdict, wager) - previous,
      finalPatch: { wagers: nextWagers, verdicts: nextVerdicts }
    });
  }

  function backToBoard() {
    window.State.setScreen('board');
  }

  return { start: start, render: render };
})();
