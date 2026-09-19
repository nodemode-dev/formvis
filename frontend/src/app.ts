import { Engine, toBlob, type ImportedImage, type Pt } from './engine';
import { toolForKey } from './extensions/registry';
import { registerBuiltinTools } from './extensions/tools';
import { HostLink } from './host';
import { api, type Capabilities, type OpenedProject } from './io/api';
import { IMAGE_ACCEPT, decodeImage, isImageFile, isProjectFile } from './io/images';
import { deserialize, serialize } from './io/project-io';
import { AboutDialog, NewCanvasDialog, OpenDialog, SettingsDialog, ShortcutsDialog } from './ui/app-dialogs';
import { Commands } from './ui/commands';
import { anyDialogOpen, confirmAction, promptName } from './ui/dialogs';
import { el, mountOnce, q, revealApp, setDisabled, setHidden, setStyleVar, setText, setTitle } from './ui/dom';
import { icon } from './ui/icons';
import { LayersPanel } from './ui/layers';
import { MenuBar, PopupMenu, type MenuDef } from './ui/menu';
import { OptionsBar } from './ui/options';
import { invalidatePaint } from './ui/palette';
import { Rail } from './ui/rail';
import { Stage } from './ui/stage';
import { StatusBar } from './ui/status';
import { Tabs } from './ui/tabs';
import { toast } from './ui/toast';

const LAYERS_W_KEY = 'sonny_layers_w';
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function store(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { return; }
}

const SHELL = `<div class="cv-app">
<header class="cv-titlebar">
<div class="cv-brand">${icon('paintbrush', 18)}<span class="cv-brand-name">sonny</span></div>
<nav class="cv-menubar" aria-label="Main menu"></nav>
<div class="cv-tabs"><div class="cv-tab-strip" role="tablist"></div><button class="cv-icon-btn" type="button" data-cmd="new">${icon('add', 16)}</button></div>
<div class="cv-zoom">
<button class="cv-icon-btn" type="button" data-cmd="undo">${icon('undo', 16)}</button>
<button class="cv-icon-btn" type="button" data-cmd="redo">${icon('redo', 16)}</button>
<span class="cv-sep"></span>
<button class="cv-icon-btn" type="button" data-cmd="zoom-out">${icon('zoomOut', 16)}</button>
<span class="cv-zoom-label"></span>
<button class="cv-icon-btn" type="button" data-cmd="zoom-in">${icon('zoomIn', 16)}</button>
<button class="cv-icon-btn" type="button" data-cmd="fit">${icon('fitView', 16)}</button>
<span class="cv-sep"></span>
<button class="cv-icon-btn" type="button" data-cmd="settings">${icon('settings', 16)}</button>
</div>
</header>
<div class="cv-options"></div>
<div class="cv-main">
<aside class="cv-rail" aria-label="Tools"><div class="cv-rail-tools"></div><div class="cv-colors"></div></aside>
<main class="cv-stage">
<canvas class="cv-canvas cv-scene"></canvas>
<canvas class="cv-canvas cv-overlay-canvas"></canvas>
<div class="cv-welcome"><div class="cv-welcome-card">
<div class="cv-welcome-title">${icon('paintbrush', 20)}sonny</div>
<div class="cv-welcome-sub">Layered image compositing. Start a canvas, open a project, or drop images anywhere on this stage.</div>
<div class="cv-welcome-actions"><button class="cv-btn cv-btn-primary" type="button" data-cmd="new">${icon('newFile', 14)}New Canvas</button><button class="cv-btn" type="button" data-cmd="open">${icon('load', 14)}Open Project</button><button class="cv-btn" type="button" data-cmd="import">${icon('image', 14)}Import Images</button></div>
</div></div>
<div class="cv-drop" hidden></div>
</main>
<div class="cv-resizer" role="separator" aria-orientation="vertical" aria-label="Resize the layers panel"></div>
<section class="cv-layers" aria-label="Layers"></section>
</div>
<footer class="cv-status"></footer>
</div>`;

async function readEntry(entry: FileSystemEntry, prefix: string, out: { files: File[]; paths: string[] }): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.files.push(file);
    out.paths.push(prefix + file.name);
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  let batch: FileSystemEntry[];
  do {
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    for (const child of batch) await readEntry(child, `${prefix}${entry.name}/`, out);
  } while (batch.length);
}

export function startApp(): void {
  registerBuiltinTools();
  const appHost = document.getElementById('app');
  if (!appHost) return;
  mountOnce(appHost, SHELL);
  const root = q(appHost, '.cv-app');
  const savedWidth = Number(stored(LAYERS_W_KEY));
  if (savedWidth >= 200 && savedWidth <= 480) setStyleVar(root, '--cv-layers-w', `${savedWidth}px`);

  const engine = new Engine();
  engine.on('notice', (n) => toast(n.text, n.kind));
  const commands = new Commands();
  const contextMenu = new PopupMenu(commands);
  const stage = new Stage(q(root, '.cv-stage'), engine);
  const layers = new LayersPanel(q(root, '.cv-layers'), engine, contextMenu);
  new Rail(q(root, '.cv-rail'), engine);
  new OptionsBar(q(root, '.cv-options'), engine);
  const status = new StatusBar(q(root, '.cv-status'), engine);
  const hostLink = new HostLink(() => undefined, () => undefined);
  let caps: Capabilities | null = null;

  async function deliver(blob: Blob, name: string): Promise<void> {
    if (caps?.desktop) { toast(`Saved to ${await api.exportFile(blob, name)}`); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function openOpened(o: OpenedProject, libraryName: string | null): Promise<void> {
    const { doc, activeId } = await deserialize(o.manifest, (name) => {
      const url = o.images[name];
      return url ? api.fetchAsset(url) : Promise.reject(new Error(`${name} is missing from the project.`));
    });
    const p = engine.addProject(doc, o.name, activeId);
    engine.markSaved(p, p.name, libraryName);
  }

  async function openLibrary(name: string): Promise<boolean> {
    const existing = engine.projects.find((p) => p.libraryName === name && !p.modified);
    if (existing) { engine.switchTo(existing.id); return true; }
    return engine.task(async () => {
      try { await openOpened(await api.openLibrary(name), name); return true; } catch (err) { toast(message(err), 'error'); return false; }
    });
  }

  async function openFiles(files: File[]): Promise<void> {
    await engine.task(async () => {
      for (const f of files) {
        try { await openOpened(await api.importProject([f]), null); } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
      }
    });
  }

  async function openFolder(files: File[], paths: string[]): Promise<void> {
    await engine.task(async () => {
      try { await openOpened(await api.importProject(files, paths), null); } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function importFiles(files: File[], at?: Pt): Promise<void> {
    const projects = files.filter(isProjectFile);
    const images = files.filter((f) => !isProjectFile(f) && isImageFile(f));
    const skipped = files.length - projects.length - images.length;
    if (projects.length) await openFiles(projects);
    if (images.length) {
      await engine.task(async () => {
        const decoded: ImportedImage[] = [];
        for (const f of images) {
          try { decoded.push(await decodeImage(f, f.name)); } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
        }
        engine.insertImages(decoded, at);
      });
    }
    if (skipped) toast(skipped === 1 ? 'One file is not an image or a project and was skipped.' : `${skipped} files are not images or projects and were skipped.`);
  }

  async function save(saveAs: boolean): Promise<boolean> {
    const p = engine.current;
    if (!p) return false;
    let name = saveAs ? null : p.libraryName;
    if (!name) {
      name = await promptName(saveAs ? 'Save As' : 'Save to Library', p.libraryName ?? p.name, 'Save');
      if (!name) return false;
      if (name !== p.libraryName) {
        const taken = (await api.library().catch(() => [])).some((i) => i.name === name);
        if (taken && !(await confirmAction('Replace project?', `${name} already exists in the library.`, 'Replace', true))) return false;
      }
    }
    const target = name;
    return engine.task(async () => {
      const revision = p.history.revision;
      try {
        const { manifest, files } = await serialize(p.doc, p.activeId);
        const res = await api.save(target, manifest, files);
        if (p.history.revision === revision) engine.markSaved(p, res.name, res.name);
        else { p.name = res.name; p.libraryName = res.name; engine.emit('projects', null); }
        toast(`Saved ${res.name}.`);
        return true;
      } catch (err) {
        toast(message(err), 'error');
        return false;
      }
    });
  }

  async function downloadProject(): Promise<void> {
    const p = engine.current;
    if (!p) return;
    await engine.task(async () => {
      try {
        const { manifest, files } = await serialize(p.doc, p.activeId);
        await deliver(await api.package(manifest, files), `${p.name}.sonny`);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function exportImage(kind: 'png' | 'jpg'): Promise<void> {
    const p = engine.current;
    if (!p) return;
    await engine.task(async () => {
      try {
        const blob = await engine.exportBlob(kind === 'png' ? 'image/png' : 'image/jpeg');
        if (blob) await deliver(blob, `${p.name}.${kind}`);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function removeBackground(method: 'auto' | 'lite'): Promise<void> {
    const l = engine.activeLayer;
    if (!l?.raster || l.isGroup) { toast('Select a pixel layer first.'); return; }
    const raster = l.raster;
    await engine.task(async () => {
      try {
        const { mask, method: used } = await api.removeBackground(await toBlob(raster.canvas), method);
        const bitmap = await createImageBitmap(mask);
        engine.setMaskFromImage(l.id, bitmap, raster.width, raster.height, 'Remove Background');
        bitmap.close();
        toast(`Background removed with the ${used === 'ml' ? 'ML' : 'lightweight'} engine. The result is a layer mask you can refine.`);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function sendToHost(): Promise<void> {
    const p = engine.current;
    const blob = p ? await engine.exportBlob('image/png') : null;
    if (!p || !blob) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    hostLink.assign([{ name: `${p.name}.png`, mime: 'image/png', width: p.doc.width, height: p.doc.height, dataUrl }]);
    toast('Sent to the NodeMode canvas.');
  }

  async function requestClose(id: string): Promise<void> {
    const p = engine.projects.find((x) => x.id === id);
    if (!p) return;
    if (p.modified && !(await confirmAction('Close without saving?', `${p.name} has changes that are not saved.`, 'Close', true))) return;
    engine.closeProject(id);
  }

  const imageInput = el<HTMLInputElement>(`<input type="file" multiple accept="${IMAGE_ACCEPT}" hidden>`);
  document.body.appendChild(imageInput);
  imageInput.addEventListener('change', () => {
    const files = Array.from(imageInput.files ?? []);
    imageInput.value = '';
    if (files.length) void importFiles(files);
  });

  const dialogs = {
    newCanvas: new NewCanvasDialog(engine),
    open: new OpenDialog({ openLibrary, openFiles, openFolder }),
    settings: new SettingsDialog(),
    shortcuts: new ShortcutsDialog(commands),
    about: new AboutDialog(),
  };

  const has = (): boolean => !!engine.current;
  const layer = () => engine.activeLayer;
  const pixel = (): boolean => { const l = engine.activeLayer; return !!l && !l.isGroup && !l.adjustment; };
  const withPixels = (): boolean => pixel() && !!engine.activeLayer?.raster;
  const selected = (): boolean => !!engine.current?.selection;

  commands.add(
    { id: 'new', label: 'New Canvas...', keys: ['Alt+Mod+N', 'Mod+N'], run: () => dialogs.newCanvas.show() },
    { id: 'open', label: 'Open Project...', keys: ['Mod+O'], run: () => void dialogs.open.show() },
    { id: 'import', label: 'Import Images...', keys: ['Shift+Mod+O'], run: () => imageInput.click() },
    { id: 'save', label: 'Save', keys: ['Mod+S'], enabled: has, run: () => void save(false) },
    { id: 'save-as', label: 'Save As...', keys: ['Shift+Mod+S'], enabled: has, run: () => void save(true) },
    { id: 'download-project', label: 'Download Project File', enabled: has, run: () => void downloadProject() },
    { id: 'export-png', label: 'Export PNG', keys: ['Shift+Mod+E'], enabled: has, run: () => void exportImage('png') },
    { id: 'export-jpg', label: 'Export JPEG', enabled: has, run: () => void exportImage('jpg') },
    { id: 'send-host', label: 'Send to NodeMode Canvas', enabled: () => has() && hostLink.embedded, run: () => void sendToHost() },
    { id: 'close-tab', label: 'Close Tab', keys: ['Alt+Mod+W'], enabled: has, run: () => { const p = engine.current; if (p) void requestClose(p.id); } },
    { id: 'undo', label: () => { const h = engine.current?.history; return h?.canUndo ? `Undo ${h.undoName}` : 'Undo'; }, keys: ['Mod+Z'], enabled: () => !!engine.current?.history.canUndo, run: () => engine.undo() },
    { id: 'redo', label: () => { const h = engine.current?.history; return h?.canRedo ? `Redo ${h.redoName}` : 'Redo'; }, keys: ['Shift+Mod+Z', 'Mod+Y'], enabled: () => !!engine.current?.history.canRedo, run: () => engine.redo() },
    { id: 'fill-fg', label: 'Fill with Foreground', keys: ['Alt+Backspace', 'Alt+Delete'], enabled: pixel, run: () => engine.fill('fg') },
    { id: 'fill-bg', label: 'Fill with Background', keys: ['Mod+Backspace', 'Mod+Delete'], enabled: pixel, run: () => engine.fill('bg') },
    { id: 'clear', label: 'Clear Selection Pixels', enabled: () => pixel() && selected(), run: () => engine.clearPixels() },
    { id: 'delete', label: 'Delete', keys: ['Backspace', 'Delete'], enabled: () => !!layer(), run: () => (selected() && pixel() ? engine.clearPixels() : engine.deleteLayers()) },
    { id: 'settings', label: 'Settings...', keys: ['Mod+,'], run: () => dialogs.settings.show() },
    { id: 'invert', label: 'Invert', keys: ['Mod+I'], enabled: pixel, run: () => engine.invertPixels() },
    { id: 'remove-bg', label: 'Remove Background', enabled: withPixels, run: () => void removeBackground('auto') },
    { id: 'remove-bg-lite', label: 'Remove Background (Lightweight)', enabled: withPixels, run: () => void removeBackground('lite') },
    { id: 'flip-canvas-h', label: 'Flip Canvas Horizontal', enabled: has, run: () => engine.flipCanvas(true) },
    { id: 'flip-canvas-v', label: 'Flip Canvas Vertical', enabled: has, run: () => engine.flipCanvas(false) },
    { id: 'new-layer', label: 'New Layer', keys: ['Shift+Mod+N'], enabled: has, run: () => engine.addLayer() },
    { id: 'new-folder', label: 'New Folder', enabled: has, run: () => engine.addFolder() },
    { id: 'duplicate', label: 'Duplicate Layer', keys: ['Mod+J'], enabled: () => !!layer(), run: () => engine.duplicateLayers() },
    { id: 'delete-layer', label: 'Delete Layer', enabled: () => !!layer(), run: () => engine.deleteLayers() },
    { id: 'rename', label: 'Rename Layer', enabled: () => !!layer(), run: () => { const l = layer(); if (l) layers.startRename(l.id); } },
    { id: 'group', label: 'Group Layers', keys: ['Mod+G'], enabled: () => !!layer(), run: () => engine.groupLayers() },
    { id: 'move-out', label: 'Move Out of Folder', keys: ['Shift+Mod+G'], enabled: () => !!layer()?.parentId, run: () => engine.moveOutOfFolder() },
    { id: 'add-mask', label: 'Add Layer Mask', enabled: () => !!layer() && !layer()?.mask, run: () => engine.addMask(false) },
    { id: 'add-mask-hide', label: 'Add Mask Hiding All', enabled: () => !!layer() && !layer()?.mask, run: () => engine.addMask(true) },
    { id: 'apply-mask', label: 'Apply Layer Mask', enabled: () => withPixels() && !!layer()?.mask, run: () => engine.deleteMask(true) },
    { id: 'delete-mask', label: 'Delete Layer Mask', enabled: () => !!layer()?.mask, run: () => engine.deleteMask(false) },
    { id: 'toggle-mask', label: () => (layer()?.mask?.enabled === false ? 'Enable Layer Mask' : 'Disable Layer Mask'), enabled: () => !!layer()?.mask, run: () => engine.toggleMaskEnabled() },
    { id: 'link-mask', label: () => (layer()?.mask?.linked === false ? 'Link Layer Mask' : 'Unlink Layer Mask'), enabled: () => !!layer()?.mask, run: () => engine.toggleMaskLink() },
    { id: 'clip', label: () => (layer()?.clipId ? 'Release Clipping Mask' : 'Create Clipping Mask'), keys: ['Alt+Mod+G'], enabled: () => !!layer() && !layer()?.isGroup, run: () => engine.toggleClip() },
    { id: 'merge', label: () => ((engine.current?.selectedIds.size ?? 0) > 1 ? 'Merge Layers' : layer()?.isGroup ? 'Merge Group' : 'Merge Down'), keys: ['Mod+E'], enabled: () => !!layer(), run: () => engine.mergeLayers() },
    { id: 'flip-layer-h', label: 'Flip Layer Horizontal', enabled: withPixels, run: () => engine.flipLayers(true) },
    { id: 'flip-layer-v', label: 'Flip Layer Vertical', enabled: withPixels, run: () => engine.flipLayers(false) },
    { id: 'forward', label: 'Bring Forward', keys: ['Mod+]'], enabled: () => !!layer(), run: () => engine.moveActive(1) },
    { id: 'backward', label: 'Send Backward', keys: ['Mod+['], enabled: () => !!layer(), run: () => engine.moveActive(-1) },
    { id: 'blend-next', label: 'Next Blend Mode', keys: ['Shift+='], enabled: pixel, run: () => engine.cycleBlend(true) },
    { id: 'blend-prev', label: 'Previous Blend Mode', keys: ['Shift+-'], enabled: pixel, run: () => engine.cycleBlend(false) },
    { id: 'select-all', label: 'All', keys: ['Mod+A'], enabled: has, run: () => engine.selectAll() },
    { id: 'deselect', label: 'Deselect', keys: ['Mod+D'], enabled: selected, run: () => engine.deselect() },
    { id: 'inverse', label: 'Inverse', keys: ['Shift+Mod+I'], enabled: selected, run: () => engine.invertSelection() },
    { id: 'layer-pixels', label: "Layer's Pixels", enabled: () => !!layer()?.raster, run: () => engine.selectLayerPixels() },
    { id: 'zoom-in', label: 'Zoom In', keys: ['Mod+='], enabled: has, run: () => engine.zoomStep(true) },
    { id: 'zoom-out', label: 'Zoom Out', keys: ['Mod+-'], enabled: has, run: () => engine.zoomStep(false) },
    { id: 'fit', label: 'Fit on Screen', keys: ['Mod+0'], enabled: has, run: () => engine.fit() },
    { id: 'actual', label: 'Actual Pixels', keys: ['Mod+1'], enabled: has, run: () => engine.zoomTo(1) },
    { id: 'pixel-grid', label: 'Pixel Grid', checked: () => engine.showPixelGrid, run: () => engine.update({ showPixelGrid: !engine.showPixelGrid }) },
    { id: 'transform-controls', label: 'Transform Controls', checked: () => engine.showTransformControls, run: () => engine.update({ showTransformControls: !engine.showTransformControls }) },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', keys: ['Shift+/'], run: () => dialogs.shortcuts.show() },
    { id: 'about', label: 'About sonny', run: () => dialogs.about.show(caps) },
  );

  const menus: MenuDef[] = [
    { label: 'File', items: ['new', 'open', 'import', '-', 'save', 'save-as', 'download-project', '-', 'export-png', 'export-jpg', ...(hostLink.embedded ? ['send-host'] : []), '-', 'close-tab'] },
    { label: 'Edit', items: ['undo', 'redo', '-', 'fill-fg', 'fill-bg', 'clear', '-', 'settings'] },
    { label: 'Image', items: ['invert', '-', 'remove-bg', 'remove-bg-lite', '-', 'flip-canvas-h', 'flip-canvas-v'] },
    { label: 'Layer', items: ['new-layer', 'new-folder', 'duplicate', 'delete-layer', 'rename', '-', 'group', 'move-out', '-', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'flip-layer-h', 'flip-layer-v', '-', 'forward', 'backward'] },
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'layer-pixels'] },
    { label: 'View', items: ['zoom-in', 'zoom-out', 'fit', 'actual', '-', 'pixel-grid', 'transform-controls'] },
    { label: 'Help', items: ['shortcuts', 'about'] },
  ];
  const menubar = new MenuBar(q(root, '.cv-menubar'), commands, menus);
  contextMenu.setItems(['duplicate', 'delete-layer', 'rename', '-', 'group', 'move-out', '-', 'add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', '-', 'clip', 'merge', '-', 'layer-pixels']);
  new Tabs(q(root, '.cv-tab-strip'), engine, (id) => void requestClose(id));

  const zoomLabel = q(root, '.cv-zoom-label');
  let chromeFrame = 0;
  const syncChrome = (): void => {
    if (chromeFrame) return;
    chromeFrame = requestAnimationFrame(() => {
      chromeFrame = 0;
      for (const b of Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-cmd]'))) {
        const cmd = commands.get(b.dataset.cmd ?? '');
        if (!cmd) continue;
        setDisabled(b, !commands.enabled(cmd));
        const label = commands.label(cmd).replace(/\.\.\.$/, '');
        const keys = commands.keyLabel(cmd);
        setTitle(b, keys ? `${label} (${keys})` : label);
        if (b.classList.contains('cv-icon-btn') && b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
      }
      const p = engine.current;
      setText(zoomLabel, p ? `${Math.round(p.viewport.zoom * 100)}%` : '');
    });
  };
  for (const k of ['projects', 'history', 'active', 'doc', 'selection', 'viewport', 'options', 'tool'] as const) engine.on(k, syncChrome);
  syncChrome();

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-cmd]');
    if (b && root.contains(b) && !b.disabled) commands.run(b.dataset.cmd ?? '');
  });

  const resizer = q(root, '.cv-resizer');
  resizer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add('is-dragging');
    const startX = e.clientX;
    const startW = q(root, '.cv-layers').getBoundingClientRect().width;
    const move = (ev: PointerEvent): void => {
      const w = Math.round(Math.min(480, Math.max(200, startW - (ev.clientX - startX))));
      setStyleVar(root, '--cv-layers-w', `${w}px`);
    };
    const up = (ev: PointerEvent): void => {
      if (resizer.hasPointerCapture(ev.pointerId)) resizer.releasePointerCapture(ev.pointerId);
      resizer.classList.remove('is-dragging');
      resizer.removeEventListener('pointermove', move);
      resizer.removeEventListener('pointerup', up);
      resizer.removeEventListener('pointercancel', up);
      store(LAYERS_W_KEY, String(Math.round(q(root, '.cv-layers').getBoundingClientRect().width)));
    };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', up);
    resizer.addEventListener('pointercancel', up);
  });

  window.addEventListener('keydown', (e) => {
    if (anyDialogOpen() || e.defaultPrevented) return;
    if (menubar.isOpen || contextMenu.isOpen) {
      if (e.key === 'Escape') { e.preventDefault(); menubar.close(); contextMenu.close(); }
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.code === 'Space' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (!e.repeat) stage.setSpace(true); return; }
    if (stage.toolKeydown(e)) { e.preventDefault(); return; }
    const cmd = commands.forEvent(e);
    if (cmd) {
      e.preventDefault();
      if (!e.repeat || /^(undo|redo|zoom-in|zoom-out)$/.test(cmd.id)) commands.run(cmd.id);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const k = e.code.startsWith('Key') ? e.code.slice(3) : '';
    if (!k) return;
    if (k === 'X') engine.swapColors();
    else if (k === 'D') engine.defaultColors();
    else if (k === 'E') { engine.setTool('brush'); engine.setBrushMode('erase'); }
    else if (k === 'B') { engine.setTool('brush'); engine.setBrushMode('paint'); }
    else if (k === 'M' && e.shiftKey) { engine.setTool('marquee'); engine.update({ marqueeKind: engine.marqueeKind === 'rectangle' ? 'ellipse' : 'rectangle' }); }
    else if (k === 'L' && e.shiftKey) { engine.setTool('lasso'); engine.update({ lassoKind: engine.lassoKind === 'freehand' ? 'polygonal' : 'freehand' }); }
    else if (!e.shiftKey && toolForKey(k)) engine.setTool(toolForKey(k)?.id ?? engine.tool);
    else return;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') stage.setSpace(false); });
  window.addEventListener('blur', () => stage.setSpace(false));

  document.addEventListener('paste', (e) => {
    const target = e.target as HTMLElement | null;
    if (anyDialogOpen() || target?.closest('input, textarea, [contenteditable="true"]')) return;
    const files = Array.from(e.clipboardData?.files ?? []).filter(isImageFile);
    if (!files.length) return;
    e.preventDefault();
    void importFiles(files.map((f, i) => (f.name ? f : new File([f], `Pasted ${i + 1}.png`, { type: f.type }))));
  });

  const drop = q(root, '.cv-drop');
  let dragDepth = 0;
  const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  root.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth += 1; setHidden(drop, false); });
  root.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
  root.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) setHidden(drop, true); });
  root.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    setHidden(drop, true);
    const at = stage.docPoint(e.clientX, e.clientY) ?? undefined;
    const items = Array.from(e.dataTransfer?.items ?? []).filter((i) => i.kind === 'file');
    const folders: FileSystemEntry[] = [];
    const files: File[] = [];
    for (const item of items) {
      const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
      if (entry?.isDirectory) { folders.push(entry); continue; }
      const f = item.getAsFile();
      if (f) files.push(f);
    }
    if (!items.length) files.push(...Array.from(e.dataTransfer?.files ?? []));
    void (async () => {
      for (const entry of folders) {
        const out = { files: [] as File[], paths: [] as string[] };
        try { await readEntry(entry, '', out); await openFolder(out.files, out.paths); } catch (err) { toast(message(err), 'error'); }
      }
      if (files.length) await importFiles(files, at);
    })();
  });

  let restyleFrame = 0;
  const syncThemeMarker = (): void => {
    const mode = document.body.classList.contains('theme-light') ? 'light' : 'dark';
    if (document.documentElement.dataset.theme !== mode) document.documentElement.dataset.theme = mode;
  };
  const restyle = (): void => {
    if (restyleFrame) return;
    restyleFrame = requestAnimationFrame(() => {
      restyleFrame = 0;
      syncThemeMarker();
      invalidatePaint();
      stage.restyle();
      layers.restyle();
    });
  };
  new MutationObserver(restyle).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
  new MutationObserver(restyle).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('nm:ui-settings-changed', restyle);
  syncThemeMarker();

  window.addEventListener('beforeunload', (e) => {
    if (!engine.projects.some((p) => p.modified)) return;
    e.preventDefault();
    e.returnValue = '';
  });

  status.setEngine('Engine: checking');
  void api.capabilities().then((c) => {
    caps = c;
    status.setEngine(c ? `Engine ${c.version}${c.desktop ? ' · desktop' : ''}` : 'Engine offline');
    if (!c) toast('The sonny engine is offline. Editing works; library saves, HEIC and TIFF import and Remove Background need it (./sonny boot).');
  });

  if (import.meta.env.DEV) (window as unknown as { sonny: unknown }).sonny = { engine, commands };

  const faces = Promise.all(['400', '500', '600'].map((w) => document.fonts.load(`${w} 12px Inter`))).catch(() => undefined);
  void Promise.race([faces, new Promise((r) => window.setTimeout(r, 2500))]).then(() => requestAnimationFrame(() => revealApp()));
}
