# Meal Prep Planner — done (the archive)

Finished work, moved out of TODO.md so a new chat reads less. Nothing here needs doing. Newest first.

### 2026-11-04 — repeat a week, shop by week, pantry
- Plan → *Repeat this week…*: 7 days (from the cook day before the week, e.g. Sunday) of meals and cook days
  copied to the next N weeks; filled slots and existing cook days left alone; Undo. `src/repeat.ts` (tested).
- Shop goes week by week from the shopping day (Saturday by default, set on the Shop tab); "Pick dates" keeps any
  range. Pantry (`src/pantry.ts`, tested; stored in settings, no database change): More → Pantry, suggestions from
  recipes, "running low" → Restock section; pantry things the week uses listed as "check you have enough".

### 2026-11-04 — wide layouts for the other tabs (f59d539)
- Cook (two columns), Recipes (dishes | starches), Shop (aisles in up to three columns), More (tile grid) at ≥ 900 px.

### 2026-11-04 — Open Food Facts lookup (486134f)
- More → Look up a packaged food: name or barcode number, label per 100 g / per serving, save picked ones to My
  foods (auto "scoop"-style unit from the label serving). `src/off.ts` tested against sample replies (the site
  wasn't reachable from the cloud machine).

### 2026-11-04 — import recipes & foods in the app (d70c0a1)
- More → Import recipes & foods: RECIPE-IMPORT.md format from a file or a pasted reply; USDA matching (learned
  fixes → known names → search), review with "change", Replace/Keep both/Skip for same names, foods into My foods.
  `src/import-file.ts` tested with the real USDA list. Search: whole words beat prefixes, better plurals.

### 2026-11-04 — My foods: extra units (9b1d722)
- Units like scoop = 55 g on a custom food (needs serving weight); usable in recipes, the "+" search and the bank.

### 2026-11-04 — meal bank + paint-in calendar, cook days (0472730)
- Plan tab: meal bank cards from the real data (dishes, dish + starch, My foods, recent foods), tweakable in place;
  tap card → tap slots (phone), drag and drop (PC); tap a meal to change/eat/remove it. Cook days ("+ cook")
  create planned batches; the app works out what each feeds, spare, freeze (> 4 days), short, and meals with no
  cook day. Database version 2 (planned meals point at the recipe). `src/cookdays.ts`, `src/bank.ts` (tested).
  Mockup removed. Tested with Playwright at 402 × 874 and 1440 × 900 with the imported recipes.

### 2026-10-21 — calendar month view, drained cans, pots, recent breakfasts
- Week/month toggle and a wide PC layout (4798132). Drained/whole-can switch (`src/cans.ts`, tested), saved pots
  with empty weights, "Containers on hand" always editable, recent entries per slot, inline food search, labelled
  two-column fields for the iPhone 17.

### 2026-10-20 — rough pass on version 1 (cd5fb5f, 3cb3200, 3021ce2)
- Data model (`src/model.ts`), units and recipe maths, calendar/grocery maths, recipes.json import, all with tests
  (29). Screens: Plan, Cook, Recipes, Shop, More. On staging, not on the phone yet.

### 2026-10-20 — ingredient list trimmed; Cloudflare config (ef42dcd)
- 8,221 → 6,291 foods: dropped baby food, fast food, restaurant, American Indian/Alaska Native and brand-name
  entries; merged duplicates (Foundation preferred). Added `wrangler.jsonc` for Cloudflare Workers.

### 2026-10-20 — step 1: ingredient search (230edd9)
- Installable offline web app with search over 8,221 USDA ingredients (SR Legacy + Foundation) and a detail page.
  Data built by `scripts/build-usda.mjs`. Tested in the PC browser (mobile size), not yet on the phone.

### 2026-10-20 — platform and v1 choices decided
- Chose a PWA over native iOS; agreed USDA bundling, recipe vs batch, units, import and grocery list choices.
  Recorded in CLAUDE.md.

### 2026-10-20 — brought into the Project Kit
- Added CLAUDE.md, BUGS.md, TODO.md, DONE.md, README.md, .gitignore and the `staging` branch.
