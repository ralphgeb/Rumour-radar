(() => {
  'use strict';

  // ---------- constants ----------
  const TOPICS = [
    'AI', 'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Nvidia', 'Tesla & EVs',
    'Chips', 'Phones & Gadgets', 'Computers', 'Gaming', 'Software & Apps', 'Cybersecurity',
    'Streaming & Media', 'Social media', 'Startups & VC', 'Crypto', 'Markets & Economy',
    'Banks & Finance', 'Deals & Mergers', 'Policy & Regulation', 'Energy', 'Cars', 'Space',
    'Science', 'Health & Biotech', 'Retail', 'Telecoms', 'UK business',
    'World politics', 'Conflict & security', 'Elections', 'Trade & tariffs', 'Central banks',
    'Commodities', 'Climate'
  ];
  const SECTIONS = [['all', 'All'], ['foryou', 'For You'], ['Tech', 'Tech'], ['Finance', 'Finance'], ['World', 'World'], ['rumours', 'Rumours']];
  const IMPACT = { none: 0, low: 1, medium: 2, high: 3 };
  const ARROW = { up: '▲', down: '▼', mixed: '◆' };
  const PAGE_SIZE = 40;
  const LOGO_COLORS = ['#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#ff9f0a', '#30d158', '#40c8e0', '#64d2ff', '#ac8e68', '#ff453a'];

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const favicon = (u) => { const h = host(u); return h ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64` : ''; };
  const ago = (iso) => {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    const d = Math.floor(s / 86400);
    return d === 1 ? 'Yesterday' : d + 'd ago';
  };
  const londonParts = (d = new Date()) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
    return { h: Number(p.hour), m: Number(p.minute) };
  };
  const londonTime = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  const londonDay = (iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', ...opts });
  function nextUpdateLabel() {
    const { h, m } = londonParts();
    const mins = h * 60 + m;
    if (mins < 7 * 60 + 30) return 'at 7:30';
    if (mins < 17 * 60) return 'at 17:00';
    return 'tomorrow at 7:30';
  }
  const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const initials = (name, ticker) => {
    const t = String(ticker || '').split(/[.\-=^]/)[0].replace(/^\d+$/, '');
    if (t) return t.slice(0, 4).toUpperCase();
    const w = String(name || '?').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/);
    return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
  };
  const band = (p) => (p >= 65 ? 'likely' : p >= 35 ? 'maybe' : 'unlikely');
  const verdict = (s) => s.status === 'confirmed' ? 'Confirmed' : s.status === 'denied' ? 'Denied'
    : s.likelihood >= 80 ? 'Very likely' : s.likelihood >= 65 ? 'Likely' : s.likelihood >= 35 ? 'Toss-up' : s.likelihood >= 15 ? 'Unlikely' : 'Very unlikely';

  // story accessors (older stories may be missing newer fields)
  const headline = (s) => s.headline || s.sources?.[0]?.title || s.claim || '';
  const imageOf = (s) => safeUrl(s.image) || safeUrl((s.sources || []).find((x) => safeUrl(x.image))?.image);
  const sectionOf = (s) => (/^(markets|finance)$/i.test(s.section || '') ? 'Finance' : /^world$/i.test(s.section || '') ? 'World' : 'Tech');
  const pubTime = (s) => s.first_published || s.first_seen || s.last_updated || '';
  const updTime = (s) => s.last_updated || s.first_seen || '';
  const lead = (s) => s.sources?.[0] || { name: '', link: '' };

  function media(s, extra = '') {
    const img = s ? imageOf(s) : '';
    const src = s ? (lead(s).name || sectionOf(s)) : 'Rumour Radar';
    return `<div class="img sec-${esc(s ? sectionOf(s) : 'Tech')}">
      <span class="fb">${esc(src)}</span>
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.classList.add('broken')">` : ''}
      ${extra}
    </div>`;
  }

  function sourceLine(s) {
    const l = lead(s);
    const n = s.sources?.length || 1;
    const fav = favicon(l.link);
    return `<div class="src">${fav ? `<img class="fav" src="${esc(fav)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<span class="nm">${esc(l.name)}${n > 1 ? ` <span style="color:var(--label-2);font-weight:500">+${n - 1}</span>` : ''}</span></div>`;
  }

  function statusPill(s) {
    if (s.status === 'rumour') return `<span class="pill rumour">Rumour · ${s.likelihood ?? '?'}%</span>`;
    if (s.status === 'confirmed') return '<span class="pill confirmed">Confirmed</span>';
    if (s.status === 'denied') return '<span class="pill denied">Denied</span>';
    return '';
  }

  const tickers = (s, n = 3) => (s.stocks || []).slice(0, n).map((k) =>
    `<span class="tk"><span class="ar ${esc(k.direction)}">${ARROW[k.direction] || '◆'}</span>${esc(k.ticker)}</span>`).join('');

  function logo(name, ticker, cls = 'logo') {
    const c = LOGO_COLORS[hash(ticker || name) % LOGO_COLORS.length];
    const txt = initials(name, ticker);
    return `<span class="${cls}${txt.length > 3 ? ' long' : ''}" style="background:${c}">${esc(txt)}</span>`;
  }

  const chevron = '<svg class="chev" viewBox="0 0 8 13"><path d="M1.5 1.5 6.5 6.5 1.5 11.5"/></svg>';
  const sectionHead = (title, right = '') => `<div class="section-head"><h2>${esc(title)}</h2>${right ? `<span>${esc(right)}</span>` : ''}</div>`;

  // ---------- state ----------
  let stories = [];
  let byId = new Map();
  let briefing = { editions: [] };
  let updated = null;
  let lastRun = null;
  let sourceCount = 0;
  let interests = store.get('rr.interests', null);
  const state = {
    tab: 'today',
    edition: 0,
    section: store.get('rr.section', 'all'),
    newsLimit: PAGE_SIZE,
    rumourStatus: 'rumour',
    rumourSort: store.get('rr.rumourSort', 'latest')
  };
  const scrollMemory = {};

  // ---------- theme ----------
  const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    const pref = store.get('rr.theme', 'auto');
    const dark = pref === 'dark' || (pref === 'auto' && darkQuery?.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    $('#themeColor')?.setAttribute('content', dark ? '#000000' : '#f2f2f7');
    $$('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === pref));
  }
  darkQuery?.addEventListener?.('change', applyTheme);

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, ms = 3500) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------- data ----------
  async function load() {
    try {
      const [n, b] = await Promise.all([
        fetch('data/news.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch('data/briefing.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { editions: [] })).catch(() => ({ editions: [] }))
      ]);
      stories = (Array.isArray(n.stories) ? n.stories : [])
        .map((s) => ({ ...s, sources: (s.sources || []).filter((x) => !/cnbc/i.test(x.name || '') && !/cnbc/i.test(x.link || '')) }))
        .filter((s) => s.sources.length);
      byId = new Map(stories.map((s) => [s.id, s]));
      updated = n.updated;
      lastRun = n.last_run || null;
      briefing = b && Array.isArray(b.editions) ? b : { editions: [] };
      fetch('feeds.json', { cache: 'no-store' }).then((r) => r.json()).then((f) => { sourceCount = f.length; renderSettings(); }).catch(() => {});
    } catch {
      /* keep what we have */
    }
    renderAll();
    window.RR?.afterLoad?.();
  }

  // ---------- refresh (the button at the top) ----------
  let refreshing = false;
  const setRefreshLabel = (t) => { $('#refreshBtn .refresh-label').textContent = t; };
  function setBusy(on) {
    $('#refreshBtn').classList.toggle('busy', on);
    $('#refreshBtn').setAttribute('aria-label', on ? 'Refreshing' : 'Refresh news');
  }
  function repoInfo() {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!m) return null;
    const seg = location.pathname.split('/').filter(Boolean)[0];
    return { owner: m[1], repo: seg && !/\.html$/.test(seg) ? seg : `${m[1]}.github.io` };
  }
  function github(token, repo) {
    return (pathname, opts = {}) => fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}${pathname}`, {
      ...opts,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
  }
  async function findWorkflow(gh) {
    const res = await gh('/actions/workflows?per_page=100');
    if (res.status === 401) throw new Error('Your GitHub key was rejected. Check it in Settings.');
    if (res.status === 403 || res.status === 404) throw new Error('Your GitHub key can’t see this repository. Check its repository access in Settings.');
    const j = await res.json();
    const wf = (j.workflows || []).find((w) => /update-news\.ya?ml$/.test(w.path) || w.name === 'Update news');
    if (!wf) throw new Error('Couldn’t find the “Update news” workflow on GitHub.');
    return wf.id;
  }

  // Starts the update on GitHub and waits until the new data is published.
  //   mode 'full'   = news + stocks (a few minutes)
  //   mode 'stocks' = stocks only (about a minute)
  async function runUpdate(mode = 'full') {
    if (refreshing) return;
    refreshing = true;
    setRefreshLabel('Refreshing');
    setBusy(true);
    const before = updated;
    const stocksStamp = async () => { try { const r = await fetch('data/stocks.json?t=' + Date.now(), { cache: 'no-store' }); return r.ok ? (await r.json()).updated : null; } catch { return null; } };
    try {
      const token = store.get('rr.ghToken', '');
      const repo = repoInfo();
      if (!token || !repo) {
        await Promise.all([load(), sleep(900)]);
        if (mode === 'stocks') toast('Prices reloaded. Turn on Live refresh in Settings to fetch the latest prices now.', 4500);
        else toast(updated && updated !== before ? 'New stories loaded' : `You’re up to date · next update ${nextUpdateLabel()}`);
        return;
      }
      toast(mode === 'stocks' ? 'Fetching the latest prices. This takes about a minute.' : 'Fetching the latest news from 60+ sites. This takes a few minutes.', 4500);
      const gh = github(token, repo);
      const wf = await findWorkflow(gh);
      const t0 = Date.now();
      const wl = (window.RR?.watchlist?.() || []);
      let r = await gh(`/actions/workflows/${wf}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { mode, watchlist: wl.length ? wl.join(',') : '-' } }) });
      if (r.status === 422) {
        // The workflow on GitHub is an older version without these options: run a normal update instead.
        r = await gh(`/actions/workflows/${wf}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
        mode = 'full';
        setTimeout(() => toast('Tip: update your workflow file (see README) so your own stocks are included.', 5000), 5000);
      }
      if (r.status === 401) throw new Error('Your GitHub key was rejected. Check it in Settings.');
      if (r.status === 403 || r.status === 404) throw new Error('Your GitHub key needs “Actions: Read and write” permission.');
      if (!r.ok) throw new Error(`GitHub couldn’t start the update (${r.status}).`);

      // Wait for the update to finish on GitHub.
      let run = null;
      const deadline = t0 + 30 * 60e3;
      while (Date.now() < deadline) {
        await sleep(6000);
        const res = await gh(`/actions/workflows/${wf}/runs?event=workflow_dispatch&per_page=5`).catch(() => null);
        if (!res || !res.ok) continue;
        const j = await res.json();
        run = (j.workflow_runs || []).find((x) => new Date(x.created_at).getTime() >= t0 - 60e3) || null;
        if (run) setRefreshLabel(run.status === 'queued' || run.status === 'waiting' ? 'Waiting' : 'Refreshing');
        if (run && run.status === 'completed') break;
      }
      if (!run || run.status !== 'completed') throw new Error('Still working on it. New data will appear when it’s done.');
      if (run.conclusion !== 'success') throw new Error('The update failed on GitHub. Open the Actions tab to see why.');

      // Wait for GitHub Pages to publish it.
      setRefreshLabel('Publishing');
      const pubDeadline = Date.now() + 8 * 60e3;
      let fresh = false;
      while (Date.now() < pubDeadline) {
        if (mode === 'stocks') {
          const st = await stocksStamp();
          fresh = !!st && new Date(st).getTime() >= t0 - 60e3;
        } else {
          await load();
          fresh = !!updated && new Date(updated).getTime() >= t0 - 60e3;
        }
        if (fresh) break;
        await sleep(10000);
      }
      await load();
      if (mode === 'stocks') toast(fresh ? 'Prices updated' : 'Update done. It may take another minute to appear.');
      else toast(fresh ? (lastRun && lastRun.added ? `Updated · ${lastRun.added} new stor${lastRun.added === 1 ? 'y' : 'ies'}` : 'Updated · you’re all caught up') : 'Update done. It may take another minute to appear.');
    } catch (e) {
      toast(e.message || 'Couldn’t refresh right now.', 5500);
    } finally {
      refreshing = false;
      setBusy(false);
    }
  }
  const refreshAll = () => runUpdate(state.tab === 'stocks' ? 'stocks' : 'full');

  // ---------- TODAY ----------
  function storyScore(s) {
    return (s.sources?.length || 1) * 2 + (IMPACT[s.overall_impact] || 0) * 2 + (imageOf(s) ? 1 : 0);
  }

  function renderToday() {
    const eds = briefing.editions || [];
    const ed = eds[state.edition] || eds[0];
    $('#todayEyebrow').textContent = ed ? `${ed.edition} tech briefing · ${londonDay(ed.generated, { weekday: 'long', day: 'numeric', month: 'long' })}` : londonDay(new Date().toISOString());

    if (!ed) {
      // No briefing written yet: show the biggest stories so far.
      if (!stories.length) { $('#todayBody').innerHTML = empty('☀️', 'Your first briefing is on its way', `Briefings arrive at 7:30 and 17:00 London time. The next one is ${nextUpdateLabel()}.`); return; }
      const top = stories.filter((s) => sectionOf(s) === 'Tech').sort((a, b) => storyScore(b) - storyScore(a)).slice(0, 6);
      $('#todayBody').innerHTML = `<p class="next" style="margin-top:0">Your first full tech briefing arrives ${esc(nextUpdateLabel())}. Here are the biggest tech stories so far.</p>
        ${top.map((s, i) => topCard(s, i + 1, headline(s), s.summary)).join('')}`;
      return;
    }

    const items = ed.top_stories.map((t) => ({ ...t, s: byId.get(t.story_id) }));
    const coverItem = items.find((x) => x.s && imageOf(x.s)) || items[0];
    const coverStory = coverItem?.s;
    const time = londonTime(ed.generated);

    let html = `
      <a class="cover sec-${esc(coverStory ? sectionOf(coverStory) : 'Tech')}" href="#" ${coverStory ? `data-story="${esc(coverStory.id)}"` : ''}>
        ${media(coverStory)}
        <div class="over">
          <span class="edition">${ed.edition === 'Morning' ? '☀︎' : '☾'} ${esc(ed.edition)} tech briefing</span>
          <h2>${esc(ed.title)}</h2>
          <div class="cmeta">${ed.story_count || stories.length} stories reviewed · ${esc(time)}</div>
        </div>
      </a>
      <p class="intro">${esc(ed.intro)}</p>`;

    if (items.length) {
      html += sectionHead('Top stories', `${items.length}`);
      const big = items.slice(0, 2);
      const rest = items.slice(2);
      html += big.map((x, i) => topCard(x.s, i + 1, x.title, x.summary)).join('');
      if (rest.length) {
        html += `<div class="list">${rest.map((x, i) => `
          <a class="t-row" href="#" ${x.s ? `data-story="${esc(x.s.id)}"` : ''}>
            <span class="n">${i + 3}</span>
            <div class="txt">
              ${x.s ? sourceLine(x.s) : ''}
              <h3>${esc(x.title)}</h3>
              <p>${esc(x.summary)}</p>
            </div>
            ${media(x.s)}
          </a>`).join('')}</div>`;
      }
    }

    const rumours = (ed.rumour_watch || []).map((r) => ({ ...r, s: byId.get(r.story_id) })).filter((r) => r.s);
    if (rumours.length) {
      html += sectionHead('Rumour watch');
      html += `<div class="hscroll">${rumours.map(({ s, note }) => {
        const p = s.status === 'confirmed' ? 100 : s.likelihood ?? 50;
        const b = s.status === 'confirmed' ? 'likely' : s.status === 'denied' ? 'unlikely' : band(p);
        return `<a class="rw-card" href="#" data-story="${esc(s.id)}">
          ${media(s, s.status === 'rumour' ? `<span class="badge-odds" style="position:absolute;z-index:2;top:10px;right:10px;padding:5px 10px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-weight:700;font-size:13px">${p}%</span>` : '')}
          <div class="body">
            <div class="odds">
              <div class="top"><span class="c-${b}">${verdict(s)}</span><span class="n">${s.sources.length} outlet${s.sources.length > 1 ? 's' : ''}</span></div>
              <div class="track"><i class="b-${b}" style="width:${p}%"></i></div>
            </div>
            <h3>${esc(s.claim || headline(s))}</h3>
            <p>${esc(note)}</p>
          </div>
        </a>`;
      }).join('')}</div>`;
    }

    const stocks = ed.stocks_to_watch || [];
    if (stocks.length) {
      html += sectionHead('Stocks to watch');
      html += `<div class="stiles">${stocks.map((k) => `
        <button class="stile" data-ticker="${esc(k.ticker)}">
          <div class="top">${logo(k.name, k.ticker)}<span class="arrow-badge ${esc(k.direction)}"><span class="${esc(k.direction)}">${ARROW[k.direction] || '◆'}</span></span></div>
          <div><div class="tkn">${esc(k.ticker)}</div><div class="nm">${esc(k.name)}</div></div>
          <p>${esc(k.note)}</p>
        </button>`).join('')}</div>`;
    }

    const brief = (ed.in_brief || []).map((x) => ({ ...x, s: byId.get(x.story_id) }));
    if (brief.length) {
      html += sectionHead('In brief');
      html += `<div class="list">${brief.map((x) => `
        <a class="brief-row" href="#" ${x.s ? `data-story="${esc(x.s.id)}"` : ''}>
          <span class="b"></span>
          <div class="txt">${esc(x.line)}${x.s ? `<small>${esc(lead(x.s).name)} · ${ago(pubTime(x.s))}</small>` : ''}</div>
          ${x.s ? chevron : ''}
        </a>`).join('')}</div>`;
    }

    if (eds.length > 1) {
      html += sectionHead('Earlier briefings');
      html += `<div class="editions">${eds.map((e, i) => `<button class="chip ${i === state.edition ? 'on' : ''}" data-edition="${i}">${esc(e.edition)} · ${esc(londonDay(e.generated, { weekday: 'short', day: 'numeric' }))}</button>`).join('')}</div>`;
    }
    html += `<p class="next">Next briefing ${esc(nextUpdateLabel())} London time.</p>
      <p class="disclaimer">Written by AI from the day’s headlines. It can make mistakes. Not financial advice.</p>`;
    $('#todayBody').innerHTML = html;
  }

  function topCard(s, n, title, summary) {
    return `<a class="t-card" href="#" ${s ? `data-story="${esc(s.id)}"` : ''}>
      <div style="position:relative">${media(s)}<span class="num">${n}</span></div>
      <div class="body">
        ${s ? `<div class="meta">${sourceLine(s)}<span class="dot">${ago(pubTime(s))}</span>${statusPill(s)}</div>` : ''}
        <h3>${esc(title)}</h3>
        <p>${esc(summary)}</p>
        ${s && (s.stocks || []).length ? `<div class="meta">${tickers(s, 4)}</div>` : ''}
      </div>
    </a>`;
  }

  // ---------- NEWS ----------
  function newsItems() {
    let list = stories.slice();
    if (state.section === 'foryou') {
      if (interests && interests.length) list = list.filter((s) => (s.topics || []).some((t) => interests.includes(t)));
    } else if (state.section !== 'all') {
      list = list.filter((s) => sectionOf(s) === state.section);
    }
    return list.sort((a, b) => pubTime(b).localeCompare(pubTime(a)));
  }

  function heroCard(s) {
    return `<a class="hero" href="#" data-story="${esc(s.id)}">
      ${media(s)}
      <div class="body">
        ${sourceLine(s)}
        <h3>${esc(headline(s))}</h3>
        ${s.summary ? `<p class="take">${esc(s.summary)}</p>` : ''}
        <div class="meta"><span>${ago(pubTime(s))}</span>${statusPill(s)}${tickers(s)}</div>
      </div>
    </a>`;
  }

  function row(s) {
    return `<a class="row" href="#" data-story="${esc(s.id)}">
      <div class="txt">
        ${sourceLine(s)}
        <h3>${esc(headline(s))}</h3>
        <div class="meta"><span>${ago(pubTime(s))}</span>${statusPill(s)}</div>
        ${(s.stocks || []).length ? `<div class="tks">${tickers(s)}</div>` : ''}
      </div>
      ${media(s)}
    </a>`;
  }

  const SECTION_LABEL = { Tech: 'Tech today', Finance: 'Markets today', World: 'World today' };
  function sectionCover(sec, b) {
    const lead = byId.get(b.lead_story_id);
    const pts = (b.points || []).map((p) => ({ ...p, s: byId.get(p.story_id) }));
    return `<section class="sec-cover">
      <a class="sec-hero sec-${esc(sec)}" href="#" ${lead ? `data-story="${esc(lead.id)}"` : ''}>
        ${media(lead)}
        <div class="over">
          <span class="edition">${esc(SECTION_LABEL[sec] || sec)} · ${esc(londonTime(b.generated))}</span>
          <h2>${esc(b.title)}</h2>
        </div>
      </a>
      <div class="sec-body">
        <p class="sec-sum">${esc(b.summary)}</p>
        ${pts.length ? `<div class="sec-points">${pts.map((p) => `
          <a class="sec-point" href="#" ${p.s ? `data-story="${esc(p.s.id)}"` : ''}>
            <span class="b"></span><span class="t">${esc(p.text)}</span>${p.s ? chevron : ''}
          </a>`).join('')}</div>` : ''}
        ${(b.movers || []).length ? `<div class="movers-label">${sec === 'World' ? 'Market impact' : 'Movers to watch'}</div>
          <div class="movers">${b.movers.map((m) => `
            <button class="mover" data-ticker="${esc(m.ticker)}" title="${esc(m.note)}">
              <span class="mt"><span class="${esc(m.direction)}">${ARROW[m.direction] || '◆'}</span> ${esc(m.ticker)}</span>
              <span class="mn">${esc(m.name)}</span>
              <span class="mnote">${esc(m.note)}</span>
            </button>`).join('')}</div>` : ''}
      </div>
    </section>`;
  }

  function renderNews() {
    $('#today').textContent = londonDay(new Date().toISOString());
    $('#updatedNews').textContent = updated ? `Updated ${ago(updated).toLowerCase()} · next ${nextUpdateLabel()}` : 'Waiting for the first update';
    $('#sectionChips').innerHTML = SECTIONS.map(([k, l]) =>
      `<button class="chip ${state.section === k ? 'on' : ''}" data-section="${k}">${l}</button>`).join('');
    const isRumours = state.section === 'rumours';
    $('#rumourBox').hidden = !isRumours;
    $('#newsList').hidden = isRumours;
    if (isRumours) { renderRumours(); return; }

    const all = newsItems();
    if (!stories.length) { $('#newsList').innerHTML = empty('📰', 'No stories yet', `The first update runs ${nextUpdateLabel()}, or tap refresh.`); return; }
    if (!all.length) {
      $('#newsList').innerHTML = empty('🔍', 'Nothing here yet', state.section === 'foryou' ? 'Pick more interests in Settings, or try “All”.' : 'Try another section.');
      return;
    }
    const items = all.slice(0, state.newsLimit);
    const brief = ['Tech', 'Finance', 'World'].includes(state.section) ? (briefing.sections || {})[state.section] : null;
    let html;
    let rest;
    if (brief) {
      html = sectionCover(state.section, brief);
      rest = items;
    } else {
      const topIdx = Math.max(0, items.slice(0, 6).findIndex((s) => imageOf(s)));
      html = heroCard(items[topIdx]);
      rest = items.filter((_, i) => i !== topIdx);
    }
    html += sectionHead('Latest', `${all.length} stories`);
    for (let i = 0; i < rest.length; i += 8) {
      const chunk = rest.slice(i, i + 8);
      if (i > 0 && imageOf(chunk[0])) { html += heroCard(chunk.shift()); }
      if (chunk.length) html += `<div class="list" style="margin-bottom:12px">${chunk.map(row).join('')}</div>`;
    }
    if (all.length > items.length) html += `<button class="more" id="moreBtn">Show more stories</button>`;
    $('#newsList').innerHTML = html;
  }

  // ---------- RUMOURS ----------
  function renderRumours() {
    $$('#rumourSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === state.rumourStatus));
    $('#rumourSort').value = state.rumourSort;
    $('#rumourSortLabel').textContent = $('#rumourSort').selectedOptions[0]?.textContent || 'Latest';

    const list = stories.filter((s) => s.status === state.rumourStatus);
    const sorters = {
      latest: (a, b) => updTime(b).localeCompare(updTime(a)),
      likely: (a, b) => (b.likelihood ?? 0) - (a.likelihood ?? 0),
      unlikely: (a, b) => (a.likelihood ?? 100) - (b.likelihood ?? 100),
      impact: (a, b) => (IMPACT[b.overall_impact] || 0) - (IMPACT[a.overall_impact] || 0) || updTime(b).localeCompare(updTime(a))
    };
    list.sort(sorters[state.rumourSort] || sorters.latest);
    const label = { rumour: 'open rumour', confirmed: 'confirmed', denied: 'denied' }[state.rumourStatus];
    $('#rumourCount').textContent = list.length ? `${list.length} ${label}${state.rumourStatus === 'rumour' && list.length !== 1 ? 's' : ''}` : '';

    if (!list.length) {
      const msg = { rumour: ['📡', 'No open rumours', 'New rumours appear here as soon as they’re reported.'],
        confirmed: ['✅', 'Nothing confirmed yet', 'When a rumour comes true, it moves here.'],
        denied: ['🚫', 'Nothing denied yet', 'When a company denies a rumour, it moves here.'] }[state.rumourStatus];
      $('#rumourList').innerHTML = empty(...msg);
      return;
    }
    $('#rumourList').innerHTML = list.slice(0, 80).map((s) => {
      const p = s.status === 'confirmed' ? 100 : s.likelihood ?? 50;
      const b = s.status === 'confirmed' ? 'likely' : s.status === 'denied' ? 'unlikely' : band(p);
      const n = s.sources?.length || 1;
      const badge = s.status === 'rumour' ? `<span class="badge-odds">${p}% likely</span>` : '';
      return `<a class="rcard" href="#" data-story="${esc(s.id)}">
        ${media(s, badge)}
        <div class="body">
          ${sourceLine(s)}
          <h3>${esc(s.status === 'rumour' ? s.claim || headline(s) : headline(s))}</h3>
          <div class="odds">
            <div class="top"><span class="c-${b}">${verdict(s)}</span><span class="n">${n} outlet${n > 1 ? 's' : ''} · ${ago(updTime(s))}</span></div>
            <div class="track"><i class="b-${b}" style="width:${p}%"></i></div>
          </div>
          ${(s.stocks || []).length ? `<div class="meta">${tickers(s, 5)}</div>` : ''}
        </div>
      </a>`;
    }).join('');
  }

  // ---------- stock aggregation (used by the stock pages) ----------
  function aggregateStocks() {
    const map = new Map();
    for (const s of stories) {
      for (const k of s.stocks || []) {
        const e = map.get(k.ticker) || { ticker: k.ticker, name: k.name, up: 0, down: 0, mixed: 0, score: 0, weight: 0, stories: [], latest: '' };
        e[k.direction] = (e[k.direction] || 0) + 1;
        const w = IMPACT[k.impact] || 1;
        e.score += k.direction === 'up' ? w : k.direction === 'down' ? -w : 0;
        e.weight += w;
        e.stories.push({ s, k });
        if (updTime(s) > e.latest) e.latest = updTime(s);
        if (!e.name || e.name.length < (k.name || '').length) e.name = k.name || e.name;
        map.set(k.ticker, e);
      }
    }
    return map;
  }
  const sentimentOf = (e) => (e.score >= 2 || (e.score > 0 && e.down === 0)) ? 'up' : (e.score <= -2 || (e.score < 0 && e.up === 0)) ? 'down' : 'mixed';
  const sentWord = { up: 'Bullish', down: 'Bearish', mixed: 'Mixed' };

  // ---------- SETTINGS ----------
  function renderSettings() {
    const chosen = new Set(interests || []);
    $('#interestChips').innerHTML = TOPICS.map((t) => `<button class="chip ${chosen.has(t) ? 'on' : ''}" data-interest="${esc(t)}">${esc(t)}</button>`).join('');
    $('#updatedSettings').textContent = updated ? ago(updated) : '—';
    $('#storyCount').textContent = stories.length || '—';
    $('#sourceCount').textContent = sourceCount || '—';
    const standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    $('#installHeader').hidden = $('#installGroup').hidden = !!standalone;
    const token = store.get('rr.ghToken', '');
    const repo = repoInfo();
    $('#repoName').textContent = repo ? `${repo.owner}/${repo.repo}` : 'Works on GitHub Pages only';
    $('#liveStatus').textContent = token ? 'On ✓' : 'Off · add a key below';
    $('#liveStatus').classList.toggle('on', !!token);
    $('#tokenRemove').hidden = !token;
    $('#tokenInput').placeholder = token ? 'Key saved ✓ (paste a new one to replace)' : 'Paste GitHub key (github_pat_…)';
    applyTheme();
  }

  function renderBadge() {
    const seen = store.get('rr.rumoursSeen', null);
    const fresh = seen ? stories.filter((s) => s.status === 'rumour' && (s.first_seen || '') > seen).length : 0;
    const b = $('#rumourBadge');
    if (!b) return;
    b.hidden = !fresh || state.section === 'rumours';
    b.textContent = fresh > 99 ? '99+' : fresh;
  }

  function empty(ico, title, text) {
    return `<div class="empty"><div class="ico">${ico}</div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
  }

  function renderAll() {
    renderToday(); renderNews(); renderRumours(); renderSettings(); renderBadge();
  }

  // ---------- pushed pages ----------
  const pages = [];
  const backIcon = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>';
  const shareIcon = '<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8"/></svg>';

  // Fills (or refills, when swiping between stories) a pushed page.
  function fillPage(page, o, keepInner) {
    page._o = o;
    const bar = $('.page-bar', page);
    bar.classList.toggle('clear', !!o.clearBar && page.scrollTop <= page._threshold());
    bar.classList.remove('show-title');
    $('.ttl', bar).textContent = o.title || '';
    $('.back span', bar).textContent = o.clearBar ? '' : (o.backLabel || '');
    $('[data-share]', bar).hidden = !o.share;
    if (!keepInner) $('.page-inner', page).innerHTML = o.html;
    const rb = $('.read-bar', page);
    rb.hidden = !o.readLink;
    if (o.readLink) { const a = $('a', rb); a.href = o.readLink; a.textContent = o.readLabel; }
  }

  function pushPage(o) {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = `
      <div class="page-bar">
        <button class="back" data-back>${backIcon}<span></span></button>
        <div class="ttl"></div>
        <button class="icon-btn" data-share>${shareIcon}</button>
      </div>
      <div class="page-inner"></div>
      <div class="read-bar"><a class="btn-primary" href="#" target="_blank" rel="noopener"></a></div>`;
    page._threshold = () => (page._o?.clearBar ? Math.min(window.innerHeight * .55, 360) : 60);
    document.body.appendChild(page);
    fillPage(page, o);
    pages.at(-1)?.classList.add('under');
    pages.push(page);
    history.pushState({ page: pages.length }, '');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      page.classList.add('in');
      $('.read-bar', page)?.classList.add('in');
    }));

    const bar = $('.page-bar', page);
    page.addEventListener('scroll', () => {
      const past = page.scrollTop > page._threshold();
      bar.classList.toggle('show-title', past);
      if (page._o.clearBar) {
        bar.classList.toggle('clear', !past);
        $('.back span', bar).textContent = past ? page._o.backLabel : '';
      }
    }, { passive: true });

    page.addEventListener('click', (e) => {
      if (e.target.closest('[data-back]')) { history.back(); return; }
      const st = e.target.closest('[data-step]');
      if (st) { e.preventDefault(); stepStory(page, Number(st.dataset.step)); return; }
      if (e.target.closest('[data-share]') && page._o.share) {
        if (navigator.share) navigator.share(page._o.share).catch(() => {});
        else navigator.clipboard?.writeText(page._o.share.url).then(() => toast('Link copied'));
      }
    });
    enableEdgeSwipe(page);
    return page;
  }

  function popPage() {
    const page = pages.pop();
    if (!page) return;
    page.classList.remove('in');
    $('.read-bar', page)?.classList.remove('in');
    pages.at(-1)?.classList.remove('under');
    setTimeout(() => page.remove(), 380);
  }
  window.addEventListener('popstate', () => { if (pages.length) popPage(); });

  // iOS-style swipe from the left edge to go back
  function enableEdgeSwipe(page) {
    let startX = null, dx = 0;
    page.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (t.clientX < 28) { startX = t.clientX; dx = 0; page.style.transition = 'none'; }
    }, { passive: true });
    page.addEventListener('touchmove', (e) => {
      if (startX === null) return;
      dx = Math.max(0, e.touches[0].clientX - startX);
      page.style.transform = `translateX(${dx}px)`;
    }, { passive: true });
    page.addEventListener('touchend', () => {
      if (startX === null) return;
      page.style.transition = ''; page.style.transform = '';
      if (dx > window.innerWidth * .3) history.back();
      startX = null;
    });
  }

  // Swipe left / right on a story to move to the next / previous one in the list it came from.
  // The current story follows your finger and the neighbouring one slides in beside it.
  const EASE = 'cubic-bezier(.25,.9,.3,1)';
  function neighbour(page, dir) {
    const j = page._seq.indexOf(page._sid) + dir;
    return j >= 0 && j < page._seq.length && byId.get(page._seq[j]) ? page._seq[j] : null;
  }
  function makePeek(page, sid) {
    const peek = document.createElement('div');
    peek.className = 'page-inner peek';
    peek.innerHTML = storyPage(byId.get(sid), page._o.backLabel, page._seq).html;
    // load its pictures straight away (they'd otherwise wait until fully on screen)
    peek.querySelectorAll('img').forEach((im) => { im.loading = 'eager'; });
    const barH = $('.page-bar', page).offsetHeight;
    peek.style.cssText = `position:absolute;left:0;width:100%;top:${page.scrollTop}px;height:${page.clientHeight}px;overflow:hidden;padding-top:${barH}px;box-sizing:border-box;background:var(--bg);`;
    $('.page-inner', page).after(peek);
    return peek;
  }
  function setX(el, x, anim) {
    el.style.transition = anim ? `transform ${anim}ms ${EASE}` : 'none';
    el.style.transform = x ? `translate3d(${x}px,0,0)` : '';
  }
  // At the end of a swipe the story that slid in simply stays (nothing is redrawn, so no flicker).
  function finishStep(page, sid, peek) {
    const main = $('.page-inner', page);
    page._sid = sid;
    const o = storyPage(byId.get(sid), page._o.backLabel, page._seq);
    if (peek) {
      main.remove();
      peek.classList.remove('peek');
      peek.removeAttribute('style');
      page.scrollTop = 0;
      fillPage(page, o, true);
    } else {
      fillPage(page, o);
      page.scrollTop = 0;
      setX(main, 0);
    }
    page._busy = false;
    preloadNeighbours(page);
  }
  // Fetch the next and previous stories' pictures in advance.
  function preloadNeighbours(page) {
    [-1, 1].forEach((d) => {
      const sid = neighbour(page, d);
      const u = sid && imageOf(byId.get(sid));
      if (u) { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = u; }
    });
  }

  function enableStorySwipe(page) {
    let x0 = null, y0 = 0, dx = 0, mode = null, peek = null, peekDir = 0, t0 = 0;
    const W = () => page.clientWidth;
    page.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (page._busy || t.clientX < 28 || e.touches.length > 1) { x0 = null; return; } // left edge = back
      x0 = t.clientX; y0 = t.clientY; dx = 0; mode = null; t0 = Date.now();
    }, { passive: true });
    page.addEventListener('touchmove', (e) => {
      if (x0 === null) return;
      const t = e.touches[0];
      dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if (!mode && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (mode !== 'h') return;
      e.preventDefault(); // stop the page scrolling up/down while swiping sideways
      const dir = dx < 0 ? 1 : -1;
      const sid = neighbour(page, dir);
      if (dir !== peekDir) { peek?.remove(); peek = sid ? makePeek(page, sid) : null; peekDir = dir; }
      const main = $('.page-inner', page);
      if (!peek) { setX(main, dx * 0.25); return; } // nothing there: gentle rubber band
      setX(main, dx);
      setX(peek, dx + dir * W());
    }, { passive: false });
    page.addEventListener('touchend', () => {
      if (x0 === null) return;
      x0 = null;
      const main = $('.page-inner', page);
      if (mode !== 'h') return;
      const fast = Math.abs(dx) > 40 && Date.now() - t0 < 250;
      const dir = peekDir;
      if (peek && (Math.abs(dx) > W() * 0.25 || fast)) {
        const p = peek, sid = page._seq[page._seq.indexOf(page._sid) + dir];
        page._busy = true;
        setX(main, -dir * W(), 300);
        setX(p, 0.0001, 300);
        setTimeout(() => finishStep(page, sid, p), 310);
      } else {
        setX(main, 0, 250);
        if (peek) { const p = peek; setX(p, dir * W(), 250); setTimeout(() => p.remove(), 260); }
        if (!peek && Math.abs(dx) > 70) toast(dir > 0 ? 'That’s the last story in this list' : 'That’s the first story in this list', 1600);
      }
      peek = null; peekDir = 0; mode = null;
    });
  }

  // Used by the "Up next" card: the same slide, without a finger.
  function stepStory(page, delta) {
    if (page._busy) return;
    const sid = neighbour(page, delta);
    if (!sid) { toast(delta > 0 ? 'That’s the last story in this list' : 'That’s the first story in this list', 1600); return; }
    page._busy = true;
    const main = $('.page-inner', page);
    const peek = makePeek(page, sid);
    setX(peek, delta * page.clientWidth);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setX(main, -delta * page.clientWidth, 340);
      setX(peek, 0.0001, 340);
      setTimeout(() => finishStep(page, sid, peek), 350);
    }));
  }

  function impactDots(level) {
    const n = IMPACT[level] || 1;
    return `<span class="impact-dots">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  function openStory(id, backLabel, seq) {
    const s = byId.get(id);
    if (!s) return;
    const list = (seq && seq.includes(id)) ? seq : [id];
    const page = pushPage(storyPage(s, backLabel, list));
    page._seq = list;
    page._sid = id;
    enableStorySwipe(page);
    preloadNeighbours(page);
  }

  function storyPage(s, backLabel, seq) {
    const l = lead(s);
    const n = s.sources?.length || 1;
    const hasImg = !!imageOf(s);

    const summaryCard = `<section class="card">
        <div class="card-title"><h2><span class="sparkle">✦</span> AI summary</h2></div>
        <p>${esc(s.summary || s.claim)}</p>
        ${(s.key_points || []).length ? `<ul class="kp">${s.key_points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      </section>`;

    const paras = String(s.story || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const fullStory = paras.length ? `<section class="prose-wrap">
        <div class="kicker">📖 The full story</div>
        <div class="prose">${paras.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        <p class="prose-note">Written by AI in its own words from ${n} source${n > 1 ? 's' : ''}. For the publisher’s original article, tap the button below.</p>
      </section>` : '';

    let odds = '';
    if (s.status !== 'news' && s.likelihood != null) {
      const p = s.status === 'confirmed' ? 100 : s.likelihood;
      const b = s.status === 'confirmed' ? 'likely' : s.status === 'denied' ? 'unlikely' : band(p);
      const r = 36, c = 2 * Math.PI * r;
      odds = `<section class="card">
        <div class="card-title"><h2>📡 Rumour check</h2>${statusPill(s)}</div>
        <div class="odds-big">
          <div class="gauge c-${b}"><svg viewBox="0 0 84 84"><circle class="bg" cx="42" cy="42" r="${r}" fill="none" stroke-width="9"/><circle class="fg" cx="42" cy="42" r="${r}" fill="none" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(p / 100) * c} ${c}"/></svg><b>${s.status === 'confirmed' ? '✓' : s.status === 'denied' ? '✕' : p + '%'}</b></div>
          <div><div class="verdict c-${b}">${verdict(s)}</div><div class="verdict-sub">${n} outlet${n > 1 ? 's' : ''} reporting · first seen ${ago(s.first_seen).toLowerCase()}</div></div>
        </div>
        ${s.likelihood_reason ? `<p>${esc(s.likelihood_reason)}</p>` : ''}
        ${(s.signals || []).length ? `<div class="signals">${s.signals.map((x) => `<span class="signal">${esc(x)}</span>`).join('')}</div>` : ''}
      </section>`;
    }

    const stocks = (s.stocks || []).length ? `<section class="card">
        <div class="card-title"><h2>📈 Market impact</h2>${s.overall_impact && s.overall_impact !== 'none' ? `<span class="tag">${esc(s.overall_impact)} impact</span>` : ''}</div>
        ${s.market_take ? `<p class="take">${esc(s.market_take)}</p>` : ''}
        <div>${s.stocks.map((k) => `
          <button class="mrow" data-ticker="${esc(k.ticker)}">
            ${logo(k.name, k.ticker)}
            <div class="mid"><div class="nm">${esc(k.name)}<code>${esc(k.ticker)}</code></div><div class="why">${esc(k.reason)}</div></div>
            <div class="right"><span class="sent ${esc(k.direction)}">${ARROW[k.direction] || '◆'} ${k.direction === 'up' ? 'Up' : k.direction === 'down' ? 'Down' : 'Mixed'}</span><span class="${esc(k.direction)}">${impactDots(k.impact)}</span></div>
          </button>`).join('')}</div>
      </section>` : (s.market_take ? `<section class="card"><div class="card-title"><h2>📈 Market impact</h2></div><p>${esc(s.market_take)}</p></section>` : '');

    const sources = `<section class="card sources">
        <div class="card-title"><h2>📰 Coverage · ${n} source${n > 1 ? 's' : ''}</h2></div>
        ${(s.sources || []).map((x) => `
          <a href="${esc(safeUrl(x.link) || '#')}" target="_blank" rel="noopener">
            <div class="mid">
              <div class="src">${favicon(x.link) ? `<img class="fav" src="${esc(favicon(x.link))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<span class="nm">${esc(x.name)}</span><span style="color:var(--label-2);font-weight:400">· ${ago(x.published)}</span></div>
              <div class="t">${esc(x.title)}</div>
            </div>${chevron}
          </a>`).join('')}
      </section>`;

    const html = `
      ${hasImg ? `<div class="story-hero">${media(s)}${s.image_credit ? `<span class="credit">Image: ${esc(s.image_credit)}</span>` : ''}</div>` : ''}
      <div class="story-head" ${hasImg ? '' : 'style="padding-top:12px"'}>
        <div class="meta">${sourceLine(s)}<span class="dot">${ago(pubTime(s))}</span></div>
        <h1>${esc(headline(s))}</h1>
        <div class="tags">${statusPill(s)}<span class="tag">${esc(sectionOf(s))}</span>${(s.topics || []).filter((t) => t !== 'Other').map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>
      ${summaryCard}${fullStory}${odds}${stocks}${sources}
      ${upNext(s, seq)}
      <p class="disclaimer">Summary, write-up, odds and market effects are AI-generated and can be wrong. Not financial advice.</p>`;

    return {
      title: l.name || 'Story', backLabel, html, clearBar: hasImg,
      readLink: safeUrl(l.link), readLabel: `Read the original on ${l.name || 'the website'}`,
      share: safeUrl(l.link) ? { title: headline(s), url: l.link } : null
    };
  }

  function upNext(s, seq) {
    const i = (seq || []).indexOf(s.id);
    if (i < 0 || seq.length < 2) return '';
    const next = byId.get(seq[i + 1]);
    const hint = `<p class="swipe-hint">Story ${i + 1} of ${seq.length} · swipe left or right for the next or previous story</p>`;
    if (!next) return hint;
    return `${hint}<a class="next-card" href="#" data-step="1">
      <div class="txt"><span class="lbl">Up next</span><span class="h">${esc(headline(next))}</span><span class="s">${esc(lead(next).name)} · ${ago(pubTime(next))}</span></div>
      ${media(next)}
    </a>`;
  }

  function openTicker(ticker, backLabel) {
    const e = aggregateStocks().get(ticker);
    if (!e) { window.open(`https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`, '_blank', 'noopener'); return; }
    const sent = sentimentOf(e);
    const total = e.up + e.down + e.mixed || 1;
    const rows = e.stories
      .sort((a, b) => updTime(b.s).localeCompare(updTime(a.s)))
      .map(({ s, k }) => `<a class="row" href="#" data-story="${esc(s.id)}">
        <div class="txt">
          ${sourceLine(s)}
          <h3>${esc(headline(s))}</h3>
          <div class="meta"><span class="${esc(k.direction)}" style="font-weight:700">${ARROW[k.direction]} ${k.direction === 'up' ? 'Up' : k.direction === 'down' ? 'Down' : 'Mixed'}</span><span class="${esc(k.direction)}">${impactDots(k.impact)}</span>${statusPill(s)}</div>
          <div style="font-size:14px;color:var(--label-2)">${esc(k.reason)}</div>
        </div>
        ${media(s)}
      </a>`).join('');
    const html = `
      <div class="stock-head">
        ${logo(e.name, e.ticker)}
        <div><h1>${esc(e.ticker)}</h1><div class="sub">${esc(e.name)}</div></div>
      </div>
      <section class="card">
        <div class="card-title"><h2>News sentiment</h2><span class="sent ${sent}">${ARROW[sent]} ${sentWord[sent]}</span></div>
        <div class="split"><i style="width:${(e.up / total) * 100}%;background:var(--green)"></i><i style="width:${(e.mixed / total) * 100}%;background:var(--orange)"></i><i style="width:${(e.down / total) * 100}%;background:var(--red)"></i></div>
        <div class="legend"><span><b class="up">${e.up}</b> positive</span><span><b class="mixed">${e.mixed}</b> mixed</span><span><b class="down">${e.down}</b> negative</span></div>
        <a class="btn-secondary" href="https://finance.yahoo.com/quote/${encodeURIComponent(e.ticker)}" target="_blank" rel="noopener">View price on Yahoo Finance</a>
      </section>
      ${sectionHead('Stories', String(e.stories.length))}
      <div class="list">${rows}</div>
      <p class="disclaimer">AI-estimated effects, not financial advice.</p>`;
    pushPage({ title: e.ticker, backLabel, html });
  }

  // ---------- tabs & scrolling ----------
  function switchTab(tab) {
    if (tab === state.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    scrollMemory[state.tab] = window.scrollY;
    state.tab = tab;
    $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === tab));
    $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('#navbarTitle').textContent = $(`.view[data-view="${tab}"]`).dataset.title;
    window.scrollTo(0, scrollMemory[tab] || 0);
    window.RR?.onTab?.(tab);
    renderBadge();
    onScroll();
  }

  function onScroll() { $('#navbar').classList.toggle('scrolled', window.scrollY > 40); }
  window.addEventListener('scroll', onScroll, { passive: true });

  // pull down to refresh (same as the refresh button)
  (() => {
    const ptr = $('#ptr');
    let startY = null, dy = 0;
    window.addEventListener('touchstart', (e) => {
      if (pages.length || refreshing || window.scrollY > 0 || $('#welcome').open) return;
      startY = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (startY === null) return;
      dy = e.touches[0].clientY - startY;
      if (dy <= 0) { ptr.classList.remove('show'); return; }
      ptr.classList.add('show');
      ptr.style.transform = `translate(-50%, ${Math.min(dy * .5, 70) - 60}px) rotate(${dy * 2}deg)`;
    }, { passive: true });
    window.addEventListener('touchend', () => {
      if (startY === null) return;
      startY = null;
      ptr.classList.remove('show');
      ptr.style.transform = '';
      if (dy > 110) refreshAll();
    });
  })();

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const story = e.target.closest('[data-story]');
    if (story) {
      e.preventDefault();
      const label = pages.length ? 'Back' : $(`.view[data-view="${state.tab}"]`).dataset.title;
      const scope = story.closest('.page-inner') || $(`.view[data-view="${state.tab}"]`);
      const seq = [...new Set($$('[data-story]', scope).map((x) => x.dataset.story))].filter((x) => byId.has(x));
      openStory(story.dataset.story, label.length > 10 ? 'Back' : label, seq);
      return;
    }
    const tk = e.target.closest('[data-ticker]');
    if (tk) {
      const label = pages.length ? 'Back' : $(`.view[data-view="${state.tab}"]`).dataset.title;
      if (window.RR?.openStock) window.RR.openStock(tk.dataset.ticker, label.length > 10 ? 'Back' : label);
      else openTicker(tk.dataset.ticker, label.length > 10 ? 'Back' : label);
      return;
    }
    const edBtn = e.target.closest('[data-edition]');
    if (edBtn) { state.edition = Number(edBtn.dataset.edition); renderToday(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  $('#tabbar').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) switchTab(b.dataset.tab); });
  $('#refreshBtn').addEventListener('click', refreshAll);
  $('#sectionChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-section]'); if (!b) return;
    state.section = b.dataset.section; state.newsLimit = PAGE_SIZE; store.set('rr.section', state.section);
    if (state.section === 'rumours') { store.set('rr.rumoursSeen', new Date().toISOString()); renderBadge(); }
    renderNews();
  });
  $('#newsList').addEventListener('click', (e) => {
    if (e.target.closest('#moreBtn')) { state.newsLimit += PAGE_SIZE; renderNews(); }
  });
  $('#rumourSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { state.rumourStatus = b.dataset.v; renderRumours(); } });
  $('#rumourSort').addEventListener('change', (e) => { state.rumourSort = e.target.value; store.set('rr.rumourSort', state.rumourSort); renderRumours(); });
  $('#themeSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { store.set('rr.theme', b.dataset.v); applyTheme(); } });

  function toggleInterest(t, chipEl) {
    const set = new Set(interests || []);
    set.has(t) ? set.delete(t) : set.add(t);
    interests = TOPICS.filter((x) => set.has(x));
    store.set('rr.interests', interests);
    chipEl.classList.toggle('on', set.has(t));
  }
  $('#interestChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-interest]'); if (!b) return;
    toggleInterest(b.dataset.interest, b); renderNews();
  });

  $('#tokenSave').addEventListener('click', async () => {
    const v = $('#tokenInput').value.trim();
    if (!v) { toast('Paste your GitHub key into the box first.'); return; }
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(v)) { toast('That doesn’t look like a GitHub key. It should start with github_pat_'); return; }
    const repo = repoInfo();
    if (repo) {
      try { await findWorkflow(github(v, repo)); } catch (err) { toast(err.message, 5500); return; }
    }
    store.set('rr.ghToken', v);
    $('#tokenInput').value = '';
    renderSettings();
    toast('Key saved ✓ The refresh button now fetches brand-new news.');
  });
  $('#tokenRemove').addEventListener('click', () => { store.del('rr.ghToken'); renderSettings(); toast('Key removed'); });

  $('#clearCacheBtn').addEventListener('click', async () => {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* ignore */ }
    location.reload();
  });

  // welcome sheet
  function showWelcome() {
    const chosen = new Set(interests || []);
    $('#welcomeChips').innerHTML = TOPICS.map((t) => `<button class="chip ${chosen.has(t) ? 'on' : ''}" data-interest="${esc(t)}">${esc(t)}</button>`).join('');
    $('#welcome').showModal();
  }
  $('#welcomeChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-interest]'); if (b) toggleInterest(b.dataset.interest, b);
  });
  $('#welcomeDone').addEventListener('click', () => $('#welcome').close());
  $('#welcome').addEventListener('close', () => {
    if (interests === null) { interests = []; store.set('rr.interests', interests); }
    renderAll();
  });

  // Quietly reload the latest data when you come back to the app.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !refreshing) load(); });
  setInterval(() => { if (!document.hidden && !refreshing) load(); }, 5 * 60 * 1000);

  // ---------- shared with stocks.js ----------
  window.RR = Object.assign(window.RR || {}, {
    $, $$, esc, store, toast, ago, chevron, empty, sectionHead, row, media, sourceLine, statusPill, logo, headline, pubTime, lead,
    pushPage, openStory, runUpdate, hasLiveKey: () => !!store.get('rr.ghToken', '') && !!repoInfo(),
    stories: () => stories, byId: (id) => byId.get(id), isRefreshing: () => refreshing,
    backLabel: () => { const l = pages.length ? 'Back' : $(`.view[data-view="${state.tab}"]`).dataset.title; return l.length > 10 ? 'Back' : l; }
  });

  // ---------- start ----------
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // When a new version of the app is published, reload once to show it.
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !refreshing) location.reload(); });
  }
  if (store.get('rr.rumoursSeen', null) === null) store.set('rr.rumoursSeen', new Date().toISOString());
  applyTheme();
  renderAll();
  load();
  if (interests === null) setTimeout(showWelcome, 400);
})();
