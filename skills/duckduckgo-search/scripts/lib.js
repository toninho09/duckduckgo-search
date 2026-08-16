// Shared dependency-free HTML helpers.

const NAMED_ENTITIES = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	bull: "\u2022",
	hellip: "\u2026",
	copy: "\u00a9",
	reg: "\u00ae",
	trade: "\u2122",
	euro: "\u20ac",
	pound: "\u00a3",
	yen: "\u00a5",
	cent: "\u00a2",
	deg: "\u00b0",
	middot: "\u00b7",
	times: "\u00d7",
	minus: "\u2212",
	mdash: "\u2014",
	ndash: "\u2013",
	rsquo: "\u2019",
	lsquo: "\u2018",
	ldquo: "\u201c",
	rdquo: "\u201d",
	laquo: "\u00ab",
	raquo: "\u00bb",
};

/** Decode the common named entities plus numeric (decimal/hex) entities. */
export function decodeEntities(str) {
	return str.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity) => {
		if (entity[0] === "#") {
			const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
			return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
		}
		return NAMED_ENTITIES[entity] ?? match;
	});
}

/** Remove all HTML tags, replacing them with a space.
 * Quote-aware: `>` inside quoted attribute values (e.g. JSON in data-mw) doesn't
 * terminate the tag, so hidden metadata blocks don't leak into the text. */
export function stripTags(str) {
	return str.replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, " ");
}
