# Product Vision

> **Name and positioning (2026-11-05).** The product is **MakerLens Events**, the event-flow half of the MakerLens family
> (MakerLens Assets views images and audio). Positioning: for people who need to understand how an RPG Maker MV/MZ game
> works — ending conditions, dialogue branches, which switch is turned on where — without the original project,
> MakerLens Events is an event-flow viewer that runs in the browser and opens a whole game with one drag and drop.
> Unlike the RPG Maker editor and in-editor plugins such as Visual Event Editor, it needs no plugin or project, reads
> released games, and files never leave the machine. It is read-only: editing and repackaging games is out of scope.

## 1. Core Objective

Build a **static web application** that runs 100% client-side in the user's browser — no server, no uploads, no dependencies to install.

The core feature: let users drag and drop an RPG Maker game's `data/` folder into the browser, then automatically parse the event logic and render it as an **interactive node graph**, similar to what Twine offers for interactive fiction.

## 2. Market Positioning & Pain Points

**The gap:** The existing ecosystem has translation tools, in-editor node editors (Visual Event Editor, Visual Dialogue Branches) and runtime debuggers, but no static web tool that reads the event flow of a released game directly from its files.

**Guide creators, wiki editors and dataminers** (primary audience) need to:
- Map conditions for unlocking hidden routes
- Track True Ending requirements
- Plan optimal speedrun paths

**Developers, writers and translators** (secondary) need a bird's-eye view to:
- Untangle nested spaghetti events
- Detect dead-end branches
- Review complex branching narratives in story-heavy projects

## 3. Technical Architecture

**Input layer**
- Use the *File System Access API* (with `<input webkitdirectory>` as fallback) to read `Map###.json` and `CommonEvents.json` from the game's `data/` folder.
- Read `MapInfos.json` to resolve human-readable map names.

**Parser layer**
Parse RPG Maker command codes into typed graph nodes:

| Code(s) | Meaning | Node type |
|---------|---------|-----------|
| 101, 401 | Show Text | Dialogue |
| 102, 402, 404 | Show Choices / When / End | Choice |
| 111, 411, 412 | Conditional Branch / Else / End | Condition |
| 118 | Label | Label (waypoint) |
| 119 | Jump to Label | Jump |

The parser walks the command list recursively, using the `indent` field to determine nesting depth. Labels and jumps are resolved in a second pass to create back-edges in the graph.

**Render layer**
- [Cytoscape.js](https://cytoscape.org/) for graph rendering
- [cytoscape-dagre](https://github.com/cytoscape/cytoscape.js-dagre) for automatic top-down layout

## 4. Technical Challenges

**Jump resolution**
Labels (118) and Jump to Label (119) can create non-linear flow across large event pages. The parser must resolve all jump targets after the main parse pass and render them as dashed back-edges so the graph remains visually clear.

**Node identity**
RPG Maker does not assign names to individual command blocks. The parser must auto-generate stable, unique IDs from the source context (map ID, event ID, page index, sequence number) to keep the graph consistent across re-renders.

**Performance at scale**
Large maps can have hundreds of events, each with multiple pages containing thousands of commands. Rendering everything at once would freeze the browser. The UX must load one event page at a time — the user navigates top-down: map → event → page → graph.
