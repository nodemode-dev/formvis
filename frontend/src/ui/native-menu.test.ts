import { describe, expect, it } from 'vitest';
import { accelerator } from './native-menu';

describe('native menu shortcuts', () => {
  it('turn sonny key combos into Tauri accelerators', () => {
    expect(accelerator('Mod+S')).toBe('CmdOrCtrl+S');
    expect(accelerator('Alt+Mod+W')).toBe('Alt+CmdOrCtrl+W');
    expect(accelerator('Shift+Mod+z')).toBe('Shift+CmdOrCtrl+Z');
    expect(accelerator('Mod+=')).toBe('CmdOrCtrl+=');
    expect(accelerator('Mod++')).toBe('CmdOrCtrl+Plus');
    expect(accelerator('F5')).toBe('F5');
  });

  it('leave off what Tauri has no name for, rather than failing the menu', () => {
    expect(accelerator(undefined)).toBeNull();
    expect(accelerator('Mod+§')).toBeNull();
  });
});
