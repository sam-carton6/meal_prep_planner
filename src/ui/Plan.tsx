// Plan tab: the calendar. Week view (each day: breakfast, lunch, dinner, snacks) or a month overview.
// Entries are meal prep containers (a batch portion, optionally with starch) or any food; each keeps a copy of
// its nutrition. Ticking an entry as eaten takes a container out of the fridge (or freezer).

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import type { Batch, CalendarEntry, Nutrition, Recipe, Slot } from '../model';
import { DEFAULT_SETTINGS, newId, SLOTS } from '../model';
import {
  addDays,
  addMonths,
  dayLabel,
  isoDate,
  monthLabel,
  monthStart,
  monthWeeks,
  portionsUsed,
  sumEntries,
  weekAverage,
  weekDays,
  weekStart,
} from '../plan';
import { add, batchSummary, perYieldUnit, starchToReach, times } from '../recipe-math';
import { fmtAmount } from '../units';
import { customAsPicked, FoodPicker, Macros, Num, r0, Sheet, useUnitsFor, type PickedFood } from './shared';

const SLOT_NAMES: Record<Slot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

type View = 'week' | 'month';

export function PlanTab() {
  const today = isoDate(new Date());
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem('planView') as View) || 'week';
    } catch {
      return 'week';
    }
  });
  const [start, setStart] = useState(weekStart(today)); // week view: its Monday
  const [month, setMonth] = useState(monthStart(today)); // month view: its 1st
  const [adding, setAdding] = useState<{ date: string; slot: Slot } | null>(null);
  const [copying, setCopying] = useState(false);
  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;

  const weeks = monthWeeks(month);
  const days = weekDays(start);
  const [from, to] = view === 'week' ? [days[0], days[6]] : [weeks[0][0], weeks[weeks.length - 1][6]];
  const entries = useLiveQuery(() => db.calendar.where('date').between(from, to, true, true).toArray(), [from, to]) ?? [];

  const switchView = (v: View) => {
    setView(v);
    if (v === 'month') setMonth(monthStart(start));
    try {
      localStorage.setItem('planView', v);
    } catch {
      /* private mode: fine */
    }
  };
  const openWeek = (d: string) => {
    setStart(weekStart(d));
    switchView('week');
  };

  // Average over what's shown: the week, or this month's days (not the grid's spill-over days).
  const shown = view === 'week' ? entries : entries.filter((e) => e.date.startsWith(month.slice(0, 7)));
  const avg = weekAverage(shown);
  const avgClass = !avg.days ? '' : avg.perDay.kcal < settings.dayKcalMin || avg.perDay.kcal > settings.dayKcalMax ? 'off' : 'ok';
  const step = (n: number) => (view === 'week' ? setStart(addDays(start, 7 * n)) : setMonth(addMonths(month, n)));

  return (
    <main className="wide">
      <header>
        <div className="seg">
          <button className={view === 'week' ? 'on' : ''} onClick={() => switchView('week')}>
            Week
          </button>
          <button className={view === 'month' ? 'on' : ''} onClick={() => switchView('month')}>
            Month
          </button>
        </div>
        <div className="row spread">
          <button className="link" onClick={() => step(-1)}>‹ Prev</button>
          <h1 className="week-title">{view === 'week' ? `${dayLabel(days[0])} – ${dayLabel(days[6])}` : monthLabel(month)}</h1>
          <button className="link" onClick={() => step(1)}>Next ›</button>
        </div>
        <div className={`week-avg ${avgClass}`}>
          {view === 'week' ? 'Week' : 'Month'} average ({avg.days} day{avg.days === 1 ? '' : 's'} planned):{' '}
          <Macros short n={avg.perDay} /> per day · target {r0(settings.dayKcalMin)}–{r0(settings.dayKcalMax)}
        </div>
      </header>

      {view === 'month' && (
        <MonthGrid weeks={weeks} month={month} today={today} entries={entries} settings={settings} onPickDay={openWeek} />
      )}

      {view === 'week' && <div className="week-grid">{days.map((d) => {
        const dayEntries = entries.filter((e) => e.date === d);
        const t = sumEntries(dayEntries);
        return (
          <section key={d} className={`day ${d === today ? 'today' : ''}`}>
            <div className="day-head">
              <b>{dayLabel(d)}</b>
              <span className="note">
                {r0(t.kcal)} kcal · {r0(t.protein)} g protein
              </span>
            </div>
            {SLOTS.map((slot) => (
              <div key={slot} className="slot">
                <div className="slot-name">{SLOT_NAMES[slot]}</div>
                <div className="slot-entries">
                  {dayEntries
                    .filter((e) => e.slot === slot)
                    .map((e) => (
                      <EntryChip key={e.id} entry={e} />
                    ))}
                  <button className="add" onClick={() => setAdding({ date: d, slot })}>+</button>
                </div>
              </div>
            ))}
          </section>
        );
      })}</div>}

      {view === 'week' && <button onClick={() => setCopying(true)}>Copy a day's breakfast & snacks to other days…</button>}

      {adding && <AddEntry date={adding.date} slot={adding.slot} onClose={() => setAdding(null)} />}
      {copying && <CopyRoutine days={days} onClose={() => setCopying(false)} />}
    </main>
  );
}

/** Month overview: each day's calories and its lunch/dinner. Tap a day to plan that week. */
function MonthGrid({ weeks, month, today, entries, settings, onPickDay }: {
  weeks: string[][];
  month: string;
  today: string;
  entries: CalendarEntry[];
  settings: typeof DEFAULT_SETTINGS;
  onPickDay: (d: string) => void;
}) {
  const inMonth = month.slice(0, 7);
  return (
    <div className="month">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
        <div key={d} className="month-dow">{d}</div>
      ))}
      {weeks.flat().map((d) => {
        const dayEntries = entries.filter((e) => e.date === d);
        const t = sumEntries(dayEntries);
        const meals = dayEntries.filter((e) => e.slot === 'lunch' || e.slot === 'dinner');
        const level = t.kcal < settings.dayKcalMin ? 'low' : t.kcal > settings.dayKcalMax ? 'high' : 'ok';
        return (
          <button
            key={d}
            className={`month-day ${d.startsWith(inMonth) ? '' : 'other'} ${d === today ? 'today' : ''}`}
            onClick={() => onPickDay(d)}
          >
            <span className="month-num">{Number(d.slice(8))}</span>
            {dayEntries.length > 0 && (
              <>
                <span className={`month-kcal ${level}`}>{r0(t.kcal)}</span>
                <span className="month-p">{r0(t.protein)} g</span>
                <span className="month-meals">
                  {meals.map((e) => (
                    <span key={e.id}>{e.label.split(' + ')[0]}</span>
                  ))}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function EntryChip({ entry }: { entry: CalendarEntry }) {
  const toggleEaten = async () => {
    const eaten = !entry.eaten;
    await db.transaction('rw', db.calendar, db.batches, async () => {
      await db.calendar.update(entry.id, { eaten });
      // Eating a container takes it out of stock (fridge first); un-ticking puts it back in the fridge.
      if (entry.source.kind === 'batch') {
        const b = await db.batches.get(entry.source.batchId);
        if (b && b.status === 'cooked') {
          let { fridge, freezer } = b;
          for (let i = 0; i < entry.source.portions; i++) {
            if (eaten) {
              if (fridge > 0) fridge--;
              else if (freezer > 0) freezer--;
            } else fridge++;
          }
          await db.batches.update(b.id, { fridge, freezer });
        }
      }
    });
  };
  return (
    <div className={`chip ${entry.eaten ? 'eaten' : ''}`}>
      <button className="chip-main" onClick={toggleEaten} title="Tap to mark eaten">
        {entry.eaten ? '✓ ' : ''}
        {entry.label}
        <span className="chip-n">
          {r0(entry.nutrition.kcal)} kcal · {r0(entry.nutrition.protein)} g
        </span>
      </button>
      <button className="chip-x" onClick={() => db.calendar.delete(entry.id)} aria-label="Remove">
        ×
      </button>
    </div>
  );
}

type Mode = 'prep' | 'food' | 'quick';

function AddEntry({ date, slot, onClose }: { date: string; slot: Slot; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>(slot === 'lunch' || slot === 'dinner' ? 'prep' : 'food');
  const save = async (e: Omit<CalendarEntry, 'id' | 'date' | 'slot' | 'eaten'>) => {
    await db.calendar.add({ id: newId(), date, slot, eaten: false, ...e });
    onClose();
  };
  return (
    <Sheet title={`${SLOT_NAMES[slot]} · ${dayLabel(date)}`} onClose={onClose}>
      <Recent slot={slot} onSave={save} />
      <div className="seg">
        {(['prep', 'food', 'quick'] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {m === 'prep' ? 'Meal prep' : m === 'food' ? 'Food' : 'Quick add'}
          </button>
        ))}
      </div>
      {mode === 'prep' && <AddPrep onSave={save} />}
      {mode === 'food' && <AddFood onSave={save} onCancel={onClose} />}
      {mode === 'quick' && <AddQuick onSave={save} />}
    </Sheet>
  );
}

type SaveFn = (e: Omit<CalendarEntry, 'id' | 'date' | 'slot' | 'eaten'>) => Promise<void>;

/** One-tap repeats: what was in this slot before (breakfast and snacks are usually the same). */
function Recent({ slot, onSave }: { slot: Slot; onSave: SaveFn }) {
  const recent = useLiveQuery(async () => {
    const all = await db.calendar.orderBy('date').reverse().filter((e) => e.slot === slot).limit(60).toArray();
    const seen = new Set<string>();
    return all.filter((e) => (seen.has(e.label) ? false : (seen.add(e.label), true))).slice(0, 6);
  }, [slot]);
  if (!recent?.length) return null;
  return (
    <div className="recent">
      <div className="note">Recent {SLOT_NAMES[slot].toLowerCase()}</div>
      {recent.map((e) => (
        <button key={e.id} onClick={() => onSave({ label: e.label, nutrition: e.nutrition, source: e.source })}>
          {e.label}
          <span className="chip-n">
            {r0(e.nutrition.kcal)} kcal · {r0(e.nutrition.protein)} g
          </span>
        </button>
      ))}
    </div>
  );
}

function AddPrep({ onSave }: { onSave: SaveFn }) {
  const batches = useLiveQuery(() => db.batches.toArray(), []) ?? [];
  const entries = useLiveQuery(() => db.calendar.toArray(), []) ?? [];
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
  const [batch, setBatch] = useState<Batch | null>(null);
  const [starchId, setStarchId] = useState<string | null>(null);
  const [cups, setCups] = useState<number | null>(null);

  const dishBatches = batches.filter((b) => recipes.find((r) => r.id === b.recipeId)?.kind !== 'starch');
  const starches = recipes.filter((r) => r.kind === 'starch');
  const left = (b: Batch) => b.portions - portionsUsed(b.id, entries);
  const starch: Recipe | undefined = starches.find((s) => s.id === starchId);

  if (!batch) {
    return (
      <>
        {dishBatches.length === 0 && <p className="note">No batches yet. Plan one from a recipe (Cook or Recipes tab).</p>}
        <ul className="results">
          {dishBatches
            .sort((a, b) => left(b) - left(a))
            .map((b) => (
              <li key={b.id}>
                <button onClick={() => setBatch(b)}>
                  <span className="name">{b.recipeName}</span>
                  <span className="meta">
                    {b.status === 'planned' ? `planned ${dayLabel(b.cookDate)}` : `cooked ${dayLabel(b.cookDate)}`} ·{' '}
                    {left(b)} of {b.portions} not on the calendar yet · <Macros short n={batchSummary(b).each} />
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </>
    );
  }

  const each = batchSummary(batch).each;
  const per = starch ? perYieldUnit(starch) : undefined;
  const suggested = per ? starchToReach(each.kcal, settings.mealKcalAim, per.kcal) : 0;
  const c = cups ?? suggested;
  const total: Nutrition = per ? add(each, times(per, c)) : each;
  const label = `${batch.recipeName}${starch && c > 0 ? ` + ${fmtAmount(c)} ${starch.yieldUnit?.replace(' cooked', '') ?? ''} ${shortName(starch.name)}` : ''}`;

  return (
    <div>
      <div className="card">
        <b>{batch.recipeName}</b>, 1 container: <Macros short n={each} />
      </div>
      <div className="card">
        <div>Starch with it?</div>
        <select value={starchId ?? ''} onChange={(e) => { setStarchId(e.target.value || null); setCups(null); }}>
          <option value="">None</option>
          {starches.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {starch && (
          <div className="row">
            <Num value={c} onChange={setCups} /> {starch.yieldUnit} (suggested {fmtAmount(suggested)} for ~{settings.mealKcalAim} kcal)
          </div>
        )}
      </div>
      <div className="card">
        Total: <Macros n={total} />
      </div>
      <button
        className="primary"
        onClick={() =>
          onSave({
            label,
            nutrition: total,
            source: { kind: 'batch', batchId: batch.id, portions: 1, ...(starch && c > 0 ? { starch: { recipeId: starch.id, cups: c } } : {}) },
          })
        }
      >
        Add
      </button>
    </div>
  );
}

const shortName = (s: string) => s.split(',')[0].toLowerCase();

function AddFood({ onSave, onCancel }: { onSave: SaveFn; onCancel: () => void }) {
  const [picked, setPicked] = useState<PickedFood | null>(null);
  const [amount, setAmount] = useState<number | null>(1);
  const [unitName, setUnitName] = useState<string>('');
  if (!picked) {
    return <FoodPicker inline title="Pick a food" onClose={onCancel} onPick={(p) => { setPicked(p); setUnitName(p.units[0].unit); }} />;
  }
  return <FoodAmount picked={picked} amount={amount} setAmount={setAmount} unitName={unitName} setUnitName={setUnitName} onSave={onSave} onBack={() => setPicked(null)} />;
}

function FoodAmount({ picked, amount, setAmount, unitName, setUnitName, onSave, onBack }: {
  picked: PickedFood; amount: number | null; setAmount: (n: number | null) => void; unitName: string;
  setUnitName: (s: string) => void; onSave: SaveFn; onBack: () => void;
}) {
  const units = useUnitsFor({ food: picked.food, unit: picked.units[0].unit, gramsPerUnit: picked.units[0].gramsPerUnit });
  const u = units.find((x) => x.unit === unitName) ?? units[0];
  const n = times(picked.per100g, ((amount ?? 0) * u.gramsPerUnit) / 100);
  return (
    <div>
      <button className="link" onClick={onBack}>‹ Pick another</button>
      <div className="card">
        <b>{picked.name}</b>
        <div className="row">
          <Num value={amount} onChange={setAmount} />
          <select value={u.unit} onChange={(e) => setUnitName(e.target.value)}>
            {units.map((x) => (
              <option key={x.unit} value={x.unit}>{x.unit}</option>
            ))}
          </select>
        </div>
        <Macros n={n} />
      </div>
      <button
        className="primary"
        onClick={() =>
          onSave({
            label: `${picked.name}${amount !== 1 || picked.food.kind !== 'custom' ? ` (${fmtAmount(amount ?? 0)} ${u.unit})` : ''}`,
            nutrition: n,
            source: { kind: 'food', food: picked.food, amount: amount ?? 0, unit: u.unit },
          })
        }
      >
        Add
      </button>
    </div>
  );
}

function AddQuick({ onSave }: { onSave: SaveFn }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [keep, setKeep] = useState(false);
  const [place, setPlace] = useState('');
  return (
    <div className="card">
      <input placeholder="What, e.g. Chipotle burrito bowl" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="row">
        <Num value={kcal} onChange={setKcal} placeholder="kcal" /> kcal <Num value={protein} onChange={setProtein} placeholder="g" /> g protein
      </div>
      <label>
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Save to My foods for next time
      </label>
      {keep && <input placeholder="Place (optional), e.g. Chipotle" value={place} onChange={(e) => setPlace(e.target.value)} />}
      <button
        className="primary"
        disabled={!name || kcal === null}
        onClick={async () => {
          const nutrition = { kcal: kcal ?? 0, protein: protein ?? 0, carbs: 0, fat: 0 };
          if (keep) {
            const id = newId();
            await db.customFoods.add({ id, name, place: place || undefined, perServing: nutrition, servingLabel: '1 serving' });
            const p = customAsPicked((await db.customFoods.get(id))!);
            await onSave({ label: name, nutrition, source: { kind: 'food', food: p.food, amount: 1, unit: 'serving' } });
          } else {
            await onSave({ label: name, nutrition, source: { kind: 'quick' } });
          }
        }}
      >
        Add
      </button>
    </div>
  );
}

/** Breakfast and snacks are usually the same: copy one day's to the rest of the week. */
function CopyRoutine({ days, onClose }: { days: string[]; onClose: () => void }) {
  const [from, setFrom] = useState(days[0]);
  const all = useLiveQuery(() => db.calendar.where('date').between(days[0], days[6], true, true).toArray(), [days[0]]) ?? [];
  const source = useMemo(() => all.filter((e) => e.date === from && (e.slot === 'breakfast' || e.slot === 'snack')), [all, from]);
  const [to, setTo] = useState<string[]>(days.filter((d) => d !== days[0]));
  return (
    <Sheet title="Copy breakfast & snacks" onClose={onClose}>
      <div className="row">
        From
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          {days.map((d) => (
            <option key={d} value={d}>{dayLabel(d)}</option>
          ))}
        </select>
      </div>
      <p className="note">{source.length ? source.map((e) => e.label).join(', ') : 'That day has no breakfast or snacks yet.'}</p>
      {days.filter((d) => d !== from).map((d) => (
        <label key={d} className="block">
          <input type="checkbox" checked={to.includes(d)} onChange={(e) => setTo(e.target.checked ? [...to, d] : to.filter((x) => x !== d))} />{' '}
          {dayLabel(d)}
        </label>
      ))}
      <button
        className="primary"
        disabled={!source.length}
        onClick={async () => {
          const rows = to.filter((d) => d !== from).flatMap((d) => source.map((e) => ({ ...e, id: newId(), date: d, eaten: false })));
          await db.calendar.bulkAdd(rows);
          onClose();
        }}
      >
        Copy
      </button>
    </Sheet>
  );
}
