// npm run set-pin: Sam sets (or changes) the 6-digit sync PIN. Typed here, hidden, never shown or saved anywhere
// but as a salted hash in the D1 database. Changing it signs every device out. Add --local for the test database
// that `wrangler dev` uses.
import { spawnSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const where = process.argv.includes('--local') ? '--local' : '--remote';

// One reader for both questions; what's typed shows as dots.
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
rl._writeToOutput = (s) => rl.output.write(s.replace(/[^\r\n]/g, '•'));
const lines = rl[Symbol.asyncIterator]();
const ask = async (question) => {
  process.stdout.write(question);
  return String((await lines.next()).value ?? '').trim();
};

const pin = await ask('New 6-digit PIN: ');
if (!/^\d{6}$/.test(pin)) {
  console.error('\nIt has to be exactly 6 digits. Nothing changed.');
  process.exit(1);
}
const again = await ask('\nSame PIN again: ');
rl.close();
process.stdout.write('\n');
if (again !== pin) {
  console.error("They didn't match. Nothing changed.");
  process.exit(1);
}
const salt = randomBytes(16).toString('hex');
const hash = pbkdf2Sync(pin, Buffer.from(salt, 'hex'), 100_000, 32, 'sha256').toString('hex'); // same as worker/auth.ts
const sql =
  `INSERT INTO auth (id, pin_hash, salt, fails, locked_until) VALUES (1, '${hash}', '${salt}', 0, 0) ` +
  `ON CONFLICT(id) DO UPDATE SET pin_hash = excluded.pin_hash, salt = excluded.salt, fails = 0, locked_until = 0; DELETE FROM tokens;`;
// Through a file: Windows' shell splits a long --command apart. Output hidden so the hash never shows on screen.
const file = join(tmpdir(), `set-pin-${process.pid}.sql`);
writeFileSync(file, sql);
const run = spawnSync(`npx wrangler d1 execute meal-prep-planner ${where} --yes --file "${file}"`, { shell: true, encoding: 'utf8' });
rmSync(file, { force: true });
if (run.status !== 0) {
  console.error("Couldn't save the PIN (nothing changed). Wrangler said:");
  console.error(String(run.stderr || run.stdout).replace(/[0-9a-f]{32,}/g, '…').split('\n').filter((l) => l.trim()).slice(0, 8).join('\n'));
  process.exit(1);
}
console.log(`PIN set (${where === '--local' ? 'test database' : 'online'}). Every device needs it once to sign in again.`);
