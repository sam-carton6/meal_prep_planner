# Getting recipes and foods into the app

Build up recipes and packaged foods anywhere (a claude.ai chat, your phone), save them as one `.json` file, then
either import the file in the app (More → Import) or drop it in this folder and ask Claude Code to add them.
The app matches each ingredient to USDA and works out the calories itself, so recipes don't need nutrition numbers.

## Prompt to paste into a claude.ai chat

Copy everything in the box, then add your recipes (links, photos of recipe cards, screenshots, or just typed out)
and nutrition-label photos underneath.

```text
Convert the recipes and nutrition labels I give you into ONE JSON file for my meal prep app, in exactly this
format (format "meal-prep-planner/1"). Reply with only the JSON in a code block, then a short list of anything
you had to guess.

{
  "format": "meal-prep-planner/1",
  "recipes": [
    {
      "name": "Sweet Potato Beef Chili",
      "kind": "dish",
      "servings": 8,
      "main_ingredient": "Ground beef 85/15, raw",
      "serve_with": null,
      "ingredients": [
        { "name": "Ground beef 85/15, raw", "amount": 3, "unit": "lb" },
        { "name": "Sweet potatoes, raw", "amount": 1.75, "unit": "lb" },
        { "name": "Kidney beans, canned", "amount": 1, "unit": "can (15 oz)", "drained": true },
        { "name": "Onion, raw", "amount": 1, "unit": "medium" },
        { "name": "Chili powder", "amount": 2, "unit": "tbsp" },
        { "name": "Seasonings", "amount": null, "unit": "to taste" },
        { "name": "Cheddar cheese, shredded", "amount": 1, "unit": "cup", "optional": true }
      ],
      "notes": "Brown the beef first. Simmer 45 min.",
      "source": "https://example.com/chili"
    },
    {
      "name": "White rice",
      "kind": "starch",
      "servings": null,
      "main_ingredient": "Rice, white, long grain, dry",
      "ingredients": [ { "name": "Rice, white, long grain, dry", "amount": 4, "unit": "cup" } ],
      "yield": { "amount": 12, "unit": "cup cooked" }
    }
  ],
  "foods": [
    {
      "name": "Naked Mass, chocolate",
      "brand": "Naked Nutrition",
      "place": null,
      "serving": "1 serving (about 7 scoops)",
      "serving_grams": 333,
      "kcal": 1360, "protein_g": 50, "carbs_g": 251, "fat_g": 15,
      "units": [ { "unit": "scoop", "grams": 55 } ]
    },
    {
      "name": "Chicken burrito bowl",
      "brand": null,
      "place": "Chipotle",
      "serving": "1 bowl",
      "serving_grams": null,
      "kcal": 1050, "protein_g": 60, "carbs_g": 95, "fat_g": 40,
      "units": []
    }
  ]
}

Rules:
- recipes = things I cook. foods = packaged foods (from a nutrition label) and restaurant/takeout items.
- kind: "dish" for a main (protein + vegetables, eaten as a container), "starch" for rice/pasta/potatoes cooked
  on the side (give "yield": what the dry amount makes, e.g. cups cooked).
- Ingredient names: plain grocery names a USDA database would use, in the state I buy them ("Chicken thighs,
  boneless skinless, raw", "Carrots, raw", "Black beans, canned"). No brand names in recipes.
- Units: lb, oz, g, cup, tbsp, tsp, medium/large/small, whole, clove, head, or "can (15 oz)" style with the size
  in brackets. amount null + unit "to taste" for salt, pepper, seasonings.
- main_ingredient: the ingredient that sets the batch size (usually the protein), written exactly as in the list.
- "drained": true/false only for canned beans/vegetables when the recipe says so. "optional": true for toppings.
- servings: how many containers I make from these amounts (the app scales it when I buy more or less).
- serve_with: for a dish eaten with a side, the side's recipe name exactly (e.g. "White rice"); else null.
- foods: copy label numbers exactly, per the label's serving; serving_grams from the label; extra "units" only if
  I tell you (e.g. my scoop). Restaurant items: use the restaurant's published nutrition if you know it,
  otherwise say it's an estimate.
- Don't invent nutrition numbers for recipes; the app calculates them.
```

## Short prompt: just nutrition labels

For one or a few packaged foods. Paste this into a claude.ai chat, attach photos of each label (the Nutrition
Facts panel; the front of the package helps with the name), send, then copy the reply into More → Import recipes &
foods (paste the whole reply) → Check it → Save these.

```text
Read the nutrition label(s) in my photos and reply with only this JSON in a code block (format
"meal-prep-planner/1"), one entry in "foods" per product, then a short list of anything you couldn't read:

{
  "format": "meal-prep-planner/1",
  "foods": [
    {
      "name": "Greek yogurt, plain, nonfat",
      "brand": "Fage",
      "place": null,
      "serving": "1 container (170 g)",
      "serving_grams": 170,
      "kcal": 90, "protein_g": 18, "carbs_g": 5, "fat_g": 0,
      "units": []
    }
  ]
}

Rules:
- Copy the numbers exactly as printed for ONE serving (the "per serving" column, not "per container").
- "serving": the serving size as printed. "serving_grams": its weight in grams if printed (or ml for drinks);
  null if the label gives no weight.
- "name": what it is, plain words (no brand); "brand": the brand on the package.
- "units": leave empty unless I tell you one (e.g. my scoop is 55 g → { "unit": "scoop", "grams": 55 }).
- Don't guess numbers you can't read: say so in the list after the JSON.
```

## Editing your recipes with an AI chat

Your recipes live in `data/meals.json` (this format) and are backed up on GitHub. To change one, e.g. swap chicken
breast for thighs in the quesadillas: paste the file (or just that recipe) into a chat and say what to change, then
paste the reply to Claude Code. It updates the file, rebuilds the recipe book (`npm run book`, served at
`/recipe-book.html` on the app's links) and pushes. Then More → Import recipes & foods → Replace brings the change
into the app (past cook days keep their own amounts).

## Sending them to Claude Code instead

Put the `.json` file (or the PDFs/screenshots themselves) in `data/private/to-import/` in this project and say
"import the new recipes". That folder is not uploaded to GitHub.
