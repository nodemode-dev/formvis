import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IMAGE_ACCEPT, isImageFile } from '../src/io/images';

describe('a Canon .HIF opens like .heic and .heif', () => {
  it('is in the open dialog\'s list', () => { expect(IMAGE_ACCEPT.split(',')).toEqual(expect.arrayContaining(['.heic', '.heif', '.hif'])); });
  it('is a picture when dropped, in any case', () => {
    for (const name of ['IMG_0001.HIF', 'shot.hif', 'a.HEIF', 'b.Heic']) expect(isImageFile(new File([new Uint8Array([0])], name)), name).toBe(true);
  });
  it('is offered by the linked-file picker, the native picker and Home', () => {
    const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
    expect(src('src/io/links.ts')).toContain("'.heic', '.heif', '.hif'");
    expect(src('../src-tauri/src/main.rs')).toContain('"heic", "heif", "hif"');
    expect(src('src/ui/home.ts')).toContain("'HEIC', 'HIF'");
  });
});
