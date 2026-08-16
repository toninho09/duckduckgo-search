---
name: duckduckgo-search
description: Web search and webpage content extraction via DuckDuckGo, no API key required. Use for searching the web, finding documentation or facts, and fetching/reading page content.
license: MIT
compatibility: Requires Node.js 18+. No npm install needed. Uses the system `curl` only as a fallback for blocked searches.
---

# DuckDuckGo Search

Web search and webpage content extraction via DuckDuckGo's HTML endpoint. No API key required. Zero dependencies — plain Node.js. JS port of [duckduckgo-mcp-server](https://github.com/nickclyde/duckduckgo-mcp-server).

## Search

```bash
./scripts/search.js "query"                     # Basic search (10 results)
./scripts/search.js "query" -n 5                # Limit results
./scripts/search.js "query" --region br-pt      # Region/language (e.g. us-en, br-pt, jp-ja)
./scripts/search.js "query" --safe strict       # SafeSearch: strict | moderate | off
```

Output: numbered list with title, URL, and snippet for each result.

## Fetch Page Content

```bash
./scripts/content.js https://example.com        # Extract page text (first 8000 chars)
./scripts/content.js https://example.com --start 8000    # Next page of a long document
./scripts/content.js https://example.com --max 4000      # Shorter chunk
```

Output: page title and cleaned text, ending with a `[Content info: ...]` footer describing character offsets. If truncated, follow up with `--start` as indicated by the footer.

## Configuration (environment variables)

| Variable             | Default   | Description                                   |
|----------------------|-----------|-----------------------------------------------|
| `DDG_SAFE_SEARCH`    | `moderate`| Default SafeSearch mode (strict/moderate/off) |
| `DDG_REGION`         | *(none)*  | Default region code (e.g. `br-pt`)            |
| `DDG_ALLOW_PRIVATE_URLS` | off   | Set `1` to allow fetching private/internal URLs |

## Notes

- Keep it under ~30 searches per minute; DuckDuckGo rate-limits/blocks abusive clients. If a search returns a block message, wait a few minutes and retry.
- `content.js` refuses URLs that resolve to loopback/private/link-local/metadata addresses (SSRF guard) and re-validates every redirect hop.
