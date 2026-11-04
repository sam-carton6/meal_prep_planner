// Repeat a week: copy 7 days of the plan (meals and cook days) to the next N weeks, for planning 1–3 months in
// one sitting. Only empty slots are filled, so anything already planned in those weeks stays as it is, and a
// recipe that already has a cook day in a target week doesn't get a second one. Copies are always planned (not
// eaten, not cooked); planned meals find their cook day the usual way (cookdays.ts).

import type { Batch, CalendarEntry } from './model';
import { addDays } from './plan';

export interface RepeatResult {
  entries: CalendarEntry[];
  batches: Batch[];
  /** Slots (date + meal) in the target weeks that already had something, so were left alone. */
  skippedSlots: number;
  /** Cook days not copied because that recipe already has one in that week. */
  skippedCooks: number;
}

const inBlock = (d: string, start: string) => d >= start && d <= addDays(start, 6);

/** A fresh planned copy of an entry's source: no batch pin (old pinned entries point at their recipe instead). */
function freshSource(e: CalendarEntry, batchById: Map<string, Batch>): CalendarEntry['source'] {
  const s = e.source;
  if (s.kind === 'dish') {
    const { batchId: _pin, ...rest } = s;
    return rest;
  }
  if (s.kind === 'batch') {
    const b = batchById.get(s.batchId);
    if (!b) return s;
    return { kind: 'dish', recipeId: b.recipeId, portions: s.portions, ...(s.starch ? { starch: { recipeId: s.starch.recipeId, cups: s.starch.cups } } : {}) };
  }
  return s;
}

/** Copy the 7 days from `start` to each of the next `weeks` weeks. */
export function repeatWeek(
  entries: CalendarEntry[],
  batches: Batch[],
  start: string,
  weeks: number,
  newId: () => string,
  now = new Date().toISOString(),
): RepeatResult {
  const out: RepeatResult = { entries: [], batches: [], skippedSlots: 0, skippedCooks: 0 };
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const filled = new Set(entries.map((e) => `${e.date}|${e.slot}`));
  const cooks = new Set(batches.map((b) => `${b.cookDate}|${b.recipeId}`));
  const srcEntries = entries.filter((e) => inBlock(e.date, start));
  const srcSlots = [...new Set(srcEntries.map((e) => `${e.date}|${e.slot}`))];
  const srcBatches = batches.filter((b) => inBlock(b.cookDate, start));

  for (let k = 1; k <= weeks; k++) {
    const off = 7 * k;
    const block = addDays(start, off);
    for (const key of srcSlots) {
      const [date, slot] = key.split('|');
      const to = addDays(date, off);
      if (filled.has(`${to}|${slot}`)) {
        out.skippedSlots++;
        continue;
      }
      for (const e of srcEntries.filter((x) => x.date === date && x.slot === slot)) {
        out.entries.push({ ...e, id: newId(), date: to, eaten: false, source: freshSource(e, batchById) });
      }
    }
    for (const b of srcBatches) {
      const to = addDays(b.cookDate, off);
      const already = [...cooks].some((c) => {
        const [d, rid] = c.split('|');
        return rid === b.recipeId && inBlock(d, block);
      });
      if (already) {
        out.skippedCooks++;
        continue;
      }
      const { cookedWeightG: _w, ...rest } = b;
      out.batches.push({ ...rest, id: newId(), cookDate: to, status: 'planned', fridge: 0, freezer: 0, createdAt: now, items: b.items.map((i) => ({ ...i })) });
    }
  }
  return out;
}

/**
 * Where the 7 days to repeat should start, for the week shown (its Monday): the first cook day from the Sunday
 * before through Saturday, so a "cook Sunday, eat Monday–Friday" routine is copied as one piece; else Monday.
 */
export function repeatStart(monday: string, batches: Batch[]): string {
  for (let i = -1; i <= 5; i++) {
    const d = addDays(monday, i);
    if (batches.some((b) => b.cookDate === d)) return d;
  }
  return monday;
}
