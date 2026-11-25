import { describe, expect, it } from "vitest";

import { extractXmlPrefixes, rdfXmlToTurtle } from "$lib/utils/rdfxml";

const DOC = `<?xml version="1.0"?>
<!-- xmlns:fake="http://fake.example/" -->
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://example.org/">
  <![CDATA[ xmlns:cdata="http://cdata.example/" ]]>
  <rdf:Description rdf:about="http://example.org/a"><rdf:type rdf:resource="http://example.org/B"/></rdf:Description>
</rdf:RDF>`;

describe("extractXmlPrefixes", () => {
	it("reads declared prefixes and the default namespace", () => {
		const p = extractXmlPrefixes(DOC);
		expect(p.rdf).toBe("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
		expect(p[""]).toBe("http://example.org/");
	});

	it("ignores xmlns text in comments and CDATA", () => {
		const p = extractXmlPrefixes(DOC);
		expect(p).not.toHaveProperty("fake");
		expect(p).not.toHaveProperty("cdata");
	});
});

describe("rdfXmlToTurtle", () => {
	it("converts RDF/XML to Turtle", async () => {
		const ttl = await rdfXmlToTurtle(DOC, "http://example.org/");
		expect(ttl).toMatch(/:a a :B/);
		expect(ttl).not.toContain("fake");
	});
});
