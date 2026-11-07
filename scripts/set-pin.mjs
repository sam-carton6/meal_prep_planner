// npm run set-pin: Sam sets (or changes) the 6-digit sync PIN. Typed here, hidden, never shown or saved anywhere
// but as a salted hash in the D1 database. Changing it signs every device out. Add --local for the test database
// that `wrangler dev` uses.
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

const where = process.argv.includes('--local') ? '--local' : '--remote';

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? s : s.replace(/[^\r\n]/g, '•'));
    rl.question(question, (a) => {
      rl.close();
      process.stdout.write('\n');
      resolve(a.trim());
    });
  });
}

const pin = await ask('New 6-digit PIN: ');
if (!/^\d{6}$/.test(pin)) {
  console.error('It has to be exactly 6 digits. Nothing changed.');
  process.exit(1);
}
if ((await ask('Same PIN again: ')) !== pin) {
  console.error("They didn't match. Nothing changed.");
  process.exit(1);
}
const salt = randomBytes(16).toString('hex');
const hash = pbkdf2Sync(pin, Buffer.from(salt, 'hex'), 100_000, 32, 'sha256').toString('hex'); // same as worker/auth.ts
const sql =
  `INSERT INTO auth (id, pin_hash, salt, fails, locked_until) VALUES (1, '${hash}', '${salt}', 0, 0) ` +
  `ON CONFLICT(id) DO UPDATE SET pin_hash = excluded.pin_hash, salt = excluded.salt, fails = 0, locked_until = 0; DELETE FROM tokens;`;
execFileSync('npx', ['wrangler', 'd1', 'execute', 'meal-prep-planner', where, '--command', sql], { stdio: ['ignore', 'ignore', 'inherit'], shell: true });
console.log(`PIN set (${where === '--local' ? 'test database' : 'online'}). Every device needs it once to sign in again.`);
