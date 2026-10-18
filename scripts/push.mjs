// Rumour Radar — morning notifications (Web Push to the home-screen app).
//
// How it works, with nothing extra to set up:
// - The "VAPID" keys that identify this app to Apple's push service are derived
//   from your ANTHROPIC_API_KEY secret (one-way, so the key itself is never
//   revealed). The public half is saved in data/push-key.json for the app.
// - When you turn notifications on, the app encrypts its push address with that
//   public key and sends it to GitHub through the Live refresh key. Only this
//   updater can decrypt it, so it's safe in the public repository.
// - Around 7:00 the workflow sends each phone a one-line teaser of its Today topic.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function vapidKeys(secret) {
  if (!secret) return null;
  for (let i = 0; i < 20; i++) {
    const d = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.from('rumour-radar'), Buffer.from('vapid-' + i), 32));
    try {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.setPrivateKey(d);
      return { ecdh, publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(d) };
    } catch { /* out of range: try the next one */ }
  }
  return null;
}

// Decrypts what the app sent: base64url( ephemeral public key (65) | iv (12) | AES-GCM ciphertext+tag ).
export function openBox(blob, keys) {
  const buf = fromB64u(blob);
  const eph = buf.subarray(0, 65);
  const iv = buf.subarray(65, 77);
  const ct = buf.subarray(77, buf.length - 16);
  const tag = buf.subarray(buf.length - 16);
  const shared = keys.ecdh.computeSecret(eph);
  const key = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.from('rr-push'), 32));
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
}

const readJSON = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const writeJSON = (f, v) => fs.writeFile(f, JSON.stringify(v, null, 1) + '\n');

export async function ensurePublicKey(dataDir, keys) {
  if (!keys) return;
  const f = path.join(dataDir, 'push-key.json');
  const cur = await readJSON(f, {});
  if (cur.publicKey !== keys.publicKey) await writeJSON(f, { publicKey: keys.publicKey });
}

function appUrl() {
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '/').split('/');
  if (!owner) return 'https://github.com';
  return repo && repo.toLowerCase() !== `${owner.toLowerCase()}.github.io` ? `https://${owner}.github.io/${repo}/` : `https://${owner}.github.io/`;
}

async function webpush(keys) {
  const mod = await import('web-push').catch(() => null);
  if (!mod) throw new Error('the web-push tool is not installed (update the workflow file)');
  const wp = mod.default || mod;
  wp.setVapidDetails(appUrl(), keys.publicKey, keys.privateKey);
  return wp;
}

async function send(wp, sub, msg) {
  try {
    await wp.sendNotification(sub, JSON.stringify(msg), { TTL: 6 * 3600, urgency: 'high' });
    return 'ok';
  } catch (e) {
    return e.statusCode === 404 || e.statusCode === 410 ? 'gone' : `error ${e.statusCode || ''} ${e.body || e.message}`.trim();
  }
}

// PUSH input from the app: "on:<id>:<blob>" or "off:<id>".
export async function saveFromApp(dataDir, keys, input, log) {
  const f = path.join(dataDir, 'push.json');
  const db = await readJSON(f, { devices: {} });
  db.devices ||= {};
  const [action, id, blob] = String(input || '').split(':');
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id || '')) { log('Notifications: nothing to save.'); return; }
  if (action === 'off') {
    delete db.devices[id];
    await writeJSON(f, db);
    log('Notifications turned off for one device.');
    return;
  }
  let info;
  try { info = openBox(blob, keys); } catch (e) { log(`Notifications: couldn't read the request (${e.message}).`); return; }
  db.devices[id] = { box: blob, topic: info.topic || 'Tech', added: db.devices[id]?.added || new Date().toISOString(), updated: new Date().toISOString() };
  await writeJSON(f, db);
  log(`Notifications on for one device (topic: ${info.topic || 'Tech'}).`);
  if (info.test) {
    const wp = await webpush(keys);
    const r = await send(wp, info.sub, { title: 'Notifications are on ✓', body: `Your ${info.topic || 'Tech'} briefing will arrive here at about 7:00 each morning.`, url: appUrl() });
    log(`Test notification: ${r}.`);
  }
}

// One catchy line per topic, written with the morning update.
function lineFor(topic, briefing) {
  if (topic === 'Tech') {
    const ed = briefing.editions?.[0];
    return { line: ed?.notification || ed?.title || '', fresh: ed?.generated };
  }
  const sec = briefing.sections?.[topic];
  return { line: sec?.notification || sec?.title || '', fresh: sec?.generated };
}
const EMOJI = { Tech: '⚡️', Fashion: '✨', Finance: '📈', World: '🌍' };

export async function sendMorning(dataDir, keys, briefing, log) {
  const f = path.join(dataDir, 'push.json');
  const db = await readJSON(f, { devices: {} });
  const ids = Object.keys(db.devices || {});
  if (!ids.length) { log('Notifications: no devices signed up.'); return; }
  const wp = await webpush(keys);
  let ok = 0;
  for (const id of ids) {
    let info;
    try { info = openBox(db.devices[id].box, keys); } catch { delete db.devices[id]; continue; }
    const topic = info.topic || db.devices[id].topic || 'Tech';
    const { line } = lineFor(topic, briefing);
    const r = await send(wp, info.sub, {
      title: `${EMOJI[topic] || '☀️'} Your ${topic} briefing is here`,
      body: line || 'Tap to see what happened while you were asleep.',
      url: appUrl()
    });
    if (r === 'ok') ok++;
    else if (r === 'gone') delete db.devices[id];
    else log(`Notification failed: ${r}`);
  }
  db.lastSent = new Date().toISOString();
  await writeJSON(f, db);
  log(`Morning notifications sent: ${ok} of ${ids.length}.`);
}
