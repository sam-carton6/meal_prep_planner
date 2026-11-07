// The sync server's rules, kept apart from the request handling so they're tested (worker/auth.test.ts).
// Runs on Cloudflare (Workers) and in Node (tests, scripts/set-pin.mjs does the same hashing).

export const LIVE_HOST = 'meal-prep-planner.samcarton6.workers.dev';
export const PIN_DIGITS = 6;
export const MAX_FAILS = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const KEEP_SNAPSHOTS = 30;
const ITERATIONS = 100_000; // Workers' PBKDF2 limit

export const toHex = (b: ArrayBuffer | Uint8Array) =>
  [...(b instanceof Uint8Array ? b : new Uint8Array(b))].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

/** Salted PBKDF2-SHA256 of the PIN, as hex (the same as scripts/set-pin.mjs). */
export async function hashPin(pin: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: ITERATIONS }, key, 256);
  return toHex(bits);
}

export async function sha256(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Same length strings compared without stopping at the first difference. */
export function sameHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const validPin = (pin: unknown): pin is string => typeof pin === 'string' && new RegExp(`^\\d{${PIN_DIGITS}}$`).test(pin);

/** After a wrong PIN: one more fail, and a 15-minute lock (fails reset) on the 5th. */
export function afterWrongPin(fails: number, now: number): { fails: number; lockedUntil: number } {
  const n = fails + 1;
  return n >= MAX_FAILS ? { fails: 0, lockedUntil: now + LOCK_MS } : { fails: n, lockedUntil: 0 };
}

/** The diode: only the live app saves; staging (and its preview links) only reads. Local test servers count as live. */
export function canSave(host: string): boolean {
  const name = host.split(':')[0];
  return name === LIVE_HOST || name === 'localhost' || name === '127.0.0.1';
}
