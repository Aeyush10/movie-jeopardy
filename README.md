# Movie Jeopardy

A Jeopardy board for game night. One screen shows the board; you host, clicking
clues and assigning who answered. Scores, players, and game progress are stored
in the browser, so a refresh (or closing the laptop) doesn't lose anything.

No build step, no dependencies, no server required.

## Running it

**Easiest:** double-click `index.html`.

**Or serve it** (needed only if you want the app to read `questions.json`
directly — see [Editing the questions](#editing-the-questions)):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static host works too — drop the folder on GitHub Pages, Netlify, etc.

## How a game runs

1. **Setup screen** — add your players, then **Start Game**.
2. **Board** — click a clue. It fills the screen; read it aloud.
3. **Show answer** when you're ready to judge.
4. Click the player who answered, then **Correct** or **Wrong**.
   - Correct adds the clue's value and closes the clue.
   - Wrong subtracts it (real Jeopardy rules) and leaves the clue open so
     someone else can try. That player is locked out of this clue.
   - **No one answered** closes the clue with no score change.
5. **Undo** (top bar, or `Cmd/Ctrl+Z`) reverses the last scoring action,
   including reopening a clue that was closed.
6. **Leaderboard** in the top bar shows the standings at any time.
7. **Final Jeopardy** once the board is empty (you can jump early; it asks
   first).

### Daily Doubles

One per game by default, hidden until you land on it, weighted toward the
higher-value rows like the real show. You pick which player found it, they
wager, and only they can answer.

A player can wager up to their own score **or** the highest value on the board,
whichever is greater — so someone at $0 or in the red can still bet big.

### Final Jeopardy

Only players with a positive score take part. Since there's one screen, wagers
are collected one player at a time: the category shows, then each player takes
the laptop and types a wager into a masked field. Then the clue appears for
everyone, people write answers on paper, and you mark each player correct or
wrong.

Re-judging someone (you marked them wrong, then changed your mind) corrects
their score rather than double-counting it.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `1`–`9` | Select the nth player |
| `Enter` | Mark the selected player correct |
| `Backspace` | Mark the selected player wrong |
| `Space` | Show/hide the answer |
| `Esc` | Close the clue without scoring |
| `Cmd/Ctrl+Z` | Undo |

## Editing the questions

Edit **`data/questions.json`**, then run:

```sh
node sync.js
```

### Why the sync step

Browsers refuse to `fetch()` a local `.json` file when a page is opened straight
off disk (`file://`) — it's a CORS restriction, and there's no way around it.
So the board ships in two forms:

- `data/questions.json` — the file you edit.
- `data/questions.js` — the same JSON with `window.JEOPARDY_BOARD =` in front,
  loaded by a plain `<script>` tag. `node sync.js` regenerates this from the
  JSON.

The app reads `questions.json` when served over http, and falls back to
`questions.js` on `file://`. **The setup screen always names which one it
loaded**, so if you edited the JSON and the board looks unchanged, that line
will be pointing at `data/questions.js` — run `node sync.js`.

Don't want to install anything? Two other options:

- Serve the folder (`python3 -m http.server 8000`) and only ever edit the JSON.
- Use **Load JSON file…** on the setup screen to pick your edited `.json` from
  disk. This always works and skips the sync entirely.

### Format

```json
{
  "title": "Movie Night vol. 1",
  "dailyDoubleCount": 1,
  "categories": [
    {
      "name": "Sci-Fi Classics",
      "clues": [
        { "value": 200, "clue": "This 1977 George Lucas space opera…", "answer": "Star Wars" }
      ]
    }
  ],
  "final": {
    "category": "Academy Awards",
    "clue": "The only fantasy film ever to win Best Picture…",
    "answer": "The Lord of the Rings: The Return of the King"
  }
}
```

- Any board size works, as long as **every category has the same number of
  clues**. The sample is the usual 6 × 5.
- `dailyDoubleCount` — how many to scatter randomly. Defaults to `1`.
- To pin a Daily Double instead of randomising, add `"dailyDouble": true` to a
  clue. If *any* clue sets it, only the flagged ones are used.
- `final` is optional; leave it out and the Final Jeopardy button disappears.

If the file has a problem, the app shows a red banner naming the exact clue —
e.g. `"Directors" clue 3 is missing an "answer".`

## Housekeeping

On the setup screen (⚙ from the board):

- **Reset scores** — everyone back to $0, players and board untouched.
- **New game** — scores to $0, board refills, Daily Doubles move. Players kept.
- **Erase everything** — clears players, scores, and the loaded board.

## Files

```
index.html            all screens; loads the scripts in order
sync.js               regenerates data/questions.js from data/questions.json
css/styles.css        the board styling
data/questions.json   ← edit this
data/questions.js     ← generated; don't edit
js/data.js            loads and validates the board
js/state.js           game state, localStorage, undo stack
js/players.js         roster and score podiums
js/board.js           the grid
js/clue.js            clue overlay and Daily Doubles
js/final.js           Final Jeopardy
js/leaderboard.js     standings
js/app.js             screen routing, buttons, keyboard
```

Every mutation goes through `State.apply()`, which records its own inverse.
That's why Undo behaves the same for normal clues, Daily Doubles, and Final
Jeopardy without any of them being special-cased.

### A note on the console

Opening over `file://` logs a CORS error for `questions.json`. That's expected —
it's the fallback doing its job, and the app has already loaded the board from
`questions.js` by the time you see it.
