/* Category intro: reveals each category name, one at a time, before the
 * board opens. Runs between the setup screen and the board — same slot a
 * host would fill by reading categories aloud.
 *
 * The current index is kept in module state rather than window.State: it's
 * a one-time reveal, not something worth restoring after a page refresh or
 * an undo.
 */
window.Intro = (function () {
  'use strict';

  const bodyEl = document.getElementById('intro-body');
  let index = 0;

  function categories() {
    const board = window.State.get().board;
    return board ? board.categories : [];
  }

  function start() {
    index = 0;
    window.State.setScreen('intro');
  }

  function finish() {
    window.State.setScreen('board');
  }

  function next() {
    if (index >= categories().length - 1) {
      finish();
      return;
    }
    index += 1;
    render();
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

  /* -------------------------------- render ------------------------------- */

  function render() {
    bodyEl.innerHTML = '';

    const cats = categories();
    if (cats.length === 0) return;
    if (index >= cats.length) index = cats.length - 1;

    const isLast = index >= cats.length - 1;

    bodyEl.appendChild(el('p', 'intro-eyebrow', "Today's Categories"));
    bodyEl.appendChild(el('div', 'intro-category', cats[index].name));
    bodyEl.appendChild(el('p', 'intro-progress', (index + 1) + ' of ' + cats.length));

    const actions = el('div', 'clue-actions');
    actions.appendChild(button(isLast ? 'Reveal the Board' : 'Next Category', 'btn btn-gold btn-big', next));
    actions.appendChild(button('Skip Intro', 'btn btn-quiet', finish));
    bodyEl.appendChild(actions);
  }

  /* ------------------------------- keyboard ------------------------------- */

  function handleKey(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
      next();
      return true;
    }
    if (event.key === 'Escape') {
      finish();
      return true;
    }
    return false;
  }

  return { start: start, render: render, handleKey: handleKey };
})();
