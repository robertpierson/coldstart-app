// Pure date/streak math. No DOM in here so test.mjs can import it under node.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Local-time YYYY-MM-DD. toISOString() would shift the day for anyone west of UTC. */
export function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const out = new Date(date);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Days for the graph: whole weeks, Sunday-first columns, ending on `today`.
 * Returns oldest-first, so index % 7 is the row and (index / 7 | 0) the column.
 */
export function gridDays(today, weeks = 53) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // last column is the week containing today; walk back to that week's Sunday
  const lastSunday = addDays(end, -end.getDay());
  const start = addDays(lastSunday, -(weeks - 1) * 7);
  const out = [];
  for (let i = 0; ; i++) {
    const date = addDays(start, i);
    if (date > end) break;
    out.push({ key: dayKey(date), date, weekIndex: (i / 7) | 0, dayIndex: i % 7 });
  }
  return out;
}

/** 0-4 colour bucket. */
export function level(count) {
  if (!count) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

const countOf = (days, key) => (days[key] && days[key].count) || 0;

/**
 * Consecutive logged days ending today or yesterday. Not having logged *yet today*
 * must not read as a broken streak - that is the whole motivation mechanic.
 */
export function currentStreak(days, today) {
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!countOf(days, dayKey(cursor))) {
    cursor = addDays(cursor, -1);
    if (!countOf(days, dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (countOf(days, dayKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(days) {
  const keys = Object.keys(days).filter((k) => countOf(days, k) > 0).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of keys) {
    const date = parseKey(key);
    run = prev && date - prev === DAY_MS ? run + 1 : 1;
    prev = date;
    if (run > best) best = run;
  }
  return best;
}

export function total(days) {
  return Object.keys(days).reduce((sum, k) => sum + countOf(days, k), 0);
}

/** Rolling 7 days including today. */
export function thisWeek(days, today) {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += countOf(days, dayKey(addDays(today, -i)));
  return sum;
}

/** Seeded LCG - leaderboard must not reshuffle on every reload. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function fakeHistory(seed, today, { days: span, activity, maxPerDay, streak = 0 }) {
  const rand = rng(seed);
  const days = {};
  for (let i = span; i >= 0; i--) {
    const date = addDays(today, -i);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    if (rand() > activity * (weekend ? 0.4 : 1)) continue;
    days[dayKey(date)] = { count: 1 + Math.floor(rand() * maxPerDay) };
  }
  // Force an unbroken recent chain. Random fill alone gives everyone a 1-2 day
  // streak, which makes the board look like nobody is actually keeping it up.
  for (let i = 0; i < streak; i++) {
    days[dayKey(addDays(today, -i))] = { count: 1 + Math.floor(rand() * maxPerDay) };
  }
  return days;
}

const PEOPLE = [
  { name: 'Maya Osei', handle: 'mayabuilds', seed: 11, activity: 0.86, maxPerDay: 14, streak: 74 },
  { name: 'Dev Raman', handle: 'devships', seed: 29, activity: 0.74, maxPerDay: 9, streak: 31 },
  { name: 'Lena Fischer', handle: 'lenacold', seed: 47, activity: 0.62, maxPerDay: 11, streak: 16 },
  { name: 'Tomas Rivera', handle: 'tomasr', seed: 83, activity: 0.55, maxPerDay: 6, streak: 8 },
  { name: 'Priya Nair', handle: 'priyan', seed: 101, activity: 0.44, maxPerDay: 8, streak: 3 },
  { name: 'Sam Whitlock', handle: 'samw', seed: 137, activity: 0.31, maxPerDay: 5, streak: 0 },
];

/** Fake-but-stable neighbours, so an empty leaderboard never greets a new user. */
export function seedUsers(today) {
  return PEOPLE.map((p) => {
    const days = fakeHistory(p.seed, today, {
      days: 200,
      activity: p.activity,
      maxPerDay: p.maxPerDay,
      streak: p.streak,
    });
    return {
      name: p.name,
      handle: p.handle,
      streak: currentStreak(days, today),
      total: total(days),
      week: thisWeek(days, today),
    };
  });
}

/** Plausible personal history for the "load demo data" button. */
export function demoDays(today) {
  return fakeHistory(7, today, { days: 240, activity: 0.66, maxPerDay: 12 });
}

/**
 * GitHub-ish handle: drop a leading @, lowercase, non-alphanumerics become dashes.
 * Empty or all-junk input falls back to 'you' so the leaderboard row is never "@".
 */
export function normalizeHandle(input) {
  const slug = String(input)
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .slice(0, 20)
    .replace(/^-+|-+$/g, '');
  return slug || 'you';
}

/** Centred square source rect for cover-cropping an image before downscaling. */
export function coverCrop(width, height) {
  const side = Math.min(width, height);
  return { sx: (width - side) / 2, sy: (height - side) / 2, side };
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const text = (value, fallback, max) => (typeof value === 'string' ? value.trim().slice(0, max) : fallback);

/**
 * Trust boundary for anything coming out of localStorage or an imported file:
 * keep only well-formed days and profile fields so a bad file cannot wedge the UI.
 * The avatar must be a data: image - a stray javascript: URL would otherwise land
 * straight in a CSS url().
 */
export function sanitizeState(raw, defaults) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const profile = src.profile && typeof src.profile === 'object' ? src.profile : {};
  const rawDays = src.days && typeof src.days === 'object' ? src.days : {};
  const days = {};

  for (const [key, entry] of Object.entries(rawDays)) {
    if (!DAY_KEY_RE.test(key) || !entry || typeof entry !== 'object') continue;
    const count = Math.floor(Number(entry.count));
    if (!Number.isFinite(count) || count <= 0) continue;
    days[key] = { count: Math.min(count, 500) };
    const note = text(entry.note, '', 140);
    if (note) days[key].note = note;
  }

  const avatar = text(profile.avatar, '', 4_000_000);
  return {
    profile: {
      name: text(profile.name, '', 60) || defaults.profile.name,
      handle: normalizeHandle(text(profile.handle, defaults.profile.handle, 20)),
      bio: text(profile.bio, defaults.profile.bio, 160),
      avatar: avatar.startsWith('data:image/') ? avatar : '',
    },
    days,
  };
}
