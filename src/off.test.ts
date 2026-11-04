import { describe, expect, it } from 'vitest';
import { isBarcode, lookup, offToCustomFood, parseBarcodeReply, parseSearchReply, servingGramsFrom, unitFromServing } from './off';

// Replies shaped like Open Food Facts' documented API (api/v2/product and cgi/search.pl). The cloud machine
// these were written on can't reach the site, so these are made by hand in that shape, not recorded.
const product = {
  code: '0850024311047',
  product_name: 'Naked Mass Chocolate',
  brands: 'Naked Nutrition, Naked',
  quantity: '8 lb',
  serving_size: '4 scoops (333 g)',
  serving_quantity: 333,
  nutriments: {
    'energy-kcal_100g': 408.4, proteins_100g: 15, carbohydrates_100g: 75.4, fat_100g: 4.5,
    'energy-kcal_serving': 1360, proteins_serving: 50, carbohydrates_serving: 251, fat_serving: 15,
  },
};
const kjOnly = { code: '123', product_name: 'Oat biscuits', nutriments: { energy_100g: 2000, energy_unit: 'kJ', proteins_100g: 7 } };
const noNumbers = { code: '9', product_name: 'Mystery', nutriments: {} };

describe('Open Food Facts', () => {
  it('tells barcodes from names', () => {
    expect(isBarcode('0850024311047')).toBe(true);
    expect(isBarcode('5000 1590 1234 5')).toBe(true);
    expect(isBarcode('naked mass')).toBe(false);
    expect(isBarcode('1234')).toBe(false);
  });

  it('reads a barcode reply: label per serving and per 100 g', () => {
    const p = parseBarcodeReply({ status: 1, product })!;
    expect(p).toMatchObject({ name: 'Naked Mass Chocolate', brand: 'Naked Nutrition', servingGrams: 333 });
    expect(p.perServing).toEqual({ kcal: 1360, protein: 50, carbs: 251, fat: 15 });
    expect(p.per100g!.kcal).toBeCloseTo(408.4);
    expect(parseBarcodeReply({ status: 0, status_verbose: 'product not found' })).toBeNull();
  });

  it('works out kcal from kJ, per serving from per 100 g, and skips products with no numbers', () => {
    const list = parseSearchReply({ products: [kjOnly, noNumbers, { ...kjOnly, code: '124', serving_size: '2 biscuits (25 g)' }] });
    expect(list).toHaveLength(2);
    expect(list[0].per100g!.kcal).toBeCloseTo(478, 0);
    expect(list[1].servingGrams).toBe(25);
    expect(list[1].perServing!.kcal).toBeCloseTo(119.5, 0);
  });

  it('reads serving weights written different ways', () => {
    expect(servingGramsFrom('1 scoop (55 g)')).toBe(55);
    expect(servingGramsFrom('30g')).toBe(30);
    expect(servingGramsFrom('2 oz')).toBeCloseTo(56.7);
    expect(servingGramsFrom('1 bar')).toBeUndefined();
    expect(unitFromServing('2 biscuits (25 g)', 25)).toEqual({ unit: 'biscuit', grams: 12.5 });
    expect(unitFromServing('1 bar (40 g)', 40)).toEqual({ unit: 'bar', grams: 40 });
    expect(unitFromServing('30 g', 30)).toBeUndefined();
  });

  it('saves per serving when the label has one, else per 100 g', () => {
    const nm = offToCustomFood(parseBarcodeReply({ status: 1, product })!);
    expect(nm).toMatchObject({ name: 'Naked Mass Chocolate', brand: 'Naked Nutrition', barcode: '0850024311047',
      servingLabel: '1 serving (4 scoops, 333 g)', servingGrams: 333, units: [{ unit: 'scoop', grams: 83.25 }] });
    expect(nm.perServing.kcal).toBe(1360);
    const oat = offToCustomFood(parseSearchReply({ products: [kjOnly] })[0]);
    expect(oat).toMatchObject({ servingLabel: '100 g', servingGrams: 100 });
  });

  it('asks the right address and explains failures plainly', async () => {
    const calls: string[] = [];
    const ok = (body: unknown, status = 200) => (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    expect(await lookup('0850024311047', ok({ status: 1, product }))).toHaveLength(1);
    expect(calls[0]).toMatch(/\/api\/v2\/product\/0850024311047\.json/);
    await lookup('naked mass', ok({ products: [product] }));
    expect(calls[1]).toMatch(/search_terms=naked%20mass/);
    expect(await lookup('00000000', ok({ status: 0 }, 404))).toEqual([]);
    await expect(lookup('x y', ok({}, 429))).rejects.toThrow(/too many searches/);
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(lookup('rice', offline)).rejects.toThrow(/needs internet/);
  });
});
