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
node --test "tests/*.test.mjs"     # parser, loader, analytics and feedback on synthetic data
```

Run both before pushing. Tests load `js/*.js` into a `node:vm` context (`tests/helpers.mjs`: one shared global scope, like the page's `<script>` tags) and stub the DOM pieces they touch; fixtures are built in the test, never real game data. `.github/workflows/ci.yml` runs both through `kokoroou/agent-toolkit/.github/workflows/quality.yml@v0` (plus Gitleaks + Semgrep) on PRs and pushes to `main`. Graph rendering (`graph.js`, Cytoscape) is still verified by hand in the browser.

## Publishing

Public URL: `https://makerlens.kokoroou.workers.dev/events/` — one Cloudflare Worker serves the whole MakerLens family; the `Kokoroou/makerlens` repo builds it and runs `scripts/assemble-site.sh` from this repo into `/events/`. A new top-level file the site serves must be added to that script. `.github/workflows/notify-makerlens.yml` asks `Kokoroou/makerlens` to redeploy after each push to `main` (secret `MAKERLENS_DISPATCH_TOKEN`). The repo was renamed from `lore-insight` to `rpgmaker-events-viewer`. All paths in the page must stay relative so the tool works under a subpath. `faq.html` is a static FAQ page (own `css/faq.css`, no app scripts): keep long explanations there, and keep its `FAQPage` JSON-LD identical to the visible questions and answers (`scripts/check-site.mjs` compares them).

## Architecture

### Data flow

```
Folder picker / drop
  → findDataFiles() [loader.js] — breadth-first to the first folder with Map###.json
      (data/ first, www/data/ for MV), skipping img/ audio/ movies/…; returns lazy
      file-likes for data/*.json only (FS_HANDLE / FS_ENTRY adapters; FS_ENTRY loops
      readEntries(), which returns at most ~100 entries per call)
  → runLoad() [loader.js] drives the Loader overlay [loadui.js, css/loader.css]: steps
      detect → read → map, progress bar, Cancel. The new game is built on the side and
      only replaces the open one at commit (after the 4 small files are read), so Cancel
      or an error before that keeps the game on screen; after commit the button says
      Hide and the maps keep loading in the background. Errors show in the overlay.
  → loadFolder() [loader.js] (<input webkitdirectory> calls it with its File list)
      → parse MapInfos.json  → S.mapInfos  (tree metadata)
      → parse Actors.json    → S.actors[]  (\N[n] resolution)
      → parse System.json    → S.variables[], S.switches[]
      → parse CommonEvents.json → S.commonEvents[]
      → Map###.json NOT read yet → S.mapFiles (Map id → file)
      → renderSidebar() at once (unread maps show a "…" count)
      → readMapsInBackground() → S.bgDone: reads maps in sidebar order into S.maps
        (only maps with events; the rest leave the tree), pausing while Fg.active;
        opens the first map with events unless the user already picked one
  → selectMap() → openMap() (foreground read, ahead of the background) → showEventPicker()
  → selectEvent() → selectPage()
      → parseEventPage(page.list, prefix) [parser.js]
      → renderGraph(nodes, edges) [app.js]
  → Preview / a sidebar scene → openScene() [player.js]
      → sceneTimeline(list) [scene-script.js] → steps
      → Media.image()/audio() [media.js]: img/ and audio/ read one file at a time
```

### The parser (`js/parser.js`)

`parseEventPage(list, prefix)` is the core function. It walks the flat RPG Maker command array recursively using the `indent` field to determine nesting depth. Returns `{ nodes, edges }`.

- **Dialogue** (code 101 + trailing 401s): collects lines into one node, stores `listStart`/`listEnd` indices into the command list
- **Choices** (102 → 402 branches → 404 end): one choice node, branches recurse one indent deeper
- **Conditions** (111 → 411 else → 412 end): condition node, true/else branches recurse
- **Labels** (118) / **Jumps** (119): collected into `labelMap` / `jumpQueue`, resolved as dashed back-edges after the main parse

`describeCondition(params)` reads `S.switches` / `S.variables` / `S.actors` (global `S`) to show human-readable names in condition nodes.

`resolveTextCodes(str)` expands `\N[n]` → actor name and `\V[n]` → variable name (with ID suffix).

### Scenes and the scene player

- `scenes.js`: a **scene** is found by content, never by name: a command list with at least 2 Show Picture (231) and 3 messages (101/105). `findScenes()` feeds the sidebar's "Scenes" section (common events, then map event pages as maps are read); scene events come first in the event picker.
- `scene-script.js` (no DOM, tested in node): `sceneTimeline(list, getCommon)` runs the commands like `Game_Interpreter` and stops at each message. A step = `{ msg, choices, pics, bgm, bgs, fade, sounds, anim, state }`; `anim` holds picture frames split by waits (flipbook animations, Move Picture), sounds carry the frame they start on. Rules: calls (117) inline; loops once; backward jumps once; choices are preselected on the branch that shows the most (lookahead, so "Skip scene?" does not skip) and `sceneChoose()` re-runs from a choice the viewer picks; conditions take the true branch, except a first check of an unknown switch/variable, which tries both answers ahead and then REMEMBERS the value so later checks agree. Control Switches/Variables inside the scene are followed (random = minimum). Actor conditions (equipment, name, class, party, state) use the STARTING state (`S.actorStart` / `S.party` from Actors.json / System.json, set in loader.js) plus the scene's own Change Equipment/Name/Party/State, so outfit layers show the default outfit, not all of them; unknown skills are tried both ways like switches. Simple scripts are followed (`sceneScript` / `sceneScriptCondition`): `$gameVariables`/`$gameSwitches` reads and assignments, `$gameScreen.picture(n)`, `showPicture` / `erasePicture` (also the `for` erase loop); a script we cannot read makes the values it assigns unknown, an unreadable condition is true. PictureVariableSetting's `P_VARIABLE_VALID`, `P_TARGET_*`, `P_D_FILENAME` are followed; other plugin commands are skipped. Lookahead is capped per timeline (`SCENE_LOOKAHEAD_BUDGET`), then unknown checks take true.
- `media.js`: `Media.reset(root, system)` at commit (loader.js) with the game root (parent of `data/`: `treeRoot()` over FS_HANDLE/FS_ENTRY, or `filesRoot()` over the `<input webkitdirectory>` list). Only the folders on the way to a file are listed; each file is read when first shown, decrypted in memory with System.json's `encryptionKey` (`decryptMVMZ`, same as MakerLens Assets), typed by its bytes (`sniffMime`: some games ship WebP as `.png_`) and served as a blob URL (CSP `media-src blob:`). Screen size: MZ System.json, else an MV resolution plugin in `js/plugins.js`, else 816×624.
- `player.js` + `css/player.css`: the dark lightbox (always dark, like a Google Drive video preview). Stage in game pixels scaled to fit; pictures by number order, message window with face / name box, choices as buttons. Messages type out at 250 WPM (`PLAYER_WPM`, CJK: 2 chars = 1 word); a click while typing shows the whole message; auto play waits `PLAYER_HOLD` after typing. Click/→/Space next, ← back, A auto, M mute, T typewriter, Esc close; volume and typewriter in `localStorage['mle-player']`. Opening a scene never changes or exports anything: the tool stays read-only.

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

- Big pages (`layoutPlan()` in constants.js: 120+ nodes) show a "Laying out N nodes…" notice (`#layout-notice`) and wait one frame before the synchronous dagre layout so the notice can paint; 400+ nodes also use dagre's `longest-path` ranker. `renderSeq`/`cancelRender()` drop a pending render when the user moves on.
- `initCy()` creates the instance once; subsequent renders call `cy.elements().remove()` then `cy.add(elements)` and re-run the dagre layout
- `cyStyle()` is called on every render and theme change; it returns the full style array including per-node-type `:selected` rules that produce a colored neon underlay glow
- Node `glowColor` is stored as element data so the underlay color matches each node type
- `VISIBLE_CODES` (constants.js) is a Set of the five parseable command codes; used to quickly detect empty events without full parsing

## Conventions

- **Brand: MakerLens Events.** Same family as MakerLens Assets (https://makerlens.kokoroou.workers.dev/assets/): the magnifier mark, the green `--a` action colour and the "Maker**Lens** + suffix" wordmark. Do not reintroduce the LoreInsight name in the UI.
- **No third-party hosts.** Libraries live in `vendor/` (see `vendor/README.md`); the CSP in `index.html` allows `'self'` only (plus the GoatCounter pixel in `img-src` and the feedback inbox in `connect-src`), so no inline scripts or `onclick=` attributes (put code in `js/`).
- **Analytics never include game data.** `js/analytics.js` sends one GoatCounter page view (path, referrer, the traffic-source params in `SOURCE_PARAMS`) only on `makerlens.kokoroou.workers.dev`, and nothing with Do Not Track / GPC. Never send file, map or event names, dialogue or other game data. It is documented in MakerLens Assets `privacy.html#analytics`; update that page if the payload changes.
- **Feedback never includes game data.** `js/feedback.js` is the same card as MakerLens Assets' (1-tap star asked once from the 2nd loaded game, optional follow-up comment folded into the same entry by the signed `ref`, Bug/Idea form in About), posting to `https://feedback.kokoroou.workers.dev/api/submit` as project `makerlens-events` only when the user taps a star or presses Send. It may send only `project`, `kind`, `rating`, `comment`, `lang`, `ref` and `meta.opens` (bucket) / `meta.browser` (bug reports, removable); `fbBody()` builds exactly that and `tests/feedback.test.mjs` checks it. Off with Do Not Track / GPC and off the public host (`?feedback` forces it for testing). State lives in `localStorage['mle-feedback']` (own key; Assets uses `feedback`), never sent. The project (origins, `meta` fields) lives in the inbox's D1, managed with `PUT /api/projects/makerlens-events` (see the feedbacks README); a new field must be added there too. Documented in Assets `privacy.html#feedback`; update it when the payload changes. `css/feedback.css` mirrors Assets' `css/feedback.css`.
- **No framework, no build.** All JS is plain ES5-compatible (no `import`/`export`). Scripts are loaded in order: `theme-init.js` (head) → vendor libs → `constants.js` → `parser.js` → … → `app.js`. `parser.js` accesses the global `S` object from `app.js` directly.
- **`S`** is the single global state object. EL is the DOM ref cache populated at `DOMContentLoaded`.
- **One look with MakerLens Assets.** `css/tokens.css` is a verbatim copy of Assets' `css/tokens.css` (the family's shared design system: slate palette, `--a` green, `--r*`, `--font`, `--hh` 56px header, `--sw` sidebar). Never edit it here: change it in `rpgmaker-assets-viewer` and copy it over; the makerlens build (`scripts/check-site.mjs`) fails if the two differ. Events-only tokens (`--dw`, node colours `--c-*`) live in `css/events-tokens.css`. Components reuse Assets' class names and sizes (`.btn-primary/.btn-ghost/.btn-icon` 36px, 44px under 600px, `.logo-mark`, `#setup`/`#drop-zone`, toolbar 52px, `.about-*`, `.note-row`) and the same Lucide-style SVG sprite (`<symbol id="i-…">` in `index.html`, `icon()` in `detail.js`); no emoji icons.
- **Theme** follows the OS (`prefers-color-scheme`) unless the toggle stored `'light'`/`'dark'` in `localStorage['mle-theme']` (same rule as Assets, own key). `graph.js` reads the Cytoscape colours and font from the tokens (`token('--bd2')`) and restyles on toggle and on OS theme change.
- RPG Maker MV and MZ differ in where the speaker name lives: MZ puts it in `cmd.parameters[4]`; MV doesn't have it inline. The parser handles this with `|| ''`.
