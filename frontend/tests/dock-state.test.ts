import { describe, expect, it } from 'vitest';
import { moveLegacy, readSeen, readState, type DockStore } from '../src/dock/state';

function store(init: Record<string, string> = {}): DockStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
}

const sizes = { h: 280, w: 440 };

describe('dock state', () => {
  it('moves the old terminal key into the dock key once and removes it', () => {
    const s = store({ 'formvis.terminal': JSON.stringify({ open: true, h: 300 }) });
    expect(moveLegacy(s, 'formvis.agentDock', ['formvis.terminal'], sizes)).toBe(true);
    expect(s.data.has('formvis.terminal')).toBe(false);
    expect(JSON.parse(s.data.get('formvis.agentDock') ?? '')).toEqual({ open: true, side: 'bottom', h: 300, w: 440, tab: '' });
    s.data.set('formvis.terminal', JSON.stringify({ open: false, h: 150 }));
    expect(moveLegacy(s, 'formvis.agentDock', ['formvis.terminal'], sizes)).toBe(false);
    expect(readState(s, 'formvis.agentDock', ['formvis.terminal'], sizes).h).toBe(300);
  });

  it('keeps height and width apart and reads the side', () => {
    const s = store({ 'formvis.agentDock': JSON.stringify({ open: true, side: 'right', h: 222, w: 512, tab: 'chat' }) });
    expect(readState(s, 'formvis.agentDock', [], sizes)).toEqual({ open: true, side: 'right', h: 222, w: 512, tab: 'chat' });
  });

  it('falls back to closed at the bottom with the default sizes', () => {
    const s = store({ 'formvis.agentDock': '{not json' });
    expect(readState(s, 'formvis.agentDock', [], sizes)).toEqual({ open: false, side: 'bottom', h: 280, w: 440, tab: '' });
    expect(moveLegacy(store(), 'formvis.agentDock', ['formvis.terminal'], sizes)).toBe(false);
  });

  it('reads the guide as seen only when the stored state says so', () => {
    expect(readSeen(store(), 'formvis.agentDock')).toBe(false);
    expect(readSeen(store({ 'formvis.agentDock': JSON.stringify({ open: true, seen: true }) }), 'formvis.agentDock')).toBe(true);
    expect(readSeen(store({ 'formvis.agentDock': '{not json' }), 'formvis.agentDock')).toBe(false);
  });
});
