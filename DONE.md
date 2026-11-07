# Meal Prep Planner — done (the archive)

Finished work, moved out of TODO.md so a new chat reads less. Nothing here needs doing. Newest first.

### 2026-11-07 — sync with a PIN, this week's plan, shop extras
- Sync: worker/index.ts on /api/* + D1 `meal-prep-planner` (snapshots, tokens, PIN hash + lockout). 6-digit PIN set
  by `npm run set-pin`, entered once per device; 5 wrong → 15-min lock. Diode: only live saves, staging reads.
  Client src/sync.ts (save 2 s after a change, check on open/return, "changed on another device" choice), More →
  Sync. Tested: worker/auth.test.ts; end to end on wrangler dev with two browser origins (first copy up, second
  device loads it, changes both ways, conflict, staging host refused, lockout).
- Recipes: avocado oil, never vegetable oil; fried rice ~800 kcal (555 g rice, no broccoli/cabbage); pasta with
  carrots + spinach; Meat Sauce (freezer). Import: planned weeks get their Sunday cook day; `cooks` list.
  data/this-week.json. Shop: Extras box. scripts/macros.mjs.

### 2026-11-07 — past meals in the import file; Windows test fix
- RECIPE-IMPORT format gains a `"meals"` list (src/past-meals.ts, tested): runs of days per slot, a dish (with its
  usual side) or a food. Past days come in eaten, pinned to a cooked Sunday batch sized to them; re-importing adds
  nothing. `data/past-meals.json` = Sam's real Oct 19 – Nov 6 weekdays. Checked in the browser at phone size.
- Import test read RECIPE-IMPORT.md with Windows line endings (failed on the PC only).

### 2026-11-04 — recipes: Sam's and suggested, gluten-free
- data/meals.json now 13 dishes + 3 sides: added Garlic Ginger Beef & Rice, Pasta & Meat Sauce, Greek Chicken &
  Potatoes (suggested, picked), Japanese Chicken Curry, Butter Chicken, Chicken Twice-Baked Potatoes, Mashed
  potatoes; foods: PBfit, Morning shake, Better Than Bouillon, TJ's GF pasta. Four more suggestions wait in
  data/suggested.json. Placeholder numbers listed in TODO.md.
- Import matching: vinegars, zucchini, red/gold/russet potatoes and sizes, yogurt cups, scallions, sherry, Chinese
  cooking wine, GF soy sauce, mushroom oyster sauce, apples with sizes, teaspoon portions. Tested.

### 2026-11-04 — meal bank as a list; PBfit from the jar
- Sam: "the meal bank is still awkward". Was a sideways strip of big cards with cut-off names and − / + on every
  card. Now a list grouped Meals / Foods, one line each (full name, kcal · protein), − / + and suggestions only on
  the picked one. Phone: a drawer above the tab bar, closed by default (Weeks is where planning happens); while
  placing, only the picked meal shows. Wide: the same list as the sidebar.
- PBfit: 60 kcal, 8 g protein per 2 tbsp (Sam's jar); morning shake 719 kcal, 31 g protein, with water.

### 2026-11-04 — weeks planner; one bank card per dish; PBfit + morning shake
- Plan → Weeks (`src/weeks.ts`, tested; `src/ui/Weeks.tsx`): a card per week, lunch and dinner pickers with
  servings, side and side amount, Mon–Fri chips; tap a day to swap (another dish, freezer container, any food or
  quick add, leftovers, back to the week's dish). The Sunday-before cook day is created/resized/removed with the
  plan (Batch.auto) until edited by hand or cooked; exact scaling. Lunch + dinner kcal/protein per day.
- Recipe.serveWith (from the import's serve_with, or Recipes → "Usually with"); meal bank shows one card per dish
  with that side (other combos once used). Recipe editor: "Servings it makes"; saving resizes auto cook days.
- `data/meals.json`: PBfit (tbsp = 8 g) and "Morning shake" (3 scoops Naked Mass + 1½ tbsp PBfit, 726 kcal).

### 2026-11-04 — prep sheet; freeze after 5 days
- Prep sheet (`src/prep.ts`, tested; `src/ui/Prep.tsx`): Cook → 📋 Prep sheet or 📋 prep on a Plan cook day. For
  each dish cooked that day: amount of the main ingredient → servings; containers grouped by servings + cups of
  rice with kcal/protein and the days they're for (❄️ ones to freeze); grams per container once the pot is weighed;
  spare; fridge/freezer count; Mark cooked. Then all the rice to cook (dry amount).
- FRIDGE_DAYS 4 → 5 (Sam): Sunday cooking lasts through Friday in the fridge.

### 2026-11-04 — deleting works everywhere (Sam: "deleting recipes and cook items doesn't work")
- Delete used the browser's confirm pop-up, which is silently blocked inside another page (the claude.ai test
  copy), so it always answered "no". Now an in-page "Yes, delete it / Cancel" (`ConfirmButton`) for recipes, cook
  days/batches and My foods; backup restore asks in the page too; "other size…" and "+ Note" are inline forms
  instead of prompt pop-ups. Deleting a recipe also removes its planned meals and planned cook days (and drops it
  as the starch on planned meals); eaten meals and cooked batches stay (`recipeRemoval`, tested).

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
