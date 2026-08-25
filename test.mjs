// Run: node test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dayKey, addDays, gridDays, level, currentStreak, longestStreak, total, thisWeek, seedUsers, normalizeHandle, coverCrop, sanitizeState } from './logic.js';

const today = new Date(2026, 7, 18); // 18 Aug 2026, a Tuesday
const key = (n) => dayKey(addDays(today, n));
const build = (offsets) => Object.fromEntries(offsets.map((o) => [key(o), { count: 1 }]));

// dayKey is local-time, zero padded
assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');

// level buckets
assert.deepEqual([0, 1, 2, 3, 5, 6, 9, 10, 99].map(level), [0, 1, 1, 2, 2, 3, 3, 4, 4]);

// grid: whole weeks, Sunday-first, ends today
const grid = gridDays(today, 53);
assert.equal(grid.length % 7, 3, 'partial final week is expected (Tue = 3 days in)');
assert.equal(grid.at(-1).key, dayKey(today));
assert.equal(grid[0].date.getDay(), 0, 'first cell is a Sunday');
assert.equal(grid[0].dayIndex, 0);
assert.equal(grid.at(-1).weekIndex, 52);

// streak: today logged
assert.equal(currentStreak(build([0, -1, -2]), today), 3);
// streak: today NOT logged yet, yesterday was - streak survives
assert.equal(currentStreak(build([-1, -2, -3]), today), 3);
// streak: gap two days back breaks it
assert.equal(currentStreak(build([0, -1, -3, -4]), today), 2);
// streak: nothing recent
assert.equal(currentStreak(build([-5, -6]), today), 0);
assert.equal(currentStreak({}, today), 0);
// zero-count days do not count as logged
assert.equal(currentStreak({ [key(0)]: { count: 0 }, [key(-1)]: { count: 4 } }, today), 1);

// longest streak spans a gap
assert.equal(longestStreak(build([-1, -2, -3, -8, -9])), 3);
assert.equal(longestStreak({}), 0);

// totals
const days = { [key(0)]: { count: 5 }, [key(-2)]: { count: 3 }, [key(-30)]: { count: 7 } };
assert.equal(total(days), 15);
assert.equal(thisWeek(days, today), 8, 'rolling 7 days excludes the 30-day-old entry');

// seeded users are deterministic and non-empty
assert.deepEqual(seedUsers(today), seedUsers(today));
assert.ok(seedUsers(today).every((u) => u.total > 0));
// the board only motivates if somebody on it is visibly keeping a chain alive
assert.ok(seedUsers(today)[0].streak > 30);

// handles are slugified, never empty
assert.equal(normalizeHandle('@Maya Osei'), 'maya-osei');
assert.equal(normalizeHandle('  DevShips '), 'devships');
assert.equal(normalizeHandle('@@@'), 'you');
assert.equal(normalizeHandle('!!!'), 'you');
assert.equal(normalizeHandle('x'.repeat(40)).length, 20);
assert.equal(normalizeHandle('a b!'), 'a-b', 'trailing dash from the trimmed junk is dropped');

// avatar crop is a centred square of the short side
assert.deepEqual(coverCrop(200, 100), { sx: 50, sy: 0, side: 100 });
assert.deepEqual(coverCrop(100, 400), { sx: 0, sy: 150, side: 100 });
assert.deepEqual(coverCrop(64, 64), { sx: 0, sy: 0, side: 64 });


// --- sanitizeState: untrusted storage and imported files ---
const DEFAULTS = { profile: { name: 'Your Name', handle: 'you', bio: 'Founder.', avatar: '' }, days: {} };
const clean = (raw) => sanitizeState(raw, DEFAULTS);

assert.deepEqual(clean(null), DEFAULTS, 'garbage in, defaults out');
assert.deepEqual(clean('nope'), DEFAULTS);
assert.deepEqual(clean({ days: { 'not-a-date': { count: 3 }, '2026-08-18': { count: 3 } } }).days, {
  '2026-08-18': { count: 3 },
});
assert.deepEqual(clean({ days: { '2026-08-18': { count: '4' } } }).days, { '2026-08-18': { count: 4 } });
assert.deepEqual(clean({ days: { '2026-08-18': { count: 9e9 } } }).days, { '2026-08-18': { count: 500 } });
assert.deepEqual(clean({ days: { '2026-08-18': { count: 0 }, '2026-08-17': { count: 'x' } } }).days, {});
assert.equal(clean({ days: { '2026-08-18': { count: 2, note: ' hi ' } } }).days['2026-08-18'].note, 'hi');
// a javascript: URL must never reach the avatar CSS url()
assert.equal(clean({ profile: { avatar: 'javascript:alert(1)' } }).profile.avatar, '');
assert.equal(clean({ profile: { avatar: 'data:image/jpeg;base64,AAA' } }).profile.avatar, 'data:image/jpeg;base64,AAA');
assert.equal(clean({ profile: { name: '   ' } }).profile.name, 'Your Name', 'blank name falls back');
assert.equal(clean({ profile: { handle: '@Maya Osei' } }).profile.handle, 'maya-osei');
assert.equal(clean({ profile: { bio: '' } }).profile.bio, '', 'a deliberately cleared bio stays cleared');
assert.equal(clean({ profile: { name: 'x'.repeat(200) } }).profile.name.length, 60);

// Streaks must survive a daylight-saving change. Run in a DST timezone, since
// the machine running the suite may not have one: 8 Mar 2026 is 23 hours long
// in New York and 25 Oct 2026 is 25 hours long in London.
{
  const check = `
    import { longestStreak } from './logic.js';
    const chain = (keys) => Object.fromEntries(keys.map((k) => [k, { count: 1 }]));
    const spring = chain(['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09']);
    const fall = chain(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']);
    if (longestStreak(spring) !== 4) throw new Error('spring-forward broke the chain: ' + longestStreak(spring));
    if (longestStreak(fall) !== 4) throw new Error('fall-back broke the chain: ' + longestStreak(fall));
  `;
  for (const tz of ['America/New_York', 'Europe/London']) {
    execFileSync(process.execPath, ['--input-type=module', '--eval', check], {
      cwd: import.meta.dirname,
      env: { ...process.env, TZ: tz },
      stdio: 'pipe',
    });
  }
}
console.log('ok - all checks passed');
