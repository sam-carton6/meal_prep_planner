// Editing a list of ingredients (used by recipes and batches).

import { useState } from 'react';
import type { RecipeItem } from '../model';
import { itemGrams, itemNutrition } from '../recipe-math';
import { fmtWeight } from '../units';
import { setDrained, withDrainOptions } from '../cans';
import { customUnitFrom, FoodPicker, itemFromPicked, Num, r0, useFoods, useUnitsFor } from './shared';

export function ItemRow({
  item,
  onChange,
  onRemove,
  isMain,
  onMakeMain,
  showScaling = true,
}: {
  item: RecipeItem;
  onChange: (i: RecipeItem) => void;
  onRemove?: () => void;
  isMain?: boolean;
  onMakeMain?: () => void;
  showScaling?: boolean;
}) {
  const units = useUnitsFor(item);
  const { foods } = useFoods();
  const n = itemNutrition(item);
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [sizing, setSizing] = useState(false);
  const [sizeName, setSizeName] = useState('');
  const [sizeGrams, setSizeGrams] = useState<number | null>(null);
  const newSize = customUnitFrom(sizeName, sizeGrams);
  // Cans of beans etc.: offer whole can vs drained when USDA has both.
  const canItem = item.drain ? item : foods && /^can/i.test(item.unit) ? withDrainOptions(item, foods) : item;
  return (
    <div className={`item ${item.optional ? 'optional' : ''}`}>
      <div className="item-top">
        <button className="item-name link-plain" onClick={() => setOpen(!open)}>
          {isMain && <span className="tag">main</span>}
          {item.optional && <span className="tag">optional</span>}
          {item.name}
        </button>
        {item.amount !== null && (
          <span className="item-n">
            {r0(n.kcal)} kcal · {r0(n.protein)} g
          </span>
        )}
      </div>
      <div className="item-amount">
        {item.amount === null ? (
          <span className="note">{item.unit}</span>
        ) : (
          <>
            <Num value={item.amount} onChange={(a) => onChange({ ...item, amount: a ?? 0 })} />
            <select
              value={item.unit}
              onChange={(e) => {
                if (e.target.value === '__custom') return setSizing(true);
                const u = units.find((o) => o.unit === e.target.value)!;
                onChange({ ...item, unit: u.unit, gramsPerUnit: u.gramsPerUnit });
              }}
            >
              {units.map((u) => (
                <option key={u.unit} value={u.unit}>
                  {u.unit}
                </option>
              ))}
              <option value="__custom">other size…</option>
            </select>
            <span className="note">{fmtWeight(itemGrams(item))}</span>
            {canItem.drain && (
              <label className="drain">
                <input
                  type="checkbox"
                  checked={!!item.drained}
                  onChange={(e) => onChange(setDrained(canItem, e.target.checked))}
                />{' '}
                Drained
              </label>
            )}
          </>
        )}
      </div>
      {sizing && (
        <div className="fields size-form">
          <label>
            Size name
            <input autoFocus value={sizeName} onChange={(e) => setSizeName(e.target.value)} placeholder='e.g. can (15 oz), pack (1.5 lb)' />
          </label>
          <label>
            Grams in one
            <Num value={newSize && sizeGrams === null ? newSize.gramsPerUnit : sizeGrams} onChange={setSizeGrams} placeholder="g" />
          </label>
          <button
            className="primary"
            disabled={!newSize}
            onClick={() => {
              if (newSize) onChange({ ...item, unit: newSize.unit, gramsPerUnit: newSize.gramsPerUnit });
              setSizing(false);
              setSizeName('');
              setSizeGrams(null);
            }}
          >
            Use it
          </button>
          <button onClick={() => setSizing(false)}>Cancel</button>
        </div>
      )}
      {open && (
        <div className="item-more">
          {showScaling && onMakeMain && !isMain && item.amount !== null && (
            <button onClick={onMakeMain}>Make main ingredient</button>
          )}
          {showScaling && !isMain && item.amount !== null && (
            <label>
              <input
                type="checkbox"
                checked={item.scaling === 'fixed'}
                onChange={(e) => onChange({ ...item, scaling: e.target.checked ? 'fixed' : 'scale' })}
              />{' '}
              Same amount every batch (don't scale)
            </label>
          )}
          <label>
            <input
              type="checkbox"
              checked={!!item.optional}
              onChange={(e) => onChange({ ...item, optional: e.target.checked || undefined })}
            />{' '}
            Optional add-on (not in totals)
          </label>
          {item.amount !== null && <button onClick={() => setChanging(true)}>Change food (keep amount)…</button>}
          {onRemove && (
            <button className="danger" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      )}
      {changing && (
        <FoodPicker
          title={`Replace ${item.name}`}
          onClose={() => setChanging(false)}
          onPick={(p) => {
            // Keep the amount; keep the unit if the new food has it, else fall back to its first sensible unit.
            const fresh = itemFromPicked(p);
            const same = p.units.find((u) => u.unit === item.unit);
            onChange({
              ...fresh,
              id: item.id,
              name: item.name,
              amount: item.amount,
              scaling: item.scaling,
              optional: item.optional,
              ...(same ? { unit: same.unit, gramsPerUnit: same.gramsPerUnit } : {}),
            });
            setChanging(false);
          }}
        />
      )}
    </div>
  );
}

export function ItemList({
  items,
  onChange,
  mainItemId,
  onMainChange,
  showScaling = true,
}: {
  items: RecipeItem[];
  onChange: (items: RecipeItem[]) => void;
  mainItemId?: string;
  onMainChange?: (id: string) => void;
  showScaling?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  return (
    <div>
      {items.map((it) => (
        <ItemRow
          key={it.id}
          item={it}
          isMain={it.id === mainItemId}
          onMakeMain={onMainChange ? () => onMainChange(it.id) : undefined}
          showScaling={showScaling}
          onChange={(n) => onChange(items.map((x) => (x.id === it.id ? n : x)))}
          onRemove={() => onChange(items.filter((x) => x.id !== it.id))}
        />
      ))}
      <div className="row">
        <button onClick={() => setPicking(true)}>+ Ingredient</button>
        <button onClick={() => setNoting(true)}>+ Note</button>
      </div>
      {noting && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) onChange([...items, { ...itemFromNote(note.trim()) }]);
            setNote('');
            setNoting(false);
          }}
        >
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note line (no calories), e.g. Seasonings, to taste" />
          <button className="primary" disabled={!note.trim()}>Add</button>
          <button type="button" onClick={() => setNoting(false)}>Cancel</button>
        </form>
      )}
      {picking && (
        <FoodPicker
          onClose={() => setPicking(false)}
          onPick={(p) => {
            const item = itemFromPicked(p);
            onChange([...items, item]);
            if (onMainChange && !mainItemId) onMainChange(item.id);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

function itemFromNote(text: string): RecipeItem {
  return {
    id: Math.random().toString(36).slice(2),
    name: text,
    food: { kind: 'none' },
    per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    amount: null,
    unit: 'to taste',
    gramsPerUnit: 0,
    scaling: 'fixed',
  };
}
