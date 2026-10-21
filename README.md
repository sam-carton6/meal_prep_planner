# Meal Prep Planner

A personal recipe, meal prep and calorie tracking app: log batch recipes, split them into portions, and see
calories and protein per portion, planned on a calendar. A web app (PWA) installed to the iPhone home screen.

**Status:** step 1 of version 1 — searchable USDA ingredient list, works offline. The plan is in
[PROJECT_BRIEF.md](PROJECT_BRIEF.md).

## Run it

Needs Node.js. In this folder:

- `npm install` — once, to fetch the toolkit
- `npm run dev` — open the app at http://localhost:5173 while working on it
- `npm test` — run the maths/logic tests
- `npm run build` then `npm run preview` — try the finished, installable version at http://localhost:4173

Rebuilding the ingredient list (only when USDA publishes a new release): see the top of
[scripts/build-usda.mjs](scripts/build-usda.mjs), then `npm run usda`.

## Where it runs

- `main` = the version Sam is happy with: https://meal-prep-planner.samcarton6.workers.dev (Cloudflare; on the
  iPhone: Safari → Share → Add to Home Screen)
- `staging` = work in progress, with a Cloudflare preview link per push

## Notes

How this project is run day to day: [CLAUDE.md](CLAUDE.md), [TODO.md](TODO.md), [BUGS.md](BUGS.md).
