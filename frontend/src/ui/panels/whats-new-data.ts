/** Help > What's New: the additions of the current and recent releases, newest first. Each row's `command` is a command
 *  id from the catalogue that Show Me runs; add a release at the top when one ships. */
export interface Addition { title: string; text: string; command: string }
export interface Release { version: string; name: string; additions: Addition[] }

export const RELEASES: readonly Release[] = [
  {
    version: '1.67.9', name: 'File Info, new file formats and a calmer workspace',
    additions: [
      { title: 'File Info', text: 'The document\'s title, author, description, keywords, rating and copyright, as Photoshop\'s File Info keeps them with the file.', command: 'file-info' },
      { title: 'QOI, PNM, TGA and ICO', text: 'Four more image formats: QOI, the PNM family, Targa (TGA) and Windows icons (ICO).', command: 'open' },
      { title: 'A workspace that stays out of the way', text: 'The Home screen is optional at launch and when the last document closes, nothing floats over the picture, every tool option and dialog setting is kept across sessions, and this list.', command: 'settings' },
    ],
  },
  {
    version: '1.67.8', name: 'Camera Raw adjustment layers, File > Scripts and Layers to Files',
    additions: [
      { title: 'Clarity adjustment layer', text: 'Mid-tone contrast at a large radius, as Camera Raw\'s Clarity, on a layer you can switch off or mask.', command: 'new-adj-clarity' },
      { title: 'Dehaze adjustment layer', text: 'Cuts or adds atmospheric haze, as Camera Raw\'s Dehaze.', command: 'new-adj-dehaze' },
      { title: 'Texture adjustment layer', text: 'Fine detail at a small radius: smooths skin at a negative amount, brings out bark and fabric at a positive one.', command: 'new-adj-texture' },
      { title: 'Light adjustment layer', text: 'Brightness, Contrast, Highlights, Shadows, Whites and Blacks together on one layer.', command: 'new-adj-light' },
      { title: 'File > Scripts', text: 'Delete All Empty Layers, Flatten All Layer Effects and Flatten All Masks, each one undo step. Show Me runs Delete All Empty Layers, which touches only blank layers.', command: 'script-delete-empty-layers' },
      { title: 'Export Layers to Files', text: 'Every layer as its own file, named with its stack number and layer name, effects and mask applied.', command: 'export-layers' },
      { title: 'Export Artboards to Files', text: 'Every artboard as its own file in the type and quality you choose.', command: 'export-artboards-files' },
    ],
  },
];
