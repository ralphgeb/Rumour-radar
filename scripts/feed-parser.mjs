// Tiny RSS + Atom parser with no dependencies. Also finds each article's image.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', pound: '£', euro: '€' };

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function unwrap(raw) {
  if (raw == null) return '';
  let s = raw.trim();
  const cdata = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) s = cdata[1];
  else s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return s;
}

export function stripHtml(s) {
  // Feeds often double-encode HTML, so decode first, then strip tags, then decode again.
  return decodeEntities(decodeEntities(s)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = block.match(re);
  return m ? unwrap(m[1]) : '';
}

function attr(tagText, name) {
  const m = tagText.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) || links.find((a) => !/rel=/i.test(a)) || links[0];
  return pick ? attr(pick, 'href') : '';
}

const looksLikeImage = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u) || /\/(image|img|media|wp-content|uploads|resize|photo)/i.test(u);

export function findImage(block) {
  const candidates = [];
  // <media:content url=".." medium="image"> and <media:thumbnail url="..">
  for (const m of block.matchAll(/<media:(content|thumbnail)\b([^>]*)>/gi)) {
    const url = attr(m[2], 'url');
    const medium = attr(m[2], 'medium');
    const type = attr(m[2], 'type');
    const width = Number(attr(m[2], 'width')) || 0;
    if (url && (medium === 'image' || /^image\//.test(type) || m[1] === 'thumbnail' || looksLikeImage(url))) {
      candidates.push({ url, score: width || (m[1] === 'content' ? 600 : 300) });
    }
  }
  // <enclosure url=".." type="image/jpeg">
  for (const m of block.matchAll(/<enclosure\b([^>]*)>/gi)) {
    const url = attr(m[1], 'url');
    if (url && (/^image\//.test(attr(m[1], 'type')) || looksLikeImage(url))) candidates.push({ url, score: 500 });
  }
  // <itunes:image href="..">
  for (const m of block.matchAll(/<itunes:image\b([^>]*)>/gi)) {
    const url = attr(m[1], 'href');
    if (url) candidates.push({ url, score: 200 });
  }
  // <img src=".."> inside the description / content (often HTML-encoded)
  const html = decodeEntities(unwrap(block));
  for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
    const url = attr(m[1], 'src') || attr(m[1], 'data-src');
    if (url && !/(pixel|tracking|feedburner|1x1|spacer|gravatar|emoji)/i.test(url)) candidates.push({ url, score: 100 });
  }
  const best = candidates
    .filter((c) => /^https?:\/\//i.test(c.url))
    .sort((a, b) => b.score - a.score)[0];
  return best ? best.url.replace(/^http:\/\//i, 'https://') : '';
}

export function parseFeed(xml) {
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = isAtom
    ? [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)]
    : [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];
  for (const [block] of blocks) {
    const title = stripHtml(tag(block, 'title'));
    let link = isAtom ? atomLink(block) : decodeEntities(tag(block, 'link').trim());
    if (!link) link = decodeEntities(tag(block, 'guid').trim());
    const date = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
    const desc = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content:encoded') || tag(block, 'content');
    const d = date ? new Date(date.trim()) : null;
    const isoDate = d && !isNaN(d) ? d.toISOString() : undefined;
    items.push({ title, link, isoDate, contentSnippet: stripHtml(desc), image: findImage(block) });
  }
  return items;
}

// Reads the start of an article page and returns its preview image (og:image / twitter:image).
export function findMetaImage(html, pageUrl) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const abs = (u) => { try { return new URL(u, pageUrl).toString().replace(/^http:\/\//i, 'https://'); } catch { return ''; } };
  for (const key of ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image', 'thumbnail', 'sailthru.image.full', 'parsely-image-url']) {
    const tagText = metas.find((t) => new RegExp(`(property|name|itemprop)\\s*=\\s*["']${key.replace(/[:.]/g, '\\$&')}["']`, 'i').test(t));
    const content = tagText && attr(tagText, 'content');
    if (content && abs(content)) return abs(content);
  }
  // <link rel="image_src" href="..">
  const link = html.match(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/i);
  if (link && attr(link[0], 'href')) return abs(attr(link[0], 'href'));
  // JSON-LD: "image": "..." or {"url": ".."} or [".."]
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const im = m[1].match(/"(?:image|thumbnailUrl)"\s*:\s*(?:\[\s*)?(?:\{[^}]*?"url"\s*:\s*)?"(https?:[^"]+)"/i);
    if (im) return abs(im[1].replace(/\\\//g, '/'));
  }
  return '';
}

// When the page itself says the article was published (meta tags, JSON-LD or <time>).
export function findPublished(html) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const ok = (v) => { const t = Date.parse(v); return Number.isFinite(t) && t < Date.now() + 864e5 && t > Date.parse('2000-01-01') ? new Date(t).toISOString() : ''; };
  for (const key of ['article:published_time', 'og:published_time', 'datePublished', 'pubdate', 'publishdate', 'publish-date', 'parsely-pub-date', 'sailthru.date', 'dc.date', 'dc.date.issued', 'date']) {
    const tag = metas.find((t) => new RegExp(`(property|name|itemprop)\\s*=\\s*["']${key.replace(/[:.]/g, '\\$&')}["']`, 'i').test(t));
    const v = tag && ok(attr(tag, 'content'));
    if (v) return v;
  }
  const ld = html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  if (ld && ok(ld[1])) return ok(ld[1]);
  const time = html.match(/<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i);
  return time ? ok(time[1]) : '';
}
