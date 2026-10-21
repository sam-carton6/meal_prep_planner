import { describe, expect, it } from 'vitest';
import { buildIndex, search } from './search';
import { forGrams } from './usda';

const items = [
  { name: 'Chicken, broilers or fryers, thigh, meat only, raw' },
  { name: 'Chicken, thigh, boneless, skinless, raw' },
  { name: 'Soup, chicken noodle, canned' },
  { name: 'Carrots, raw' },
  { name: 'Carrot juice, canned' },
  { name: 'Peas, green, frozen, unprepared' },
  { name: 'Beef, ground, 85% lean meat / 15% fat, raw' },
];
const index = buildIndex(items);
const names = (q: string) => search(index, q).map((i) => i.name);

describe('search', () => {
  it('matches word starts in any order', () => {
    expect(names('chick thigh')).toEqual([
      'Chicken, thigh, boneless, skinless, raw',
      'Chicken, broilers or fryers, thigh, meat only, raw',
    ]);
    expect(names('thigh chicken')).toHaveLength(2);
  });

  it('ranks names starting with the first word above ones that only contain it', () => {
    expect(names('chicken').at(-1)).toBe('Soup, chicken noodle, canned');
  });

  it('handles plurals both ways', () => {
    expect(names('carrots')).toContain('Carrot juice, canned');
    expect(names('carrot')).toContain('Carrots, raw');
    expect(names('pea')).toEqual(['Peas, green, frozen, unprepared']);
  });

  it('finds numbers like 85%', () => {
    expect(names('ground beef 85')).toEqual(['Beef, ground, 85% lean meat / 15% fat, raw']);
  });

  it('returns nothing for an empty query or no match', () => {
    expect(names('  ')).toEqual([]);
    expect(names('zzz')).toEqual([]);
  });
});

describe('forGrams', () => {
  it('scales per-100 g values', () => {
    // 4 cups dry rice at 185 g per cup, 365 kcal / 7.1 g protein per 100 g
    const n = forGrams({ kcal: 365, protein: 7.1, carbs: 80, fat: 0.7 }, 4 * 185);
    expect(Math.round(n.kcal)).toBe(2701);
    expect(Math.round(n.protein)).toBe(53);
  });
});
