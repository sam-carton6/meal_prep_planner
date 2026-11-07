import { pbkdf2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { afterWrongPin, canSave, hashPin, LOCK_MS, sameHex, validPin } from './auth';
import { modeFor } from '../src/sync';

describe('sync server rules', () => {
  it('hashes the PIN exactly like npm run set-pin does', async () => {
    const salt = '00112233445566778899aabbccddeeff';
    const node = pbkdf2Sync('123456', Buffer.from(salt, 'hex'), 100_000, 32, 'sha256').toString('hex');
    expect(await hashPin('123456', salt)).toBe(node);
    expect(await hashPin('123457', salt)).not.toBe(node);
  });

  it('only takes 6 digits', () => {
    expect(validPin('123456')).toBe(true);
    for (const p of ['12345', '1234567', '12345a', 123456, '']) expect(validPin(p)).toBe(false);
  });

  it('locks for 15 minutes on the 5th wrong PIN, then starts counting again', () => {
    let s = { fails: 0, lockedUntil: 0 };
    for (let i = 1; i <= 4; i++) {
      s = afterWrongPin(s.fails, 1000);
      expect(s).toEqual({ fails: i, lockedUntil: 0 });
    }
    expect(afterWrongPin(s.fails, 1000)).toEqual({ fails: 0, lockedUntil: 1000 + LOCK_MS });
  });

  it('compares hashes whole', () => {
    expect(sameHex('abcd', 'abcd')).toBe(true);
    expect(sameHex('abcd', 'abce')).toBe(false);
    expect(sameHex('abcd', 'abc')).toBe(false);
  });

  it('is a diode: only the live app (or a local test server) saves', () => {
    expect(canSave('meal-prep-planner.samcarton6.workers.dev')).toBe(true);
    expect(canSave('localhost:8787')).toBe(true);
    expect(canSave('staging-meal-prep-planner.samcarton6.workers.dev')).toBe(false);
    expect(canSave('29ad4c02-meal-prep-planner.samcarton6.workers.dev')).toBe(false);
    expect(canSave('evil.example.com')).toBe(false);
  });

  it('the app knows it is staging (read only) from its link', () => {
    expect(modeFor('meal-prep-planner.samcarton6.workers.dev')).toBe('live');
    expect(modeFor('staging-meal-prep-planner.samcarton6.workers.dev')).toBe('staging');
    expect(modeFor('29ad4c02-meal-prep-planner.samcarton6.workers.dev')).toBe('staging');
    expect(modeFor('localhost:8787')).toBe('live');
  });
});
