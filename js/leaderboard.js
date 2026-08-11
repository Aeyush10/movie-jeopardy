/* Standings screen. Doubles as the post-Final results screen. */
window.Leaderboard = (function () {
  'use strict';

  const listEl = document.getElementById('leaderboard-list');
  const titleEl = document.getElementById('leaderboard-title');

  function render() {
    const state = window.State.get();
    const players = window.State.sortedPlayers();

    // After Final Jeopardy has been fully scored this is the results screen.
    const finalDone = !!state.final &&
      state.final.phase === 'judge' &&
      state.final.order.length > 0 &&
      state.final.order.every(function (id) { return state.final.verdicts[id]; });

    titleEl.textContent = finalDone ? 'Final Results' : 'Leaderboard';

    listEl.innerHTML = '';

    if (players.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No players yet.';
      listEl.appendChild(li);
      return;
    }

    const top = players[0].score;

    players.forEach(function (player) {
      const li = document.createElement('li');
      // Ties share the lead — highlight everyone on the top score, but only
      // when that score is actually worth something.
      const isLeader = player.score === top && top > 0;
      if (isLeader) li.className = 'leader';

      const name = document.createElement('span');
      name.className = 'lb-name';
      name.textContent = player.name;

      const score = document.createElement('span');
      score.className = 'lb-score' + (player.score < 0 ? ' negative' : '');
      score.textContent = window.Players.money(player.score);

      li.appendChild(name);
      if (isLeader) {
        const crown = document.createElement('span');
        crown.className = 'crown';
        crown.textContent = '👑';
        li.appendChild(crown);
      }
      li.appendChild(score);
      listEl.appendChild(li);
    });
  }

  return { render: render };
})();
