// Rumour Radar — Stocks tab.
// Top 20 US-listed companies by market value + your own stocks, each with price,
// chart, key stats, an AI summary and the stories that mention it.
(() => {
  'use strict';
  const RR = window.RR;
  if (!RR) return;
  const { $, $$, esc, store, toast } = RR;

  // Popular stocks for the search box (any other Yahoo Finance ticker can be typed in).
  const CATALOG = [
    ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['GOOGL', 'Alphabet (Google)'], ['AMZN', 'Amazon'], ['META', 'Meta Platforms'],
    ['TSLA', 'Tesla'], ['AVGO', 'Broadcom'], ['TSM', 'TSMC'], ['BRK-B', 'Berkshire Hathaway'], ['LLY', 'Eli Lilly'], ['JPM', 'JPMorgan Chase'],
    ['V', 'Visa'], ['MA', 'Mastercard'], ['WMT', 'Walmart'], ['ORCL', 'Oracle'], ['XOM', 'Exxon Mobil'], ['NFLX', 'Netflix'], ['COST', 'Costco'],
    ['JNJ', 'Johnson & Johnson'], ['PLTR', 'Palantir'], ['AMD', 'AMD'], ['HD', 'Home Depot'], ['PG', 'Procter & Gamble'], ['ABBV', 'AbbVie'],
    ['BAC', 'Bank of America'], ['UNH', 'UnitedHealth'], ['KO', 'Coca-Cola'], ['PEP', 'PepsiCo'], ['CRM', 'Salesforce'], ['ADBE', 'Adobe'],
    ['INTC', 'Intel'], ['QCOM', 'Qualcomm'], ['TXN', 'Texas Instruments'], ['MU', 'Micron'], ['AMAT', 'Applied Materials'], ['LRCX', 'Lam Research'],
    ['ARM', 'Arm Holdings'], ['SMCI', 'Super Micro Computer'], ['DELL', 'Dell'], ['IBM', 'IBM'], ['CSCO', 'Cisco'], ['NOW', 'ServiceNow'],
    ['INTU', 'Intuit'], ['SNOW', 'Snowflake'], ['CRWD', 'CrowdStrike'], ['PANW', 'Palo Alto Networks'], ['NET', 'Cloudflare'], ['DDOG', 'Datadog'],
    ['SHOP', 'Shopify'], ['SPOT', 'Spotify'], ['UBER', 'Uber'], ['ABNB', 'Airbnb'], ['DASH', 'DoorDash'], ['PYPL', 'PayPal'], ['XYZ', 'Block'],
    ['COIN', 'Coinbase'], ['HOOD', 'Robinhood'], ['RBLX', 'Roblox'], ['DIS', 'Disney'], ['MCD', 'McDonald’s'], ['NKE', 'Nike'], ['SBUX', 'Starbucks'],
    ['BA', 'Boeing'], ['LMT', 'Lockheed Martin'], ['RTX', 'RTX'], ['CAT', 'Caterpillar'], ['GE', 'GE Aerospace'], ['F', 'Ford'], ['GM', 'General Motors'],
    ['RIVN', 'Rivian'], ['LCID', 'Lucid'], ['T', 'AT&T'], ['VZ', 'Verizon'], ['TMUS', 'T-Mobile US'], ['PFE', 'Pfizer'], ['MRK', 'Merck'],
    ['MRNA', 'Moderna'], ['CVX', 'Chevron'], ['GS', 'Goldman Sachs'], ['MS', 'Morgan Stanley'], ['WFC', 'Wells Fargo'], ['C', 'Citigroup'],
    ['BABA', 'Alibaba'], ['PDD', 'PDD Holdings (Temu)'], ['JD', 'JD.com'], ['NIO', 'NIO'], ['TM', 'Toyota'], ['SONY', 'Sony'], ['ASML', 'ASML'],
    ['SAP', 'SAP'], ['NVO', 'Novo Nordisk'], ['AZN', 'AstraZeneca'], ['SHEL', 'Shell'], ['BP', 'BP'], ['HSBC', 'HSBC'], ['GSK', 'GSK'], ['RIO', 'Rio Tinto'],
    ['UL', 'Unilever'], ['BARC.L', 'Barclays (London)'], ['LLOY.L', 'Lloyds Banking Group (London)'], ['NWG.L', 'NatWest (London)'],
    ['RR.L', 'Rolls-Royce (London)'], ['VOD.L', 'Vodafone (London)'], ['BT-A.L', 'BT Group (London)'], ['TSCO.L', 'Tesco (London)'],
    ['BA.L', 'BAE Systems (London)'], ['IAG.L', 'IAG – British Airways (London)'], ['BATS.L', 'British American Tobacco (London)'],
    ['ULVR.L', 'Unilever (London)'], ['AZN.L', 'AstraZeneca (London)'], ['SHEL.L', 'Shell (London)'], ['BP.L', 'BP (London)'], ['HSBA.L', 'HSBC (London)'],
    ['LSEG.L', 'London Stock Exchange Group'], ['AUTO.L', 'Auto Trader (London)'], ['OCDO.L', 'Ocado (London)'], ['JD.L', 'JD Sports (London)'],
    ['MKS.L', 'Marks & Spencer (London)'], ['SBRY.L', 'Sainsbury’s (London)'], ['MC.PA', 'LVMH (Paris)'], ['AIR.PA', 'Airbus (Paris)'],
    ['OR.PA', 'L’Oréal (Paris)'], ['NESN.SW', 'Nestlé (Zurich)'], ['SIE.DE', 'Siemens (Frankfurt)'], ['7203.T', 'Toyota (Tokyo)'], ['6758.T', 'Sony (Tokyo)'],
    ['005930.KS', 'Samsung Electronics (Seoul)'], ['0700.HK', 'Tencent (Hong Kong)'], ['9988.HK', 'Alibaba (Hong Kong)'], ['1211.HK', 'BYD (Hong Kong)'],
    ['^GSPC', 'S&P 500 index'], ['^IXIC', 'Nasdaq Composite index'], ['^DJI', 'Dow Jones index'], ['^FTSE', 'FTSE 100 index'], ['^FTMC', 'FTSE 250 index'],
    ['SPY', 'SPDR S&P 500 ETF'], ['QQQ', 'Invesco QQQ (Nasdaq 100) ETF'], ['VUSA.L', 'Vanguard S&P 500 ETF (London)'],
    ['BTC-USD', 'Bitcoin'], ['ETH-USD', 'Ethereum'], ['GC=F', 'Gold'], ['CL=F', 'Crude oil'], ['GBPUSD=X', 'Pound / Dollar'], ['EURUSD=X', 'Euro / Dollar']
  ];
  const catalogName = (sym) => (CATALOG.find((c) => c[0] === sym) || [])[1] || '';
  const validSymbol = (s) => /^[A-Z0-9^][A-Z0-9.\-=^]{0,14}$/.test(s);

  // ---------- state ----------
  let data = null;                       // data/stocks.json
  let watch = store.get('rr.watch', []);  // your stocks (kept on this phone)
  let editing = false;
  let chgMode = store.get('rr.chgMode', 'pct'); // pct | abs | cap
  let liveOK = null;                      // can this phone reach Yahoo directly? (null = not tried)
  let liveAt = 0;

  const saveWatch = () => store.set('rr.watch', watch);
  RR.watchlist = () => watch.slice();

  // ---------- formatting ----------
  const SYM = { USD: '$', GBP: '£', EUR: '€', JPY: '¥', CNY: '¥', HKD: 'HK$', CHF: 'CHF ', KRW: '₩', CAD: 'C$', AUD: 'A$', INR: '₹' };
  function money(n, cur, plain) {
    if (n == null || !isFinite(n)) return '—';
    const d = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 1 ? 2 : 4;
    const num = Number(n).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
    if (cur === 'GBp' || cur === 'GBX') return `${num}p`;
    if (plain) return num;
    return SYM[cur] ? `${SYM[cur]}${num}` : `${num} ${cur || ''}`.trim();
  }
  function big(n, cur) {
    if (n == null || !isFinite(n)) return '—';
    const a = Math.abs(n);
    const [v, u] = a >= 1e12 ? [n / 1e12, 'T'] : a >= 1e9 ? [n / 1e9, 'B'] : a >= 1e6 ? [n / 1e6, 'M'] : a >= 1e3 ? [n / 1e3, 'K'] : [n, ''];
    const s = `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)}${u}`;
    return cur ? `${SYM[cur] || ''}${s}` : s;
  }
  const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');
  const pctStr = (n) => (n == null ? '—' : `${sign(n)}${Math.abs(n).toFixed(2)}%`);
  const dirOf = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
  const timeLondon = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const stateLabel = (s) => ({ REGULAR: 'Market open', PRE: 'Pre-market', PREPRE: 'Pre-market', POST: 'After hours', POSTPOST: 'After hours' }[s] || 'Market closed');

  // ---------- data ----------
  async function loadData() {
    try {
      const r = await fetch('data/stocks.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) data = await r.json();
    } catch { /* keep what we have */ }
    render();
  }
  const quote = (sym) => data?.quotes?.[sym] || null;
  const chartOf = (sym) => data?.charts?.[sym] || {};

  // The phone tries to fetch live prices straight from Yahoo; if that's blocked it quietly uses the last update.
  async function tryLive() {
    if (liveOK === false || !data || Date.now() - liveAt < 60e3 || document.hidden) return;
    liveAt = Date.now();
    const syms = [...new Set([...watch, ...(data.top || [])])].slice(0, 30);
    const one = async (sym) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=5m&includePrePost=false`, { signal: ctrl.signal });
        if (!r.ok) return false;
        const j = await r.json();
        const res = j?.chart?.result?.[0];
        if (!res) return false;
        const m = res.meta || {};
        const q = data.quotes[sym] || (data.quotes[sym] = { symbol: sym, name: m.longName || m.shortName || catalogName(sym) || sym, currency: m.currency });
        const prev = q.prevClose ?? m.chartPreviousClose;
        q.price = m.regularMarketPrice ?? q.price;
        if (prev) { q.change = q.price - prev; q.changePct = (q.change / prev) * 100; }
        q.high = m.regularMarketDayHigh ?? q.high; q.low = m.regularMarketDayLow ?? q.low; q.volume = m.regularMarketVolume ?? q.volume;
        const p = m.currentTradingPeriod?.regular;
        q.marketState = p && Date.now() / 1000 >= p.start && Date.now() / 1000 < p.end ? 'REGULAR' : 'CLOSED';
        const c = res.indicators?.quote?.[0]?.close || [];
        const pts = { t: [], c: [] };
        (res.timestamp || []).forEach((ts, i) => { if (typeof c[i] === 'number') { pts.t.push(ts); pts.c.push(c[i]); } });
        (data.charts[sym] || (data.charts[sym] = {})).d1 = pts;
        return true;
      } catch { return false; } finally { clearTimeout(t); }
    };
    const first = await one(syms[0]);
    if (!first) { liveOK = false; return; }
    liveOK = true;
    await Promise.all(syms.slice(1).map(one));
    data.liveAt = new Date().toISOString();
    render();
  }

  // ---------- small chart for rows ----------
  function spark(sym) {
    const q = quote(sym);
    const d = chartOf(sym).d1;
    if (!d || d.c.length < 2) return '<svg class="spark" viewBox="0 0 64 30"></svg>';
    const base = q?.prevClose ?? d.c[0];
    const vals = d.c;
    const min = Math.min(...vals, base), max = Math.max(...vals, base);
    const span = max - min || 1;
    const y = (v) => 27 - ((v - min) / span) * 24;
    const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * 64).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const up = vals[vals.length - 1] >= base;
    return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 64 30" preserveAspectRatio="none">
      <line x1="0" x2="64" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}" class="base"/>
      <polyline points="${pts}"/></svg>`;
  }

  function chgText(q) {
    if (!q) return '—';
    if (chgMode === 'abs') return q.change == null ? '—' : `${sign(q.change)}${money(Math.abs(q.change), q.currency, true)}`;
    if (chgMode === 'cap') return q.marketCap ? big(q.marketCap) : pctStr(q.changePct);
    return pctStr(q.changePct);
  }

  function rowHTML(sym, rank) {
    const q = quote(sym);
    const name = q?.shortName || q?.name || catalogName(sym) || '';
    const missing = !q || q.price == null;
    const bad = data?.invalid?.includes(sym);
    return `<div class="stk-row${editing && rank == null ? ' editing' : ''}" data-stock="${esc(sym)}">
      ${editing && rank == null ? `<button class="stk-del" data-del="${esc(sym)}" aria-label="Remove ${esc(sym)}"><i></i></button>` : ''}
      ${rank != null ? `<span class="stk-rank">${rank}</span>` : ''}
      <div class="stk-id"><b>${esc(sym)}</b><span>${esc(bad ? 'Ticker not found' : missing ? (RR.hasLiveKey() ? 'Fetching price…' : 'Price arrives with next update') : name)}</span></div>
      ${missing ? '<span class="spark"></span>' : spark(sym)}
      <div class="stk-px">
        <span class="p">${missing ? '' : money(q.price, q.currency, true)}</span>
        ${missing ? '<span class="chg flat">—</span>' : `<button class="chg ${dirOf(q.changePct)}" data-chg>${esc(chgText(q))}</button>`}
      </div>
    </div>`;
  }

  // ---------- Stocks tab ----------
  function render() {
    const list = $('#stockList');
    if (!list) return;
    $('#stkEdit').textContent = editing ? 'Done' : 'Edit';
    $('#stkEdit').hidden = !watch.length && !editing;
    if (!data || !data.top) {
      $('#stkAsOf').textContent = 'Waiting for the first update';
      list.innerHTML = RR.empty('📈', 'Stock prices are on their way', RR.hasLiveKey()
        ? 'Tap refresh at the top to fetch them now (about a minute).'
        : 'They arrive with the next update at 7:30 or 17:00. Turn on Live refresh in Settings to fetch them any time.');
      return;
    }
    const lead = quote(data.top[0]);
    const when = data.liveAt && liveOK ? `Live · ${timeLondon(data.liveAt)}` : `Prices as of ${timeLondon(data.pricesUpdated || data.updated)}`;
    $('#stkAsOf').textContent = `${when} · ${stateLabel(lead?.marketState)}`;
    let html = '';
    if (watch.length) {
      html += RR.sectionHead('My stocks', `${watch.length}`);
      html += `<div class="list stk-list">${watch.map((s) => rowHTML(s, null)).join('')}</div>`;
    } else {
      html += `<button class="stk-empty-add" data-open-add><span class="plus">+</span><span><b>Add your own stocks</b><small>Search any company, index or currency</small></span></button>`;
    }
    html += RR.sectionHead('Top 20 by market value', 'US-listed');
    html += `<div class="list stk-list">${data.top.map((s, i) => rowHTML(s, i + 1)).join('')}</div>`;
    html += '<p class="disclaimer">Tap a price change to switch between %, value and market value. Prices from Yahoo Finance, which may be delayed. Not financial advice.</p>';
    list.innerHTML = html;
  }

  // ---------- big chart on the stock page ----------
  let gid = 0;
  function drawChart(box, sym, range) {
    const q = quote(sym);
    const d = chartOf(sym)[range];
    const lbl = box.querySelector('.sd-range-lbl');
    const area = box.querySelector('.sd-chart');
    if (!d || d.c.length < 2) { area.innerHTML = '<div class="sd-nochart">No chart data yet</div>'; lbl.textContent = ''; return; }
    const W = 340, H = 170, P = 6;
    const base = range === 'd1' ? (q?.prevClose ?? d.c[0]) : d.c[0];
    const vals = d.c;
    const min = Math.min(...vals, range === 'd1' ? base : Infinity), max = Math.max(...vals, range === 'd1' ? base : -Infinity);
    const span = max - min || 1;
    const x = (i) => (i / (vals.length - 1)) * W;
    const y = (v) => P + (1 - (v - min) / span) * (H - 2 * P);
    const last = vals[vals.length - 1];
    const up = last >= base;
    const id = `g${++gid}`;
    const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
    area.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="${up ? 'up' : 'down'}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></linearGradient></defs>
      ${range === 'd1' ? `<line x1="0" x2="${W}" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}" class="base"/>` : ''}
      <path d="${line}L${W} ${H}L0 ${H}z" fill="url(#${id})" class="area"/>
      <path d="${line}" class="ln"/>
      <line class="cursor" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/>
      <circle class="dot" r="4.5" cx="0" cy="0" visibility="hidden"/>
    </svg>`;
    const change = last - base;
    const changePct = base ? (change / base) * 100 : 0;
    const word = { d1: 'today', m1: 'past month', y1: 'past year' }[range];
    const summary = `<span class="${dirOf(change)}">${sign(change)}${money(Math.abs(change), q?.currency, true)} (${pctStr(changePct)})</span> ${word}`;
    lbl.innerHTML = summary;

    // Touch the chart to read a price.
    const svg = area.querySelector('svg');
    const cur = svg.querySelector('.cursor'), dot = svg.querySelector('.dot');
    const fmtT = (ts) => new Date(ts * 1000).toLocaleString('en-GB', range === 'd1' ? { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' } : { day: 'numeric', month: 'short', year: range === 'y1' ? 'numeric' : undefined, timeZone: 'Europe/London' });
    const show = (clientX) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(vals.length - 1, Math.round(((clientX - r.left) / r.width) * (vals.length - 1))));
      const cx = x(i), cy = y(vals[i]);
      cur.setAttribute('x1', cx); cur.setAttribute('x2', cx); cur.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('visibility', 'visible');
      const ch = vals[i] - base;
      lbl.innerHTML = `<b>${money(vals[i], q?.currency)}</b> <span class="${dirOf(ch)}">${pctStr(base ? (ch / base) * 100 : 0)}</span> · ${esc(fmtT(d.t[i]))}`;
    };
    const hide = () => { cur.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); lbl.innerHTML = summary; };
    svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture?.(e.pointerId); show(e.clientX); });
    svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') show(e.clientX); });
    svg.addEventListener('pointerup', hide);
    svg.addEventListener('pointercancel', hide);
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') hide(); });
  }

  // ---------- stock page ----------
  function related(sym, q) {
    const stories = RR.stories();
    const base = (q?.shortName || q?.name || catalogName(sym) || '').replace(/,?\s+(inc\.?|incorporated|corporation|corp\.?|company|co\.?|holdings?|group|plc|ltd\.?|limited|n\.v\.|s\.a\.|ag|se|class [abc]|platforms|technologies|technology|\(.*\)).*$/i, '').trim();
    const first = base.split(/\s+/)[0] || '';
    const key = base.length >= 3 ? (first.length >= 4 && !/^(the|bank|international|american|united|general)$/i.test(first) ? first : base) : '';
    const re = key ? new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
    const bare = sym.split(/[.\-]/)[0];
    return stories.filter((s) => (s.stocks || []).some((k) => k.ticker === sym || k.ticker === bare) || (re && re.test(`${s.headline || ''} ${s.claim || ''}`)))
      .sort((a, b) => RR.pubTime(b).localeCompare(RR.pubTime(a)));
  }

  function stat(label, value) { return `<div class="sd-stat"><span>${label}</span><b>${value}</b></div>`; }

  function openStock(sym, backLabel) {
    sym = String(sym).toUpperCase();
    const q = quote(sym);
    const name = q?.name || catalogName(sym) || sym;
    const inWatch = watch.includes(sym);
    const s = data?.summaries?.[sym];
    const rel = related(sym, q).slice(0, 25);

    let html = `<div class="sd">
      <div class="sd-head">${RR.logo(name, sym)}<div><h1>${esc(sym)}</h1><div class="sub">${esc(name)}${q?.exchange ? ` · ${esc(q.exchange)}` : ''}</div></div></div>`;
    if (q && q.price != null) {
      html += `<div class="sd-price">${money(q.price, q.currency)}</div>
        <div class="sd-chg ${dirOf(q.change)}">${q.change > 0 ? '▲' : q.change < 0 ? '▼' : ''} ${money(Math.abs(q.change ?? 0), q.currency, true)} (${pctStr(q.changePct)}) <span>today</span></div>
        <div class="sd-asof">${esc(stateLabel(q.marketState))} · ${esc(data.liveAt && liveOK ? 'live ' + timeLondon(data.liveAt) : 'as of ' + timeLondon(data.pricesUpdated || data.updated))} · prices update hourly on weekdays</div>
        <section class="card sd-chart-card">
          <div class="segmented sd-seg"><button data-r="d1" class="on">1D</button><button data-r="m1">1M</button><button data-r="y1">1Y</button></div>
          <div class="sd-range-lbl"></div>
          <div class="sd-chart"></div>
        </section>
        <section class="card sd-stats">
          ${stat('Open', money(q.open, q.currency, true))}${stat('Prev close', money(q.prevClose, q.currency, true))}
          ${stat('High', money(q.high, q.currency, true))}${stat('Low', money(q.low, q.currency, true))}
          ${stat('Volume', big(q.volume))}${stat('Avg vol', big(q.avgVolume))}
          ${stat('Mkt value', big(q.marketCap, q.currency))}${stat('P/E', q.pe != null ? q.pe.toFixed(1) : '—')}
          ${stat('52W high', money(q.wk52High, q.currency, true))}${stat('52W low', money(q.wk52Low, q.currency, true))}
          ${stat('Div yield', q.divYield != null ? q.divYield.toFixed(2) + '%' : '—')}${stat('EPS', q.eps != null ? money(q.eps, q.currency, true) : '—')}
        </section>`;
    } else {
      html += `<section class="card"><p>${data?.invalid?.includes(sym) ? 'Yahoo Finance doesn’t recognise this ticker. Check it, remove it, and try another (London shares end in .L, for example BARC.L).' : 'Prices and chart arrive with the next update.'}</p></section>`;
    }
    if (s) {
      html += `<section class="card"><div class="card-title"><h2><span class="sparkle">✦</span> What’s happening</h2><span class="sent-pill ${s.sentiment}">${esc(s.sentiment)}</span></div>
        <p><b>${esc(s.headline)}</b></p><p>${esc(s.summary)}</p>
        <p class="sd-note">AI summary · ${esc(timeLondon(s.generated))} · refreshed with your morning and evening briefings</p></section>`;
    } else if (q && q.price != null) {
      html += `<section class="card"><div class="card-title"><h2><span class="sparkle">✦</span> What’s happening</h2></div>
        <p class="sd-note" style="font-size:14px">The AI summary is on its way${RR.hasLiveKey() ? ' (about a minute after adding)' : ''}, and it’s refreshed with every morning and evening briefing.</p></section>`;
    }
    const heads = (data?.news?.[sym] || []).slice(0, 8);
    if (heads.length) {
      html += RR.sectionHead('Latest headlines', '');
      html += `<div class="list sd-heads">${heads.map((h) => `<a class="sd-head-row" href="${esc(h.link)}" target="_blank" rel="noopener">
        <div><div class="t">${esc(h.title)}</div><div class="m">${esc(h.source || '')}${h.published ? ' · ' + esc(RR.ago(h.published)) : ''}</div></div>${RR.chevron}</a>`).join('')}</div>`;
    }
    if (rel.length || !heads.length) {
      html += RR.sectionHead('In your news', rel.length ? String(rel.length) : '');
      html += rel.length ? `<div class="list">${rel.map(RR.row).join('')}</div>` : `<p class="sd-none">No stories about ${esc(sym)} in the app’s news in the last few days.</p>`;
    }
    html += `<button class="btn-secondary sd-watch" data-watch="${esc(sym)}">${inWatch ? 'Remove from My stocks' : '+ Add to My stocks'}</button>
      <a class="btn-secondary" href="https://finance.yahoo.com/quote/${encodeURIComponent(sym)}" target="_blank" rel="noopener">View on Yahoo Finance</a>
      <p class="disclaimer">Prices may be delayed. The summary is AI-generated from the app’s news coverage and can be wrong. Not financial advice.</p></div>`;

    const page = RR.pushPage({ title: sym, backLabel: backLabel || RR.backLabel(), html });
    const box = page.querySelector('.sd-chart-card');
    if (box) {
      drawChart(box, sym, 'd1');
      box.querySelector('.sd-seg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]'); if (!b) return;
        box.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b));
        drawChart(box, sym, b.dataset.r);
      });
    }
    page.addEventListener('click', (e) => {
      const w = e.target.closest('[data-watch]');
      if (!w) return;
      if (watch.includes(sym)) { removeStock(sym); w.textContent = '+ Add to My stocks'; }
      else { addStock(sym); w.textContent = 'Remove from My stocks'; }
    });
  }
  RR.openStock = openStock;

  // ---------- adding / removing ----------
  let syncTimer = null;
  function scheduleSync() {
    clearTimeout(syncTimer);
    if (!RR.hasLiveKey()) return;
    syncTimer = setTimeout(() => {
      if ($('#stkSheet').open) { scheduleSync(); return; }
      if (RR.isRefreshing()) { scheduleSync(); return; }
      RR.runUpdate('stocks');
    }, 1500);
  }
  function addStock(sym) {
    sym = sym.toUpperCase();
    if (!validSymbol(sym) || watch.includes(sym)) return;
    watch.push(sym); saveWatch(); render();
    toast(RR.hasLiveKey() ? `Added ${sym}. Getting its price, AI summary and headlines (about a minute)…` : `Added ${sym}. Its price arrives with the next update. Turn on Live refresh in Settings to get it straight away.`, 3500);
    if (!quote(sym)) scheduleSync();
    liveAt = 0; tryLive();
  }
  function removeStock(sym) {
    watch = watch.filter((s) => s !== sym); saveWatch(); render();
  }

  // ---------- search sheet ----------
  let searchSeq = 0;
  function results(qs) {
    const q = qs.trim();
    const Q = q.toUpperCase();
    const known = new Map(CATALOG);
    for (const [s, v] of Object.entries(data?.quotes || {})) if (!known.has(s)) known.set(s, v.name);
    let list = [...known.entries()];
    if (q) {
      list = list.filter(([s, n]) => s.startsWith(Q) || n.toUpperCase().includes(Q))
        .sort((a, b) => (b[0] === Q) - (a[0] === Q) || (b[0].startsWith(Q)) - (a[0].startsWith(Q)) || a[0].length - b[0].length);
    } else {
      list = list.filter(([s]) => !(data?.top || []).includes(s)).slice(0, 30);
    }
    list = list.slice(0, 40);
    if (q && validSymbol(Q) && !list.some(([s]) => s === Q)) list.unshift([Q, 'Add this ticker']);
    return list;
  }
  function renderResults(list) {
    $('#stkResults').innerHTML = list.length ? `<div class="list">${list.map(([s, n]) => {
      const on = watch.includes(s);
      return `<button class="stk-res" data-add="${esc(s)}"><div class="stk-id"><b>${esc(s)}</b><span>${esc(n)}</span></div><span class="add ${on ? 'on' : ''}">${on ? '✓' : '+'}</span></button>`;
    }).join('')}</div>` : '<p class="sd-none">No matches. Type the exact ticker as used on Yahoo Finance.</p>';
  }
  async function liveSearch(q, seq) {
    // Uses Yahoo's search when the phone can reach it; otherwise the built-in list is enough.
    if (q.length < 2 || liveOK === false) return;
    try {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`, { signal: ctrl.signal });
      const j = await r.json();
      if (seq !== searchSeq) return;
      const extra = (j.quotes || []).filter((x) => x.symbol && (x.shortname || x.longname)).map((x) => [x.symbol.toUpperCase(), `${x.shortname || x.longname}${x.exchDisp ? ` (${x.exchDisp})` : ''}`]);
      const merged = results(q);
      for (const e of extra) if (!merged.some(([s]) => s === e[0])) merged.push(e);
      renderResults(merged.slice(0, 40));
    } catch { /* not available on this phone */ }
  }
  function openSheet() {
    const sh = $('#stkSheet');
    $('#stkSearch').value = '';
    renderResults(results(''));
    sh.showModal();
    setTimeout(() => $('#stkSearch').focus(), 250);
  }

  // ---------- events ----------
  function init() {
    $('#stkAdd').addEventListener('click', openSheet);
    $('#stkEdit').addEventListener('click', () => { editing = !editing; render(); });
    $('#stockList').addEventListener('click', (e) => {
      if (e.target.closest('[data-open-add]')) { openSheet(); return; }
      const del = e.target.closest('[data-del]');
      if (del) { removeStock(del.dataset.del); if (!watch.length) editing = false; render(); return; }
      if (e.target.closest('[data-chg]')) {
        chgMode = { pct: 'abs', abs: 'cap', cap: 'pct' }[chgMode]; store.set('rr.chgMode', chgMode); render(); return;
      }
      const row = e.target.closest('[data-stock]');
      if (row && !editing) openStock(row.dataset.stock, 'Stocks');
    });
    $('#stkSearch').addEventListener('input', (e) => {
      const q = e.target.value;
      const seq = ++searchSeq;
      renderResults(results(q));
      clearTimeout(e.target._t);
      e.target._t = setTimeout(() => liveSearch(q, seq), 350);
    });
    $('#stkResults').addEventListener('click', (e) => {
      const b = e.target.closest('[data-add]'); if (!b) return;
      const sym = b.dataset.add;
      if (watch.includes(sym)) removeStock(sym); else addStock(sym);
      const on = watch.includes(sym);
      const tag = b.querySelector('.add'); tag.classList.toggle('on', on); tag.textContent = on ? '✓' : '+';
    });
    $('#stkSheet').addEventListener('click', (e) => {
      if (e.target === $('#stkSheet') || e.target.closest('[data-close-sheet]')) $('#stkSheet').close();
    });
    $('#stkSheet').addEventListener('close', () => { render(); });

    RR.afterLoad = loadData;
    RR.onTab = (tab) => { if (tab === 'stocks') { loadData().then(tryLive); } };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadData().then(tryLive); });
    setInterval(() => { if (!document.hidden && $('.view[data-view="stocks"]').classList.contains('active')) tryLive(); }, 60e3);
    loadData();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
