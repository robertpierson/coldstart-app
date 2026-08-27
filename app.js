import { dayKey, parseKey, gridDays, level, currentStreak, longestStreak, total, thisWeek, seedUsers, demoDays, normalizeHandle, coverCrop, sanitizeState } from './logic.js';

const KEY = 'coldstart:v1';
const DEFAULTS = {
  profile: {
    name: 'Your Name',
    handle: 'you',
    bio: 'Founder. Sending cold DMs until someone says yes.',
    avatar: '', // downscaled data URL; empty means fall back to initials
  },
  days: {},
};

const $ = (id) => document.getElementById(id);

// This tab can outlive the day it opened in. Everything below reads `today`
// through this, so the graph, the streak and the + Log button all roll over
// at midnight instead of writing into yesterday.
let today = new Date();

function load() {
  try {
    return sanitizeState(JSON.parse(localStorage.getItem(KEY)), DEFAULTS);
  } catch {
    return structuredClone(DEFAULTS); // corrupt or unreadable storage - start clean rather than crash
  }
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage now holds an image, so a full quota must not fail silently
    alert('Could not save - browser storage is full. Try a smaller profile picture.');
  }
  render();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (date) => `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// "3 days streak" reads like a typo - the thing being counted is the streak.
const streakLabel = (n) => `${n}-day streak`;

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function paintAvatar(el, profile) {
  el.style.backgroundImage = profile.avatar ? `url(${profile.avatar})` : '';
  el.textContent = profile.avatar ? '' : initials(profile.name);
}

function renderProfile() {
  $('profile-name').textContent = state.profile.name;
  $('profile-handle').textContent = '@' + state.profile.handle;
  $('profile-bio').textContent = state.profile.bio;
  paintAvatar($('avatar'), state.profile);
}

function renderStats() {
  const streak = currentStreak(state.days, today);
  $('stat-total').textContent = total(state.days);
  $('stat-streak').textContent = streak;
  $('stat-longest').textContent = longestStreak(state.days);
  $('stat-week').textContent = thisWeek(state.days, today);

  // A streak survives an unlogged today, which is exactly when it needs saying:
  // the chain is alive but nothing has been sent yet.
  const loggedToday = ((state.days[dayKey(today)] || {}).count || 0) > 0;
  const atRisk = streak > 0 && !loggedToday;

  const flame = $('topbar-streak');
  if (!streak) flame.textContent = 'no streak yet - send one today';
  else if (atRisk) flame.textContent = `${streakLabel(streak)} - nothing logged today`;
  else flame.textContent = streakLabel(streak);
  flame.title = atRisk ? 'Send one today or the chain breaks at midnight' : 'Current streak';
  flame.classList.toggle('hot', streak > 0 && loggedToday);
  flame.classList.toggle('at-risk', atRisk);
}

function renderGraph() {
  const cells = gridDays(today, 53);
  const squares = $('squares');
  const months = $('months');
  const scroller = $('graph-scroll');
  // A fresh graph opens on a year ago, which is the least interesting end of it.
  // Stay pinned to today unless the reader has scrolled back to look at history.
  const atEnd = scroller.scrollLeft >= scroller.scrollWidth - scroller.clientWidth - 1;
  const keep = scroller.scrollLeft;
  squares.replaceChildren();
  months.replaceChildren();

  const todayKey = dayKey(today);
  let shown = 0;
  let lastMonth = -1;

  for (const cell of cells) {
    const count = (state.days[cell.key] || {}).count || 0;
    shown += count;

    const sq = document.createElement('button');
    sq.type = 'button';
    sq.dataset.key = cell.key;
    sq.className = `sq l${level(count)}${cell.key === todayKey ? ' today' : ''}`;
    sq.title = `${count ? plural(count, 'reach-out') : 'No reach-outs'} on ${fmtDay(cell.date)}`;
    sq.setAttribute('aria-label', sq.title); // title alone is not announced reliably
    // roving tabindex: 371 squares must not be 371 stops on the way to the footer
    sq.tabIndex = cell.key === todayKey ? 0 : -1;
    squares.append(sq);

    // month label sits over the first column that starts a new month
    if (cell.dayIndex === 0 && cell.date.getMonth() !== lastMonth) {
      lastMonth = cell.date.getMonth();
      const label = document.createElement('span');
      label.textContent = MONTHS[lastMonth];
      label.style.left = `calc(${cell.weekIndex} * (var(--sq) + var(--gap)))`;
      months.append(label);
    }
  }

  scroller.scrollLeft = atEnd ? scroller.scrollWidth : keep;
  $('graph-title').textContent = `${plural(shown, 'reach-out')} in the last year`;
}

function renderActivity() {
  const list = $('activity');
  const recent = Object.entries(state.days)
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 10);

  list.replaceChildren();
  if (!recent.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nothing logged yet. One DM today and the chain starts.';
    list.append(li);
    return;
  }

  for (const [key, entry] of recent) {
    const li = document.createElement('li');
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = fmtDay(parseKey(key));
    const what = document.createElement('span');
    what.className = 'what';
    what.textContent = plural(entry.count, 'reach-out');
    const note = document.createElement('span');
    note.className = 'note';
    note.textContent = entry.note || '';
    li.append(when, what, note);
    list.append(li);
  }
}

// Fixed neighbours, so the board is never an empty room on day one. Their
// histories are generated relative to today, so they are rebuilt on rollover.
let OTHERS = seedUsers(today);

function renderBoard() {
  const me = {
    name: state.profile.name,
    handle: state.profile.handle,
    streak: currentStreak(state.days, today),
    total: total(state.days),
    me: true,
  };
  const rows = [...OTHERS, me].sort((a, b) => b.streak - a.streak || b.total - a.total);

  const list = $('board');
  list.replaceChildren();
  rows.forEach((row, i) => {
    const li = document.createElement('li');
    if (row.me) li.className = 'me';

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = i + 1;

    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = row.me ? `${row.name} (you)` : row.name;
    const handle = document.createElement('small');
    handle.textContent = ` @${row.handle}`;
    who.append(handle);

    const streak = document.createElement('span');
    streak.className = 'streak';
    streak.textContent = row.streak ? streakLabel(row.streak) : 'chain broken';

    li.append(rank, who, streak);
    list.append(li);
  });
}

/** True when the clock has crossed into a new day since the last check. */
function rolledOver() {
  const now = new Date();
  if (dayKey(now) === dayKey(today)) return false;
  today = now;
  OTHERS = seedUsers(now);
  return true;
}

function render() {
  rolledOver();
  renderProfile();
  renderStats();
  renderGraph();
  renderActivity();
  renderBoard();
}

// A tab left open overnight would otherwise still be pointing at yesterday.
setInterval(() => {
  if (rolledOver()) render();
}, 60_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && rolledOver()) render();
});

// --- profile ---

const profileDialog = $('profile-dialog');
const AVATAR_PX = 128;
let draftAvatar = ''; // held until Save, so Cancel really cancels the picture too

/** Square, downscaled JPEG data URL - localStorage holds a few MB, not originals. */
async function toAvatarDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const { sx, sy, side } = coverCrop(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

function paintPreview() {
  paintAvatar($('avatar-preview'), { ...state.profile, avatar: draftAvatar });
}

$('profile-avatar-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    draftAvatar = await toAvatarDataUrl(file);
  } catch {
    alert('That file could not be read as an image.');
    e.target.value = '';
    return;
  }
  paintPreview();
});

$('avatar-clear').addEventListener('click', () => {
  draftAvatar = '';
  $('profile-avatar-input').value = '';
  paintPreview();
});

$('edit-profile-btn').addEventListener('click', () => {
  draftAvatar = state.profile.avatar;
  $('profile-avatar-input').value = '';
  paintPreview();
  $('profile-name-input').value = state.profile.name;
  $('profile-handle-input').value = state.profile.handle;
  $('profile-bio-input').value = state.profile.bio;
  profileDialog.showModal();
});

profileDialog.addEventListener('close', () => {
  if (profileDialog.returnValue !== 'save') return;
  state.profile.name = $('profile-name-input').value.trim() || DEFAULTS.profile.name;
  state.profile.handle = normalizeHandle($('profile-handle-input').value);
  state.profile.bio = $('profile-bio-input').value.trim();
  state.profile.avatar = draftAvatar;
  save();
});

// --- logging ---

const dialog = $('log-dialog');

function openLog(key, { bump = false } = {}) {
  const entry = state.days[key] || {};
  dialog.dataset.key = key;
  $('dialog-title').textContent =
    key === dayKey(today) ? 'Log outreach for today' : `Set outreach for ${fmtDay(parseKey(key))}`;
  $('log-count').value = (entry.count || 0) + (bump ? 1 : 0);
  $('log-note').value = entry.note || '';
  dialog.showModal();
  $('log-count').select();
}

$('log-btn').addEventListener('click', () => openLog(dayKey(today), { bump: true }));

$('squares').addEventListener('click', (e) => {
  const sq = e.target.closest('button.sq');
  if (sq) openLog(sq.dataset.key);
});

// Columns are weeks and rows are weekdays, so up/down is a day and left/right a week.
const STEP = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };

$('squares').addEventListener('keydown', (e) => {
  const sq = e.target.closest('button.sq');
  if (!sq) return;

  const all = [...$('squares').children];
  const from = all.indexOf(sq);
  let to;
  if (e.key in STEP) to = from + STEP[e.key];
  else if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = all.length - 1;
  else return;

  e.preventDefault();
  const next = all[Math.min(Math.max(to, 0), all.length - 1)];
  sq.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
});

dialog.addEventListener('close', () => {
  if (dialog.returnValue !== 'save') return;
  const key = dialog.dataset.key;
  const count = Math.max(0, Math.min(500, Number($('log-count').value) || 0));
  const note = $('log-note').value.trim();
  // 0 means "undo this day", not "a logged day of nothing"
  if (count > 0) state.days[key] = note ? { count, note } : { count };
  else delete state.days[key];
  save();
});

// --- backup ---
// The whole history lives in one browser's localStorage, so a file copy is the
// only way out of it.

$('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `coldstart-${dayKey(today)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

$('import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = ''; // so picking the same file twice still fires

  let incoming;
  try {
    incoming = sanitizeState(JSON.parse(await file.text()), DEFAULTS);
  } catch {
    alert('That file is not a coldstart export.');
    return;
  }

  const mine = Object.keys(state.days).length;
  const theirs = Object.keys(incoming.days).length;
  const warning = mine
    ? `Replace your profile and ${plural(mine, 'logged day')} with ${plural(theirs, 'day')} from this file?`
    : `Import ${plural(theirs, 'logged day')} and the profile from this file?`;
  if (!confirm(warning)) return;

  state = incoming;
  save();
});

$('demo-btn').addEventListener('click', () => {
  state.days = { ...demoDays(today), ...state.days }; // never overwrite real entries with fake ones
  save();
});

$('reset-btn').addEventListener('click', () => {
  if (!confirm('Wipe your profile and every logged day? This cannot be undone.')) return;
  state = structuredClone(DEFAULTS);
  save();
});

render();
