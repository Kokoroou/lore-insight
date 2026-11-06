# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

MakerLens Events (formerly LoreInsight) is a **100% static, client-side**, **read-only** web tool that parses RPG Maker MV/MZ game data files and renders event command flow as an interactive node graph. No build step, no package manager, no server. Open `index.html` in a browser and it runs.

## Running locally

```bash
# Any static file server works. Python is usually available:
python -m http.server 8080

# Then open: http://localhost:8080/
```

For testing, drag the game's `data/` folder onto the page or use the Open Folder button. The `references/` directory contains a sample game for manual verification.

## Checks and CI

Node (22+) runs the checks; still no dependencies:

```bash
node scripts/check-site.mjs        # JS syntax, self-only CSP, no inline scripts/handlers, local files
node --test "tests/*.test.mjs"     # parser, loader and analytics on synthetic data
```

Run both before pushing. Tests load `js/*.js` into a `node:vm` context (`tests/helpers.mjs`: one shared global scope, like the page's `<script>` tags) and stub the DOM pieces they touch; fixtures are built in the test, never real game data. `.github/workflows/ci.yml` runs both through `kokoroou/agent-toolkit/.github/workflows/quality.yml@v0` (plus Gitleaks + Semgrep) on PRs and pushes to `main`. Graph rendering (`graph.js`, Cytoscape) is still verified by hand in the browser.

## Publishing

Public URL: `https://makerlens.kokoroou.workers.dev/events/` — one Cloudflare Worker serves the whole MakerLens family; the `Kokoroou/makerlens` repo builds it and runs `scripts/assemble-site.sh` from this repo into `/events/`. A new top-level file the site serves must be added to that script. `.github/workflows/notify-makerlens.yml` asks `Kokoroou/makerlens` to redeploy after each push to `main` (secret `MAKERLENS_DISPATCH_TOKEN`). The repo was renamed from `lore-insight` to `rpgmaker-events-viewer`. All paths in the page must stay relative so the tool works under a subpath.

## Architecture

### Data flow

```
Folder drop / file picker
  → loadFolder() [app.js]
      → parse MapInfos.json  → S.mapInfos  (tree metadata)
      → parse Actors.json    → S.actors[]  (\N[n] resolution)
      → parse System.json    → S.variables[], S.switches[]
      → parse CommonEvents.json → S.commonEvents[]
      → parse Map###.json    → S.maps (Map)
  → renderSidebar() — tree built from mapInfos.parentId/order/expanded
  → selectMap() → showEventPicker()
  → selectEvent() → selectPage()
      → parseEventPage(page.list, prefix) [parser.js]
      → renderGraph(nodes, edges) [app.js]
```

### The parser (`js/parser.js`)

`parseEventPage(list, prefix)` is the core function. It walks the flat RPG Maker command array recursively using the `indent` field to determine nesting depth. Returns `{ nodes, edges }`.

- **Dialogue** (code 101 + trailing 401s): collects lines into one node, stores `listStart`/`listEnd` indices into the command list
- **Choices** (102 → 402 branches → 404 end): one choice node, branches recurse one indent deeper
- **Conditions** (111 → 411 else → 412 end): condition node, true/else branches recurse
- **Labels** (118) / **Jumps** (119): collected into `labelMap` / `jumpQueue`, resolved as dashed back-edges after the main parse

`describeCondition(params)` reads `S.switches` / `S.variables` / `S.actors` (global `S`) to show human-readable names in condition nodes.

`resolveTextCodes(str)` expands `\N[n]` → actor name and `\V[n]` → variable name (with ID suffix).

### State (`js/app.js` — global `S`)

Key fields:
- `S.maps` — `Map<mapId, {mapId, mapName, events[]}>` (parsed)
- `S.mapInfos` — `{[id]: {name, parentId, order, expanded}}` — drives sidebar tree
- `S.currentPage` — the currently rendered `{list}` page object (never mutated)
- `S.actors / .variables / .switches` — loaded from game data for name resolution

### Read-only by design

The tool never edits or exports game files. In-place dialogue editing and the map download were removed when the project joined the MakerLens brand, whose rules forbid editing or repackaging games (see MakerLens `docs/ROADMAP.md`, "Do not do"). Undo/redo (`history.js`) only covers node moves in the graph.

### Sidebar tree

`renderMapTree()` builds a recursive DOM tree from `S.mapInfos`, using the `parentId` hierarchy from MapInfos.json. Folders use `.sb-folder` + `.sb-children`; the collapsed state is toggled via `.collapsed` class (CSS adjacent sibling selector hides children). Default expanded state mirrors the `expanded` flag from MapInfos.json.

### Cytoscape integration

- `initCy()` creates the instance once; subsequent renders call `cy.elements().remove()` then `cy.add(elements)` and re-run the dagre layout
- `cyStyle()` is called on every render and theme change; it returns the full style array including per-node-type `:selected` rules that produce a colored neon underlay glow
- Node `glowColor` is stored as element data so the underlay color matches each node type
- `VISIBLE_CODES` (constants.js) is a Set of the five parseable command codes; used to quickly detect empty events without full parsing

## Conventions

- **Brand: MakerLens Events.** Same family as MakerLens Assets (https://makerlens.kokoroou.workers.dev/assets/): the magnifier mark, the green `--a` action colour and the "Maker**Lens** + suffix" wordmark. Do not reintroduce the LoreInsight name in the UI.
- **No third-party hosts.** Libraries live in `vendor/` (see `vendor/README.md`); the CSP in `index.html` allows `'self'` only (plus the GoatCounter pixel in `img-src`), so no inline scripts or `onclick=` attributes (put code in `js/`).
- **Analytics never include game data.** `js/analytics.js` sends one GoatCounter page view (path, referrer, the traffic-source params in `SOURCE_PARAMS`) only on `makerlens.kokoroou.workers.dev`, and nothing with Do Not Track / GPC. Never send file, map or event names, dialogue or other game data. It is documented in MakerLens Assets `privacy.html#analytics`; update that page if the payload changes.
- **No framework, no build.** All JS is plain ES5-compatible (no `import`/`export`). Scripts are loaded in order: `theme-init.js` (head) → vendor libs → `constants.js` → `parser.js` → … → `app.js`. `parser.js` accesses the global `S` object from `app.js` directly.
- **`S`** is the single global state object. EL is the DOM ref cache populated at `DOMContentLoaded`.
- CSS uses design tokens as custom properties (`--bg`, `--s1..s3`, `--bd/bd2`, `--a`, `--t/t2/t3`). Both dark (default) and light themes are defined in `:root` and `html[data-theme="light"]`.
- RPG Maker MV and MZ differ in where the speaker name lives: MZ puts it in `cmd.parameters[4]`; MV doesn't have it inline. The parser handles this with `|| ''`.
