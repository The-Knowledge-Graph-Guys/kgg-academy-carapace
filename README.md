<h1 align="center">
  <a href="https://carapace.space"><img src="./static/favicon.svg" alt="Carapace" width="200"></a>
  <br>
  KGG Academy Carapace
  <br>
</h1>

<p align="center"><strong>Turtle (TTL) ontology editor and graph visualiser, for the KGG Academy.</strong></p>

**Carapace** is a text-first TTL graph visualiser. Easily import, export, navigate and edit TTL-based graphs through a native code editor, with live updates reflecting in the visualisation. Force graph computations are used to automatically spread out nodes, which can be manually arranged to your liking. The visualiser recognises [OWL (Web Ontology Language)](https://www.w3.org/OWL/) entity types, and also provides custom rendering for various concepts to improve readability.

<p align="center">
  <img src="docs/screenshots/sample.png" width="90%" />
</p>
<p align="center">
    <img src="docs/screenshots/sample-lists.png" width="90%" />
</p>

## Features

- **Live Visualisation Updates:** Code editor updates the associated nodes in the graph as changes are made.
- **Syntax Highlighting:** Turtle file syntax highlighting supported by Codemirror.
- **Multiple Files:** Easily switch between multiple TTL files with independent graph settings.
- **Graph Controls:** Pan, zoom and scroll within the graph visualisation. Drag nodes to manually rearrange. Box select or ctrl/cmd + click to move multiple nodes at once. Lock node positions to maintain a manually arranged layout.
- **Fine-Grained Visualiser Settings:** Toggle visibility of nodes by entity types, and blacklist namespaces, predicates, or instances of types.
- **Search and Node-Line Mappings:** Searchbars in both the graph and editor. Buttons on the separator allow for line-to-node and node-to-line jumps based on selected cursor line or selected node.
- **Export as SVG:** Export to a high-quality visualisation that fits to the graph's bounding box.
- **Export/ Import State:** Export and import the state of TTL, graph and settings together to pick up exactly where you left off.
- **Light/ Dark Mode:** Good looking light and dark modes.

## Getting Started

Requires [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io) (`corepack enable` provides it). Use pnpm, not npm: `npm install` currently fails on this project.

```sh
pnpm install
pnpm run dev
```

Then open the local URL printed in the terminal.

## Privacy and Data

Nothing you type is sent to a server. Carapace runs entirely in your browser: there is no backend, no analytics and no network calls for your data.

Your work is saved in your browser's local storage on **this device**, so it is still there after a refresh or restart. On a shared or lab computer, clear the site data in your browser when you finish. Use **Export State** if you want to keep a copy.

## Architecture

- **Framework:** Svelte 5 and SvelteKit
- **Graph:** D3.js Force Graph for layout calculations, with manual SVG-based rendering
- **Code Editor:** CodeMirror 6 with Turtle plugin and editor themes
- **Turtle:** N3.js Turtle parser
- **UI:** Shadcn-Svelte via Bits-UI, Svelte-Lucide for icons

## Why Carapace (from the original project by Heidi Leow)

There is a shortage of low-setup, modern tools for ontology work. Many general-purpose graph visualisers do not support ontology/ [OWL](https://www.w3.org/OWL/) specific rendering, and creating nodes and edges manually becomes tedious quickly. Carapace is text-based (TTL), free, open-source and deployed on the web at [carapace.space](https://carapace.space), allowing you to easily inspect and create modern-looking graphs compatible with other applications that work with TTL.

## Why this fork (Knowledge Graph Academy)

This fork is being set up for the Knowledge Graph Academy's hands-on courses. Learners write Turtle by hand, see syntax errors as they type, and watch the graph update live, which builds intuition for how OWL concepts are structured. We are extending it with SPARQL support, and SKOS-specific features will stay in this fork.

## Fork

This is the Knowledge Graph Guys' (KGG) fork of [Carapace](https://github.com/sellsol/carapace) by [sellsol](https://github.com/sellsol), used for the KGG Academy. Forked from upstream commit [`f56e16c`](https://github.com/sellsol/carapace/commit/f56e16c9e06d144dd60ff9f4b1d906ec9f1b4dc7) (`chore: better browser metadata`, 10 Oct 2026). The original project is deployed at [carapace.space](https://carapace.space).

## Licence

Released under the [GNU General Public License v3.0](./LICENSE), the same licence as the upstream project.
