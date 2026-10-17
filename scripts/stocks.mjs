// Rumour Radar — stocks.
// Builds data/stocks.json: the 20 largest US-listed companies by market value plus
// the stocks you added in the app, each with price, key stats, 1-day / 1-month /
// 1-year charts, the stories that mention it, and a short AI summary of what's
// going on. Prices come from Yahoo Finance's public endpoints.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TOP_N = 20;
const MAX_WATCH = 40;

// Roughly the largest US-listed companies. The top 20 are picked from these by live market value.
// (The order here is only used if market values can't be fetched.)
export const CANDIDATES = [
  'NVDA', 'MSFT', 'AAPL', 'GOOGL', 'AMZN', 'META', 'AVGO', 'TSLA', 'TSM', 'BRK-B',
  'LLY', 'JPM', 'WMT', 'V', 'ORCL', 'MA', 'XOM', 'NFLX', 'COST', 'JNJ',
  'PLTR', 'AMD', 'HD', 'PG', 'ABBV', 'BAC', 'UNH', 'ASML', 'KO', 'CRM',
  'NVO', 'SAP', 'BABA', 'TM', 'CVX', 'MU', 'GE', 'IBM', 'CSCO', 'WFC',
  'MS', 'GS', 'AZN', 'TMUS', 'MRK', 'NOW', 'ISRG', 'UBER', 'ARM', 'SHEL'
];

const log = (...a) => console.log('[stocks]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (n) => (typeof n === 'number' && isFinite(n) ? Math.round(n * 100) / 100 : null);
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
export const validSymbol = (s) => /^[A-Z0-9^][A-Z0-9.\-=^]{0,14}$/.test(String(s || '').toUpperCase());

async function get(url, sess, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...(sess?.cookie ? { Cookie: sess.cookie } : {}) } });
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * i); continue; }
      if (!res.ok) return { error: res.status };
      return { json: await res.json() };
    } catch (e) { if (i === tries) return { error: e.message }; await sleep(1000 * i); }
  }
  return { error: 'retry limit' };
}

// Yahoo needs a cookie + "crumb" for the quote endpoint (market value, P/E and so on).
async function session() {
  try {
    const r = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
    const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || '']).filter(Boolean);
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    const c = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie } });
    const crumb = (await c.text()).trim();
    if (c.ok && crumb && crumb.length < 30 && !/[<{\s]/.test(crumb)) return { cookie, crumb };
    return { cookie };
  } catch { return {}; }
}

async function fetchQuotes(symbols, sess) {
  const out = {};
  if (!sess.crumb) return out;
  for (const part of chunk(symbols, 40)) {
    const { json } = await get(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(part.join(','))}&crumb=${encodeURIComponent(sess.crumb)}`, sess);
    for (const q of json?.quoteResponse?.result || []) out[q.symbol] = q;
  }
  return out;
}

async function fetchChart(symbol, range, interval, sess) {
  const { json, error } = await get(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`, sess);
  const res = json?.chart?.result?.[0];
  if (!res) return { error: error || json?.chart?.error?.description || 'no data' };
  const t = res.timestamp || [];
  const c = res.indicators?.quote?.[0]?.close || [];
  const pts = { t: [], c: [] };
  t.forEach((ts, i) => { if (typeof c[i] === 'number') { pts.t.push(ts); pts.c.push(r2(c[i])); } });
  return { meta: res.meta || {}, pts };
}

function marketState(meta) {
  const p = meta?.currentTradingPeriod?.regular;
  const now = Date.now() / 1000;
  if (p && now >= p.start && now < p.end) return 'REGULAR';
  return 'CLOSED';
}

function buildQuote(sym, q, meta) {
  const price = q?.regularMarketPrice ?? meta?.regularMarketPrice ?? null;
  const prev = q?.regularMarketPreviousClose ?? meta?.chartPreviousClose ?? meta?.previousClose ?? null;
  const change = q?.regularMarketChange ?? (price != null && prev ? price - prev : null);
  const changePct = q?.regularMarketChangePercent ?? (price != null && prev ? ((price - prev) / prev) * 100 : null);
  return {
    symbol: sym,
    name: q?.longName || q?.shortName || meta?.longName || meta?.shortName || sym,
    shortName: q?.shortName || meta?.shortName || '',
    exchange: q?.fullExchangeName || meta?.fullExchangeName || meta?.exchangeName || '',
    currency: q?.currency || meta?.currency || 'USD',
    price: r2(price), prevClose: r2(prev), change: r2(change), changePct: r2(changePct),
    open: r2(q?.regularMarketOpen ?? null),
    high: r2(q?.regularMarketDayHigh ?? meta?.regularMarketDayHigh ?? null),
    low: r2(q?.regularMarketDayLow ?? meta?.regularMarketDayLow ?? null),
    volume: q?.regularMarketVolume ?? meta?.regularMarketVolume ?? null,
    avgVolume: q?.averageDailyVolume3Month ?? null,
    marketCap: q?.marketCap ?? null,
    pe: r2(q?.trailingPE ?? null),
    eps: r2(q?.epsTrailingTwelveMonths ?? null),
    divYield: q?.trailingAnnualDividendYield != null ? r2(q.trailingAnnualDividendYield * 100) : null,
    wk52High: r2(q?.fiftyTwoWeekHigh ?? meta?.fiftyTwoWeekHigh ?? null),
    wk52Low: r2(q?.fiftyTwoWeekLow ?? meta?.fiftyTwoWeekLow ?? null),
    marketState: q?.marketState || marketState(meta),
    time: (q?.regularMarketTime ?? meta?.regularMarketTime ?? Math.floor(Date.now() / 1000))
  };
}

// ---------- matching stories to companies ----------
export function nameKey(q) {
  const base = (q.shortName || q.name || '').replace(/,?\s+(inc\.?|incorporated|corporation|corp\.?|company|co\.?|holdings?|group|plc|ltd\.?|limited|n\.v\.|s\.a\.|ag|se|class [abc]|platforms|technologies|technology|semiconductor manufacturing)\b.*$/i, '').replace(/\(.*?\)/g, '').trim();
  const first = base.split(/\s+/)[0] || '';
  return base.length >= 3 ? (first.length >= 4 && !/^(the|bank|international|american|united|general)$/i.test(first) ? first : base) : '';
}
export function linkedStories(sym, q, stories) {
  const key = nameKey(q);
  const re = key ? new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
  const bare = sym.split(/[.\-]/)[0];
  return stories.filter((s) => (s.stocks || []).some((k) => k.ticker === sym || k.ticker === bare) || (re && re.test(`${s.headline || ''} ${s.claim || ''}`)))
    .sort((a, b) => (b.first_published || b.first_seen || '').localeCompare(a.first_published || a.first_seen || ''));
}

// ---------- AI summaries ----------
const SUMMARY_TOOL = {
  name: 'record_stock_summaries',
  description: 'Record a summary for every company.',
  input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
    symbol: { type: 'string' },
    headline: { type: 'string', description: 'What is happening with the company, as a short headline, max 70 characters.' },
    summary: { type: 'string', description: '2-4 sentences: what is going on with the company and its shares right now, based only on the stories and price moves given. If there are no stories, say there is no major news in the app’s coverage and describe the price move. Never invent news.' },
    sentiment: { type: 'string', enum: ['positive', 'negative', 'mixed', 'neutral'] }
  }, required: ['symbol', 'headline', 'summary', 'sentiment'] } } }, required: ['items'] }
};

function pct(a, b) { return a != null && b ? r2(((a - b) / b) * 100) : null; }

async function summarise(symbols, data, stories, ai) {
  const out = {};
  for (const part of chunk(symbols, 8)) {
    const blocks = part.map((sym) => {
      const q = data.quotes[sym];
      const ch = data.charts[sym] || {};
      const m1 = ch.m1?.c?.length ? pct(q.price, ch.m1.c[0]) : null;
      const y1 = ch.y1?.c?.length ? pct(q.price, ch.y1.c[0]) : null;
      const rel = linkedStories(sym, q, stories).slice(0, 6);
      return `### ${sym} — ${q.name}\nPrice ${q.price} ${q.currency}; today ${q.changePct}%; 1 month ${m1 ?? '?'}%; 1 year ${y1 ?? '?'}%; 52-week range ${q.wk52Low}–${q.wk52High}.\n` +
        (rel.length ? rel.map((s) => `- ${s.headline || s.claim} (${(s.sources?.[0]?.name) || ''}, ${String(s.first_published || s.first_seen || '').slice(0, 10)}): ${s.summary || ''}`).join('\n') : '- (no stories in the app’s coverage)');
    }).join('\n\n');
    try {
      const x = await ai({
        max_tokens: 3000,
        system: 'You write short, neutral company updates for a stocks screen in a news app. Use only the information given. British English. Not financial advice, so don’t recommend buying or selling. Call record_stock_summaries once with one item per company.',
        tools: [SUMMARY_TOOL], tool_choice: { type: 'tool', name: 'record_stock_summaries' },
        messages: [{ role: 'user', content: blocks }]
      });
      for (const it of x.items || []) {
        if (!part.includes(it.symbol)) continue;
        out[it.symbol] = {
          headline: String(it.headline || '').slice(0, 100),
          summary: String(it.summary || '').slice(0, 700),
          sentiment: ['positive', 'negative', 'mixed', 'neutral'].includes(it.sentiment) ? it.sentiment : 'neutral',
          generated: new Date().toISOString()
        };
      }
    } catch (e) { if (e.fatal) throw e; log(`AI summaries skipped for one batch: ${e.message}`); }
  }
  return out;
}

// ---------- main ----------
export async function updateStocks({ prev, watchlist, stories, ai, summariseMode = 'all' }) {
  const watch = [...new Set((watchlist || []).map((s) => String(s).toUpperCase().trim()).filter(validSymbol))].slice(0, MAX_WATCH);
  const sess = await session();
  log(sess.crumb ? 'Yahoo session ready.' : 'No Yahoo crumb; using chart data only (no market value / P/E).');

  const all = [...new Set([...CANDIDATES, ...watch])];
  const q7 = await fetchQuotes(all, sess);

  // Pick the top 20 by market value (US-listed candidates).
  let top;
  const withCap = CANDIDATES.filter((s) => q7[s]?.marketCap);
  if (withCap.length >= TOP_N) top = withCap.sort((a, b) => q7[b].marketCap - q7[a].marketCap).slice(0, TOP_N);
  else top = (prev?.top?.length ? prev.top : CANDIDATES.slice(0, TOP_N));

  const symbols = [...new Set([...top, ...watch])];
  const data = { updated: new Date().toISOString(), top, watch, quotes: {}, charts: {}, summaries: { ...(prev?.summaries || {}) }, invalid: [] };

  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < symbols.length) {
      const sym = symbols[next++];
      const d1 = await fetchChart(sym, '1d', '5m', sess);
      if (d1.error && !q7[sym]) {
        // Keep yesterday's numbers rather than showing nothing, but flag symbols Yahoo doesn't know.
        if (prev?.quotes?.[sym]) { data.quotes[sym] = prev.quotes[sym]; data.charts[sym] = prev.charts?.[sym] || {}; }
        else data.invalid.push(sym);
        continue;
      }
      const m1 = await fetchChart(sym, '1mo', '1d', sess);
      const y1 = await fetchChart(sym, '1y', '1wk', sess);
      data.quotes[sym] = buildQuote(sym, q7[sym], d1.meta);
      data.charts[sym] = { d1: d1.pts || { t: [], c: [] }, m1: m1.pts || { t: [], c: [] }, y1: y1.pts || { t: [], c: [] } };
      await sleep(120);
    }
  }));
  log(`Prices for ${Object.keys(data.quotes).length} stocks${data.invalid.length ? `; not found: ${data.invalid.join(', ')}` : ''}.`);

  const ok = symbols.filter((s) => data.quotes[s]?.price != null);
  const need = summariseMode === 'missing' ? ok.filter((s) => !data.summaries[s]) : ok;
  if (need.length && ai) {
    const fresh = await summarise(need, data, stories, ai);
    Object.assign(data.summaries, fresh);
    log(`AI summaries written for ${Object.keys(fresh).length} stocks.`);
  }
  // drop summaries for stocks no longer shown
  for (const k of Object.keys(data.summaries)) if (!symbols.includes(k)) delete data.summaries[k];
  return data;
}
