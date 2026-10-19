import type { Tool } from './registry';

/** A tool that an open dialog lends the stage while it is showing (the Blur Gallery pins): it answers the pointer, the
 *  overlay and the keys in place of the toolbar's tool, and gives them back when the dialog closes. */
let lent: Tool | null = null;
export const setDialogTool = (t: Tool | null): void => { lent = t; };
export const dialogTool = (): Tool | null => lent;
