// Decides what a scheduled run should do, by looking at the clock in London and
// at when the last updates actually happened. GitHub often starts scheduled runs
// late, or skips some, so instead of trusting the exact start time, the workflow
// checks every 30 minutes and catches up on anything that is due.
//   full   = news + Today briefing (from 7:30 and from 17:00, until it has run)
//   prices = stock prices (weekdays, about once an hour, 7:00 to 22:30)
//   none   = nothing to do
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); } catch { return {}; } };
const time = (s) => (s ? new Date(s).getTime() || 0 : 0);

const now = new Date(process.env.NOW || Date.now());
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'
}).formatToParts(now).map((p) => [p.type, p.value]));
const mins = Number(parts.hour) * 60 + Number(parts.minute);
const weekday = !['Sat', 'Sun'].includes(parts.weekday);

// The UTC instant of a London clock time today.
const offsetMin = Math.round((Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - Math.floor(now.getTime() / 60e3) * 60e3) / 60e3);
const londonToday = (m) => Date.UTC(+parts.year, +parts.month - 1, +parts.day, 0, m) - offsetMin * 60e3;

const SLOTS = [{ name: 'morning', at: 7 * 60 + 30 }, { name: 'evening', at: 17 * 60 }];
const CATCH_UP = 4 * 60; // keep trying for up to 4 hours after the slot

const lastNews = time(read('news.json').updated);
const lastPrices = time(read('stocks.json').pricesUpdated);

let mode = 'none';
let why = `London ${parts.weekday} ${parts.hour}:${parts.minute}: nothing due.`;
for (const s of SLOTS) {
  if (mins >= s.at && mins < s.at + CATCH_UP && lastNews < londonToday(s.at)) {
    mode = 'full';
    why = `The ${s.name} update is due (last news update: ${lastNews ? new Date(lastNews).toISOString() : 'never'}).`;
  }
}
if (mode === 'none' && weekday && mins >= 7 * 60 && mins <= 22 * 60 + 30 && now.getTime() - lastPrices > 50 * 60e3) {
  mode = 'prices';
  why = 'Hourly stock prices are due.';
}

console.log(why);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\ngo=${mode !== 'none'}\n`);
