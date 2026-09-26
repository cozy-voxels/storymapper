# StoryMapper

A browser-based tool for designing QuestLines quests for Hytale. Quests are laid out as pages on a pan/zoom canvas, wired together, grouped into questlines, and linked to World entries (factions, NPCs, locations). Imports/exports Markdown drafts of quests or QuestLines quest JSON and validates quest logic using the same process as QuestLines.

Plain JS + Vite, no framework. All data lives in the browser's `localStorage`; use **Options → Export all data…** to back it up.

## Run locally

```sh
npm install
npm run dev      # editor at http://localhost:5173
npm test         # vitest
```

`npm run build` / `npm run preview` build and serve the editor from `dist/`.

## Publish the viewer

The viewer (`view/index.html`, entry `src/view-main.js`) is a read-only build of the editor that loads a `data.json` sitting next to it. Views are hash-routed (`#/quest/<id>`, `#/world/...`), so links are shareable.

1. In the editor: **Options → Export for publishing…** downloads `data.json` (trash excluded).
2. `npm run build:view` outputs `dist-view/` with relative asset paths.
3. Put `data.json` in `dist-view/` next to `index.html`.
4. Upload `dist-view/` to any static host, at any path.

To try it locally, either put `data.json` in `view/` (gitignored) and open http://localhost:5173/view/ under `npm run dev`, or build and run `npm run preview:view` with it in `dist-view/`. It must be served over HTTP; opening `index.html` from disk won't load the data.
