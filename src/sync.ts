// Sync (Nov 2026): the whole database goes online as one copy (worker/index.ts keeps the last 30), so the phone, the
// PC and the test app all show the same data. A device signs in once with Sam's 6-digit PIN.
//
// The live app saves a couple of seconds after each change and checks for a newer copy when it opens or comes back
// to the front. If both a device and the online copy changed since they last matched, Sam picks which to keep.
// Staging is a diode: it loads the live data when it opens (or on "Reload live data") and never saves; what's
// changed while testing stays on that device. The first copy goes up from the live app (signing in there when
// nothing is online yet).

import { db, exportAll, importAll, TABLES } from './db';

export type Mode = 'live' | 'staging';

/** Staging's link and Cloudflare's per-version preview links only read. */
export const modeFor = (host: string): Mode =>
  host.startsWith('staging-') || /^[0-9a-f]{8}-meal-prep-planner\./.test(host) ? 'staging' : 'live';

export type SyncState = 'signed-out' | 'syncing' | 'synced' | 'waiting' | 'offline' | 'conflict' | 'error';

export interface SyncStatus {
  mode: Mode;
  state: SyncState;
  /** When this device last matched the online copy. */
  lastSynced?: string;
  /** Nothing is online yet. */
  serverEmpty?: boolean;
  message?: string;
}

type Remote = { id: number; savedAt: string; data: Record<string, unknown> };

const KEY = { token: 'sync.token', base: 'sync.base', dirty: 'sync.dirty', last: 'sync.last' };
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ }
  },
};

const mode: Mode = typeof location === 'undefined' ? 'live' : modeFor(location.host);
let status: SyncStatus = { mode, state: store.get(KEY.token) ? 'synced' : 'signed-out', lastSynced: store.get(KEY.last) ?? undefined };
let conflict: Remote | null = null;
let applying = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let loadedThisSession = false;
const listeners = new Set<() => void>();

function set(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export const getStatus = () => status;
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

const device = () => (/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Windows/.test(navigator.userAgent) ? 'Windows PC' : 'browser');
const base = () => { const b = store.get(KEY.base); return b ? Number(b) : null; };

async function api(path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const token = store.get(KEY.token);
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && path !== '/api/login') {
    store.set(KEY.token, null);
    set({ state: 'signed-out', message: String(body.error ?? 'Signed out.') });
  }
  return { status: res.status, body };
}

/** Put a copy from online into the app (without counting it as a change to save). */
async function apply(r: Remote) {
  applying = true;
  try {
    await importAll(r.data);
  } finally {
    applying = false;
  }
  matched(r.id, r.savedAt);
}
function matched(id: number, savedAt: string) {
  store.set(KEY.base, String(id));
  store.set(KEY.dirty, null);
  store.set(KEY.last, savedAt);
  set({ state: 'synced', lastSynced: savedAt, serverEmpty: false, message: undefined });
}

async function pull(force = false) {
  const { status: code, body } = await api('/api/data');
  if (code !== 200) return code === 401 ? undefined : set({ state: 'error', message: String(body.error ?? `Error ${code}`) });
  if (body.id === null) return set({ state: 'synced', serverEmpty: true });
  const r = body as unknown as Remote;
  if (force || r.id !== base()) await apply(r);
  else set({ state: 'synced', serverEmpty: false });
}

async function push(seed = false) {
  const data = await exportAll();
  const { status: code, body } = await api('/api/data', { method: 'PUT', body: JSON.stringify({ base: seed ? null : base(), data, device: device() }) });
  if (code === 200) return matched(Number(body.id), String(body.savedAt));
  if (code === 409) {
    conflict = body as unknown as Remote;
    return set({ state: 'conflict', message: `Changed on another device (${new Date(conflict.savedAt).toLocaleString()}).` });
  }
  if (code !== 401) set({ state: 'error', message: String(body.error ?? `Error ${code}`) });
}

/** Check in with the online copy: save this device's changes (live) or load newer data. */
export async function syncNow() {
  if (!store.get(KEY.token) || status.state === 'conflict') return;
  set({ state: 'syncing' });
  try {
    if (mode === 'staging') {
      if (!loadedThisSession) await pull(true);
      else set({ state: 'synced' });
      loadedThisSession = true;
    } else if (store.get(KEY.dirty)) await push();
    else await pull();
  } catch {
    set({ state: 'offline', message: undefined });
  }
}

function changed() {
  if (applying || mode === 'staging') return; // staging: test changes stay on this device
  store.set(KEY.dirty, '1');
  if (!store.get(KEY.token)) return;
  set({ state: 'waiting' });
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), 2000);
}

/** Watch the database for changes and the app coming back to the front. Called once at start. */
export function startSync() {
  for (const t of TABLES) {
    const table = db.table(t);
    table.hook('creating', changed);
    table.hook('updating', changed);
    table.hook('deleting', changed);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(); });
  window.addEventListener('online', () => void syncNow());
  void syncNow();
}

export async function signIn(pin: string): Promise<string | null> {
  try {
    const { status: code, body } = await api('/api/login', { method: 'POST', body: JSON.stringify({ pin, device: device() }) });
    if (code !== 200) {
      if (body.lockedForSeconds) return `Too many wrong PINs: try again in ${Math.ceil(Number(body.lockedForSeconds) / 60)} min.`;
      if (body.triesLeft !== undefined) return `Wrong PIN (${body.triesLeft} ${body.triesLeft === 1 ? 'try' : 'tries'} left before a 15-minute lock).`;
      return String(body.error ?? `Error ${code}`);
    }
    store.set(KEY.token, String(body.token));
    // A new device takes the online copy; nothing online yet → this one's data goes up as the first copy.
    store.set(KEY.base, null);
    store.set(KEY.dirty, null);
    loadedThisSession = false;
    set({ state: 'syncing', message: undefined });
    const { body: online } = await api('/api/data');
    if (online.id === null) {
      if (mode === 'live') await push(true);
      else set({ state: 'synced', serverEmpty: true });
    } else {
      await apply(online as unknown as Remote);
      loadedThisSession = true;
    }
    return null;
  } catch {
    return "Couldn't reach the server. Check the connection and try again.";
  }
}

export async function signOut() {
  await api('/api/logout', { method: 'POST' }).catch(() => undefined);
  for (const k of Object.values(KEY)) store.set(k, null);
  set({ state: 'signed-out', lastSynced: undefined, message: undefined });
}

/** After "changed on another device": keep the online copy, or this device's. */
export async function resolveConflict(keep: 'online' | 'mine') {
  const c = conflict;
  conflict = null;
  if (!c) return;
  if (keep === 'online') await apply(c);
  else {
    store.set(KEY.base, String(c.id));
    set({ state: 'syncing' });
    await push();
  }
}

/** Staging: load the live data again, dropping test changes. */
export async function reloadLive() {
  set({ state: 'syncing' });
  try {
    await pull(true);
  } catch {
    set({ state: 'offline' });
  }
}
