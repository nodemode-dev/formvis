import { describe, expect, it } from 'vitest';
import raw from '../../../src-tauri/tauri.conf.json?raw';   // ?raw, as the build's type check knows no node:fs

// Plugins in the desktop app (1.53.4): each plugin runs in a frame sandboxed to scripts alone, from srcdoc, so the
// desktop window's content security policy must not block inline scripts in frames. None is set now; a policy added
// later must allow them, or plugins would silently stop working in the desktop app.
const conf = JSON.parse(raw) as { app?: { security?: { csp?: unknown } } };

describe('the desktop window lets plugins run (1.53.4)', () => {
  it('sets no policy, or one that allows the sandboxed frame\'s inline scripts', () => {
    const csp = conf.app?.security?.csp;
    if (csp === null || csp === undefined) return;
    const text = typeof csp === 'string' ? csp : Object.entries(csp as Record<string, string>).map(([k, v]) => `${k} ${v}`).join('; ');
    const scripts = /script-src[^;]*/.exec(text)?.[0] ?? /default-src[^;]*/.exec(text)?.[0] ?? '';
    expect(scripts, 'a policy must allow the plugin frame\'s inline scripts').toMatch(/'unsafe-inline'/);
    expect(/frame-src[^;]*|child-src[^;]*|default-src[^;]*/.exec(text)?.[0] ?? '', 'and srcdoc frames').toMatch(/'self'|about:|\*/);
  });
});
