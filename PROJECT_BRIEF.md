# Meal Prep App — Project Brief

## What this is
A personal calorie tracker and meal prep planner in one: the strange love child of a calorie tracking app and a
meal prepping app. The whole point is to **track my eating** and to **plan my calories ahead of time in the form of
meal prep**. Planning the calendar decides which meals I need, and that gives rise to the recipes, portions,
cooking days and shopping lists.

For my own use first, replacing commercial apps I'm not happy with. It's a web app I install on my iPhone home
screen (a PWA). A real iOS app may come later (e.g. by wrapping the web app with Capacitor), only if I decide to pay
for Apple's developer account.

## Who it's for and how I use it
- Once a month or every couple of months I sit down and plan: what I'll eat and when, when I'll cook, and one
  shopping trip.
- **Every day has breakfast, lunch, dinner and snacks.** Breakfast and snacks are pretty consistent; lunch and
  dinner are mostly meal prep containers.
- **A meal prep container = a protein dish + a starch.** Usually one beef dish, one chicken dish, and a sausage or
  other pre-prepared meat dish. Starches (rice, pasta, potatoes) are their own items, added per container as a
  calorie base. Vegetables go in the dish, and I'd like the app to help me eat more of them.
- **Protein sets the size of the batch.** Packs vary (chicken family packs are about 3–3.5 lb, ground beef is
  usually 1 lb packs but the butcher might give me 1.5 lb), so I enter what I actually bought and the recipe scales.
  Things in fixed sizes (cans) round to whole units. I don't care about 0.1 oz.
- **Targets:** about 40 g protein per meal, 600–900 calories per meal, 2,000–3,000 per day. Not strict per meal:
  I mostly care about the **weekly average**.
- Sometimes I weigh the whole cooked pot (minus the pot) and split it by my protein target to get servings and a
  weight per container.
- Some containers go in the fridge with rice, some in the freezer without it; when I eat a frozen one I need to know
  how much rice to cook.
- Extras happen: ice cream, takeout. I want my own growing list of these ("My foods"), starting with a few places I
  go, adding things as I look them up.
- Sometimes I start from the store: "I bought 3 lb of chicken, I want this recipe, what else do I need?"

## Version 1 (build in this order, each step testable on my phone)
1. **Ingredient database:** USDA FoodData Central SR Legacy + Foundation Foods built into the app (~8,000 generic
   ingredients): calories, protein, carbs, fat per 100 g, food group, and common portions (cup, medium, can...).
2. **Recipes that scale:** pick ingredients, enter amounts in normal units (lb, oz, cups, cans, "5 medium carrots").
   One main ingredient (usually the protein) drives the size; enter what I bought and everything else scales.
   Portions come from the protein target; optional cooked weight gives a weight per container.
3. **Starches and meals:** starches as their own items (e.g. "4 cups dry rice" → per cup cooked); a meal = dish +
   starch per container, with the app suggesting how much starch to reach my calories.
4. **Calendar:** breakfast, lunch, dinner and snacks on each day; put meals and extras on days; daily totals and
   weekly averages for calories and protein (and vegetables).
5. **Fridge/freezer and cook list:** what's in stock, and what to cook when (including "cook rice for the frozen
   chili") based on the calendar.
6. **Grocery list:** one combined list for the planning period, with checkboxes, pantry staples hidden, grouped by
   aisle.
7. **Import:** my existing recipes from `recipes.json` (recalculated from USDA with a side-by-side check), and
   "My foods" started with my usual takeout.

## Later (do not build yet, but don't design them out)
- Prep-ahead list (e.g. chop vegetables in advance).
- Branded/packaged foods via the USDA FoodData Central API (free key from api.data.gov), looked up online.
- A real iOS app (Capacitor wrap or native), which is what Apple Health needs: write calories eaten, read calories
  burned and bodyweight.
- A separate workout tracking app (4-day split, importing Strong CSV history) that shares data with this one.

## Technical decisions (made 20 Oct 2026)
- **Platform:** PWA (web app installed to the home screen, works offline). Hosted on Cloudflare Pages.
- **Storage:** on the phone, with export/import to a file so data is never locked in.
- Keep the data model clean and documented (foods, recipes, recipe items, batches, containers, calendar entries) so
  later features and the workout app can build on it.

## How I want to work
- Plan before coding. Propose the architecture and data model and ask me questions first.
- Build in small steps I can test on my phone, one feature at a time.
- Explain decisions in plain language. I'm not a professional developer.
