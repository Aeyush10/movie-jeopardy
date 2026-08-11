/* Board loading and validation.
 *
 * Three sources, tried in order, because browsers block fetch() of local
 * .json files when index.html is opened over file://:
 *   1. fetch('data/questions.json')      — works over http://
 *   2. window.JEOPARDY_BOARD             — from data/questions.js, works on file://
 *   3. a file the host picks at runtime  — always works, persisted to storage
 */
window.Data = (function () {
  'use strict';

  const JSON_PATH = 'data/questions.json';

  /* ------------------------------ validation ----------------------------- */

  /* A problem with the board's *contents* rather than with reaching the file.
     Flagged so load() can tell "your JSON has a typo" (report it) apart from
     "fetch was blocked" (fall back to the embedded copy). */
  function contentError(message) {
    const err = new Error(message);
    err.isContentError = true;
    return err;
  }

  /* Throws an Error naming the offending category/clue. questions.json is
     hand-edited, so a readable message matters more than a strict schema. */
  function validate(board) {
    if (!board || typeof board !== 'object' || Array.isArray(board)) {
      throw contentError('The top level of the file must be a JSON object.');
    }

    if (!Array.isArray(board.categories) || board.categories.length === 0) {
      throw contentError('"categories" must be a non-empty array.');
    }

    let width = null;

    board.categories.forEach(function (cat, ci) {
      const where = 'category ' + (ci + 1);

      if (!cat || typeof cat !== 'object') {
        throw contentError(where + ' is not an object.');
      }
      if (typeof cat.name !== 'string' || cat.name.trim() === '') {
        throw contentError(where + ' is missing a "name".');
      }
      if (!Array.isArray(cat.clues) || cat.clues.length === 0) {
        throw contentError('"' + cat.name + '" has no "clues" array.');
      }

      if (width === null) {
        width = cat.clues.length;
      } else if (cat.clues.length !== width) {
        throw contentError(
          '"' + cat.name + '" has ' + cat.clues.length + ' clues but ' +
          'category 1 has ' + width + '. Every category needs the same number.'
        );
      }

      cat.clues.forEach(function (clue, qi) {
        const at = '"' + cat.name + '" clue ' + (qi + 1);

        if (!clue || typeof clue !== 'object') {
          throw contentError(at + ' is not an object.');
        }
        if (typeof clue.value !== 'number' || !isFinite(clue.value) || clue.value <= 0) {
          throw contentError(at + ' needs a positive number for "value".');
        }
        if (typeof clue.clue !== 'string' || clue.clue.trim() === '') {
          throw contentError(at + ' is missing "clue" text.');
        }
        if (typeof clue.answer !== 'string' || clue.answer.trim() === '') {
          throw contentError(at + ' is missing an "answer".');
        }
      });
    });

    if (board.final !== undefined && board.final !== null) {
      const f = board.final;
      if (typeof f !== 'object' || Array.isArray(f)) {
        throw contentError('"final" must be an object.');
      }
      ['category', 'clue', 'answer'].forEach(function (key) {
        if (typeof f[key] !== 'string' || f[key].trim() === '') {
          throw contentError('"final" is missing "' + key + '".');
        }
      });
    }

    return board;
  }

  /* --------------------------------- load -------------------------------- */

  function fromEmbedded() {
    if (!window.JEOPARDY_BOARD) return null;
    // Deep copy so gameplay never mutates the script-tag original.
    return validate(JSON.parse(JSON.stringify(window.JEOPARDY_BOARD)));
  }

  /* Resolves to { board, source } or rejects with a readable Error. */
  function load() {
    return fetch(JSON_PATH)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          // The file is reachable but broken — that's a real authoring error,
          // so surface it instead of silently falling back to the stale copy.
          throw contentError(JSON_PATH + ' is not valid JSON: ' + err.message);
        }
        return { board: validate(parsed), source: JSON_PATH };
      })
      .catch(function (err) {
        // A genuine content error must not be masked by the fallback.
        if (err && err.isContentError) throw err;

        // Network/CORS failure — expected on file://. Use the embedded copy.
        const embedded = fromEmbedded();
        if (embedded) {
          return { board: embedded, source: 'data/questions.js' };
        }
        throw new Error(
          'Could not read ' + JSON_PATH + ' (' + err.message + ') and ' +
          'data/questions.js was not loaded either.'
        );
      });
  }

  /* Reads a .json the host picked from disk. Resolves to a validated board. */
  function loadFromFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () {
        reject(new Error('Could not read ' + file.name + '.'));
      };
      reader.onload = function () {
        let parsed;
        try {
          parsed = JSON.parse(reader.result);
        } catch (err) {
          reject(new Error(file.name + ' is not valid JSON: ' + err.message));
          return;
        }
        try {
          resolve(validate(parsed));
        } catch (err) {
          reject(new Error(file.name + ': ' + err.message));
        }
      };
      reader.readAsText(file);
    });
  }

  /* ------------------------------- helpers ------------------------------- */

  function maxClueValue(board) {
    let max = 0;
    board.categories.forEach(function (cat) {
      cat.clues.forEach(function (clue) {
        if (clue.value > max) max = clue.value;
      });
    });
    return max;
  }

  function totalClues(board) {
    return board.categories.reduce(function (sum, cat) {
      return sum + cat.clues.length;
    }, 0);
  }

  /* Daily Double positions as "categoryIndex-clueIndex" keys.
     Honours explicit "dailyDouble": true flags; otherwise picks at random,
     weighted toward the higher-value rows the way the real show does. */
  function pickDailyDoubles(board) {
    const explicit = [];
    board.categories.forEach(function (cat, ci) {
      cat.clues.forEach(function (clue, qi) {
        if (clue.dailyDouble === true) explicit.push(ci + '-' + qi);
      });
    });
    if (explicit.length > 0) return explicit;

    const count = Math.max(0, Math.min(
      typeof board.dailyDoubleCount === 'number' ? board.dailyDoubleCount : 1,
      totalClues(board)
    ));
    if (count === 0) return [];

    // Weight = row index + 1, so the bottom (pricier) rows are likelier.
    const pool = [];
    board.categories.forEach(function (cat, ci) {
      cat.clues.forEach(function (clue, qi) {
        pool.push({ key: ci + '-' + qi, weight: qi + 1 });
      });
    });

    const picked = [];
    for (let n = 0; n < count && pool.length > 0; n++) {
      let total = 0;
      pool.forEach(function (p) { total += p.weight; });

      let roll = Math.random() * total;
      let index = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        roll -= pool[i].weight;
        if (roll <= 0) { index = i; break; }
      }

      picked.push(pool[index].key);
      pool.splice(index, 1);

      // At most one Daily Double per category, as on the show.
      const usedCat = picked[picked.length - 1].split('-')[0];
      for (let i = pool.length - 1; i >= 0; i--) {
        if (pool[i].key.split('-')[0] === usedCat) pool.splice(i, 1);
      }
    }
    return picked;
  }

  return {
    load: load,
    loadFromFile: loadFromFile,
    validate: validate,
    maxClueValue: maxClueValue,
    totalClues: totalClues,
    pickDailyDoubles: pickDailyDoubles
  };
})();
