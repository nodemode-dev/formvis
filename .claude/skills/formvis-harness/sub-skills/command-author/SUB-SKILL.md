---
name: command-author
description: Adding or changing a formvis command and its metadata. Use for a new menu item, a keyboard shortcut or its conflicts, a command's enabled or checked state, a toolbar button with data-cmd, the Edit > Keyboard Shortcuts editor, the command palette (Ctrl+K), native macOS menus, action recording, or a plugin command.
---

# command-author

A command is one object registered with `commands.add(...)`. The menu bar, popup menus, toolbar buttons, the command palette, the native macOS menu, the shortcut editor and Actions recording all read the same object, so a command is declared once.

## The Command contract (`frontend/src/ui/commands.ts`)

```ts
interface Command {
  id: string;                      // unique; add() throws on a duplicate
  label: string | (() => string);  // a function for labels that change
  keys?: string[];                 // first one is shown in menus
  icon?: string;                   // an icon key from ui/icons.ts
  run: () => void;
  enabled?: () => boolean;
  checked?: () => boolean;         // draws a check in menus
}
```

`Commands` (same file) offers `add`, `get`, `all`, `run(id)`, `label(cmd)`, `enabled(cmd)`, `keyLabel(cmd)`, `forEvent`, `forCombo`, `setKeys`, `defaultKeys`, `overrides`, `resetKeys`, `remove`, and two hooks: `onRun` (Actions records every command that runs) and `gate` (a document mode can veto a command, for instance a 16 bit document allows only its 16 bit commands).

## Key combos

- Written exactly as `comboOf` writes a press: modifiers in the order `Alt`, `Shift`, `Mod`, then the key: `Alt+Shift+Mod+S`. `Mod` is Command on macOS and Ctrl elsewhere. `frontend/src/ui/key-order.test.ts` fails on any other order (it scans every `keys: [...]` in the sources).
- Browsers keep `Mod+N`, `Mod+W` and `Mod+T`, so give those an `Alt+Mod+` variant first, as `new` does (`['Alt+Mod+N', 'Mod+N']`).
- A key bound twice in the table silently moves to the later command; check `commands.forCombo` or the shortcut editor before taking a common combo.
- A combo ending in `++` means the plus key itself (`formatKeys`).

## Adding a command

1. Add the object inside one of the `commands.add(...)` blocks in `frontend/src/app.ts` (the block that already holds the commands of its menu), with `enabled` built from the helpers at the top of that block (`has`, `layer`, `pixel`, `withPixels`, `selected`).
2. Put its id in the menu tree. Menus are the `menus: MenuDef[]` array in `app.ts` (`{ label, items }`), items are command ids, `'-'` for a separator, or `{ label, items }` for a submenu. The command palette finds a command's menu path from the same tree.
3. For a toolbar or panel button, write `data-cmd="[id]"` in the markup; titles and disabled states are synced for you.
4. If the command opens a dialog, the dialog class lives in `frontend/src/ui/panels/` and extends `Dialog`; see `ui-builder`.
5. If the command changes the document, call an `Engine` method; add it with `engine-builder`.
6. Generated commands: `LIBRARY.map(...)` in `app.ts` makes one `filter-[id]` command per library filter and `adj-[kind]` and `new-adj-[kind]` come from `PARAM_KINDS` and `ADJUSTMENT_KINDS`; add to those tables instead of writing the command by hand (see `filter-library`).
7. Record: HASHOUT entry, `.docs/wiki/Keyboard-Shortcuts.md` when keys change, a sidecar `TEST_PLAN.md` case.

## Native and plugin surfaces

- `frontend/src/ui/native-menu.ts` (`NativeMenus`, `accelerator`) builds the macOS menu bar in the Tauri app from the same `menus` tree; `wantsNativeMenus()` is true only in Tauri on macOS.
- Plugins add commands through `frontend/src/plugins/host.ts`, which calls `commands.add` with ids derived from the plugin name and removes them with `commands.remove` when the plugin is turned off.
- Rebinding is stored through `Preferences` (`Prefs.shortcuts`); never bake a user's overrides into the defaults.
