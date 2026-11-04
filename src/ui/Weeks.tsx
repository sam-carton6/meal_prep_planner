// Weeks planner (Plan tab, the first view): one card per week, cooked the Sunday before. Pick lunch and dinner and
// Monday–Friday fills in; − / + for servings and the side; tap a day to swap it (another dish, a freezer container,
// takeout or any food, leftovers). The Sunday cook day sizes itself to what the week needs (weeks.ts).

import { useState } from 'react';
import { db } from '../db';
import type { Batch, CalendarEntry, Recipe, Settings, Slot } from '../model';
import { newId, ZERO } from '../model';
import { addDays, dayLabel, parseDate, sumEntries, weekStart } from '../plan';
import { dishEach, typicalBatch } from '../cookdays';
import {
  choiceDraft, cookDayFor, defaultChoice, setRow, stockDraft, syncCookDay, weekdaysOf, weekRow,
  WEEK_SLOTS, type CalendarChange, type Choice, type RowDay,
} from '../weeks';
import { fmtAmount } from '../units';
import { sideStep } from '../recipe-math';
import { AddEntry, Stepper } from './Plan';
import { Macros, Sheet } from './shared';

const SLOT_NAME: Record<Slot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };
const short = (d: string) => parseDate(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const dow = (d: string) => parseDate(d).toLocaleDateString(undefined, { weekday: 'short' });

interface Ctx {
  recipes: Recipe[];
  batches: Batch[];
  settings: Settings;
}

/** One serving of a dish, from its latest cook day or the recipe. */
const eachOf = (c: Ctx, dish: Recipe) => dishEach(typicalBatch(c.batches, dish.id), dish, c.settings.proteinPerMeal);

function draftFor(c: Ctx, choice: Choice) {
  const dish = c.recipes.find((r) => r.id === choice.recipeId)!;
  const side = c.recipes.find((r) => r.id === choice.starch?.recipeId);
  return choiceDraft(choice, dish, side, eachOf(c, dish));
}

/** Change the calendar for a week, then bring its Sunday cook day in step. */
async function run(c: Ctx, monday: string, change: (entries: CalendarEntry[]) => CalendarChange) {
  await db.transaction('rw', db.calendar, db.batches, async () => {
    const ch = change(await db.calendar.toArray());
    await db.calendar.bulkDelete(ch.remove);
    await db.calendar.bulkAdd(ch.add);
    await syncWeek(c, monday);
  });
}

async function syncWeek(c: Ctx, monday: string) {
  const [entries, batches] = await Promise.all([db.calendar.toArray(), db.batches.toArray()]);
  const cc = syncCookDay(monday, entries, batches, c.recipes, c.settings.proteinPerMeal, newId);
  await db.batches.bulkDelete(cc.remove);
  await db.batches.bulkPut([...cc.add, ...cc.update]);
}

export function WeeksView({ today, entries, batches, recipes, settings, onOpenWeek, onPrep }: {
  today: string;
  entries: CalendarEntry[];
  batches: Batch[];
  recipes: Recipe[];
  settings: Settings;
  onOpenWeek: (monday: string) => void;
  onPrep: (date: string) => void;
}) {
  const [count, setCount] = useState(8);
  // From this week, or next week once Friday is over.
  const thisMon = weekStart(today);
  const first = today > addDays(thisMon, 4) ? addDays(thisMon, 7) : thisMon;
  const mondays = Array.from({ length: count }, (_, i) => addDays(first, 7 * i));
  const ctx: Ctx = { recipes, batches, settings };
  const dishes = recipes.filter((r) => r.kind === 'dish').sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="weeks">
      <p className="note">
        Pick lunch and dinner for each week: Monday–Friday fills in and the Sunday before becomes the cook day, sized to
        what you planned. Tap a day to swap it (freezer, takeout, leftovers…).
      </p>
      {dishes.length === 0 && <p className="note warn">No dish recipes yet: add them on the Recipes tab or More → Import.</p>}
      {mondays.map((m) => (
        <WeekCard key={m} monday={m} ctx={ctx} dishes={dishes} entries={entries} onOpenWeek={onOpenWeek} onPrep={onPrep} />
      ))}
      <button onClick={() => setCount(count + 4)}>Show 4 more weeks</button>
    </div>
  );
}

function WeekCard({ monday, ctx, dishes, entries, onOpenWeek, onPrep }: {
  monday: string;
  ctx: Ctx;
  dishes: Recipe[];
  entries: CalendarEntry[];
  onOpenWeek: (monday: string) => void;
  onPrep: (date: string) => void;
}) {
  const sunday = cookDayFor(monday);
  const cooks = ctx.batches.filter((b) => b.cookDate === sunday);
  const days = weekdaysOf(monday);
  const mains = entries.filter((e) => days.includes(e.date) && WEEK_SLOTS.includes(e.slot));
  const t = sumEntries(mains);
  const planned = new Set(mains.map((e) => e.date)).size;
  return (
    <section className="card week-card">
      <div className="week-card-head">
        <b>{short(monday)} – {short(addDays(monday, 4))}</b>
        <button className="link small" onClick={() => onOpenWeek(monday)}>Calendar ›</button>
      </div>
      {WEEK_SLOTS.map((slot) => (
        <RowEditor key={slot} monday={monday} slot={slot} ctx={ctx} dishes={dishes} entries={entries} />
      ))}
      <div className="week-foot">
        {planned > 0 && (
          <div className="note">
            Lunch + dinner ≈ <Macros short n={{ ...ZERO, kcal: t.kcal / planned, protein: t.protein / planned }} /> a day
          </div>
        )}
        <div className="note">
          🍳 {dayLabel(sunday)}:{' '}
          {cooks.length
            ? cooks.map((b) => `${b.recipeName.split(/ [&(]/)[0]} ×${fmtAmount(b.portions)}${b.status === 'cooked' ? ' ✓' : ''}`).join(', ')
            : 'nothing to cook'}
          {cooks.length > 0 && <button className="link small" onClick={() => onPrep(sunday)}> 📋 prep</button>}
        </div>
      </div>
    </section>
  );
}

function RowEditor({ monday, slot, ctx, dishes, entries }: {
  monday: string;
  slot: Slot;
  ctx: Ctx;
  dishes: Recipe[];
  entries: CalendarEntry[];
}) {
  const row = weekRow(entries, monday, slot);
  const [day, setDay] = useState<RowDay | null>(null);
  const main = row.main;
  const dish = ctx.recipes.find((r) => r.id === main?.recipeId);
  const side = ctx.recipes.find((r) => r.id === main?.starch?.recipeId);
  const sides = ctx.recipes.filter((r) => r.kind === 'starch');
  const set = (choice: Choice | null) =>
    run(ctx, monday, (es) => setRow(es, monday, slot, choice, (c) => draftFor(ctx, c), newId));
  const pick = (rid: string) => {
    const d = ctx.recipes.find((r) => r.id === rid);
    set(d ? defaultChoice(d, ctx.recipes, eachOf(ctx, d), ctx.settings.mealKcalAim) : null);
  };
  const each = main && dish ? draftFor(ctx, main).nutrition : undefined;

  return (
    <div className="week-row">
      <div className="week-row-top">
        <span className="slot-label">{SLOT_NAME[slot]}</span>
        <select value={main?.recipeId ?? ''} onChange={(e) => pick(e.target.value)}>
          <option value="">{main ? 'Nothing (clear the week)' : 'Pick a dish…'}</option>
          {dishes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      {main && dish && (
        <div className="week-row-tweak">
          <Stepper
            t={{ key: 'servings', n: main.portions, text: main.portions === 1 ? 'serving' : 'servings', step: 0.25, min: 0.25 }}
            onStep={(d) => set({ ...main, portions: Math.max(0.25, main.portions + d * 0.25) })}
          />
          <select
            value={side?.id ?? ''}
            onChange={(e) => {
              const s = sides.find((x) => x.id === e.target.value);
              if (!s) return set({ ...main, starch: undefined });
              const usual = defaultChoice({ ...dish, serveWith: s.name }, ctx.recipes, eachOf(ctx, dish), ctx.settings.mealKcalAim);
              set({ ...main, starch: usual.starch });
            }}
          >
            <option value="">No side</option>
            {sides.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {side && main.starch && (
            <Stepper
              t={{ key: 'cups', n: main.starch.cups, text: (side.yieldUnit ?? 'cup').replace(/ cooked$/, ''), step: sideStep(side.yieldUnit), min: 0 }}
              onStep={(d) => set({ ...main, starch: { ...main.starch!, cups: Math.max(0, main.starch!.cups + d * sideStep(side.yieldUnit)) } })}
            />
          )}
          {each && <span className="note"><Macros short n={each} /> each</span>}
        </div>
      )}
      <div className="week-days">
        {row.days.map((d) => (
          <button key={d.date} className={`wday ${d.kind}`} onClick={() => setDay(d)} title={d.entries.map((e) => e.label).join(', ')}>
            <span className="wday-name">{dow(d.date)}</span>
            <span className="wday-what">
              {d.eaten ? '✓ ' : ''}
              {d.kind === 'main' ? '●' : d.kind === 'empty' ? '—' : d.entries.map((e) => e.label.split(/ [+(×]/)[0]).join(', ')}
            </span>
          </button>
        ))}
      </div>
      {day && <DaySheet day={day} slot={slot} monday={monday} ctx={ctx} dishes={dishes} main={main} onClose={() => setDay(null)} />}
    </div>
  );
}

/** Swap one day: the week's dish, another dish (cooked Sunday too), a freezer container, any food, or leftovers. */
function DaySheet({ day, slot, monday, ctx, dishes, main, onClose }: {
  day: RowDay;
  slot: Slot;
  monday: string;
  ctx: Ctx;
  dishes: Recipe[];
  main?: Choice;
  onClose: () => void;
}) {
  const [food, setFood] = useState(false);
  const ids = day.entries.map((e) => e.id);
  const put = async (draft: ReturnType<typeof draftFor> | null) => {
    await run(ctx, monday, () => ({
      remove: ids,
      add: draft ? [{ id: newId(), date: day.date, slot, eaten: false, ...draft }] : [],
    }));
    onClose();
  };
  const mainDish = ctx.recipes.find((r) => r.id === main?.recipeId);
  const stock = ctx.batches
    .filter((b) => b.status === 'cooked' && b.freezer + b.fridge > 0 && b.cookDate < day.date)
    .sort((a, b) => b.cookDate.localeCompare(a.cookDate));

  if (food) {
    return <AddEntry date={day.date} slot={slot} replace={ids} onSaved={() => syncWeek(ctx, monday)} onClose={onClose} />;
  }
  return (
    <Sheet title={`${SLOT_NAME[slot]} · ${dayLabel(day.date)}`} onClose={onClose}>
      <p>
        Now: <b>{day.entries.length ? day.entries.map((e) => e.label).join(', ') : 'nothing'}</b>
        {day.eaten && <span className="note"> (eaten)</span>}
      </p>
      {day.eaten && <p className="note">Already eaten: tap it in the calendar view to change it.</p>}
      {!day.eaten && (
        <>
          {main && mainDish && day.kind !== 'main' && (
            <button className="primary block-btn" onClick={() => put(draftFor(ctx, main))}>Back to {mainDish.name}</button>
          )}
          {stock.length > 0 && (
            <>
              <h3>From the freezer or fridge</h3>
              <ul className="results">
                {stock.map((b) => {
                  const r = ctx.recipes.find((x) => x.id === b.recipeId);
                  return (
                    <li key={b.id}>
                      <button onClick={() => put(stockDraft(b, r, r ? eachOf(ctx, r) : ZERO))}>
                        <span className="name">{b.recipeName}</span>
                        <span className="meta">❄️ {b.freezer} · 🧊 {b.fridge} · cooked {dayLabel(b.cookDate)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <h3>Takeout, frozen pizza, anything else</h3>
          <button className="block-btn" onClick={() => setFood(true)}>Find a food or quick add…</button>
          <button className="block-btn" onClick={() => put({ label: 'Leftovers', nutrition: ZERO, source: { kind: 'quick' } })}>
            Leftovers (not counted)
          </button>
          <h3>Another dish, cooked Sunday too</h3>
          <ul className="results">
            {dishes.filter((d) => d.id !== main?.recipeId).map((d) => (
              <li key={d.id}>
                <button onClick={() => put(draftFor(ctx, defaultChoice(d, ctx.recipes, eachOf(ctx, d), ctx.settings.mealKcalAim)))}>
                  <span className="name">{d.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {day.entries.length > 0 && (
            <button className="link danger" onClick={() => put(null)}>Clear this day</button>
          )}
        </>
      )}
    </Sheet>
  );
}

