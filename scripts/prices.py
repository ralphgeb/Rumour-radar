"""Rumour Radar — fetch stock prices with yfinance.

Called by scripts/stocks.mjs as:  python3 scripts/prices.py request.json result.json

request.json: {"symbols": [...], "info": true|false, "charts": ["d1","m1","y1"], "news": [...symbols needing headlines]}
result.json:  {"SYM": {"quote": {...}, "charts": {...}, "news": [...]} or {"error": "..."}}

yfinance talks to Yahoo Finance the way a normal browser does, which is why it
keeps working when plain requests from servers get blocked.
"""
import json
import math
import sys
import time
from datetime import datetime, timezone

import yfinance as yf


def num(v):
    try:
        if v is None:
            return None
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else f
    except Exception:
        return None


def series(df, last_day_only=False):
    if df is None or getattr(df, "empty", True) or "Close" not in df:
        return {"t": [], "c": []}
    s = df["Close"].dropna()
    if last_day_only and len(s):
        last = s.index[-1].date()
        s = s[[ts.date() == last for ts in s.index]]
    return {"t": [int(ts.timestamp()) for ts in s.index], "c": [round(float(x), 4) for x in s.values]}


def fi_get(fi, *keys):
    for k in keys:
        try:
            v = fi[k]
            if num(v) is not None or isinstance(v, str):
                return v
        except Exception:
            pass
    return None


def headlines(t):
    out = []
    try:
        for n in (t.news or [])[:8]:
            c = n.get("content") if isinstance(n, dict) else None
            if c:  # 2025+ format
                url = (c.get("canonicalUrl") or {}).get("url") or (c.get("clickThroughUrl") or {}).get("url")
                out.append({"title": c.get("title"), "source": (c.get("provider") or {}).get("displayName", ""),
                            "link": url, "published": c.get("pubDate") or c.get("displayTime"), "summary": (c.get("summary") or "")[:400]})
            elif isinstance(n, dict):  # older format
                ts = n.get("providerPublishTime")
                out.append({"title": n.get("title"), "source": n.get("publisher", ""), "link": n.get("link"),
                            "published": datetime.fromtimestamp(ts, timezone.utc).isoformat() if ts else None, "summary": ""})
    except Exception:
        pass
    return [h for h in out if h.get("title") and h.get("link")]


def fetch(sym, want_info, charts, want_news):
    t = yf.Ticker(sym)
    fi = t.fast_info
    d5 = t.history(period="5d", interval="5m", auto_adjust=False)
    d1 = series(d5, last_day_only=True)
    price = num(fi_get(fi, "lastPrice", "last_price"))
    if price is None and d1["c"]:
        price = d1["c"][-1]
    if price is None:
        return {"error": "no price"}

    info = {}
    if want_info:
        try:
            info = t.info or {}
        except Exception:
            info = {}

    prev = num(info.get("regularMarketPreviousClose")) or num(fi_get(fi, "previousClose", "regularMarketPreviousClose", "previous_close"))
    change = price - prev if prev else None
    last_bar = d1["t"][-1] if d1["t"] else None
    live = last_bar is not None and time.time() - last_bar < 20 * 60
    tay = num(info.get("trailingAnnualDividendYield"))
    q = {
        "symbol": sym,
        "name": info.get("longName") or info.get("shortName") or sym,
        "shortName": info.get("shortName") or "",
        "exchange": info.get("fullExchangeName") or fi_get(fi, "exchange") or "",
        "currency": info.get("currency") or fi_get(fi, "currency") or "USD",
        "price": round(price, 4),
        "prevClose": round(prev, 4) if prev else None,
        "change": round(change, 4) if change is not None else None,
        "changePct": round(change / prev * 100, 2) if prev else None,
        "open": num(info.get("regularMarketOpen")) or num(fi_get(fi, "open")),
        "high": num(info.get("regularMarketDayHigh")) or num(fi_get(fi, "dayHigh", "day_high")),
        "low": num(info.get("regularMarketDayLow")) or num(fi_get(fi, "dayLow", "day_low")),
        "volume": num(info.get("regularMarketVolume")) or num(fi_get(fi, "lastVolume", "last_volume")),
        "avgVolume": num(info.get("averageVolume")) or num(fi_get(fi, "threeMonthAverageVolume", "three_month_average_volume")),
        "marketCap": num(info.get("marketCap")) or (num(fi_get(fi, "marketCap", "market_cap")) if want_info else None),
        "pe": num(info.get("trailingPE")),
        "eps": num(info.get("trailingEps") or info.get("epsTrailingTwelveMonths")),
        "divYield": round(tay * 100, 2) if tay is not None else None,
        "wk52High": num(info.get("fiftyTwoWeekHigh")) or num(fi_get(fi, "yearHigh", "year_high")),
        "wk52Low": num(info.get("fiftyTwoWeekLow")) or num(fi_get(fi, "yearLow", "year_low")),
        "marketState": info.get("marketState") or ("REGULAR" if live else "CLOSED"),
        "time": last_bar or int(time.time()),
    }
    out = {"quote": q, "charts": {"d1": d1}}
    if "m1" in charts:
        out["charts"]["m1"] = series(t.history(period="1mo", interval="1d", auto_adjust=False))
    if "y1" in charts:
        out["charts"]["y1"] = series(t.history(period="1y", interval="1wk", auto_adjust=False))
    if want_news:
        out["news"] = headlines(t)
    return out


def main():
    req = json.load(open(sys.argv[1]))
    want_info = bool(req.get("info", True))
    charts = req.get("charts", ["d1", "m1", "y1"])
    news_for = set(req.get("news", []))
    result = {}
    for sym in req["symbols"]:
        for attempt in range(3):
            try:
                result[sym] = fetch(sym, want_info, charts, sym in news_for)
                break
            except Exception as e:  # rate limits etc.
                result[sym] = {"error": str(e)[:200]}
                time.sleep(2 * (attempt + 1))
        time.sleep(0.15)
    json.dump(result, open(sys.argv[2], "w"))
    ok = sum(1 for v in result.values() if "quote" in v)
    print(f"[prices] {ok} of {len(result)} symbols fetched")


if __name__ == "__main__":
    main()
