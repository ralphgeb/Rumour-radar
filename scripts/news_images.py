"""Rumour Radar: find the publisher's own thumbnail for stories from sites that block
automatic readers (WSJ, Reuters, Barron's...), using DuckDuckGo's free news search.

Reads a JSON list of {"id", "title", "link"} from the file given as argv[1] and
writes {"id": "image url"} to argv[2]. A picture is only used when the search
result is the same article (same address) or has practically the same headline.
"""
import json
import re
import sys
import time
import unicodedata
from urllib.parse import urlsplit

try:
    from ddgs import DDGS
except ImportError:  # older name of the same package
    from duckduckgo_search import DDGS


def words(t):
    t = unicodedata.normalize("NFKD", str(t or "")).lower()
    return {w for w in re.sub(r"[^a-z0-9 ]+", " ", t).split() if len(w) > 2}


def same_headline(a, b):
    A, B = words(a), words(b)
    if not A or not B:
        return False
    both = len(A & B)
    return both / min(len(A), len(B)) >= 0.8 or both / len(A | B) >= 0.6


def key(u):
    p = urlsplit(u or "")
    return (p.netloc.replace("www.", "") + p.path.rstrip("/")).lower()


def main():
    items = json.load(open(sys.argv[1]))
    out, tried, errors = {}, 0, 0
    with DDGS() as ddg:
        for it in items:
            if errors >= 5:
                break  # DuckDuckGo is refusing for now
            title = (it.get("title") or "")[:150]
            if not title:
                continue
            tried += 1
            try:
                results = ddg.news(title, region="wt-wt", safesearch="off", max_results=10) or []
                errors = 0
            except Exception as e:  # rate limit or network problem
                errors += 1
                print(f"[images] search failed: {str(e)[:120]}", file=sys.stderr)
                time.sleep(4)
                continue
            want = key(it.get("link"))
            pick = next((r for r in results if r.get("image") and want and key(r.get("url")) == want), None)
            if not pick:
                pick = next((r for r in results if r.get("image") and same_headline(r.get("title"), title)), None)
            if pick:
                out[it["id"]] = pick["image"]
            time.sleep(1.2)
    json.dump(out, open(sys.argv[2], "w"))
    print(f"[images] DuckDuckGo news: {len(out)} pictures from {tried} searches")


if __name__ == "__main__":
    main()
