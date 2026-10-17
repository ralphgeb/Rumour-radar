// Rumour Radar — weather widget for the Today tab.
// Runs on your phone every time the app is opened (and every 15 minutes while
// it's open), using Open-Meteo: free, no key, no sign-up.
(() => {
  'use strict';

  const LONDON = { lat: 51.5072, lon: -0.1276, name: 'London' };
  const FRESH_MS = 10 * 60e3;       // re-fetch if the weather is older than this
  const COORDS_MS = 3 * 3600e3;     // re-check your location every 3 hours
  const el = () => document.getElementById('weather');

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- conditions (WMO weather codes) ----------
  function kind(code) {
    if (code === 0) return 'clear';
    if (code === 1) return 'mostlyClear';
    if (code === 2) return 'partly';
    if (code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return code === 65 || code === 82 ? 'heavyRain' : 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'thunder';
    return 'cloudy';
  }
  const LABEL = {
    clear: ['Sunny', 'Clear'], mostlyClear: ['Mostly Sunny', 'Mostly Clear'], partly: ['Partly Cloudy', 'Partly Cloudy'],
    cloudy: ['Cloudy', 'Cloudy'], fog: ['Foggy', 'Foggy'], drizzle: ['Drizzle', 'Drizzle'], rain: ['Rain', 'Rain'],
    heavyRain: ['Heavy Rain', 'Heavy Rain'], snow: ['Snow', 'Snow'], thunder: ['Thunderstorms', 'Thunderstorms']
  };
  const label = (k, day) => LABEL[k][day ? 0 : 1];

  // ---------- icons: bold, flat glyphs (outline in the text colour, one accent colour) ----------
  const CLOUD_D = 'M20 46a10 10 0 0 1-1-19.95A14 14 0 0 1 46 24a11 11 0 0 1 0 22z';
  const cloud = (dx = 0, dy = 0, s = 1) => `<path class="o m" transform="translate(${dx} ${dy}) scale(${s})" d="${CLOUD_D}"/>`;
  const rays = (cx, cy, r1, r2) => Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return `M${(cx + Math.cos(a) * r1).toFixed(1)} ${(cy + Math.sin(a) * r1).toFixed(1)}L${(cx + Math.cos(a) * r2).toFixed(1)} ${(cy + Math.sin(a) * r2).toFixed(1)}`;
  }).join('');
  const sun = (cx, cy, r) => `<circle class="sun" cx="${cx}" cy="${cy}" r="${r}"/><path class="ray" d="${rays(cx, cy, r + 5, r + 10)}"/>`;
  const moon = (cx, cy, r) => `<path class="o moon" d="M${cx + r * 0.2} ${cy - r}A${r} ${r} 0 1 0 ${cx + r} ${cy + r * 0.25} ${r * 0.78} ${r * 0.78} 0 0 1 ${cx + r * 0.2} ${cy - r}z"/>`;
  const sky = (day, cx, cy, r) => (day ? sun(cx, cy, r) : moon(cx - 1, cy + 1, r * 1.35));
  const lines = (pts, cls) => `<path class="${cls}" d="${pts.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join('')}"/>`;

  function icon(k, day, size) {
    const body = {
      clear: day ? sun(32, 32, 12) : moon(30, 32, 16),
      mostlyClear: sky(day, 24, 22, 8) + cloud(10, 10, 0.85),
      partly: sky(day, 22, 20, 9) + cloud(4, 4, 1),
      cloudy: cloud(-6, -8, 0.8) + cloud(4, 4, 1),
      fog: cloud(0, -8, 1) + lines([[12, 48, 52, 48], [18, 56, 46, 56]], 'o'),
      drizzle: cloud(0, -10, 1) + '<g class="drop">' + [[22, 46], [32, 52], [42, 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6"/>`).join('') + '</g>',
      rain: cloud(0, -10, 1) + lines([[24, 44, 20, 54], [34, 44, 30, 54], [44, 44, 40, 54]], 'rain'),
      heavyRain: cloud(0, -10, 1) + lines([[20, 44, 15, 57], [30, 44, 25, 57], [40, 44, 35, 57], [50, 44, 45, 57]], 'rain'),
      snow: cloud(0, -10, 1) + '<g class="flake">' + [[22, 49], [32, 55], [42, 49]].map(([x, y]) => `<path d="M${x} ${y - 4}V${y + 4}M${x - 3.5} ${y - 2}L${x + 3.5} ${y + 2}M${x - 3.5} ${y + 2}L${x + 3.5} ${y - 2}"/>`).join('') + '</g>',
      thunder: cloud(0, -10, 1) + '<path class="bolt" d="M34 38 24 52h8l-3 11 12-16h-8l4-9z"/>'
    }[k];
    return `<svg class="wx-ic" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
  }

  // ---------- location ----------
  function getCoords(force) {
    const mode = store.get('rr.wxMode', 'auto');
    if (mode === 'london' || !navigator.geolocation) return Promise.resolve(LONDON);
    const cached = store.get('rr.wxCoords', null);
    if (!force && cached && Date.now() - cached.t < COORDS_MS) return Promise.resolve(cached);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (p) => {
          const c = { lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3), t: Date.now() };
          c.name = (cached && Math.abs(cached.lat - c.lat) < 0.03 && Math.abs(cached.lon - c.lon) < 0.03 && cached.name) || await placeName(c);
          store.set('rr.wxCoords', c);
          resolve(c);
        },
        () => resolve(cached || LONDON),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60e3 }
      );
    });
  }
  async function placeName(c) {
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${c.lat}&longitude=${c.lon}&localityLanguage=en`);
      const j = await r.json();
      return j.locality || j.city || j.principalSubdivision || 'My Location';
    } catch { return 'My Location'; }
  }

  // ---------- data ----------
  async function fetchWeather(c) {
    const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
      latitude: c.lat, longitude: c.lon,
      current: 'temperature_2m,apparent_temperature,weather_code,is_day',
      hourly: 'temperature_2m,weather_code,is_day,precipitation_probability',
      daily: 'temperature_2m_max,temperature_2m_min',
      timezone: 'auto', forecast_days: 2
    });
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('weather ' + r.status);
    const j = await r.json();
    // Hourly list from the current hour onwards, using the place's own clock.
    const nowLocal = j.current.time.slice(0, 13); // "YYYY-MM-DDTHH"
    let start = j.hourly.time.findIndex((t) => t.slice(0, 13) === nowLocal);
    if (start < 0) start = 0;
    const hours = [0, 2, 4, 6, 8, 10].map((off, n) => {
      const i = start + off;
      return {
        label: n === 0 ? 'Now' : j.hourly.time[i]?.slice(11, 16),
        temp: n === 0 ? j.current.temperature_2m : j.hourly.temperature_2m[i],
        code: n === 0 ? j.current.weather_code : j.hourly.weather_code[i],
        day: !!(n === 0 ? j.current.is_day : j.hourly.is_day[i]),
        rain: j.hourly.precipitation_probability?.[i] ?? null
      };
    }).filter((h) => h.label);
    return {
      place: c.name || 'My Location',
      fetched: Date.now(),
      temp: j.current.temperature_2m,
      feels: j.current.apparent_temperature,
      code: j.current.weather_code,
      day: !!j.current.is_day,
      hi: j.daily.temperature_2m_max[0],
      lo: j.daily.temperature_2m_min[0],
      hours
    };
  }

  // ---------- render ----------
  const deg = (t) => `${Math.round(t)}°`;
  function render(w, state) {
    const box = el();
    if (!box) return;
    if (!w) {
      box.className = 'wx wx-loading';
      box.innerHTML = state === 'error'
        ? '<div class="wx-msg">Weather unavailable · tap to retry</div>'
        : '<div class="wx-skel"><i></i><i></i><i></i></div>';
      return;
    }
    const k = kind(w.code);
    const usingLondon = store.get('rr.wxMode', 'auto') === 'london';
    box.className = 'wx';
    box.innerHTML = `
      <div class="wx-top">
        <div class="wx-left">
          <div class="wx-date">${esc(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }))}</div>
          <div class="wx-temp">${deg(w.temp)}</div>
          <div class="wx-sub"><b>${esc(label(k, w.day))}</b> · H ${deg(w.hi)} L ${deg(w.lo)}</div>
          <div class="wx-place">${usingLondon ? '' : '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M11 1 1 5.4l4.3 1.3L6.6 11z" fill="currentColor"/></svg>'}${esc(w.place)}</div>
        </div>
        ${icon(k, w.day, 104)}
      </div>
      <div class="wx-hours">
        ${w.hours.map((h) => {
          const hk = kind(h.code);
          const wet = ['drizzle', 'rain', 'heavyRain', 'thunder', 'snow'].includes(hk) && h.rain >= 20;
          return `<div class="wx-h">
            <span class="wx-ht">${esc(h.label)}</span>
            ${icon(hk, h.day, 30)}
            <span class="wx-hd">${deg(h.temp)}</span>
            <span class="wx-pop">${wet ? h.rain + '%' : ''}</span>
          </div>`;
        }).join('')}
      </div>`;
  }

  let busy = false;
  async function update(force) {
    if (busy) return;
    const cached = store.get('rr.wx', null);
    if (cached) render(cached); else render(null);
    if (!force && cached && Date.now() - cached.fetched < FRESH_MS) return;
    busy = true;
    try {
      const c = await getCoords(force);
      const w = await fetchWeather(c);
      store.set('rr.wx', w);
      render(w);
    } catch {
      if (!cached) render(null, 'error');
    } finally { busy = false; }
  }

  function setMode(mode) {
    store.set('rr.wxMode', mode);
    document.querySelectorAll('#wxSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
    if (mode === 'auto') store.set('rr.wxCoords', null);
    update(true);
  }

  function init() {
    if (!el()) return;
    document.querySelectorAll('#wxSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === store.get('rr.wxMode', 'auto')));
    document.getElementById('wxSeg')?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.v); });
    el().addEventListener('click', () => update(true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) update(false); });
    if (window.RR) window.RR.refreshWeather = () => update(true);
    setInterval(() => { if (!document.hidden) update(true); }, 15 * 60e3);
    // Show the last known weather straight away; ask for location after the welcome sheet.
    const cached = store.get('rr.wx', null);
    render(cached);
    setTimeout(() => {
      const welcome = document.getElementById('welcome');
      if (welcome && welcome.open) welcome.addEventListener('close', () => update(false), { once: true });
      else update(false);
    }, 700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
