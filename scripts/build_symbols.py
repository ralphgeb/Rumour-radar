"""Rumour Radar — build the worldwide stock list used by the search box.

Writes data/symbols.json from FinanceDatabase (free, open source, 100,000+ listings
with Yahoo Finance tickers). Falls back to a list of US-listed stocks if that fails.

Usage: python3 scripts/build_symbols.py data/symbols.json
"""
import json
import math
import sys
import urllib.request
from datetime import datetime, timezone

# Main exchanges (Yahoo codes) and how they're shown in the app.
EXCHANGES = {
    "NMS": "Nasdaq", "NGM": "Nasdaq", "NCM": "Nasdaq", "NYQ": "NYSE", "ASE": "NYSE American", "PCX": "NYSE Arca", "BTS": "Cboe",
    "LSE": "London", "IOB": "London IOB", "PAR": "Paris", "AMS": "Amsterdam", "BRU": "Brussels", "LIS": "Lisbon", "GER": "XETRA",
    "EBS": "Swiss", "MIL": "Milan", "MCE": "Madrid", "VIE": "Vienna", "STO": "Stockholm", "CPH": "Copenhagen", "OSL": "Oslo",
    "HEL": "Helsinki", "ISE": "Dublin", "WSE": "Warsaw", "TOR": "Toronto", "VAN": "TSX Venture", "ASX": "Sydney", "NZE": "New Zealand",
    "HKG": "Hong Kong", "JPX": "Tokyo", "KSC": "Korea", "KOE": "KOSDAQ", "TAI": "Taiwan", "TWO": "Taiwan OTC", "SHH": "Shanghai",
    "SHZ": "Shenzhen", "NSI": "India NSE", "BSE": "India BSE", "SES": "Singapore", "SAO": "São Paulo", "MEX": "Mexico",
    "JNB": "Johannesburg", "SAU": "Saudi", "TLV": "Tel Aviv", "IST": "Istanbul", "PNK": "OTC",
}
CAP_RANK = {"Mega Cap": 5, "Large Cap": 4, "Mid Cap": 3, "Small Cap": 2, "Micro Cap": 1, "Nano Cap": 0}
ETF_EXCHANGES = {"PCX", "NMS", "NGM", "BTS", "NYQ", "LSE", "GER", "AMS", "PAR", "EBS", "MIL"}

INDICES = [
    ("^GSPC", "S&P 500"), ("^IXIC", "Nasdaq Composite"), ("^NDX", "Nasdaq 100"), ("^DJI", "Dow Jones Industrial Average"),
    ("^RUT", "Russell 2000"), ("^VIX", "VIX volatility index"), ("^FTSE", "FTSE 100"), ("^FTMC", "FTSE 250"), ("^GDAXI", "DAX"),
    ("^FCHI", "CAC 40"), ("^STOXX50E", "Euro Stoxx 50"), ("^N225", "Nikkei 225"), ("^HSI", "Hang Seng"), ("000001.SS", "Shanghai Composite"),
    ("^AXJO", "ASX 200"), ("^GSPTSE", "S&P/TSX Composite"), ("^BSESN", "BSE Sensex"), ("^NSEI", "Nifty 50"), ("^KS11", "KOSPI"),
]
CRYPTO = [
    ("BTC-USD", "Bitcoin"), ("ETH-USD", "Ethereum"), ("SOL-USD", "Solana"), ("XRP-USD", "XRP"), ("BNB-USD", "BNB"),
    ("DOGE-USD", "Dogecoin"), ("ADA-USD", "Cardano"), ("AVAX-USD", "Avalanche"), ("LINK-USD", "Chainlink"), ("DOT-USD", "Polkadot"),
    ("LTC-USD", "Litecoin"), ("TRX-USD", "TRON"), ("BTC-GBP", "Bitcoin in pounds"), ("ETH-GBP", "Ethereum in pounds"),
]
FX_COMMOD = [
    ("GBPUSD=X", "Pound / US dollar"), ("EURUSD=X", "Euro / US dollar"), ("GBPEUR=X", "Pound / Euro"), ("USDJPY=X", "US dollar / Yen"),
    ("DX-Y.NYB", "US dollar index"), ("GC=F", "Gold"), ("SI=F", "Silver"), ("CL=F", "Crude oil (WTI)"), ("BZ=F", "Brent crude oil"),
    ("NG=F", "Natural gas"), ("HG=F", "Copper"), ("^TNX", "US 10-year Treasury yield"),
]


def clean(s):
    if s is None or (isinstance(s, float) and math.isnan(s)):
        return ""
    return " ".join(str(s).split())


def from_financedatabase():
    import financedatabase as fd
    rows = []
    eq = fd.Equities().select()
    for sym, r in eq.iterrows():
        ex = clean(r.get("exchange"))
        name = clean(r.get("name"))
        if not name or ex not in EXCHANGES:
            continue
        cap = CAP_RANK.get(clean(r.get("market_cap")), -1)
        if ex == "PNK" and cap < 4:
            continue  # OTC: only big foreign companies (e.g. TCEHY)
        if cap < 1 and ex not in ("NMS", "NGM", "NCM", "NYQ", "ASE", "LSE", "IOB"):
            continue  # skip the tiniest and unknown-size listings outside the US and London
        rows.append([str(sym), name, ex, max(cap, 0), "E"])
    try:
        etf = fd.ETFs().select()
        for sym, r in etf.iterrows():
            ex = clean(r.get("exchange"))
            name = clean(r.get("name"))
            if name and ex in ETF_EXCHANGES:
                rows.append([str(sym), name, ex, 2, "F"])
    except Exception as e:
        print(f"[symbols] ETFs skipped: {e}")
    return rows


def from_us_lists():
    rows = []
    base = "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main"
    for ex, code in (("nasdaq", "NMS"), ("nyse", "NYQ"), ("amex", "ASE")):
        with urllib.request.urlopen(f"{base}/{ex}/{ex}_full_tickers.json", timeout=60) as f:
            for r in json.load(f):
                sym = clean(r.get("symbol")).replace("/", "-").replace("^", "-P")
                name = clean(r.get("name"))
                try:
                    mc = float(r.get("marketCap") or 0)
                except Exception:
                    mc = 0
                cap = 5 if mc > 2e11 else 4 if mc > 1e10 else 3 if mc > 2e9 else 2 if mc > 3e8 else 1 if mc > 5e7 else 0
                if sym and name:
                    rows.append([sym, name, code, cap, "E"])
    return rows


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "data/symbols.json"
    try:
        rows = from_financedatabase()
        source = "FinanceDatabase"
    except Exception as e:
        print(f"[symbols] FinanceDatabase failed ({e}); using US lists instead")
        rows = from_us_lists()
        source = "US-Stock-Symbols"
    rows += [[s, n, "IDX", 5, "I"] for s, n in INDICES]
    rows += [[s, n, "CRYPTO", 4, "C"] for s, n in CRYPTO]
    rows += [[s, n, "FX", 4, "X"] for s, n in FX_COMMOD]

    # one row per ticker, biggest first
    seen, uniq = set(), []
    for r in sorted(rows, key=lambda r: -r[3]):
        if r[0] in seen:
            continue
        seen.add(r[0])
        uniq.append(r)

    labels = dict(EXCHANGES, IDX="Index", CRYPTO="Crypto", FX="Markets")
    codes = sorted({r[2] for r in uniq})
    idx = {c: i for i, c in enumerate(codes)}
    data = {
        "v": 1,
        "updated": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "exchanges": [labels.get(c, c) for c in codes],
        "s": [[r[0], r[1][:80], idx[r[2]], r[3], r[4]] for r in uniq],
    }
    with open(out, "w") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
    print(f"[symbols] {len(uniq)} listings saved from {source}")


if __name__ == "__main__":
    main()
