#!/usr/bin/env node
// Fetch a webpage and extract its text content, with an SSRF guard and pagination.
// JS port of the fetch_content tool from duckduckgo-mcp-server.

import * as dns from "node:dns/promises";
import { BlockList } from "node:net";
import { decodeEntities, stripTags } from "./lib.js";

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOW_PRIVATE = ["1", "true", "yes", "on"].includes(
	(process.env.DDG_ALLOW_PRIVATE_URLS ?? "").trim().toLowerCase()
);

// --- CLI args ---
const args = process.argv.slice(2);

function takeValue(flag) {
	const i = args.indexOf(flag);
	if (i === -1) return undefined;
	const next = i + 1 < args.length ? args[i + 1] : undefined;
	const value = next !== undefined && !next.startsWith("-") ? next : undefined;
	args.splice(i, value !== undefined ? 2 : 1);
	return value;
}

const url = args.find((a) => !a.startsWith("-"));
const startIndex = parseInt(takeValue("--start") ?? "0", 10) || 0;
const maxLength = parseInt(takeValue("--max") ?? "8000", 10) || 8000;

if (!url) {
	console.log(`Usage: content.js <url> [--start <offset>] [--max <chars>]

Options:
  --start <offset>   Character offset for pagination (default: 0)
  --max <chars>      Max characters to return (default: 8000)

Environment:
  DDG_ALLOW_PRIVATE_URLS=1   Allow fetching private/internal URLs (SSRF guard off)

Examples:
  ./scripts/content.js https://example.com/article
  ./scripts/content.js https://example.com/long-post --start 8000`);
	process.exit(1);
}

// --- SSRF guard: only public http(s) targets, validated on every redirect hop ---

const blocklist = new BlockList();
for (const [subnet, bits] of [
	["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
	["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.2.0", 24], ["192.168.0.0", 16],
	["198.18.0.0", 15], ["224.0.0.0", 3],
]) blocklist.addSubnet(subnet, bits, "ipv4");
for (const [subnet, bits] of [
	["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
]) blocklist.addSubnet(subnet, bits, "ipv6");

function isBlockedAddress(addr) {
	addr = addr.toLowerCase();
	// Unwrap IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) before classifying.
	const mapped = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
	const plain = mapped ? mapped[1] : addr;
	// BlockList.check defaults to ipv4 and silently returns false for IPv6 addresses.
	return blocklist.check(plain, plain.includes(":") ? "ipv6" : "ipv4");
}

async function validatePublicUrl(target) {
	const parsed = new URL(target);
	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new Error(`unsupported URL scheme '${parsed.protocol}' (only http and https are allowed)`);
	}
	// URL#hostname keeps the brackets on IPv6 literals ("[::1]"), which dns.lookup can't resolve.
	const host = parsed.hostname.toLowerCase().replace(/^\[(.+)\]$/, "$1");
	if (host === "localhost" || host.endsWith(".localhost")) {
		throw new Error(`refusing to fetch loopback host '${host}'`);
	}
	let addresses;
	try {
		addresses = await dns.lookup(host, { all: true });
	} catch (err) {
		throw new Error(`could not resolve host '${host}': ${err.code ?? err.message}`);
	}
	for (const { address } of addresses) {
		if (isBlockedAddress(address)) {
			throw new Error(`refusing to fetch '${host}' — it resolves to non-public address ${address}`);
		}
	}
}

// --- Fetch with manual redirects so the SSRF guard runs on each hop ---

async function fetchPage(target) {
	let current = target;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (!ALLOW_PRIVATE) await validatePublicUrl(current);
		let response;
		try {
			response = await fetch(current, {
				redirect: "manual",
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en-US,en;q=0.9",
				},
				signal: AbortSignal.timeout(30000),
			});
		} catch (err) {
			if (err.name === "TimeoutError" || /timeout/i.test(err.message)) {
				throw new Error(`request timed out for ${current}`);
			}
			const cause = err.cause?.message ? `: ${err.cause.message}` : "";
			throw new Error(`could not fetch ${current} (${err.message}${cause})`);
		}
		const location = response.headers.get("location");
		if (REDIRECT_STATUSES.has(response.status) && location) {
			current = new URL(location, current).href;
			continue;
		}
		if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
		const contentType = response.headers.get("content-type") ?? "";
		const buf = Buffer.from(await response.arrayBuffer());
		return { body: decodeBody(buf, contentType, true), contentType };
	}
	throw new Error(`too many redirects (>${MAX_REDIRECTS})`);
}

// --- HTML to clean text (same element removal as the MCP server) ---

/** Decode a response buffer using the charset from the Content-Type header, falling
 * back to sniffing <meta charset> in the first 2 KB of HTML, then to UTF-8. */
function decodeBody(buf, contentType, sniffHtml) {
	const headerCharset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
	let charset = headerCharset;
	if (!charset && sniffHtml) {
		const head = buf.subarray(0, 2048).toString("latin1");
		// Matches both <meta charset="..."> and
		// <meta http-equiv="Content-Type" content="...; charset=...">
		charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
	}
	try {
		return new TextDecoder(charset ?? "utf-8").decode(buf);
	} catch {
		return buf.toString("utf-8"); // unknown charset label
	}
}

/** Classify a response body by its MIME type: "html" (parse), "text" (raw), or "binary" (refuse). */
function classifyContentType(raw) {
	const mime = raw.split(";")[0].trim().toLowerCase();
	if (!mime || mime === "text/html" || mime === "application/xhtml+xml") return "html";
	if (
		mime.startsWith("text/") ||
		mime === "application/json" ||
		mime === "application/xml" ||
		mime.endsWith("+json") ||
		mime.endsWith("+xml")
	) {
		return "text";
	}
	return "binary";
}

function extractText(html) {
	const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	const title = decodeEntities(stripTags(titleMatch?.[1] ?? "")).replace(/\s+/g, " ").trim();
	const body = html
		// Drop script/style/nav/header/footer blocks entirely (nested tags in these
		// blocks are dropped too, which only discards navigation/boilerplate).
		.replace(/<(script|style|noscript|nav|header|footer|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
		.replace(/<!--[\s\S]*?-->/g, " ");
	const text = decodeEntities(stripTags(body)).replace(/\s+/g, " ").trim();
	return { title, text };
}

try {
	new URL(url);
} catch {
	console.error(`Error: invalid URL '${url}' — include the scheme, e.g. https://${url}`);
	process.exit(1);
}

try {
	const { body, contentType } = await fetchPage(url);
	const kind = classifyContentType(contentType);
	if (kind === "binary") {
		throw new Error(
			`unsupported content type '${contentType.split(";")[0].trim()}' (only HTML, plain text, JSON and XML can be extracted)`
		);
	}
	const { title, text } =
		kind === "html" ? extractText(body) : { title: "", text: body.replace(/\s+/g, " ").trim() };
	const total = text.length;
	let chunk = text.slice(startIndex, startIndex + maxLength);
	const truncated = startIndex + maxLength < total;

	if (title) console.log(`Title: ${title}\n`);
	console.log(chunk);
	let footer = `\n---\n[Content info: Showing characters ${startIndex}-${startIndex + chunk.length} of ${total} total`;
	if (truncated) footer += `. Use --start ${startIndex + maxLength} to see more`;
	console.log(footer + "]");
} catch (err) {
	console.error(`Error: ${err.message}`);
	if (!ALLOW_PRIVATE && /refusing to fetch|loopback|non-public/.test(err.message)) {
		console.error(
			"This script blocks requests to private/internal addresses to prevent SSRF. For trusted local use, set DDG_ALLOW_PRIVATE_URLS=1."
		);
	}
	process.exit(1);
}
