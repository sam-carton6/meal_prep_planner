import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { buildIndex, search } from './search';
import { forGrams, loadFoods, SOURCE_NAMES, type Food, type Nutrition } from './usda';

const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString());

export default function App() {
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    loadFoods().then(setFoods, (e: Error) => setError(e.message));
  }, []);

  const index = useMemo(() => (foods ? buildIndex(foods) : []), [foods]);
  const results = useMemo(() => search(index, deferredQuery), [index, deferredQuery]);

  if (selected) return <FoodDetail food={selected} onBack={() => setSelected(null)} />;

  return (
    <main>
      <header>
        <h1>Ingredients</h1>
        <input
          type="search"
          placeholder="Search, e.g. chicken thigh raw"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoCorrect="off"
          autoCapitalize="off"
          enterKeyHint="search"
        />
      </header>

      {error && <p className="note error">{error}</p>}
      {!foods && !error && <p className="note">Loading ingredients…</p>}
      {foods && !query.trim() && (
        <p className="note">{foods.length.toLocaleString()} USDA ingredients, works offline. Type to search.</p>
      )}
      {foods && query.trim() && results.length === 0 && <p className="note">No matches.</p>}

      <ul className="results">
        {results.map((f) => (
          <li key={f.id}>
            <button onClick={() => setSelected(f)}>
              <span className="name">{f.name}</span>
              <span className="meta">
                {fmt(f.per100g.kcal)} kcal · {fmt(f.per100g.protein)} g protein per 100 g ·{' '}
                {f.source === 'fd' ? 'Foundation' : 'SR Legacy'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

function FoodDetail({ food, onBack }: { food: Food; onBack: () => void }) {
  return (
    <main>
      <header>
        <button className="back" onClick={onBack}>
          ‹ Back
        </button>
        <h1 className="detail-title">{food.name}</h1>
        <p className="meta">
          {food.group} · {SOURCE_NAMES[food.source]} #{food.id}
        </p>
      </header>

      <table>
        <thead>
          <tr>
            <th>Amount</th>
            <th>kcal</th>
            <th>Protein</th>
            <th>Carbs</th>
            <th>Fat</th>
          </tr>
        </thead>
        <tbody>
          <Row label="100 g" n={food.per100g} />
          <Row label="1 oz (28 g)" n={forGrams(food.per100g, 28.35)} />
          <Row label="1 lb (454 g)" n={forGrams(food.per100g, 453.6)} />
          {food.portions.map((p) => (
            <Row key={p.label} label={`${p.label} (${fmt(p.grams)} g)`} n={forGrams(food.per100g, p.grams)} />
          ))}
        </tbody>
      </table>
      {food.portions.length === 0 && <p className="note">USDA lists no household portions for this one; use weight.</p>}
    </main>
  );
}

function Row({ label, n }: { label: string; n: Nutrition }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{fmt(n.kcal)}</td>
      <td>{fmt(n.protein)} g</td>
      <td>{fmt(n.carbs)} g</td>
      <td>{fmt(n.fat)} g</td>
    </tr>
  );
}
