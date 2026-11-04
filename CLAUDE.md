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
- **Live:** https://meal-prep-planner.samcarton6.workers.dev (from `main`). Cloudflare Workers serving the built
  files (settings in `wrangler.jsonc`), connected to GitHub: pushes to `main` build and go live automatically.
- **Staging (Sam's phone):** https://staging-meal-prep-planner.samcarton6.workers.dev. Cloudflare's automatic
  branch builds never fired (Oct 2026), so after pushing staging work run `npm run staging` (builds and uploads a
  preview version; doesn't touch `main`'s live app). This PC is already signed in to Cloudflare (wrangler).
  At home, `npm run dev:phone` also serves the dev version on the Wi-Fi (http://<PC's IP>:5173; no offline/install).
- **Repo:** GitHub `sam-carton6/meal_prep_planner` (public on purpose: no sensitive data; Sam, 20 Oct 2026). Keep it that way unless he says otherwise. Main copy on the tower:
  `D:\Users\Sam\Documents\Projects\Meal Prep Planner`.

## Branches
`main` = the version Sam is happy with, `staging` = all work. Merge `staging` → `main` only when Sam says "merge".
Claude may suggest a merge when tested work is ready, but waits for Sam's OK (Sam, 20 Oct 2026).

## Checking work
`npm test` (maths/logic tests) and `npm run build`, then try it with `npm run dev` in the PC browser at phone size,
then on the phone via the staging preview link. Maths lives in `src/recipe-math.ts`, `src/plan.ts`, `src/units.ts`,
`src/cookdays.ts` (what each cook day feeds), `src/bank.ts` (meal bank cards), `src/repeat.ts` (repeat a
week), `src/pantry.ts`, `src/prep.ts` (the prep sheet), `src/weeks.ts` (the weeks planner), `src/import-file.ts` (RECIPE-IMPORT
format) and `src/off.ts` (Open Food Facts), all tested; screens in `src/ui/`. Open Food Facts is the only thing that
goes online (search words or barcode only). Sam's phone is an iPhone 17: check layouts at 402 × 874.

## Stack
Web PWA: Vite + React + TypeScript, `vite-plugin-pwa` (offline + install), Dexie (on-phone database in
IndexedDB), Vitest (tests). USDA data is built once by `scripts/build-usda.mjs` into `public/data/usda-foods.json`
(committed); the raw USDA downloads go in `data/raw/` (ignored). The script trims the list: no baby food, fast food,
restaurant, American Indian/Alaska Native or brand-name items, and duplicates merged (Sam, 20 Oct 2026).

## Data
- `recipes.json` = Sam's existing recipes, the import source for version 1.
- The data model is documented at the top of `src/model.ts`; stored on the phone with Dexie (`src/db.ts`, change
  the layout only by adding a new `db.version(n)`). Backup = More → Backup (whole database as JSON).
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
- Rework agreed 3 Nov 2026 (first pass was "fiddly"): a *meal bank* of tweakable meal cards placed on the
  calendar. Phone: tap a card, then tap slots; PC: drag and drop. **Sam sets cook days himself**; the app derives
  portions, freezer hints and shopping from the plan + cook days. Clickable mockup first (`public/mockup.html`,
  removed 4 Nov once the real Plan tab replaced it).
  Recipes/foods arrive via [RECIPE-IMPORT.md](RECIPE-IMPORT.md); packaged foods looked up on Open Food Facts.
- Hybrid built 4 Nov 2026: the meal bank + paint-in calendar live on the Plan tab, inside the real app with its
  tab bar. A planned container points at its *recipe*; the latest cook day of that recipe on or before it feeds
  it (Sam chose this over pinning each meal to a batch). Eaten meals are pinned to their batch. A new cook day
  starts at the recipe's normal size and Sam enters what he bought; extra containers show as *spare* (e.g. for
  his girlfriend), not as a problem. Starches don't get cook days. Freeze = eaten more than 5 days after cooking
  (Sam, 4 Nov 2026: Sunday → Friday from the fridge is fine).
- **Low friction beats precision** (Sam, 4 Nov 2026): he tracks his weight and judges by the trend; ±100 kcal a
  day doesn't matter, weekends are loose, he often skips breakfast and sometimes eats out. Prefer fewer taps and
  fields over exactness. He plans 1–3 months in one sitting: shopping lists ready, what to prep and freeze ahead.
- Recipes' master copy is `data/meals.json` (RECIPE-IMPORT format, in git). `npm run book` turns it into
  `public/recipe-book.html` (served at /recipe-book.html). Workflow: Sam edits with an AI chat → pastes to Claude
  Code → file + book updated and pushed → More → Import (Replace) in the app.
- Containers: a dish's own `servings` (e.g. 5) sets how many containers a batch makes, scaled by the main
  ingredient bought; the 40 g protein split is only the fallback (Sam, 4 Nov 2026).
- Sam's week (4 Nov 2026): shop Saturday, prep (cutting, marinades), cook Sunday for 5 weekday meals; weekends
  he's on his own. So: Shop goes week by week from the shopping day (Sat), "repeat a week" starts on the cook
  day, and a simple pantry (spices, sauces, rice, oats, beans) stays off the list until marked running low.
- **Weeks planner is how Sam plans** (4 Nov 2026, after the meal bank felt like too many options): Plan opens on
  *Weeks*: per week pick lunch and dinner, Mon–Fri fills in, the Sunday before becomes the cook day sized exactly
  to the fresh meals planned (Batch.auto, scaled without rounding). Any day can be swapped: another dish (cooked
  that Sunday too: piecewise weeks), a freezer container (dish entry `fromStock`, pinned to its batch), takeout or
  any food, leftovers. Swapped and eaten days survive row changes. Variety week to week is the point, so repeat-a-
  week is secondary. The calendar + meal bank (one card per dish with its usual side, Recipe.serveWith) stay for
  one-offs. Entering what he bought (saving the cook day) stops the auto-sizing.
- **Gluten-free** (Sam, 4 Nov 2026): every recipe and suggestion must be gluten-free (tamari, not soy sauce; rice,
  potatoes, gluten-free tortillas). Flag ingredients that often hide wheat (seasoning packets, broth, sausage, BBQ
  sauce, gochujang): check the label. He also avoids corn (no cornstarch; watch corn syrup in ketchup and
  BBQ sauce). Suggested recipes wait in `data/suggested.json` until Sam picks; picked ones
  move to `data/meals.json`.
- **Weigh, don't measure** (Sam, 4 Nov 2026): he uses a kitchen scale. Sides are planned in grams (rice, mashed
  potatoes); the salad is a weekly batch split 5 ways, so the prep sheet gives grams of each vegetable per container, containers by grams after weighing the pot, and the prep sheet gives grams
  next to everything but spoon amounts. Shopping stays in store units (lb, cans).
- What the app is for (Sam, 4 Nov 2026): planning meal preps and shopping, seeing what food he'll have when if he
  cooks on a given day, and easy calorie counting while he adjusts his diet (eat more or less, cook extra for
  someone else). He knows how to cook most things: amounts and how to divide them matter more than recipe steps.
