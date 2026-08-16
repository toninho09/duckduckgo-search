#!/usr/bin/env node
// DuckDuckGo web search via the html.duckduckgo.com/html endpoint.
// JS port of the search tool from duckduckgo-mcp-server.

import { execFile } from "node:child_process";
import { decodeEntities, stripTags } from "./lib.js";

const BASE_URL = "https://html.duckduckgo.com/html";
const HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
	Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
	"Accept-Language": "en-US,en;q=0.9",
	"Sec-Fetch-Dest": "document",
	"Sec-Fetch-Mode": "navigate",
	"Sec-Fetch-Site": "none",
	"Sec-Fetch-User": "?1",
	"Upgrade-Insecure-Requests": "1",
};

// kp values used by DuckDuckGo's SafeSearch
const SAFE_SEARCH = { strict: "1", moderate: "-1", off: "-2" };

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

let maxResults = parseInt(takeValue("-n") ?? takeValue("--max") ?? "", 10) || 10;
const region = takeValue("--region") ?? process.env.DDG_REGION ?? "";
const safeName = (takeValue("--safe") ?? process.env.DDG_SAFE_SEARCH ?? "moderate").toLowerCase();

const query = args.filter((a) => a !== "--").join(" ").trim();

if (!query) {
	console.log(`Usage: search.js <query> [-n <num>] [--region <code>] [--safe <mode>]

Options:
  -n, --max <num>    Maximum results (default: 10)
  --region <code>    Region/language code, e.g. us-en, br-pt, jp-ja (default: none / DDG_REGION)
  --safe <mode>      SafeSearch: strict, moderate (default), off (default: DDG_SAFE_SEARCH)

Examples:
  ./scripts/search.js "rust async programming"
  ./scripts/search.js "brazilian elections" --region br-pt -n 5
  ./scripts/search.js "explicit query" --safe off`);
	process.exit(1);
}

const kp = SAFE_SEARCH[safeName] ?? SAFE_SEARCH.moderate;

// --- Fetch: native fetch first, system curl as fallback for TLS-fingerprint blocks ---

function isBlock(status, html) {
	// DDG serves 202 with an empty results page to clients whose TLS
	// fingerprint it doesn't like; 403 is the classic block signal.
	return status === 202 || status === 403 || (status === 200 && !(html || "").trim());
}

function curlPost(url, data) {
	return new Promise((resolve, reject) => {
		const cliArgs = ["-s", "--max-time", "30", "-X", "POST", url];
		for (const [k, v] of Object.entries(data)) cliArgs.push("--data-urlencode", `${k}=${v}`);
		for (const [k, v] of Object.entries(HEADERS)) cliArgs.push("-H", `${k}: ${v}`);
		execFile("curl", cliArgs, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) =>
			err ? reject(err) : resolve(stdout)
		);
	});
}

async function request(data) {
	const response = await fetch(BASE_URL, {
		method: "POST",
		headers: HEADERS,
		body: new URLSearchParams(data),
		signal: AbortSignal.timeout(30000),
	});
	const html = await response.text();
	if (isBlock(response.status, html)) {
		// Retry once with the system curl (different TLS stack).
		return curlPost(BASE_URL, data);
	}
	if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
	return html;
}

// --- Parse results (same selectors/logic as the MCP server) ---

function parseResults(html, limit) {
	const results = [];
	// Each result container is a `<div class="result ...">`; class values like
	// "result__body" or "results" don't match, so the split yields one chunk per result.
	for (const chunk of html.split(/<div class="result\s/).slice(1)) {
		if (results.length >= limit) break;

		const anchor = chunk.match(/<a\b[^>]*result__a[^>]*>[\s\S]*?<\/a>/);
		if (!anchor) continue;
		const href = anchor[0].match(/\shref="([^"]*)"/);
		if (!href) continue;

		let link = decodeEntities(href[1]);
		if (link.includes("y.js")) continue; // skip ads
		// Clean up DuckDuckGo redirect URLs
		if (link.startsWith("//duckduckgo.com/l/?uddg=")) {
			link = decodeURIComponent(link.split("uddg=")[1].split("&")[0]);
		}

		const snippetMatch = chunk.match(/<a\b[^>]*result__snippet[^>]*>[\s\S]*?<\/a>/);

		results.push({
			position: results.length + 1,
			title: decodeEntities(stripTags(anchor[0])).replace(/\s+/g, " ").trim(),
			link,
			snippet: snippetMatch
				? decodeEntities(stripTags(snippetMatch[0])).replace(/\s+/g, " ").trim()
				: "",
		});
	}
	return results;
}

try {
	const html = await request({ q: query, b: "", kl: region, kp });
	const results = parseResults(html, maxResults);

	if (!results.length) {
		if (/anomaly-modal/.test(html)) {
			console.error(
				"DuckDuckGo is rate-limiting this client (anomaly/bot-detection page). Wait a few minutes before searching again."
			);
		} else {
			console.error("No results were found. Try rephrasing the search.");
		}
		process.exit(1);
	}

	const out = [`Found ${results.length} search results:\n`];
	for (const r of results) {
		out.push(`${r.position}. ${r.title}`);
		out.push(`   URL: ${r.link}`);
		out.push(`   Summary: ${r.snippet}`);
		out.push("");
	}
	console.log(out.join("\n"));
} catch (err) {
	console.error(`Error: search failed for "${query}" (${err.message})`);
	process.exit(1);
}
