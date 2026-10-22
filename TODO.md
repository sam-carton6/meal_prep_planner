# Meal Prep Planner — to do

Only what's still open. Finished work goes to [DONE.md](DONE.md) with the date and commit. Ideas Sam mentions go
under *Ideas (later)*; ask before building one.

## Where things stand (keep this current, a few lines)

**Live on `main`:** step 1 (merged 20 Oct 2026): installable offline app with search over 6,291 USDA ingredients.
Hosted at https://meal-prep-planner.samcarton6.workers.dev.
**On `staging`, not live yet:** a rough pass on all of version 1 (20 Oct 2026, night): Plan (calendar), Cook
(batches, stock, cook list), Recipes, Shop (grocery list), More (ingredients, My foods, targets, backup, import).
Tested in the PC browser at phone size: import, scaling a batch, starch suggestion, calendar, grocery list.
Plus (21 Oct): calendar week/month toggle, wide PC layout; Drained/whole-can switch on cans; saved pots for
weigh-the-pot; recent breakfasts/snacks as one-tap repeats; tidier fields at iPhone 17 width (402 px).
**Next up:** Sam tries https://staging-meal-prep-planner.samcarton6.workers.dev on his phone and answers *Check with Sam* below; then polish.

## Check with Sam (decisions made during the rough pass)

- Chicken thigh: import uses USDA SR Legacy (121 kcal/100 g, matches his old numbers); USDA Foundation says 149.
- Canned beans: now a Drained switch per can (Sam usually drains; chili used whole cans). Drained can ≈ 60% of the
  can's weight (estimate). Great northern *whole can* still looks high (485 kcal): USDA has no "solids and liquid"
  entry for it, so it uses the plain "canned" one. Check against the can's label.
- "Bell peppers" taken as red, "whole" as USDA medium (119 g); sweet onion and garlic head sizes worked out from
  his old calories.
- Starch suggestion aims at 700 kcal per container (More → Targets). Week average counts only days with something
  on them.
- Ticking a calendar entry as eaten takes a container from the fridge first, then the freezer.
- Imported batches start with 0 in fridge/freezer: he should set how many chili/chicken containers he has.

## To do

- Try on the phone (staging link): backup via the share sheet, ticking meals eaten, copy breakfast/snacks,
  My foods, quick add, "other size…" (can sizes). None of these were tried yet.
- Rough edges: changing the bought weight in a batch resets hand-edited lines; calendar entries can only be
  removed and re-added, not edited; no undo.
- Later, maybe: find out why Cloudflare's automatic staging builds never ran (settings look right), so
  `npm run staging` isn't needed.
- Start "My foods" with Sam's usual takeout (ask him which places). Breakfast: Naked Mass chocolate shake, ~150 g
  per breakfast. Label: 333 g (about 7 scoops) = 1,360 kcal, 50 g protein, 251 g carbs, 15 g fat; 150 g ≈ 613 kcal,
  22.5 g protein. Sam adds it in My foods and will send his old scoop's weight.
- Only the calendar uses the PC's width so far; the other screens are still a phone-width column on the PC.

## Ideas (later)

Don't build yet, but don't design them out: prep-ahead list (chop vegetables early), branded foods via the USDA
FoodData Central API, a real iOS app (Capacitor wrap or native; needs Apple's $99/yr account) for Apple Health, a
separate workout app sharing data with this one.

- **Importing more recipes from PDFs/screenshots** (Sam, 21 Oct 2026). No new tool needed for now: Sam drops the
  PDFs or screenshots into a folder (e.g. `data/private/recipes-to-import/`, ignored by git) and asks Claude to
  turn them into the `recipes.json` format; the existing import then recalculates them from USDA with the
  side-by-side check. Build a proper in-app import only if this happens often.

## What's new at the next merge

- Plan your meals on a calendar (breakfast, lunch, dinner, snacks): week or month view, day totals, averages.
  On the PC the week shows as 7 columns.
- Recipes that scale from what you bought, containers from your protein target, weight per container.
- Rice/pasta per container, and how much to cook for the containers you've planned.
- Fridge/freezer counts, a cook list, and one grocery list by aisle with tick boxes.
- My foods (takeout, treats), targets, backup to a file, and your recipes.json imported.
