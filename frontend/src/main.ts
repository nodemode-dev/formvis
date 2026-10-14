import { startApp } from './app';
import { carryOver } from './io/legacy';
import { startLanguage, startPageTranslator } from './ui/i18n';

// Data saved before the rename moves across first (settings, brushes, links, recovery), then the app starts.
// The saved interface language's table is loaded before the interface is built, so nothing shows in English first
// (36.32); the page translator then follows every change.
void carryOver().finally(() => startLanguage().finally(() => { startApp(); startPageTranslator(); }));
