# Meal Prep Planner — to do

Only what's still open. Finished work goes to [DONE.md](DONE.md) with the date and commit. Ideas Sam mentions go
under *Ideas (later)*; ask before building one.

## Where things stand (keep this current, a few lines)

**Live on `main`:** nothing yet: just the brief and `recipes.json`.
**On `staging`, not live yet:** step 1: the app shell (installable, works offline) with search over 6,291 USDA
ingredients (trimmed and de-duplicated) and a detail page (per 100 g, oz, lb and USDA household portions). Tested in the PC browser only.
**Next up:** Sam connects the repo in Cloudflare (Workers) so he can try it on his phone, then step 2 (recipes that scale).

## To do

Version 1, in the brief's order, each step testable on the phone:
2. Recipes that scale from the main ingredient's weight; portions from the protein target; cooked weight.
3. Starches and meals (dish + starch per container).
4. Calendar: breakfast/lunch/dinner/snacks, daily totals, weekly averages.
5. Fridge/freezer stock and "what to cook when".
6. Grocery list for the planning period.
7. Import `recipes.json`; start "My foods" with Sam's usual takeout (ask him which places).

Also: once Cloudflare is connected, fill the links into CLAUDE.md and README.
At import (step 7): USDA has two chicken thigh values (Foundation 149 kcal/100 g vs SR Legacy ~121, which Sam's
saved recipe matches); ask Sam which to use.

## Ideas (later)

Don't build yet, but don't design them out: prep-ahead list (chop vegetables early), branded foods via the USDA
FoodData Central API, a real iOS app (Capacitor wrap or native; needs Apple's $99/yr account) for Apple Health, a
separate workout app sharing data with this one.

## What's new at the next merge

- Search the built-in USDA ingredient list (works offline) and see calories and protein per 100 g, per oz/lb and
  per household portion ("1 medium carrot"). About 6,300 ingredients, without duplicates, baby food, fast food
  or brand names.
