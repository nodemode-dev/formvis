# Languages

The interface comes in 26 languages: English, the source text and the default, and 25 others. This page covers how the translation works and how to add a string. The person's view of it is the manual's "Interface languages" section.

| Source path | What lives there |
| --- | --- |
| `frontend/src/ui/i18n/langs.ts` | The list: `LANG_CODES`, `LANG_NAMES` (each language in its own name, in picker order), `LANG_PARENT` (`es-MX` to `es`, `fr-CA` to `fr`) and `isLang`. It imports nothing, so `prefs.ts` and `i18n.ts` can both read it |
| `frontend/src/ui/i18n.ts` | The loaders, `t()`, `setLanguage`, `startLanguage`, `onLanguage` and the page translator |
| `frontend/src/ui/i18n/<code>.ts` | Part a of a language's table: menus, panel names, dialog titles and buttons, tool names, options bar labels |
| `frontend/src/ui/i18n/more/<code>.ts` | Part b: filters and adjustments, dialog fields, tooltips, notes and messages |
| `frontend/src/ui/i18n/extra/<code>.ts` | Part c: strings the app assembles at run time (tool hint segments, status readouts, Preferences sections) |

## Tables

A table is a plain object keyed by the English text, with the translation as the value. English has no table: `t()` returns its argument. Each language's three parts are separate modules loaded with dynamic `import()` when the language is chosen (and at start for the saved choice), so the app carries only the one it shows. `load()` merges them as `{ ...extra, ...more, ...first }`, so where parts share a key the first part wins.

The regional variants `es-MX` and `fr-CA` have only part a, holding just the words that differ from their parent. `t()` looks in the current table, then the parent's, then returns the English. A string with no entry shows in English; nothing is ever blank.

`t()` sets aside a trailing `...` or `:` before the lookup and puts it back after, so "Save As..." and "Save As" share one entry, and "Size:" shares "Size". Put the entry in the table without the tail unless the translation needs a different one.

## Switching

`setLanguage(l)` loads the tables, sets `document.documentElement.lang`, calls every function registered with `onLanguage(fn)` (which re-label their text in place) and then walks the page once. A later call wins over an earlier one still loading, and a table that fails to load leaves the language as it was. `startLanguage()` runs before the interface is built so that the first paint is already in the saved language. The choice is the `language` preference, set in Preferences > Language.

## The page translator

Most interface text is written once in the DOM and never passes through `t()`. `startPageTranslator()` starts a `MutationObserver` that translates text where it lands, by exact match on the English: a text node is looked up trimmed (up to 200 characters), and the `title`, `aria-label` and `placeholder` attributes are looked up too. Only text that has an entry in the current language is touched. Each changed node or attribute keeps its English in a `WeakMap`, so a later change of language, or a return to English, puts the right text back. Observer callbacks run before the browser paints, so English is never shown first. It is idle in English.

What it skips, because the text belongs to the person: `textarea` and `input` values (their placeholder, title and aria-label are still translated), `script`, `style`, `canvas`, `[contenteditable]`, anything inside `[data-no-i18n]`, and the class list in `SKIP`: the type editor, layer labels, tab names, comp, path and style names, Home names, and the video timeline's clip, lane and header names. If you add a place that shows a name the person typed, give it `data-no-i18n` or add its class to `SKIP`.

Not translated: the manual and the Help window, the assistant's replies, and text a dialog assembles from several pieces in code unless the pieces go through `t()`.

## Adding a string

1. If the string is built in code (a label made from variables, a message), wrap its fixed parts in `t()`. If it is static text in a template, nothing is needed in the code: the page translator finds it.
2. Add the English as a key to each language's table. Pick the part by kind: names of menus, panels, dialogs and tools in part a; fields, tooltips, notes and filter or adjustment names in part b; strings assembled at run time in part c. Leave the key without a trailing `...` or `:`.
3. For `es-MX` and `fr-CA`, add the key only if the word differs from `es` or `fr`.
4. Strings that must stay English (a file format name, a command id) are simply not added.
5. Check a long language (German, Russian, Finnish) for text that overflows: buttons and titles truncate rather than overflow, but a label that wraps can move its neighbours, which breaks the zero-flash rules on [UI Shell](UI-Shell).

Adding a language: add its code to `LANG_CODES` and its own name to `LANG_NAMES` in `langs.ts`, then a loader in `LOADERS` (and, for parts b and c, `MORE` and `EXTRA`) in `i18n.ts`, and the table modules.
