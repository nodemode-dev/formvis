import { describe, expect, it } from 'vitest';
import manual from '../../../docs/MANUAL.md?raw';   // as the Help dialog imports it
import { relevant, sections } from './markdown';

describe('the manual (1.52.3)', () => {
  it('splits into its sections, titles and bodies', () => {
    const all = sections(manual);
    expect(all.length).toBeGreaterThanOrEqual(12);
    expect(all.map((s) => s.title)).toContain('ComfyUI');
    expect(all.find((s) => s.title === 'Exporting')?.body).toContain('OpenRaster');
  });

  it('finds the sections most about a question', () => {
    const all = sections(manual);
    expect(relevant(all, 'How do I send the selection to ComfyUI?')[0].title).toBe('ComfyUI');
    expect(relevant(all, 'Where is the AI label written?')[0].title).toBe('Exporting');
    expect(relevant(all, 'How do outside agents like Codex and Cursor connect?')[0].title).toBe('The assistant and outside agents');
    expect(relevant(all, 'zzz qqq')).toEqual([]);
    expect(relevant(all, 'How do I open a very large picture?')[0].title).toBe('Getting started');   // 1.52.7
    expect(relevant(all, 'Where are my API keys kept?')[0].title).toBe('Generating images');
  });
});
