# Grepke Baseball League — Polls & League History

A simple, thematically fun website for **Grepke Baseball League** league polls and last-season results.

## What’s included

- **Polls** (`index.html`) — Current poll (CI/MI lineup question) and a Poll History section. Votes are stored in the browser (localStorage); after voting, you see “Thanks for voting!” and the current results.
- **League History** (`league-history.html`) — Last season’s top 3 podium, current teams list, regular-season standings, season stats, and full playoff bracket (including consolation rounds).

## How to run

No build step. Open the site from the project folder:

1. **From the terminal** (from this folder):
   ```bash
   python3 -m http.server 8000
   ```
   Then go to: **http://localhost:8000**

2. **Or** open `index.html` directly in your browser (file://). Some features work best when served over HTTP (e.g. if you add more pages later).

## Poll behavior

- One vote per browser (per device); after you vote, the form is replaced by results.
- Poll History shows past polls once you add logic to “close” a poll and move it into history (e.g. an admin action or a separate script that pushes the current poll into the `history` array in localStorage).

## Files

| File | Purpose |
|------|--------|
| `index.html` | Polls page (current poll + poll history) |
| `league-history.html` | League history (podium, teams, standings, stats, bracket) |
| `styles.css` | Shared baseball-themed styling |
| `poll.js` | Poll form handling and localStorage for votes |

Enjoy the season.
