import { describe, expect, it } from 'vitest';
import './setup';
import { History, type Snapshot } from '../src/engine/history';

const snap = (tag: string): Snapshot => ({ doc: { width: 1, height: 1, layers: [], tag } as never, activeId: null, selection: null });

describe('History', () => {
  it('records a step only when something changed', () => {
    const h = new History(), a = snap('a');
    h.begin('Nothing', a);
    expect(h.end(a)).toBe(false);
    h.begin('Rename', a);
    expect(h.end(snap('b'))).toBe(true);
    expect(h.steps).toEqual({ names: ['Rename'], current: 1 });
  });

  it('keeps nested begins as one step and reports itself open until the outermost end', () => {
    const h = new History();
    h.begin('Outer', snap('a'));
    h.begin('Inner', snap('a'));
    expect(h.open).toBe(true);
    expect(h.end(snap('b'))).toBe(false);
    expect(h.end(snap('c'))).toBe(true);
    expect(h.open).toBe(false);
    expect(h.steps.names).toEqual(['Outer']);
  });

  it('undo and redo move one step and redo is dropped by a new step', () => {
    const h = new History();
    h.begin('One', snap('a')); h.end(snap('b'));
    h.begin('Two', snap('b')); h.end(snap('c'));
    expect(h.undo()?.name).toBe('Two');
    expect(h.canRedo).toBe(true);
    h.begin('Three', snap('b')); h.end(snap('d'));
    expect(h.canRedo).toBe(false);
    expect(h.steps.names).toEqual(['One', 'Three']);
  });

  it('rollback hands back the start and every patch, and closes all levels', () => {
    const h = new History(), a = snap('a');
    const patch = { raster: {} as never, x: 1, y: 2, before: new ImageData(1, 1), after: new ImageData(1, 1) };
    h.begin('Fill', a);
    h.begin('Inner', a);
    h.addPatch(patch);
    const r = h.rollback();
    expect(r?.before).toBe(a);
    expect(r?.patches).toEqual([patch]);
    expect(h.open).toBe(false);
    expect(h.canUndo).toBe(false);
    expect(h.rollback()).toBeNull();
  });

  it('modified follows saves, undo past the save, and markUnsaved', () => {
    const h = new History();
    expect(h.modified).toBe(false);
    h.begin('One', snap('a')); h.end(snap('b'));
    expect(h.modified).toBe(true);
    h.markSaved();
    expect(h.modified).toBe(false);
    h.undo();
    expect(h.modified).toBe(true);
    h.redo();
    expect(h.modified).toBe(false);
    h.markUnsaved();
    expect(h.modified).toBe(true);
  });
});
