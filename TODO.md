# Meal Prep Planner — to do

Only what's still open. Finished work goes to [DONE.md](DONE.md) with the date and commit. Ideas Sam mentions go
under *Ideas (later)*; ask before building one.

## Where things stand (keep this current, a few lines)

**Start here (7 Nov 2026):** everything merged to `main` and live 7 Nov (version 1, the weeks planner, sync with
PIN). Sam's PIN is set online. **Next for Sam (phone):** staging More → Backup → live More → Backup → Restore → live
More → Sync → PIN (his data goes up), then sign in on the PC to check it shows up. Not yet tried on his phone.
This week: fried rice lunch, pasta dinner, freezer meat sauce (`data/this-week.json`). Recipes: `data/meals.json`
(15 dishes + 3 sides); 3 unpicked suggestions in `data/suggested.json`; placeholder numbers under *Numbers to check*.

**Live on `main`:** everything up to 7 Nov 2026 (merged 7 Nov). https://meal-prep-planner.samcarton6.workers.dev

**4 Nov summary, in plain words.**
- *Done:* (1) Plan tab: meal bank of cards from your real recipes and foods, tweak − / + on a card, tap a card then
  tap slots (or drag on the PC), tap a meal to change/eat/remove it, ○ to mark eaten. "+ cook" on a day sets a
  cook day; the app shows what it makes, who it feeds, spare containers, what to freeze, and warns about meals with
  no cook day. (2) More → Import recipes & foods (file or pasted claude.ai reply), with a review where you can fix
  any USDA match; fixes are remembered. (3) My foods with extra units (scoop = 55 g). (4) More → Look up a
  packaged food (Open Food Facts, name or barcode number). (5) Cook, Recipes, Shop and More use the PC's width.
- *Tested:* 63 automatic tests pass; the build passes; every screen driven in a browser at iPhone 17 size
  (402 × 874) and PC size (1440 × 900) with your imported recipes; the database upgrade tested with data saved by
  the previous version (planned meals, eaten meals, stock and My foods all survived).
- *Not tested:* on your actual iPhone (tapping, scrolling the meal bank, the file picker for import); Open Food
  Facts for real (the cloud machine couldn't reach it, so it's tested against sample replies only); the staging
  link (not updated: run `npm run staging` on the PC once these commits are on GitHub).
- *Pushing:* GitHub refused the cloud session's pushes (no access for this session), so the commits may not be on
  GitHub yet. If `git log origin/staging` on the PC doesn't show "Wide-screen layouts…", they didn't arrive.
- *For you to decide:* see the 4 Nov items under *Check with Sam* below.

**Later on 4 Nov:** GitHub access fixed, everything pushed. Added: target suggestions ("40 g protein: 1¼ servings",
"750 kcal: 1½ cup rice"); the eaten circle removed from the calendar; Sam's recipes in `data/meals.json` (7 dishes,
rice, salad as a side) with a recipe book (`npm run book` → /recipe-book.html); containers start from each recipe's
own count (e.g. 5); import fixes (typical sizes, My foods by name, better names). Tortilla label added (80 kcal per 28 g tortilla; quesadillas ≈ 836 kcal, 58 g protein per container).
**Even later on 4 Nov (Sam's routine: shop Saturday, prep, cook Sunday, eat Mon–Fri, weekends on his own):**
added *Repeat this week…* (Plan tab: copies 7 days of meals + cook days to the next N weeks, starting on the cook
day; only empty slots), Shop *by week* (Saturday–Friday, ‹ › to look ahead; "Pick dates" for any range;
shopping day changeable), and a *Pantry* (More → Pantry or Shop → Pantry: spices, sauces, rice, oats; kept off
the list, shown as "check you have enough", "running low" puts it under Restock).
Then: deleting fixed (pop-ups were blocked in the test copy; now in-page "Yes, delete it"), freeze rule now
**more than 5 days** (Sam), and the **prep sheet** (Cook → 📋 Prep sheet, or 📋 prep on a cook day in Plan): per
dish what to cook, containers grouped by servings + rice, grams each after weighing the pot, kcal/protein, which
day each is for, ❄️ freezer ones, spare; then total rice to cook. "Mark cooked" right there.
Then the **weeks planner** (Plan → Weeks, now the first view): lunch + dinner per week, Mon–Fri, cook day the
Sunday before sized to what's planned (the "8 vs 5 Mexican chicken" spare problem is gone); tap a day to swap it
(another dish, freezer, takeout/any food, leftovers). Meal bank down to one card per dish. PBfit + a "Morning
shake" food added to data/meals.json.
**Recipes (4 Nov, later):** Sam: app is OK for now, add recipes; all gluten-free. Five suggestions in
`data/suggested.json` (teriyaki chicken, tikka masala, Korean-style beef, Greek chicken & potatoes, BBQ pulled
pork); waiting on him to pick, and to paste his own. Label checks on current recipes: taco seasoning, chicken
broth, the Italian sausage. Added Sam's Garlic Ginger Beef & Rice (2 lb, 4 containers) with his own products: 2 tbsp oil, GF Kikkoman,
Whole Foods mushroom oyster sauce, Better Than Bouillon (in foods), Chinese cooking wine; no dark soy. ~688 kcal,
47 g protein a container before rice. Asked him to check the oyster sauce and cooking wine labels for wheat. Added his Pasta & Meat Sauce
(2 lb 85/15 assumed, 1 lb TJ's GF brown rice pasta, 5 containers ≈ 847 kcal / 43 g); pasta numbers are a typical
brown rice pasta label (200 kcal, 4 g protein per 2 oz dry): check the bag. Then (all beef 85/15): Greek
Chicken & Potatoes picked; added his Japanese Chicken Curry (homemade GF roux, no shiro dashi), Butter Chicken,
Chicken Twice-Baked Potatoes (Claude's draft), and Mashed potatoes as a side. Placeholders: *Numbers to check*.
Sam prefers the scale (4 Nov): rice and mashed potatoes planned in grams; the prep sheet shows grams next to
everything you'd weigh. Rice is now planned by weight (grams of cooked rice, 25 g steps; 706 g cooked per 1½ cups dry). Sam's
ketchup, BBQ sauce and Better Than Bouillon are corn-free.
**Waiting on Sam:** re-import meals.json (Replace) so recipes get their usual sides and the new foods; try Weeks on
the phone. PBfit fixed from Sam's jar (60 kcal, 8 g protein per 2 tbsp); shake is with water. Meal bank redone as a
list (one line per meal/food, − / + only on the picked one, a closed drawer on the phone by default).

## Numbers to check (placeholders until Sam confirms; Sam, 4 Nov 2026: "placeholders are fine for now")

All beef is 85/15. When Sam sends a label or a measurement, fix `data/meals.json`, run `npm run book`, and tick it off.
- PBfit: 60 kcal, 8 g protein per 2 tbsp (from Sam); carbs 4 g, fat 1.5 g and 16 g per 2 tbsp are guesses.
- Better Than Bouillon roasted chicken base: 15 kcal per tsp (6 g), from memory of the label.
- Trader Joe's gluten-free brown rice pasta: 200 kcal, 4 g protein per 2 oz dry (a typical brown rice pasta label).
- Gluten-free 1-to-1 flour (Bob's Red Mill / King Arthur): counted as USDA white rice flour.
- Chipotle peppers in adobo: kcal and protein from his old recipe; no carbs or fat.
- Mushroom oyster sauce (Whole Foods): counted as USDA oyster sauce. Chinese cooking wine: as white wine.
- Garam masala: counted as USDA curry powder (USDA has none).
- Mashed potatoes: 4 tbsp butter and whole milk (Sam); 0.6 cup milk and the 1,550 g batch weight are estimates (weigh once).
- Japanese curry: counts 226 g of the ~425 g roux batch; potatoes as USDA medium (213 g), apple small (158 g).
- Sizes taken as typical: broccoli head 450 g, garlic head 40 g, potatoes (213 g medium, 369 g large), onions.
- Gluten label checks: taco seasoning, chicken broth, Italian sausage, mushroom oyster sauce, Chinese cooking wine,
  BBQ sauce (pulled pork suggestion).

## Check with Sam (decisions made during the rough pass and the 4 Nov build)

- (4 Nov) "Mark cooked" on a cook day now fills in fridge/freezer by itself from the plan (eaten ones taken off,
  ❄️ ones in the freezer). Change them on the batch if they're wrong.
- (4 Nov) Spare containers (e.g. for your girlfriend) are just shown as "spare"; there's no way to plan them for
  someone else. Fine, or do you want a "not me" slot that doesn't count in your calories?
- (4 Nov) Weeks planner: a day swapped to "another dish" gets cooked that Sunday at just that size (e.g. 1 serving
  of chili). To cook a full batch and freeze the rest, open the cook day and enter the bigger amount.
- (4 Nov) "Clear this day" leaves it empty; the next change to that row fills it again. "Leftovers" keeps it.
- (4 Nov) Sized cook days aren't rounded (e.g. ¾ can of beans); the shopping list rounds up to whole cans.
- (4 Nov) Pantry suggestions come from recipe ingredients (spices, oils, spoon amounts, rice/oats). Chicken broth,
  canned tomatoes etc. are left on the list unless he taps "in pantry".
- (4 Nov) Weekends / eating out: leave them empty (the averages only count days with something planned) or add a
  rough quick entry like "Eating out ~1,200". Either works with "trend over precision".
- (4 Nov) The meal bank makes a card for every dish + every starch. With many recipes the strip gets long; a
  filter (Meals / Foods) or hiding cards could come later. Tell me if it's too much.
- (4 Nov) Import: a recipe or food with the same name as one in the app defaults to **Replace** (past batches keep
  their own amounts). "Keep both" and "Skip" are in the same box.
- (4 Nov) Import matching will get some wrong (e.g. "Rice, white, long grain, dry" → parboiled rice; "chicken
  broth" → bouillon cubes). Tap *change* once and the app remembers it.
- (4 Nov) Open Food Facts: a label serving like "4 scoops (333 g)" adds a "scoop" unit (83 g) by itself. Your own
  scoop is 55 g, so edit it in My foods if you use the looked-up version instead of the imported one.
- (4 Nov) Shop's dates start today, so a cook day earlier this week that's still "planned" isn't on the list.

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

- Try on the phone (staging link): the meal bank (tap card → tap slots → Done), − / + on cards, cook days, tapping
  a meal, Import (file picker and paste), Look up a packaged food; plus the older backup via the share sheet, copy
  breakfast/snacks, quick add, "other size…" (can sizes). None of these were tried on the phone yet.
- Rough edges: changing the bought weight in a batch resets hand-edited lines; on the phone a meal can't be moved
  to another day (remove and place again; the PC can drag it); Undo only covers the meals placed in the current
  round.
- Later, maybe: find out why Cloudflare's automatic staging builds never ran (settings look right), so
  `npm run staging` isn't needed.
- Start "My foods" with Sam's usual takeout (ask him which places). Breakfast: Naked Mass chocolate shake, ~150 g
  per breakfast; his scoop = 55 g (so ~3 scoops; label says 333 g ≈ 7 scoops). Easiest now: the RECIPE-IMPORT.md
  example already has it with the 55 g scoop (More → Import), or My foods → + Add a food → Other units. Label: 333 g (about 7 scoops) = 1,360 kcal, 50 g protein, 251 g carbs, 15 g fat; 150 g ≈ 613 kcal,
  22.5 g protein. Sam adds it in My foods and will send his old scoop's weight.

## Ideas (later)

Don't build yet, but don't design them out: prep-ahead list (chop vegetables early), branded foods via the USDA
FoodData Central API, a real iOS app (Capacitor wrap or native; needs Apple's $99/yr account) for Apple Health, a
separate workout app sharing data with this one.

- **Importing more recipes from PDFs/screenshots** (Sam, 21 Oct 2026). No new tool needed for now: Sam drops the
  PDFs or screenshots into a folder (e.g. `data/private/recipes-to-import/`, ignored by git) and asks Claude to
  turn them into the `recipes.json` format; the existing import then recalculates them from USDA with the
  side-by-side check. Build a proper in-app import only if this happens often.


- **Try different breakfasts** (Sam, 7 Nov 2026): compare options by macros and by price against the usual
  banana + shake. Needs prices per item (none in the app yet).

- **Make the app feel calmer** (Sam, 7 Nov 2026: "still feels a little intense, almost too many settings and
  options"). A simplification pass: list every screen, button and setting, agree with Sam what he actually uses, then
  hide or remove the rest. Plan before coding.
- **Fill the pantry** (Sam, 7 Nov 2026): he'll dictate what he has (speech to text); turn it into pantry items so
  they stay off the shopping list.
- **Price out eating / link with Ledger** (Sam, 7 Nov 2026). Thought through 7 Nov, not decided. Ledger already
  has the real totals (Wegmans, Whole Foods → Groceries; takeout → Eating out) but only per trip, not per item, and
  it's Tailscale-only on the home server while this app is public on Cloudflare, so a live link is awkward. Steps,
  cheapest first: (1) read Ledger's Groceries per week/month as it is; (2) here, a "this trip cost $__" box on Shop
  → cost per meal; (3) prices per item, filled by Claude from a receipt photo/screenshot → cost per container and
  the breakfast comparison; (4) only if wanted, Ledger pushes weekly grocery totals to this app's `/api`.

## What's new at the next merge

- Shopping list in pounds and ounces (no grams), rice in cups; pantry things folded into one line at the bottom.
- Plan opens on Month (tabs: Month, Calendar, Weeks).
