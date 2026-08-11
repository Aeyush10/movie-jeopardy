/* Player roster on the setup screen and the score podiums under the board. */
window.Players = (function () {
  'use strict';

  const listEl = document.getElementById('player-list');
  const noteEl = document.getElementById('no-players-note');
  const barEl = document.getElementById('player-bar');
  const formEl = document.getElementById('add-player-form');
  const inputEl = document.getElementById('player-name-input');

  /* Jeopardy shows negatives as -$400 rather than $-400. */
  function money(amount) {
    const sign = amount < 0 ? '-' : '';
    return sign + '$' + Math.abs(amount).toLocaleString('en-US');
  }

  function renderRoster() {
    const players = window.State.get().players;
    listEl.innerHTML = '';
    noteEl.hidden = players.length > 0;

    players.forEach(function (player) {
      const li = document.createElement('li');

      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'player-name-field';
      name.value = player.name;
      name.maxLength = 20;
      name.setAttribute('aria-label', 'Name for ' + player.name);
      name.addEventListener('change', function () {
        window.State.renamePlayer(player.id, name.value);
      });
      name.addEventListener('blur', function () {
        // Reject an empty rename by restoring what's still in state.
        const current = window.State.findPlayer(player.id);
        if (current) name.value = current.name;
      });

      const score = document.createElement('span');
      score.className = 'player-score' + (player.score < 0 ? ' negative' : '');
      score.textContent = money(player.score);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn';
      remove.innerHTML = '&times;';
      remove.title = 'Remove ' + player.name;
      remove.setAttribute('aria-label', 'Remove ' + player.name);
      remove.addEventListener('click', function () {
        if (confirm('Remove ' + player.name + ' from the game?')) {
          window.State.removePlayer(player.id);
        }
      });

      li.appendChild(name);
      li.appendChild(score);
      li.appendChild(remove);
      listEl.appendChild(li);
    });
  }

  function renderBar() {
    const players = window.State.get().players;
    barEl.innerHTML = '';

    players.forEach(function (player) {
      const podium = document.createElement('div');
      podium.className = 'podium';

      const name = document.createElement('div');
      name.className = 'podium-name';
      name.textContent = player.name;

      const score = document.createElement('div');
      score.className = 'podium-score' + (player.score < 0 ? ' negative' : '');
      score.textContent = money(player.score);

      podium.appendChild(name);
      podium.appendChild(score);
      barEl.appendChild(podium);
    });
  }

  function render() {
    renderRoster();
    renderBar();
  }

  formEl.addEventListener('submit', function (event) {
    event.preventDefault();
    if (window.State.addPlayer(inputEl.value)) {
      inputEl.value = '';
    }
    inputEl.focus();
  });

  return { render: render, money: money };
})();
