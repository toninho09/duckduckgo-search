---
name: duckduckgo-search
description: Web search and webpage content extraction via DuckDuckGo, no API key required. Use for searching the web, finding documentation or facts, and fetching/reading page content.
license: MIT
compatibility: Requires Node.js 18+. No npm install needed.
---

## Search

```bash
./scripts/search.js "query" [-n 5] [--region br-pt] [--safe strict|moderate|off]
```

## Fetch Page Content

```bash
./scripts/content.js https://example.com [--start 8000] [--max 4000]
```

If output is truncated, follow up with `--start` as indicated by the `[Content info: ...]` footer.

## Notes

- Keep under ~30 searches/minute; if blocked, wait a few minutes and retry.
- Env vars: `DDG_REGION`, `DDG_SAFE_SEARCH`, `DDG_ALLOW_PRIVATE_URLS=1` (allows private/internal URLs).
- `content.js` blocks loopback/private/metadata addresses (SSRF guard).
