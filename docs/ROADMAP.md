# Roadmap: repositioning as MakerLens Events

This roadmap turns the LoreInsight prototype into **MakerLens Events**, the event-flow half of the
MakerLens family (MakerLens Assets views a game's images and audio:
<https://makerlens.kokoroou.workers.dev/assets/>). It comes from the idea evaluation of 2026-11-05.

**Verdict:** keep going only as part of MakerLens (3★ inside the family, 2★ as a standalone LoreInsight): same
audience and gesture, running cost 0, but a narrower market than Assets (≈ 40k people ever needing to read
event flow vs ≈ 100k for assets), so a separate brand would split already small traffic. Free, no paid tier.

## Why rebrand instead of growing LoreInsight alone

- **Same audience, same gesture.** People who drop a game folder into MakerLens Assets are the people who
  want to read its events. One brand lets one launch, one SEO footprint and one feedback loop serve both.
- **The old name did not match searches.** Users search with RPG Maker words ("event", "common event",
  "switch", "RPG Maker event viewer"). "Lore" reads as a worldbuilding app and "Insight" collides with
  analytics products (LorInsight for WooCommerce).
- **No technical moat.** The parser is small and easy to copy; what can be defended is brand and distribution,
  which MakerLens already has.
- **A real gap.** Existing event tools (Visual Event Editor, Drag's Debugger) are plugins inside the editor or
  the running game. Nothing reads the event flow of a *released* game in the browser.

## Positioning

> For people who need to understand how an RPG Maker MV/MZ game works (ending conditions, dialogue branches,
> which switch is turned on where) without the original project, **MakerLens Events** is an event-flow viewer
> that runs in the browser and opens a whole game with one drag and drop. Unlike the RPG Maker editor and
> in-editor plugins, it needs no plugin or project, reads released games, and files never leave the machine.

- **Primary audience:** guide and wiki writers, dataminers, speedrunners (hidden routes, True Ending conditions).
  The key feature for them is the condition (switch / variable names), not the dialogue.
- **Secondary:** translators who need to know which branch a line belongs to (Translator++ already handles
  the text itself), and developers or writers who want a bird's-eye view of tangled events (they already have
  the editor and Visual Event Editor; only automatic checks such as dead ends would win them over).
- **Bridge:** people who just opened the game in MakerLens Assets; one more drag and drop costs nothing.
- **Not for:** editing or repackaging games (use the RPG Maker editor or Visual Event Editor).

Ground rules, shared with MakerLens Assets:

- 100% client-side, no upload, read-only.
- No third-party hosts: libraries vendored in `vendor/`, CSP allows `'self'` (plus, later, the page counter and
  feedback endpoint only).
- No build step; opening `index.html` runs the app.
- Analytics never contain game data (no file names, map names, event text).

Effort: **S** (≤ 1 day), **M** (a few days), **L** (more than a week).

---

## Phase 0: rename and align (done)

| # | Item | Status |
|---|------|--------|
| 0.1 | Rename UI, title, meta and docs to **MakerLens Events**; title "RPG Maker Event Viewer — MV & MZ event flow graph" | ✅ |
| 0.2 | Reuse the MakerLens mark, green action colour and "Maker**Lens** + suffix" wordmark | ✅ |
| 0.3 | Remove in-place dialogue editing and map JSON download (read-only, matches MakerLens "do not edit games") | ✅ |
| 0.4 | Vendor Cytoscape, dagre, cytoscape-dagre; self-only CSP; no inline scripts | ✅ |
| 0.5 | Link to MakerLens Assets from the setup screen and the About dialog | ✅ |

## Phase 1: launch as part of MakerLens (weeks 1–2)

Goal: the product is public, findable and measurable, and both MakerLens sites point at each other.

| # | Item | Notes | Effort |
|---|------|-------|--------|
| 1.1 | ~~**Publish**~~ | Done: <https://makerlens.kokoroou.workers.dev/events/>, deployed by `Kokoroou/makerlens` (one Cloudflare Worker for the family) | S |
| 1.2 | ~~**Decide the repository name**~~ | Done: renamed to `rpgmaker-events-viewer` (matches `rpgmaker-assets-viewer`) | S |
| 1.3 | ~~**Cross-link from MakerLens Assets**~~ | Done: MakerLens Assets roadmap item 17, a link in its About dialog; Events links back from the setup screen and About. Link only, no data shared between sites | S |
| 1.4 | ~~**Anonymous page counter (GoatCounter)**~~ | Done: `js/analytics.js`, page views and referrer only, CSP `img-src` allows the counter; documented in the shared MakerLens privacy page (`/assets/privacy.html#analytics`) | S |
| 1.5 | **Feedback and star rating** | New `makerlens-events` project in the feedback inbox (Kokoroou/feedbacks `src/projects.js`); prompt only after the second game is opened, like MakerLens | S–M |
| 1.6 | **SEO basics** | `canonical`, `og:url`, `og:image` (MakerLens style), `sitemap.xml`, `llms.txt`, favicon with the shared mark | S |
| 1.7 | **`LEGAL.md` and FAQ** | Intended use (own games or games you may study), read-only, no upload, takedown policy; mirror MakerLens wording | S |
| 1.8 | **Synthetic demo game** | A tiny self-made `data/` folder with a "True Ending" condition chain, for screenshots, the FAQ and launch posts. Never use real game data | S–M |
| 1.9 | **Launch posts** | Announce with MakerLens on forums.rpgmakerweb.com and r/RPGMaker, using the demo ("find what unlocks the True Ending") | S |

## Phase 2: sharpen the primary job (weeks 3–8, while measuring)

Only features that serve "understand how the game works without the project". Ship them as the numbers
from Phase 1 come in; stop early if the stop rule below triggers.

| # | Item | Why | Effort |
|---|------|-----|--------|
| 2.1 | **Switch and variable commands as nodes** (Control Switches 121, Control Variables 122, Control Self Switch 123) | Ending conditions are built from these; today they are invisible in the graph | M |
| 2.2 | **"Where is switch N set?" reverse search** across all maps and common events | The core question of guide writers and dataminers; no other tool answers it for released games | M |
| 2.3 | **Event page conditions** (switch, variable, self switch, item, actor on page 2+) shown on the page tabs | Explains why a page appears; part of every hidden-route answer | S–M |
| 2.4 | **Transfer Player (201) and Common Event (117) as links** | Lets users follow the story across maps and common events | M |
| 2.5 | **Global text search** (dialogue, choices, names) | Translators and wiki editors find the event behind a line | S–M |
| 2.6 | ~~**Parser tests with synthetic data**~~ (`node --test`, CI like MakerLens) | Done: `tests/` (parser, loader, analytics), `scripts/check-site.mjs`, `.github/workflows/ci.yml`. They caught choice branches after a blank choice getting the wrong label | S |

## Phase 3: merge deeper into MakerLens (only if the numbers say so)

| # | Item | Gate | Effort |
|---|------|------|--------|
| 3.1 | **Same site, two pages**: move into the MakerLens repo as `events.html`, sharing CSP, counter and feedback | ≥ 300 views/month **or** ≥ 10% of MakerLens visitors click through to Events. Needs MakerLens to allow vendored libraries (or a hand-written graph renderer) | M |
| 3.2 | **One page, two tabs**: pick the folder once, switch between Assets and Events; from a dialogue node jump to the face image and BGM in Assets | ≥ 20% click-through **and** ≥ 3 user requests for switch search or cross-linking | L |

## Measurement and stop rule

Read after 8 weeks from the launch in Phase 1:

| Metric | Source | Continue | Stop adding features |
|--------|--------|----------|----------------------|
| Page views per month | GoatCounter | ≥ 300 | < 100 |
| Click-through from MakerLens Assets | GoatCounter referrer | ≥ 10% | — |
| Star ratings | feedback inbox | ≥ 10, average ≥ 4 | < 5 |
| Feature requests | feedback inbox, forum threads | ≥ 3 on the same topic | — |

"Stop adding features" means: keep the site online and linked from MakerLens, fix bugs only.

## Do not do

| Item | Reason |
|------|--------|
| Editing, saving or repackaging game data | Leaves the read-only role, raises legal risk; the RPG Maker editor and Visual Event Editor already do it |
| Uploading, syncing or sharing game data (share links, cloud saves, AI calls with event text) | Breaks the privacy promise and the legal argument shared with MakerLens |
| Loading anything from third-party hosts (CDNs, web fonts) | CSP and offline promise; vendor instead |
| Charging for the tool | Free alternatives exist and a paid tool for reading others' games weakens the legal position; a shared donate link is the most |
| Analytics with game details (file, map or event names, text) | Same rule as MakerLens |
| Supporting XP/VX/VX Ace event data (Ruby Marshal `.rxdata`/`.rvdata2`) | Different format and a much larger parser; only if users clearly ask after Phase 2 |
| Bringing back the LoreInsight name in the UI | One brand: MakerLens |
