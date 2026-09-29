import { ErrorLog } from './ui/errors';
import { FillDialog } from './ui/panels/fill-dialog';
import { ExportDialog } from './ui/panels/export-dialog';
import { GuideDialog } from './ui/panels/guide-dialog';
import { ArtboardDialog } from './ui/panels/artboard-dialog';
import { CornersDialog } from './ui/panels/corners-dialog';
import { StrokePathDialog } from './ui/panels/stroke-path-dialog';
import { DuplicateLayerDialog, NewGroupDialog, NewLayerDialog } from './ui/panels/layer-dialogs';
import { LiquifyDialog } from './ui/panels/liquify-dialog';
import { SelectMaskDialog } from './ui/panels/select-mask-dialog';
import { ContentFillDialog } from './ui/panels/content-fill-dialog';
import { GradientEditor, loadSavedGradients } from './ui/panels/gradient-editor';
import { pickLinkSource, placeLinked, relink, updateLinked } from './io/links';
import { importAbr, loadImportedBrushes } from './io/brush-library';
import { SPACES, convertPixels, iccProfile } from './engine/icc';
import { embedJpeg, embedPng } from './io/embed-icc';
import { exportLayout, ENGINE_FORMATS, exportName, exportSize, type ExportSettings } from './io/export-presets';
import { PARAM_KINDS } from './engine/adjust-params';
import { recovery } from './io/recovery';
import { TrimDialog } from './ui/panels/trim-dialog';
import { ColorRangeDialog } from './ui/panels/color-range-dialog';
import { HistoryPanel } from './ui/history';
import { StopDialog } from './ui/panels/stop-dialog';
import { TweenDialog } from './ui/panels/tween-dialog';
import { GifDialog } from './ui/panels/gif-dialog';
import { TimelinePanel } from './ui/timeline';
import { AnimationDialog } from './ui/panels/animation-dialog';
import { encodeGif, type GifFrame } from './io/gif';
import { ShapeStyleDialog } from './ui/panels/shape-style-dialog';
import { PathsPanel } from './ui/paths';
import { SmartFiltersDialog } from './ui/panels/smart-filters-dialog';
import { Actions, RECORDABLE, type Action, type ActionStep } from './ui/actions';
import { ActionsDialog, BatchDialog } from './ui/panels/actions-dialogs';
import { zipFiles } from './io/zip';
import { isPsdFile, readPsdFile, writePsdFile } from './io/psd';
import { isOraFile, readOraFile, writeOra } from './io/ora';
import { withAiLabel } from './io/ai-label';
import { TextEditor } from './ui/text-editor';
import { TextDialog } from './ui/panels/text-dialog';
import { BrushSettingsDialog } from './ui/panels/brush-settings';
import { WarpTextDialog } from './ui/panels/warp-text-dialog';
import { TypeOnPathDialog } from './ui/panels/type-on-path-dialog';
import { ParagraphStylesDialog } from './ui/panels/paragraph-styles';
import { LayerStyleDialog } from './ui/panels/layer-style-dialog';
import { GenerativeDialog } from './ui/panels/generative-dialog';
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, Engine, Raster, SelectionMask, stripExt, toBlob, type ImportedImage, type Pt, effectsActive, liveText, ctxOf, createSurface, type AdjustmentKind, effectsFromData, runFilterOffThread, addPattern, allPatterns, patternById, projectPatterns } from './engine';
import { toolForKey, toolsForKey } from './extensions/registry';
import { registerBuiltinTools } from './extensions/tools';
import { HostLink } from './host';
import { api, type Capabilities, type OpenedProject } from './io/api';
import { IMAGE_ACCEPT, RAW_FILE, decodeImage, isImageFile, isProjectFile } from './io/images';
import { loadSystemFonts } from './ui/fonts';
import { deserialize, serialize } from './io/project-io';
import { AboutDialog, BenchmarkDialog, NewCanvasDialog, OpenDialog, SettingsDialog, ShortcutsDialog } from './ui/app-dialogs';
import { CHECKER_CELL, CHECKER_PAIR, applyPrefs, loadPrefs, savePrefs, type Prefs } from './ui/prefs';
import { chooseRenderer, detectedName, gpuStartFailedLastTime, markGpuStarted, markGpuStarting, probeGpu, type GpuProbe } from './gpu/probe';
import { GpuDisplay, type ScreenDisplay } from './gpu/display';
import { benchText, runBenchmark } from './gpu/bench';
import { GlDisplay } from './gpu/gl-display';
import { NativeDisplay } from './gpu/native-display';
import { NavigatorPanel } from './ui/navigator';
import { SwatchesPanel } from './ui/swatches';
import { PropertiesColumn } from './ui/properties';
import { TitleTools } from './ui/titlebar-tools';
import { InfoPanel } from './ui/info';
import { NoteDialog } from './ui/panels/note-dialog';
import { ModeDialog } from './ui/app-dialogs';
import { SendDialog } from './ui/panels/send-to';
import { RunWorkflowDialog } from './ui/panels/comfyui-run';
import { GenerateImageDialog } from './ui/panels/generate-image';
import { ColorMatchDialog } from './ui/panels/color-match';
import { FilmLayerDialog } from './ui/panels/film-layer';
import { Model3DDialog } from './ui/panels/model3d';
import { AgentConfirmDialog } from './ui/panels/agent-confirm';
import { AgentBridge } from './automation/agent-bridge';
import { toolHost } from './extensions/registry';
import { Viewport } from './engine/viewport';
import { enhanceAllSelects } from './ui/dropdown';
import { PanelGroup } from './ui/panel-group';
import { ChannelsPanel } from './ui/channels';
import { NativeMenus, wantsNativeMenus } from './ui/native-menu';
import { rendererFallback } from './gpu/fallback';
import { HomeScreen } from './ui/home';
import { ALL_PANELS, Dock, registerPanel, unregisterPanel } from './ui/dock';
import { AdjustPanel } from './ui/panels/adjust-panel';
import { FILTER_LABELS, FilterPanel, type FilterKind, runFilter, defaultFilterSettings, type FilterPanelSettings, filterMargin } from './ui/panels/filter-panel';
import { AmountDialog, CanvasSizeDialog, ImageSizeDialog } from './ui/panels/size-dialogs';
import { JpegDialog } from './ui/panels/jpeg-dialog';
import { BackgroundPanel } from './ui/panels/background-panel';
import { ColorPickerDialog } from './ui/panels/color-picker';
import { LiveMaskDialog } from './ui/panels/live-mask-dialog';
import { Commands } from './ui/commands';
import { anyDialogOpen, askSaveChanges, confirmAction, promptName } from './ui/dialogs';
import { el, mountOnce, q, revealApp, setDisabled, setHidden, setStyleVar, setText, setTitle } from './ui/dom';
import { icon } from './ui/icons';
import { brandMark } from './ui/brand';
import { LayersPanel } from './ui/layers';
import { MenuBar, PopupMenu, type MenuDef } from './ui/menu';
import { OptionsBar } from './ui/options';
import { invalidatePaint } from './ui/palette';
import { Rail } from './ui/rail';
import { slotTool, toolGroups } from './ui/tool-groups';
import { Stage } from './ui/stage';
import { StatusBar } from './ui/status';
import { Tabs } from './ui/tabs';
import { toast } from './ui/toast';

/** Each tab's own group, where Reset Panels returns it. */
const TAB_HOMES: Record<string, string> = { info: 'info', layers: 'layers-panel', channels: 'layers-panel', paths: 'layers-panel', navigator: 'navigator', swatches: 'swatches', color: 'swatches', properties: 'properties', brushes: 'brushes', 'brush-settings': 'brushes', paragraph: 'paragraph', character: 'character' };
const LAYERS_W_KEY = 'formvis_layers_w';
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function store(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { return; }
}

const SHELL = `<div class="cv-app">
<header class="cv-titlebar">
<div class="cv-brand">${icon('paintbrush', 18)}<span class="cv-brand-name">formvis</span></div>
<nav class="cv-menubar" aria-label="Main menu"></nav>
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
<div class="cv-main">
<div class="cv-options"></div>
<aside class="cv-rail" aria-label="Tools"><button class="cv-rail-toggle" type="button" data-cmd="rail-columns" title="One or two columns" aria-label="One or two columns">${icon('collapseRight', 14)}</button><div class="cv-rail-tools"></div><div class="cv-colors"></div><div class="cv-rail-modes"><button class="cv-tool cv-mode-btn" type="button" data-cmd="quick-mask" title="Edit in Quick Mask Mode (Q)" aria-label="Edit in Quick Mask Mode">${icon('quickMask', 18)}</button><button class="cv-tool cv-mode-btn" type="button" data-cmd="screen-next" title="Change Screen Mode (F)" aria-label="Change Screen Mode">${icon('screenMode', 18)}</button></div></aside>
<div class="cv-stage-col">
<div class="cv-doc-tabs"><div class="cv-tabs"><div class="cv-tab-strip" role="tablist"></div><button class="cv-icon-btn" type="button" data-cmd="new">${icon('add', 16)}</button></div></div>
<main class="cv-stage">
<canvas class="cv-canvas cv-scene-gpu" hidden></canvas>
<canvas class="cv-canvas cv-scene-gpu cv-scene-gl" hidden></canvas>
<canvas class="cv-canvas cv-scene-gpu cv-scene-native" hidden></canvas>
<canvas class="cv-canvas cv-scene"></canvas>
<canvas class="cv-canvas cv-overlay-canvas"></canvas>
<canvas class="cv-ruler cv-ruler-h" hidden></canvas>
<canvas class="cv-ruler cv-ruler-v" hidden></canvas>
<div class="cv-welcome"><div class="cv-welcome-card">
<div class="cv-welcome-title">${brandMark(28)}formvis</div>
<div class="cv-welcome-sub">Layered image compositing. Start a canvas, open a project, or drop images anywhere on this stage.</div>
<div class="cv-welcome-actions"><button class="cv-btn cv-btn-primary" type="button" data-cmd="new">${icon('newFile', 14)}New Canvas</button><button class="cv-btn" type="button" data-cmd="open">${icon('load', 14)}Open Project</button><button class="cv-btn" type="button" data-cmd="import">${icon('image', 14)}Import Images</button></div>
</div></div>
<div class="cv-drop" hidden></div>
</main>
</div>
<section class="cv-props-col" aria-label="Properties"></section>
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
  const errorLog = new ErrorLog((t) => toast(t, 'error'), () => engine.failures);
  errorLog.install();
  const commands = new Commands();
  const contextMenu = new PopupMenu(commands, null, true);
  // Panel menus (the target's •••): each group's own commands, opened below its button.
  const panelMenu = new PopupMenu(commands, null, true);
  toolHost.run = (id) => { commands.run(id); };   // a tool's bar runs commands (the path actions)
  PanelGroup.menuHost = (anchor, ids) => { panelMenu.setItems(ids); const r = anchor.getBoundingClientRect(); panelMenu.openAt(r.right, r.bottom + 4); };
  // Screen modes and panels, as Photoshop's (the owner's walkthrough): Standard, Full Screen with Menu Bar (no tabs or
  // status bar), Full Screen (the canvas alone, on black; Esc leaves it); F cycles them; Tab shows or hides the panels.
  // The rail: Quick Mask (Q) below the colours, and its one or two columns (the » at its top), remembered.
  type Screen = 'standard' | 'menu' | 'full';
  let screen: Screen = 'standard', panelsHidden = false;
  const applyScreen = (): void => {
    root.classList.toggle('is-screen-menu', screen === 'menu');
    root.classList.toggle('is-screen-full', screen === 'full');
    root.classList.toggle('is-panels-hidden', panelsHidden || screen === 'full');
    window.dispatchEvent(new Event('resize'));
  };
  const setScreen = (s: Screen): void => { screen = s; applyScreen(); };
  const railDouble = (): boolean => stored('formvis.railDouble') === '1';
  const applyRail = (): void => { q(root, '.cv-rail').classList.toggle('is-double', railDouble()); window.dispatchEvent(new Event('resize')); };
  commands.add(
    { id: 'quick-mask', label: 'Edit in Quick Mask Mode', keys: ['Q'], checked: () => engine.quickMask, enabled: () => !!engine.current, run: () => engine.toggleQuickMask() },
    { id: 'screen-standard', label: 'Standard Screen Mode', checked: () => screen === 'standard', run: () => setScreen('standard') },
    { id: 'screen-menu', label: 'Full Screen Mode with Menu Bar', checked: () => screen === 'menu', run: () => setScreen('menu') },
    { id: 'screen-full', label: 'Full Screen Mode', checked: () => screen === 'full', run: () => setScreen('full') },
    { id: 'screen-next', label: 'Change Screen Mode', keys: ['F'], run: () => setScreen(screen === 'standard' ? 'menu' : screen === 'menu' ? 'full' : 'standard') },
    { id: 'toggle-panels', label: 'Show or Hide Panels', keys: ['Tab'], checked: () => !panelsHidden, run: () => { panelsHidden = !panelsHidden; applyScreen(); } },
    { id: 'rail-columns', label: 'Tools in Two Columns', checked: railDouble, run: () => { store('formvis.railDouble', railDouble() ? '0' : '1'); applyRail(); } },
  );
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && screen === 'full') { setScreen('standard'); e.preventDefault(); } }, true);
  engine.on('options', () => q(root, '.cv-rail [data-cmd="quick-mask"]').classList.toggle('is-on', engine.quickMask));
  applyRail();
  applyPrefs(engine, loadPrefs());
  const stage = new Stage(q(root, '.cv-stage'), engine);
  // Preferences the interface draws with (the engine's are applyPrefs'): the stage's checkerboard, wheel, rulers, grid
  // and guides, and the side column's narrow-window icons.
  const applyUiPrefs = (pr: Prefs): void => {
    Stage.prefs = { cell: CHECKER_CELL[pr.checkerSize], zoomWheel: pr.zoomWheel, rulerUnits: pr.rulerUnits, gridColor: pr.gridColor, guideColor: pr.guideColor };
    const [a, b] = CHECKER_PAIR[pr.checkerColors];
    document.documentElement.style.setProperty('--cv-checker-a', a);
    document.documentElement.style.setProperty('--cv-checker-b', pr.checkerSize === 'none' ? a : b);
    PropertiesColumn.narrowCollapse = pr.narrowCollapse;
    stage.restyle();
    window.dispatchEvent(new Event('resize'));
  };
  applyUiPrefs(loadPrefs());
  const typing = new TextEditor(q(root, '.cv-stage'), engine);
  // The Properties column (Phase 21), shown unless hidden from Window > Properties Column (remembered).
  const props = new PropertiesColumn(q(root, '.cv-props-col'), engine, (c) => { commands.run(c); }, () => syncPropsCol());
  let dockRef: Dock | null = null;   // the side column shows only while it holds a shown panel (panels move: the Dock)
  const propsShown = (): boolean => stored('formvis.propsCol') !== 'hidden';
  const sideOpen = (): boolean => propsShown() && (dockRef ? dockRef.sideShown() > 0 : true);
  const syncPropsCol = (): void => { setHidden(q(root, '.cv-props-col'), !sideOpen()); setStyleVar(root, '--cv-props-w', sideOpen() ? '46px' : '0px'); Viewport.insetRight = sideOpen() && !PropertiesColumn.showingCollapsed ? PropertiesColumn.openWidth() - 46 : 0; };   // the strip's track only: expanded, the column lies over the canvas (the owner's walkthrough), and fitting leaves it out
  syncPropsCol();
  new NavigatorPanel(q(root, '.cv-layers'), engine);
  const swatches = new SwatchesPanel(q(root, '.cv-layers'), engine);
  const layers = new LayersPanel(q(root, '.cv-layers'), engine, contextMenu);
  new PathsPanel(q(root, '.cv-layers'), engine);
  layers.adoptPaths(q(root, '.cv-paths'));
  layers.adoptChannels(new ChannelsPanel(engine, q(root, '.cv-stage')));   // the Channels tab (Phase 21)
  new TimelinePanel(q(root, '.cv-layers'), engine);
  new HistoryPanel(q(root, '.cv-layers'), engine);
  // Groups made by detaching a tab (1.49.2) come back where they were: made (empty) before the dock reads its
  // arrangement, filled when the tabs' homes are restored.
  const CUSTOM = 'formvis.customGroups';
  const customGroups = (): Array<{ id: string; label: string }> => { try { const v = JSON.parse(stored(CUSTOM) ?? '[]'); return Array.isArray(v) ? v.filter((g) => g && typeof g.id === 'string' && /^g[0-9a-z]+$/.test(g.id) && typeof g.label === 'string') : []; } catch { return []; } };
  for (const g of customGroups()) { new PanelGroup(q(root, '.cv-layers'), g.id, [], g.label); registerPanel({ id: g.id, label: g.label, selector: `section.cv-${g.id}` }); }
  new InfoPanel(q(root, '.cv-layers'), engine, q(root, '.cv-stage'));   // Window > Info (1.49.6)
  const dock = new Dock(q(root, '.cv-layers'), q(root, '.cv-props-col'));
  dockRef = dock;
  dock.onChange = () => { syncPropsCol(); props.relayout(); };
  syncPropsCol();
  props.relayout();
  // Tabs moved between groups (dragged onto another group's header) are restored, and re-lay out the columns.
  // A group made by detaching a tab goes once empty (built-in groups only hide).
  const dropEmptyGroups = (): void => {
    const keep = customGroups().filter((g) => { const pg = PanelGroup.all.get(g.id); if (pg && pg.size > 0) return true; pg?.remove(); dock.removePanel(g.id); unregisterPanel(g.id); return false; });
    store(CUSTOM, JSON.stringify(keep));
  };
  PanelGroup.onMoved = () => { dropEmptyGroups(); dock.refresh(); props.relayout(); };
  // A tab released over a column's gap becomes a new group there, as Photoshop's; the marker says so while dragging.
  PanelGroup.onGapHint = (x, y) => { if (x === null) dock.hideGap(); else dock.showGap(x, y, 'New group'); };
  PanelGroup.onDetach = (tid, from, x, y) => {
    const at = dock.gapAt(x, y);
    if (!at || from.size < 2) return false;
    const id = `g${Date.now().toString(36)}`, label = from.labelOf(tid);
    const g = new PanelGroup(at.host, id, [], label);
    registerPanel({ id, label, selector: `section.cv-${id}` });
    store(CUSTOM, JSON.stringify([...customGroups(), { id, label }]));
    dock.insertPanel(id, at.col, at.index);
    PanelGroup.moveTab(tid, from, g);
    return true;
  };
  PanelGroup.restoreHomes();
  // Collapsed, the column is its strip of icons; expanded, the width chosen by dragging (or the target's 288).
  const syncDockWidth = (on: boolean): void => { const w = Number(stored(LAYERS_W_KEY)); setStyleVar(root, '--cv-layers-w', on ? '46px' : `${w >= 200 && w <= 480 ? w : 288}px`); q(root, '.cv-resizer').classList.toggle('is-inert', on); };   // kept in the grid (hiding it would move the dock into its column)
  dock.onCollapse = syncDockWidth;
  if (dock.collapsed) syncDockWidth(true);
  // The title bar's tools (Phase 21): theme, command search, workspaces, Lock Workspace.
  enhanceAllSelects();   // every dropdown as the glass list (the owner's walkthrough)
  new TitleTools(q(root, '.cv-titlebar'), {
    commands,
    arrange: (w) => { dock.arrange(w.order, w.hidden); store('formvis.propsCol', w.propsColumn ? 'shown' : 'hidden'); syncPropsCol(); },
    locked: () => dock.locked,
    setLocked: (on) => { dock.locked = on; },
  });
  dock.locked = dock.locked;
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
    const { doc, activeId, paths, timeline } = await deserialize(o.manifest, (name) => {
      const url = o.images[name];
      return url ? api.fetchAsset(url) : Promise.reject(new Error(`${name} is missing from the project.`));
    });
    const p = engine.addProject(doc, o.name, activeId);
    if (paths) engine.setPathsOf(p, paths);
    if (timeline) engine.setTimelineFor(p, timeline);
    engine.markSaved(p, p.name, libraryName);
  }

  /** the Open Recent (the system's recent documents, noted on every save and open): the ten library projects
   *  most recently saved or opened in this app, newest first, kept in this browser or desktop app's storage. */
  const RECENT_KEY = 'formvis.recent';
  let recent: string[] = [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    if (Array.isArray(stored)) recent = stored.filter((n): n is string => typeof n === 'string' && !!n).slice(0, 10);
  } catch { recent = []; }
  function keepRecent(next: string[]): void {
    recent = next.slice(0, 10);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* storage unavailable: the list lasts this session */ }
  }
  const noteRecent = (name: string): void => keepRecent([name, ...recent.filter((n) => n !== name)]);

  async function openLibrary(name: string): Promise<boolean> {
    const existing = engine.projects.find((p) => p.libraryName === name && !p.modified);
    if (existing) { engine.switchTo(existing.id); return true; }
    return engine.task(async () => {
      try { await openOpened(await api.openLibrary(name), name); noteRecent(name); return true; } catch (err) { if (/not found/i.test(message(err))) keepRecent(recent.filter((n) => n !== name)); toast(message(err), 'error'); return false; }
    });
  }

  // The Home screen over the canvas; the brand mark is its Home button, as Photoshop's.
  const home = new HomeScreen(q(root, '.cv-stage'), {
    engine, autoShow: () => loadPrefs().autoShowHome, recent: () => recent,
    openRecent: (name) => { void openLibrary(name); }, run: (c) => { commands.run(c); },
  });
  const brand = q(root, '.cv-brand');
  brand.setAttribute('role', 'button');
  brand.setAttribute('tabindex', '0');
  brand.setAttribute('aria-label', 'Home');
  brand.title = 'Home';
  brand.addEventListener('click', () => home.show());
  brand.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); home.show(); } });

  // Graphics processor (Phase 18.1): a start that never finished last time turns Use Graphics Processor off, as
  // Photoshop does after a driver crash; then the GPU is probed and the renderer chosen and shown.
  let gpuProbe: GpuProbe = { webgpu: null, webgl2: null }, gpuProbed = false;
  // The screen display for the chosen API, on that API's own canvas (a canvas takes one kind of context); a failed
  // start or a lost device is remembered per API, so losing WebGPU does not rule out WebGL2.
  let gpuDisplay: ScreenDisplay | null = null, gpuKind: 'webgpu' | 'webgl2' | 'native' | null = null, gpuStarting = false;
  const gpuFailed = new Set<'webgpu' | 'webgl2' | 'native'>();
  function syncGpu(): void {
    if (!gpuProbed) return;
    const pr = loadPrefs(), ch = chooseRenderer(gpuProbe, pr.useGpu, pr.renderer), adapterName = ch.adapter ? `${ch.adapter.name}${ch.adapter.software ? ' (software)' : ''}` : '';
    const want = ch.mode === 'cpu' ? null : ch.mode;
    if (gpuDisplay && gpuKind !== want) { gpuDisplay.destroy(); gpuDisplay = null; gpuKind = null; }
    if (want && !gpuDisplay && !gpuStarting && !gpuFailed.has(want)) {
      gpuStarting = true;
      markGpuStarting();
      const started = (d: ScreenDisplay | null): void => {
        markGpuStarted();
        gpuStarting = false;
        if (d) { gpuDisplay = d; gpuKind = want; d.onLost = () => { gpuDisplay = null; gpuKind = null; gpuFailed.add(want); syncGpu(); }; } else gpuFailed.add(want);
        syncGpu();
      };
      if (want === 'webgpu') void GpuDisplay.create(q<HTMLCanvasElement>(root, '.cv-scene-gpu:not(.cv-scene-gl):not(.cv-scene-native)')).then(started);
      else if (want === 'native') void NativeDisplay.create(q<HTMLCanvasElement>(root, '.cv-scene-native')).then(started);
      else started(GlDisplay.create(q<HTMLCanvasElement>(root, '.cv-scene-gl')));
    }
    const off = rendererFallback({ mode: ch.mode, chosenReason: ch.reason, displayReady: !!gpuDisplay, displayFailed: !!want && gpuFailed.has(want) });
    const live = off ? null : gpuDisplay, api = ch.mode === 'webgl2' ? 'WebGL2' : ch.mode === 'native' ? 'Native GPU' : 'WebGPU';
    const name = ch.mode === 'native' && gpuDisplay instanceof NativeDisplay ? gpuDisplay.adapter : adapterName;
    const cpuWhy = off ?? ch.reason;
    stage.setGpu(live, pr.gpuMemoryMB * 1024 * 1024, live ? (reason) => status.setGpu(reason ? 'GPU: CPU' : `GPU: ${api}`, reason ? `${api} is on, but ${reason}, so it draws on the CPU` : `${name}: ${ch.reason}`) : null);
    if (!live) status.setGpu('GPU: CPU', cpuWhy);
    else status.setGpu(`GPU: ${api}`, `${name}: ${ch.reason}`);
    dialogs.settings.setGpu(detectedName(gpuProbe), live ? api : 'CPU', live ? ch.reason : cpuWhy);
  }
  void (async () => {
    if (gpuStartFailedLastTime()) {
      savePrefs({ ...loadPrefs(), useGpu: false });
      engine.notice('The graphics processor did not start last time, so Use Graphics Processor is now off. It can be turned on again in Preferences > Performance.');
    }
    markGpuStarting();
    gpuProbe = await probeGpu();
    markGpuStarted();
    gpuProbed = true;
    syncGpu();
  })();

  async function openFiles(files: File[]): Promise<void> {
    await engine.task(async () => {
      for (const f of files) {
        try {
          if (isOraFile(f)) {   // OpenRaster (1.51.7)
            const { doc, notes } = await readOraFile(f);
            engine.addProject(doc, f.name.replace(/\.ora$/i, ''), null);
            if (notes.length) toast(notes.join(' '), 'info');
          } else if (isPsdFile(f)) {
            const { doc, notes, activeId, paths } = await readPsdFile(f);
            const opened = engine.addProject(doc, f.name.replace(/\.ps[db]$/i, ''), activeId);
            if (paths) engine.setPathsOf(opened, paths);
            if (notes.length) toast(notes.join(' '), 'info');
          } else await openOpened(await api.importProject([f]), null);
        } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
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
        // A single camera RAW opens into Develop, as Photoshop opens RAW files into Camera Raw.
        if (decoded.length === 1 && RAW_FILE.test(decoded[0].name)) commands.run('filter-develop');
      });
    }
    if (skipped) toast(skipped === 1 ? 'One file is not an image or a project and was skipped.' : `${skipped} files are not images or projects and were skipped.`);
  }

  async function save(saveAs: boolean): Promise<boolean> {
    const p = engine.current;
    if (!p) return false;
    engine.settle();
    if (!saveAs && engine.isContents(p)) {
      // A document opened by Edit Contents saves back into its smart object rather than to the library.
      const into = engine.contentsOf(p)?.parent.name;
      const ok = engine.updateContents();
      if (ok) toast(`Updated the smart object in ${into}.`);
      return ok;
    }
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
        const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathsOf(p), engine.timelineFor(p));
        const res = await api.save(target, manifest, files);
        if (p.history.revision === revision) engine.markSaved(p, res.name, res.name);
        else { p.name = res.name; p.libraryName = res.name; engine.emit('projects', null); }
        toast(`Saved ${res.name}.`);
        noteRecent(res.name);
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
    engine.settle();
    await engine.task(async () => {
      try {
        const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathsOf(p), engine.timelineFor(p));
        await deliver(await api.package(manifest, files), `${p.name}.fmv`);
      } catch (err) { toast(message(err), 'error'); }
    });
  }


  /** deleting a layer that other layers are clipped to asks whether to bake
   *  their masked look or remove the links; with no such layers it deletes at once. */
  async function deleteLayersWithChoice(): Promise<void> {
    const p = engine.current;
    if (!p) return;
    if (!engine.liveMaskDependents().length) { engine.deleteLayers(); return; }
    const choice = await dialogs.liveMask.choose(p.selectedIds.size > 1);
    if (choice) engine.deleteLayers(choice === 'bake');
  }

  /** File > Export As: the composite scaled by the settings, then encoded (PNG, JPEG and WebP by the browser, JPEG
   *  flattened on white; AVIF, TIFF and PDF by the engine), named as Photoshop names scaled exports. */
  async function exportAs(s: ExportSettings): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const base = await engine.exportBlob('image/png');
        if (!base) return;
        // By Scale, Fit Within or a Frame (1.51.8): a frame's margins are transparent, or white in JPEG.
        const bmp = await createImageBitmap(base), L = exportLayout(bmp.width, bmp.height, s), z = { w: L.w, h: L.h }, c = createSurface(z.w, z.h), x = ctxOf(c);
        if (s.format === 'jpg') { x.fillStyle = '#ffffff'; x.fillRect(0, 0, z.w, z.h); }
        x.imageSmoothingQuality = 'high';
        x.drawImage(bmp, L.dx, L.dy, L.dw, L.dh);
        bmp.close();
        // Colour: formvis works in sRGB; another profile converts the pixels, and every format but PDF carries the
        // profile (WebP through the engine when it is not sRGB, as the browser's WebP encoder cannot embed one).
        const space = s.profile ?? 'srgb', icc = iccProfile(space);
        if (space !== 'srgb') { const img = x.getImageData(0, 0, z.w, z.h); convertPixels(img.data, 'srgb', space); x.putImageData(img, 0, 0); }
        const viaEngine = ENGINE_FORMATS.has(s.format) || (s.format === 'webp' && space !== 'srgb');
        const blob = viaEngine ? await api.encode(await toBlob(c), s.format as 'avif' | 'tiff' | 'pdf' | 'webp', s.quality, p.doc.resolution ?? 72, s.format === 'pdf' || (s.format === 'webp' && space === 'srgb') ? null : icc)
          : s.format === 'png' ? await embedPng(await toBlob(c, 'image/png'), icc, SPACES[space].label)
          : s.format === 'jpg' ? await embedJpeg(await toBlob(c, 'image/jpeg', s.quality / 100), icc)
          : await toBlob(c, 'image/webp', s.quality / 100);
        // The AI label (1.51.8), in PNG, JPEG and WebP.
        await deliver(s.aiLabel && s.aiLabel !== 'none' ? await withAiLabel(blob, s.format, s.aiLabel) : blob, exportName(p.name, s));
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function exportImage(kind: 'png' | 'jpg' | 'webp' | 'tiff' | 'pdf' | 'avif', quality = 0.92): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const blob = kind === 'png' || kind === 'jpg' ? await engine.exportBlob(kind === 'png' ? 'image/png' : 'image/jpeg', quality)
          : kind === 'webp' ? await engine.exportBlob('image/webp', quality)
          : await (async () => { const png = await engine.exportBlob('image/png'); return png ? api.encode(png, kind, Math.round(quality * 100), p.doc.resolution ?? 72) : null; })();
        if (blob) await deliver(blob, `${p.name}.${kind === 'tiff' ? 'tif' : kind}`);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** One recorded step on the current document: a command through the registry, a filter with its settings, or a
   *  size change through the engine. False when it cannot run here. */
  async function runStep(s: ActionStep, relative = false): Promise<boolean | 'stopped'> {
    if (s.kind === 'stop') return (await dialogs.stop.ask(s.message, s.allowContinue)) ? true : 'stopped';
    if (s.kind === 'command') return commands.run(s.id);
    if (s.kind === 'filter') {
      if (!s.ask) return dialogs.filter.applySettings(s.filter as FilterKind, s.settings);
      // Paused for input: the dialog opens with the recorded settings; Cancel stops the action.
      const chosen = await dialogs.filter.ask(s.filter as FilterKind, s.settings);
      return chosen ? dialogs.filter.applySettings(s.filter as FilterKind, chosen) : 'stopped';
    }
    if (s.kind === 'adjustment' && s.ask && !s.layer) {
      const chosen = await dialogs.adjust.askImage(s.adj as AdjustmentKind, s.data as Parameters<typeof dialogs.adjust.applySettings>[1]);
      return chosen ? dialogs.adjust.applySettings(s.adj as AdjustmentKind, chosen, false) : 'stopped';
    }
    if (s.kind === 'layerStyle') return engine.applyLayerStyle(s.effects ? effectsFromData(s.effects) : null);
    if (s.kind === 'adjustment') return dialogs.adjust.applySettings(s.adj as AdjustmentKind, s.data as Parameters<typeof dialogs.adjust.applySettings>[1], s.layer);
    const doc = engine.current?.doc, follow = relative && !!doc && !!s.fromW && !!s.fromH;
    if (s.kind === 'imageSize') {
      // Following each image: the same proportion of this document as of the one the step was recorded on.
      const w = follow ? Math.max(1, Math.round(((doc as NonNullable<typeof doc>).width * s.w) / (s.fromW as number))) : s.w;
      const h = follow ? Math.max(1, Math.round(((doc as NonNullable<typeof doc>).height * s.h) / (s.fromH as number))) : s.h;
      return engine.resampleImage(w, h, s.sampling as Parameters<typeof engine.resampleImage>[2], s.res);
    }
    // Following each image: the same pixels added (or taken) on each side, placed the same way.
    const w = follow ? Math.max(1, (doc as NonNullable<typeof doc>).width + s.w - (s.fromW as number)) : s.w;
    const h = follow ? Math.max(1, (doc as NonNullable<typeof doc>).height + s.h - (s.fromH as number)) : s.h;
    return engine.resizeCanvas(w, h, s.dx, s.dy, s.fill);
  }

  async function playAction(x: Action): Promise<void> {
    if (!engine.current) { toast('Open a document to play an action on.'); return; }
    engine.settle();
    const r = await actions.play(x, (s) => runStep(s, !!x.relative));
    if (r.stopped) toast(`"${x.name}" stopped at step ${r.done + 1}.`);
    else if (r.failed) toast(`"${x.name}" stopped at step ${r.done + 1}, ${r.failed}, which could not run here.`, 'error');
    else toast(`Played "${x.name}", ${r.done} step${r.done === 1 ? '' : 's'}.`);
  }

  /** Batch: each file opens as a document, plays the action, is exported and closed; the results download as one zip. */
  async function runBatch(x: Action, files: File[], format: 'png' | 'jpg', quality: number): Promise<void> {
    await engine.task(async () => {
      const out: Array<{ name: string; blob: Blob }> = [], problems: string[] = [], used = new Set<string>();
      for (const f of files) {
        try {
          const p = engine.openImage(await decodeImage(f, f.name));
          const r = await actions.play(x, (s) => runStep(s, !!x.relative));
          if (r.stopped) { engine.closeProject(p.id); problems.push(`stopped at ${f.name}`); break; }
          if (r.failed) problems.push(`${f.name} stopped at ${r.failed}`);
          engine.settle();
          const blob = await engine.exportBlob(format === 'png' ? 'image/png' : 'image/jpeg', quality);
          const base = f.name.replace(/\.[^.]+$/, '') || 'image';
          let name = `${base}.${format}`;
          for (let k = 2; used.has(name); k++) name = `${base} ${k}.${format}`;
          used.add(name);
          if (blob) out.push({ name, blob });
          engine.closeProject(p.id);
        } catch (err) { problems.push(`${f.name}: ${message(err)}`); }
      }
      if (out.length) await deliver(await zipFiles(out), `${x.name} batch.zip`);
      if (problems.length) toast(`Batch finished ${out.length} of ${files.length}. ${problems.join('. ')}.`, 'error');
      else toast(`Batch finished all ${files.length} image${files.length === 1 ? '' : 's'}.`);
    });
  }

  /** File > Export GIF: every frame of the timeline at full size, or the image as it stands when there are no frames. */
  async function exportGif(scale = 1): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const t = engine.timeline, frames = t.frames.length ? t.frames : [null], out: GifFrame[] = [];
        const w = Math.max(1, Math.round(p.doc.width * scale)), h = Math.max(1, Math.round(p.doc.height * scale));
        for (const f of frames) {
          const s = engine.renderFrame(f);
          if (!s) return;
          if (scale === 1) out.push({ data: ctxOf(s).getImageData(0, 0, s.width, s.height), delayMs: f?.delay ?? 0 });
          else {
            const small = createSurface(w, h), c = ctxOf(small);
            c.imageSmoothingQuality = 'high';
            c.drawImage(s as CanvasImageSource, 0, 0, w, h);
            out.push({ data: c.getImageData(0, 0, w, h), delayMs: f?.delay ?? 0 });
          }
          await new Promise((r) => window.setTimeout(r, 0));
        }
        const bytes = encodeGif(out, w, h, t.loops);
        await deliver(new Blob([bytes], { type: 'image/gif' }), `${p.name}.gif`);
        toast(out.length > 1 ? `Exported ${out.length} frames as a GIF.` : 'Exported as a GIF.');
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** The pattern library: patterns defined here, kept in this browser as PNG data. */
  const PATTERN_KEY = 'formvis.patterns';
  async function loadPatterns(): Promise<void> {
    let list: Array<{ id: string; name: string; png: string }> = [];
    try { list = JSON.parse(localStorage.getItem(PATTERN_KEY) ?? '[]'); } catch { list = []; }
    for (const p of Array.isArray(list) ? list : []) {
      if (typeof p?.id !== 'string' || typeof p.png !== 'string' || patternById(p.id)) continue;
      try {
        const bmp = await createImageBitmap(await (await fetch(p.png)).blob()), s = createSurface(bmp.width, bmp.height);
        ctxOf(s).drawImage(bmp, 0, 0);
        addPattern(typeof p.name === 'string' ? p.name : 'Pattern', s, p.id);
      } catch { /* skip an unreadable pattern */ }
    }
  }
  async function savePatterns(): Promise<boolean> {
    const list: Array<{ id: string; name: string; png: string }> = [];
    for (const p of allPatterns()) {
      if (p.builtin || projectPatterns.has(p.id)) continue;
      const blob = await toBlob(p.surface), png = await new Promise<string>((done) => { const r = new FileReader(); r.onload = () => done(String(r.result)); r.readAsDataURL(blob); });
      list.push({ id: p.id, name: p.name, png });
    }
    try { localStorage.setItem(PATTERN_KEY, JSON.stringify(list)); return true; } catch { return false; }
  }

  /** Edit > Define Pattern: the visible image within the selection, or the whole canvas, up to 1024 px a side. */
  async function definePattern(): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    const flat = engine.flattened();
    if (!flat) return;
    const sel = p.selection, x = sel ? Math.max(0, Math.floor(sel.x)) : 0, y = sel ? Math.max(0, Math.floor(sel.y)) : 0;
    const w = Math.min(flat.width - x, sel ? Math.ceil(sel.w) : flat.width), h = Math.min(flat.height - y, sel ? Math.ceil(sel.h) : flat.height);
    if (w < 1 || h < 1) return;
    if (w > 1024 || h > 1024) { toast('A pattern can be at most 1024 by 1024 pixels. Select a smaller area first.', 'error'); return; }
    let n = 1;
    while (allPatterns().some((q) => q.name === `Pattern ${n}`)) n += 1;
    const name = await promptName('Define Pattern', `Pattern ${n}`, 'OK');
    if (!name) return;
    const s = createSurface(w, h);
    ctxOf(s).drawImage(flat as CanvasImageSource, -x, -y);
    addPattern(name, s);
    if (await savePatterns()) toast(`Defined the pattern "${name}". Choose it in Layer Style > Pattern Overlay.`);
    else toast(`Defined "${name}" for this session; the pattern library is full, so it will not be kept.`, 'error');
  }

  /** File > Export Artboards to Files: each artboard alone, cut to its rectangle, as a PNG named after it, together
   *  in one zip (a browser will not take many downloads at once). */
  async function exportArtboards(): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const boards = engine.artboards(p), files: Array<{ name: string; blob: Blob }> = [];
        for (const b of boards) {
          const img = engine.artboardImage(b.id);
          if (img) files.push({ name: `${b.name}.png`, blob: await toBlob(img, 'image/png') });
        }
        if (!files.length) { toast('There are no artboards to export.', 'info'); return; }
        await deliver(await zipFiles(files), `${p.name} artboards.zip`);
        toast(`Exported ${files.length} artboard${files.length === 1 ? '' : 's'}.`, 'info');
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** File > Export > OpenRaster (1.51.7): layers, groups, positions, opacity, visibility and blend modes, for Krita,
   *  GIMP and MyPaint. */
  async function exportOra(): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const composite = engine.flattened();
        if (!composite) return;
        const { blob, notes } = await writeOra(p.doc, composite, (l) => engine.renderLayerAlone(l.id));
        await deliver(blob, `${p.name}.ora`);
        if (notes.length) toast(notes.join(' '), 'info');
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function exportPsd(psb = false): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const flat = engine.flattened();
        if (!flat) return;
        const { bytes, notes } = await writePsdFile(p.doc, flat, psb, engine.pathsOf(p));
        await deliver(new Blob([bytes], { type: 'image/vnd.adobe.photoshop' }), `${p.name}.${psb ? 'psb' : 'psd'}`);
        if (notes.length) toast(notes.join(' '), 'info');
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
        if (engine.activeLayer?.id !== l.id) { bitmap.close(); return; }
        dialogs.background.show(l.id, bitmap);
        toast(`Subject found with the ${used === 'ml' ? 'ML' : 'lightweight'} engine.`);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** Select > Subject: the visible image goes to the background engine and its subject mask comes back as the
   *  selection, one step. Select > Object in Selection does the same inside the current selection's bounds (draw a
   *  marquee around one object first), keeping only what falls inside that selection. */
  async function selectSubject(withinSelection: boolean): Promise<void> {
    const p = engine.current;
    if (!p) return;
    const sel = p.selection, box = withinSelection && sel ? { x: sel.x, y: sel.y, w: sel.w, h: sel.h } : { x: 0, y: 0, w: p.doc.width, h: p.doc.height };
    if (withinSelection && !sel) { toast('Draw a selection around the object first.'); return; }
    const flat = engine.flattened(), crop = createSurface(box.w, box.h);
    if (!flat) return;
    ctxOf(crop).drawImage(flat, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    await engine.task(async () => {
      try {
        const { mask, method: used } = await api.removeBackground(await toBlob(crop), 'auto');
        const bitmap = await createImageBitmap(mask), m = createSurface(box.w, box.h), c = ctxOf(m);
        c.drawImage(bitmap, 0, 0, box.w, box.h);
        bitmap.close();
        const px = c.getImageData(0, 0, box.w, box.h).data, data = new Uint8Array(box.w * box.h);
        for (let i = 0; i < data.length; i++) data[i] = withinSelection && sel && !sel.valueAt(box.x + (i % box.w), box.y + Math.floor(i / box.w)) ? 0 : px[i * 4];
        if (engine.current !== p) return;
        if (!data.some((v) => v >= 128)) { toast('No subject was found there.'); return; }
        engine.applySelection(SelectionMask.cropped(box.x, box.y, box.w, box.h, data), 'replace', withinSelection ? 'Select Object' : 'Select Subject');
        toast(`${withinSelection ? 'Object' : 'Subject'} selected with the ${used === 'ml' ? 'ML' : 'lightweight'} engine.`);
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
    if (p.modified) {
      // As the target's Unsaved Changes: Save closes only once the save succeeds; Cancel keeps the document open.
      const choice = await askSaveChanges(p.name);
      if (choice === 'cancel') return;
      if (choice === 'save') {
        if (engine.current !== p) engine.switchTo(p.id);
        if (!(await save(false))) return;
      }
    }
    engine.closeProject(id);
  }

  const imageInput = el<HTMLInputElement>(`<input type="file" multiple accept="${IMAGE_ACCEPT}" data-role="import-images" hidden>`);
  document.body.appendChild(imageInput);
  const replaceInput = el<HTMLInputElement>(`<input type="file" accept="${IMAGE_ACCEPT}" data-role="replace-contents" hidden>`);
  document.body.appendChild(replaceInput);
  /** One file picked through a fresh input, for links in browsers without file handles; null when cancelled. */
  const pickOnce = (): Promise<File | null> => new Promise((resolve) => {
    const i = el<HTMLInputElement>(`<input type="file" accept="${IMAGE_ACCEPT}" data-role="link-file" hidden>`);
    const done = (f: File | null): void => { resolve(f); i.remove(); };
    i.addEventListener('change', () => done(i.files?.[0] ?? null), { once: true });
    i.addEventListener('cancel', () => done(null), { once: true });
    document.body.appendChild(i);
    i.click();
  });
  const linkError = (err: unknown): void => { toast(message(err), 'error'); };
  replaceInput.addEventListener('change', () => {
    const f = replaceInput.files?.[0];
    replaceInput.value = '';
    if (!f) return;
    void engine.task(async () => {
      try {
        const img = await decodeImage(f, f.name), r = new Raster(img.width, img.height);
        r.ctx.drawImage(img.source, 0, 0);
        engine.replaceContents(r);
      } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
    });
  });
  imageInput.addEventListener('change', () => {
    const files = Array.from(imageInput.files ?? []);
    imageInput.value = '';
    if (files.length) void importFiles(files);
  });

  const actions = new Actions();
  const dialogs = {
    smartFilters: new SmartFiltersDialog(engine, (): FilterPanel => dialogs.filter),
    shapeStyle: new ShapeStyleDialog(engine),
    animation: new AnimationDialog(engine),
    gif: new GifDialog(engine, (k) => exportGif(k)),
    tween: new TweenDialog(engine),
    stop: new StopDialog(),
    trim: new TrimDialog(engine),
    colorRange: new ColorRangeDialog(engine),
    actions: new ActionsDialog(actions, { play: (x) => playAction(x), save: (b, n) => deliver(b, n) }),
    batch: new BatchDialog(actions, (x, f, fmt, q) => runBatch(x, f, fmt, q)),
    generative: new GenerativeDialog(engine),
    layerStyle: new LayerStyleDialog(engine),
    text: new TextDialog(engine),
    newCanvas: new NewCanvasDialog(engine),
    jpeg: new JpegDialog(engine),
    background: new BackgroundPanel(engine),
    color: new ColorPickerDialog(engine),
    liveMask: new LiveMaskDialog(),
    open: new OpenDialog({ openLibrary, openFiles, openFolder }),
    settings: new SettingsDialog((pr) => { applyPrefs(engine, pr); applyUiPrefs(pr); recoveryDelay = pr.recoverySeconds * 1000; home.sync(); syncGpu(); syncEngineDevice(); }),
    shortcuts: new ShortcutsDialog(commands),
    about: new AboutDialog(),
    brushSettings: new BrushSettingsDialog(engine),
    warpText: new WarpTextDialog(engine),
    typeOnPath: new TypeOnPathDialog(engine),
    paragraphStyles: new ParagraphStylesDialog(engine),
    benchmark: new BenchmarkDialog(async () => benchText(await runBenchmark(engine), gpuProbed ? detectedName(gpuProbe) ?? 'none found' : 'not detected yet')),
    adjust: new AdjustPanel(engine),
    filter: new FilterPanel(engine),
    canvasSize: new CanvasSizeDialog(engine),
    imageSize: new ImageSizeDialog(engine),
    amount: new AmountDialog(engine),
    fill: new FillDialog(engine, () => commands.run('content-fill')),
    exportAs: new ExportDialog(engine, (s) => void exportAs(s)),
    guide: new GuideDialog(engine),
    artboard: new ArtboardDialog(engine),
    corners: new CornersDialog(engine),
    strokePath: new StrokePathDialog(engine),
    newLayer: new NewLayerDialog(engine),
    duplicateLayer: new DuplicateLayerDialog(engine),
    newGroup: new NewGroupDialog(engine),
    liquify: new LiquifyDialog(engine),
    selectMask: new SelectMaskDialog(engine),
    contentFill: new ContentFillDialog(engine),
    gradientEditor: new GradientEditor(engine),
  };
  loadSavedGradients();
  engine.uiHooks.gradientEditor = () => dialogs.gradientEditor.show();
  void loadImportedBrushes().then(() => engine.emit('options', null));
  const abrInput = el<HTMLInputElement>('<input type="file" accept=".abr" data-role="import-brushes" hidden>');
  document.body.appendChild(abrInput);
  dialogs.settings.workspaceLock = { get: () => dock.locked, set: (on) => { dock.locked = on; } };   // Preferences > Workspace
  // Photoshop's question before painting a type, shape or smart-object layer (1.50.2): rasterize it, or leave it.
  engine.askRasterize = (name, kind) => confirmAction(`Rasterize this ${kind}?`, `"${name}" must be rasterized before it can be painted on. Its ${kind === 'type layer' ? 'text' : kind === 'Smart Object' ? 'contents' : 'shape'} will no longer be editable.`, 'Rasterize');
  const noteDialog = new NoteDialog(engine);
  const modeDialog = new ModeDialog(engine);
  const sendNodeMode = new SendDialog(engine, (t) => toast(t));
  const sendComfyUI = new SendDialog(engine, (t) => toast(t), 'comfyui');
  const runWorkflow = new RunWorkflowDialog(engine, (t) => toast(t));
  const generateImage = new GenerateImageDialog(engine, (t) => toast(t));
  const colorMatch = new ColorMatchDialog(engine);
  const filmLayer = new FilmLayerDialog(engine);
  const model3d = new Model3DDialog(engine, (t) => toast(t));
  // Outside agents over MCP (1.52.1): the window runs their calls while Preferences > Plugins allows it.
  const agentConfirm = new AgentConfirmDialog();
  const agents = new AgentBridge(engine, { ask: (title, text) => agentConfirm.ask(title, text), note: () => {} });
  agents.setEnabled(loadPrefs().agentsAllowed);
  window.addEventListener('formvis:agents', (ev) => agents.setEnabled((ev as CustomEvent<boolean>).detail === true));
  const model3dInput = el<HTMLInputElement>('<input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" data-role="place-3d" hidden>');
  model3dInput.addEventListener('change', () => { const f = model3dInput.files?.[0]; model3dInput.value = ''; if (f) void model3d.load(f); });
  document.body.appendChild(model3dInput);
  commands.add({ id: 'edit-note', label: 'Edit Note...', enabled: () => !!engine.activeNote, run: () => noteDialog.show() });   // the Note tool (1.49.6)
  commands.add(
    { id: 'load-brushes', label: 'Load Brushes...', run: () => abrInput.click() },
    { id: 'swatch-add', label: 'Add Foreground Color to Swatches', run: () => swatches.addForeground() },
    { id: 'swatches-reset', label: 'Reset Swatches', run: () => swatches.reset() },
  );
  abrInput.addEventListener('change', () => {
    const f = abrInput.files?.[0];
    abrInput.value = '';
    if (!f) return;
    void engine.task(async () => {
      try {
        const r = await importAbr(engine, f);
        toast(r.added ? `Imported ${r.added} brush${r.added === 1 ? '' : 'es'} from ${f.name}${r.kept ? '' : ' (for this session only: they could not be stored)'}.` : `${f.name} has no sampled brushes to import.`);
      } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
    });
  });
  engine.uiHooks.importBrushes = () => abrInput.click();

  const has = (): boolean => !!engine.current;
  const layer = () => engine.activeLayer;
  const pixel = (): boolean => { const l = engine.activeLayer; return !!l && !l.isGroup && !l.adjustment; };
  const withPixels = (): boolean => pixel() && !!engine.activeLayer?.raster;
  const selected = (): boolean => !!engine.current?.selection;

  commands.add(
    { id: 'new', label: 'New Canvas...', keys: ['Alt+Mod+N', 'Mod+N'], run: () => dialogs.newCanvas.show() },
    { id: 'open', label: 'Open Project...', keys: ['Mod+O'], run: () => void dialogs.open.show() },
    { id: 'recent-heading', label: 'Open Recent', enabled: () => false, run: () => undefined },
    ...Array.from({ length: 10 }, (_, i) => ({ id: `recent-${i}`, label: () => recent[i] ?? '', enabled: () => i < recent.length, run: () => { const n = recent[i]; if (n) void openLibrary(n); } })),
    { id: 'clear-recent', label: 'Clear Recent', enabled: () => recent.length > 0, run: () => keepRecent([]) },
    { id: 'import', label: 'Import Images...', keys: ['Shift+Mod+O'], run: () => imageInput.click() },
    { id: 'save', label: 'Save', keys: ['Mod+S'], enabled: has, run: () => void save(false) },
    { id: 'save-as', label: 'Save As...', keys: ['Shift+Mod+S'], enabled: has, run: () => void save(true) },
    { id: 'download-project', label: 'Download Project File', enabled: has, run: () => void downloadProject() },
    { id: 'export-png', label: 'Export PNG', keys: ['Shift+Mod+E'], enabled: has, run: () => void exportImage('png') },
    { id: 'export-jpg', label: 'Export JPEG...', keys: ['Alt+Shift+Mod+S'], enabled: has, run: () => { engine.settle(); dialogs.jpeg.show((q) => void exportImage('jpg', q)); } },
    { id: 'export-as', label: 'Export As...', keys: ['Alt+Shift+Mod+W'], enabled: has, run: () => dialogs.exportAs.show() },
    { id: 'toggle-rulers', label: () => (engine.view.rulers ? 'Hide Rulers' : 'Show Rulers'), keys: ['Mod+R'], enabled: has, run: () => engine.setView({ rulers: !engine.view.rulers }) },
    { id: 'toggle-guides', label: () => (engine.view.guides ? 'Hide Guides' : 'Show Guides'), keys: ['Mod+;'], enabled: has, run: () => engine.setView({ guides: !engine.view.guides }) },
    { id: 'toggle-grid', label: () => (engine.view.grid ? 'Hide Grid' : 'Show Grid'), keys: ["Mod+'"], enabled: has, run: () => engine.setView({ grid: !engine.view.grid }) },
    { id: 'lock-guides', label: () => (engine.view.guidesLocked ? 'Unlock Guides' : 'Lock Guides'), keys: ['Alt+Mod+;'], enabled: has, run: () => engine.setView({ guidesLocked: !engine.view.guidesLocked }) },
    { id: 'clear-guides', label: 'Clear Guides', enabled: () => !!engine.current?.doc.guides?.length, run: () => engine.clearGuides() },
    { id: 'new-guide', label: 'New Guide...', enabled: has, run: () => dialogs.guide.show() },
    { id: 'export-psd', label: 'Export PSD...', enabled: has, run: () => void exportPsd() },
    { id: 'place-3d', label: 'Place 3D Model...', enabled: has, run: () => model3dInput.click() },   // 1.51.9
    { id: 'export-ora', label: 'Export OpenRaster...', enabled: has, run: () => void exportOra() },   // 1.51.7
    { id: 'export-psb', label: 'Export PSB (Large Document)...', enabled: has, run: () => void exportPsd(true) },
    { id: 'export-webp', label: 'Export WebP', enabled: has, run: () => void exportImage('webp', 0.9) },
    { id: 'export-tiff', label: 'Export TIFF', enabled: () => has() && !!caps, run: () => void exportImage('tiff', 0.9) },
    { id: 'export-pdf', label: 'Export PDF', enabled: () => has() && !!caps, run: () => void exportImage('pdf', 0.9) },
    { id: 'export-avif', label: 'Export AVIF', enabled: () => has() && !!caps, run: () => void exportImage('avif', 0.9) },
    { id: 'export-gif', label: 'Export GIF...', enabled: () => !!engine.current, run: () => dialogs.gif.show() },
    { id: 'new-frame', label: 'New Frame', enabled: () => !!engine.current, run: () => engine.newFrame() },
    { id: 'delete-frame', label: 'Delete Frame', enabled: () => !!engine.current && engine.timeline.frames.length > 0, run: () => engine.deleteFrame() },
    { id: 'play-animation', label: 'Play Animation', enabled: () => !!engine.current && engine.timeline.frames.length > 1, run: () => dialogs.animation.show() },
    { id: 'tween-frames', label: 'Tween...', enabled: () => { const t = engine.timeline, i = t.frames.findIndex((f) => f.id === t.current); return i >= 0 && i + 1 < t.frames.length; }, run: () => dialogs.tween.show() },
    { id: 'new-snapshot', label: 'New Snapshot', enabled: () => !!engine.current, run: () => engine.takeSnapshot() },
    { id: 'trim', label: 'Trim...', enabled: () => !!engine.current, run: () => dialogs.trim.show() },
    { id: 'reveal-all', label: 'Reveal All', enabled: () => !!engine.current, run: () => engine.revealAll() },
    { id: 'actions', label: 'Actions...', run: () => dialogs.actions.show() },
    { id: 'action-stop', label: 'Stop Recording', enabled: () => !!actions.recording, run: () => { const x = actions.recording; actions.stop(); if (x) toast(`Recorded "${x.name}", ${x.steps.length} step${x.steps.length === 1 ? '' : 's'}.`); } },
    { id: 'batch', label: 'Batch...', enabled: () => actions.list.some((x) => x.steps.length > 0), run: () => dialogs.batch.show() },
    { id: 'send-host', label: 'Send to NodeMode Canvas', enabled: () => has() && hostLink.embedded, run: () => void sendToHost() },
    // Standalone (1.50.8): the engine sends to the NodeMode at the address in Preferences > Plugins.
    { id: 'send-nodemode', label: 'Send to NodeMode...', enabled: has, run: () => sendNodeMode.show() },
    { id: 'send-comfyui', label: 'Send to ComfyUI...', enabled: has, run: () => sendComfyUI.show() },   // 1.50.9
    { id: 'comfyui-run', label: 'Run ComfyUI Workflow...', enabled: has, run: () => runWorkflow.show() },   // 1.51.1
    // the File > Close is Cmd-W. A browser keeps Ctrl/Cmd-W for its own tab (the unload guard covers that),
    // so the web binds Alt+Mod+W; the desktop shell, with no browser tab, takes Mod+W too.
    { id: 'close-tab', label: 'Close Tab', keys: '__TAURI_INTERNALS__' in window ? ['Mod+W', 'Alt+Mod+W'] : ['Alt+Mod+W'], enabled: has, run: () => { const p = engine.current; if (p) void requestClose(p.id); } },
    { id: 'undo', label: () => { const h = engine.current?.history; return h?.canUndo ? `Undo ${h.undoName}` : 'Undo'; }, keys: ['Mod+Z'], enabled: () => !!engine.current?.history.canUndo, run: () => engine.undo() },
    { id: 'redo', label: () => { const h = engine.current?.history; return h?.canRedo ? `Redo ${h.redoName}` : 'Redo'; }, keys: ['Shift+Mod+Z', 'Mod+Y'], enabled: () => !!engine.current?.history.canRedo, run: () => engine.redo() },
    { id: 'fill-fg', label: 'Fill with Foreground', keys: ['Alt+Backspace', 'Alt+Delete'], enabled: pixel, run: () => engine.fill('fg') },
    { id: 'fill-bg', label: 'Fill with Background', keys: ['Mod+Backspace', 'Mod+Delete'], enabled: pixel, run: () => engine.fill('bg') },
    { id: 'fill-dialog', label: 'Fill...', keys: ['Shift+F5'], enabled: pixel, run: () => dialogs.fill.show() },
    { id: 'content-fill-workspace', label: 'Content-Aware Fill...', enabled: () => pixel() && selected(), run: () => dialogs.contentFill.show() },
    { id: 'remove-wires', label: 'Remove Wires and Cables', enabled: pixel, run: () => { void engine.task(async () => { await new Promise((r) => requestAnimationFrame(() => window.setTimeout(r, 0))); engine.removeWires(); }); } },
    { id: 'transform-warp', label: 'Warp', enabled: pixel, run: () => { engine.setTool('move'); engine.beginMeshWarp(); } },
    { id: 'puppet-warp', label: 'Puppet Warp', enabled: pixel, run: () => { engine.setTool('move'); if (engine.beginPuppetWarp()) toast('Click to place pins, drag them to bend the layer, Alt-click to remove one. Enter applies, Escape cancels.'); } },
    { id: 'filter-liquify', label: 'Liquify...', keys: ['Shift+Mod+X'], enabled: pixel, run: () => dialogs.liquify.show() },
    { id: 'define-pattern', label: 'Define Pattern...', enabled: () => !!engine.current, run: () => void definePattern() },
    { id: 'clear', label: 'Clear Selection Pixels', enabled: () => pixel() && selected(), run: () => engine.clearPixels() },
    { id: 'delete', label: 'Delete', keys: ['Backspace', 'Delete'], enabled: () => !!layer(), run: () => (selected() && pixel() ? engine.clearPixels() : void deleteLayersWithChoice()) },
    { id: 'settings', label: 'Preferences...', keys: ['Mod+,'], run: () => dialogs.settings.show() },
    ...ALL_PANELS.map((pn) => ({ id: `panel-${pn.id}`, label: pn.label, checked: () => dock.isShown(pn.id), run: () => dock.toggle(pn.id) })),
    { id: 'merge-columns', label: 'Merge Panel Columns', checked: () => dock.merged, run: () => { if (dock.merged) dock.separate(); else dock.merge(); } },
    // Paths is a tab of the Layers group (Phase 21): Window > Paths shows the group on its Paths tab.
    { id: 'panel-paths', label: 'Paths', run: () => { if (!dock.isShown('layers')) dock.toggle('layers'); layers.showTab('paths'); } },
    { id: 'panel-properties-col', label: 'Properties Column', checked: propsShown, run: () => { store('formvis.propsCol', propsShown() ? 'hidden' : 'shown'); syncPropsCol(); } },
    { id: 'reset-panels', label: 'Reset Panels', run: () => {
      // The whole panel layout as formvis comes (the owner's walkthrough: Reset Panels left collapsed columns, widths,
      // minimised groups and chosen tabs as they were), live, the documents untouched.
      dock.reset(); PanelGroup.resetHomes(TAB_HOMES); dropEmptyGroups(); PanelGroup.resetStates(); layers.showTab('layers');
      if (dock.collapsed) dock.setCollapsed(false);
      store(LAYERS_W_KEY, ''); setStyleVar(root, '--cv-layers-w', '288px');
      store('formvis.propsCol', 'shown'); props.resetLayout(); syncPropsCol(); props.relayout();
    } },
    { id: 'invert', label: 'Invert', keys: ['Mod+I'], enabled: pixel, run: () => engine.invertPixels() },
    { id: 'remove-bg', label: 'Remove Background', enabled: withPixels, run: () => void removeBackground('auto') },
    { id: 'remove-bg-lite', label: 'Remove Background (Lightweight)', enabled: withPixels, run: () => void removeBackground('lite') },
    { id: 'select-subject', label: 'Subject', enabled: () => !!engine.current, run: () => void selectSubject(false) },
    { id: 'select-object', label: 'Object in Selection', enabled: selected, run: () => void selectSubject(true) },
    { id: 'select-and-mask', label: 'Select and Mask...', keys: ['Alt+Mod+R'], enabled: selected, run: () => dialogs.selectMask.show() },
    { id: 'flip-canvas-h', label: 'Flip Canvas Horizontal', enabled: has, run: () => engine.flipCanvas(true) },
    { id: 'flip-canvas-v', label: 'Flip Canvas Vertical', enabled: has, run: () => engine.flipCanvas(false) },
    { id: 'new-layer', label: 'New Layer', enabled: has, run: () => engine.addLayer() },
    { id: 'new-layer-dialog', label: 'Layer...', keys: ['Shift+Mod+N'], enabled: has, run: () => dialogs.newLayer.show() },
    { id: 'new-folder', label: 'New Folder', enabled: has, run: () => engine.addFolder() },
    { id: 'new-folder-dialog', label: 'Group...', enabled: has, run: () => dialogs.newGroup.show() },
    { id: 'new-artboard', label: 'New Artboard', enabled: has, run: () => { engine.newArtboard(); } },
    { id: 'artboard-from-layers', label: 'Artboard from Layers', enabled: has, run: () => { engine.artboardFromLayers(); } },
    { id: 'artboard-options', label: 'Artboard Options...', enabled: () => !!engine.current?.activeLayer?.artboard, run: () => dialogs.artboard.show() },
    { id: 'export-artboards', label: 'Export Artboards to Files', enabled: () => engine.artboards().length > 0, run: () => void exportArtboards() },
    { id: 'duplicate', label: () => (engine.current?.selection ? 'Layer via Copy' : 'Duplicate Layer'), keys: ['Mod+J'], enabled: () => !!layer(), run: () => engine.layerViaCopy() },
    { id: 'duplicate-dialog', label: 'Duplicate Layer...', enabled: () => !!layer(), run: () => dialogs.duplicateLayer.show() },
    { id: 'delete-layer', label: 'Delete Layer', enabled: () => !!layer(), run: () => void deleteLayersWithChoice() },
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
    { id: 'color-range', label: 'Color Range...', enabled: () => !!engine.current, run: () => dialogs.colorRange.show() },
    { id: 'layer-pixels', label: "Layer's Pixels", enabled: () => !!layer()?.raster, run: () => engine.selectLayerPixels() },
    { id: 'zoom-in', label: 'Zoom In', keys: ['Mod+='], enabled: has, run: () => engine.zoomStep(true) },
    { id: 'zoom-out', label: 'Zoom Out', keys: ['Mod+-'], enabled: has, run: () => engine.zoomStep(false) },
    { id: 'fit', label: 'Fit on Screen', keys: ['Mod+0'], enabled: has, run: () => engine.fit() },
    { id: 'actual', label: 'Actual Pixels', keys: ['Mod+1'], enabled: has, run: () => engine.zoomTo(1) },
    { id: 'pixel-grid', label: 'Pixel Grid', checked: () => engine.showPixelGrid, run: () => engine.update({ showPixelGrid: !engine.showPixelGrid }) },
    { id: 'transform-controls', label: 'Transform Controls', checked: () => engine.showTransformControls, run: () => engine.update({ showTransformControls: !engine.showTransformControls }) },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', keys: ['Shift+/'], run: () => dialogs.shortcuts.show() },
    { id: 'about', label: 'About formvis', run: () => dialogs.about.show(caps) },
    { id: 'brush-settings', label: 'Brush Settings...', keys: ['F5'], run: () => dialogs.brushSettings.show() },
    { id: 'paragraph-styles', label: 'Paragraph Styles...', run: () => dialogs.paragraphStyles.show() },
    { id: 'warp-text', label: 'Warp Text...', enabled: () => engine.liveText(engine.current?.activeLayer), run: () => dialogs.warpText.show() },
    { id: 'type-on-path', label: 'Type on Path...', enabled: () => !!engine.workPath?.subpaths.some((s) => s.anchors.length > 1), run: () => dialogs.typeOnPath.show() },
    { id: 'benchmark', label: 'Performance Benchmark...', run: () => dialogs.benchmark.show() },
    { id: 'copy-error-log', label: 'Copy Error Log', run: () => { void navigator.clipboard?.writeText(errorLog.text()).then(() => toast('Copied the error log.'), () => toast('The clipboard is not available here.', 'error')); } },
  );

  function writeClipboard(): void {
    const cb = engine.clipboard;
    if (!cb || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return;
    try {
      const item = new ClipboardItem({ 'image/png': toBlob(cb.surface), 'text/plain': new Blob([`formvis:${cb.stamp}`], { type: 'text/plain' }) });
      void navigator.clipboard.write([item]).catch(() => undefined);
    } catch { return; }
  }

  async function pasteExternal(file: File): Promise<void> {
    await engine.task(async () => {
      try {
        const img = await decodeImage(file, file.name || 'Pasted.png');
        if (!engine.current) engine.insertImages([img]);
        else engine.insertRasterLayer(Raster.from(img.source, img.width, img.height), stripExt(img.name), null, null);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function pasteFromMenu(): Promise<void> {
    try {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes('text/plain') && engine.clipboard) {
          const text = await (await item.getType('text/plain')).text();
          if (text === `formvis:${engine.clipboard.stamp}`) { engine.pasteClipboard(); return; }
        }
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) { await pasteExternal(new File([await item.getType(type)], 'Pasted.png', { type })); return; }
      }
    } catch {
      if (!engine.pasteClipboard()) toast('Nothing to paste. Use the keyboard shortcut to paste from other apps.');
      return;
    }
    if (!engine.pasteClipboard()) toast('Nothing to paste.');
  }

  const hasTargetPixels = (): boolean => {
    const p = engine.current, l = p?.activeLayer;
    if (!p || !l || l.isGroup || l.adjustment) return false;
    return p.maskTarget && l.mask ? !!l.mask.raster : !!l.raster;
  };
  const ADJUST_KEYS: Partial<Record<string, string[]>> = { curves: ['Mod+M'], levels: ['Mod+L'], hsv: ['Mod+U'] };
  const FILTERS: FilterKind[] = ['develop', 'gaussianBlur', 'lensBlur', 'motionBlur', 'radialBlur', 'surfaceBlur', 'fieldBlur', 'irisBlur', 'tiltShift', 'pathBlur', 'addNoise', 'lensCorrection', 'smartSharpen', 'shakeReduction', 'unsharpMask'];

  commands.add(
    { id: 'cut', label: 'Cut', keys: ['Mod+X'], enabled: () => pixel() && selected(), run: () => { engine.cutSelection(); writeClipboard(); } },
    { id: 'copy', label: 'Copy', keys: ['Mod+C'], enabled: pixel, run: () => { if (engine.copySelection(false)) writeClipboard(); } },
    { id: 'copy-merged', label: 'Copy Merged', keys: ['Shift+Mod+C'], enabled: has, run: () => { if (engine.copySelection(true)) writeClipboard(); } },
    { id: 'paste', label: 'Paste', keys: ['Mod+V'], run: () => void pasteFromMenu() },
    { id: 'transform', label: () => (engine.canTransformSelection || engine.floatingSelection ? 'Transform Selection' : 'Transform Layer'), keys: ['Alt+Mod+T', 'Mod+T'], enabled: () => !!engine.activeLayer && !engine.floatingSelection, run: () => engine.transformCommand() },
    { id: 'content-fill', label: 'Quick Content-Aware Fill', keys: ['Shift+Backspace'], enabled: () => pixel() && selected(), run: () => { void engine.task(async () => { await new Promise((r) => requestAnimationFrame(() => window.setTimeout(r, 0))); engine.contentAwareFill(); }); } },
    { id: 'generative-fill', label: 'Generative Fill...', enabled: () => selected(), run: () => void dialogs.generative.show() },
    { id: 'generate-image', label: 'Generate Image...', enabled: () => true, run: () => void generateImage.show() },   // 1.51.2, as Photoshop's Edit menu
    { id: 'path-selection', label: 'Make Selection from Path', keys: ['Mod+Enter'], enabled: () => !!engine.workPath, run: () => engine.pathToSelection() },
    { id: 'fill-path', label: 'Fill Path', enabled: () => !!engine.workPath && pixel(), run: () => engine.fillPath() },
    { id: 'fill-path-dialog', label: 'Fill Path...', enabled: () => !!engine.workPath && pixel(), run: () => dialogs.fill.show('path') },
    { id: 'stroke-path', label: 'Stroke Path', enabled: () => !!engine.workPath && pixel(), run: () => engine.strokePath() },
    { id: 'stroke-path-dialog', label: 'Stroke Path...', enabled: () => !!engine.workPath && pixel(), run: () => dialogs.strokePath.show() },
    { id: 'delete-path', label: 'Delete Path', enabled: () => !!engine.workPath, run: () => engine.deletePath() },
    { id: 'new-path', label: 'New Path', enabled: () => !!engine.current, run: () => engine.newPath() },
    { id: 'layer-style', label: 'Layer Style...', enabled: () => pixel(), run: () => dialogs.layerStyle.show() },
    { id: 'edit-text', label: 'Edit Type...', enabled: () => engine.liveText(engine.current?.activeLayer), run: () => { const id = engine.current?.activeId; if (id) dialogs.text.showEdit(id); } },
    { id: 'convert-smart', label: 'Convert to Smart Object', enabled: () => { const l = engine.current?.activeLayer; return !!l?.raster && !l.isGroup && !l.adjustment && !l.smart; }, run: () => engine.convertToSmartObject() },
    { id: 'rasterize', label: 'Rasterize Layer', enabled: () => { const l = engine.current?.activeLayer; return !!l && (!!l.smart || !!l.vector || liveText(l)); }, run: () => engine.rasterizeLayer() },
    { id: 'smart-filters', label: 'Smart Filters...', enabled: () => !!engine.current?.activeLayer?.smart, run: () => dialogs.smartFilters.show() },
    { id: 'edit-contents', label: 'Edit Contents', enabled: () => !!engine.current?.activeLayer?.smart, run: () => engine.editContents() },
    { id: 'replace-contents', label: 'Replace Contents...', enabled: () => !!engine.current?.activeLayer?.smart, run: () => replaceInput.click() },
    { id: 'place-linked', label: 'Place Linked...', enabled: has, run: () => { void (async () => { try { const got = await pickLinkSource(pickOnce); if (got) await engine.task(() => placeLinked(engine, got.id, got.source)); } catch (err) { linkError(err); } })(); } },
    { id: 'update-linked', label: 'Update Modified Content', enabled: () => !!engine.current?.doc.layers.some((l) => l.smart?.link), run: () => { void engine.task(async () => { try { const r = await updateLinked(engine); toast(r.missing.length ? `Could not reach ${r.missing.join(', ')}. Use Relink to File.` : r.updated ? `Updated ${r.updated} linked smart object${r.updated === 1 ? '' : 's'}.` : 'Linked contents are up to date.', r.missing.length ? 'error' : undefined); } catch (err) { linkError(err); } }); } },
    { id: 'relink', label: 'Relink to File...', enabled: () => !!engine.current?.activeLayer?.smart?.link, run: () => { void (async () => { try { await relink(engine, pickOnce); } catch (err) { linkError(err); } })(); } },
    { id: 'embed-linked', label: 'Embed Linked', enabled: () => !!engine.current?.activeLayer?.smart?.link, run: () => engine.embedLinked() },
    { id: 'add-filter-mask', label: 'Add Smart Filter Mask', enabled: () => { const s = engine.current?.activeLayer?.smart; return !!s && !s.filterMask; }, run: () => engine.addSmartFilterMask() },
    { id: 'toggle-filter-mask', label: () => (engine.current?.activeLayer?.smart?.filterMaskEnabled === false ? 'Enable Smart Filter Mask' : 'Disable Smart Filter Mask'), enabled: () => !!engine.current?.activeLayer?.smart?.filterMask, run: () => engine.toggleSmartFilterMask() },
    { id: 'delete-filter-mask', label: 'Delete Smart Filter Mask', enabled: () => !!engine.current?.activeLayer?.smart?.filterMask, run: () => engine.deleteSmartFilterMask() },
    { id: 'new-shape-path', label: 'New Shape Layer from Path', enabled: () => !!engine.workPath?.subpaths.some((s) => s.anchors.length > 1), run: () => engine.newShapeFromPath() },
    { id: 'shape-color', label: 'Shape Color from Foreground', enabled: () => !!engine.current?.activeLayer?.vector, run: () => engine.recolorShape() },
    { id: 'shape-style', label: 'Shape Fill and Stroke...', enabled: () => !!engine.current?.activeLayer?.vector, run: () => dialogs.shapeStyle.show() },
    { id: 'shape-corners', label: 'Corner Radii...', enabled: () => { const s = engine.current?.activeLayer?.shape; return !!s && s.kind !== 'Ellipse'; }, run: () => dialogs.corners.show() },
    { id: 'copy-layer-style', label: 'Copy Layer Style', enabled: () => effectsActive(engine.current?.activeLayer?.effects), run: () => engine.copyLayerStyle() },
    { id: 'paste-layer-style', label: 'Paste Layer Style', enabled: () => pixel() && engine.canPasteLayerStyle, run: () => engine.pasteLayerStyle() },
    { id: 'clear-layer-style', label: 'Clear Layer Style', enabled: () => effectsActive(engine.current?.activeLayer?.effects), run: () => engine.clearLayerStyle() },
    { id: 'generative-expand', label: 'Generative Expand...', enabled: has, run: () => void dialogs.generative.show('expand') },
    { id: 'upscale-2x', label: 'Upscale 2x...', enabled: has, run: () => void dialogs.generative.show('upscale', 2) },
    { id: 'upscale-4x', label: 'Upscale 4x...', enabled: has, run: () => void dialogs.generative.show('upscale', 4) },
    { id: 'mask-black', label: "Mask's Black Areas", enabled: () => !!layer()?.mask, run: () => engine.selectMaskBlack() },
    { id: 'expand', label: () => `Expand by ${engine.selectionAmounts.expand} px...`, enabled: selected, run: () => dialogs.amount.show(true) },
    { id: 'contract', label: () => `Contract by ${engine.selectionAmounts.contract} px...`, enabled: selected, run: () => dialogs.amount.show(false) },
    { id: 'feather', label: 'Feather...', keys: ['Shift+F6'], enabled: selected, run: () => dialogs.amount.show(false, 'feather') },
    { id: 'border', label: 'Border...', enabled: selected, run: () => dialogs.amount.show(false, 'border') },
    { id: 'smooth', label: 'Smooth...', enabled: selected, run: () => dialogs.amount.show(false, 'smooth') },
    ...(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as const).map((k) => ({ id: `align-${k}`, label: `Align ${{ left: 'Left Edges', hcenter: 'Horizontal Centers', right: 'Right Edges', top: 'Top Edges', vcenter: 'Vertical Centers', bottom: 'Bottom Edges' }[k]}`, enabled: () => !!layer(), run: () => engine.alignLayers(k) })),
    ...(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom', 'hspace', 'vspace'] as const).map((k) => ({ id: `distribute-${k}`, label: `Distribute ${{ left: 'Left Edges', hcenter: 'Horizontal Centers', right: 'Right Edges', top: 'Top Edges', vcenter: 'Vertical Centers', bottom: 'Bottom Edges', hspace: 'Horizontal Spacing', vspace: 'Vertical Spacing' }[k]}`, enabled: () => (engine.current?.selectedIds.size ?? 0) > 2, run: () => engine.distributeLayers(k) })),
    ...ADJUSTMENT_KINDS.map((kind) => ({ id: `adj-${kind}`, label: `${ADJUSTMENT_LABELS[kind]}...`, keys: ADJUST_KEYS[kind], enabled: hasTargetPixels, run: () => dialogs.adjust.openForImage(kind) })),
    ...ADJUSTMENT_KINDS.map((kind) => ({ id: `new-adj-${kind}`, label: `New ${ADJUSTMENT_LABELS[kind]} Layer...`, enabled: has, run: () => { const id = engine.addAdjustmentLayer(kind); if (id) dialogs.adjust.openForLayer(id, true); } })),
    { id: 'edit-adjustment', label: 'Edit Adjustment...', enabled: () => !!layer()?.adjustment, run: () => { const l = layer(); if (l?.adjustment) dialogs.adjust.openForLayer(l.id); } },
    { id: 'film-leak', label: 'Light Leak...', enabled: () => !!engine.current, run: () => filmLayer.show('leak') },   // 1.51.6
    { id: 'film-frame', label: 'Frame...', enabled: () => !!engine.current, run: () => filmLayer.show('frame') },
    { id: 'color-match', label: 'Color Match...', enabled: () => { const l = engine.activeLayer; return !!l && (!!l.raster && !l.adjustment || (l.name === 'Color Match' && !!l.clipId)); }, run: () => colorMatch.show() },   // 1.51.3
    { id: 'canvas-size', label: 'Canvas Size...', keys: ['Alt+Mod+C'], enabled: has, run: () => dialogs.canvasSize.show() },
    { id: 'image-size', label: 'Image Size...', keys: ['Alt+Mod+I'], enabled: has, run: () => dialogs.imageSize.show() },
    // Image > Mode and Layer > Flatten Image (1.50.2, the owner's walkthrough), as Photoshop's.
    { id: 'mode-rgb', label: 'RGB Color', enabled: has, checked: () => (engine.current?.doc.mode ?? 'rgb') === 'rgb', run: () => { engine.convertMode('rgb'); } },
    { id: 'mode-grayscale', label: 'Grayscale', enabled: has, checked: () => engine.current?.doc.mode === 'grayscale', run: () => { engine.convertMode('grayscale'); } },
    { id: 'mode-bitmap', label: 'Bitmap...', enabled: has, checked: () => engine.current?.doc.mode === 'bitmap', run: () => modeDialog.show('bitmap') },
    { id: 'mode-indexed', label: 'Indexed Color...', enabled: has, checked: () => engine.current?.doc.mode === 'indexed', run: () => modeDialog.show('indexed') },
    { id: 'flatten', label: 'Flatten Image', enabled: () => (engine.current?.doc.layers.length ?? 0) > 1, run: () => { engine.flattenImage(); } },
    ...FILTERS.map((kind) => ({ id: `filter-${kind}`, label: `${FILTER_LABELS[kind]}...`, ...(kind === 'develop' ? { keys: ['Shift+Mod+A'] } : {}), enabled: hasTargetPixels, run: () => dialogs.filter.show(kind) })),
  );

  const menus: MenuDef[] = [
    { label: 'File', items: () => ['new', 'open', 'import', 'place-linked', 'place-3d', ...(recent.length ? [{ label: 'Open Recent', items: [...recent.map((_, i) => `recent-${i}`), '-', 'clear-recent'] }] : []), '-', 'save', 'save-as', 'download-project', '-',
      { label: 'Export', items: ['export-as', '-', 'export-png', 'export-jpg', 'export-webp', 'export-avif', 'export-tiff', 'export-pdf', 'export-gif', '-', 'export-psd', 'export-psb', 'export-ora', '-', 'export-artboards'] },
      { label: 'Automate', items: ['actions', 'action-stop', 'batch'] }, ...(hostLink.embedded ? ['send-host'] : ['send-nodemode']), 'send-comfyui', 'comfyui-run', '-', 'close-tab'] },
    { label: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'copy-merged', 'paste', 'clear', '-',
      { label: 'Fill', items: ['fill-dialog', 'fill-fg', 'fill-bg'] }, 'content-fill-workspace', 'content-fill', 'generative-fill', 'generate-image', 'remove-wires', '-',
      'fill-path-dialog', 'stroke-path-dialog', '-', { label: 'Transform', items: ['transform', 'transform-warp'] }, 'puppet-warp', '-', 'define-pattern', '-', 'settings'] },
    { label: 'Image', items: [
      { label: 'Adjustments', items: ['adj-levels', 'adj-curves', 'adj-exposure', '-', 'adj-hsv', ...PARAM_KINDS.map((k) => `adj-${k}`), '-', 'adj-gradientMap', 'adj-grain', '-', 'invert'] }, '-',
      { label: 'Mode', items: ['mode-bitmap', 'mode-grayscale', 'mode-indexed', 'mode-rgb'] }, '-',
      'image-size', 'canvas-size', { label: 'Image Rotation', items: ['flip-canvas-h', 'flip-canvas-v'] }, '-', 'trim', 'reveal-all', '-', 'generative-expand', { label: 'Upscale', items: ['upscale-2x', 'upscale-4x'] }] },
    { label: 'Layer', items: [
      { label: 'New', items: ['new-layer-dialog', 'new-folder-dialog', '-', 'new-artboard', 'artboard-from-layers'] }, 'artboard-options', '-',
      { label: 'New Adjustment Layer', items: ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`) }, 'edit-adjustment', 'color-match', { label: 'New Film Layer', items: ['film-leak', 'film-frame'] }, '-',
      'duplicate-dialog', 'delete-layer', 'rename', '-',
      'flatten', '-',
      { label: 'Layer Style', items: ['layer-style', '-', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style'] },
      { label: 'Smart Objects', items: ['convert-smart', 'edit-contents', 'replace-contents', '-', 'update-linked', 'relink', 'embed-linked', '-', 'smart-filters', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask'] },
      'rasterize', 'edit-text', 'warp-text', 'type-on-path', { label: 'Shape', items: ['new-shape-path', 'shape-color', 'shape-style', 'shape-corners'] }, '-',
      { label: 'Layer Mask', items: ['add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask'] }, 'clip', '-',
      'group', 'move-out', 'merge', '-',
      { label: 'Arrange', items: ['forward', 'backward'] },
      { label: 'Align', items: ['align-left', 'align-hcenter', 'align-right', '-', 'align-top', 'align-vcenter', 'align-bottom'] },
      { label: 'Distribute', items: ['distribute-left', 'distribute-hcenter', 'distribute-right', '-', 'distribute-top', 'distribute-vcenter', 'distribute-bottom', '-', 'distribute-hspace', 'distribute-vspace'] },
      { label: 'Flip', items: ['flip-layer-h', 'flip-layer-v'] }] },
    { label: 'Select', items: ['select-all', 'deselect', 'inverse', '-', 'color-range', 'select-subject', 'select-object', 'select-and-mask', '-', 'layer-pixels', 'mask-black', '-',
      { label: 'Modify', items: ['expand', 'contract', 'feather', 'border', 'smooth'] }, '-', 'quick-mask', '-', 'path-selection', 'delete-path'] },
    { label: 'Filter', items: ['filter-develop', 'filter-lensCorrection', 'filter-liquify', '-',
      { label: 'Blur', items: ['filter-gaussianBlur', 'filter-lensBlur', 'filter-motionBlur', 'filter-radialBlur', 'filter-surfaceBlur'] },
      { label: 'Blur Gallery', items: ['filter-fieldBlur', 'filter-irisBlur', 'filter-tiltShift', 'filter-pathBlur'] },
      { label: 'Sharpen', items: ['filter-smartSharpen', 'filter-shakeReduction', 'filter-unsharpMask'] },
      { label: 'Noise', items: ['filter-addNoise'] }, '-', 'remove-bg', 'remove-bg-lite'] },
    { label: 'View', items: ['zoom-in', 'zoom-out', 'fit', 'actual', '-', 'toggle-rulers', 'toggle-grid', 'pixel-grid', 'transform-controls', '-',
      { label: 'Guides', items: ['toggle-guides', 'lock-guides', 'new-guide', 'clear-guides'] }, '-',
      { label: 'Screen Mode', items: ['screen-standard', 'screen-menu', 'screen-full'] }, 'toggle-panels', 'rail-columns'] },
    { label: 'Window', items: ['brush-settings', 'paragraph-styles', '-', ...ALL_PANELS.map((pn) => `panel-${pn.id}`), 'panel-paths', 'panel-properties-col', 'merge-columns', '-', 'reset-panels'] },
    { label: 'Help', items: ['shortcuts', 'copy-error-log', 'benchmark', 'about'] },
  ];
  const menubar = new MenuBar(q(root, '.cv-menubar'), commands, menus);
  // The desktop app on macOS puts these menus in the system menu bar, as the target's (Phase 21); the in-window bar then hides.
  if (wantsNativeMenus()) {
    const native = new NativeMenus(commands, () => menus);
    void native.build().catch(() => undefined);
    for (const ev of ['active', 'doc', 'selection', 'history', 'tool'] as const) engine.on(ev, () => native.refresh());
    engine.on('projects', () => { void native.build().catch(() => undefined); });   // Open Recent and what is enabled
  }
  contextMenu.setItems(['duplicate-dialog', 'delete-layer', 'rename', 'edit-text', 'warp-text', '-',
    { label: 'Smart Objects', items: ['convert-smart', 'rasterize', 'edit-contents', 'replace-contents', '-', 'update-linked', 'relink', 'embed-linked', '-', 'smart-filters', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask'] },
    { label: 'Shape', items: ['new-shape-path', 'shape-color', 'shape-style', 'shape-corners'] },
    { label: 'Layer Style', items: ['layer-style', '-', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style'] }, '-',
    { label: 'Layer Mask', items: ['add-mask', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask'] }, 'clip', '-', 'group', 'move-out', 'merge', '-', 'layer-pixels']);
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
  // Recording: commands that change the document, filters with their settings, and size changes.
  commands.onRun = (cmd) => { if (RECORDABLE.has(cmd.id)) actions.record({ kind: 'command', id: cmd.id, label: typeof cmd.label === 'function' ? cmd.label() : cmd.label }); };
  dialogs.filter.onApplied = (kind, settings) => actions.record({ kind: 'filter', filter: kind, label: FILTER_LABELS[kind], settings });
  // Adjustments applied to the image, or new adjustment layers, record with their settings; edits of an existing
  // adjustment layer do not, since a replay could not know which layer to change.
  dialogs.layerStyle.onApplied = (fx) => actions.record({ kind: 'layerStyle', label: fx ? 'Layer Style' : 'Clear Layer Style', effects: fx as unknown as Record<string, unknown> | null });
  dialogs.adjust.onApplied = (v) => { if (!v.layer || v.made) actions.record({ kind: 'adjustment', adj: v.kind, label: v.layer ? `New ${ADJUSTMENT_LABELS[v.kind]} Layer` : ADJUSTMENT_LABELS[v.kind], data: v.data as Record<string, unknown>, layer: v.layer }); };
  dialogs.imageSize.onApplied = (v) => actions.record({ kind: 'imageSize', label: `Image Size ${v.w} x ${v.h}`, ...v });
  dialogs.canvasSize.onApplied = (v) => actions.record({ kind: 'canvasSize', label: `Canvas Size ${v.w} x ${v.h}`, ...v });
  root.addEventListener('cv:edit-layer-style', () => dialogs.layerStyle.show());
  root.addEventListener('cv:smart-filters', () => dialogs.smartFilters.show());
  root.addEventListener('cv:shape-style', () => dialogs.shapeStyle.show());
  engine.smartFilterMargin = (kind, settings) => filterMargin(kind as FilterKind, { ...defaultFilterSettings(), ...(settings as Partial<FilterPanelSettings>) });
  void loadPatterns();
  engine.smartFilterRunnerAsync = (kind, settings, src) => {
    const s = { ...defaultFilterSettings(), ...(settings as Partial<FilterPanelSettings>) }, seed = typeof settings.seed === 'number' ? settings.seed : 0;
    return runFilterOffThread(kind as FilterKind, s, 1, seed, src) ?? Promise.resolve(runFilter(kind as FilterKind, s, seed, src, 1));
  };
  engine.smartFilterRunner = (kind, settings, src) => runFilter(kind as FilterKind, { ...defaultFilterSettings(), ...(settings as Partial<FilterPanelSettings>) }, typeof settings.seed === 'number' ? settings.seed : 0, src, 1);
  document.addEventListener('cv:type', (e) => {
    const d = (e as CustomEvent<{ layerId?: string; x?: number; y?: number; box?: { w: number; h: number } }>).detail;
    if (d?.layerId) typing.begin({ layerId: d.layerId });
    else if (typeof d?.x === 'number' && typeof d?.y === 'number') typing.begin({ x: d.x, y: d.y, box: d.box });   // a box: paragraph text
  });
  root.addEventListener('cv:edit-adjustment', (e) => {
    const id = (e as CustomEvent<string>).detail;
    if (typeof id === 'string') dialogs.adjust.openForLayer(id);
  });

  const resizer = q(root, '.cv-resizer');
  resizer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || dock.locked) return;   // Lock Workspace holds the panels' widths too
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
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.code === 'Space' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (!e.repeat) stage.setSpace(true); return; }
    if (stage.toolKeydown(e)) { e.preventDefault(); return; }
    const cmd = commands.forEvent(e);
    if (cmd?.id === 'paste') return;
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
    // E and B pick their groups' tools like any letter (1.49.5: the Eraser is its own tool, the Pencil beside the Brush).
    else if (k === 'M' && e.shiftKey) { engine.setTool('marquee'); engine.update({ marqueeKind: engine.marqueeKind === 'rectangle' ? 'ellipse' : 'rectangle' }); }
    else if (k === 'L' && e.shiftKey) { engine.setTool('lasso'); engine.update({ lassoKind: engine.lassoKind === 'freehand' ? 'polygonal' : engine.lassoKind === 'polygonal' ? 'magnetic' : 'freehand' }); }
    else if (toolForKey(k)) {
      // A letter picks its slot's tool (the one last chosen from its group, as Photoshop's does), keeping one already
      // chosen from the same group; Shift with it cycles the group.
      const group = toolsForKey(k), at = group.findIndex((t) => t.id === engine.tool);
      if (e.shiftKey) { if (group.length > 1) engine.setTool(group[(at + 1) % group.length].id); }
      else if (at < 0) { const g = toolGroups().find((x) => x.key === k); engine.setTool(g ? slotTool(g, engine.tool).id : group[0].id); }
    }
    else return;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') stage.setSpace(false); });
  window.addEventListener('blur', () => stage.setSpace(false));

  document.addEventListener('paste', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (anyDialogOpen() || target?.closest('input, textarea, [contenteditable="true"]')) return;
    const files = Array.from(e.clipboardData?.files ?? []).filter(isImageFile);
    const marker = e.clipboardData?.getData('text/plain') ?? '';
    if (engine.clipboard && (marker === `formvis:${engine.clipboard.stamp}` || !files.length)) { e.preventDefault(); engine.pasteClipboard(); return; }
    if (!files.length) return;
    e.preventDefault();
    if (files.length === 1) { void pasteExternal(files[0]); return; }
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
  // The engine's compute device (Phase 18.6): the preference sent, the engine's report shown in Preferences.
  function syncEngineDevice(): void {
    if (!caps) { dialogs.settings.setEngine('Engine: offline, so the engine processor cannot be set.'); return; }
    void api.setCompute(loadPrefs().engineDevice).then((r) => dialogs.settings.setEngine(r ? `Engine: ${r.label} (${r.reason}).` : 'Engine: could not be reached.'));
  }
  void api.capabilities().then((c) => {
    caps = c;
    status.setEngine(c ? `Engine ${c.version}${c.desktop ? ' · desktop' : ''}` : 'Engine offline');
    if (!c) toast('The formvis engine is offline. Editing works; library saves, HEIC and TIFF import and Remove Background need it (./formvis boot).');
    syncEngineDevice();
  });
  // The desktop app lists the installed fonts from the shell at once (no permission is asked there, as in Photoshop);
  // a browser keeps "Load system fonts..." in the Type tool, since Local Font Access asks the user first.
  if ('__TAURI_INTERNALS__' in window) void loadSystemFonts().then((f) => { if (f) engine.emit('options', null); });

  if (import.meta.env.DEV) (window as unknown as { formvis: unknown }).formvis = { engine, commands, actions, animation: dialogs.animation };

  const keptAt = new Map<string, number>();
  let keepTimer = 0;
  async function keepModified(): Promise<void> {
    for (const p of engine.projects) {
      if (!p.modified) { if (keptAt.delete(p.id)) await recovery.drop(p.id); continue; }
      if (keptAt.get(p.id) === p.history.revision) continue;
      try {
        const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathsOf(p), engine.timelineFor(p));
        if (await recovery.keep({ id: p.id, name: p.name, savedAt: Date.now(), manifest, files })) keptAt.set(p.id, p.history.revision);
      } catch (err) { errorLog.add('Recovery copy', message(err)); }
    }
    for (const id of [...keptAt.keys()]) if (!engine.projects.some((p) => p.id === id)) { keptAt.delete(id); await recovery.drop(id); }
  }
  const keepSoon = (): void => { if (!keepTimer) keepTimer = window.setTimeout(() => { keepTimer = 0; void keepModified(); }, recoveryDelay); };
  let recoveryDelay = loadPrefs().recoverySeconds * 1000;
  engine.on('history', keepSoon);
  engine.on('projects', keepSoon);
  async function offerRecovery(): Promise<void> {
    const found = await recovery.list();
    if (!found.length) return;
    const names = found.map((r) => r.name).join(', ');
    if (!(await confirmAction('Recover unsaved work?', `formvis closed with unsaved changes in ${names}. Open them again?`, 'Recover'))) { await recovery.clear(); return; }
    for (const r of found) {
      try {
        const byName = new Map(r.files.map((f) => [f.name, f.blob]));
        const { doc, activeId, paths, timeline } = await deserialize(r.manifest, (n) => { const b = byName.get(n); return b ? Promise.resolve(b) : Promise.reject(new Error(`${n} is missing.`)); });
        const p = engine.addProject(doc, `${r.name} (recovered)`, activeId);
        if (paths) engine.setPathsOf(p, paths);
        if (timeline) engine.setTimelineFor(p, timeline);
        p.history.markUnsaved();
        engine.emit('projects', null);
      } catch (err) { toast(`${r.name}: ${message(err)}`, 'error'); }
    }
    await recovery.clear();
  }
  if (import.meta.env.DEV) Object.assign((window as unknown as { formvis: object }).formvis, { errorLog, keepModified, offerRecovery, setRecoveryDelay: (ms: number) => { recoveryDelay = ms; } });

  const faces = Promise.all(['400', '500', '600'].map((w) => document.fonts.load(`${w} 12px Inter`))).catch(() => undefined);
  void Promise.race([faces, new Promise((r) => window.setTimeout(r, 2500))]).then(() => requestAnimationFrame(() => { revealApp(); void offerRecovery(); }));
}
