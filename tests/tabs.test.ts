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
