# Meal Prep Planner — done (the archive)

Finished work, moved out of TODO.md so a new chat reads less. Nothing here needs doing. Newest first.

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
