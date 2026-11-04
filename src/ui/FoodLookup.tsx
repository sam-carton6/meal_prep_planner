// More → Look up a packaged food: search Open Food Facts by name or barcode number, check the label values, and
// save only the ones picked into My foods.

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Nutrition } from '../model';
import { isBarcode, lookup, offToCustomFood, type OffProduct } from '../off';
import { r0, r1, Sheet } from './shared';

export function FoodLookup({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<OffProduct[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [saved, setSaved] = useState('');
  const mine = useLiveQuery(() => db.customFoods.toArray(), []) ?? [];
  const have = new Set(mine.map((f) => f.barcode).filter(Boolean));

  const go = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setError('');
    setSaved('');
    setPicked(new Set());
    setOpen(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error("You're offline. Looking foods up needs internet.");
      const r = await lookup(q);
      setResults(r);
      if (r.length === 1) setOpen(0);
    } catch (e) {
      setError((e as Error).message);
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!results) return;
    const foods = results.filter((_, i) => picked.has(i)).map(offToCustomFood);
    await db.customFoods.bulkAdd(foods);
    setSaved(`Saved ${foods.map((f) => f.name).join(', ')} to My foods. They're in the meal bank now.`);
    setPicked(new Set());
  };

  return (
    <Sheet title="Look up a packaged food" onClose={onClose}>
      <form
        className="row lookup-form"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, or the barcode number"
          autoCorrect="off" autoCapitalize="off" enterKeyHint="search" />
        <button className="primary" disabled={busy || !q.trim()}>{busy ? 'Looking…' : isBarcode(q) ? 'Look up' : 'Search'}</button>
      </form>
      <p className="note">
        From Open Food Facts (free; anyone can add or fix products, so check the numbers against the package). Barcode = the
        digits under the stripes.
      </p>
      {error && <p className="error">{error}</p>}
      {saved && <p className="ok-note">{saved}</p>}
      {results && results.length === 0 && (
        <p className="note">Nothing found. Try fewer words (e.g. brand + product), or the barcode number.</p>
      )}
      <ul className="results lookup">
        {results?.map((p, i) => {
          const already = p.code && have.has(p.code);
          const main = p.perServing && p.servingGrams ? p.perServing : p.per100g;
          return (
            <li key={`${p.code}-${i}`}>
              <div className="lookup-row">
                <input type="checkbox" aria-label={`Pick ${p.name}`} checked={picked.has(i)} disabled={!!already}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    setPicked(next);
                  }} />
                <button className="link-plain" onClick={() => setOpen(open === i ? null : i)}>
                  <span className="name">{p.name}</span>
                  <span className="meta">
                    {[p.brand, p.quantity].filter(Boolean).join(' · ')}
                    {already ? ' · already in My foods' : ''}
                  </span>
                  {main && (
                    <span className="meta">
                      {r0(main.kcal)} kcal · {r1(main.protein)} g protein per {main === p.perServing ? (p.servingLabel ?? 'serving') : '100 g'}
                    </span>
                  )}
                </button>
              </div>
              {open === i && <Label p={p} />}
            </li>
          );
        })}
      </ul>
      {picked.size > 0 && (
        <div className="row actions sticky-save">
          <button className="primary" onClick={save}>Save {picked.size} to My foods</button>
        </div>
      )}
    </Sheet>
  );
}

function Label({ p }: { p: OffProduct }) {
  const cols: [string, Nutrition | undefined][] = [
    ['Per 100 g', p.per100g],
    [p.servingLabel ? `Per serving (${p.servingLabel})` : 'Per serving', p.perServing],
  ];
  return (
    <table className="label">
      <thead>
        <tr><th /> {cols.filter(([, n]) => n).map(([h]) => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
          <tr key={k}>
            <td>{k === 'kcal' ? 'Calories' : k[0].toUpperCase() + k.slice(1)}</td>
            {cols.filter(([, n]) => n).map(([h, n]) => <td key={h}>{k === 'kcal' ? r0(n![k]) : `${r1(n![k])} g`}</td>)}
          </tr>
        ))}
      </tbody>
      {p.code && <caption className="meta">Barcode {p.code}</caption>}
    </table>
  );
}
