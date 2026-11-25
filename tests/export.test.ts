import { describe, expect, it, vi } from "vitest";

import type { Node } from "$lib/types/graph";
import { exportSvg } from "$lib/utils/export";

vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn() } }));

describe("exportSvg", () => {
	it("does not overflow the stack on very large graphs", () => {
		const nodes = Array.from({ length: 300_000 }, (_, i) => ({ x: i, y: i, width: 10, height: 10 })) as Node[];
		const svgEl = {
			cloneNode: () => ({ querySelectorAll: () => [], setAttribute: () => {} }),
			querySelectorAll: () => []
		};
		const classList = { contains: () => false, add: () => {}, remove: () => {} };
		vi.stubGlobal("document", { documentElement: { classList } });
		vi.stubGlobal(
			"XMLSerializer",
			class {
				serializeToString() {
					return "<svg/>";
				}
			}
		);
		vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
		(document as unknown as Record<string, unknown>).createElement = () => ({ click: () => {} });
		(document as unknown as Record<string, unknown>).body = { appendChild: () => {}, removeChild: () => {} };

		expect(() => exportSvg(svgEl as unknown as SVGSVGElement, nodes, { x: 0, y: 0, k: 1 })).not.toThrow();
	});
});
