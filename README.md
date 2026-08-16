# DuckDuckGo Search (pi skill)

A [pi](https://github.com/earendil-works/pi) coding agent skill for web search and webpage content extraction via DuckDuckGo's HTML endpoint. No API key required. Zero dependencies — plain Node.js.

JS port of [duckduckgo-mcp-server](https://github.com/nickclyde/duckduckgo-mcp-server).

## Install

```bash
pi install npm:@toninho09/duckduckgo-search
```

Requires Node.js 18+. Uses the system `curl` only as a fallback when DuckDuckGo blocks the default HTTP client.

## Usage

Once installed, the agent can use two scripts from the `duckduckgo-search` skill.

### Web search

```bash
./scripts/search.js "query"                     # Basic search (10 results)
./scripts/search.js "query" -n 5                # Limit results
./scripts/search.js "query" --region br-pt      # Region/language (e.g. us-en, br-pt, jp-ja)
./scripts/search.js "query" --safe strict       # SafeSearch: strict | moderate | off
```

Output: numbered list with title, URL, and snippet for each result.

### Fetch page content

```bash
./scripts/content.js https://example.com                 # Extract page text (first 8000 chars)
./scripts/content.js https://example.com --start 8000    # Next page of a long document
./scripts/content.js https://example.com --max 4000      # Shorter chunk
```

Output: page title and cleaned text, ending with a `[Content info: ...]` footer describing character offsets. Handles HTML, plain text, JSON, and XML; respects page encodings (charset header and `<meta>` sniffing).

### Configuration (environment variables)

| Variable                  | Default    | Description                                    |
|---------------------------|------------|------------------------------------------------|
| `DDG_SAFE_SEARCH`         | `moderate` | Default SafeSearch mode (strict/moderate/off)  |
| `DDG_REGION`              | *(none)*   | Default region code (e.g. `br-pt`)             |
| `DDG_ALLOW_PRIVATE_URLS`  | off        | Set `1` to allow fetching private/internal URLs |

## Notes

- Keep it under ~30 searches per minute; DuckDuckGo rate-limits abusive clients. If a search returns a block message, wait a few minutes and retry.
- `content.js` refuses URLs that resolve to loopback/private/link-local/metadata addresses (SSRF guard, covering IPv4, IPv6, and alternate IP notations) and re-validates every redirect hop.

## License

[MIT](LICENSE)
