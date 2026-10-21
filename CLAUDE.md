# Meal Prep Planner — notes for Claude

Sam's personal calorie tracker + meal prep planner, for his own use first: a calendar of what he'll eat
(breakfast, lunch, dinner, snacks) planned ahead as meal prep, which drives recipes, portions, cook days and shopping.
Replaces commercial apps he isn't happy with. Sam's general rules are in `~/.claude/CLAUDE.md` (master copy:
`Projects/_Project Kit/global-CLAUDE.md`); this file adds what's specific to this project and wins where they differ.

Notes: [PROJECT_BRIEF.md](PROJECT_BRIEF.md) (what to build: version 1, later, how Sam wants to work; read it before
planning anything), [BUGS.md](BUGS.md) (Sam's inbox, read every chat), [TODO.md](TODO.md) (open work; read *Where
things stand* every chat), [DONE.md](DONE.md) (the archive).

## Where it runs
- **Kind:** a PWA, a web app added to the iPhone home screen that works offline (Sam, 20 Oct 2026). Native iOS is
  set aside for now because of Apple's $99/yr account or 7-day reinstalls. It may come later on the MacBook, so keep
  the data model and export format portable (Apple Health needs native).
- **Live:** nothing yet. Hosting: Cloudflare Pages (Sam, 20 Oct 2026): `staging` gets a test link, `main` the real one. Not
  set up yet; ask before creating the project.
- **Repo:** GitHub `sam-carton6/meal_prep_planner` (public on purpose: no sensitive data; Sam, 20 Oct 2026). Keep it that way unless he says otherwise. Main copy on the tower:
  `D:\Users\Sam\Documents\Projects\Meal Prep Planner`.

## Branches
`main` = the version Sam is happy with, `staging` = all work. Merge `staging` → `main` only when Sam says "merge".
Claude may suggest a merge when tested work is ready, but waits for Sam's OK (Sam, 20 Oct 2026).

## Checking work
`npm test` (maths/logic tests) and `npm run build`, then try it with `npm run dev` in the PC browser, then on the
phone (staging link once Cloudflare Pages is set up).

## Stack
Web PWA: Vite + React + TypeScript, `vite-plugin-pwa` (offline + install), Dexie (on-phone database in
IndexedDB), Vitest (tests). USDA data is built once by `scripts/build-usda.mjs` into `public/data/usda-foods.json`
(committed); the raw USDA downloads go in `data/raw/` (ignored).

## Data
- `recipes.json` = Sam's existing recipes, the import source for version 1.
- Storage is local on the device, with export to a file so data is never locked in (brief). Keep the data model
  (ingredients, recipes, recipe items, portions, sides, log entries) clean and documented: the later food log and a
  separate workout app build on it.
- `.gitignore` ignores `*.sqlite` / `*.db`; if the bundled USDA file is SQLite, add an exception for it.

## Decisions so far
- Plan before coding: propose the architecture and data model and ask first (brief, Oct 2026).
- Agree on the big picture in plain language first; ask detail questions (e.g. optional add-ons, rice yield) when
  that feature gets built (Sam, 20 Oct 2026).
- The calendar is the core of version 1, not "later" (Sam, 20 Oct 2026). Calories judged mainly as a weekly
  average. "My foods" (takeout, treats) is one growing list of custom foods with an optional place.
- Agreed 20 Oct 2026: bundle USDA SR Legacy + Foundation Foods in the app; imported recipes are recalculated from
  USDA with a side-by-side check; a *Recipe* (template) is separate from a *Batch* (one actual cook); US units with
  grams alongside; grocery list has checkboxes, hides pantry staples, groups by aisle.
