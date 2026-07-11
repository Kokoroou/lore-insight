# LoreInsight

A browser-based tool to visualize RPG Maker MV and MZ event flow as an interactive node graph.

Drag your game's `data/` folder into the browser. LoreInsight parses the event commands and renders each event page as a directed graph — dialogue nodes, choice branches, conditional branches, labels, and jumps — all laid out automatically.

**100% offline.** No server. No uploads. Everything runs in your browser.

## Features

- Drag-and-drop or click to open any RPG Maker MV/MZ game folder
- Parses `Map###.json`, `CommonEvents.json`, and `MapInfos.json`
- Renders event command flow as an interactive Cytoscape.js node graph
- Supports dialogue (101/401), choices (102/402), conditions (111/411), labels (118), and jumps (119)
- Jump-to-label edges rendered as dashed back-edges for visual clarity
- Click any node to inspect its full content in the detail panel
- Switch between event pages with page tabs
- Sidebar navigation: maps and common events
- Resizable sidebar, zoom controls, fit-to-screen
- Dark and light theme (preference saved locally)

## Usage

1. Open `index.html` in a modern browser (Chrome or Edge recommended for File System Access API support).
2. Click **Open Folder** or drag your game's root folder onto the page.
3. Select a map from the sidebar.
4. Click an event to render its command graph.
5. Use the page tabs to navigate multi-page events.
6. Click any node to see its full dialogue, choices, or condition details.

> The tool reads files locally and never transmits any data. Your game files stay on your machine.

## Supported Engines

| Engine | Status |
|--------|--------|
| RPG Maker MV | Supported |
| RPG Maker MZ | Supported |
| RPG Maker XP / VX / VX Ace | Not supported (different format) |

## Node Types

| Node | Color | Description |
|------|-------|-------------|
| Dialogue | Amber | A block of Show Text commands (101/401) |
| Choice | Blue | A Show Choices branch point (102/402) |
| Condition | Purple | A Conditional Branch (111/411) |
| Label | Green | A named waypoint (118) |
| Jump | Orange | A Jump to Label command (119), rendered as a dashed edge |

## Project Structure

```
lore-insight/
  index.html          # App shell
  css/
    style.css         # All styles (dark/light theme)
  js/
    constants.js      # RPG Maker command codes and node color definitions
    parser.js         # Event command parser → graph nodes and edges
    app.js            # UI state, Cytoscape render, file loading
  docs/
    vision.md         # Product vision and technical architecture notes
```

## Technical Notes

**Parser architecture:** The parser uses a recursive descent approach, using the `indent` field on each command to determine nesting depth. Choice branches and conditional branches are handled by recursing one indent level deeper. Labels and jumps are resolved in a post-processing pass.

**File loading:** Uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) (`showDirectoryPicker`) when available, with a `<input webkitdirectory>` fallback for broader compatibility. Drag-and-drop is also supported via the DataTransfer API.

**Graph rendering:** [Cytoscape.js](https://cytoscape.org/) with [cytoscape-dagre](https://github.com/cytoscape/cytoscape.js-dagre) for automatic top-down layout. Both libraries are loaded from `unpkg.com` CDN — an internet connection is required on first load; after that the browser caches them.

## Browser Compatibility

Requires a modern browser with ES2020+ support. Chrome 86+ or Edge 86+ recommended for the best experience (full File System Access API support). Firefox works via the `<input>` fallback.

## License

MIT — see [LICENSE](LICENSE).
