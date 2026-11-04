// Plan tab: the calendar with the meal bank. Week view (each day: breakfast, lunch, dinner, snacks) or a month
// overview. Phone: tap a meal card, then tap slots to paint it in, then Done. PC: drag cards (or placed meals)
// onto slots. Sam sets cook days ("+ cook" on a day); the app works out what each one feeds and what to freeze
// (cookdays.ts). Planned containers take their numbers from the cook day that feeds them; eaten ones are fixed.

import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import type { Batch, CalendarEntry, Recipe, Slot } from '../model';
import { DEFAULT_SETTINGS, newId, SLOTS, ZERO } from '../model';
import {
  addDays,
  addMonths,
  dayLabel,
  isoDate,
  monthLabel,
  monthStart,
  monthWeeks,
  sumEntries,
  weekAverage,
  weekDays,
  weekStart,
} from '../plan';
import { baseName, buildCards, cardEntry, cardSuggestions, cardTweaks, dishSuggestions, stepTweak, type CardTweak, type EntryDraft, type MealCard, type Targets, type Values } from '../bank';
import { coverage, dishLabel, entryPortions, type Coverage, type CookDayInfo, FRIDGE_DAYS, liveEntries } from '../cookdays';
import { add, batchSummary, perYieldUnit, times } from '../recipe-math';
import { fmtAmount } from '../units';
import { repeatStart, repeatWeek } from '../repeat';
import { BatchEditor, newBatchFor } from './Cook';
import { PrepSheetPage } from './Prep';
import { customAsPicked, FoodPicker, Macros, Num, r0, Sheet, useUnitsFor, type PickedFood } from './shared';

const SLOT_NAMES: Record<Slot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type View = 'week' | 'month';

function stored<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: fine */
  }
}

export function PlanTab() {
  const today = isoDate(new Date());
  const [view, setView] = useState<View>(() => (stored<string>('planView2', 'week') === 'month' ? 'month' : 'week'));
  const [start, setStart] = useState(weekStart(today)); // week view: its Monday
  const [month, setMonth] = useState(monthStart(today)); // month view: its 1st
  const [placing, setPlacing] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string[]>([]); // ids placed in this round, for Undo
  const [tweaks, setTweaks] = useState<Record<string, Values>>(() => stored('bankTweaks', {}));
  const [bankOpen, setBankOpen] = useState(() => stored('bankOpen', true));
  const [adding, setAdding] = useState<{ date: string; slot: Slot } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cookOn, setCookOn] = useState<string | null>(null);
  const [editBatch, setEditBatch] = useState<Batch | null>(null);
  const [copying, setCopying] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [prepFor, setPrepFor] = useState<string | null>(null);

  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
  // Everything is small (one person's plan), so load it all: cook days feed meals across weeks.
  const allEntries = useLiveQuery(() => db.calendar.toArray(), []);
  const batches = useLiveQuery(() => db.batches.toArray(), []) ?? [];
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const customFoods = useLiveQuery(() => db.customFoods.toArray(), []) ?? [];

  useEffect(() => store('bankTweaks', tweaks), [tweaks]);
  useEffect(() => store('bankOpen', bankOpen), [bankOpen]);

  const cov = useMemo(() => coverage(allEntries ?? [], batches), [allEntries, batches]);
  const live = useMemo(
    () => liveEntries(allEntries ?? [], cov, batches, recipes, settings.proteinPerMeal),
    [allEntries, cov, batches, recipes, settings.proteinPerMeal],
  );
  const cards = useMemo(
    () => buildCards({ recipes, batches, customFoods, entries: allEntries ?? [], mealKcalAim: settings.mealKcalAim, proteinPerMeal: settings.proteinPerMeal }),
    [recipes, batches, customFoods, allEntries, settings.mealKcalAim, settings.proteinPerMeal],
  );

  const weeks = monthWeeks(month);
  const days = weekDays(start);
  const [from, to] = view === 'week' ? [days[0], days[6]] : [weeks[0][0], weeks[weeks.length - 1][6]];
  const entries = live.filter((e) => e.date >= from && e.date <= to);
  const recipeById = new Map(recipes.map((r) => [r.id, r]));

  const switchView = (v: View) => {
    setView(v);
    if (v === 'month') setMonth(monthStart(start));
    store('planView2', v);
  };
  const openWeek = (d: string) => {
    setStart(weekStart(d));
    switchView('week');
  };

  const card = cards.find((c) => c.id === placing);
  const place = async (cardId: string, date: string, slot: Slot) => {
    const c = cards.find((x) => x.id === cardId);
    if (!c) return;
    const id = newId();
    await db.calendar.add({ id, date, slot, eaten: false, ...cardEntry(c, tweaks[cardId]) });
    setPlaced((p) => [...p, id]);
  };
  const startPlacing = (id: string | null) => {
    setPlacing(placing === id ? null : id);
    setPlaced([]);
    if (id && view === 'month') openWeek(month.slice(0, 7) === today.slice(0, 7) ? today : month);
  };
  const onDrop = async (ev: DragEvent, date: string, slot: Slot) => {
    ev.preventDefault();
    (ev.currentTarget as HTMLElement).classList.remove('dragover');
    const data = ev.dataTransfer.getData('text/plain');
    if (data.startsWith('card:')) await place(data.slice(5), date, slot);
    if (data.startsWith('entry:')) {
      const id = data.slice(6);
      // Shift-drag (or Alt/Ctrl) copies; a plain drag moves.
      if (ev.shiftKey || ev.altKey || ev.ctrlKey) {
        const e = await db.calendar.get(id);
        if (e) await db.calendar.add({ ...e, id: newId(), date, slot, eaten: false, ...(e.source.kind === 'dish' ? { source: { ...e.source, batchId: undefined } } : {}) });
      } else await db.calendar.update(id, { date, slot });
    }
  };

  // Average over what's shown: the week, or this month's days (not the grid's spill-over days).
  const shown = view === 'week' ? entries : entries.filter((e) => e.date.startsWith(month.slice(0, 7)));
  const avg = weekAverage(shown);
  const total = sumEntries(shown);
  const avgClass = !avg.days ? '' : avg.perDay.kcal < settings.dayKcalMin || avg.perDay.kcal > settings.dayKcalMax ? 'off' : 'ok';
  const step = (n: number) => (view === 'week' ? setStart(addDays(start, 7 * n)) : setMonth(addMonths(month, n)));
  const openEntry = live.find((e) => e.id === openId);

  return (
    <div className={`plan-layout ${bankOpen ? '' : 'bank-closed'}`}>
      <main className={`wide plan-main ${placing ? 'placing' : ''}`}>
        <header className="plan-head">
          <div className="seg">
            <button className={view === 'week' ? 'on' : ''} onClick={() => switchView('week')}>Week</button>
            <button className={view === 'month' ? 'on' : ''} onClick={() => switchView('month')}>Month</button>
          </div>
          <div className="row spread">
            <button className="link" onClick={() => step(-1)}>‹ Prev</button>
            <h1 className="week-title">{view === 'week' ? `${dayLabel(days[0])} – ${dayLabel(days[6])}` : monthLabel(month)}</h1>
            <button className="link" onClick={() => step(1)}>Next ›</button>
          </div>
          <div className={`week-avg ${avgClass}`}>
            {avg.days ? (
              <>
                <span title={`Target ${r0(settings.dayKcalMin)}–${r0(settings.dayKcalMax)} kcal a day`}>
                  {view === 'week' ? 'Week' : 'Month'} avg <Macros short n={avg.perDay} /> /day
                </span>{' '}
                <span className="note">({avg.days} day{avg.days === 1 ? '' : 's'}, {r0(total.kcal)} kcal in all)</span>
              </>
            ) : (
              'Nothing planned yet'
            )}
          </div>
          {card && (
            <div className="hint">
              Placing <b>{cardEntry(card, tweaks[card.id]).label}</b>: tap slots (as many as you like), then Done.
            </div>
          )}
        </header>

        {view === 'month' && (
          <MonthGrid weeks={weeks} month={month} today={today} entries={entries} batches={batches} settings={settings} onPickDay={openWeek} />
        )}

        {view === 'week' && (
          <div className="week-grid">
            {days.map((d) => {
              const dayEntries = entries.filter((e) => e.date === d);
              const t = sumEntries(dayEntries);
              const level = !dayEntries.length ? '' : t.kcal < settings.dayKcalMin || t.kcal > settings.dayKcalMax ? 'off' : 'ok';
              const cooks = batches.filter((b) => b.cookDate === d);
              return (
                <section key={d} className={`day ${d === today ? 'today' : ''}`}>
                  <div className="day-head">
                    <b>{dayLabel(d)}</b>
                    <span className="note">
                      <span className={level}>{r0(t.kcal)} kcal</span> · {r0(t.protein)} g protein
                    </span>
                  </div>
                  <div className="cook-row">
                    {cooks.map((b) => (
                      <button key={b.id} className={`cooktag ${b.status}`} onClick={() => setEditBatch(b)} title="Open this cook day">
                        🍳 {b.recipeName}
                      </button>
                    ))}
                    {cooks.length > 0 && <button className="cookbtn" onClick={() => setPrepFor(d)} title="Prep sheet: how to divide it">📋 prep</button>}
                    <button className="cookbtn" onClick={() => setCookOn(d)}>+ cook</button>
                  </div>
                  {SLOTS.map((slot) => (
                    <div
                      key={slot}
                      className="slot"
                      onClick={() => placing && place(placing, d, slot)}
                      onDragOver={(ev) => {
                        ev.preventDefault();
                        ev.currentTarget.classList.add('dragover');
                      }}
                      onDragLeave={(ev) => ev.currentTarget.classList.remove('dragover')}
                      onDrop={(ev) => onDrop(ev, d, slot)}
                    >
                      {placing ? (
                        <div className="slot-name">{SLOT_NAMES[slot]}</div>
                      ) : (
                        <button className="slot-name slot-add" onClick={() => setAdding({ date: d, slot })} title="Add something else">
                          {SLOT_NAMES[slot]} <span className="plus">+</span>
                        </button>
                      )}
                      <div className="slot-entries">
                        {dayEntries
                          .filter((e) => e.slot === slot)
                          .map((e) => (
                            <EntryChip key={e.id} entry={e} cov={cov} placing={!!placing} onOpen={() => setOpenId(e.id)} />
                          ))}
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        )}

        <CookPanel from={view === 'week' ? days[0] : month} to={view === 'week' ? days[6] : addDays(addMonths(month, 1), -1)}
          cov={cov} live={live} recipes={recipes} onOpen={setEditBatch} onCook={setCookOn} />

        {view === 'week' && (
          <div className="row">
            <button onClick={() => setRepeating(true)}>Repeat this week…</button>
            <button onClick={() => setCopying(true)}>Copy a day's breakfast & snacks to other days…</button>
          </div>
        )}
      </main>

      <MealBank
        cards={cards}
        targets={{ protein: settings.proteinPerMeal, kcal: settings.mealKcalAim }}
        tweaks={tweaks}
        onTweak={(id, t) => setTweaks({ ...tweaks, [id]: t })}
        placing={placing}
        onPick={startPlacing}
        onDone={() => startPlacing(null)}
        canUndo={placed.length > 0}
        onUndo={async () => {
          const id = placed.at(-1);
          if (id) await db.calendar.delete(id);
          setPlaced(placed.slice(0, -1));
        }}
        open={bankOpen}
        onToggle={() => setBankOpen(!bankOpen)}
      />

      {adding && <AddEntry date={adding.date} slot={adding.slot} onClose={() => setAdding(null)} />}
      {openEntry && (
        <EntrySheet entry={openEntry} cov={cov} batches={batches} recipeById={recipeById}
          targets={{ protein: settings.proteinPerMeal, kcal: settings.mealKcalAim }} onClose={() => setOpenId(null)}
          onCook={(d) => { setOpenId(null); setCookOn(d); }} />
      )}
      {cookOn && (
        <CookDaySheet date={cookOn} recipes={recipes} cov={cov} onClose={() => setCookOn(null)}
          onCreated={(b) => { setCookOn(null); setEditBatch(b); }} />
      )}
      {editBatch && <BatchEditor batch={editBatch} recipe={recipeById.get(editBatch.recipeId)} onClose={() => setEditBatch(null)} />}
      {prepFor && <PrepSheetPage date={prepFor} onClose={() => setPrepFor(null)} />}
      {copying && <CopyRoutine days={days} onClose={() => setCopying(false)} />}
      {repeating && (
        <RepeatWeek monday={days[0]} entries={allEntries ?? []} batches={batches} onClose={() => setRepeating(false)}
          onDone={(weeks) => { setRepeating(false); setStart(addDays(start, 7 * weeks)); }} />
      )}
    </div>
  );
}

// ---- Meal bank ---------------------------------------------------------------------------------------

function MealBank({ cards, targets, tweaks, onTweak, placing, onPick, onDone, canUndo, onUndo, open, onToggle }: {
  cards: MealCard[];
  targets: Targets;
  tweaks: Record<string, Values>;
  onTweak: (id: string, t: Values) => void;
  placing: string | null;
  onPick: (id: string) => void;
  onDone: () => void;
  canUndo: boolean;
  onUndo: () => void;
  open: boolean;
  onToggle: () => void;
}) {
  const clash = useMemo(() => {
    const seen = new Map<string, Set<string>>();
    for (const c of cards) if (c.group === 'prep' && c.starch) {
      const k = c.starch.name.split(',')[0].toLowerCase();
      seen.set(k, (seen.get(k) ?? new Set()).add(c.starch.id));
    }
    return new Set([...seen].filter(([, ids]) => ids.size > 1).map(([k]) => k));
  }, [cards]);
  return (
    <aside className={`bank ${open || placing ? '' : 'closed'}`}>
      <div className="bank-head">
        <span>{placing ? 'Tap slots to place' : 'Meal bank · tap one, then tap slots'}</span>
        {placing ? (
          <span>
            {canUndo && <button className="link" onClick={onUndo}>Undo</button>}
            <button className="primary small" onClick={onDone}>Done</button>
          </span>
        ) : (
          <button className="link bank-toggle" onClick={onToggle}>{open ? 'Hide' : 'Show'}</button>
        )}
      </div>
      <div className="cards">
        {cards.length === 0 && (
          <p className="note">No meals yet. Add recipes (Recipes tab) or My foods (More), or import a file (More → Import).</p>
        )}
        {cards.map((c) => (
          <BankCard key={c.id} card={c} clash={clash} targets={targets} tweaks={tweaks[c.id] ?? {}} on={placing === c.id}
            onTweak={(t) => onTweak(c.id, t)} onPick={() => onPick(c.id)} />
        ))}
      </div>
    </aside>
  );
}

/** "Chili + white rice"; the starch's full name if two starches share a short name. */
function cardTitle(c: MealCard, clash: Set<string>) {
  if (c.group !== 'prep' || !c.starch) return c.name;
  const short = c.starch.name.split(',')[0].toLowerCase();
  return `${c.name} + ${clash.has(short) ? c.starch.name.toLowerCase() : short}`;
}

function BankCard({ card, clash, targets, tweaks, on, onTweak, onPick }: {
  card: MealCard;
  clash: Set<string>;
  targets: Targets;
  tweaks: Values;
  on: boolean;
  onTweak: (t: Values) => void;
  onPick: () => void;
}) {
  const e = cardEntry(card, tweaks);
  return (
    <div
      className={`bank-card ${on ? 'on' : ''}`}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(ev) => ev.dataTransfer.setData('text/plain', `card:${card.id}`)}
      onClick={onPick}
      onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onPick()}
    >
      <span className="bc-name">{cardTitle(card, clash)}</span>
      {card.group === 'food' && card.place && <span className="bc-sub">{card.place}</span>}
      <span className="bc-n">{r0(e.nutrition.kcal)} kcal · {r0(e.nutrition.protein)} g protein</span>
      {cardTweaks(card, tweaks).map((t) => (
        <Stepper key={t.key} t={t} onStep={(dir) => onTweak(stepTweak(card, tweaks, t.key, dir))}
          onCycle={t.canCycle ? () => onTweak(stepTweak(card, tweaks, 'unit', 1)) : undefined} />
      ))}
      <Suggestions list={cardSuggestions(card, tweaks, targets)} onPick={(x) => onTweak(x.tweaks)} />
    </div>
  );
}

/** "40 g protein: 1¼ servings" / "750 kcal: 1½ cup rice": tap to use it. */
function Suggestions<T extends { text: string }>({ list, onPick }: { list: T[]; onPick: (x: T) => void }) {
  if (!list.length) return null;
  return (
    <div className="sugg">
      {list.map((x) => (
        <button key={x.text} className="link" onClick={(ev) => { ev.stopPropagation(); onPick(x); }} title="Use this">
          → {x.text}
        </button>
      ))}
    </div>
  );
}

function Stepper({ t, onStep, onCycle }: { t: CardTweak; onStep: (dir: 1 | -1) => void; onCycle?: () => void }) {
  return (
    <div className="stepper">
      <button onClick={(ev) => { ev.stopPropagation(); onStep(-1); }} disabled={t.n <= t.min} aria-label="less">−</button>
      <span>
        {fmtAmount(t.n)}{' '}
        {onCycle ? <button className="link unit-cycle" onClick={(ev) => { ev.stopPropagation(); onCycle(); }} title="Switch unit">{t.text} ⇄</button> : t.text}
      </span>
      <button onClick={(ev) => { ev.stopPropagation(); onStep(1); }} aria-label="more">+</button>
    </div>
  );
}

// ---- Placed meals ------------------------------------------------------------------------------------

function EntryChip({ entry, cov, placing, onOpen }: { entry: CalendarEntry; cov: Coverage; placing: boolean; onOpen: () => void }) {
  const flag = cov.uncovered.some((e) => e.id === entry.id) || cov.short.has(entry.id) ? '⚠ ' : cov.frozen.has(entry.id) ? '❄️ ' : '';
  return (
    <div
      className={`chip ${entry.eaten ? 'eaten' : ''}`}
      draggable={!placing}
      onDragStart={(ev) => ev.dataTransfer.setData('text/plain', `entry:${entry.id}`)}
    >
      <button className="chip-main" onClick={(ev) => { if (placing) return; ev.stopPropagation(); onOpen(); }}>
        {entry.eaten ? '✓ ' : ''}
        {flag}
        {entry.label}
        <span className="chip-n">{r0(entry.nutrition.kcal)} kcal · {r0(entry.nutrition.protein)} g</span>
      </button>
    </div>
  );
}

/**
 * Tick a meal eaten (or not). A container meal gets pinned to the cook day that fed it, keeps the numbers it had,
 * and comes out of that batch's stock (fridge first) if the batch is cooked. Un-ticking undoes it.
 */
async function setEaten(entry: CalendarEntry, eaten: boolean, cov: Coverage) {
  await db.transaction('rw', db.calendar, db.batches, async () => {
    let batchId: string | undefined;
    const patch: Partial<CalendarEntry> = { eaten };
    if (entry.source.kind === 'dish') {
      batchId = eaten ? cov.feeds.get(entry.id) : entry.source.batchId;
      const { batchId: _old, ...rest } = entry.source;
      patch.source = eaten && batchId ? { ...rest, batchId } : rest;
      if (eaten) patch.nutrition = entry.nutrition; // the live numbers shown right now
    } else if (entry.source.kind === 'batch') {
      batchId = entry.source.batchId;
      if (eaten) patch.nutrition = entry.nutrition;
    }
    await db.calendar.update(entry.id, patch);
    const b = batchId ? await db.batches.get(batchId) : undefined;
    if (b && b.status === 'cooked') {
      let { fridge, freezer } = b;
      for (let i = 0; i < Math.round(entryPortions(entry)); i++) {
        if (eaten) {
          if (fridge > 0) fridge--;
          else if (freezer > 0) freezer--;
        } else fridge++;
      }
      await db.batches.update(b.id, { fridge, freezer });
    }
  });
}

function EntrySheet({ entry, cov, batches, recipeById, targets, onClose, onCook }: {
  entry: CalendarEntry;
  targets: Targets;
  cov: Coverage;
  batches: Batch[];
  recipeById: Map<string, Recipe>;
  onClose: () => void;
  onCook: (date: string) => void;
}) {
  const s = entry.source;
  const fed = batches.find((b) => b.id === cov.feeds.get(entry.id));
  const isDish = s.kind === 'dish' || s.kind === 'batch';
  const recipeId = s.kind === 'dish' ? s.recipeId : fed?.recipeId;
  const dish = recipeId ? recipeById.get(recipeId) : undefined;
  const starch = isDish && s.starch ? recipeById.get(s.starch.recipeId) : undefined;
  const uncovered = cov.uncovered.some((e) => e.id === entry.id);

  const save = (patch: Partial<CalendarEntry>) => db.calendar.update(entry.id, patch);

  // Change servings or cups in place (keeps it on the same cook day).
  const setDish = (portions: number, cups: number) => {
    if (s.kind !== 'dish' && s.kind !== 'batch') return;
    const per = cups / portions;
    const old = entry.nutrition;
    // Rescale the shown numbers; planned meals are refreshed from their cook day anyway.
    const oldStarch = starch && s.starch ? times(perYieldUnit(starch), s.starch.cups * s.portions) : ZERO;
    const each = times(add(old, times(oldStarch, -1)), 1 / s.portions);
    const newStarch = starch ? times(perYieldUnit(starch), cups) : ZERO;
    const nutrition = add(times(each, portions), newStarch);
    const name = dish?.name ?? fed?.recipeName ?? baseName(entry.label.split(' + ')[0]).replace(/ ×.*$/, '');
    save({
      label: dishLabel(name, portions, starch, cups),
      nutrition,
      source: { ...s, portions, ...(s.starch ? { starch: { ...s.starch, cups: per } } : {}) },
    });
  };
  const setAmount = (amount: number) => {
    if (s.kind !== 'food' || s.amount <= 0 || amount <= 0) return;
    save({ label: `${baseName(entry.label)} (${fmtAmount(amount)} ${s.unit})`, nutrition: times(entry.nutrition, amount / s.amount), source: { ...s, amount } });
  };

  return (
    <Sheet title={`${SLOT_NAMES[entry.slot]} · ${dayLabel(entry.date)}`} onClose={onClose}>
      <h2>{entry.eaten ? '✓ ' : ''}{entry.label}</h2>
      <div className="card"><Macros n={entry.nutrition} /></div>

      {isDish && (
        <div className="card">
          <Stepper t={{ key: 'servings', n: s.portions, text: s.portions === 1 ? 'serving' : 'servings', step: 0.5, min: 0.5 }}
            onStep={(dir) => setDish(Math.max(0.5, s.portions + dir * 0.5), s.starch ? s.starch.cups * s.portions : 0)} />
          {s.starch && starch && (
            <Stepper t={{ key: 'cups', n: s.starch.cups * s.portions, text: `${(starch.yieldUnit ?? 'cup').replace(/ cooked$/, '')} ${starch.name.split(',')[0].toLowerCase()}`, step: 0.25, min: 0 }}
              onStep={(dir) => setDish(s.portions, Math.max(0, Math.round((s.starch!.cups * s.portions + dir * 0.25) * 4) / 4))} />
          )}
          {(() => {
            const starchPer = starch ? perYieldUnit(starch) : undefined;
            const cups = s.starch ? s.starch.cups * s.portions : 0;
            const each = times(add(entry.nutrition, times(starchPer ? times(starchPer, cups) : ZERO, -1)), 1 / s.portions);
            const text = starch ? `${(starch.yieldUnit ?? 'cup').replace(/ cooked$/, '')} ${starch.name.split(',')[0].toLowerCase()}` : '';
            return (
              <Suggestions
                list={dishSuggestions(each, starchPer ? { per: starchPer, text } : undefined, s.portions, cups, { protein: targets.protein, kcal: targets.kcal })}
                onPick={(x) => setDish(x.servings, x.cups)}
              />
            );
          })()}
          {fed && (
            <p className="note">
              From the 🍳 {fed.recipeName} cook day, {dayLabel(fed.cookDate)} ({fed.status})
              {cov.frozen.has(entry.id) && <> · ❄️ freezer container (more than {FRIDGE_DAYS} days after cooking)</>}
            </p>
          )}
          {cov.short.has(entry.id) && <p className="warn">⚠ That cook day doesn't make enough for this one. Buy more, or add a cook day.</p>}
          {uncovered && (
            <p className="warn">
              ⚠ No cook day before this.{' '}
              <button onClick={() => onCook(addDays(entry.date, -1))}>+ Cook {dish?.name ?? 'it'} on {dayLabel(addDays(entry.date, -1))}</button>
            </p>
          )}
        </div>
      )}
      {s.kind === 'food' && s.amount > 0 && (
        <div className="card">
          <Stepper t={{ key: 'amount', n: s.amount, text: s.unit, step: s.unit === 'g' ? 10 : 0.5, min: s.unit === 'g' ? 10 : 0.5 }}
            onStep={(dir) => setAmount(Math.max(s.unit === 'g' ? 10 : 0.5, s.amount + dir * (s.unit === 'g' ? 10 : 0.5)))} />
        </div>
      )}

      <div className="row actions">
        <button onClick={async () => { await setEaten(entry, !entry.eaten, cov); onClose(); }}>
          {entry.eaten ? 'Not eaten after all' : 'Mark eaten'}
        </button>
        <button className="danger" onClick={async () => { await db.calendar.delete(entry.id); onClose(); }}>Remove</button>
      </div>
    </Sheet>
  );
}

// ---- Cook days ---------------------------------------------------------------------------------------

function CookDaySheet({ date, recipes, cov, onClose, onCreated }: {
  date: string;
  recipes: Recipe[];
  cov: Coverage;
  onClose: () => void;
  onCreated: (b: Batch) => void;
}) {
  const settings = useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
  const dishes = recipes.filter((r) => r.kind === 'dish').sort((a, b) => a.name.localeCompare(b.name));
  const waiting = (rid: string) => cov.uncovered.filter((e) => e.source.kind === 'dish' && e.source.recipeId === rid && e.date >= date).length;
  const create = async (r: Recipe) => {
    const b = newBatchFor(r, date, settings.proteinPerMeal);
    await db.batches.add(b);
    onCreated(b);
  };
  return (
    <Sheet title={`Cook on ${dayLabel(date)}`} onClose={onClose}>
      <p className="note">Pick what you'll cook. Next, enter what you bought; the app works out the containers.</p>
      {dishes.length === 0 && <p className="note">No dish recipes yet (Recipes tab, or More → Import).</p>}
      <ul className="results">
        {dishes.map((r) => (
          <li key={r.id}>
            <button onClick={() => create(r)}>
              <span className="name">{r.name}</span>
              {waiting(r.id) > 0 && <span className="meta warn">{waiting(r.id)} planned meal{waiting(r.id) > 1 ? 's' : ''} after this day have no cook day yet</span>}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

const dateRange = (es: CalendarEntry[]) => {
  if (!es.length) return '';
  const a = es[0].date;
  const b = es[es.length - 1].date;
  return a === b ? dayLabel(a) : `${dayLabel(a)} – ${dayLabel(b)}`;
};

/** What each cook day in view makes, who it feeds, what's spare, what to freeze, and meals with no cook day. */
function CookPanel({ from, to, cov, live, recipes, onOpen, onCook }: {
  from: string;
  to: string;
  cov: Coverage;
  live: CalendarEntry[];
  recipes: Recipe[];
  onOpen: (b: Batch) => void;
  onCook: (d: string) => void;
}) {
  const days = [...cov.cookDays.values()]
    .filter((d) => (d.batch.cookDate >= from && d.batch.cookDate <= to) || d.entries.some((e) => !e.eaten && e.date >= from && e.date <= to))
    .filter((d) => d.batch.status === 'planned' || d.entries.some((e) => !e.eaten))
    .sort((a, b) => a.batch.cookDate.localeCompare(b.batch.cookDate));
  const uncovered = cov.uncovered.filter((e) => e.date >= from && e.date <= to);
  const byRecipe = new Map<string, CalendarEntry[]>();
  for (const e of uncovered) if (e.source.kind === 'dish') byRecipe.set(e.source.recipeId, [...(byRecipe.get(e.source.recipeId) ?? []), e]);
  const liveById = new Map(live.map((e) => [e.id, e]));

  return (
    <div className="card cook-panel">
      <h3>Cook days & food on hand</h3>
      {days.length === 0 && byRecipe.size === 0 && (
        <p className="note">No cook days here. Tap “+ cook” on a day; the app works out what it feeds and what to freeze.</p>
      )}
      {days.map((d) => <CookDayRow key={d.batch.id} d={d} liveById={liveById} onOpen={() => onOpen(d.batch)} />)}
      {[...byRecipe].map(([rid, es]) => {
        const r = recipes.find((x) => x.id === rid);
        const day = addDays(es[0].date, -1);
        return (
          <div key={rid} className="cook-day warn">
            ⚠ <b>{r?.name ?? 'Deleted recipe'}</b>: {es.length} meal{es.length > 1 ? 's' : ''} with no cook day before{' '}
            {es.length > 1 ? 'them' : 'it'} ({dateRange(es)}).{' '}
            <button className="small" onClick={() => onCook(day)}>+ Cook on {dayLabel(day)}</button>
          </div>
        );
      })}
    </div>
  );
}

function CookDayRow({ d, liveById, onOpen }: { d: CookDayInfo; liveById: Map<string, CalendarEntry>; onOpen: () => void }) {
  const b = d.batch;
  const s = batchSummary(b);
  const main = b.items.find((i) => i.amount !== null && !i.optional && i.scaling === 'scale') ?? b.items[0];
  const mine = d.entries.filter((e) => !e.eaten).map((e) => liveById.get(e.id) ?? e);
  return (
    <div className="cook-day">
      <button className="link-plain" onClick={onOpen}>
        <b>🍳 {dayLabel(b.cookDate)} · {b.recipeName}</b>{' '}
        <span className="tag">{b.status === 'planned' ? 'planned' : 'cooked'}</span>
        <span className="meta">
          {main?.amount ? `${fmtAmount(Math.round(main.amount * 100) / 100)} ${main.unit} ${main.name.split(',')[0]} → ` : ''}
          {b.status === 'planned' ? `${b.portions} containers` : `🧊 ${b.fridge} fridge · ❄️ ${b.freezer} freezer`}
          {s.gramsEach ? ` of ${r0(s.gramsEach)} g` : ''} · {r0(s.each.kcal)} kcal · {r0(s.each.protein)} g protein each
        </span>
        <span className="meta">
          {mine.length ? `Planned: ${fmtAmount(d.used)} (${dateRange(mine)})` : 'Nothing planned from it yet'}
          {d.spare > 0 && ` · ${fmtAmount(d.spare)} spare`}
          {d.freeze > 0 && ` · ❄️ freeze ${fmtAmount(d.freeze)}`}
        </span>
        {d.short > 0 && <span className="meta warn">⚠ {fmtAmount(d.short)} short: enter more meat bought, or add another cook day</span>}
      </button>
    </div>
  );
}

// ---- Month overview ----------------------------------------------------------------------------------

/** Month overview: each day's calories, its lunch/dinner, and cook days. Tap a day to plan that week. */
function MonthGrid({ weeks, month, today, entries, batches, settings, onPickDay }: {
  weeks: string[][];
  month: string;
  today: string;
  entries: CalendarEntry[];
  batches: Batch[];
  settings: typeof DEFAULT_SETTINGS;
  onPickDay: (d: string) => void;
}) {
  const inMonth = month.slice(0, 7);
  return (
    <div className="month">
      {DOW.map((d) => (
        <div key={d} className="month-dow">{d}</div>
      ))}
      {weeks.flat().map((d) => {
        const dayEntries = entries.filter((e) => e.date === d);
        const t = sumEntries(dayEntries);
        const meals = dayEntries.filter((e) => e.slot === 'lunch' || e.slot === 'dinner');
        const level = t.kcal < settings.dayKcalMin ? 'low' : t.kcal > settings.dayKcalMax ? 'high' : 'ok';
        const cooks = batches.filter((b) => b.cookDate === d);
        return (
          <button
            key={d}
            className={`month-day ${d.startsWith(inMonth) ? '' : 'other'} ${d === today ? 'today' : ''}`}
            onClick={() => onPickDay(d)}
          >
            <span className="month-num">{Number(d.slice(8))}{cooks.length > 0 && <span className="month-cook"> 🍳</span>}</span>
            {dayEntries.length > 0 && (
              <>
                <span className={`month-kcal ${level}`}>{r0(t.kcal)}</span>
                <span className="month-p">{r0(t.protein)} g</span>
                <span className="month-meals">
                  {cooks.map((b) => <span key={b.id} className="month-cook">🍳 {b.recipeName}</span>)}
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

// ---- Adding anything else to a slot (the "+" button) -------------------------------------------------

type Mode = 'food' | 'quick';

function AddEntry({ date, slot, onClose }: { date: string; slot: Slot; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('food');
  const save = async (e: EntryDraft) => {
    await db.calendar.add({ id: newId(), date, slot, eaten: false, ...e });
    onClose();
  };
  return (
    <Sheet title={`${SLOT_NAMES[slot]} · ${dayLabel(date)}`} onClose={onClose}>
      <p className="note">Meal prep containers and your usual foods are in the meal bank. Here: anything else.</p>
      <Recent slot={slot} onSave={save} />
      <div className="seg">
        {(['food', 'quick'] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {m === 'food' ? 'Find a food' : 'Quick add'}
          </button>
        ))}
      </div>
      {mode === 'food' && <AddFood onSave={save} onCancel={onClose} />}
      {mode === 'quick' && <AddQuick onSave={save} />}
    </Sheet>
  );
}

type SaveFn = (e: EntryDraft) => Promise<void>;

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
        <button
          key={e.id}
          onClick={() => {
            const source = e.source.kind === 'dish' ? (({ batchId: _b, ...rest }) => rest)(e.source) : e.source;
            onSave({ label: e.label, nutrition: e.nutrition, source });
          }}
        >
          {e.label}
          <span className="chip-n">
            {r0(e.nutrition.kcal)} kcal · {r0(e.nutrition.protein)} g
          </span>
        </button>
      ))}
    </div>
  );
}

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
          const fresh = (e: CalendarEntry): CalendarEntry['source'] => (e.source.kind === 'dish' ? (({ batchId: _b, ...rest }) => rest)(e.source) : e.source);
          const rows = to.filter((d) => d !== from).flatMap((d) => source.map((e) => ({ ...e, id: newId(), date: d, eaten: false, source: fresh(e) })));
          await db.calendar.bulkAdd(rows);
          onClose();
        }}
      >
        Copy
      </button>
    </Sheet>
  );
}

/**
 * Repeat a week: copy 7 days (meals and cook days) to the next N weeks. Starts on the cook day before the week
 * shown when there is one (cook Sunday, eat Monday–Friday copies as one piece). Only empty slots are filled.
 */
function RepeatWeek({ monday, entries, batches, onClose, onDone }: {
  monday: string;
  entries: CalendarEntry[];
  batches: Batch[];
  onClose: () => void;
  onDone: (weeks: number) => void;
}) {
  const [start, setStart] = useState(() => repeatStart(monday, batches));
  const [weeks, setWeeks] = useState(4);
  const [added, setAdded] = useState<{ entries: string[]; batches: string[]; weeks: number } | null>(null);
  const preview = useMemo(() => repeatWeek(entries, batches, start, weeks, () => ''), [entries, batches, start, weeks]);
  const options = Array.from({ length: 7 }, (_, i) => addDays(monday, i - 1));
  const src = entries.filter((e) => e.date >= start && e.date <= addDays(start, 6));
  const srcCooks = batches.filter((b) => b.cookDate >= start && b.cookDate <= addDays(start, 6));
  const last = addDays(start, 7 * weeks + 6);

  if (added) {
    return (
      <Sheet title="Repeat this week" onClose={onClose}>
        <p>
          Added {added.entries.length} meal{added.entries.length === 1 ? '' : 's'} and {added.batches.length} cook day
          {added.batches.length === 1 ? '' : 's'}.
        </p>
        <div className="row">
          <button className="primary" onClick={() => onDone(added.weeks)}>See next week</button>
          <button onClick={onClose}>Stay here</button>
          <button
            className="danger"
            onClick={async () => {
              await db.transaction('rw', db.calendar, db.batches, async () => {
                await db.calendar.bulkDelete(added.entries);
                await db.batches.bulkDelete(added.batches);
              });
              onClose();
            }}
          >
            Undo
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Repeat this week" onClose={onClose}>
      <p className="note">
        Copies 7 days of meals and cook days to the weeks after. Slots that already have something are left as they
        are. Copies are planned: tick meals eaten and enter what you bought on each cook day as usual.
      </p>
      <label className="block">
        The 7 days from{' '}
        <select value={start} onChange={(e) => setStart(e.target.value)}>
          {options.map((d) => (
            <option key={d} value={d}>{dayLabel(d)}{batches.some((b) => b.cookDate === d) ? ' 🍳' : ''}</option>
          ))}
        </select>{' '}
        to {dayLabel(addDays(start, 6))}
      </label>
      <p className="note">
        {src.length} meal{src.length === 1 ? '' : 's'}
        {srcCooks.length ? `, cook day${srcCooks.length > 1 ? 's' : ''}: ${srcCooks.map((b) => `${b.recipeName} (${dayLabel(b.cookDate)})`).join(', ')}` : ', no cook days'}
      </p>
      <div className="row">
        For the next <Num value={weeks} onChange={(n) => setWeeks(Math.max(1, Math.min(13, Math.round(n ?? 1))))} /> weeks
        <span className="note">(up to {dayLabel(last)})</span>
      </div>
      <p>
        Adds <b>{preview.entries.length}</b> meal{preview.entries.length === 1 ? '' : 's'} and <b>{preview.batches.length}</b> cook day
        {preview.batches.length === 1 ? '' : 's'}.
        {preview.skippedSlots > 0 && <span className="note"> {preview.skippedSlots} slot{preview.skippedSlots > 1 ? 's' : ''} already planned: left alone.</span>}
        {preview.skippedCooks > 0 && <span className="note"> {preview.skippedCooks} cook day{preview.skippedCooks > 1 ? 's' : ''} already there.</span>}
      </p>
      {srcCooks.length === 0 && src.some((e) => e.source.kind === 'dish' || e.source.kind === 'batch') && (
        <p className="note warn">No cook day in these 7 days: the copied containers will need cook days (or pick the day you cook above).</p>
      )}
      <button
        className="primary"
        disabled={!preview.entries.length && !preview.batches.length}
        onClick={async () => {
          const r = repeatWeek(entries, batches, start, weeks, newId);
          await db.transaction('rw', db.calendar, db.batches, async () => {
            await db.calendar.bulkAdd(r.entries);
            await db.batches.bulkAdd(r.batches);
          });
          setAdded({ entries: r.entries.map((e) => e.id), batches: r.batches.map((b) => b.id), weeks: 1 });
        }}
      >
        Repeat
      </button>
    </Sheet>
  );
}
