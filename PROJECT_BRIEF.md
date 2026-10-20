# Meal Prep App — Project Brief

## What this is
A personal recipe, meal prep and calorie tracking app. The end goal is an iPhone app. It replaces commercial apps I'm not happy with. This is for my own use first.

## Who it's for and how I use it
- I batch cook about once a month: plan recipes, shop once, cook, portion, freeze.
- I log each recipe with its ingredients, then split the batch into portions.
- Targets: 600–900 calories per meal, 2,000–3,000 per day, about 40g protein per meal.
- I often cook a protein/vegetable base and add rice separately, so sides need to be their own items.

## Version 1 (build this first, keep it small)
1. **Ingredient database**: bundle USDA FoodData Central SR Legacy + Foundation Foods (generic ingredients, ~8,000 items). Store name, calories, protein, carbs, fat per 100 g, plus common portion sizes (cup, medium, can, etc.).
2. **Recipes**: add a recipe by picking ingredients and entering amounts in normal units (lb, oz, cups, cans, "5 medium carrots"). The app calculates batch totals for calories and protein.
3. **Portions**: set the number of portions and see per-portion calories and protein. Optionally enter the cooked batch weight (minus the pot) to get a target weight per portion in grams/oz.
4. **Scaling**: change portions or ingredient amounts and everything recalculates.
5. **Sides**: items like rice logged separately (e.g., "4 cups dry rice"), with per-cup cooked values.
6. **Grocery list**: select recipes for a planning period and get one combined shopping list.
7. **Import**: load my existing recipes from `recipes.json` in this repo.

## Later (do not build yet, but don't design them out)
- Daily food log: tap "ate 1 portion of chili," plus one-off foods.
- Meal planning calendar.
- Branded/packaged foods via the USDA FoodData Central API (free key from api.data.gov), looked up online instead of bundled.
- Apple Health integration: write calories eaten, read calories burned and bodyweight.
- A separate workout tracking app (4-day split, importing Strong CSV history) that shares data with this one through Apple Health.

## Technical decisions to make with me before coding
- **Platform**: native SwiftUI iPhone app vs a web app first. Lean native if I have a Mac with Xcode, since iPhone is the goal and Apple Health only works natively.
- **Storage**: local on-device storage, with export to a file so data is never locked in.
- Keep the data model clean and documented (ingredients, recipes, recipe items, portions, sides, log entries) so later features and the workout app can build on it.

## How I want to work
- Plan before coding. Propose the architecture and data model and ask me questions first.
- Build in small steps I can test on my phone, one feature at a time.
- Explain decisions in plain language. I'm not a professional developer.
