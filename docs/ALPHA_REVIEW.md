# formvis alpha: a guide for reviewers

This is for the people reviewing formvis 1.72.8, the first alpha handed to human review. It says how to run it, what
to look at, what is known not to work yet, and how to report what you find.

## Run it

- Web: `./formvis boot` starts the engine service and the window; open the address it prints. Without the engine
  service the window still runs, says what waits for it, and greys out those commands.
- Desktop: `./build_app` builds the app for the machine it runs on. Signed and notarized installers are not made
  yet (see Known limits).
- Help > Manual is the full manual; the same text is `docs/MANUAL.md`.

## What to review

1. Everyday editing against what you do in your usual editor: open, layers and masks, selections, brushes, adjustments,
   filters, type, shapes and paths, transform, export. Note anything that behaves differently from your usual editor
   without saying why.
2. Files: open your own PSD, TIFF, RAW, EXR and PNG files; save to PSD and reopen them in your usual editor. Layer structure,
   blend modes, masks, type and smart objects are the things to check.
3. Large pictures: work at your usual sizes and note where it slows. Known: at 8000 by 6000 a 10 px Gaussian Blur
   and a full redraw are over our targets.
4. Languages: Preferences > Language switches the whole interface to one of 26 languages. The translations were
   machine made; Hungarian, Thai, Indonesian and Vietnamese had a consistency pass. Native readers: please mark any
   term that reads wrong, with the English it came from (hover a control to see where it is).
5. Agents and the assistant: Window > Assistant with your own model key; outside agents through the MCP server. Each
   step shows and can be undone on its own.

## Known limits

- Not built here: signed macOS and Windows releases, notarization, the updater's key, Linux AppImage and .deb.
- Not run on real hardware yet: the GPU display and filter paths and local AI generation (checked only on a software
  GPU), and the tablet.
- Not wired: the NodeMode portal embed and cloud documents.
- Large files: blurs over 16 megapixels run on background workers now, but their speed in the browser is not yet
  measured; whole-layer fills keep about half the undo memory they did.
- Engine-only features while the service is down: library saves, HEIC, RAW, DPX and film formats, colour
  conversion and CMYK, AI tools, video, the terminal and agents.

## How to report

For each finding: what you did (the menu path or tool), what you expected (what your usual editor does, if that is the
reference), what happened, the file if it matters, and Help > Copy Error Log if anything failed. Screenshots help.
