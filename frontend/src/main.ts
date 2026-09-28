import { startApp } from './app';
import { carryOver } from './io/legacy';

// Data saved before the rename moves across first (settings, brushes, links, recovery), then the app starts.
void carryOver().finally(() => startApp());
