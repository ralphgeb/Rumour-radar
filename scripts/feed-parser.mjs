// Tiny RSS + Atom parser with no dependencies.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', pound: '£', euro: '€' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
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

function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) || links.find((a) => !/rel=/i.test(a)) || links[0];
  const href = pick && pick.match(/href=["']([^"']+)["']/i);
  return href ? decodeEntities(href[1]) : '';
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
    const desc = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content') || tag(block, 'content:encoded');
    const d = date ? new Date(date.trim()) : null;
    const isoDate = d && !isNaN(d) ? d.toISOString() : undefined;
    items.push({ title, link, isoDate, contentSnippet: stripHtml(desc) });
  }
  return items;
}
