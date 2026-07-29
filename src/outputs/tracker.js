// Offline tracker: one self-contained HTML file.
//
// Opens to today, PREV/NEXT walk the block, checkbox state persists in
// localStorage. No network, no build step, nothing to install.

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

export function buildTracker(formState, block) {
  const title = formState.name || 'Untitled';
  // Only what the tracker needs, so the file stays small.
  const payload = {
    name: title,
    startDate: formState.startDate,
    missBehavior: formState.missBehavior,
    rules: formState.hideRules ? [] : (formState.rules ?? []).filter((r) => String(r).trim()),
    days: block.days.map((d) => ({
      date: d.date,
      weekday: d.weekday,
      n: d.number,
      week: d.week,
      phase: d.phase,
      ramp: d.isRamp,
      boxes: d.checkboxes,
      off: d.exemption ? d.exemption.label : null,
      half: d.exemption?.kind === 'half' || undefined,
      sessions: d.sessions.map((s) => ({
        slot: s.slot,
        name: s.name,
        movements: s.movements.map((m) => ({ name: m.name, p: m.prescription })),
      })),
    })),
  };

  const key = `ithaca.tracker.${formState.startDate}.${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — tracker</title>
<style>
  :root { --ink:#141414; --accent:#1F5FD0; --paper:#fff; --muted:#767676; --line:#e0e0e0; }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#ededed; --accent:#4A85EF; --paper:#141414; --muted:#9a9a9a; --line:#333; }
  }
  * { box-sizing:border-box; }
  body { margin:0; padding:1.25rem; background:var(--paper); color:var(--ink);
         font:16px/1.45 ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", sans-serif;
         max-width:34rem; margin-inline:auto; }
  header { border-bottom:2px solid var(--ink); padding-bottom:.5rem; margin-bottom:1rem; }
  h1 { font-size:.95rem; letter-spacing:.14em; text-transform:uppercase; margin:0; }
  .meta { color:var(--muted); font-size:.8rem; margin-top:.2rem; }
  .daynum { font-size:3.4rem; line-height:1; font-weight:800; letter-spacing:-.02em; }
  .ramp .daynum { color:var(--muted); font-size:2rem; }
  .date { text-transform:uppercase; letter-spacing:.1em; font-size:.78rem; color:var(--muted); }
  .session { font-weight:700; text-transform:uppercase; letter-spacing:.08em; margin:.6rem 0 .4rem; }
  .travel { display:inline-block; background:var(--ink); color:var(--paper);
            padding:.1rem .4rem; font-size:.72rem; letter-spacing:.08em; text-transform:uppercase; }
  ul { list-style:none; padding:0; margin:.5rem 0; }
  li { display:flex; justify-content:space-between; gap:1rem; padding:.3rem 0;
       border-bottom:1px solid var(--line); font-size:.9rem; }
  li span:last-child { color:var(--muted); white-space:nowrap; }
  .boxes { display:flex; gap:.75rem; margin:1.1rem 0; }
  .boxes button { width:3rem; height:3rem; border:2px solid var(--ink); background:transparent;
                  cursor:pointer; font-size:1.5rem; color:var(--accent); line-height:1; padding:0; }
  .boxes button[aria-pressed="true"] { background:var(--accent); border-color:var(--accent); color:#fff; }
  nav { display:flex; gap:.5rem; margin-top:1.25rem; }
  nav button { flex:1; padding:.8rem; border:1px solid var(--ink); background:transparent;
               color:var(--ink); cursor:pointer; text-transform:uppercase; letter-spacing:.1em;
               font-size:.78rem; }
  nav button:disabled { opacity:.35; cursor:default; }
  .rules { margin-top:1.5rem; padding-top:.6rem; border-top:1px solid var(--line);
           color:var(--muted); font-size:.75rem; text-transform:uppercase; letter-spacing:.06em; }
  .note { margin-top:1.5rem; font-size:.75rem; color:var(--muted); }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta" id="meta"></div>
</header>
<main id="day"></main>
<nav>
  <button id="prev">← Prev</button>
  <button id="today">Today</button>
  <button id="next">Next →</button>
</nav>
<p class="note">
  Checkbox state is saved in this browser only. iOS Safari will not bookmark a
  local file — to keep this on a phone, use a file manager or host it somewhere.
</p>
<script>
const DATA = ${JSON.stringify(payload)};
const KEY = ${JSON.stringify(key)};

const state = (() => {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
})();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

const todayISO = () => {
  const d = new Date();
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
};

let idx = (() => {
  const t = todayISO();
  const exact = DATA.days.findIndex(d => d.date === t);
  if (exact >= 0) return exact;
  // Before the block starts, open on the first day; after it ends, the last.
  return t < DATA.days[0].date ? 0 : DATA.days.length - 1;
})();

function render() {
  const d = DATA.days[idx];
  const done = state[d.date] || [];

  document.getElementById('meta').textContent =
    (d.n ? 'Day ' + d.n + ' of ' + DATA.days.filter(x => x.n).length : 'Ramp') +
    (d.week ? '  ·  Week ' + d.week : '') +
    (d.phase ? '  ·  Phase ' + d.phase : '');

  const boxes = Array.from({length: d.boxes}, (_, i) =>
    '<button data-i="' + i + '" aria-pressed="' + (done[i] ? 'true' : 'false') + '">' +
    (done[i] ? '✕' : '') + '</button>').join('');

  document.getElementById('day').className = d.ramp ? 'ramp' : '';
  document.getElementById('day').innerHTML =
    '<div class="date">' + d.weekday + ' ' + d.date + '</div>' +
    '<div class="daynum">' + (d.n != null ? d.n : 'RAMP') + '</div>' +
    (d.off ? '<div class="travel">' + (d.half ? 'HALF' : 'OFF') + ' — ' + d.off + '</div>' : '') +
    d.sessions.map(s =>
      '<div class="session">' + (s.slot === 'outdoor' ? 'Outdoor' : 'Indoor') + ' — ' + s.name + '</div>' +
      (s.movements.length
        ? '<ul>' + s.movements.map(m => '<li><span>' + m.name + '</span><span>' + m.p + '</span></li>').join('') + '</ul>'
        : '')
    ).join('') +
    (d.boxes ? '<div class="boxes">' + boxes + '</div>' : '') +
    (DATA.rules.length ? '<div class="rules">' + DATA.rules.join('  ·  ') + '</div>' : '');

  document.querySelectorAll('.boxes button').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      const arr = state[d.date] || (state[d.date] = []);
      arr[i] = !arr[i];
      persist();
      render();
    });
  });

  document.getElementById('prev').disabled = idx === 0;
  document.getElementById('next').disabled = idx === DATA.days.length - 1;
}

document.getElementById('prev').onclick  = () => { if (idx > 0) { idx--; render(); } };
document.getElementById('next').onclick  = () => { if (idx < DATA.days.length - 1) { idx++; render(); } };
document.getElementById('today').onclick = () => {
  const t = todayISO();
  const i = DATA.days.findIndex(d => d.date === t);
  idx = i >= 0 ? i : idx;
  render();
};

render();
</script>
</body>
</html>`;
}

export function trackerFilename(formState) {
  const slug = String(formState.name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${slug}-${formState.startDate}-tracker.html`;
}
