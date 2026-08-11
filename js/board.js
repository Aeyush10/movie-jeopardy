/* The game board: category headers plus a clue cell per dollar value. */
window.Board = (function () {
  'use strict';

  const gridEl = document.getElementById('board-grid');
  const titleEl = document.getElementById('board-title');
  const finalBtn = document.getElementById('final-btn');
  const undoBtn = document.getElementById('undo-btn');

  function render() {
    const state = window.State.get();
    const board = state.board;

    gridEl.innerHTML = '';
    if (!board) return;

    titleEl.textContent = board.title || 'Movie Jeopardy';

    const cols = board.categories.length;
    const rows = board.categories[0].clues.length;
    gridEl.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    // Header row sized to content, clue rows share the rest evenly.
    gridEl.style.gridTemplateRows = 'auto repeat(' + rows + ', 1fr)';

    board.categories.forEach(function (cat) {
      const head = document.createElement('div');
      head.className = 'cell cat-cell';
      head.textContent = cat.name;
      gridEl.appendChild(head);
    });

    // Grid fills row by row, so iterate value-row first, then category.
    for (let qi = 0; qi < rows; qi++) {
      board.categories.forEach(function (cat, ci) {
        const clue = cat.clues[qi];
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell clue-cell';

        if (!clue) {
          // Ragged board — validation prevents this, but never render a
          // clickable cell with nothing behind it.
          cell.className = 'cell clue-cell used';
          cell.disabled = true;
          gridEl.appendChild(cell);
          return;
        }

        cell.textContent = '$' + clue.value.toLocaleString('en-US');
        cell.setAttribute('aria-label', cat.name + ' for $' + clue.value);

        if (window.State.isUsed(ci, qi)) {
          cell.classList.add('used');
          cell.disabled = true;
        } else {
          cell.addEventListener('click', function () {
            window.Clue.open(ci, qi);
          });
        }

        gridEl.appendChild(cell);
      });
    }

    undoBtn.disabled = !window.State.canUndo();

    const hasFinal = !!board.final;
    finalBtn.hidden = !hasFinal;
    finalBtn.disabled = !hasFinal || state.players.length === 0;
  }

  return { render: render };
})();
