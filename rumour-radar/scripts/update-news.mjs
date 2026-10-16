// Rumour Radar — news collector.
// Runs every 30 minutes on GitHub Actions. It:
//   1. reads every RSS feed listed in feeds.json
//   2. sends new headlines to Claude, which decides whether each is a rumour,
//      how likely it is to be true, and which stocks it could move
//   3. merges stories reported by several outlets into one
//   4. saves everything to data/news.json, which the app reads
//
// You normally never need to touch this file. Settings you might change:
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const MAX_NEW_PER_RUN = Number(process.env.MAX_NEW_PER_RUN || 40); // caps API cost per run
const BATCH_SIZE = 8;          // articles per AI request
const MAX_ARTICLE_AGE_H = 48;  // ignore articles older than this
const KEEP_DAYS = 7;           // drop stories older than this
const MAX_SEEN = 4000;         // how many article links to remember

import { parseFeed } from './feed-parser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const SEEN_FILE = path.join(DATA_DIR, 'seen.json');
const FEEDS_FILE = path.join(ROOT, 'feeds.json');

export const TOPICS = [
  'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Nvidia', 'Tesla & EVs', 'AI',
  'Chips', 'Phones & Gadgets', 'Gaming', 'Streaming & Media', 'Social media',
  'Crypto', 'Banks & Finance', 'Markets & Economy', 'Energy', 'Cars', 'Space',
  'Health & Biotech', 'Retail', 'Telecoms', 'Deals & Mergers', 'UK business', 'Other'
];

const log = (...a) => console.log('[rumour-radar]', ...a);

async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(value, null, 1));
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
        published: it.isoDate || new Date().toISOString(),
        snippet: trim(it.contentSnippet, 500)
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

// ---------- 2. Analyse with Claude ----------
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
            keep: { type: 'boolean', description: 'false for items with no relevance to business, tech, companies or markets (sport results, celebrity gossip, recipes, deals/coupons, opinion columns with no news).' },
            same_story_as: { type: ['string', 'null'], description: 'If this article covers the SAME specific claim/event as an existing story, that story id (e.g. "a1b2c3d4e5"), or "article:N" for an earlier article in this batch. Otherwise null.' },
            status: { type: 'string', enum: ['rumour', 'confirmed', 'denied', 'news'], description: 'rumour = unconfirmed claim (leaks, "reportedly", "sources say", analyst predictions of company plans, "in talks"). confirmed = an official announcement that confirms a previously rumoured claim. denied = the company officially denied it. news = ordinary confirmed news.' },
            claim: { type: 'string', description: 'One short, neutral sentence in your own words stating the core claim, e.g. "Apple is said to be planning a foldable iPhone for 2027." Max 140 chars.' },
            summary: { type: 'string', description: '2-3 sentences in your own words explaining the story and why it matters. Do not copy the article.' },
            likelihood: { type: ['integer', 'null'], description: 'For rumours: estimated % chance the claim turns out true (5-95). confirmed=100, denied=5, news=null.' },
            likelihood_reason: { type: 'string', description: 'One or two sentences on why you gave that likelihood.' },
            signals: { type: 'array', items: { type: 'string' }, description: 'Short credibility signals, e.g. "Reliable source: Bloomberg", "Single anonymous source", "Company declined to comment", "Fits supply-chain reports", "Speculative analyst note".' },
            topics: { type: 'array', items: { type: 'string', enum: TOPICS } },
            overall_impact: { type: 'string', enum: ['none', 'low', 'medium', 'high'], description: 'Likely market impact if true.' },
            stocks: {
              type: 'array',
              description: 'Up to 5 publicly traded companies most likely to be affected if the claim is true. Use real primary listing tickers (e.g. AAPL, 005930.KS, BARC.L). Empty if none.',
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
          required: ['article_index', 'keep', 'same_story_as', 'status', 'claim', 'summary', 'likelihood', 'likelihood_reason', 'signals', 'topics', 'overall_impact', 'stocks']
        }
      }
    },
    required: ['analyses']
  }
};

const SYSTEM = `You are the analysis engine of a news app that tracks business and tech RUMOURS, estimates how likely they are to be true, and lists stocks they could affect.

Estimating likelihood (be calibrated, not dramatic):
- Track record of the outlet/reporter matters most. Bloomberg, Reuters, FT, WSJ, The Information and reporters like Mark Gurman are right most of the time (often 70-90%). Supply-chain analysts (e.g. Ming-Chi Kuo) are decent on hardware (55-75%). Unknown leakers, social posts and tabloids are low (10-40%).
- More independent outlets reporting it raises likelihood; outlets merely citing one original report do not count as independent.
- Hedged language ("could", "might consider", "early talks") lowers likelihood; specific details (dates, prices, part numbers) raise it.
- Official denial: low. Official confirmation: status "confirmed", 100.
- Long-range predictions (years out) are less certain.

Stock impact: think about the company itself, competitors, and suppliers. Only list companies that are actually publicly traded, with correct tickers. If unsure of a ticker, leave the company out. Be modest: most rumours are low or medium impact.

Write everything in your own words. Never copy sentences from the articles. Analyse every article in the batch and call record_analysis exactly once.`;

export async function analyseBatch(batch, existing, apiKey) {
  const existingList = existing.length
    ? existing.map((s) => `${s.id} | ${s.status} | ${s.sources.length} outlet(s) | ${s.claim}`).join('\n')
    : '(none yet)';
  const articles = batch.map((a, i) =>
    `[article:${i}] Source: ${a.source}\nPublished: ${a.published}\nHeadline: ${a.title}\nSnippet: ${a.snippet || '(none)'}`
  ).join('\n\n');

  const body = {
    model: MODEL,
    max_tokens: 6000,
    system: SYSTEM,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: 'tool', name: 'record_analysis' },
    messages: [{
      role: 'user',
      content: `Existing stories from the last few days (id | status | outlets | claim):\n${existingList}\n\nNew articles to analyse:\n\n${articles}`
    }]
  };

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
      if (!tool?.input?.analyses) throw new Error('AI returned no analysis');
      return tool.input.analyses;
    } catch (e) {
      lastErr = e;
      if (e.fatal) throw e;
      log(`AI request failed (attempt ${attempt}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastErr;
}

// ---------- 3. Merge into stories ----------
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
    summary: trim(an.summary, 700),
    likelihood,
    likelihood_reason: trim(an.likelihood_reason, 400),
    signals: (an.signals || []).map((s) => trim(s, 80)).filter(Boolean).slice(0, 6),
    topics: topics.length ? topics : ['Other'],
    overall_impact: IMPACT_RANK[an.overall_impact] !== undefined ? an.overall_impact : 'low',
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
    const sourceEntry = { name: art.source, title: art.title, link: art.link, published: art.published };

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
      } else if (target.status === 'rumour' && clean.status === 'rumour') {
        target.likelihood = clean.likelihood; // newest estimate, made knowing there are more outlets
        target.likelihood_reason = clean.likelihood_reason;
      }
      target.signals = [...new Set([...clean.signals, ...target.signals])].slice(0, 8);
      target.topics = [...new Set([...target.topics, ...clean.topics])].filter((t) => t !== 'Other' || target.topics.length === 1);
      if (IMPACT_RANK[clean.overall_impact] > IMPACT_RANK[target.overall_impact]) target.overall_impact = clean.overall_impact;
      const tickers = new Set(target.stocks.map((s) => s.ticker));
      for (const s of clean.stocks) if (!tickers.has(s.ticker) && target.stocks.length < 6) target.stocks.push(s);
      target.last_updated = now;
      batchStory.set(an.article_index, target.id);
      merged++;
    } else {
      const story = {
        id: idFor(art.link),
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

  const fresh = await collect(feeds, seen);
  log(`${fresh.length} new articles found; analysing up to ${MAX_NEW_PER_RUN}.`);
  const todo = fresh.slice(0, MAX_NEW_PER_RUN);

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
    .sort((a, b) => b.last_updated.localeCompare(a.last_updated));
  news.updated = new Date().toISOString();
  news.model = MODEL;

  await writeJSON(NEWS_FILE, news);
  await writeJSON(SEEN_FILE, [...done, ...seen].slice(0, MAX_SEEN));
  log(`Done: ${stats.added} new stories, ${stats.merged} merged into existing, ${stats.dropped} skipped as irrelevant. ${news.stories.length} stories total.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
