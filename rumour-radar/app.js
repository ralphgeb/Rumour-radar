(() => {
  'use strict';

  const TOPICS = [
    'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Nvidia', 'Tesla & EVs', 'AI',
    'Chips', 'Phones & Gadgets', 'Gaming', 'Streaming & Media', 'Social media',
    'Crypto', 'Banks & Finance', 'Markets & Economy', 'Energy', 'Cars', 'Space',
    'Health & Biotech', 'Retail', 'Telecoms', 'Deals & Mergers', 'UK business', 'Other'
  ];
  const IMPACT = { none: 0, low: 1, medium: 2, high: 3 };
  const ARROW = { up: '▲', down: '▼', mixed: '◆' };

  // ---- small helpers ----
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  };
  const ago = (iso) => {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };
  const band = (p) => (p >= 65 ? 'likely' : p >= 35 ? 'maybe' : 'unlikely');
  const bandWord = (p) => (p >= 80 ? 'Very likely' : p >= 65 ? 'Likely' : p >= 35 ? 'Toss-up' : p >= 15 ? 'Unlikely' : 'Very unlikely');
  const quoteUrl = (t) => 'https://finance.yahoo.com/quote/' + encodeURIComponent(t);
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');

  function ring(story, big) {
    const r = 22, c = 2 * Math.PI * r;
    if (story.status === 'news' || story.likelihood == null) {
      return `<div class="ring"><svg viewBox="0 0 54 54"><circle class="track" cx="27" cy="27" r="${r}" fill="none" stroke-width="5"/></svg><span class="lbl muted">News</span></div>`;
    }
    const p = story.likelihood;
    const cls = story.status === 'confirmed' ? 'c-likely' : story.status === 'denied' ? 'c-unlikely' : 'c-' + band(p);
    const label = story.status === 'confirmed' ? '✓' : story.status === 'denied' ? '✕' : p + '%';
    const sub = big ? '' : story.status === 'rumour' ? '<small>likely</small>' : '';
    return `<div class="ring ${cls}"><svg viewBox="0 0 54 54"><circle class="track" cx="27" cy="27" r="${r}" fill="none" stroke-width="5"/><circle class="val" cx="27" cy="27" r="${r}" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(p / 100) * c} ${c}"/></svg><span><span class="lbl">${label}${sub}</span></span></div>`;
  }

  // ---- state ----
  let stories = [];
  let interests = store.get('rr.interests', null); // null = never set up
  const state = {
    status: store.get('rr.status', 'rumour'),
    topic: 'foryou',
    sort: store.get('rr.sort', 'latest')
  };

  // ---- data ----
  async function load(manual) {
    const btn = $('#refreshBtn');
    btn.classList.add('spin');
    try {
      const res = await fetch('data/news.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      stories = Array.isArray(data.stories) ? data.stories : [];
      $('#updated').textContent = data.updated ? 'Updated ' + ago(data.updated) : 'Waiting for first update';
    } catch (e) {
      $('#updated').textContent = navigator.onLine ? 'Couldn’t load news' : 'Offline';
    } finally {
      setTimeout(() => btn.classList.remove('spin'), manual ? 400 : 0);
      render();
    }
  }

  // ---- filtering ----
  function visible() {
    let list = stories.slice();
    if (state.status === 'rumour') list = list.filter((s) => s.status === 'rumour');
    else if (state.status === 'resolved') list = list.filter((s) => s.status === 'confirmed' || s.status === 'denied');

    if (state.topic === 'foryou') {
      if (interests && interests.length) list = list.filter((s) => (s.topics || []).some((t) => interests.includes(t)));
    } else if (state.topic !== 'everything') {
      list = list.filter((s) => (s.topics || []).includes(state.topic));
    }

    const t = (s) => s.last_updated || s.first_seen || '';
    if (state.sort === 'likely') list.sort((a, b) => (b.likelihood ?? -1) - (a.likelihood ?? -1) || t(b).localeCompare(t(a)));
    else if (state.sort === 'impact') list.sort((a, b) => (IMPACT[b.overall_impact] || 0) - (IMPACT[a.overall_impact] || 0) || t(b).localeCompare(t(a)));
    else list.sort((a, b) => t(b).localeCompare(t(a)));
    return list;
  }

  // ---- rendering ----
  function renderChips() {
    const mine = (interests || []).filter((t) => TOPICS.includes(t));
    const chips = [['foryou', 'For you'], ...mine.map((t) => [t, t]), ['everything', 'Everything']];
    $('#topicChips').innerHTML = chips.map(([k, l]) =>
      `<button class="chip ${state.topic === k ? 'on' : ''}" data-topic="${esc(k)}">${esc(l)}</button>`).join('');
  }

  function card(s) {
    const outlets = s.sources?.length || 1;
    const lead = s.sources?.[0]?.name || '';
    const badge = s.status === 'rumour' ? '<span class="badge rumour">Rumour</span>'
      : s.status === 'confirmed' ? '<span class="badge confirmed">Confirmed</span>'
      : s.status === 'denied' ? '<span class="badge denied">Denied</span>'
      : '<span class="badge">News</span>';
    const hot = s.overall_impact === 'high' ? '<span class="badge hot">High impact</span>' : '';
    const stocks = (s.stocks || []).slice(0, 4).map((k) =>
      `<span class="tk"><span class="arr ${esc(k.direction)}">${ARROW[k.direction] || '◆'}</span>${esc(k.ticker)}</span>`).join('');
    return `<button class="card" data-id="${esc(s.id)}">
      <div>
        <div class="meta">${badge}${hot}<span>${esc(lead)}${outlets > 1 ? ` +${outlets - 1}` : ''} · ${ago(s.last_updated || s.first_seen)}</span></div>
        <p class="claim">${esc(s.claim)}</p>
      </div>
      ${ring(s)}
      ${stocks ? `<div class="stocks">${stocks}</div>` : ''}
    </button>`;
  }

  function render() {
    renderChips();
    document.querySelectorAll('#statusTabs button').forEach((b) => b.classList.toggle('active', b.dataset.status === state.status));
    $('#sortSel').value = state.sort;
    const list = visible();
    if (!stories.length) {
      $('#list').innerHTML = `<div class="empty"><h2>No stories yet</h2><p>The first update runs within 30 minutes of setup. Pull the refresh button again in a bit.</p></div>`;
      return;
    }
    if (!list.length) {
      const hint = state.topic === 'foryou' ? 'Try “Everything”, or add more interests in settings.' : 'Try another topic or tab.';
      $('#list').innerHTML = `<div class="empty"><h2>Nothing here right now</h2><p>${hint}</p></div>`;
      return;
    }
    $('#list').innerHTML = list.map(card).join('');
  }

  function openDetail(id) {
    const s = stories.find((x) => x.id === id);
    if (!s) return;
    const outlets = s.sources?.length || 1;
    const likelyBlock = s.status === 'news' ? '' : `
      <h3>How likely is it?</h3>
      <div class="panel">
        <div class="likely-row">
          ${ring(s, true)}
          <div>
            <b>${s.status === 'confirmed' ? 'Confirmed' : s.status === 'denied' ? 'Denied' : bandWord(s.likelihood)}</b>
            <div class="muted small">${outlets} outlet${outlets > 1 ? 's' : ''} reporting · first seen ${ago(s.first_seen)}</div>
          </div>
        </div>
        <p class="small">${esc(s.likelihood_reason)}</p>
        ${(s.signals || []).length ? `<div class="signals">${s.signals.map((x) => `<span class="signal">${esc(x)}</span>`).join('')}</div>` : ''}
      </div>`;
    const stocks = (s.stocks || []).length ? `
      <h3>Stocks it could move${s.overall_impact && s.overall_impact !== 'none' ? ` · ${esc(s.overall_impact)} impact` : ''}</h3>
      <div class="stock-list">${s.stocks.map((k) => `
        <a class="stock" href="${quoteUrl(k.ticker)}" target="_blank" rel="noopener">
          <span class="dir ${esc(k.direction)}">${ARROW[k.direction] || '◆'}</span>
          <span class="nm">${esc(k.name)}<code>${esc(k.ticker)}</code> <span class="muted small">· ${esc(k.impact)}</span></span>
          <span class="why">${esc(k.reason)}</span>
        </a>`).join('')}</div>` : '';
    const sources = `
      <h3>Sources</h3>
      <ul class="sources">${(s.sources || []).map((x) => `
        <li><a href="${esc(safeUrl(x.link))}" target="_blank" rel="noopener"><b>${esc(x.name)}</b> <span class="muted small">· ${ago(x.published)}</span><span class="t">${esc(x.title)}</span></a></li>`).join('')}</ul>`;
    $('#detailBody').innerHTML = `
      <div class="meta">${(s.topics || []).map((t) => `<span class="badge">${esc(t)}</span>`).join('')}</div>
      <h2>${esc(s.claim)}</h2>
      <p>${esc(s.summary)}</p>
      ${likelyBlock}${stocks}${sources}
      <p class="disclaimer">AI estimate based on headlines. It can be wrong. Not financial advice.</p>`;
    $('#detail').showModal();
    $('#detail .sheet-inner').scrollTop = 0;
  }

  function openSettings(first) {
    $('#settingsTitle').textContent = first ? 'Welcome to Rumour Radar' : 'Your interests';
    $('#settingsIntro').textContent = first
      ? 'Pick the topics you care about and your “For you” feed will only show those. You can change this any time.'
      : 'Pick the topics you care about. “For you” shows only these.';
    const chosen = new Set(interests || []);
    $('#interestChips').innerHTML = TOPICS.map((t) =>
      `<button class="chip ${chosen.has(t) ? 'on' : ''}" data-interest="${esc(t)}">${esc(t)}</button>`).join('');
    const standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    $('#installTip').hidden = !!standalone;
    $('#settings').showModal();
  }

  // ---- events ----
  $('#statusTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.status = b.dataset.status; store.set('rr.status', state.status); render();
  });
  $('#topicChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-topic]'); if (!b) return;
    state.topic = b.dataset.topic; render();
  });
  $('#sortSel').addEventListener('change', (e) => { state.sort = e.target.value; store.set('rr.sort', state.sort); render(); });
  $('#list').addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) openDetail(c.dataset.id); });
  $('#refreshBtn').addEventListener('click', () => load(true));
  $('#settingsBtn').addEventListener('click', () => openSettings(false));
  $('#interestChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-interest]'); if (!b) return;
    b.classList.toggle('on');
    interests = [...document.querySelectorAll('#interestChips .chip.on')].map((x) => x.dataset.interest);
    store.set('rr.interests', interests);
    if (state.topic !== 'foryou' && state.topic !== 'everything' && !interests.includes(state.topic)) state.topic = 'foryou';
    render();
  });
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-close]')) d.close();
    });
    d.addEventListener('close', () => {
      if (d.id === 'settings' && interests === null) { interests = []; store.set('rr.interests', interests); render(); }
    });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);

  // ---- start ----
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  load();
  if (interests === null) setTimeout(() => openSettings(true), 300);
})();
