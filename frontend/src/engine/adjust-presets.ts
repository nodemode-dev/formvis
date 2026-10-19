/** Built-in presets of the Gradient Map, Photo Filter and Grain adjustments, and where saved ones are kept. Data only: the
 *  Adjustments panel and the agent bridge (apply_preset) both read these. */
export const ADJUST_PRESET_STORE = 'formvis.adjustPresets';

export const GRADIENT_PRESETS: ReadonlyArray<{ id: string; label: string; stops: ReadonlyArray<readonly [number, string]> }> = [
  { id: 'cyberpunk', label: 'Cyberpunk', stops: [[0, '#0b0630'], [0.4, '#7a1fa2'], [0.7, '#ff2a9d'], [1, '#19f0ff']] },
  { id: 'sunset', label: 'Sunset', stops: [[0, '#1b0a3c'], [0.35, '#a3195b'], [0.7, '#ff7a2f'], [1, '#ffe29a']] },
  { id: 'tealorange', label: 'Teal and Orange', stops: [[0, '#062a35'], [0.45, '#1f7a8c'], [0.75, '#e8a15a'], [1, '#ffe7c2']] },
  { id: 'sepia', label: 'Sepia', stops: [[0, '#2b1a0e'], [0.6, '#a9825a'], [1, '#fff4dc']] },
  { id: 'infrared', label: 'Infrared', stops: [[0, '#000000'], [0.3, '#2a0a6b'], [0.6, '#e0103a'], [0.85, '#ffd000'], [1, '#ffffff']] },
  { id: 'bwcontrast', label: 'Black and White Contrast', stops: [[0, '#000000'], [0.2, '#000000'], [0.8, '#ffffff'], [1, '#ffffff']] },
];

export const PHOTO_FILTERS: ReadonlyArray<readonly [string, string, number, number, number]> = [
  ['warm85', 'Warming Filter (85)', 236, 138, 0], ['warmlba', 'Warming Filter (LBA)', 250, 150, 0], ['warm81', 'Warming Filter (81)', 235, 177, 19],
  ['cool80', 'Cooling Filter (80)', 0, 109, 255], ['coollbb', 'Cooling Filter (LBB)', 0, 93, 255], ['cool82', 'Cooling Filter (82)', 0, 181, 255],
  ['red', 'Red', 234, 26, 26], ['orange', 'Orange', 243, 132, 0], ['yellow', 'Yellow', 249, 227, 28], ['green', 'Green', 25, 201, 25],
  ['cyan', 'Cyan', 29, 203, 234], ['blue', 'Blue', 29, 53, 234], ['violet', 'Violet', 155, 29, 234], ['magenta', 'Magenta', 227, 24, 226],
  ['sepia', 'Sepia', 172, 122, 51], ['deepred', 'Deep Red', 255, 0, 0], ['deepblue', 'Deep Blue', 0, 0, 255], ['deepemerald', 'Deep Emerald', 0, 139, 0],
  ['deepyellow', 'Deep Yellow', 255, 222, 0], ['underwater', 'Underwater', 0, 194, 177],
];

/** By film speed: id, label, amount, size, roughness, colour, speckle. */
export const GRAIN_PRESETS: ReadonlyArray<readonly [string, string, number, number, number, number, number]> = [
  ['iso100', 'ISO 100 (fine)', 12, 0.8, 30, 0, 0], ['iso400', 'ISO 400 (classic)', 25, 1.5, 50, 0, 0], ['iso800', 'ISO 800', 35, 2, 60, 0, 0], ['iso1600', 'ISO 1600 (pushed)', 50, 2.8, 70, 0, 0], ['iso3200', 'ISO 3200 (coarse)', 65, 3.6, 80, 0, 0],
  ['slide', 'Slide film (fine, colour)', 14, 0.9, 25, 40, 0], ['negative', 'Colour negative', 30, 1.6, 55, 60, 5], ['bw400', 'Black and white 400', 32, 1.7, 45, 0, 8], ['bwpush', 'Black and white pushed', 55, 2.6, 65, 0, 30], ['cine', 'Cine night stock', 45, 2.2, 70, 80, 15], ['expired', 'Expired film', 60, 3, 80, 100, 40],
];
