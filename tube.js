// Rumour Radar — live Tube status for the Today tab.
// Fetched on your phone from TfL's free, official live feed every time the app
// is opened, and every 5 minutes while it's open.
(() => {
  'use strict';

  const URL_STATUS = 'https://api.tfl.gov.uk/Line/Mode/tube,elizabeth-line/Status';
  const FRESH_MS = 2 * 60e3;
  const COLOURS = {
    bakerloo: '#B36305', central: '#E32017', circle: '#FFD300', district: '#00782A',
    'hammersmith-city': '#F3A9BB', jubilee: '#A0A5A9', metropolitan: '#9B0056', northern: '#1c1c1e',
    piccadilly: '#003688', victoria: '#0098D4', 'waterloo-city': '#95CDBA', elizabeth: '#6950A1'
  };
  const SHORT = { 'Hammersmith & City': 'H&C', 'Waterloo & City': 'W&C', 'Elizabeth line': 'Elizabeth' };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = () => document.getElementById('tube');
  const TRAIN = '<svg class="tb-mark" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="4"/><path d="M5 10h14M9 21l2-4M15 21l-2-4"/><circle cx="9" cy="13.5" r="1" class="f"/><circle cx="15" cy="13.5" r="1" class="f"/></svg>';

  // 0 = good, 1 = minor, 2 = severe, -1 = info only
  function level(sev) {
    if (sev === 10 || sev === 18) return 0;
    if ([9, 7, 14, 15, 19, 0, 8].includes(sev)) return 1;
    return 2;
  }

  async function fetchStatus() {
    const r = await fetch(URL_STATUS, { cache: 'no-store' });
    if (!r.ok) throw new Error('TfL ' + r.status);
    const j = await r.json();
    const lines = j.map((l) => {
      const sts = (l.lineStatuses || []).map((s) => ({ lvl: level(s.statusSeverity), text: s.statusSeverityDescription, reason: s.reason || '' }));
      sts.sort((a, b) => b.lvl - a.lvl);
      const worst = sts[0] || { lvl: 0, text: 'Good Service', reason: '' };
      const texts = [...new Set(sts.filter((s) => s.lvl === worst.lvl).map((s) => s.text))];
      const reasons = [...new Set(sts.map((s) => s.reason).filter(Boolean))];
      return { id: l.id, name: l.name, lvl: worst.lvl, status: texts.join(' · '), reason: reasons.join('\n\n') };
    });
    return { fetched: Date.now(), lines };
  }

  const time = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  const tidy = (reason, name) => reason.replace(new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( line)?:\\s*', 'i'), '').trim();

  function render(data, state) {
    const box = el();
    if (!box) return;
    if (store.get('rr.tube', 'show') === 'hide') { box.hidden = true; return; }
    box.hidden = false;
    if (!data) {
      box.innerHTML = `<div class="tb-bar1"><span class="tb-title">${TRAIN}Tube</span><span class="tb-ok muted">${state === 'error' ? 'Unavailable' : 'Loading…'}</span><button class="tb-upd" data-tube-refresh>${state === 'error' ? 'Retry' : ''}</button></div>`;
      return;
    }
    const bad = data.lines.filter((l) => l.lvl > 0).sort((a, b) => b.lvl - a.lvl || a.name.localeCompare(b.name));
    const upd = `Updated ${time(data.fetched)}`;
    if (!bad.length) {
      box.innerHTML = `<div class="tb-bar1"><span class="tb-title">${TRAIN}Tube</span><span class="tb-ok"><span class="tb-okdot"></span>Good service</span><button class="tb-upd" data-tube-refresh>${upd}</button></div>`;
      return;
    }
    const sev = bad.some((l) => l.lvl === 2);
    const wasOpen = box.querySelector('details.tb-all')?.open;
    const openLines = new Set([...box.querySelectorAll('details.tb-row[open]')].map((d) => d.dataset.id));
    box.innerHTML = `
      <details class="tb-all"${wasOpen ? ' open' : ''}>
        <summary class="tb-bar1">
          <span class="tb-title">${TRAIN}Tube</span>
          <span class="tb-swatches">${bad.map((l) => `<i class="tb-sw lvl${l.lvl}" style="--c:${COLOURS[l.id] || '#888'}" title="${esc(l.name)}"></i>`).join('')}</span>
          <span class="tb-count ${sev ? 'sev' : 'min'}">${bad.length} disrupted</span>
          <svg class="tb-chev" viewBox="0 0 12 8" width="11" height="8"><path d="M1 1.5l5 5 5-5"/></svg>
        </summary>
        <div class="tb-list">
          ${bad.map((l) => `
          <details class="tb-row lvl${l.lvl}" data-id="${esc(l.id)}"${openLines.has(l.id) ? ' open' : ''}>
            <summary>
              <span class="tb-dot" style="--c:${COLOURS[l.id] || '#888'}"></span>
              <span class="tb-name">${esc(l.name)}</span>
              <span class="tb-st">${esc(l.status)}</span>
              <svg class="tb-chev" viewBox="0 0 12 8" width="10" height="7"><path d="M1 1.5l5 5 5-5"/></svg>
            </summary>
            <div class="tb-more">
              <div class="tb-st-big">${esc(l.status)}</div>
              <p class="tb-reason">${esc(l.reason ? tidy(l.reason, l.name) : 'No further details from TfL.')}</p>
            </div>
          </details>`).join('')}
          <div class="tb-rest"><span>Good service on all other lines</span><button class="tb-upd" data-tube-refresh>${upd} · ${day(data.fetched)}</button></div>
        </div>
      </details>`;
  }

  let busy = false;
  async function update(force) {
    if (busy) return;
    const cached = store.get('rr.tubeData', null);
    render(cached);
    if (store.get('rr.tube', 'show') === 'hide') return;
    if (!force && cached && Date.now() - cached.fetched < FRESH_MS) return;
    busy = true;
    const btn = el()?.querySelector('[data-tube-refresh]');
    if (btn && cached) btn.textContent = 'Updating…';
    try {
      const d = await fetchStatus();
      store.set('rr.tubeData', d);
      render(d);
    } catch {
      if (cached) render(cached); else render(null, 'error');
    } finally { busy = false; }
  }

  function setMode(mode) {
    store.set('rr.tube', mode);
    document.querySelectorAll('#tubeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
    update(true);
  }

  function init() {
    if (!el()) return;
    document.querySelectorAll('#tubeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === store.get('rr.tube', 'show')));
    document.getElementById('tubeSeg')?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.v); });
    el().addEventListener('click', (e) => {
      if (e.target.closest('[data-tube-refresh]')) { e.preventDefault(); e.stopPropagation(); update(true); }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) update(false); });
    setInterval(() => { if (!document.hidden) update(true); }, 5 * 60e3);
    update(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
