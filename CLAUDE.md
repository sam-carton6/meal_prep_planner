# Meal Prep Planner — notes for Claude

Sam's personal recipe, meal prep and calorie tracking app, for his own use first; the end goal is an iPhone app that
replaces commercial apps he isn't happy with. Sam's general rules are in `~/.claude/CLAUDE.md` (master copy:
`Projects/_Project Kit/global-CLAUDE.md`); this file adds what's specific to this project and wins where they differ.

Notes: [PROJECT_BRIEF.md](PROJECT_BRIEF.md) (what to build: version 1, later, how Sam wants to work; read it before
planning anything), [BUGS.md](BUGS.md) (Sam's inbox, read every chat), [TODO.md](TODO.md) (open work; read *Where
things stand* every chat), [DONE.md](DONE.md) (the archive).

## Where it runs
- **Kind:** not decided yet. The brief leans native SwiftUI on the iPhone (Apple Health only works natively), which
  needs Sam's MacBook and Xcode. Decide with Sam before any code.
- **Live:** nothing yet. Planned: Sam's iPhone, installed from Xcode.
- **Repo:** GitHub `sam-carton6/meal_prep_planner` (public on purpose: no sensitive data; Sam, 20 Oct 2026). Keep it that way unless he says otherwise. Main copy on the tower:
  `D:\Users\Sam\Documents\Projects\Meal Prep Planner`; once it's an iOS app, the work happens on the Mac and the tower
  pulls.

## Branches
`main` = the version Sam is happy with, `staging` = all work. Merge `staging` → `main` only when Sam says "merge".

## Checking work
<Fill in once the platform is picked: e.g. build + run the tests in Xcode, then try it on the phone.>

## Stack
<Not picked yet. See PROJECT_BRIEF.md *Technical decisions to make with me before coding*.>

## Data
- `recipes.json` = Sam's existing recipes, the import source for version 1.
- Storage is local on the device, with export to a file so data is never locked in (brief). Keep the data model
  (ingredients, recipes, recipe items, portions, sides, log entries) clean and documented: the later food log and a
  separate workout app build on it.

## Decisions so far
- Plan before coding: propose the architecture and data model and ask first (brief, Oct 2026).
