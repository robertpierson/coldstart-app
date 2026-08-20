# coldstart

A GitHub-style contribution graph for cold outreach. Cold DMs are scary, so people do them once and
stop. The green squares are the trick that makes people show up daily for code — this points them at
reaching out instead.

Log every cold DM, email or call. The square for that day gets darker. Don't break the chain.

## Run it

```bash
npm start
```

Serves the folder at http://localhost:3000. No build step, no dependencies, no accounts.

```bash
npm test
```

## What's in it

| file | what |
| --- | --- |
| `index.html` | markup — profile, graph, activity, leaderboard, log + edit-profile dialogs |
| `styles.css` | dark GitHub-ish theme |
| `app.js` | state, storage and rendering |
| `logic.js` | pure date/streak math, no DOM |
| `test.mjs` | asserts for the streak and grid math |

## How it works

- Everything lives in `localStorage` under `coldstart:v1` - profile picture included, stored as a
  128px JPEG data URL (a couple of KB), not the original file — this is a local prototype, so there is
  no server and no account. Clearing browser data clears your history.
- Streaks survive an unlogged today: a chain ending yesterday still counts until the day is over.
- Click any square to fix a past day. Set it to 0 to remove it.
- The six people on the leaderboard are **fake** — seeded, deterministic, and there so the board
  isn't an empty room on day one.

## If this grows up

Swap the `load()`/`save()` pair in `app.js` for API calls and add auth. Nothing else knows where the
data comes from.
