// Ingredient search: every word typed must match the start of a word in the food's name,
// so "chick thigh" finds "Chicken, thigh, boneless, skinless, raw".

export interface Searchable {
  name: string;
  source?: string;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9%]+/)
    .filter(Boolean);
}

// "carrots" should also find "Carrot…", so drop a trailing s from longer query words.
function stem(word: string): string {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

export interface IndexedItem<T> {
  item: T;
  words: string[];
}

export function buildIndex<T extends Searchable>(items: T[]): IndexedItem<T>[] {
  return items.map((item) => ({ item, words: words(item.name) }));
}

/**
 * Lower score = better. Prefers names whose first word matches the first query word,
 * matches near the start of the name, short names, and "raw" items (what you buy).
 */
function score(entry: IndexedItem<Searchable>, query: string[]): number | null {
  let total = 0;
  for (let qi = 0; qi < query.length; qi++) {
    const q = query[qi];
    const pos = entry.words.findIndex((w) => w.startsWith(q));
    if (pos === -1) return null;
    total += pos;
    if (qi === 0 && pos !== 0) total += 5;
  }
  total += entry.words.length * 0.3;
  if (entry.words.includes('raw')) total -= 1;
  return total;
}

export function search<T extends Searchable>(index: IndexedItem<T>[], text: string, limit = 50): T[] {
  const query = words(text).map(stem);
  if (query.length === 0) return [];
  const hits: { item: T; s: number }[] = [];
  for (const entry of index) {
    const s = score(entry, query);
    if (s !== null) hits.push({ item: entry.item, s });
  }
  hits.sort((a, b) => a.s - b.s || a.item.name.localeCompare(b.item.name));
  return hits.slice(0, limit).map((h) => h.item);
}
