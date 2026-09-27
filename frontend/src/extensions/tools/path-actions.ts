import { toolHost, type OptionSpec } from '../registry';

/** The path's actions in the Path and Direct Selection bars (1.49.3, the owner's walkthrough: there was no way to stroke
 *  a path or adjust it from its tools): Make Selection, Fill Path..., Stroke Path... and New Shape Layer, each running
 *  the command the menus and the Paths panel run. */
export const pathActions = (): OptionSpec[] => [
  { kind: 'button', label: 'Make Selection from Path', icon: 'marquee', run: () => toolHost.run('path-selection'), compact: true },
  { kind: 'button', label: 'Fill Path...', icon: 'fill', run: () => toolHost.run('fill-path-dialog'), compact: true },
  { kind: 'button', label: 'Stroke Path...', icon: 'paintbrush', run: () => toolHost.run('stroke-path-dialog'), compact: true },
  { kind: 'button', label: 'New Shape Layer from Path', icon: 'rectTool', run: () => toolHost.run('new-shape-path'), compact: true },
];
