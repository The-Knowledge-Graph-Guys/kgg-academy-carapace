import { beforeEach, describe, expect, it, vi } from "vitest";

import { tabsStore } from "$lib/stores/tabs.svelte";

function stubLocalStorage() {
	const data = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
		removeItem: (k: string) => void data.delete(k)
	});
	return data;
}

function reset() {
	tabsStore.tabs = [];
	tabsStore.activeTabId = "";
	tabsStore.activeTriples = null;
	tabsStore.activePrefixMap = {};
	tabsStore.activeError = "";
}

const TTL = "@prefix ex: <http://example.org/> .\nex:a ex:b ex:c .\n";

describe("duplicateTab", () => {
	beforeEach(() => {
		stubLocalStorage();
		reset();
	});

	it("copies settings and positions instead of sharing them", () => {
		tabsStore.addTab("One", TTL);
		const original = tabsStore.getActiveTab()!;
		original.nodePositions = [{ id: "n1", x: 1, y: 2 }];

		const copyId = tabsStore.duplicateTab(original.id)!;
		const copy = tabsStore.getTab(copyId)!;

		expect(copy.id).not.toBe(original.id);
		expect(copy.name).toBe("One copy");
		expect(copy.settings).toEqual(original.settings);
		expect(copy.settings).not.toBe(original.settings);
		expect(copy.settings.hiddenNamespaces).not.toBe(original.settings.hiddenNamespaces);
		expect(copy.nodePositions).toEqual(original.nodePositions);
		expect(copy.nodePositions).not.toBe(original.nodePositions);
	});

	it("parses the copy and makes it the active graph", () => {
		tabsStore.addTab("One", TTL);
		const copyId = tabsStore.duplicateTab(tabsStore.activeTabId)!;

		expect(tabsStore.activeTabId).toBe(copyId);
		expect(tabsStore.activeTriples?.length).toBe(1);
		expect(tabsStore.activePrefixMap["http://example.org/"]).toBe("ex");
	});

	it("does not leak a change on the copy back to the original", () => {
		tabsStore.addTab("One", TTL);
		const original = tabsStore.getActiveTab()!;
		const copyId = tabsStore.duplicateTab(original.id)!;

		tabsStore.updateActiveTabSettings({ hiddenPredicateUris: ["http://example.org/b"] });
		tabsStore.getTab(copyId)!.settings.hiddenNamespaces.push("http://x/");

		expect(original.settings.hiddenPredicateUris).toEqual([]);
		expect(original.settings.hiddenNamespaces).not.toContain("http://x/");
	});
});

describe("loadJson", () => {
	beforeEach(() => {
		stubLocalStorage();
		reset();
	});

	it("rejects input that is not { tabs: [...] }", () => {
		expect(() => tabsStore.loadJson("{}")).toThrow();
		expect(() => tabsStore.loadJson("[]")).toThrow();
		expect(() => tabsStore.loadJson("not json")).toThrow();
	});

	it("rejects a file with no tab that has Turtle content", () => {
		expect(() => tabsStore.loadJson(JSON.stringify({ tabs: [{ name: "x" }, null, 3] }))).toThrow(/no tabs/);
		expect(tabsStore.tabs).toHaveLength(0);
	});

	it("fills in defaults for tabs that lack settings, name or id", () => {
		tabsStore.loadJson(JSON.stringify({ tabs: [{ ttlContent: TTL }] }));

		const tab = tabsStore.getActiveTab()!;
		expect(tab.name).toBe("Untitled");
		expect(tab.id).toBeTruthy();
		expect(tab.settings.hiddenNamespaces.length).toBeGreaterThan(0);
		expect(tab.locked).toBe(true);
		expect(tabsStore.activeTriples?.length).toBe(1);
	});

	it("skips invalid tabs but keeps the valid ones", () => {
		tabsStore.loadJson(JSON.stringify({ tabs: [{ ttlContent: 5 }, { name: "ok", ttlContent: TTL }] }));
		expect(tabsStore.tabs.map((t) => t.name)).toEqual(["ok"]);
	});

	it("repairs malformed settings fields", () => {
		const bad = { ttlContent: TTL, settings: { hiddenNamespaces: "nope", duplicateExternalNodes: 1 } };
		tabsStore.loadJson(JSON.stringify({ tabs: [bad] }));

		const { settings } = tabsStore.getActiveTab()!;
		expect(Array.isArray(settings.hiddenNamespaces)).toBe(true);
		expect(settings.duplicateExternalNodes).toBe(false);
	});

	it("round-trips an exported tab", () => {
		tabsStore.addTab("One", TTL);
		tabsStore.updateActiveTabSettings({ hiddenPredicateUris: ["http://example.org/b"] });
		const exported = JSON.stringify(tabsStore.toJson());

		tabsStore.loadJson(exported);

		expect(tabsStore.tabs).toHaveLength(2);
		const imported = tabsStore.getActiveTab()!;
		expect(imported.id).not.toBe(tabsStore.tabs[0].id);
		expect(imported.settings.hiddenPredicateUris).toEqual(["http://example.org/b"]);
	});
});

describe("storage", () => {
	let data: Map<string, string>;
	beforeEach(() => {
		data = stubLocalStorage();
		reset();
	});

	it("saves and reloads the active tab from a single key", () => {
		tabsStore.addTab("A", TTL);
		tabsStore.addTab("B", TTL);
		const bId = tabsStore.activeTabId;
		tabsStore.switchTab(tabsStore.tabs[0].id);
		tabsStore.saveToStorage();

		expect(data.has("carapace_activeTabId")).toBe(false);

		reset();
		tabsStore.loadFromStorage();
		expect(tabsStore.tabs.map((t) => t.name)).toEqual(["A", "B"]);
		expect(tabsStore.activeTabId).toBe(tabsStore.tabs[0].id);
		expect(tabsStore.activeTabId).not.toBe(bId);
	});

	it("migrates the legacy separate active-tab key and removes it", () => {
		const tabs = [
			{ id: "t1", name: "One", ttlContent: TTL },
			{ id: "t2", name: "Two", ttlContent: TTL }
		];
		data.set("carapace_tabs", JSON.stringify({ tabs, activeTabId: "t1" }));
		data.set("carapace_activeTabId", "t2");

		tabsStore.loadFromStorage();

		expect(tabsStore.activeTabId).toBe("t2");
		expect(data.has("carapace_activeTabId")).toBe(false);
	});

	it("migrates the legacy graphState shape", () => {
		const legacy = {
			id: "t1",
			name: "Old",
			ttlContent: TTL,
			graphState: { locked: true, duplicateExternalNodes: true, nodePositions: [{ id: "n", x: 1, y: 2 }] }
		};
		data.set("carapace_tabs", JSON.stringify({ tabs: [legacy] }));

		tabsStore.loadFromStorage();

		const tab = tabsStore.getActiveTab()!;
		expect(tab.locked).toBe(true);
		expect(tab.settings.duplicateExternalNodes).toBe(true);
		expect(tab.nodePositions).toEqual([{ id: "n", x: 1, y: 2 }]);
		expect("graphState" in tab).toBe(false);
	});

	it("falls back to the first tab when the saved active id is unknown", () => {
		data.set(
			"carapace_tabs",
			JSON.stringify({ tabs: [{ id: "t1", name: "One", ttlContent: TTL }], activeTabId: "gone" })
		);
		tabsStore.loadFromStorage();
		expect(tabsStore.activeTabId).toBe("t1");
	});
});
