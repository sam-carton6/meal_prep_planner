// The on-phone database (IndexedDB via Dexie). Data lives only on this device: use Backup to keep a copy.

import Dexie, { type EntityTable } from 'dexie';
import type { Batch, CalendarEntry, CustomFood, GroceryChecks, Recipe, Settings } from './model';
import { DEFAULT_SETTINGS } from './model';

export const db = new Dexie('meal-prep-planner') as Dexie & {
  recipes: EntityTable<Recipe, 'id'>;
  batches: EntityTable<Batch, 'id'>;
  customFoods: EntityTable<CustomFood, 'id'>;
  calendar: EntityTable<CalendarEntry, 'id'>;
  settings: EntityTable<Settings, 'id'>;
  groceryChecks: EntityTable<GroceryChecks, 'id'>;
};

// Version 1 of the stored layout. Later changes add a db.version(2) with an upgrade step; never edit this one.
db.version(1).stores({
  recipes: 'id, name, kind',
  batches: 'id, recipeId, status, cookDate',
  customFoods: 'id, name, place',
  calendar: 'id, date, [date+slot]',
  settings: 'id',
  groceryChecks: 'id',
});

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await db.settings.get('settings')) ?? {}) };
}

export const TABLES = ['recipes', 'batches', 'customFoods', 'calendar', 'settings', 'groceryChecks'] as const;

/** Everything in one plain object, for the backup file. */
export async function exportAll() {
  const out: Record<string, unknown> = { app: 'meal-prep-planner', format: 1, exportedAt: new Date().toISOString() };
  for (const t of TABLES) out[t] = await db.table(t).toArray();
  return out;
}

/** Replace everything with a backup file's contents. */
export async function importAll(data: Record<string, unknown>) {
  if (data.app !== 'meal-prep-planner') throw new Error("This doesn't look like a Meal Prep Planner backup.");
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      const rows = data[t];
      if (Array.isArray(rows)) await db.table(t).bulkPut(rows);
    }
  });
}
