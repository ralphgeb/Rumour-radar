// Rumour Radar — news collector.
// Runs at 7:30 and 17:00 London time on GitHub Actions (and whenever you tap
// refresh in the app). It:
//   1. reads every RSS feed listed in feeds.json (tech, AI, gadgets, markets)
//   2. opens each new article to find its picture and read its text
//   3. asks Claude to write a summary, key points and a full write-up of each
//      story in its own words, flag rumours with how likely they are to be
//      true, and list the stocks the story could move
//   4. merges stories reported by several outlets into one
//   5. writes the morning / evening briefing for the Today tab
//   6. saves everything to data/news.json and data/briefing.json
//
// You normally never need to touch this file. Settings you might change:
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const BRIEFING_MODEL = process.env.BRIEFING_MODEL || MODEL;
const MAX_NEW_PER_RUN = Number(process.env.MAX_NEW_PER_RUN || 150); // caps API cost per run
const BATCH_SIZE = 6;          // articles per AI request
const MAX_ARTICLE_AGE_H = 30;  // ignore articles older than this
const KEEP_DAYS = 4;           // drop stories older than this
const MAX_STORIES = 600;       // keep the data file small and fast
const MAX_SEEN = 8000;         // how many article links to remember
const ARTICLE_CHARS = 6000;    // how much of each article the AI reads
const UPGRADE_MAX = 36;        // older stories per run that get a write-up added

import { parseFeed, findMetaImage, stripHtml } from './feed-parser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const SEEN_FILE = path.join(DATA_DIR, 'seen.json');
const BRIEFING_FILE = path.join(DATA_DIR, 'briefing.json');
const FEEDS_FILE = path.join(ROOT, 'feeds.json');

export const TOPICS = [
  'AI', 'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Nvidia', 'Tesla & EVs',
  'Chips', 'Phones & Gadgets', 'Computers', 'Gaming', 'Software & Apps', 'Cybersecurity',
  'Streaming & Media', 'Social media', 'Startups & VC', 'Crypto', 'Markets & Economy',
  'Banks & Finance', 'Deals & Mergers', 'Policy & Regulation', 'Energy', 'Cars', 'Space',
  'Science', 'Health & Biotech', 'Retail', 'Telecoms', 'UK business', 'Other'
];

const log = (...a) => console.log('[rumour-radar]', ...a);

async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, file);
}

export function cleanLink(link) {
  try {
    const u = new URL(link);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|ref$|cmpid$|src$|guccounter|ocid$)/i.test(k)) u.searchParams.delete(k);
    }
    u.hash = '';
    return u.toString();
  } catch { return link; }
}
const idFor = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const trim = (s, n) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const trimKeepParas = (s, n) => String(s || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);

// ---------- 1. Collect ----------
async function fetchFeed(feed) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'RumourRadar/1.0 (personal RSS reader)', Accept: 'application/rss+xml, application/xml, text/xml, */*' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return parseFeed(await res.text()).map((it) => {
      let source = feed.name;
      let title = trim(it.title, 300);
      // Google News titles look like "Headline - Publisher"
      if (/news\.google\.com/.test(feed.url)) {
        const m = title.match(/^(.*) - ([^-]{2,60})$/);
        if (m) { title = m[1].trim(); source = m[2].trim(); }
      }
      return {
        title,
        link: cleanLink(it.link || ''),
        source,
        section: feed.section || 'Tech',
        published: it.isoDate || new Date().toISOString(),
        snippet: trim(it.contentSnippet, 600),
        image: it.image || ''
      };
    }).filter((a) => a.title && a.link);
  } finally { clearTimeout(t); }
}

export async function collect(feeds, seen) {
  const results = await Promise.allSettled(feeds.map(fetchFeed));
  const all = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { log(`${feeds[i].name}: ${r.value.length} items`); all.push(...r.value); }
    else log(`${feeds[i].name}: failed (${r.reason?.message || r.reason})`);
  });
  const cutoff = Date.now() - MAX_ARTICLE_AGE_H * 3600e3;
  const seenSet = new Set(seen);
  const unique = new Map();
  for (const a of all) {
    if (seenSet.has(a.link) || unique.has(a.link)) continue;
    if (new Date(a.published).getTime() < cutoff) continue;
    unique.set(a.link, a);
  }
  return [...unique.values()].sort((a, b) => b.published.localeCompare(a.published));
}

// ---------- 2. Read each article (text for the AI + preview picture) ----------
export function extractText(html) {
  let h = html.replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside|figcaption|button)\b[\s\S]*?<\/\1>/gi, ' ');
  const article = h.match(/<article\b[\s\S]*<\/article>/i);
  if (article) h = article[0];
  const paras = [...h.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((t) => t.length > 50 && !/(cookie|subscribe|newsletter|sign up|advertis|all rights reserved|click here|follow us)/i.test(t));
  return [...new Set(paras)].join('\n').slice(0, ARTICLE_CHARS);
}

async function fetchArticle(url) {
  if (!/^https?:\/\//.test(url) || /news\.google\.com/.test(url)) return { text: '', image: '' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RumourRadar/1.0; personal news reader)', Accept: 'text/html' }
    });
    if (!res.ok || !res.body) return { text: '', image: '' };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    while (html.length < 1_500_000) {
      const { value, done } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});
    return { text: extractText(html), image: findMetaImage(html, res.url || url) };
  } catch { return { text: '', image: '' }; } finally { clearTimeout(t); }
}

export async function readArticles(articles) {
  let withText = 0;
  for (let i = 0; i < articles.length; i += 8) {
    await Promise.all(articles.slice(i, i + 8).map(async (a) => {
      const { text, image } = await fetchArticle(a.link);
      a.text = text;
      if (!a.image && image) a.image = image;
      if (text) withText++;
    }));
  }
  log(`Read ${withText} of ${articles.length} articles in full (the rest use their feed summary).`);
}

// ---------- 3. Analyse with Claude ----------
const ANALYSIS_TOOL = {
  name: 'record_analysis',
  description: 'Record the analysis of every article in the batch.',
  input_schema: {
    type: 'object',
    properties: {
      analyses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            article_index: { type: 'integer' },
            keep: { type: 'boolean', description: 'true for real news about tech, AI, gadgets, science, companies, investing or markets. false for sport, celebrity gossip, recipes, shopping deals/coupons, podcasts/newsletters with no news, and puzzles.' },
            same_story_as: { type: ['string', 'null'], description: 'If this article covers the SAME specific claim/event as an existing story, that story id (e.g. "a1b2c3d4e5"), or "article:N" for an earlier article in this batch. Otherwise null.' },
            status: { type: 'string', enum: ['rumour', 'confirmed', 'denied', 'news'], description: 'rumour = unconfirmed claim (leaks, "reportedly", "sources say", analyst predictions of company plans, "in talks"). confirmed = an official announcement that confirms a previously rumoured claim. denied = the company officially denied it. news = ordinary confirmed news.' },
            claim: { type: 'string', description: 'One short, neutral sentence in your own words stating the core news or claim. Max 140 chars.' },
            summary: { type: 'string', description: 'A proper summary in your own words: 4-6 sentences (about 80-130 words) covering what happened, the most important details and numbers, who is involved, and why it matters.' },
            key_points: { type: 'array', items: { type: 'string' }, description: '4-6 bullet points with the key facts, figures and implications, in your own words. Each one a full sentence.' },
            story: { type: 'string', description: 'The full story written in your own words for a reader who will not open the original: 250-450 words in 3-5 paragraphs separated by a blank line, covering what happened, all the key details and figures, background and context, reactions, and what comes next. Base it only on the article text given; never invent facts, numbers or quotes. Do not copy sentences from the article. If only a short snippet is available, write 80-150 words and stick to what is known.' },
            likelihood: { type: ['integer', 'null'], description: 'For rumours: estimated % chance the claim turns out true (5-95). confirmed=100, denied=5, news=null.' },
            likelihood_reason: { type: 'string', description: 'One or two sentences on why you gave that likelihood. Empty for news.' },
            signals: { type: 'array', items: { type: 'string' }, description: 'Short credibility signals for rumours, e.g. "Reliable source: Bloomberg", "Single anonymous source", "Company declined to comment". Empty for news.' },
            topics: { type: 'array', items: { type: 'string', enum: TOPICS } },
            overall_impact: { type: 'string', enum: ['none', 'low', 'medium', 'high'], description: 'Likely market impact (if a rumour: if it turns out true).' },
            market_take: { type: 'string', description: 'One short sentence on how this could affect investors or the stocks below. Empty string if there is no market angle.' },
            stocks: {
              type: 'array',
              description: 'Up to 5 publicly traded companies most likely to be affected by this news (or by the rumour if true): the company itself, rivals, suppliers or partners. Use real primary listing tickers (e.g. AAPL, 005930.KS, BARC.L). Empty if none.',
              items: {
                type: 'object',
                properties: {
                  ticker: { type: 'string' },
                  name: { type: 'string' },
                  direction: { type: 'string', enum: ['up', 'down', 'mixed'] },
                  impact: { type: 'string', enum: ['low', 'medium', 'high'] },
                  reason: { type: 'string', description: 'One short sentence.' }
                },
                required: ['ticker', 'name', 'direction', 'impact', 'reason']
              }
            }
          },
          required: ['article_index', 'keep', 'same_story_as', 'status', 'claim', 'summary', 'key_points', 'story', 'likelihood', 'likelihood_reason', 'signals', 'topics', 'overall_impact', 'market_take', 'stocks']
        }
      }
    },
    required: ['analyses']
  }
};

const SYSTEM = `You are the analysis engine of a news app covering tech, AI, gadgets and investing. For every article you write a short neutral summary, key points and a full write-up of the story in your own words, decide whether it is confirmed news or an unconfirmed RUMOUR, estimate how likely rumours are to be true, and list the stocks the story could move.

Writing: clear, neutral, British English, no hype. Everything must be in your own words; never copy sentences from the articles and never invent facts, figures or quotes.

For confirmed news: status "news", likelihood null, likelihood_reason "" and signals [].

Estimating likelihood (be calibrated, not dramatic):
- Track record of the outlet/reporter matters most. Bloomberg, Reuters, FT, WSJ, The Information and reporters like Mark Gurman are right most of the time (often 70-90%). Supply-chain analysts (e.g. Ming-Chi Kuo) are decent on hardware (55-75%). Unknown leakers, social posts and tabloids are low (10-40%).
- More independent outlets reporting it raises likelihood; outlets merely citing one original report do not count as independent.
- Hedged language ("could", "might consider", "early talks") lowers likelihood; specific details (dates, prices, part numbers) raise it.
- Official denial: low. Official confirmation: status "confirmed", 100.
- Long-range predictions (years out) are less certain.

Stock impact (for news AND rumours): think about the company itself, competitors, suppliers and partners. Only list companies that are actually publicly traded, with correct tickers; private companies (e.g. OpenAI, Anthropic, SpaceX) have no ticker, so list affected public companies instead. If unsure of a ticker, leave the company out. Be modest: most stories are low or medium impact, and product reviews or how-to articles usually have none.

Analyse every article in the batch and call record_analysis exactly once.`;

async function callClaude(body, apiKey) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json?.error?.message || res.statusText;
        if (res.status === 401) throw Object.assign(new Error('Your Anthropic API key was rejected. Check the ANTHROPIC_API_KEY secret on GitHub.'), { fatal: true });
        if (res.status === 400 && /credit/i.test(msg)) throw Object.assign(new Error('Your Anthropic account is out of credit. Add credit at console.anthropic.com.'), { fatal: true });
        throw new Error(`API ${res.status}: ${msg}`);
      }
      const tool = (json.content || []).find((c) => c.type === 'tool_use');
      if (!tool?.input) throw new Error('AI returned no result');
      return tool.input;
    } catch (e) {
      lastErr = e;
      if (e.fatal) throw e;
      log(`AI request failed (attempt ${attempt}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
  }
  throw lastErr;
}

export async function analyseBatch(batch, existing, apiKey) {
  const existingList = existing.length
    ? existing.map((s) => `${s.id} | ${s.status} | ${s.sources.length} outlet(s) | ${s.claim}`).join('\n')
    : '(none yet)';
  const articles = batch.map((a, i) =>
    `[article:${i}] Source: ${a.source}\nPublished: ${a.published}\nHeadline: ${a.title}\n` +
    (a.text ? `Article text:\n${a.text}` : `Feed summary only: ${a.snippet || '(none)'}`)
  ).join('\n\n---\n\n');

  const input = await callClaude({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: 'tool', name: 'record_analysis' },
    messages: [{
      role: 'user',
      content: `Existing stories from the last few days (id | status | outlets | claim):\n${existingList}\n\nNew articles to analyse:\n\n${articles}`
    }]
  }, apiKey);
  if (!Array.isArray(input.analyses)) throw new Error('AI returned no analysis');
  return input.analyses;
}

// ---------- 4. Merge into stories ----------
const IMPACT_RANK = { none: 0, low: 1, medium: 2, high: 3 };

export function sanitise(an) {
  const topics = (an.topics || []).filter((t) => TOPICS.includes(t));
  let likelihood = an.likelihood;
  if (an.status === 'confirmed') likelihood = 100;
  else if (an.status === 'news') likelihood = null;
  else if (typeof likelihood === 'number') likelihood = Math.max(1, Math.min(99, Math.round(likelihood)));
  else likelihood = an.status === 'denied' ? 5 : 50;
  const stocks = (an.stocks || [])
    .filter((s) => s && /^[A-Z0-9.\-^=]{1,15}$/i.test(String(s.ticker || '').trim()))
    .slice(0, 5)
    .map((s) => ({
      ticker: String(s.ticker).trim().toUpperCase(),
      name: trim(s.name, 60),
      direction: ['up', 'down', 'mixed'].includes(s.direction) ? s.direction : 'mixed',
      impact: ['low', 'medium', 'high'].includes(s.impact) ? s.impact : 'low',
      reason: trim(s.reason, 200)
    }));
  return {
    status: ['rumour', 'confirmed', 'denied', 'news'].includes(an.status) ? an.status : 'news',
    claim: trim(an.claim, 200),
    summary: trim(an.summary, 1200),
    key_points: (an.key_points || []).map((p) => trim(p, 300)).filter(Boolean).slice(0, 6),
    story: trimKeepParas(an.story, 5000),
    likelihood,
    likelihood_reason: trim(an.likelihood_reason, 400),
    signals: (an.signals || []).map((s) => trim(s, 80)).filter(Boolean).slice(0, 6),
    topics: topics.length ? topics : ['Other'],
    overall_impact: IMPACT_RANK[an.overall_impact] !== undefined ? an.overall_impact : 'low',
    market_take: trim(an.market_take, 240),
    stocks
  };
}

export function mergeBatch(stories, batch, analyses, now = new Date().toISOString()) {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const batchStory = new Map(); // article index -> story id
  // Articles that point at another article in this batch are handled last,
  // so the story they point at already exists whatever order they arrived in.
  const refsBatch = (a) => /^article:\d+$/.test(a.same_story_as || '');
  const sorted = [...analyses].sort((a, b) => (refsBatch(a) - refsBatch(b)) || (a.article_index - b.article_index));
  let added = 0, merged = 0, dropped = 0;

  for (const an of sorted) {
    const art = batch[an.article_index];
    if (!art || batchStory.has(an.article_index)) continue;
    if (!an.keep) { dropped++; continue; }
    const clean = sanitise(an);
    const sourceEntry = { name: art.source, title: art.title, link: art.link, published: art.published, image: art.image || '' };

    let target = null;
    const ref = an.same_story_as;
    if (typeof ref === 'string') {
      const m = ref.match(/^article:(\d+)$/);
      if (m && batchStory.has(Number(m[1]))) target = byId.get(batchStory.get(Number(m[1])));
      else if (byId.has(ref)) target = byId.get(ref);
    }

    if (target) {
      if (!target.sources.some((s) => s.link === art.link)) target.sources.push(sourceEntry);
      // Status upgrades: a rumour can become confirmed or denied.
      if (clean.status === 'confirmed' || clean.status === 'denied') {
        target.status = clean.status;
        target.likelihood = clean.likelihood;
        target.likelihood_reason = clean.likelihood_reason;
        target.resolved_at = now;
        // a confirmation is new information, so its write-up replaces the old one
        if (clean.story) { target.story = clean.story; target.summary = clean.summary; target.key_points = clean.key_points; }
      } else if (target.status === 'rumour' && clean.status === 'rumour') {
        target.likelihood = clean.likelihood; // newest estimate, made knowing there are more outlets
        target.likelihood_reason = clean.likelihood_reason;
      }
      // keep the richest write-up
      if ((clean.story || '').length > (target.story || '').length * 1.3) {
        target.story = clean.story; target.key_points = clean.key_points;
      }
      target.signals = [...new Set([...clean.signals, ...(target.signals || [])])].slice(0, 8);
      target.topics = [...new Set([...target.topics, ...clean.topics])].filter((t) => t !== 'Other' || target.topics.length === 1);
      if (IMPACT_RANK[clean.overall_impact] > IMPACT_RANK[target.overall_impact]) target.overall_impact = clean.overall_impact;
      if (!target.image && art.image) target.image = art.image;
      if (!target.market_take && clean.market_take) target.market_take = clean.market_take;
      const tickers = new Set(target.stocks.map((s) => s.ticker));
      for (const s of clean.stocks) if (!tickers.has(s.ticker) && target.stocks.length < 6) target.stocks.push(s);
      target.last_updated = now;
      batchStory.set(an.article_index, target.id);
      merged++;
    } else {
      const story = {
        id: idFor(art.link),
        headline: art.title,
        section: art.section || 'Tech',
        image: art.image || '',
        ...clean,
        sources: [sourceEntry],
        first_seen: now,
        first_published: art.published,
        last_updated: now
      };
      if (byId.has(story.id)) continue;
      byId.set(story.id, story);
      stories.push(story);
      batchStory.set(an.article_index, story.id);
      added++;
    }
  }
  return { added, merged, dropped, handled: new Set(sorted.map((a) => a.article_index)) };
}

// ---------- 5. Daily briefing ----------
const BRIEFING_TOOL = {
  name: 'record_briefing',
  description: 'Record the briefing.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A punchy front-page headline for this briefing, max 70 chars, naming the biggest story.' },
      intro: { type: 'string', description: '3-4 sentences giving the big picture of what happened in this period, like the opening of a newspaper front page.' },
      top_stories: {
        type: 'array', description: 'The 5-7 most important stories, most important first.',
        items: { type: 'object', properties: {
          story_id: { type: 'string' },
          title: { type: 'string', description: 'Short headline in your own words, max 80 chars.' },
          summary: { type: 'string', description: '2-3 sentences: what happened and why it matters.' }
        }, required: ['story_id', 'title', 'summary'] }
      },
      rumour_watch: {
        type: 'array', description: 'Up to 4 of the most interesting open rumours.',
        items: { type: 'object', properties: {
          story_id: { type: 'string' },
          note: { type: 'string', description: 'One sentence on the rumour and why it is or is not credible.' }
        }, required: ['story_id', 'note'] }
      },
      stocks_to_watch: {
        type: 'array', description: 'Up to 6 stocks most affected by this period’s news.',
        items: { type: 'object', properties: {
          ticker: { type: 'string' }, name: { type: 'string' },
          direction: { type: 'string', enum: ['up', 'down', 'mixed'] },
          note: { type: 'string', description: 'One short sentence on why.' }
        }, required: ['ticker', 'name', 'direction', 'note'] }
      },
      in_brief: {
        type: 'array', description: '5-8 other notable stories, one line each.',
        items: { type: 'object', properties: {
          story_id: { type: 'string' },
          line: { type: 'string', description: 'One sentence, max 140 chars.' }
        }, required: ['story_id', 'line'] }
      }
    },
    required: ['title', 'intro', 'top_stories', 'rumour_watch', 'stocks_to_watch', 'in_brief']
  }
};

const londonHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/London' }).format(d));

export async function makeBriefing(stories, apiKey, now = new Date()) {
  const edition = londonHour(now) < 12 ? 'Morning' : 'Evening';
  const since = new Date(now.getTime() - 16 * 3600e3).toISOString();
  const pub = (s) => s.first_published || s.first_seen || '';
  const score = (s) => (s.sources?.length || 1) * 2 + (IMPACT_RANK[s.overall_impact] || 0) * 2 + (s.status === 'rumour' ? 1 : 0) + (s.status === 'confirmed' ? 2 : 0);
  const pool = stories.filter((s) => pub(s) >= since || (s.last_updated || '') >= since)
    .sort((a, b) => score(b) - score(a))
    .slice(0, 90);
  if (pool.length < 3) { log('Not enough recent stories for a briefing yet.'); return null; }

  const list = pool.map((s) => `${s.id} | ${s.status}${s.likelihood != null && s.status === 'rumour' ? ' ' + s.likelihood + '%' : ''} | ${s.sources.length} outlet(s) | impact ${s.overall_impact} | ${s.section} | ${s.headline || s.claim}\n   ${s.summary}${(s.stocks || []).length ? '\n   Stocks: ' + s.stocks.map((k) => `${k.ticker} ${k.direction}`).join(', ') : ''}`).join('\n');

  const input = await callClaude({
    model: BRIEFING_MODEL,
    max_tokens: 4000,
    system: `You are the editor of "Rumour Radar", a twice-daily briefing on tech, AI, gadgets and markets. Write the ${edition.toLowerCase()} briefing covering the last ${edition === 'Morning' ? 'night and early morning' : 'day'} for a busy reader. Pick what genuinely matters (big launches, deals, earnings, regulation, AI breakthroughs, market moves, credible rumours), not minor product reviews. Use only story ids from the list. Be neutral, clear, British English, in your own words. Call record_briefing once.`,
    tools: [BRIEFING_TOOL],
    tool_choice: { type: 'tool', name: 'record_briefing' },
    messages: [{ role: 'user', content: `Stories (id | status | outlets | impact | section | headline, then summary):\n${list}` }]
  }, apiKey);

  const ids = new Set(pool.map((s) => s.id));
  const okId = (x) => x && ids.has(x.story_id);
  return {
    id: idFor(now.toISOString()),
    edition,
    generated: now.toISOString(),
    covers_from: since,
    story_count: pool.length,
    title: trim(input.title, 100),
    intro: trim(input.intro, 900),
    top_stories: (input.top_stories || []).filter(okId).slice(0, 7).map((x) => ({ story_id: x.story_id, title: trim(x.title, 120), summary: trim(x.summary, 500) })),
    rumour_watch: (input.rumour_watch || []).filter(okId).slice(0, 4).map((x) => ({ story_id: x.story_id, note: trim(x.note, 300) })),
    stocks_to_watch: (input.stocks_to_watch || []).filter((x) => /^[A-Z0-9.\-^=]{1,15}$/i.test(x.ticker || '')).slice(0, 6).map((x) => ({
      ticker: x.ticker.toUpperCase(), name: trim(x.name, 60), direction: ['up', 'down', 'mixed'].includes(x.direction) ? x.direction : 'mixed', note: trim(x.note, 200)
    })),
    in_brief: (input.in_brief || []).filter(okId).slice(0, 8).map((x) => ({ story_id: x.story_id, line: trim(x.line, 200) }))
  };
}

function shouldMakeBriefing(briefing) {
  const mode = (process.env.MAKE_BRIEFING || 'auto').toLowerCase();
  if (mode === 'yes' || mode === 'true') return true;
  if (mode === 'no' || mode === 'false') return false;
  if (process.env.GITHUB_EVENT_NAME === 'schedule') return true;
  const last = briefing.editions?.[0];
  // On a manual refresh: make one if there is none yet, or the latest is old.
  return !last || Date.now() - new Date(last.generated).getTime() > 8 * 3600e3;
}

// ---------- Upgrade older stories ----------
// Stories saved by earlier versions have no picture, key points or write-up.
// Each run fills in a batch of the most recent ones.
export async function upgradeOld(stories, apiKey) {
  const cutoff = new Date(Date.now() - 48 * 3600e3).toISOString();
  const pub = (s) => s.first_published || s.first_seen || '';
  const needWriteUp = stories
    .filter((s) => !s.story && !s.upgrade_tried && pub(s) >= cutoff)
    .sort((a, b) => pub(b).localeCompare(pub(a)))
    .slice(0, UPGRADE_MAX);
  const needImage = stories.filter((s) => !s.image && !s.image_checked && !needWriteUp.includes(s)).slice(0, 60);
  if (!needWriteUp.length && !needImage.length) return;

  // pictures only
  for (let i = 0; i < needImage.length; i += 8) {
    await Promise.all(needImage.slice(i, i + 8).map(async (s) => {
      const { image } = await fetchArticle(s.sources?.[0]?.link || '');
      if (image) s.image = image;
      s.image_checked = true;
    }));
  }

  // pictures + AI write-ups
  const arts = needWriteUp.map((s) => {
    const src = s.sources?.[0] || {};
    return { story: s, title: s.headline || src.title || s.claim, link: src.link || '', source: src.name || '', published: pub(s), snippet: s.summary || '' };
  });
  await readArticles(arts);
  let done = 0;
  for (let i = 0; i < arts.length; i += BATCH_SIZE) {
    const batch = arts.slice(i, i + BATCH_SIZE);
    try {
      const analyses = await analyseBatch(batch, [], apiKey);
      for (const an of analyses) {
        const a = batch[an.article_index];
        if (!a) continue;
        const s = a.story;
        const c = sanitise(an);
        if (c.summary) s.summary = c.summary;
        if (c.key_points.length) s.key_points = c.key_points;
        if (c.story) s.story = c.story;
        if (!s.market_take && c.market_take) s.market_take = c.market_take;
        if (!(s.stocks || []).length && c.stocks.length) s.stocks = c.stocks;
        if (!s.image && a.image) s.image = a.image;
        done++;
      }
    } catch (e) {
      if (e.fatal) throw e;
      log(`Upgrade batch skipped: ${e.message}`);
    }
    batch.forEach((a) => { a.story.upgrade_tried = true; a.story.image_checked = true; });
  }
  log(`Upgraded ${done} older stories with write-ups; checked ${needImage.length} for pictures.`);
}

// ---------- Main ----------
export async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('\n❌ ANTHROPIC_API_KEY is missing. Add it on GitHub: Settings → Secrets and variables → Actions → New repository secret.\n');
    process.exit(1);
  }
  const feeds = await readJSON(FEEDS_FILE, []);
  const news = await readJSON(NEWS_FILE, { updated: null, stories: [] });
  const seen = await readJSON(SEEN_FILE, []);
  const briefing = await readJSON(BRIEFING_FILE, { editions: [] });

  const fresh = await collect(feeds, seen);
  log(`${fresh.length} new articles found; analysing up to ${MAX_NEW_PER_RUN}.`);
  const todo = fresh.slice(0, MAX_NEW_PER_RUN);
  await readArticles(todo);

  const stats = { added: 0, merged: 0, dropped: 0 };
  const done = [];
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const recent = [...news.stories]
      .sort((a, b) => b.last_updated.localeCompare(a.last_updated))
      .slice(0, 80);
    try {
      const analyses = await analyseBatch(batch, recent, apiKey);
      const r = mergeBatch(news.stories, batch, analyses);
      stats.added += r.added; stats.merged += r.merged; stats.dropped += r.dropped;
      // Only remember articles the AI actually handled, so the rest are retried next run.
      batch.forEach((a, idx) => { if (r.handled.has(idx)) done.push(a.link); });
    } catch (e) {
      if (e.fatal) { console.error('\n❌ ' + e.message + '\n'); process.exit(1); }
      log(`Skipping batch, will retry next run: ${e.message}`);
    }
  }

  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400e3).toISOString();
  news.stories = news.stories
    .filter((s) => s.last_updated >= cutoff)
    .sort((a, b) => b.last_updated.localeCompare(a.last_updated))
    .slice(0, MAX_STORIES);
  for (const s of news.stories) {
    if (!s.headline) s.headline = s.sources?.[0]?.title || s.claim;
    if (!s.section) s.section = 'Tech';
  }
  try { await upgradeOld(news.stories, apiKey); } catch (e) {
    if (e.fatal) { console.error('\n❌ ' + e.message + '\n'); process.exit(1); }
    log(`Upgrading older stories failed: ${e.message}`);
  }
  news.updated = new Date().toISOString();
  news.model = MODEL;
  news.last_run = { ...stats, at: news.updated };

  if (shouldMakeBriefing(briefing)) {
    try {
      const b = await makeBriefing(news.stories, apiKey);
      if (b) {
        briefing.editions = [b, ...(briefing.editions || [])].slice(0, 6);
        log(`${b.edition} briefing written: "${b.title}"`);
      }
    } catch (e) {
      if (e.fatal) { console.error('\n❌ ' + e.message + '\n'); process.exit(1); }
      log(`Briefing failed, keeping the previous one: ${e.message}`);
    }
  }
  briefing.updated = new Date().toISOString();

  await writeJSON(NEWS_FILE, news);
  await writeJSON(BRIEFING_FILE, briefing);
  await writeJSON(SEEN_FILE, [...done, ...seen].slice(0, MAX_SEEN));
  log(`Done: ${stats.added} new stories, ${stats.merged} merged into existing, ${stats.dropped} skipped as irrelevant. ${news.stories.length} stories total.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
