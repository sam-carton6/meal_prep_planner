// The sync server (Nov 2026): /api/* on the same Worker that serves the app. The app's data is one JSON snapshot
// per save in D1 (the last 30 kept). A device signs in once with Sam's 6-digit PIN and gets a token; 5 wrong PINs
// lock sign-in for 15 minutes. Only the live app saves (see canSave in auth.ts): staging only reads.
//
//   POST /api/login   { pin, device }        → { token }        (401 wrong PIN, 429 locked, 503 no PIN set yet)
//   GET  /api/data                            → { id, savedAt, data } or { id: null } when nothing is saved
//   PUT  /api/data    { base, data, device }  → { id, savedAt }  (409 + the newer copy if base isn't the latest)
//   POST /api/logout                          → {}               (this device's token is dropped)

import { afterWrongPin, canSave, hashPin, KEEP_SNAPSHOTS, MAX_FAILS, sameHex, sha256, toHex, validPin } from './auth';

// Just what's used of Cloudflare's types, so the project needs no extra type package.
interface D1Result<T> { results: T[] }
interface D1Statement {
  bind(...v: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
interface Env {
  DB: { prepare(sql: string): D1Statement; batch(s: D1Statement[]): Promise<unknown> };
  ASSETS: { fetch(r: Request): Promise<Response> };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function signedIn(req: Request, env: Env): Promise<boolean> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return false;
  return !!(await env.DB.prepare('SELECT hash FROM tokens WHERE hash = ?').bind(await sha256(token)).first());
}

async function login(req: Request, env: Env): Promise<Response> {
  const { pin, device } = (await req.json().catch(() => ({}))) as { pin?: unknown; device?: unknown };
  const auth = await env.DB.prepare('SELECT pin_hash, salt, fails, locked_until FROM auth WHERE id = 1')
    .first<{ pin_hash: string; salt: string; fails: number; locked_until: number }>();
  if (!auth) return json({ error: 'No PIN set yet: run `npm run set-pin` on the PC.' }, 503);
  const now = Date.now();
  if (auth.locked_until > now) {
    return json({ error: 'Too many wrong PINs.', lockedForSeconds: Math.ceil((auth.locked_until - now) / 1000) }, 429);
  }
  if (!validPin(pin) || !sameHex(await hashPin(pin, auth.salt), auth.pin_hash)) {
    const next = afterWrongPin(auth.fails, now);
    await env.DB.prepare('UPDATE auth SET fails = ?, locked_until = ? WHERE id = 1').bind(next.fails, next.lockedUntil).run();
    return next.lockedUntil
      ? json({ error: 'Too many wrong PINs.', lockedForSeconds: Math.ceil((next.lockedUntil - now) / 1000) }, 429)
      : json({ error: 'Wrong PIN.', triesLeft: MAX_FAILS - next.fails }, 401);
  }
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare('UPDATE auth SET fails = 0, locked_until = 0 WHERE id = 1'),
    env.DB.prepare('INSERT INTO tokens (hash, device, created_at) VALUES (?, ?, ?)')
      .bind(await sha256(token), String(device ?? '').slice(0, 80), new Date().toISOString()),
  ]);
  return json({ token });
}

type Latest = { id: number; saved_at: string; data?: string };

async function getData(env: Env): Promise<Response> {
  const row = await env.DB.prepare('SELECT id, saved_at, data FROM snapshots ORDER BY id DESC LIMIT 1').first<Latest>();
  return json(row ? { id: row.id, savedAt: row.saved_at, data: JSON.parse(row.data!) } : { id: null });
}

async function putData(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { base?: number | null; data?: { app?: string }; device?: string } | null;
  if (!body?.data || body.data.app !== 'meal-prep-planner') return json({ error: 'Not a Meal Prep Planner copy.' }, 400);
  const latest = await env.DB.prepare('SELECT id, saved_at FROM snapshots ORDER BY id DESC LIMIT 1').first<Latest>();
  if (!canSave(new URL(req.url).host)) return json({ error: 'This is the test copy (staging): it only reads.' }, 403);
  if (latest && body.base !== latest.id) return getData(env).then(async (r) => json(await r.json(), 409));
  const savedAt = new Date().toISOString();
  const row = await env.DB.prepare('INSERT INTO snapshots (saved_at, device, data) VALUES (?, ?, ?) RETURNING id')
    .bind(savedAt, String(body.device ?? '').slice(0, 80), JSON.stringify(body.data)).first<{ id: number }>();
  await env.DB.prepare('DELETE FROM snapshots WHERE id <= ?').bind(row!.id - KEEP_SNAPSHOTS).run();
  return json({ id: row!.id, savedAt });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (pathname === '/api/login' && req.method === 'POST') return await login(req, env);
      if (!(await signedIn(req, env))) return json({ error: 'Signed out: enter your PIN again.' }, 401);
      if (pathname === '/api/data' && req.method === 'GET') return await getData(env);
      if (pathname === '/api/data' && req.method === 'PUT') return await putData(req, env);
      if (pathname === '/api/logout' && req.method === 'POST') {
        const token = req.headers.get('authorization')!.replace(/^Bearer /, '');
        await env.DB.prepare('DELETE FROM tokens WHERE hash = ?').bind(await sha256(token)).run();
        return json({});
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: `Server problem: ${(e as Error).message}` }, 500);
    }
  },
};
