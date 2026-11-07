// More → Sync: sign this device in with the PIN, see when it last matched the online copy, settle "changed on another
// device", and on staging reload the live data. The rules are in src/sync.ts.

import { useState, useSyncExternalStore } from 'react';
import { getStatus, reloadLive, resolveConflict, signIn, signOut, subscribe, syncNow, type SyncStatus } from '../sync';
import { Sheet } from './shared';

export const useSync = () => useSyncExternalStore(subscribe, getStatus);

const ago = (iso?: string) => {
  if (!iso) return 'not yet';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : new Date(iso).toLocaleString();
};

export function syncLine(s: SyncStatus): string {
  switch (s.state) {
    case 'signed-out': return 'Not signed in: data stays on this device';
    case 'syncing': return 'Syncing…';
    case 'waiting': return 'Saving…';
    case 'offline': return 'Offline: will sync when back online';
    case 'conflict': return 'Changed on another device: pick which to keep';
    case 'error': return `Sync problem: ${s.message ?? ''}`;
    default:
      if (s.serverEmpty) return s.mode === 'staging' ? 'Nothing online yet: sign in on the live app first' : 'Signed in';
      return s.mode === 'staging' ? `Test copy of your live data (loaded ${ago(s.lastSynced)})` : `Synced ${ago(s.lastSynced)}`;
  }
}

export function SyncPage({ onClose }: { onClose: () => void }) {
  const s = useSync();
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    setMsg((await signIn(pin)) ?? '');
    setPin('');
    setBusy(false);
  };

  return (
    <Sheet title="Sync" onClose={onClose}>
      {s.mode === 'staging' ? (
        <p className="note">
          <b>This is the test app.</b> It loads your live data when it opens. Anything you change here stays on this device and
          never reaches your real data.
        </p>
      ) : (
        <p className="note">Your data is saved online and shows up on every device you sign in on (phone, PC).</p>
      )}

      {s.state === 'signed-out' ? (
        <form onSubmit={(e) => { e.preventDefault(); void go(); }}>
          <p className="note">
            Enter your 6-digit PIN once on this device. {s.mode === 'live' && 'If your data is already online, it replaces what is on this device; if not, this device\'s data goes up as the first copy.'}
          </p>
          <div className="row">
            <input
              type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} placeholder="PIN"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
            <button className="primary" type="submit" disabled={pin.length !== 6 || busy}>Sign in</button>
          </div>
        </form>
      ) : (
        <>
          <p><b>{syncLine(s)}</b></p>
          {s.state === 'conflict' && (
            <div className="card">
              <p className="note">{s.message} This device has changes too. Which copy do you want?</p>
              <div className="row">
                <button onClick={() => void resolveConflict('online')}>Use the online copy</button>
                <button onClick={() => void resolveConflict('mine')}>Keep this device's</button>
              </div>
            </div>
          )}
          <div className="row">
            {s.mode === 'staging'
              ? <button onClick={() => void reloadLive()}>Reload live data</button>
              : <button onClick={() => void syncNow()}>Sync now</button>}
            <button className="link small muted" onClick={() => void signOut()}>Sign out this device</button>
          </div>
        </>
      )}
      {msg && <p className="error">{msg}</p>}
    </Sheet>
  );
}
