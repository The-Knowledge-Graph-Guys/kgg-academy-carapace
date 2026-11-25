import type { Quad, Token } from "n3";
import { toast } from "svelte-sonner";

import { SAMPLE_TURTLE } from "$lib/constants/sample";
import { createLogger } from "$lib/logger";
import type { GraphSettings, Tab } from "$lib/types/tabs";
import type { LineMapping } from "$lib/utils/lines";
import { computeLineMapping } from "$lib/utils/lines";
import { defaultGraphSettings } from "$lib/utils/settings";
import { parseTurtle } from "$lib/utils/turtle";

const logger = createLogger("TabsStore");

const STORAGE_TABS_KEY = "carapace_tabs";
// Legacy: the active tab used to be stored under its own key as well as inside STORAGE_TABS_KEY.
const LEGACY_ACTIVE_TAB_KEY = "carapace_activeTabId";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const stringArray = (v: unknown, fallback: string[]): string[] =>
	Array.isArray(v) && v.every((x) => typeof x === "string") ? [...v] : [...fallback];

function normalizeSettings(raw: unknown): GraphSettings {
	const d = defaultGraphSettings();
	if (!isRecord(raw)) return d;
	return {
		duplicateExternalNodes:
			typeof raw.duplicateExternalNodes === "boolean" ? raw.duplicateExternalNodes : d.duplicateExternalNodes,
		hiddenNamespaces: stringArray(raw.hiddenNamespaces, d.hiddenNamespaces),
		hiddenEntityTypes: stringArray(
			raw.hiddenEntityTypes,
			d.hiddenEntityTypes
		) as GraphSettings["hiddenEntityTypes"],
		hiddenPredicateUris: stringArray(raw.hiddenPredicateUris, d.hiddenPredicateUris),
		hiddenInstanceOfUris: stringArray(raw.hiddenInstanceOfUris, d.hiddenInstanceOfUris),
		nodeNamePredicate: typeof raw.nodeNamePredicate === "string" ? raw.nodeNamePredicate : d.nodeNamePredicate
	};
}

/**
 * Turns an untrusted object (localStorage or an imported file) into a Tab, filling in defaults and
 * migrating the legacy `graphState` shape. Returns null when there is no usable Turtle content.
 * Parsed state is never taken from the input: it is rebuilt from `ttlContent`.
 */
function normalizeTab(raw: unknown): Tab | null {
	if (!isRecord(raw) || typeof raw.ttlContent !== "string") return null;

	const legacy = isRecord(raw.graphState) && !raw.settings ? raw.graphState : null;
	const settings = legacy
		? normalizeSettings({ duplicateExternalNodes: legacy.duplicateExternalNodes, nodeNamePredicate: "" })
		: normalizeSettings(raw.settings);
	const nodePositions = legacy?.nodePositions ?? raw.nodePositions;

	const tab: Tab = {
		id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
		name: typeof raw.name === "string" && raw.name ? raw.name : "Untitled",
		ttlContent: raw.ttlContent,
		settings,
		locked:
			typeof (legacy?.locked ?? raw.locked) === "boolean" ? ((legacy?.locked ?? raw.locked) as boolean) : false
	};
	if (Array.isArray(nodePositions)) tab.nodePositions = nodePositions as Tab["nodePositions"];
	if (isRecord(raw.camera)) tab.camera = raw.camera as Tab["camera"];
	if (typeof raw.editorCursorLine === "number") tab.editorCursorLine = raw.editorCursorLine;
	return tab;
}

class TabsStore {
	tabs = $state<Tab[]>([]);
	activeTabId = $state<string>("");
	activeTriples = $state<Quad[] | null>(null);
	activePrefixMap = $state<Record<string, string>>({});
	activeError = $state<string>("");

	graphReloadCount = $state(0);
	graphLoading = $state(false);
	activeNodeCount = $state(0);
	activeEdgeCount = $state(0);

	exportGraph = $state<((format: "svg" | "png" | "jpg") => void) | null>(null);

	activeLineMapping = $state<LineMapping | null>(null);
	editorCursorLine = $state(1);
	selectedNodeUri = $state<string | null>(null);

	private saveTimeout: ReturnType<typeof setTimeout> | null = null;
	private parseTimeout: ReturnType<typeof setTimeout> | null = null;

	getActiveTab(): Tab | undefined {
		return this.tabs.find((t) => t.id === this.activeTabId);
	}

	getTab(id: string): Tab | undefined {
		return this.tabs.find((t) => t.id === id);
	}

	addTab(name?: string, content?: string) {
		const ttlContent = content || SAMPLE_TURTLE;

		const newTab: Tab = {
			id: crypto.randomUUID(),
			name: name || `File ${this.tabs.length + 1}`,
			ttlContent,
			parsedTriples: undefined,
			parsedPrefixMap: {},
			settings: defaultGraphSettings(),
			locked: false
		};

		this.tabs.push(newTab);
		this.activeTabId = newTab.id;
		this.activeTriples = null;
		this.activePrefixMap = {};
		this.activeLineMapping = null;
		this.activeError = "";
		this.graphLoading = true;
		logger.debug("Tab Added", { id: newTab.id, name: newTab.name });

		this.scheduleSave();
		this.doParse();
	}

	switchTab(id: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (!tab) {
			logger.warn("Tab Switch - Not Found", { id: id });
			return;
		}

		this.activeTabId = id;
		if (!tab.parsedTriples) {
			this.doParse();
		} else {
			this.activeTriples = tab.parsedTriples ?? null;
			this.activePrefixMap = tab.parsedPrefixMap ?? {};
			this.activeError = "";
			this.refreshLineMapping();
		}

		logger.debug("Tab Switched", { id: tab.id, name: tab.name });

		this.scheduleSave();
	}

	closeTab(id: string) {
		const index = this.tabs.findIndex((t) => t.id === id);
		if (index === -1) {
			logger.warn("Tab Close - Not Found", { id: id });
			return;
		}

		if (this.tabs.length === 1) {
			toast.error("Cannot close last tab");
			logger.warn("Tab Close - Cannot Close Last Tab");
			return;
		}

		const tabName = this.tabs[index].name;
		this.tabs.splice(index, 1);
		logger.debug("Tab Closed", { id: id, name: tabName });

		if (this.activeTabId === id) {
			const newIndex = Math.min(index, this.tabs.length - 1);
			const newTab = this.tabs[newIndex];

			this.activeTabId = newTab.id;
			if (!newTab.parsedTriples) {
				this.doParse();
			} else {
				this.activeTriples = newTab.parsedTriples ?? null;
				this.activePrefixMap = newTab.parsedPrefixMap ?? {};
				this.activeError = "";
				this.refreshLineMapping();
			}
			logger.debug("Tab Switched", { id: newTab.id, name: newTab.name });
		}

		this.scheduleSave();
	}

	moveTab(id: string, toIndex: number) {
		const fromIndex = this.tabs.findIndex((t) => t.id === id);
		if (fromIndex === -1 || fromIndex === toIndex) return;

		const [tab] = this.tabs.splice(fromIndex, 1);
		this.tabs.splice(toIndex, 0, tab);
		logger.debug("Tab Move", { id: tab.id, name: tab.name, oldIndex: fromIndex, newIndex: toIndex });

		this.scheduleSave();
	}

	renameTab(id: string, newName: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (!tab) {
			logger.warn("Tab Rename - Not Found", { id: id });
			return;
		}

		const oldName = tab.name;
		tab.name = newName;
		logger.debug("Tab Renamed", { id: id, oldName: oldName, newName: newName });

		this.scheduleSave();
	}

	duplicateTab(id: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (!tab) {
			logger.warn("Tab Duplicate - Not Found", { id: id });
			return;
		}

		// Deep copy plain data so the copy never shares settings/positions with the original.
		// Parsed state is dropped and rebuilt from the content by doParse().
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { parsedTriples, parsedPrefixMap, lineMapping, ...rest } = tab;
		const newTab: Tab = {
			...$state.snapshot(rest),
			id: crypto.randomUUID(),
			name: `${tab.name} copy`
		};

		this.tabs.push(newTab);
		this.activeTabId = newTab.id;
		this.activeTriples = null;
		this.activePrefixMap = {};
		this.activeLineMapping = null;
		this.activeError = "";
		this.graphLoading = true;
		this.doParse();
		logger.debug("Tab Duplicated", { id: id, oldName: tab.name, newName: newTab.name });

		this.scheduleSave();
		return newTab.id;
	}

	updateActiveTabContent(content: string) {
		const tab = this.getActiveTab();
		if (!tab) return;

		tab.ttlContent = content;

		this.scheduleParse();
		this.scheduleSave();
	}

	private scheduleParse() {
		if (this.parseTimeout) {
			clearTimeout(this.parseTimeout);
		}

		this.parseTimeout = setTimeout(() => {
			this.doParse();
		}, 500);
	}

	private doParse() {
		const tab = this.getActiveTab();
		if (!tab) return;

		const result = parseTurtle(tab.ttlContent);

		this.activeError = result.parseError;
		if (result.parseError && tab.parsedTriples) return;

		tab.parsedTriples = result.triples;
		this.activeTriples = result.triples;
		tab.parsedPrefixMap = result.prefixMap;
		this.activePrefixMap = result.prefixMap;

		tab.lineMapping = result.lineMapping;
		this.refreshLineMapping(result.tokens);
	}

	private refreshLineMapping(tokens?: Token[]) {
		const tab = this.getActiveTab();
		if (!tab || !tab.parsedTriples || tab.parsedTriples.length === 0) {
			this.activeLineMapping = null;
			return;
		}

		// migration: restores for older imported tabs
		if (!(tab.lineMapping?.uriToLine instanceof Map) || !(tab.lineMapping?.lineToUris instanceof Map)) {
			const result = parseTurtle(tab.ttlContent);
			tab.lineMapping = result.lineMapping;
			tokens = result.tokens;
		}

		try {
			this.activeLineMapping = computeLineMapping(
				tab.ttlContent,
				tab.parsedPrefixMap ?? {},
				tab.lineMapping,
				tokens
			);
		} catch {
			this.activeLineMapping = null;
		}
	}

	updateActiveTabSettings(newSettings: Partial<GraphSettings>) {
		const tab = this.getActiveTab();
		if (!tab) return;

		tab.settings = { ...tab.settings, ...newSettings };
		this.scheduleSave();
	}

	setActiveTabLocked(locked: boolean) {
		const tab = this.getActiveTab();
		if (!tab) return;

		tab.locked = locked;
		this.scheduleSave();
	}

	loadFromStorage() {
		try {
			const stored = localStorage.getItem(STORAGE_TABS_KEY);
			if (!stored) return;

			const data = JSON.parse(stored);
			if (!isRecord(data) || !Array.isArray(data.tabs)) return;

			this.tabs = data.tabs.map(normalizeTab).filter((t): t is Tab => t !== null);

			// The legacy key was written synchronously on every switch, so it is the more recent of the two.
			const legacyActive = localStorage.getItem(LEGACY_ACTIVE_TAB_KEY);
			const candidates: unknown[] = [legacyActive, data.activeTabId];
			const active = candidates.find((id) => this.tabs.some((t) => t.id === id));
			this.activeTabId = typeof active === "string" ? active : (this.tabs[0]?.id ?? "");
			if (legacyActive !== null) localStorage.removeItem(LEGACY_ACTIVE_TAB_KEY);

			if (this.getActiveTab()) this.doParse();
			logger.info(`Tabs Loaded from Storage - ${this.tabs.length} Tabs`);
		} catch (error) {
			logger.error("Tabs Load from Storage:", error);
		}
	}

	saveToStorage() {
		const data = {
			tabs: this.tabs.map((tab) => {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { parsedTriples, lineMapping, ...rest } = tab;
				return rest;
			}),
			activeTabId: this.activeTabId
		};

		try {
			localStorage.setItem(STORAGE_TABS_KEY, JSON.stringify(data));
			logger.debug("Tabs Saved to Storage");
		} catch (error) {
			logger.error("Tabs Save to Storage:", error);
			toast.error("Failed to save tabs to local storage");
		}
	}

	scheduleSave() {
		if (typeof window === "undefined") return;

		if (this.saveTimeout) clearTimeout(this.saveTimeout);
		this.saveTimeout = setTimeout(() => {
			this.saveToStorage();
		}, 500);
	}

	flushSave() {
		if (typeof window === "undefined") return;

		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
		this.saveToStorage();
	}

	toJson(): { tabs: Tab[] } {
		const tab = this.getActiveTab();
		if (!tab) return { tabs: [] };

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { parsedTriples, lineMapping, ...rest } = tab;
		return { tabs: [rest as Tab] };
	}

	loadJson(json: string) {
		const data = JSON.parse(json);
		if (!isRecord(data) || !Array.isArray(data.tabs)) throw new Error("Invalid JSON: expected { tabs: [...] }");

		const importedTabs: Tab[] = data.tabs
			.map(normalizeTab)
			.filter((t: Tab | null): t is Tab => t !== null)
			.map((tab: Tab) => ({ ...tab, id: crypto.randomUUID(), locked: true }));
		if (importedTabs.length === 0) throw new Error("Invalid JSON: no tabs with Turtle content");

		this.tabs = [...this.tabs, ...importedTabs];
		this.activeTabId = importedTabs[0].id;
		this.activeTriples = null;
		this.activePrefixMap = {};
		this.activeLineMapping = null;
		this.activeError = "";
		this.graphLoading = true;

		this.doParse();
		this.scheduleSave();
	}
}

export const tabsStore = new TabsStore();
