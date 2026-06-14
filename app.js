/* Itinerary controller.
   - Opens on TODAY's day when the trip is in progress, else day 1.
   - Tapping a day chip isolates that day; "All" shows everything.
   - Selecting a stop opens a bottom-sheet card; prev/next step through the
     day in order. A full-screen list view mirrors the same data.
   Data comes from data.js (TRIP). */

// ── Inline icons (stroke = currentColor) ──────────────────────
const SVG = (p) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  home: SVG('<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"/>'),
  directions: SVG('<path d="M12 3 19.5 20 12 16 4.5 20 12 3z"/>'),
  chevLeft: SVG('<path d="M15 6l-6 6 6 6"/>'),
  chevRight: SVG('<path d="M9 6l6 6-6 6"/>'),
  close: SVG('<path d="M6 6l12 12M18 6 6 18"/>'),
  list: SVG('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  locate: SVG('<circle cx="12" cy="12" r="3.4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  warn: SVG('<path d="M12 4.5 21 20H3L12 4.5z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
  pin: SVG('<path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>'),
  plus: SVG('<path d="M12 5v14M5 12h14"/>'),
  share: SVG('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v13M8 7l4-4 4 4"/>'),
  walk: SVG('<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="6.5" r="2.5"/><path d="M9 16 15 8" stroke-dasharray="2.5 2.5"/>'),
};

// ── Reusable engine: data loading, sanitising, import ─────────
// The active itinerary comes from (1) a saved import on this device, else
// (2) the built-in demo (TRIP in data.js). All text from imported data is
// treated as untrusted and escaped at render; coords/colours are validated.
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
const PALETTE = ['#d64038', '#e07b18', '#5b8f1f', '#2e77c2', '#7c4fd0', '#b5338f', '#be4870', '#4b6584'];
const toNum = (v) => (typeof v === 'number' && isFinite(v) ? v : isFinite(parseFloat(v)) ? parseFloat(v) : null);
const safeColor = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c.trim()) ? c.trim() : null);

function normalizeItinerary(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.days)) {
    throw new Error('That isn’t an itinerary — it needs a list of "days".');
  }
  const days = raw.days
    .map((d, di) => {
      const stops = (Array.isArray(d.stops) ? d.stops : [])
        .map((s) => {
          const lat = toNum(s && s.lat);
          const lng = toNum(s && s.lng);
          if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
          const stop = { name: String(s.name || 'Stop'), note: String(s.note || ''), lat, lng };
          if (s.isBase) stop.isBase = true;
          if (s.conflict) stop.conflict = String(s.conflict);
          if (typeof s.wiki === 'string' && s.wiki.trim()) stop.wiki = s.wiki.trim();
          if (Array.isArray(s.images)) {
            const im = s.images.filter((u) => typeof u === 'string' && u.startsWith('https://upload.wikimedia.org/'));
            if (im.length) stop.images = im;
          }
          return stop;
        })
        .filter(Boolean);
      return {
        id: (typeof d.id === 'string' && d.id.replace(/[^\w-]/g, '')) || 'd' + di,
        date: typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : undefined,
        label: String(d.label || d.name || 'Day ' + (di + 1)),
        name: String(d.name || d.label || 'Day ' + (di + 1)),
        color: safeColor(d.color) || PALETTE[di % PALETTE.length],
        stops,
      };
    })
    .filter((d) => d.stops.length);
  if (!days.length) throw new Error('No stops with valid coordinates were found.');
  const seen = {};
  days.forEach((d, i) => {
    if (seen[d.id]) d.id += '-' + i;
    seen[d.id] = 1;
  });
  return { title: String(raw.title || 'My itinerary'), subtitle: String(raw.subtitle || ''), days };
}

const STORE_KEY = 'itinerary.v1';
function resolveItinerary() {
  // 1) Shared link: #i=<compressed JSON> — save it, then clean the URL.
  try {
    const m = location.hash.match(/^#i=(.+)$/);
    if (m && typeof LZString !== 'undefined') {
      const json = LZString.decompressFromEncodedURIComponent(m[1]);
      if (json) {
        const data = normalizeItinerary(JSON.parse(json));
        try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {}
        history.replaceState(null, '', location.pathname + location.search);
        return data;
      }
    }
  } catch (e) {
    /* fall through */
  }
  // 2) Previously saved on this device.
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) return normalizeItinerary(JSON.parse(saved));
  } catch (e) {
    /* fall back to demo */
  }
  // 3) Built-in demo.
  return normalizeItinerary(TRIP);
}
const DATA = resolveItinerary();

// Lenient parse of an AI reply: pull JSON out of a ``` fence or the first {...}.
function parseItinerary(text) {
  if (!text || !text.trim()) throw new Error('Paste your AI’s reply first.');
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  else {
    const a = body.indexOf('{');
    const b = body.lastIndexOf('}');
    if (a >= 0 && b > a) body = body.slice(a, b + 1);
  }
  let raw;
  try {
    raw = JSON.parse(body);
  } catch (e) {
    throw new Error('Couldn’t read that. Paste the AI’s full reply — it should contain a JSON block.');
  }
  return normalizeItinerary(raw);
}

const PROMPT = `You are a travel itinerary planner. Build a day-by-day itinerary and output it as ONE json code block and nothing else, in exactly this format:

\`\`\`json
{
  "title": "Trip name",
  "subtitle": "dates or a short tagline",
  "days": [
    {
      "label": "Mon 1",
      "name": "Mon 1 — morning theme",
      "date": "2026-07-01",
      "stops": [
        {
          "name": "Place name",
          "note": "One or two short sentences: why go, best timing, a tip.",
          "lat": 0.0,
          "lng": 0.0,
          "wiki": "Exact English Wikipedia article title, or omit if none"
        }
      ]
    }
  ]
}
\`\`\`

Rules:
- Output ONLY the JSON code block.
- Give REAL latitude/longitude (decimal degrees) for every stop.
- "date" is optional (YYYY-MM-DD) — include it only if I gave you dates.
- Add "wiki" with the exact Wikipedia article title where a place has one, so the map can show photos. Omit it otherwise.
- 3–6 stops per day, in the order I'd visit them. Keep notes short and practical.

My trip: [DESCRIBE YOUR TRIP: destination, dates, interests, pace]`;

// Wikimedia 500px thumb → larger 1280px version for the lightbox (a standard
// pre-cached width). Falls back to the 500px thumb if 1280 isn't available.
const bigImg = (u) => u.replace('/500px-', '/1280px-');

// ── Map ───────────────────────────────────────────────────────
const map = L.map('map', { zoomControl: false });
// CARTO Voyager: a clean, familiar OSM-based basemap — free, no API key.
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd',
  maxZoom: 20,
  detectRetina: true,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
}).addTo(map);

// ── Helpers ───────────────────────────────────────────────────
const byId = Object.fromEntries(DATA.days.map((d) => [d.id, d]));
const key = (dayId, i) => `${dayId}:${i}`;

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
const TODAY = todayISO();
const isToday = (dayId) => byId[dayId] && byId[dayId].date === TODAY;

// Google Maps link. For real places, search by name centred on the stop's
// coords so Google opens the actual place card (not a bare coordinate pin).
// The home base stays a plain coordinate pin (its location is fuzzed/private).
function mapsUrl(stop) {
  const place = stop.name.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (stop.isBase || !place) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.lat + ',' + stop.lng)}`;
  }
  return `https://www.google.com/maps/search/${encodeURIComponent(place)}/@${stop.lat},${stop.lng},16z`;
}

// Wikimedia thumb URL → its Commons file page (for attribution / full size).
function filePage(thumbUrl) {
  const parts = thumbUrl.split('/');
  const file = parts[parts.length - 2];
  return `https://commons.wikimedia.org/wiki/File:${file}`;
}

// ── Stop photos ──────────────────────────────────────────────
// explicit stop.images → demo GALLERY (by name) → fetched from Wikipedia (by
// title). Fetched results are cached per title so re-opening doesn't refetch.
const imgCache = {};
const normThumb = (u) => u.replace(/\/\d+px-([^/]+)$/, '/500px-$1');

function galleryFor(stop) {
  if (stop.images) return stop.images;
  if (typeof GALLERY !== 'undefined' && GALLERY[stop.name]) return GALLERY[stop.name];
  if (stop.wiki && Array.isArray(imgCache[stop.wiki])) return imgCache[stop.wiki];
  return [];
}

const deburr = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
async function fetchWikiImages(title) {
  const base = 'https://en.wikipedia.org/w/api.php?origin=*&format=json&redirects=1';
  const out = [];
  const words = deburr(title).split(/[^a-z]+/).filter((w) => w.length >= 4);
  try {
    const r1 = await fetch(`${base}&action=query&prop=pageimages&piprop=thumbnail&pithumbsize=500&titles=${encodeURIComponent(title)}`);
    const p1 = Object.values((((await r1.json()) || {}).query || {}).pages || {})[0];
    if (p1 && p1.thumbnail && p1.thumbnail.source) out.push(normThumb(p1.thumbnail.source));
  } catch (e) {}
  try {
    const r2 = await fetch(`${base}&action=query&generator=images&gimlimit=25&prop=imageinfo&iiprop=url|mime&iiurlwidth=500&titles=${encodeURIComponent(title)}`);
    const pages = ((((await r2.json()) || {}).query) || {}).pages || {};
    for (const p of Object.values(pages)) {
      if (out.length >= 3) break;
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii || ii.mime !== 'image/jpeg' || !ii.thumburl) continue;
      const t = (p.title || '').toLowerCase();
      if (/logo|icon|flag|map|seal|coat|crest|diagram|wikimedia|commons-|\.svg/.test(t)) continue;
      if (!words.some((w) => t.includes(w))) continue; // keep only extras that match the place
      const u = normThumb(ii.thumburl);
      if (!out.includes(u)) out.push(u);
    }
  } catch (e) {}
  return out.slice(0, 3);
}

const nonBaseCount = (day) => day.stops.filter((s) => !s.isBase).length;
function seqNumber(day, index) {
  let n = 0;
  for (let i = 0; i <= index; i++) if (!day.stops[i].isBase) n++;
  return n;
}

// ── Markers ───────────────────────────────────────────────────
const dayLayers = {};
const markers = {};
const allBounds = [];

function pinIcon(day, index, selected) {
  const stop = day.stops[index];
  const sel = selected ? ' is-sel' : '';
  const inner = stop.isBase ? ICON.home : `<span>${seqNumber(day, index)}</span>`;
  const warn = stop.conflict ? `<span class="pin-warn">${ICON.warn}</span>` : '';
  return L.divIcon({
    className: '',
    html: `<div class="pin${sel}" style="--c:${day.color}">${inner}${warn}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

DATA.days.forEach((day) => {
  const group = L.layerGroup();
  day.stops.forEach((stop, i) => {
    const m = L.marker([stop.lat, stop.lng], {
      icon: pinIcon(day, i, false),
      zIndexOffset: stop.isBase ? 1000 : 0,
      keyboard: false,
    });
    m.on('click', () => select(day.id, i));
    group.addLayer(m);
    markers[key(day.id, i)] = m;
    allBounds.push([stop.lat, stop.lng]);
  });
  dayLayers[day.id] = group;
});

// ── State ─────────────────────────────────────────────────────
let activeDay = null; // 'all' or a day id
let selected = null; // { dayId, idx }

function applyFilter() {
  DATA.days.forEach((d) => {
    const show = activeDay === 'all' || d.id === activeDay;
    if (show && !map.hasLayer(dayLayers[d.id])) dayLayers[d.id].addTo(map);
    if (!show && map.hasLayer(dayLayers[d.id])) map.removeLayer(dayLayers[d.id]);
  });
}

function fitDay(day) {
  map.fitBounds(day.stops.map((s) => [s.lat, s.lng]), { padding: [64, 64], maxZoom: 16 });
}

function showDay(id) {
  activeDay = id;
  applyFilter();
  updateChips();
  updateSummary();
  if (id === 'all') {
    closeSheet();
    map.fitBounds(allBounds, { padding: [54, 54] });
  } else {
    fitDay(byId[id]);
    select(id, 0, { fly: false });
  }
}

// ── Selection + bottom sheet ──────────────────────────────────
function setMarkerSel(dayId, idx, on) {
  const m = markers[key(dayId, idx)];
  if (m) m.setIcon(pinIcon(byId[dayId], idx, on));
}

function select(dayId, idx, opts = {}) {
  if (selected) setMarkerSel(selected.dayId, selected.idx, false);
  selected = { dayId, idx };
  setMarkerSel(dayId, idx, true);
  if (opts.fly !== false) map.panTo(markers[key(dayId, idx)].getLatLng(), { animate: true });
  renderSheet(byId[dayId], idx);
  openSheet();
}

function step(delta) {
  if (!selected) return;
  const day = byId[selected.dayId];
  const n = day.stops.length;
  select(selected.dayId, (selected.idx + delta + n) % n);
}

const sheet = document.getElementById('sheet');

function renderSheet(day, idx) {
  const stop = day.stops[idx];
  const seq = stop.isBase ? 'Home base' : `Stop ${seqNumber(day, idx)} of ${nonBaseCount(day)}`;
  const conflict = stop.conflict
    ? `<div class="sheet-conflict">${ICON.warn}<span>${esc(stop.conflict)}</span></div>`
    : '';
  const imgs = galleryFor(stop);
  const gallery = imgs.length
    ? `<div class="sheet-gallery">${imgs
        .map(
          (u, gi) =>
            `<button class="gthumb" type="button" data-gi="${gi}">` +
            `<img src="${esc(u)}" alt="${esc(stop.name)}" loading="lazy" decoding="async" onerror="this.closest('.gthumb').remove()"></button>`
        )
        .join('')}</div>` +
      `<span class="sheet-credit">Photos · Wikimedia Commons · tap to enlarge</span>`
    : '';
  const walkRow = walkMode
    ? isActive(day.id, idx)
      ? `<button class="walk-advance" type="button" id="walk-advance">Arrived — next stop →</button>`
      : `<button class="walk-set" type="button" id="walk-set">Set as my next stop</button>`
    : '';
  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-eyebrow" style="color:${day.color}">
      <span class="dot" style="background:${day.color}"></span>${esc(day.label)} · ${seq}
    </div>
    <div class="sheet-name">${esc(stop.name)}</div>
    ${conflict}
    <div class="sheet-note">${esc(stop.note)}</div>
    ${gallery}
    ${walkRow}
    <div class="sheet-actions">
      <a class="btn-primary" target="_blank" rel="noopener"
         href="${mapsUrl(stop)}">${ICON.pin}Open in Maps</a>
      <button class="btn-icon" type="button" id="prev-stop" aria-label="Previous stop">${ICON.chevLeft}</button>
      <button class="btn-icon" type="button" id="next-stop" aria-label="Next stop">${ICON.chevRight}</button>
    </div>`;
  sheet.querySelector('#prev-stop').addEventListener('click', () => step(-1));
  sheet.querySelector('#next-stop').addEventListener('click', () => step(1));
  sheet.querySelectorAll('.gthumb').forEach((b) =>
    b.addEventListener('click', () => openLightbox(imgs, +b.dataset.gi))
  );
  const advBtn = sheet.querySelector('#walk-advance');
  if (advBtn) advBtn.addEventListener('click', advanceActive);
  const setBtn = sheet.querySelector('#walk-set');
  if (setBtn) setBtn.addEventListener('click', () => { setActiveStop(day.id, idx); renderSheet(day, idx); });
  // No photos yet but we have a Wikipedia title → fetch once, then re-render.
  if (!imgs.length && stop.wiki && imgCache[stop.wiki] === undefined) {
    imgCache[stop.wiki] = 'loading';
    fetchWikiImages(stop.wiki).then((list) => {
      imgCache[stop.wiki] = list;
      if (list.length && selected && byId[selected.dayId].stops[selected.idx] === stop) {
        renderSheet(byId[selected.dayId], selected.idx);
      }
    });
  }
}

function openSheet() {
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('is-open'));
  document.body.classList.add('sheet-open');
}

function closeSheet() {
  sheet.classList.remove('is-open');
  document.body.classList.remove('sheet-open');
  if (selected) {
    setMarkerSel(selected.dayId, selected.idx, false);
    selected = null;
  }
}

map.on('click', closeSheet);

// ── Day chips ─────────────────────────────────────────────────
const daybar = document.getElementById('daybar');

function buildChips() {
  const mk = (id, label, color) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.day = id;
    if (color) b.style.setProperty('--c', color);
    b.innerHTML = color ? `<span class="cdot"></span>${esc(label)}` : esc(label);
    b.addEventListener('click', () => showDay(id));
    return b;
  };
  daybar.appendChild(mk('all', 'All days', null));
  DATA.days.forEach((d) => daybar.appendChild(mk(d.id, isToday(d.id) ? `${d.label} · today` : d.label, d.color)));
}

function updateChips() {
  [...daybar.children].forEach((c) => {
    const on = c.dataset.day === activeDay;
    c.classList.toggle('is-active', on);
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) c.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });
}

function updateSummary() {
  const el = document.getElementById('day-summary');
  if (activeDay === 'all') {
    el.textContent = DATA.subtitle || 'All days';
    return;
  }
  const d = byId[activeDay];
  el.innerHTML = (isToday(activeDay) ? `<span class="today-tag">Today</span> · ` : '') + esc(d.name);
}

// ── List view ─────────────────────────────────────────────────
const listview = document.getElementById('listview');

function buildList() {
  let html =
    `<div class="lv-head"><span>Itinerary</span><div class="lv-head-actions">` +
    `<button class="icon-btn" type="button" id="lv-share" aria-label="Share this map">${ICON.share}</button>` +
    `<button class="icon-btn" type="button" id="lv-close" aria-label="Close list">${ICON.close}</button>` +
    `</div></div>` +
    `<div class="lv-body">`;
  DATA.days.forEach((d) => {
    html += `<div class="lv-day"><div class="lv-day-h"><span class="cdot" style="background:${d.color}"></span>${esc(d.name)}</div>`;
    d.stops.forEach((s, i) => {
      const badge = s.isBase ? ICON.home : seqNumber(d, i);
      const warn = s.conflict ? `<span class="lv-warn">${ICON.warn}</span>` : '';
      html += `<button class="lv-stop" type="button" data-day="${d.id}" data-idx="${i}">` +
        `<span class="lv-num" style="background:${d.color}">${badge}</span>` +
        `<span class="lv-name">${esc(s.name)}${warn}</span></button>`;
    });
    html += `</div>`;
  });
  html += `</div>`;
  listview.innerHTML = html;
  listview.querySelector('#lv-close').addEventListener('click', closeList);
  listview.querySelector('#lv-share').addEventListener('click', shareLink);
  listview.querySelectorAll('.lv-stop').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.day;
      const i = +b.dataset.idx;
      closeList();
      showDay(id);
      select(id, i);
    });
  });
}

function openList() {
  listview.hidden = false;
  requestAnimationFrame(() => listview.classList.add('is-open'));
  toggleBtn.setAttribute('aria-expanded', 'true');
}
function closeList() {
  listview.classList.remove('is-open');
  toggleBtn.setAttribute('aria-expanded', 'false');
}
listview.addEventListener('transitionend', () => {
  if (!listview.classList.contains('is-open')) listview.hidden = true;
});

// ── Lightbox (swipeable + pinch/double-tap zoom) ──────────────
const lightbox = document.getElementById('lightbox');

function updateLb(imgs, i) {
  i = Math.max(0, Math.min(imgs.length - 1, i));
  lightbox.querySelector('.lb-count').textContent = `${i + 1} / ${imgs.length}`;
  lightbox.querySelector('.lb-source').href = filePage(imgs[i]);
}

function openLightbox(imgs, index) {
  if (!imgs || !imgs.length) return;
  const slides = imgs
    .map(
      (u) =>
        `<div class="lb-slide"><img class="lb-img" src="${bigImg(u)}" data-fb="${u}" alt="" draggable="false" ` +
        `onerror="if(this.src!==this.dataset.fb)this.src=this.dataset.fb;"></div>`
    )
    .join('');
  lightbox.innerHTML =
    `<div class="lb-bar">` +
    `<span class="lb-count"></span>` +
    `<a class="lb-source" target="_blank" rel="noopener">Source</a>` +
    `<button class="lb-close" type="button" aria-label="Close">${ICON.close}</button>` +
    `</div><div class="lb-track">${slides}</div>`;
  lightbox.hidden = false;
  document.body.classList.add('lb-open');
  const track = lightbox.querySelector('.lb-track');
  lightbox.querySelectorAll('.lb-img').forEach((im) => makeZoomable(im, track));
  lightbox.querySelector('.lb-close').addEventListener('click', closeLightbox);
  track.addEventListener('scroll', () => updateLb(imgs, Math.round(track.scrollLeft / track.clientWidth)), {
    passive: true,
  });
  requestAnimationFrame(() => {
    track.scrollLeft = index * track.clientWidth;
    updateLb(imgs, index);
  });
}

function closeLightbox() {
  lightbox.hidden = true;
  lightbox.innerHTML = '';
  document.body.classList.remove('lb-open');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
});

function pinchDist(t) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

// Per-image pinch-to-zoom + pan. While zoomed, the track stops swiping so
// one-finger drags pan the image instead of paging.
function makeZoomable(img, track) {
  let scale = 1, tx = 0, ty = 0;
  let startDist = 0, startScale = 1;
  let panX = 0, panY = 0, startTx = 0, startTy = 0;
  let lastTap = 0;
  const apply = () => { img.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
  const reset = () => { scale = 1; tx = 0; ty = 0; apply(); track.classList.remove('lb-zoomed'); };

  img.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      startDist = pinchDist(e.touches);
      startScale = scale;
      track.classList.add('lb-zoomed');
      e.preventDefault();
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap < 300) {
        e.preventDefault();
        if (scale > 1) reset();
        else { scale = 2.5; track.classList.add('lb-zoomed'); apply(); }
      }
      lastTap = now;
      if (scale > 1) {
        panX = e.touches[0].clientX; panY = e.touches[0].clientY;
        startTx = tx; startTy = ty;
      }
    }
  }, { passive: false });

  img.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      scale = Math.min(5, Math.max(1, (startScale * pinchDist(e.touches)) / startDist));
      track.classList.add('lb-zoomed');
      apply();
    } else if (e.touches.length === 1 && scale > 1) {
      e.preventDefault();
      tx = startTx + (e.touches[0].clientX - panX);
      ty = startTy + (e.touches[0].clientY - panY);
      apply();
    }
  }, { passive: false });

  img.addEventListener('touchend', () => {
    if (scale <= 1.02) reset();
  });
}

// ── Import screen ("make your own") ───────────────────────────
const importscreen = document.getElementById('importscreen');
const hasSaved = () => {
  try { return !!localStorage.getItem(STORE_KEY); } catch (e) { return false; }
};

function selectFallback(ta) {
  if (ta) { ta.focus(); ta.select(); try { document.execCommand('copy'); } catch (e) {} }
}
function copyText(text, ta) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => selectFallback(ta));
  } else selectFallback(ta);
}

function buildImport() {
  importscreen.innerHTML =
    `<div class="imp-head"><span>Make your own map</span>` +
    `<button class="icon-btn" type="button" id="imp-close" aria-label="Close">${ICON.close}</button></div>` +
    `<div class="imp-body">` +
    `<p class="imp-lead">Ask any AI assistant — ChatGPT, Claude, Gemini — to plan your trip, then paste its reply here. Nothing is uploaded; your map is saved on this device.</p>` +
    `<div class="imp-step"><div class="imp-step-h"><span><b>1</b> Copy this prompt for your AI</span>` +
    `<button class="imp-copy" type="button" id="imp-copy">Copy</button></div>` +
    `<textarea class="imp-prompt" id="imp-prompt" readonly></textarea></div>` +
    `<div class="imp-step"><div class="imp-step-h"><span><b>2</b> Paste the AI’s reply</span></div>` +
    `<textarea class="imp-input" id="imp-input" placeholder="Paste the AI’s full reply here…"></textarea>` +
    `<div class="imp-error" id="imp-error" role="alert"></div>` +
    `<button class="imp-go" type="button" id="imp-go">Show my map</button>` +
    (hasSaved() ? `<button class="imp-link" type="button" id="imp-demo">Reset to the Vienna demo</button>` : '') +
    `</div></div>`;
  importscreen.querySelector('#imp-prompt').value = PROMPT;
  importscreen.querySelector('#imp-close').addEventListener('click', closeImport);
  importscreen.querySelector('#imp-copy').addEventListener('click', (e) => {
    copyText(PROMPT, importscreen.querySelector('#imp-prompt'));
    e.target.textContent = 'Copied ✓';
    setTimeout(() => (e.target.textContent = 'Copy'), 1600);
  });
  importscreen.querySelector('#imp-go').addEventListener('click', doImport);
  const demo = importscreen.querySelector('#imp-demo');
  if (demo)
    demo.addEventListener('click', () => {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      location.hash = '';
      location.reload();
    });
}

function doImport() {
  const errEl = importscreen.querySelector('#imp-error');
  errEl.textContent = '';
  try {
    const data = parseItinerary(importscreen.querySelector('#imp-input').value);
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    location.hash = '';
    location.reload();
  } catch (e) {
    errEl.textContent = e.message || 'Something went wrong reading that.';
  }
}

function openImport() {
  importscreen.hidden = false;
  requestAnimationFrame(() => importscreen.classList.add('is-open'));
}
function closeImport() {
  importscreen.classList.remove('is-open');
}
importscreen.addEventListener('transitionend', () => {
  if (!importscreen.classList.contains('is-open')) importscreen.hidden = true;
});

// ── Share ─────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function shareLink() {
  if (typeof LZString === 'undefined') return;
  const enc = LZString.compressToEncodedURIComponent(JSON.stringify(DATA));
  const url = location.origin + location.pathname + '#i=' + enc;
  if (navigator.share) {
    navigator.share({ title: DATA.title, url }).catch(() => {});
  } else {
    copyText(url);
    toast('Link copied — share it to open this map anywhere');
  }
}

// ── Walking mode ──────────────────────────────────────────────
// A committed "next stop" (activeStop), separate from browsing. The lock-screen
// reminder mirrors it; it only advances on an explicit tap. Persisted so the
// app reopens on it when the notification is tapped.
const WALK_KEY = 'walk.v1';
let walkMode = false;
let activeStop = null; // { dayId, idx }
const walkbar = document.getElementById('walkbar');
const walkBtn = document.getElementById('walk-btn');

const stopRef = (ref) => byId[ref.dayId] && byId[ref.dayId].stops[ref.idx];
const isActive = (dayId, idx) => walkMode && activeStop && activeStop.dayId === dayId && activeStop.idx === idx;

function flatStops() {
  const out = [];
  DATA.days.forEach((d) => d.stops.forEach((_, i) => out.push({ dayId: d.id, idx: i })));
  return out;
}
function nextOf(ref) {
  const flat = flatStops();
  const pos = flat.findIndex((p) => p.dayId === ref.dayId && p.idx === ref.idx);
  return pos >= 0 && pos < flat.length - 1 ? flat[pos + 1] : null;
}

function saveWalk() {
  try {
    localStorage.setItem(WALK_KEY, JSON.stringify(walkMode && activeStop ? { on: true, ...activeStop } : { on: false }));
  } catch (e) {}
}

function goToStop(dayId, idx) {
  if (activeDay !== 'all' && activeDay !== dayId) showDay(dayId);
  select(dayId, idx);
}

function updateWalkUI() {
  walkBtn.classList.toggle('is-active', walkMode);
  walkBtn.setAttribute('aria-pressed', walkMode ? 'true' : 'false');
  if (walkMode && activeStop && stopRef(activeStop)) {
    walkbar.hidden = false;
    walkbar.innerHTML = `${ICON.walk}<span class="wb-label">Next: ${esc(stopRef(activeStop).name)}</span>${ICON.chevRight}`;
  } else {
    walkbar.hidden = true;
    walkbar.innerHTML = '';
  }
}

async function showWalkNotification() {
  if (!walkMode || !activeStop || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const st = stopRef(activeStop);
    await reg.showNotification('Next stop: ' + st.name, {
      body: st.note || '',
      tag: 'next-stop',
      requireInteraction: true,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { dayId: activeStop.dayId, idx: activeStop.idx },
    });
  } catch (e) {}
}
function clearWalkNotification() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => reg.getNotifications({ tag: 'next-stop' }))
    .then((ns) => ns.forEach((n) => n.close()))
    .catch(() => {});
}

function setActiveStop(dayId, idx) {
  activeStop = { dayId, idx };
  saveWalk();
  updateWalkUI();
  showWalkNotification();
}

function advanceActive() {
  const nx = nextOf(activeStop);
  if (!nx) {
    walkMode = false;
    saveWalk();
    clearWalkNotification();
    updateWalkUI();
    toast('Trip complete 🎉');
    if (selected) renderSheet(byId[selected.dayId], selected.idx);
    return;
  }
  setActiveStop(nx.dayId, nx.idx);
  goToStop(nx.dayId, nx.idx);
}

async function toggleWalk() {
  if (walkMode) {
    walkMode = false;
    saveWalk();
    clearWalkNotification();
    updateWalkUI();
    if (selected) renderSheet(byId[selected.dayId], selected.idx);
    return;
  }
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (e) {}
  }
  walkMode = true;
  if (!activeStop || !stopRef(activeStop)) {
    activeStop = selected ? { dayId: selected.dayId, idx: selected.idx } : { dayId: (DATA.days.find((d) => d.date === TODAY) || DATA.days[0]).id, idx: 0 };
  }
  saveWalk();
  updateWalkUI();
  if ('Notification' in window && Notification.permission === 'granted') showWalkNotification();
  else toast('Add to Home Screen and allow notifications for lock-screen reminders');
  if (selected) renderSheet(byId[selected.dayId], selected.idx);
}

walkBtn.innerHTML = ICON.walk;
walkBtn.addEventListener('click', toggleWalk);
walkbar.addEventListener('click', () => activeStop && goToStop(activeStop.dayId, activeStop.idx));

// Notification tap (sw → here): focus the active stop.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'goto' && e.data.dayId != null) goToStop(e.data.dayId, e.data.idx);
  });
}

// ── Controls wiring ───────────────────────────────────────────
const newBtn = document.getElementById('new-btn');
newBtn.innerHTML = ICON.plus;
newBtn.addEventListener('click', openImport);

const toggleBtn = document.getElementById('list-toggle');
toggleBtn.innerHTML = ICON.list;
toggleBtn.addEventListener('click', () =>
  listview.classList.contains('is-open') ? closeList() : openList()
);

const locateBtn = document.getElementById('locate');
locateBtn.innerHTML = ICON.locate;
let userMarker = null;
locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) return;
  locateBtn.classList.add('is-active');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (!userMarker) {
        userMarker = L.marker(ll, {
          icon: L.divIcon({ className: '', html: '<div class="user-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
          zIndexOffset: 2000,
        }).addTo(map);
      } else {
        userMarker.setLatLng(ll);
      }
      map.panTo(ll, { animate: true });
      locateBtn.classList.remove('is-active');
    },
    () => locateBtn.classList.remove('is-active'),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
  );
});

// ── Init ──────────────────────────────────────────────────────
document.querySelector('#topbar h1').textContent = DATA.title;
buildChips();
buildList();
buildImport();
try {
  const w = JSON.parse(localStorage.getItem(WALK_KEY) || 'null');
  if (w && w.on && byId[w.dayId] && byId[w.dayId].stops[w.idx]) {
    walkMode = true;
    activeStop = { dayId: w.dayId, idx: w.idx };
  }
} catch (e) {}
if (walkMode && activeStop) {
  goToStop(activeStop.dayId, activeStop.idx);
  showWalkNotification();
} else {
  const startDay = DATA.days.find((d) => d.date === TODAY) || DATA.days[0];
  showDay(startDay.id);
}
updateWalkUI();
if (location.hash === '#import') openImport();

// ── PWA ───────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
