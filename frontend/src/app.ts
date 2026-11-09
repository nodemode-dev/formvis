import { sharpenRaw8, sharpenRawDeep } from './io/raw-sharpen';
import { ErrorLog } from './ui/errors';
import { FillDialog } from './ui/panels/fill-dialog';
import { FadeDialog } from './ui/panels/fade-dialog';
import { CompareDialog } from './ui/panels/compare-dialog';
import { DuotoneDialog } from './ui/panels/duotone-dialog';
import { ColorTableDialog } from './ui/panels/color-table-dialog';
import { ExtrasOptionsDialog } from './ui/panels/extras-options-dialog';
import { ApplyImageDialog } from './ui/panels/apply-image-dialog';
import { ExportDialog } from './ui/panels/export-dialog';
import { LayerExportDialog } from './ui/panels/layer-export-dialog';
import { DataSetsDialog, DefineVariablesDialog } from './ui/panels/variables-dialog';
import { ArtboardPdfDialog, type ArtboardPdfSettings } from './ui/panels/artboard-pdf-dialog';
import { DEFAULT_LAYER_EXPORT, dataSetFiles, layerCompFiles, layerFileLoss, layerFiles, safeName, selectedLayerFiles, type LayerExportSettings } from './io/layer-export';
import { loadExportPrefs } from './io/export-prefs';
import { ExportPrefsDialog } from './ui/panels/export-prefs-dialog';
import { GuideDialog } from './ui/panels/guide-dialog';
import { EditGuidesDialog } from './ui/panels/guide-edit-dialog';
import { ArtboardDialog, NewArtboardDialog } from './ui/panels/artboard-dialog';
import { CornersDialog } from './ui/panels/corners-dialog';
import { ClippingPathDialog } from './ui/panels/clipping-path-dialog';
import { CreateShapeDialog } from './ui/panels/create-shape-dialog';
import { StrokePathDialog } from './ui/panels/stroke-path-dialog';
import { MakeSelectionDialog } from './ui/panels/make-selection-dialog';
import { DuplicateLayerDialog, FindLayersDialog, LockLayersDialog, NewGroupDialog, NewLayerDialog } from './ui/panels/layer-dialogs';
import { MattingDialog } from './ui/panels/matting-dialog';
import { ChannelOptionsDialog, LoadSelectionDialog, SaveSelectionDialog, loadSources } from './ui/panels/selection-dialogs';
import { MergeChannelsDialog } from './ui/panels/merge-channels-dialog';
import { GlobalLightDialog, ScaleEffectsDialog } from './ui/panels/style-dialogs';
import { LiquifyDialog } from './ui/panels/liquify-dialog';
import { runLiquifySmart } from './engine/liquify';
import { filterLayerHook } from './engine/kernels';
import { depthSource } from './engine/develop';
import { runWideAngleSmart } from './engine/wide-angle';
import { SelectMaskDialog } from './ui/panels/select-mask-dialog';
import { SelectMaskWorkspace } from './ui/select-mask-workspace';
import { ContentFillDialog } from './ui/panels/content-fill-dialog';
import { GradientEditor, loadSavedGradients } from './ui/panels/gradient-editor';
import { convertToLinked, linkedFiles, pickLinkSource, placeEmbedded, placeLinked, relink, updateLinked, watchLinked } from './io/links';
import { importAbr, loadImportedBrushes, addSampledBrush, moveBrushPreset, removeImportedBrush, renameBrushGroup, renameImportedBrush, saveBrushPreset } from './io/brush-library';
import { allBrushPresets, importedBrushPresets } from './engine/brush-dynamics';
import { BrushPicker } from './ui/brush-picker';
import { snapHold, snapOptions } from './engine/pixel-move';
import { SPACES, convertPixels, iccProfile, type SpaceId } from './engine/icc';
import { embedJpeg, embedPng } from './io/embed-icc';
import { encodeIndexedPng } from './io/png8';
import { withResolution } from './engine/dpi';
import { dpxBlob } from './io/dpx';
import { pickOutFolder, writeFolder } from './io/out-folder';
import { dropsAlpha, exportLayout, engineWrites, fidelityNotes, saveCopyNotes, exportMeta, exportName, exportSize, formatOptions, PROFILELESS, sizedSettings, type ExportSettings } from './io/export-presets';
import { pnmDeepBlob } from './io/pnm';
import { PARAM_KINDS } from './engine/adjust-params';
import { APPLY_MODES, type ApplyMode } from './engine/apply-image';
import { CALC_MODES, type CalcMode } from './engine/calculations';
import { earlier, recovery, type RecoveryRecord } from './io/recovery';
import { TrimDialog } from './ui/panels/trim-dialog';
import { TrapDialog, trapPixels } from './ui/panels/trap-dialog';
import { FrequencyDialog } from './ui/panels/frequency-dialog';
import type { TrapUnit } from './ui/panels/trap-dialog';
import { ColorRangeDialog } from './ui/panels/color-range-dialog';
import { SelectionTransformDialog } from './ui/panels/selection-transform-dialog';
import { ArbitraryRotationDialog, DuplicateImageDialog } from './ui/panels/image-dialogs';
import { ReplaceColorDialog } from './ui/panels/replace-color-dialog';
import { CalculationsDialog } from './ui/panels/calculations-dialog';
import { StrokeDialog } from './ui/panels/stroke-dialog';
import { SaveCopyDialog } from './ui/panels/save-copy-dialog';
import { CommandPalette } from './ui/command-palette';
import { NoticesDialog } from './ui/notices-dialog';
import { FillLayerDialog } from './ui/panels/fill-layer-dialog';
import { HistoryPanel } from './ui/history';
import { LayerCompsPanel } from './ui/layer-comps';
import { StylesPanel } from './ui/styles-panel';
import { createPresetPanels } from './ui/preset-panels';
import { createMorePanels } from './ui/more-panels';
import { createActionsPanel } from './ui/actions-panel';
import { createExtensionsPanel } from './ui/extensions-panel';
import { FormExtensions, type ExtensionsDeps } from './formext/extensions';
import { ExtensionConsentDialog } from './ui/panels/extension-consent';
import { ModifierKeysPanel } from './ui/modifier-keys';
import { MeasurementLogPanel } from './ui/measurement-log';
import { StopDialog } from './ui/panels/stop-dialog';
import { TweenDialog } from './ui/panels/tween-dialog';
import { GifDialog } from './ui/panels/gif-dialog';
import { TimelinePanel } from './ui/timeline';
import { AnimationDialog } from './ui/panels/animation-dialog';
import { encodeGif, type GifFrame } from './io/gif';
import { ShapeStyleDialog } from './ui/panels/shape-style-dialog';
import { PathsPanel } from './ui/paths';
import { SmartFiltersDialog } from './ui/panels/smart-filters-dialog';
import { STACK_MODES } from './engine/stack-modes';
import { ACTION_COLOURS, ACTION_KEYS, Actions, CONDITION_TESTS, RECORDABLE, actionsFrom, batchName, type Action, type ActionStep, type ConditionTest } from './ui/actions';
import { ActionsDialog, BatchDialog, DropletDialog } from './ui/panels/actions-dialogs';
import { LensBatchDialog, type LensBatchOptions } from './ui/panels/lens-batch-dialog';
import { ImageProcessorDialog, type ImageProcessorOptions } from './ui/panels/image-processor-dialog';
import { zipFiles } from './io/zip';
import { assetFiles, loadVariantText, parseVariants, saveVariantText } from './io/image-assets';
import { isPsdFile, readPsdFile, readPsdFlat, reportText, writePsdFile } from './io/psd';
import { giantPsd, readGiantPsd } from './io/psb-open';
import { writePsdInParts } from './io/psd-parts';
import { isKraFile, readKra } from './io/kra';
import { isPdnFile, readPdn } from './io/pdn';
import { isAfFile, readAf } from './io/af-preview';
import { readLayeredTiff, tiffLayerBlock, writeLayeredTiff } from './io/layered-tiff';
import { isOraFile, readOraFile, writeOra } from './io/ora';
import { withAiLabel } from './io/ai-label';
import { withGenerationText } from './io/png-text';
import { pathsToAi } from './io/ai-paths';
import { svgSource, svgToShapes } from './io/svg-layers';
import { metaForEngine, withXmp } from './io/xmp';
import { FileInfoDialog } from './ui/panels/file-info-dialog';
import { PrintDialog } from './ui/panels/print-dialog';
import { printDocument, printSettings } from './io/print';
import { TextEditor, typedAttrs, typedFeatureOn, typedFeatureToggle, typedStyle } from './ui/text-editor';
import { runPatchFrom, runPatchOfStyle } from './engine/text';
import { TextDialog } from './ui/panels/text-dialog';
import { BrushSettingsDialog } from './ui/panels/brush-settings';
import { WarpTextDialog } from './ui/panels/warp-text-dialog';
import { TypeOnPathDialog } from './ui/panels/type-on-path-dialog';
import { TypeOnShapeDialog } from './ui/panels/type-on-shape-dialog';
import { ParagraphStylesDialog } from './ui/panels/paragraph-styles';
import { CharacterStylesDialog } from './ui/panels/character-styles';
import { LayerStyleDialog, type StyleSection } from './ui/panels/layer-style-dialog';
import { GenerativeDialog } from './ui/panels/generative-dialog';
import { readPat, writePat } from './io/pat';
import { LAYER_ROLES, LAYER_ROLE_LABELS, layerRoleOf } from './engine/types';
import { cleanFeatures, cleanRuns, featureOn, runFeatureOn, withFeature, withRunAttrs, withRunFeature } from './engine/opentype';
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, BLEND_MODES, COLOR_RANGE_MODES, Engine, LAYER_LABELS, Raster, SelectionMask,stripExt, toBlob, type ImportedImage, type Pt, type SelectionMode, type TextSpec, effectsActive, effectsPresent, liveText, ctxOf, createSurface, type AdjustmentKind, effectsFromData, runFilterOffThread, addPattern, allPatterns, patternById, projectPatterns, randomSeed, metaWritable, addCustomShape, allCustomShapes, loadCustomShapes } from './engine';
import { getTool, toolForKey, toolsForKey } from './extensions/registry';
import { registerBuiltinTools } from './extensions/tools';
import { stepBrush } from './extensions/tools/brush';
import { selectByPoints } from './extensions/tools/object-select';
import { commitPendingCrop, cropPending, startPerspectiveCrop } from './extensions/tools/crop';
import { HostLink } from './host';
import { api, onServiceChange, serviceDown, serviceReady, type Capabilities, type CmykPsd, type OpenedProject } from './io/api';
import { PROJECT_FILTER, baseName, checkForUpdate, chooseOpenPaths, chooseSavePath, confirmExit, dialogWatch, fileDialogReport, folderOf, hasPanels, installUpdate, isDiskPath, listenShell } from './io/disk';
import { depthReady, findToRemove, installModel, localDepth, localDepth16, localDepthValues, localInpaint, modelReady, skyMask, skyReady, warmLama } from './io/local-gen';
import { FocusAreaDialog } from './ui/panels/focus-area-dialog';
import { MergeDialog } from './ui/panels/merge-dialog';
import { ScriptEventsDialog } from './ui/panels/script-events-dialog';
import { ScriptConsoleDialog } from './ui/panels/script-console-dialog';
import { ScriptEvents, type ScriptEvent } from './ui/script-events';
import { LutExportDialog } from './ui/panels/lut-export-dialog';
import { GlyphsDialog } from './ui/panels/glyphs-dialog';
import { ToolPresetsDialog } from './ui/panels/tool-presets-dialog';
import { MeasureDataPointsDialog, MeasureScaleDialog, MeasurementLogDialog, ScaleMarkerDialog, autoMarkerLength } from './ui/panels/measurement-dialogs';
import { FindReplaceTextDialog } from './ui/panels/find-replace-text-dialog';
import { SpellDialog } from './ui/panels/spell-dialog';
import { MissingFontsDialog } from './ui/panels/missing-fonts-dialog';
import { NormalMapDialog } from './ui/panels/normal-map-dialog';
import { SaveForWebDialog } from './ui/panels/save-for-web-dialog';
import { VanishingPointDialog } from './ui/panels/vanishing-dialog';
import { VideoImportDialog } from './ui/panels/video-dialog';
import { VideoTimelinePanel } from './ui/video-timeline';
import { RenderVideoDialog, type RenderChoice } from './ui/panels/render-video-dialog';
import { TiffOptionsDialog } from './ui/panels/tiff-options-dialog';
import { decodeExtensions } from './plugins/formats';
import { LargePictureError, IMAGE_ACCEPT, PROJECT_ACCEPT, RAW_FILE, decodeDeepLayer, decodeFrames, decodeTgaSplit, decodeHdr, decodeImage, heifBits, isImageFile, isProjectFile, nameRawByContent, apngFrames, rasteriseSvg, svgSize, svgInches } from './io/images';
import { addFontFace, familyOfFile, fontFamilies, loadSystemFonts, loadUserFonts } from './ui/fonts';
import { deserialize, giantTiles, serialize } from './io/project-io';
import { templateContext } from './io/prompt-templates';
import { AboutDialog, BenchmarkDialog, NewCanvasDialog, OpenDialog, ReportIssueDialog, SettingsDialog, ShortcutsDialog, SystemInfoDialog, UpdateDialog } from './ui/app-dialogs';
import { HistoryLog } from './ui/history-log';
import { extraOn, extrasOn, selectionTintOn, setAllExtras, setExtra, setExtras, setSelectionTint } from './ui/view-extras';
import { installNumberFields } from './ui/number-fields';
import { CHECKER_CELL, FONT_PREVIEWS, applyPrefs, applyUiFontSize, autoUiScale, checkerPair, DEFAULT_PREFS, loadPrefs, remembered, resendScratch, savePrefs, setShellZoom, updateAtStart, updatePrefs, type Prefs } from './ui/prefs';
import { THEMES, readChoice, setTheme } from './ui/themes';
import { installOptionMemory } from './ui/option-memory';
import { chooseRenderer, detectedName, gpuStartFailedLastTime, markGpuStarted, markGpuStarting, probeGpu, type GpuProbe } from './gpu/probe';
import { GpuDisplay, type ScreenDisplay } from './gpu/display';
import { runBenchmark } from './gpu/bench';
import { GlDisplay } from './gpu/gl-display';
import { GlFilters } from './gpu/filters';
import { frameTrace } from './gpu/frame-trace';
import { perfHud } from './ui/perf-hud';
import { setGpuFilters } from './engine/gpu-filters';
import { setGpuEffects } from './engine/gpu-effects';
import { NativeDisplay } from './gpu/native-display';
import { PerfDialog, recordPerformance } from './ui/perf-recorder';
import { NavigatorPanel } from './ui/navigator';
import { SwatchesPanel } from './ui/swatches';
import { setPatternGroup } from './engine/patterns';
import { PRESET_ACCEPT, PresetManagerDialog, presetKindOf } from './ui/panels/preset-manager-dialog';
import { PropertiesColumn } from './ui/properties';
import { RelightSession } from './ui/relight-session';
import { TitleTools } from './ui/titlebar-tools';
import { ComfyDot } from './ui/comfy-dot';
import { CaptionButtons, wantsCustomTitleBar } from './ui/caption-buttons';
import { ConsoleLogDialog } from './ui/panels/console-log-dialog';
import { EarlierStatesDialog } from './ui/panels/earlier-states-dialog';
import { InfoPanel } from './ui/info';
import { NoteDialog } from './ui/panels/note-dialog';
import { ModeDialog } from './ui/app-dialogs';
import { SendDialog } from './ui/panels/send-to';
import { RunWorkflowDialog } from './ui/panels/comfyui-run';
import { GenerateImageDialog, generationsRunning, stopGenerations } from './ui/panels/generate-image';
import { ModelCanvasDialog } from './ui/panels/model-canvas-dialog';
import { boxesText } from './engine/boxes';
import { GeneratePanel } from './ui/panels/generate-panel';
import { ColorMatchDialog } from './ui/panels/color-match';
import { FilmLayerDialog } from './ui/panels/film-layer';
import { AiLabelDialog } from './ui/panels/ai-label-dialog';
import { aiLabelInfo, filmClipboard, filmPointsOf, packTool, removeAiLabel, setFilmClipboard, setFilmPoints } from './automation/pack-tools';
import { Model3DDialog } from './ui/panels/model3d';
import { Extrude3DDialog } from './ui/panels/extrude3d-dialog';
import { PanoramaDialog } from './ui/panels/panorama-dialog';
import { AgentConfirmDialog } from './ui/panels/agent-confirm';
import { PsdReportDialog } from './ui/panels/psd-report-dialog';
import { AgentBridge } from './automation/agent-bridge';
import { UiControl } from './automation/ui-control';
import { attachCatalogue, catalogue } from './automation/catalogue';
import { runScript } from './automation/script-sandbox';
import { parseAtn, writeAtn } from './io/atn';
import { setPixelBudget } from './engine/types';
import { AssistantPanel } from './ui/panels/assistant';
import { installAgentConnect } from './ui/panels/agent-connect';
import { installColorSettings } from './ui/panels/colour-settings-dialog';
import { TerminalDock } from './ui/terminal-dock';
import { HelpDialog } from './ui/panels/help';
import { VERSION } from './version';
import { WhatsNewDialog } from './ui/panels/whats-new';
import { RELEASES } from './ui/panels/whats-new-data';
import { PluginHost } from './plugins/host';
import { FolderPlugins } from './plugins/modules';
import { PluginsDialog } from './ui/panels/plugins-dialog';
import { LargePictureDialog } from './ui/panels/large-picture';
import { TiffPagesDialog } from './ui/panels/tiff-pages';
import { SvgImportDialog } from './ui/panels/svg-import';
import { ExrPartsDialog } from './ui/panels/exr-parts';
import { OpenAsDialog } from './ui/panels/open-as';
import { PackageDialog, type PackageChoice } from './ui/panels/package-dialog';
import { addNotes, readNotesFile } from './io/notes-import';
import { CameraRawDialog, type RawChoice } from './ui/panels/camera-raw';
import { ColourView, PROOF_KINDS } from './ui/colour';
import { composeDeep, deepFromU16, deepToU16, deepToned, place, srgbToLinear } from './engine/deep';
import { composeFloat } from './engine/compose-float';
import { composeFloatOnWorkers, compositeOnWorkers, compositeStats, setCompositeOnWorkers } from './engine/composite-bands';
import { bandPoolSize, bandPoolStats, bandsShared } from './engine/band-pool';
import { channelsFromU8, channelsToU8, composeChannels, rasterBytes } from './engine/channels';
import { applyLut, type Lut3x4, type Lut4 } from './engine/colour-lut';
import type { ChannelPixels, DocMode, DocProfile, ID } from './engine/types';
import { headerResolution } from './io/image-size';
import { ConditionalModeDialog, SOURCE_MODES } from './ui/panels/conditional-mode-dialog';
import { HdrToningDialog } from './ui/panels/hdr-toning';
import { Preview32Dialog } from './ui/panels/preview32-dialog';
import { AssignProfileDialog, ConvertProfileDialog, ModeConvertDialog, ProfileInfoDialog, ProfileMismatchDialog, ProofSetupDialog, convertDocumentDeep, type Space } from './ui/panels/colour-dialogs';
import { embeddedProfile, exifColourSpace, fromBase64, isSrgbName, profileName, toBase64 } from './io/icc-read';
import { exifBlockOf, withColourSpaceTag } from './io/exif';
import { toolHost } from './extensions/registry';
import { Viewport } from './engine/viewport';
import { enhanceAllSelects } from './ui/dropdown';
import { PanelGroup } from './ui/panel-group';
import { ChannelsPanel } from './ui/channels';
import { NativeMenus, wantsNativeMenus, menusInWindow, MENUS_IN_WINDOW_KEY } from './ui/native-menu';
import { rendererFallback } from './gpu/fallback';
import { HomeScreen } from './ui/home';
import { ALL_PANELS, Dock, registerPanel, unregisterPanel } from './ui/dock';
import { AdjustPanel } from './ui/panels/adjust-panel';
import { FILTER_LABELS, FilterPanel, createDevelopDock, type FilterKind, runFilter, defaultFilterSettings, type FilterPanelSettings, filterMargin } from './ui/panels/filter-panel';
import { LIBRARY, isLibKind, libDefaults, libHasDialog, libInGroup, type LibGroup } from './engine/filter-library';
import { GALLERY_FX } from './engine/filters-lib/filter-gallery';
import { WasmFilterDialog, WasmPluginsDialog, applyWasm } from './ui/panels/wasm-plugins-dialog';
import { wasmPlugins, runWasmFilter } from './engine/wasm-plugin-host';
import { isWasmKind, wasmIdOf, wasmValues } from './engine/wasm-plugin';
import { NeuralFiltersDialog } from './ui/panels/neural-dialog';
import { WideAngleDialog } from './ui/panels/wide-angle-dialog';
import { AmountDialog, CanvasSizeDialog, FitImageDialog, ImageSizeDialog } from './ui/panels/size-dialogs';
import { ContactSheetDialog } from './ui/panels/contact-sheet-dialog';
import { LoadStackDialog } from './ui/panels/load-stack-dialog';
import { JpegDialog } from './ui/panels/jpeg-dialog';
import { BackgroundPanel, mattingChoice } from './ui/panels/background-panel';
import { subjectMask } from './io/fal';
import { GEN_CHANGED, genPrefs } from './io/gen-prefs';
import { FalTaskDialog } from './ui/panels/fal-task-dialog';
import { ColorPickerDialog } from './ui/panels/color-picker';
import { LiveMaskDialog } from './ui/panels/live-mask-dialog';
import { Commands, comboOf, type Command, type CommandParam } from './ui/commands';
import { anyDialogOpen, askSaveChanges, askSaveChangesAll, confirmAction, promptName } from './ui/dialogs';
import { el, mountOnce, q, revealApp, setDisabled, setHidden, setStyleVar, setText, setTitle } from './ui/dom';
import { icon } from './ui/icons';
import { brandMark } from './ui/brand';
import { LayersPanel } from './ui/layers';
import { MenuBar, PopupMenu, setMenuStyle, type MenuDef } from './ui/menu';
import { OptionsBar } from './ui/options';
import { invalidatePaint } from './ui/palette';
import { Rail } from './ui/rail';
import { openToolbarDialog } from './ui/panels/toolbar-dialog';
import { MenusDialog } from './ui/panels/menus-dialog';
import { slotTool, toolGroups } from './ui/tool-groups';
import { Stage } from './ui/stage';
import { StatusBar, SERVICE_NOTE } from './ui/status';
import { t, tn, onLanguage } from './ui/i18n';
import { Tabs } from './ui/tabs';
import { ViewTiles, type ArrangeLayout } from './ui/view-tiles';
import { FloatViews } from './ui/float-views';
import { TaskBar } from './ui/task-bar';
import { toast } from './ui/toast';
import { chooseKys } from './ui/kys-import';

/** Each tab's own group, where Reset Panels returns it. */
/** Edit > Preferences: a command for each page of the Preferences dialog, as [command suffix, menu label, page]. */
const PREF_PAGES: ReadonlyArray<readonly [string, string, string]> = [['general', 'General...', 'General'], ['interface', 'Interface...', 'Interface'], ['workspace', 'Workspace...', 'Workspace'], ['tools', 'Tools...', 'Tools'], ['history-cache', 'History & Cache...', 'History & Cache'], ['file-handling', 'File Handling...', 'File Handling'], ['performance', 'Performance...', 'Performance'], ['scratch-disks', 'Scratch Disks...', 'Scratch Disks'], ['cursors', 'Cursors...', 'Cursors'], ['transparency', 'Transparency & Gamut...', 'Transparency & Gamut'], ['units', 'Units & Rulers...', 'Units & Rulers'], ['guides', 'Guides, Grid & Slices...', 'Guides & Grid'], ['type', 'Type...', 'Type'], ['plugins', 'Plug-ins...', 'Plugins'], ['enhanced-controls', 'Enhanced Controls...', 'Enhanced Controls'], ['raw-defaults', 'Raw Defaults...', 'Camera Raw Defaults']];
const TAB_HOMES: Record<string, string> = { info: 'info', layers: 'layers-panel', channels: 'layers-panel', paths: 'layers-panel', navigator: 'navigator', generate: 'generate', swatches: 'swatches', color: 'swatches', properties: 'properties', brushes: 'brushes', 'brush-settings': 'brushes', paragraph: 'paragraph', character: 'character' };
const LAYERS_W_KEY = 'formvis_layers_w';
const SKIPPED_UPDATE_KEY = 'formvis_skipped_update';
const TILE_ENGINE_KEY = 'formvis_tile_engine';
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function store(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { return; }
}

const SHELL = `<div class="cv-app">
<header class="cv-titlebar">
<nav class="cv-menubar" aria-label="Main menu"></nav>
<div class="cv-tb-doc"></div>
<div class="cv-tb-app">formvis 2026</div>
<div class="cv-zoom">
<button class="cv-tt-btn" type="button" data-cmd="settings">${icon('settings', 16)}</button>
<button class="cv-tt-btn cv-sheet-btn" type="button" data-cmd="sheet-tools" aria-label="Tools" title="Tools">${icon('tBrush', 16)}</button>
<button class="cv-tt-btn cv-sheet-btn" type="button" data-cmd="sheet-panels" aria-label="Panels" title="Panels">${icon('layers', 16)}</button>
<button class="cv-tt-btn cv-sheet-btn" type="button" data-cmd="sheet-props" aria-label="Properties" title="Properties">${icon('panelProps', 16)}</button>
</div>
</header>
<div class="cv-main">
<div class="cv-doc-tabs"><div class="cv-brand">${icon('paintbrush', 18)}</div><div class="cv-tabs"><div class="cv-tab-strip" role="tablist"></div><button class="cv-icon-btn" type="button" data-cmd="new">${icon('add', 16)}</button></div></div>
<div class="cv-options"></div>
<aside class="cv-rail" aria-label="Tools"><button class="cv-rail-toggle" type="button" data-cmd="rail-columns" title="One or two columns" aria-label="One or two columns">${icon('collapseRight', 14)}</button><div class="cv-rail-tools"></div><div class="cv-rail-bottom"><div class="cv-colors"></div><div class="cv-rail-modes"><button class="cv-tool cv-mode-btn" type="button" data-cmd="quick-mask" title="Edit in Quick Mask Mode (Q)" aria-label="Edit in Quick Mask Mode">${icon('quickMask', 18)}</button><button class="cv-tool cv-mode-btn" type="button" data-cmd="screen-next" title="Change Screen Mode (F)" aria-label="Change Screen Mode">${icon('screenMode', 18)}</button></div></div></aside>
<div class="cv-stage-col">
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
<section class="cv-vtl" aria-label="Video timeline" hidden></section>
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
  const freshProfile = (() => { try { return !Object.keys(localStorage).some((k) => k.startsWith('formvis.')); } catch { return true; } })();
  const appHost = document.getElementById('app');
  if (!appHost) return;
  mountOnce(appHost, SHELL);
  const root = q(appHost, '.cv-app');
  const savedWidth = Number(stored(LAYERS_W_KEY));
  if (savedWidth >= 200 && savedWidth <= 480) setStyleVar(root, '--cv-layers-w', `${savedWidth}px`);

  const engine = new Engine();
  engine.tiledDocuments = stored(TILE_ENGINE_KEY) !== 'off';
  const syncGenerative = (): void => { const g = genPrefs(); engine.generativeSource = g.source; engine.generativeMatch = g.match; };   // Preferences > Generative (1.96.2, 1.96.3)
  syncGenerative();
  window.addEventListener(GEN_CHANGED, syncGenerative);
  templateContext.size = () => (engine.current ? { width: engine.current.doc.width, height: engine.current.doc.height } : null);
  engine.on('notice', (n) => toast(n.text, n.kind));
  const errorLog = new ErrorLog((t) => toast(t, 'error'), () => engine.failures);
  errorLog.install();
  const commands = new Commands();
  const colourSettingsDialogs = installColorSettings(commands, engine, () => colourView);
  const contextMenu = new PopupMenu(commands, null, true);
  // Panel menus (the target's •••): each group's own commands, opened below its button.
  const panelMenu = new PopupMenu(commands, null, true);
  /** The canvas layer picker (1.87.3, CLOSE_GAPS P06): the layers under a right-click with the Move tool, top first. */
  let picked: string[] = [];
  const pickMenu = new PopupMenu(commands, null, true);
  const fillMenu = new PopupMenu(commands, null, true);
  toolHost.run = (id) => { commands.run(id); };   // a tool's bar runs commands (the path actions)
  let menuPanel: string | null = null;
  PanelGroup.menuHost = (anchor, ids, group) => { menuPanel = dockIdOfGroup(group.id); panelMenu.setItems(menuPanel ? [...ids, '-', dock.isFloating(menuPanel) ? 'panel-dock' : 'panel-float'] : ids); const r = anchor.getBoundingClientRect(); panelMenu.openAt(r.right, r.bottom + 4); };
  // Screen modes and panels (the owner's walkthrough): Standard, Full Screen with Menu Bar (no tabs or
  // status bar), Full Screen (the canvas alone, on black; Esc leaves it); F cycles them; Tab shows or hides the panels.
  // The rail: Quick Mask (Q) below the colours, and its one or two columns (the » at its top), remembered.
  // The compact layout (1.58.7, L12): under 720 pixels the rail, the panels and the side column are sheets over the
  // canvas (shell.css), one open at a time from the title bar's buttons; a tap on the canvas closes an open sheet and
  // paints nothing.
  type Sheet = 'tools' | 'panels' | 'props';
  const SHEETS: Sheet[] = ['tools', 'panels', 'props'];
  const openSheet = (s: Sheet | null): void => {
    for (const k of SHEETS) {
      root.classList.toggle(`is-sheet-${k}`, k === s);
      root.querySelector(`[data-cmd="sheet-${k}"]`)?.classList.toggle('is-on', k === s);
    }
  };
  const sheetOpen = (): boolean => SHEETS.some((k) => root.classList.contains(`is-sheet-${k}`));
  root.querySelector('.cv-stage')?.addEventListener('pointerdown', (e) => {
    if (!sheetOpen() || !window.matchMedia('(max-width: 719px)').matches) return;
    e.stopPropagation(); e.preventDefault(); openSheet(null);
  }, true);
  type Screen = 'standard' | 'menu' | 'full';
  let screen: Screen = 'standard', panelsHidden = false;
  const applyScreen = (): void => {
    root.classList.toggle('is-screen-menu', screen === 'menu');
    root.classList.toggle('is-screen-full', screen === 'full');
    root.classList.toggle('is-panels-hidden', panelsHidden || screen === 'full');
    window.dispatchEvent(new Event('resize'));
  };
  // Preferences > Workspace > Auto-Show Hidden Panels: with the panels hidden, the pointer at the window's left or right edge shows the tools or the panels over the canvas until it leaves them.
  document.addEventListener('pointermove', (e) => {
    const hidden = root.classList.contains('is-panels-hidden');
    if (!hidden && !root.classList.contains('is-peek-left') && !root.classList.contains('is-peek-right')) return;
    const on = hidden && loadPrefs().autoShowPanels, over = (e.target as Element | null)?.closest('.cv-rail, .cv-props-col, .cv-layers');
    const left = on && (e.clientX <= 4 || (root.classList.contains('is-peek-left') && !!over && e.clientX < window.innerWidth / 2));
    const right = on && !left && (e.clientX >= window.innerWidth - 4 || (root.classList.contains('is-peek-right') && !!over && e.clientX > window.innerWidth / 2));
    root.classList.toggle('is-peek-left', left); root.classList.toggle('is-peek-right', right);
  });
  // The OS window's full screen: Full Screen Mode asks for it and leaves it, F11 toggles it on its own; the picture
  // is refitted to the new size, and leaving by the OS (Esc) leaves the mode too.
  let dockHidden = false, railHidden = stored('formvis.railHidden') === '1', optionsHidden = stored('formvis.optionsHidden') === '1';
  const osFull = (): boolean => !!document.fullscreenElement;
  const setOsFull = (on: boolean): void => {
    if (on === osFull()) return;
    try { void (on ? document.documentElement.requestFullscreen() : document.exitFullscreen()).catch(() => undefined); } catch { /* not allowed here */ }
  };
  const setScreen = (s: Screen): void => {
    const was = screen;
    screen = s; applyScreen();
    if (s === 'full') setOsFull(true); else if (was === 'full') setOsFull(false);
    if ((s === 'full') !== (was === 'full')) window.setTimeout(() => engine.fit(), 160);
  };
  const applyChromeParts = (): void => {
    root.classList.toggle('is-dock-hidden', dockHidden);
    root.classList.toggle('is-rail-hidden', railHidden);
    root.classList.toggle('is-options-hidden', optionsHidden);
    window.dispatchEvent(new Event('resize'));
  };
  document.addEventListener('fullscreenchange', () => { if (!osFull() && screen === 'full') setScreen('standard'); });
  const railDouble = (): boolean => stored('formvis.railDouble') === '1';
  const applyRail = (): void => { q(root, '.cv-rail').classList.toggle('is-double', railDouble()); window.dispatchEvent(new Event('resize')); };
  // Right-to-left layout: the document's direction flips the rail, the dock and the menu bar to the other side.
  const rtl = (): boolean => stored('formvis.rtl') === '1';
  const applyRtl = (): void => { if (document.documentElement.dir !== (rtl() ? 'rtl' : 'ltr')) { document.documentElement.dir = rtl() ? 'rtl' : 'ltr'; window.dispatchEvent(new Event('resize')); } };
  // Interface zoom: the whole window scaled, kept between runs; the stage measures itself again. The desktop window zooms its web
  // view through the shell (which also keeps it for the next launch); the browser, and a shell that refuses, use CSS zoom on the root.
  const UI_ZOOMS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  const uiZoom = (): number => { const raw = stored('formvis.uiZoom'); if (raw === 'auto') return autoUiScale(); const n = parseFloat(raw ?? '1'); return UI_ZOOMS.includes(n) ? n : 1; };
  const cssZoom = (zoom: number): void => { const z = zoom === 1 ? '' : String(zoom); if (document.documentElement.style.zoom !== z) { document.documentElement.style.zoom = z; window.dispatchEvent(new Event('resize')); } };
  let shellZoomed: Promise<void> = Promise.resolve();
  const applyUiZoom = (): void => {
    const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke(cmd: string, args: Record<string, unknown>): Promise<unknown> } }).__TAURI_INTERNALS__;
    if (!tauri) { cssZoom(uiZoom()); return; }
    shellZoomed = shellZoomed.then(async () => {
      try {
        const held = Number(await tauri.invoke('ui_zoom', { factor: null })) || 1;
        setShellZoom(held);
        const want = uiZoom();
        if (want !== held) setShellZoom(Number(await tauri.invoke('ui_zoom', { factor: want })) || want);
        cssZoom(1);
      } catch { setShellZoom(1); cssZoom(uiZoom()); }
    });
  };
  const stepUiZoom = (by: number): void => { store('formvis.uiZoom', String(UI_ZOOMS[Math.max(0, Math.min(UI_ZOOMS.length - 1, UI_ZOOMS.indexOf(uiZoom()) + by))])); applyUiZoom(); };
  // The pasteboard around the picture: the theme's own, or a fixed grey (View > Pasteboard).
  const PASTEBOARDS: Record<string, string> = { default: '', black: '#000000', dark: '#303030', mid: '#808080', light: '#c8c8c8' };
  const pasteboard = (): string => { const v = stored('formvis.pasteboard') ?? 'default'; return v in PASTEBOARDS ? v : 'default'; };
  const applyPasteboard = (): void => { const c = PASTEBOARDS[pasteboard()]; if (c) setStyleVar(root, '--pasteboard', c); else root.style.removeProperty('--pasteboard'); };
  const pasteboardCmd = (id: string, label: string, key: string) => ({ id, label, checked: () => pasteboard() === key, run: () => { store('formvis.pasteboard', key); applyPasteboard(); } });
  commands.add(
    { id: 'quick-mask', label: 'Edit in Quick Mask Mode', keys: ['Q'], checked: () => engine.quickMask, enabled: () => !!engine.current, run: () => engine.toggleQuickMask() },
    { id: 'screen-standard', label: 'Standard Screen Mode', checked: () => screen === 'standard', run: () => setScreen('standard') },
    { id: 'screen-menu', label: 'Full Screen Mode with Menu Bar', checked: () => screen === 'menu', run: () => setScreen('menu') },
    { id: 'screen-full', label: 'Full Screen Mode', checked: () => screen === 'full', run: () => setScreen('full') },
    { id: 'screen-next', label: 'Change Screen Mode', keys: ['F'], run: () => setScreen(screen === 'standard' ? 'menu' : screen === 'menu' ? 'full' : 'standard') },
    { id: 'toggle-panels', label: 'Show or Hide Panels', keys: ['Tab'], checked: () => !panelsHidden && screen !== 'full', run: () => { if (screen === 'full') { setScreen('standard'); return; } panelsHidden = !panelsHidden; applyScreen(); } },
    { id: 'toggle-dock-panels', label: 'Show or Hide Side Panels', keys: ['Shift+Tab'], checked: () => !dockHidden, run: () => { dockHidden = !dockHidden; applyChromeParts(); } },
    { id: 'panel-tools', label: 'Tools', checked: () => !railHidden, run: () => { railHidden = !railHidden; store('formvis.railHidden', railHidden ? '1' : '0'); applyChromeParts(); } },
    { id: 'panel-options', label: 'Options', checked: () => !optionsHidden, run: () => { optionsHidden = !optionsHidden; store('formvis.optionsHidden', optionsHidden ? '1' : '0'); applyChromeParts(); } },
    { id: 'os-full-screen', label: 'Full Screen', keys: ['F11'], checked: osFull, run: () => setOsFull(!osFull()) },
    { id: 'rail-columns', label: 'Tools in Two Columns', checked: railDouble, run: () => { store('formvis.railDouble', railDouble() ? '0' : '1'); applyRail(); } },
    { id: 'interface-rtl', label: 'Right-to-Left Layout', checked: rtl, run: () => { store('formvis.rtl', rtl() ? '0' : '1'); applyRtl(); } },
    { id: 'next-favourite-theme', label: 'Next Favorite Theme', enabled: () => loadPrefs().favouriteThemes.length > 0, run: () => {
      const fav = loadPrefs().favouriteThemes, at = fav.indexOf(readChoice().theme), next = fav[(at + 1) % fav.length];
      if (next) { setTheme(next); toast(`Theme: ${THEMES[next]?.label ?? next}.`, 'info'); }
    } },
    { id: 'interface-zoom-in', label: 'Interface Zoom In', keys: ['Alt+Mod+='], run: () => stepUiZoom(1) },
    { id: 'interface-zoom-out', label: 'Interface Zoom Out', keys: ['Alt+Mod+-'], run: () => stepUiZoom(-1) },
    { id: 'interface-zoom-reset', label: 'Reset Interface Zoom', keys: ['Alt+Mod+0'], enabled: () => uiZoom() !== 1, run: () => { store('formvis.uiZoom', '1'); applyUiZoom(); } },
    { id: 'custom-title-bar', label: 'Custom Title Bar', enabled: () => wantsCustomTitleBar(), checked: () => captionButtons.active, run: () => { store('formvis.customTitleBar', captionButtons.active ? '0' : '1'); captionButtons.sync(); } },
    { id: 'menus-in-window', label: 'Menus in Window', enabled: () => '__TAURI_INTERNALS__' in window && /Mac/.test(navigator.platform), checked: menusInWindow, run: () => { store(MENUS_IN_WINDOW_KEY, menusInWindow() ? '0' : '1'); toast(menusInWindow() ? 'The menus stay in the window from the next start.' : 'The menus go to the menu bar from the next start.', 'info'); } },
    pasteboardCmd('pasteboard-default', 'Pasteboard: Theme Default', 'default'),
    pasteboardCmd('pasteboard-black', 'Pasteboard: Black', 'black'),
    pasteboardCmd('pasteboard-dark', 'Pasteboard: Dark Gray', 'dark'),
    pasteboardCmd('pasteboard-mid', 'Pasteboard: Medium Gray', 'mid'),
    pasteboardCmd('pasteboard-light', 'Pasteboard: Light Gray', 'light'),
  );
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && screen === 'full') { setScreen('standard'); e.preventDefault(); } }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !anyDialogOpen() && generationsRunning() && stopGenerations()) { e.preventDefault(); toast('Stopped the generation.'); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !anyDialogOpen() && engine.cancelJob()) { e.preventDefault(); toast('Stopping the running job.'); } });
  document.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('.cv-st-busy') && generationsRunning() && stopGenerations()) toast('Stopped the generation.'); });
  engine.on('busy', (on: boolean) => { const b = root.querySelector('.cv-st-busy'); const tip = on && generationsRunning() ?'A generation is running: click to stop it (Esc)' : ''; if (b && b.getAttribute('title') !== tip) { if (tip) b.setAttribute('title', tip); else b.removeAttribute('title'); } });
  engine.on('options', () => q(root, '.cv-rail [data-cmd="quick-mask"]').classList.toggle('is-on', engine.quickMask));
  applyRail();
  applyChromeParts();
  applyPasteboard();
  applyRtl();
  applyUiZoom();
  window.addEventListener('formvis:ui-zoom', applyUiZoom);   // Preferences > Interface > Interface Scale
  // Auto follows the display: a window moved to a screen with another pixel ratio is sized again at once.
  const watchRatio = (): void => { matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { if (stored('formvis.uiZoom') === 'auto') applyUiZoom(); watchRatio(); }, { once: true }); };
  watchRatio();
  applyPrefs(engine, loadPrefs());
  const stage = new Stage(q(root, '.cv-stage'), engine);
  q(root, '.cv-stage').addEventListener('contextmenu', (e) => {
    // A text field on the stage (the task bar's prompt) keeps the system's Cut, Copy and Paste menu (1.96.3).
    if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"]')) return;
    if (['brush', 'spotHealing', 'remove', 'cloneStamp', 'smear', 'type'].includes(engine.tool) || (e.ctrlKey && e.altKey)) return;
    const pt = stage.docPoint(e.clientX, e.clientY), vp = engine.current?.viewport;
    if (!pt || !vp || engine.guideAt(vp.toScreen(pt.x, pt.y)) !== null) return;
    picked = engine.layersAt(pt);
    const sel = ['marquee', 'lasso', 'objectSelect', 'wand', 'quickSelect', 'selectionBrush'].includes(engine.tool);
    const own = sel ? ['select-all', 'deselect', 'inverse', '-', 'select-and-mask'] : engine.tool === 'crop' ? ['image-crop'] : ['hand', 'zoom', 'idle', 'rotateView'].includes(engine.tool) ? ['zoom-in', 'zoom-out', 'fit', 'actual', 'flip-view-h'] : ['undo', 'redo', '-', 'zoom-in', 'zoom-out', 'fit'];
    e.preventDefault();
    pickMenu.setItems([...picked.map((_, i) => `pick-layer-${i}`), ...(picked.length ? ['-'] : []), ...own]);
    pickMenu.openAt(e.clientX, e.clientY);
  });
  // Help > Record Performance (1.86.4); also `formvisPerf.record(10)` in the desktop app's Web Inspector console.
  const perfCtx = { engine, stage, gpuText: () => [...document.querySelectorAll('.cv-status *')].map((e) => e.textContent ?? '').find((s) => /^GPU:/.test(s.trim()))?.trim() ?? '?' };
  const perfDialog = new PerfDialog(perfCtx);
  (window as unknown as { formvisPerf: unknown }).formvisPerf = { record: async (seconds = 10) => { const r = await recordPerformance(perfCtx, seconds); console.log(r); return r; } };
  const viewTiles = new ViewTiles(q(root, '.cv-stage-col'), engine);   // Window > Arrange (the Stage's own ResizeObserver refits it)
  const floatViews = new FloatViews(q(root, '.cv-stage-col'), engine);   // Window > Arrange > Float in Window (36.16)
  const taskBar = new TaskBar(q(root, '.cv-stage'), engine, commands, () => stage.ctx.view());   // View > Contextual Task Bar
  // Preferences the interface draws with (the engine's are applyPrefs'): the stage's checkerboard, wheel, rulers, grid
  // and guides, and the side column's narrow-window icons.
  // Show Tool Tips off: an element's title is held in data-tip-held as the pointer reaches it and put back when turned on.
  let tipsOn = true;
  document.addEventListener('mouseover', (e) => {
    if (tipsOn || !(e.target instanceof Element)) return;
    const t = e.target.closest('[title]');
    if (t) { t.setAttribute('data-tip-held', t.getAttribute('title') ?? ''); t.removeAttribute('title'); }
  }, true);
  const applyTooltips = (on: boolean): void => {
    tipsOn = on;
    if (on) for (const t of Array.from(document.querySelectorAll('[data-tip-held]'))) { t.setAttribute('title', t.getAttribute('data-tip-held') ?? ''); t.removeAttribute('data-tip-held'); }
  };
  const applyChecker = (pr: Prefs): void => {
    const [a, b] = checkerPair(pr.checkerColors, !!THEMES[readChoice().theme]?.light, [pr.checkerA, pr.checkerB]);
    document.documentElement.style.setProperty('--cv-checker-a', a);
    document.documentElement.style.setProperty('--cv-checker-b', pr.checkerSize === 'none' ? a : b);
  };
  const historyLog = new HistoryLog(engine);
  const applyUiPrefs = (pr: Prefs): void => {
    Stage.prefs = { cell: CHECKER_CELL[pr.checkerSize], zoomWheel: pr.zoomWheel, rulerUnits: pr.rulerUnits, gridColor: pr.gridColor, guideColor: pr.guideColor, gridStyle: pr.gridStyle, guideStyle: pr.guideStyle, gridOpacity: pr.gridOpacity };
    Object.assign(Stage.controls, { preciseOther: pr.cursorOther === 'precise', pinch: pr.pinchZoom, rotate: pr.trackpadRotate, touch: pr.touchGestures, colMm: pr.colWidth + pr.gutter, colWidthMm: pr.colWidth, border: pr.canvasBorder });
    applyChecker(pr);
    applyTooltips(pr.showTooltips);
    FloatViews.prefs = { zoomResize: pr.zoomResizes, docking: pr.floatDocking, asTabs: pr.openAsTabs };
    applyUiFontSize(pr);
    document.body.classList.toggle('animations-disabled', !pr.animations);
    Stage.usePressure = pr.usePressure;
    Stage.animate = pr.animations;
    setMenuStyle(pr.menuHidden, pr.menuColors);
    PropertiesColumn.narrowCollapse = pr.narrowCollapse;
    Dock.remember = pr.rememberLayout;
    document.body.classList.toggle('large-tabs', pr.largeTabs);
    document.body.classList.toggle('narrow-options', pr.narrowOptions);
    historyLog.enable(pr.historyLog);
    stage.restyle();
    window.dispatchEvent(new Event('resize'));
  };
  applyUiPrefs(loadPrefs());
  document.addEventListener('nm:ui-settings-changed', () => applyChecker(loadPrefs()));   // Match Theme follows a theme change at once
  // Beep When Done: a short tone when a job that ran over two seconds ends.
  let busySince = 0;
  engine.on('busy', (on: boolean) => {
    if (on) { if (!busySince) busySince = performance.now(); return; }
    const long = busySince > 0 && performance.now() - busySince >= 2000;
    busySince = 0;
    if (!long || !loadPrefs().beepWhenDone) return;
    try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.18); o.onended = () => void a.close(); } catch { /* no audio here */ }
  });
  const typing = new TextEditor(q(root, '.cv-stage'), engine);
  // The Properties column (Phase 21), shown unless hidden from Window > Properties Column (remembered).
  const props = new PropertiesColumn(q(root, '.cv-props-col'), engine, (c) => { commands.run(c); }, () => syncPropsCol());
  const relight = new RelightSession(engine, props.root, q(root, '.cv-stage'));
  // Relight's controls live in the Properties column, as the reference's side panel: a session opens the column
  // (shown and out of its strip) so they are always in view (1.86.1).
  relight.onBegin = () => { if (stored('formvis.propsCol') === 'hidden') { store('formvis.propsCol', 'shown'); syncPropsCol(); } props.reveal(); };
  relight.onEnd = () => props.conceal();
  // The Relight tool in the toolbar starts a session as the menus do (editing the lights of a Relight layer when one is
  // active); when it cannot start, the tool before it comes back.
  engine.on('tool', () => {
    if (engine.tool !== 'relight') { relight.cameFrom = engine.tool; return; }
    if (relight.editing) return;
    const l = engine.activeLayer, back = relight.cameFrom ?? 'move';
    void (l?.relight ? relight.begin(l.id) : relight.begin()).then(() => { if (!relight.editing && engine.tool === 'relight') engine.setTool(back); });
  });
  let dockRef: Dock | null = null;   // the side column shows only while it holds a shown panel (panels move: the Dock)
  const propsShown = (): boolean => stored('formvis.propsCol') !== 'hidden';
  const sideOpen = (): boolean => propsShown() && (dockRef ? dockRef.sideShown() > 0 : true);
  const syncPropsCol = (): void => { setHidden(q(root, '.cv-props-col'), !sideOpen()); setStyleVar(root, '--cv-props-w', sideOpen() ? '46px' : '0px'); Viewport.insetRight = sideOpen() && !PropertiesColumn.showingCollapsed && !root.matches('.is-panels-hidden, .is-dock-hidden') ? PropertiesColumn.openWidth() - 46 : 0; stage.layoutChanged(); };   // the strip's track only: expanded, the column lies over the canvas (the owner's walkthrough), and fitting leaves it out
  syncPropsCol();
  window.addEventListener('resize', () => syncPropsCol());
  new NavigatorPanel(q(root, '.cv-layers'), engine);
  // Window > Generate: generative fill, models, ComfyUI and NodeMode in the dock; every button runs its own command.
  const generatePanel = new GeneratePanel(q(root, '.cv-layers'), engine, {
    run: (id, params) => commands.run(id, params),
    state: (id) => { const c = commands.get(id); return c ? { enabled: commands.enabled(c), why: commands.why(c) } : { enabled: false, why: '' }; },
    toast: (text, kind) => toast(text, kind),
    heard: (r) => heard(r),
  });
  const swatches = new SwatchesPanel(q(root, '.cv-layers'), engine);
  const layers = new LayersPanel(q(root, '.cv-layers'), engine, contextMenu);
  layers.docPoint = (x, y) => stage.docPoint(x, y);
  new PathsPanel(q(root, '.cv-layers'), engine);
  layers.adoptPaths(q(root, '.cv-paths'));
  layers.adoptChannels(new ChannelsPanel(engine, q(root, '.cv-stage'), (id) => commands.run('channel-options', { channel: id })));   // the Channels tab (Phase 21)
  new TimelinePanel(q(root, '.cv-layers'), engine);
  const tiffOptions = new TiffOptionsDialog();
  const renderDialog = new RenderVideoDialog(engine, (c) => renderVideo(c));   // 1.59.6, DEV_PLAN 25.4
  // 1.59.3, DEV_PLAN 25.2: under the canvas; 1.59.8: kept for Window > Timeline, and opening the frames panel.
  const vtl = new VideoTimelinePanel(q(root, '.cv-vtl'), engine, () => renderDialog.show(), () => { if (!dock.isShown('timeline')) dock.toggle('timeline'); });
  new HistoryPanel(q(root, '.cv-layers'), engine);
  new LayerCompsPanel(q(root, '.cv-layers'), engine);   // Window > Layer Comps (DEV_PLAN 33.3 part b)
  registerPanel({ id: 'layer-comps', label: 'Layer Comps', selector: 'section.cv-layer-comps' });
  new StylesPanel(q(root, '.cv-layers'), engine, (blob, name) => deliver(blob, name));   // Window > Styles (DEV_PLAN 35.3 part b)
  createPresetPanels(q(root, '.cv-layers'), engine, () => savePatterns());   // Window > Gradients, Patterns, Shapes (DEV_PLAN 35.3 part c)
  createMorePanels(q(root, '.cv-layers'), engine, (id) => { void catalogue.runCommand(id).then((r) => { if (!r.ok) toast(r.error ?? 'That could not run now.', 'error'); }); });   // Window > Adjustments, Notes, Histogram (DEV_PLAN 36.17)
  const actionsPanel = createActionsPanel(q(root, '.cv-layers'));
  new ModifierKeysPanel(q(root, '.cv-layers'));   // Window > Modifier Keys (DEV_PLAN 35.3 part c)
  new MeasurementLogPanel(q(root, '.cv-layers'), engine, (blob, name) => deliver(blob, name));   // Window > Measurement Log
  const extensionsPanel = createExtensionsPanel(q(root, '.cv-layers'));   // Window > Extensions (Form Extension Contract, 2.1.0)
  // Groups made by detaching a tab (1.49.2) come back where they were: made (empty) before the dock reads its
  // arrangement, filled when the tabs' homes are restored.
  const CUSTOM = 'formvis.customGroups';
  const customGroups = (): Array<{ id: string; label: string }> => { try { const v = JSON.parse(stored(CUSTOM) ?? '[]'); return Array.isArray(v) ? v.filter((g) => g && typeof g.id === 'string' && /^g[0-9a-z]+$/.test(g.id) && typeof g.label === 'string') : []; } catch { return []; } };
  for (const g of customGroups()) { new PanelGroup(q(root, '.cv-layers'), g.id, [], g.label); registerPanel({ id: g.id, label: g.label, selector: `section.cv-${g.id}` }); }
  new InfoPanel(q(root, '.cv-layers'), engine, q(root, '.cv-stage'));   // Window > Info (1.49.6)
  const developHost = createDevelopDock(q(root, '.cv-layers'));
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
  // A tab released over a column's gap becomes a new group there; the marker says so while dragging.
  PanelGroup.onGapHint = (x, y, many = true) => {
    if (x === null) { dock.hideGap(); dock.floatHint(null, 0, ''); return; }
    const over = !!dock.gapAt(x, y);
    if (over && many) dock.showGap(x, y, 'New group'); else dock.hideGap();
    if (over) dock.floatHint(null, 0, ''); else dock.floatHint(x, y, '');
  };
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
  // A tab let go over neither a header nor a column is torn off: a lone tab's group floats whole, a tab out of several floats as a new group.
  PanelGroup.onTearOff = (tid, from, x, y) => {
    if (dock.locked || dock.gapAt(x, y)) return false;
    if (from.size < 2) { const own = dockIdOfGroup(from.id); return !!own && !dock.isFloating(own) && dock.tearOff(own, x, y); }
    const id = `g${Date.now().toString(36)}`, label = from.labelOf(tid);
    const g = new PanelGroup(q(root, '.cv-layers'), id, [], label);
    registerPanel({ id, label, selector: `section.cv-${id}` });
    store(CUSTOM, JSON.stringify([...customGroups(), { id, label }]));
    dock.float(id, { x: x - 40, y: y - 12 });
    PanelGroup.moveTab(tid, from, g);
    return true;
  };
  // Every tab goes home before the columns settle once, so a group still waiting for its tab is not taken for an empty one.
  const settle = PanelGroup.onMoved;
  let homed = false;
  PanelGroup.onMoved = () => { homed = true; };
  PanelGroup.restoreHomes();
  PanelGroup.onMoved = settle;
  if (homed) settle?.();
  // Collapsed, the column is its strip of icons; expanded, the width chosen by dragging (or the target's 288).
  const syncDockWidth = (on: boolean): void => { const w = Number(stored(LAYERS_W_KEY)); setStyleVar(root, '--cv-layers-w', on ? '46px' : `${w >= 200 && w <= 480 ? w : 288}px`); q(root, '.cv-resizer').classList.toggle('is-inert', on); };   // kept in the grid (hiding it would move the dock into its column)
  dock.onCollapse = syncDockWidth;
  if (dock.collapsed) syncDockWidth(true);
  // The title bar's tools (Phase 21): theme, command search, workspaces, Lock Workspace.
  enhanceAllSelects();   // every dropdown as the glass list (the owner's walkthrough)
  const titleTools = new TitleTools(q(root, '.cv-titlebar'), {
    commands,
    arrange: (w) => { dock.arrange(w.order, w.hidden, w.floats); store('formvis.propsCol', w.propsColumn ? 'shown' : 'hidden'); syncPropsCol(); },
    locked: () => dock.locked,
    setLocked: (on) => { dock.locked = on; },
    dock: (kind) => { void termDock.toggleKind(kind); },
  });
  dock.locked = dock.locked;
  const dockIdOfGroup = (gid: string): string | null => ALL_PANELS.find((p) => p.id === gid || p.selector.endsWith(`.cv-${gid}`))?.id ?? null;
  const panelGroupId = (v: unknown): string | null => (typeof v !== 'string' ? null : ALL_PANELS.some((p) => p.id === v) ? v : dockIdOfGroup(PanelGroup.ofTab(v)?.id ?? ''));
  const captionButtons = new CaptionButtons(q(root, '.cv-titlebar'), () => stored('formvis.customTitleBar') === '1');
  const comfyDot = new ComfyDot(q(root, '.cv-brand'),() => loadPrefs().comfyuiUrl, () => (stored('formvis.comfyDot') ?? (loadPrefs().comfyuiUrl !== DEFAULT_PREFS.comfyuiUrl ? '1' : '0')) === '1');
  new Rail(q(root, '.cv-rail'), engine);
  const optionMemory = installOptionMemory(engine);   // every tool option sticks (DEV_PLAN 35.1), before the bar and the catalogue read the options
  new OptionsBar(q(root, '.cv-options'), engine);
  const status = new StatusBar(q(root, '.cv-status'), engine);
  const hostLink = new HostLink((init) => { void openFromHost(init.initialState); }, () => { void exitApp(); });
  let caps: Capabilities | null = null;

  /** Outputs written through the save panel (1.87.0), newest first, for Home beside the exports folder's own files. */
  const OUTPUTS_KEY = 'formvis.outputs';
  function noteOutput(path: string): void {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(OUTPUTS_KEY) ?? '[]');
      const list = Array.isArray(stored) ? stored.filter((n): n is string => typeof n === 'string' && n !== path) : [];
      localStorage.setItem(OUTPUTS_KEY, JSON.stringify([path, ...list].slice(0, 50)));
    } catch { /* storage unavailable: Home lists the exports folder only */ }
  }

  /** Hands a file over (save panel in the desktop app, a download in the browser); false when nothing was written. */
  async function deliver(blob: Blob, name: string, folder = ''): Promise<void> { await deliverFile(blob, name, folder); }

  async function deliverFile(blob: Blob, name: string, folder = ''): Promise<boolean> {
    const lower = loadPrefs().lowerExtension;
    name = name.replace(/\.([A-Za-z0-9]+)$/, (_m, x: string) => `.${lower ? x.toLowerCase() : x.toUpperCase()}`);
    if (folder && caps?.desktop) {
      // Export Preferences names a folder inside the exports folder: written there without asking.
      try { const written = await api.exportFile(blob, name, folder); noteOutput(written); toast(`Saved to ${written}`); fireEvent('export'); return true; } catch (err) { toast(message(err), 'error'); return false; }
    }
    if (caps?.desktop && hasPanels()) {
      // The desktop app asks where an export goes (1.87.0, CLOSE_GAPS P01); Cancel writes nothing.
      const ext = (/\.([A-Za-z0-9]+)$/.exec(name)?.[1] ?? '').toLowerCase();
      let path: string | null = null, panel = true;
      const last = stored('formvis.exportFolder');   // the panel opens in the folder the last export went to
      try { path = await chooseSavePath('Export', last ? `${last}/${name}` : name, ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : []); } catch { panel = false; }
      if (panel) {
        if (!path) return false;
        try { const written = await api.writePath(path, blob); noteOutput(written); if (isDiskPath(path)) store('formvis.exportFolder', folderOf(path)); toast(`Saved ${written}`); fireEvent('export'); return true; } catch (err) { toast(message(err), 'error'); return false; }
      }
    }
    if (caps?.desktop) { const written = await api.exportFile(blob, name); noteOutput(written); toast(`Saved to ${written}`); fireEvent('export'); return true; }
    const pick = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<{ name: string; createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker;
    if (pick && !folder && !navigator.webdriver && window.isSecureContext && window === window.top) {
      // Chromium browsers ask where the file goes and open in the folder the last export used (the id keys that memory); Cancel writes nothing, and a browser without the picker downloads.
      const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? '', mime = blob.type.split(';')[0] || 'application/octet-stream';
      try {
        const handle = await pick.call(window, { suggestedName: name, id: 'formvis-export', startIn: 'pictures', ...(ext ? { types: [{ description: ext.toUpperCase(), accept: { [mime]: [`.${ext}`] } }] } : {}) });
        const out = await handle.createWritable();
        await out.write(blob);
        await out.close();
        toast(`Saved ${handle.name}`);
        fireEvent('export');
        return true;
      } catch (err) { if (err instanceof DOMException && err.name === 'AbortError') return false; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    fireEvent('export');
    return true;
  }

  /** A project from the engine read into a document, its giant layers through the engine's bands (1.62.8), for Open
   *  and for Revert (1.65.8). */
  function readOpened(o: OpenedProject): ReturnType<typeof deserialize> {
    const reader = { open: (n: string) => api.bandsReadOpen(o.session, n), rows: (k: string, n: number) => api.bandsReadRows(k, n) };
    return deserialize(o.manifest, (name) => {
      const url = o.images[name];
      return url ? api.fetchAsset(url) : Promise.reject(new Error(`${name} is missing from the project.`));
    }, reader);
  }

  async function openOpened(o: OpenedProject, libraryName: string | null): Promise<void> {
    const { doc, activeId, paths, timeline, selection, history } = await readOpened(o);
    const p = engine.addProject(doc, o.name, activeId);
    if (selection) p.selection = selection;
    if (history) p.history.load(history.names, [...history.snaps, { doc, activeId, selection: selection ?? null }]);
    if (paths) engine.setPathsOf(p, paths);
    if (timeline) engine.setTimelineFor(p, timeline);
    engine.markSaved(p, p.name, libraryName);
    p.libraryVersion = libraryName ? o.version ?? null : null;   // 1.58.8: conflict-safe saves
    p.filePath = o.path ?? null;   // 1.87.0: opened from a file, Save writes back to it
  }

  /** A small PNG of the whole picture (1.87.0) kept inside the project for Home and the file lists; null when it
   *  cannot be drawn (the save goes ahead without it). */
  async function thumbnailOf(p: NonNullable<typeof engine.current>): Promise<Blob | null> {
    try {
      const flat = engine.flattenedOf(p);
      if (!flat) return null;
      const k = Math.min(1, 512 / Math.max(flat.width, flat.height));
      const t = createSurface(Math.max(1, Math.round(flat.width * k)), Math.max(1, Math.round(flat.height * k)));
      const c = ctxOf(t);
      c.imageSmoothingQuality = 'high';
      c.drawImage(flat, 0, 0, t.width, t.height);
      return await toBlob(t, 'image/png');
    } catch { return null; }
  }

  /** Files chosen in the desktop app's open panel, Open Recent or Home (1.87.0): projects open from their file, so Save
   *  writes back to it; pictures and other formats open as if dropped on the window. */
  async function openPaths(paths: string[]): Promise<void> {
    const others: File[] = [];
    for (const path of paths) {
      const open = engine.projects.find((p) => p.filePath === path && !p.modified);
      if (open) { engine.switchTo(open.id); noteRecent(path); continue; }
      try {
        if (/\.(fvd|fmv|formvis|sny|sonny|canvasor|comp|zip)$/i.test(path)) {
          await engine.task(async () => { await openOpened(await api.openPath(path), null); });
        } else others.push(await api.readPath(path));
        noteRecent(path);
      } catch (err) {
        if (/no file at/i.test(message(err))) keepRecent(recent.filter((n) => n !== path));
        toast(message(err), 'error');
      }
    }
    if (others.length) await importFiles(others, undefined, 'documents');
  }

  /** File > Open in the desktop app (1.87.0): the system's open panel for any project or picture formvis reads. */
  async function openFromPanel(): Promise<boolean> {
    let paths: string[];
    try { paths = await chooseOpenPaths('Open', [{ name: 'Projects and pictures', extensions: [...PROJECT_ACCEPT.split(','), ...IMAGE_ACCEPT.split(','), ...decodeExtensions(), ...PRESET_ACCEPT.split(',')].filter((x) => x.startsWith('.')).map((x) => x.slice(1)) }]); } catch { return false; }
    if (paths.length) await openPaths(paths);
    return true;
  }

  /** the Open Recent (the system's recent documents, noted on every save and open): the ten library projects
   *  most recently saved or opened in this app, newest first, kept in this browser or desktop app's storage. */
  const RECENT_KEY = 'formvis.recent';
  let recent: string[] = [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    if (Array.isArray(stored)) recent = stored.filter((n): n is string => typeof n === 'string' && !!n).slice(0, 40);
  } catch { recent = []; }
  function keepRecent(next: string[]): void {
    recent = next.slice(0, 40);   // Home lists 40 (1.87.1); Open Recent shows the first 10
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* storage unavailable: the list lasts this session */ }
  }
  const noteRecent = (name: string): void => {
    keepRecent([name, ...recent.filter((n) => n !== name)]);
    const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke(cmd: string, args: Record<string, unknown>): Promise<unknown> } }).__TAURI_INTERNALS__;
    if (tauri && isDiskPath(name)) void tauri.invoke('note_recent_document', { path: name }).catch(() => undefined);
  };

  async function openLibrary(name: string): Promise<boolean> {
    if (isDiskPath(name)) { await openPaths([name]); return true; }   // a recent file on disk (1.87.0)
    const existing = engine.projects.find((p) => p.libraryName === name && !p.modified);
    if (existing) { engine.switchTo(existing.id); return true; }
    return engine.task(async () => {
      try { await openOpened(await api.openLibrary(name), name); noteRecent(name); return true; } catch (err) { if (/not found/i.test(message(err))) keepRecent(recent.filter((n) => n !== name)); toast(message(err), 'error'); return false; }
    });
  }

  // The Home screen over the canvas; the brand mark is its Home button.
  const home = new HomeScreen(q(root, '.cv-stage'), {
    engine, autoShow: () => loadPrefs().autoShowHome, afterClose: () => loadPrefs().homeOnLastClose, recent: () => recent,
    openRecent: (name) => { void openLibrary(name); }, run: (c) => { commands.run(c); },
    openPath: (path) => { void openPaths([path]); }, removeRecent: (name) => keepRecent(recent.filter((n) => n !== name)),
  });
  const brand = q(root, '.cv-brand');
  brand.setAttribute('role', 'button');
  brand.setAttribute('tabindex', '0');
  brand.setAttribute('aria-label', 'Home');
  brand.title = 'Home';
  brand.addEventListener('click', () => home.show());
  brand.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); home.show(); } });

  // Graphics processor (Phase 18.1): a start that never finished last time turns Use Graphics Processor off, as
  // after a driver crash; then the GPU is probed and the renderer chosen and shown.
  let gpuProbe: GpuProbe = { webgpu: null, webgl2: null }, gpuProbed = false;
  // The screen display for the chosen API, on that API's own canvas (a canvas takes one kind of context); a failed
  // start or a lost device is remembered per API, so losing WebGPU does not rule out WebGL2.
  let gpuDisplay: ScreenDisplay | null = null, gpuKind: 'webgpu' | 'webgl2' | 'native' | null = null, gpuStarting = false;
  const gpuFailed = new Set<'webgpu' | 'webgl2' | 'native'>();
  // The GPU filter runner (36.10): WebGL2 on its own offscreen canvas, used when Use Graphics Processor and Use the GPU
  // for filters are on, the renderer is not the CPU, and WebGL2 is a hardware one (a software rasteriser only when WebGL2
  // is named in Preferences). The engine only sees it through setGpuFilters.
  let filterGl: GlFilters | null = null;
  function syncGpuFilters(pr: ReturnType<typeof loadPrefs>): void {
    const w = gpuProbe.webgl2, want = !!w && pr.useGpu && pr.gpuFilters && pr.renderer !== 'cpu' && (!w.software || pr.renderer === 'webgl2');
    if (filterGl && (!want || !filterGl.ok)) { filterGl.destroy(); filterGl = null; }
    if (want && !filterGl) filterGl = GlFilters.create();
    setGpuFilters(want ? filterGl : null);
    setGpuEffects(want ? filterGl : null);
  }
  // A lost device (Phase 18.1, recovery 1.88.9): the first loss in ten minutes starts the renderer again at once, the
  // second drops that renderer for this session so drawing falls back to the CPU, and the third turns Use Graphics
  // Processor off. The losses are remembered across starts, so a crash loop is counted whole.
  const GPU_LOSSES = 'formvis.gpu.lost';
  function gpuLost(d: ScreenDisplay, api: 'webgpu' | 'webgl2' | 'native'): void {
    if (gpuDisplay === d) { gpuDisplay = null; gpuKind = null; }
    try { d.destroy(); } catch { /* a lost device cannot always be released */ }
    const now = Date.now();
    let recent: number[] = [];
    try { recent = (JSON.parse(localStorage.getItem(GPU_LOSSES) ?? '[]') as number[]).filter((t) => typeof t === 'number' && now - t < 600000); } catch { /* no history */ }
    recent.push(now);
    try { localStorage.setItem(GPU_LOSSES, JSON.stringify(recent)); } catch { /* no storage */ }
    if (recent.length >= 3) {
      gpuFailed.add(api);
      savePrefs({ ...loadPrefs(), useGpu: false });
      try { localStorage.removeItem(GPU_LOSSES); } catch { /* no storage */ }
      engine.notice('The graphics renderer stopped three times in ten minutes, so Use Graphics Processor is now off. It can be turned on again in Preferences > Performance.');
    } else if (recent.length === 2) {
      gpuFailed.add(api);
      engine.notice('The graphics renderer stopped again, so drawing stays on the CPU for this session.');
    } else engine.notice('The graphics renderer stopped; starting it again.');
    syncGpu();
  }
  function syncGpu(): void {
    if (!gpuProbed) return;
    const pr = loadPrefs(), ch = chooseRenderer(gpuProbe, pr.useGpu, pr.renderer), adapterName = ch.adapter ? `${ch.adapter.name}${ch.adapter.software ? ' (software)' : ''}` : '';
    const want = ch.mode === 'cpu' ? null : ch.mode;
    syncGpuFilters(pr);
    if (gpuDisplay && gpuKind !== want) { gpuDisplay.destroy(); gpuDisplay = null; gpuKind = null; }
    if (want && !gpuDisplay && !gpuStarting && !gpuFailed.has(want)) {
      gpuStarting = true;
      markGpuStarting();
      const started = (d: ScreenDisplay | null): void => {
        markGpuStarted();
        gpuStarting = false;
        if (d) { gpuDisplay = d; gpuKind = want; d.onLost = () => gpuLost(d, want); } else gpuFailed.add(want);
        syncGpu();
      };
      const opts = { power: pr.gpuPower, lowLatency: pr.lowLatency };
      if (want === 'webgpu') void GpuDisplay.create(q<HTMLCanvasElement>(root, '.cv-scene-gpu:not(.cv-scene-gl):not(.cv-scene-native)'), opts).then(started);
      else if (want === 'native') void NativeDisplay.create(q<HTMLCanvasElement>(root, '.cv-scene-native')).then(started);
      else started(GlDisplay.create(q<HTMLCanvasElement>(root, '.cv-scene-gl'), opts));
    }
    const off = rendererFallback({ mode: ch.mode, chosenReason: ch.reason, displayReady: !!gpuDisplay, displayFailed: !!want && gpuFailed.has(want), failure: ch.mode === 'native' ? NativeDisplay.startError : null });
    const live = off ? null : gpuDisplay, api = ch.mode === 'webgl2' ? 'WebGL2' : ch.mode === 'native' ? 'Native GPU' : 'WebGPU';
    const name = ch.mode === 'native' && gpuDisplay instanceof NativeDisplay ? gpuDisplay.adapter : adapterName;
    const cpuWhy = off ?? ch.reason;
    if (live) live.hdrAllowed = pr.hdrDisplay;
    stage.setGpu(live, pr.gpuMemoryMB * 1024 * 1024, live ? (reason) => status.setGpu(reason ? 'GPU: CPU' : `GPU: ${api}`, reason ? `${api} is on, but ${reason}, so it draws on the CPU` : `${name}: ${ch.reason}`) : null);
    if (!live) status.setGpu('GPU: CPU', cpuWhy);
    else status.setGpu(`GPU: ${api}`, `${name}: ${ch.reason}`);
    perfHud.setApi(live ? api : 'CPU');
    dialogs.settings.setGpu(detectedName(gpuProbe), live ? api : 'CPU', live ? ch.reason : cpuWhy, live ? name : '', live && ch.adapter ? ch.adapter.maxTexture : 0);
  }
  perfHud.start();
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

  async function openFiles(files: File[], interactive = false): Promise<void> {
    await engine.task(async () => {
      for (const f of files) {
        try {
          if (isOraFile(f)) {   // OpenRaster (1.51.7)
            const { doc, notes } = await readOraFile(f);
            engine.addProject(doc, f.name.replace(/\.ora$/i, ''), null);
            if (notes.length) toast(notes.join(' '), 'info');
          } else if (isKraFile(f)) {   // .kra (DEV_PLAN 34.5 part a)
            const { doc, notes, activeId } = await readKra(f);
            engine.addProject(doc, f.name.replace(/\.(kra|krz)$/i, ''), activeId);
            if (notes.length) toast(notes.join(' '), 'info');
          } else if (isAfFile(f)) {   // .afphoto preview (DEV_PLAN 34.6)
            const { doc, notes, activeId } = await readAf(f);
            engine.addProject(doc, f.name.replace(/\.(af|afphoto|afdesign|afpub)$/i, ''), activeId);
            if (notes.length) toast(notes.join(' '), 'info');
          } else if (isPdnFile(f)) {   // Paint.NET (DEV_PLAN 34.5 part b)
            const { doc, notes, activeId } = await readPdn(f);
            engine.addProject(doc, f.name.replace(/\.pdn$/i, ''), activeId);
            if (notes.length) toast(notes.join(' '), 'info');
          } else if (isPsdFile(f)) {
            const giant = engine.tiledDocuments && await giantPsd(f);   // a side past 30,000 px, or more pixels than a canvas holds, with the tile engine on: read a band of rows at a time (PC-IO-0035)
            const cmykPsd = giant ? null : await api.decodeCmykPsd(f, f.name).catch(() => null);
            if (cmykPsd) { await openCmykPsd(f.name.replace(/\.(ps[db]|psdt)$/i, ''), cmykPsd); continue; }
            const labPsd = giant ? null : await api.decodeLab(f, f.name).catch(() => null);   // 1.58.1
            if (labPsd) { openLab(f.name.replace(/\.(ps[db]|psdt)$/i, ''), labPsd); continue; }
            const job = giant ? engine.startJob(`Open ${f.name}`, 1) : null;
            const { doc, notes, activeId, paths, report } = job ? await readGiantPsd(f, { step: (d, n) => engine.jobStep(job, d, n), stopped: () => job.cancelled }).finally(() => engine.endJob(job)) : await readPsdFile(f, files).catch(() => readPsdFlat(f, (b) => api.decode(b, b.name)));   // a damaged file opens flat
            // A PSD opened by hand shows its conversion report as a sheet with Cancel and Import; agents and batches get the toast below.
            const declined = (): void => { const st = giantTiles.store; if (st) for (const l of doc.layers) l.tiled?.release(st); openStopped = true; };
            if (interactive && (report.approximated.length || report.dropped.length) && !(await psdReportDialog.ask(f.name, report))) { declined(); continue; }
            // A profile other than sRGB follows the Color Settings policy like a PNG or JPEG: kept, converted to sRGB, dropped, or asked.
            let how: 'keep' | 'convert' | 'discard' = 'keep';
            if (doc.profile && !isSrgbName(doc.profile.name) && (doc.depth ?? 8) === 8) {
              const pref = loadPrefs().profileMismatch, asked = pref === 'ask' ? await colourDialogs.mismatch.ask(f.name, doc.profile.name) : pref;
              if (asked === 'cancel') { declined(); continue; }
              how = asked;
            }
            const opened = engine.addProject(doc, f.name.replace(/\.(ps[db]|psdt)$/i, ''), activeId);
            if (how === 'discard') engine.assignProfile(null);
            else if (how === 'convert' && doc.profile) {
              try { const c = loadPrefs().colour; engine.convertToProfile(null, await api.colourLut({ source: { icc: doc.profile.icc }, dest: null, intent: c.intent, bpc: c.bpc })); toast(`${f.name} was converted from its embedded profile, ${doc.profile.name}, to sRGB, the working space.`); } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
            }
            if (paths) engine.setPathsOf(opened, paths);
            // The conversion report is told, never asked: an agent or a batch opening a PSD must not wait on a sheet.
            if (interactive && (report.approximated.length || report.dropped.length)) { /* told in the sheet */ }
            else if (report.dropped.length) toast(reportText(report), 'info');
            else if (notes.length) toast(notes.join(' '), 'info');
          } else {
            const layered = /\.tiff?$/i.test(f.name) ? await readLayeredTiff(f) : null;   // a TIFF with PSD layers (34.2)
            if (layered) {
              const opened = engine.addProject(layered.doc, f.name.replace(/\.tiff?$/i, ''), layered.activeId);
              if (layered.paths) engine.setPathsOf(opened, layered.paths);
              if (layered.notes.length) toast(layered.notes.join(' '), 'info');
            } else await openOpened(await api.importProject([f]), null);
          }
        } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
      }
    });
  }

  async function openFolder(files: File[], paths: string[]): Promise<void> {
    // A folder that is not an unpacked project (no manifest.json at its top or one level in) opens its pictures and
    // project files instead (1.87.0, D15): a folder of photos, or the folder projects are saved in.
    const isProject = paths.some((p) => /^([^/\\]+[/\\])?manifest\.json$/i.test(p.replace(/^[/\\]+/, '')));
    if (!isProject) {
      const usable = files.filter((f) => isProjectFile(f) || isImageFile(f));
      if (!usable.length) { toast('That folder holds no projects or pictures formvis can open.', 'info'); return; }
      await importFiles(usable, undefined, 'documents');
      return;
    }
    await engine.task(async () => {
      try { await openOpened(await api.importProject(files, paths), null); } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** The document as a TIFF carrying its PSD layers (DEV_PLAN 34.2). */
  async function exportLayeredTiff(keep?: boolean): Promise<void> {
    engine.settle();
    const p = engine.current;
    if (!p) return;
    const choice = keep === undefined ? (loadPrefs().askLayeredTiff ? await tiffOptions.choose(p.doc.layers.filter((l) => !l.isGroup).length) : 'layers') : keep ? 'layers' : 'flat';
    if (!choice) return;
    if (choice === 'flat') {
      if (caps) await exportImage('tiff', 0.9);
      else toast('A flat TIFF is written by the formvis engine, which is not running here.', 'error');
      return;
    }
    await engine.task(async () => {
      try {
        const flat = engine.flattened();
        if (!flat) return;
        const { blob, notes } = await writeLayeredTiff(p.doc, flat, engine.pathsOf(p));
        await deliver(blob, `${p.name}.tif`);
        if (notes.length) toast(notes.join(' '), 'info');
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** Camera RAW files placed as layers (DEV_PLAN 28.2), with the camera profile each was developed with ('auto' is what the
   *  engine chose at import), so Develop's Profile list can develop the file again. */
  const rawLayers = new Map<string, { file: File; profile: string; wb?: RawChoice['wb'] }>();
  /** Camera Raw on open (DEV_PLAN 36.21): a camera RAW opens into this panel first (white balance at the RAW stage, 8 or 16 bits). */
  const cameraRaw = new CameraRawDialog();

  /** The open document and its layer count, taken before a picture is placed. */
  const layersOf = (): { doc: unknown; n: number } | null => (engine.current ? { doc: engine.current, n: engine.current.doc.layers.length } : null);
  /** A single picture just placed into the same document starts in Free Transform (Preferences > File Handling). */
  function enterPlacedTransform(was: { doc: unknown; n: number } | null): void {
    const p = engine.current;
    if (!was || !p || p !== was.doc || p.doc.layers.length !== was.n + 1 || !loadPrefs().placeTransform || !p.activeLayer?.raster) return;
    engine.transformCommand();
  }

  /** `how` 'layers' (the default) adds pictures to the open document; 'documents' (File > Open, Ctrl-drop) opens each as its own document. Preset files go to their libraries either way. */
  async function importFiles(files: File[], at?: Pt, how: 'layers' | 'documents' = 'layers'): Promise<void> {
    files = await Promise.all(files.map(nameRawByContent));
    const layeredTiffs = new Set<File>();
    if (how === 'documents') for (const f of files) {
      const block = /\.tiff?$/i.test(f.name) ? tiffLayerBlock(new Uint8Array(await f.arrayBuffer())) : null;
      const text = block ? new TextDecoder('latin1').decode(block) : '';
      if (text.includes('8BIMLayr') || text.includes('8B64Layr')) layeredTiffs.add(f);
    }
    const projects = files.filter((f) => isProjectFile(f) || layeredTiffs.has(f));
    const images = files.filter((f) => !isProjectFile(f) && !layeredTiffs.has(f) && isImageFile(f));
    const presets = files.filter((f) => !isProjectFile(f) && !isImageFile(f) && presetKindOf(f.name));
    const skipped = files.length - projects.length - images.length - presets.length;
    if (projects.length) await openFiles(projects, true);
    if (presets.length) await dialogs.presetManager.loadPresetFiles(presets);
    const fresh = how === 'documents', noDoc = (): boolean => fresh || !engine.current;
    if (fresh && images.length > 1) { for (const f of images) await importFiles([f], at, how); }
    else if (images.length) {
      await engine.task(async () => {
        const decoded: ImportedImage[] = [];
        let largeAsked = false;
        let pagesAsked = false;
        let rawPick: RawChoice | null = null;
        let tgaAlpha: Uint8Array | null = null;
        openStopped = false;
        for (const f of images) {
          if (openStopped) break;
          if (/\.png$/i.test(f.name)) { const n = await apngFrames(f).catch(() => 0); if (n > 1) toast(`${f.name} is an animated PNG of ${n} frames; only the first frame was opened.`, 'info'); }
          // A single camera RAW opens into Camera Raw first (DEV_PLAN 36.21): Cancel does not open it; 16 Bits/Channel opens a 16-bit document.
          if (RAW_FILE.test(f.name) && images.length === 1) {
            rawPick = loadPrefs().rawAsk ? await cameraRaw.ask(f) : { wb: { wb: loadPrefs().rawWb, temperature: 0, tint: 0, ...(loadPrefs().rawBits === 16 && loadPrefs().rawWide ? { space: 'prophoto' as const } : {}) }, bits: loadPrefs().rawBits };
            if (!rawPick) continue;
            if (rawPick.bits === 16) {
              try { const d = await api.decodeRaw16(f, f.name, rawPick.wb); engine.openDeep(stripExt(f.name), sharpenRawDeep(deepFromU16(d.data, d.width, d.height), loadPrefs().rawSharpen, loadPrefs().rawSharpenAmount)); if (d.profile === 'prophoto') engine.assignProfile({ name: 'ProPhoto RGB', icc: toBase64(await api.colourProfileBytes('builtin:prophoto')) }); } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
              rawPick = null;
              continue;
            }
            try { const img = sharpenRaw8(await decodeImage(f, f.name, false, rawPick.wb), loadPrefs().rawSharpen, loadPrefs().rawSharpenAmount), ppi = loadPrefs().rawPpi; decoded.push(ppi ? { ...img, resolution: ppi } : img); } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
            continue;
          }
          // A Lab TIFF opened as a new document is a Lab document (1.58.1), tried before the page count (which refuses it).
          if (/\.tiff?$/i.test(f.name) && noDoc() && decoded.length === 0) { const lab = await api.decodeLab(f, f.name).catch(() => null); if (lab) { openLab(f.name.replace(/\.[^.]+$/, ''), lab); continue; } }
          // An animated GIF or WebP opens as a layer per frame with a frame animation; one frame opens as a picture.
          if (/\.(gif|webp)$/i.test(f.name) && noDoc() && decoded.length === 0) {
            try {
              const anim = await decodeFrames(f, f.name);
              if (anim) {
                engine.openFrameAnimation(stripExt(f.name), anim.width, anim.height, anim.plays, anim.frames);
                toast(`${f.name} opened as ${anim.frames.length} frames. File > Export GIF saves the animation.`, 'info');
                continue;
              }
            } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); continue; }
          } else if (/\.(gif|webp)$/i.test(f.name)) {
            const anim = await decodeFrames(f, f.name).catch(() => null);
            if (anim) toast(`${f.name} has ${anim.frames.length} frames; only the first was placed as a layer. Open it on its own to get every frame.`, 'info');
          }
          // A TIFF with several pages asks how to open them (1.53.4).
          if (/\.(tiff?|ico|cur)$/i.test(f.name) && !pagesAsked) { try { const pages = await api.imagePages(f, f.name); if (pages.length > 1) { pagesAsked = true; tiffPages.show(f, pages); continue; } } catch { /* decoded as before */ } }
          if (/\.(jpe?g|tiff?)$/i.test(f.name) && noDoc() && decoded.length === 0) {
            try { const c = await api.decodeCmyk(f, f.name); if (c) { await openCmyk(f.name.replace(/\.[^.]+$/, ''), c); continue; } } catch (err) { if (serviceDown()) { /* the engine service is not running: opened as RGB below */ } else { toast(message(err), 'error'); continue; } }
          }
          // A Targa with real alpha asks whether it is layer transparency or an Alpha 1 channel beside an opaque picture.
          if (/\.(tga|icb|vda|vst)$/i.test(f.name) && noDoc() && decoded.length === 0) {
            try {
              const split = await decodeTgaSplit(f, f.name);
              if (split && await confirmAction('Targa alpha', `${f.name} has an alpha channel. Keep it as an Alpha 1 channel with an opaque picture, or as the layer's transparency?`, 'Alpha channel', false, 'Transparency')) { decoded.push(split.image); tgaAlpha = split.alpha; continue; }
            } catch { /* opened with its transparency below */ }
          }
          // An 8-bit grayscale picture opens as a Grayscale document under the Gray policy (Color Settings).
          if (/\.(png|jpe?g|tiff?|webp)$/i.test(f.name) && noDoc() && decoded.length === 0) {
            try { const gray = await openGray(f); if (gray) { decoded.push(gray); continue; } } catch (err) { if (!serviceDown()) { toast(`${f.name}: ${message(err)}`, 'error'); continue; } }
          }
          // An OpenEXR or Radiance HDR placed into an open document is a layer at the document's depth: the engine decodes it
          // as floats, the layer keeps them in a 16 or 32 bit document and is clipped to 8 bits otherwise.
          if (/\.(hdr|exr)$/i.test(f.name) && !fresh && (engine.current || decoded.length > 0)) {
            try { decoded.push(await decodeHdr(f, f.name)); } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
            continue;
          }
          // A 16 or 32 bit PNG, TIFF, HEIC, DPX, Netpbm, PFM or FITS placed into a 16 or 32 bit document keeps its depth as a layer.
          if (!noDoc() && (engine.current?.doc.depth ?? 8) > 8) {
            const deep = await decodeDeepLayer(f, f.name).catch(() => null);
            if (deep) { decoded.push(deep); continue; }
          }
          // A 16-bit PNG or TIFF opens as a 16-bit document (1.53.6, H1).
          if (/\.(png|tiff?|hdr|exr|dpx|cin|pbm|pgm|ppm|pnm|pam|pfm|heic|heif|hif|fits|fit|fts)$/i.test(f.name) && noDoc() && decoded.length === 0) {
            const head = new Uint8Array(await f.slice(0, 26).arrayBuffer()), png16 = head[0] === 0x89 && head[24] === 16;
            if (png16 || /\.(tiff?|hdr|exr|dpx|cin|pbm|pgm|ppm|pnm|pam|pfm|fits|fit|fts)$/i.test(f.name) || (/\.(heic|heif|hif)$/i.test(f.name) && (await heifBits(f)) > 8)) {
              try {
                // A multi-part OpenEXR opens one layer per part, named after it (DEV_PLAN 36.15).
                if (/\.exr$/i.test(f.name)) {
                  const lay = await api.exrLayout(f, f.name).catch(() => null);
                  if (lay && lay.parts.reduce((n, p) => n + p.groups.length, 0) + lay.crypto.reduce((n, c) => n + c.objects.length, 0) > 1) {
                    const picks = await exrChooser.ask(f.name, lay);
                    if (!picks) continue;
                    const mp = await api.exrSelect(f, f.name, picks);
                    if (engine.openDeepLayers(f.name.replace(/\.[^.]+$/, ''), mp.width, mp.height, mp.parts.map((q) => ({ name: q.name, x: q.x, y: q.y, deep: { mode: 'rgb', n: 3, width: q.width, height: q.height, data: q.data } })))) continue;
                  }
                  const mp = lay ? null : await api.exrParts(f, f.name).catch(() => null);
                  if (mp && engine.openDeepLayers(f.name.replace(/\.[^.]+$/, ''), mp.width, mp.height, mp.parts.map((q) => ({ name: q.name, x: q.x, y: q.y, deep: { mode: 'rgb', n: 3, width: q.width, height: q.height, data: q.data } })))) continue;
                }
                const d = await api.decodeDeep(f, f.name), name = f.name.replace(/\.[^.]+$/, ''), ppi = (await headerResolution(f)) ?? undefined;
                if (d.depth === 32) {
                  let px = d.data as Float32Array;
                  // Color Settings: an OpenEXR read as ACEScg is moved to the working linear space, its colours kept.
                  if (/\.exr$/i.test(f.name) && loadPrefs().colour.exrAcescg) {
                    const m = await api.linearMatrix({ source: { id: 'builtin:acescg' }, dest: null });
                    px = new Float32Array(px);
                    for (let i = 0; i < px.length; i += 4) { const r = px[i], g = px[i + 1], b = px[i + 2]; for (let c = 0; c < 3; c++) px[i + c] = m[c][0] * r + m[c][1] * g + m[c][2] * b; }
                  }
                  engine.openDeep(name, { mode: 'rgb', n: 3, width: d.width, height: d.height, data: px }, 32, ppi);
                  continue;
                }
                if (d.depth === 16) { engine.openDeep(name, deepFromU16(d.data as Uint16Array, d.width, d.height), 16, ppi); continue; }
              } catch { /* opened at 8 bits as before */ }
            }
          }
          // An embedded profile other than sRGB (1.53.5): converted (the default, as the browser decodes), kept, or asked.
          let profile: { name: string; icc: string } | undefined;
          if (/\.(png|jpe?g|webp)$/i.test(f.name)) {
            const icc = await embeddedProfile(f).catch(() => null), pname = icc ? profileName(icc) : '';
            // A JPEG with no profile but the EXIF ColorSpace tag set to sRGB says what it is: opened as sRGB without asking.
            if (!icc && noDoc() && decoded.length === 0 && (await exifColourSpace(f).catch(() => null)) !== 1) {
              const assumed = await missingProfile(f.name);
              if (openStopped) continue;
              if (assumed) { try { const raw = await decodeImage(f, f.name, true); raw.profile = assumed; decoded.push(raw); continue; } catch { /* decoded as before */ } }
            }
            if (icc && !isSrgbName(pname)) {
              const pref = loadPrefs().profileMismatch, how = pref === 'ask' ? await colourDialogs.mismatch.ask(f.name, pname) : pref;
              if (how === 'cancel') { openStopped = true; continue; }
              // Kept only when the image opens as its own document: placed into an open document, it is converted.
              if ((how === 'keep' || how === 'discard') && noDoc() && decoded.length === 0) {
                try { const raw = await decodeImage(f, f.name, true); if (how === 'keep') raw.profile = { name: pname, icc: toBase64(icc) }; decoded.push(raw); continue; } catch { /* decoded as before */ }
              } else toast(`${f.name} was converted from its embedded profile, ${pname}, to sRGB, the working space.`);
            }
          }
          // A TIFF with an embedded profile other than sRGB asks like a PNG or JPEG does: the decoded picture carries the
          // profile and the browser converts it to sRGB, unless the profile is kept or discarded and the numbers stay as stored.
          if (/\.tiff?$/i.test(f.name)) {
            const icc = await embeddedProfile(f).catch(() => null), pname = icc ? profileName(icc) : '';
            if (icc && !isSrgbName(pname)) {
              const pref = loadPrefs().profileMismatch, how = pref === 'ask' ? await colourDialogs.mismatch.ask(f.name, pname) : pref;
              if (how === 'cancel') { openStopped = true; continue; }
              try {
                const keeps = how === 'keep' && noDoc() && decoded.length === 0, raw = await decodeImage(f, f.name, keeps || how === 'discard');
                if (keeps) raw.profile = { name: pname, icc: toBase64(icc) };
                else if (how !== 'discard') toast(`${f.name} was converted from its embedded profile, ${pname}, to sRGB, the working space.`);
                decoded.push(raw);
                continue;
              } catch { /* decoded as before */ }
            }
          }
          if (/\.svgz?$/i.test(f.name)) {
            const text = await svgSource(f).catch(() => null), whole = new Blob([text ?? '']);
            const asked = await svgImport.show(f.name, text === null ? null : await svgSize(whole), text === null ? null : await svgInches(whole));
            if (!asked) continue;
            if (asked.how === 'shapes') { await openSvgLayers(text); continue; }
            try {
              const img = await rasteriseSvg(f, f.name, asked.width, asked.height);
              if (asked.how === 'smart' && text !== null) img.svg = { name: f.name.replace(/\.svgz$/i, '.svg'), mime: 'image/svg+xml', data: new TextEncoder().encode(text) };
              decoded.push(img);
            } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
            continue;
          }
          try { decoded.push(await decodeImage(f, f.name)); } catch (err) {
            if (err instanceof LargePictureError) { if (!largeAsked) { largeAsked = true; largePicture.show(err); } else toast(`${f.name}: open large pictures one at a time.`, 'info'); }   // 1.52.7
            else toast(`${f.name}: ${message(err)}`, 'error');
          }
        }
        engine.insertImages(decoded, fresh ? undefined : at, fresh);
        if (tgaAlpha && decoded.length === 1) engine.addAlphaFromGrey(tgaAlpha);
        for (const img of decoded) if (img.warning) toast(img.warning, 'info');
        for (const img of decoded) {
          const file = RAW_FILE.test(img.name) ? images.find((f) => f.name === img.name) : undefined, layer = file ? [...(engine.current?.doc.layers ?? [])].reverse().find((l) => l.name === stripExt(img.name)) : undefined;
          // A white balance chosen in Camera Raw is kept with the layer (for this session); the engine applies no camera profile with it.
          const custom = !!rawPick && (rawPick.wb.wb !== 'as_shot' || !!rawPick.wb.temperature || !!rawPick.wb.tint || !!rawPick.wb.develop);
          if (file && layer) rawLayers.set(layer.id, { file, profile: custom ? 'none' : 'auto', ...(rawPick ? { wb: rawPick.wb } : {}) });
        }
        // A single camera RAW opens into Develop first, after the Camera Raw Defaults for Auto Tone and Smart Object.
        if (decoded.length === 1 && RAW_FILE.test(decoded[0].name)) {
          const d = loadPrefs();
          if (d.rawAutoTone) engine.autoAdjust('tone');
          if (d.rawSmart && !engine.current?.activeLayer?.smart) engine.convertToSmartObject();
          commands.run('filter-develop');
        }
      });
    }
    if (skipped) toast(skipped === 1 ? 'One file is not an image or a project and was skipped.' : `${skipped} files are not images or projects and were skipped.`);
  }

  /** Saves still writing: editing goes on while one runs, and closing a tab or quitting waits for it. */
  const saving = new Map<Promise<boolean>, string>();
  const savesDone = async (id?: string): Promise<void> => {
    for (;;) {
      const runs = [...saving].filter(([, doc]) => !id || doc === id).map(([run]) => run);
      if (!runs.length) return;
      await Promise.allSettled(runs);
    }
  };
  /** Edits wait for a save unless it runs in the background; a giant tiled layer is first copied band by band (edits held for the copy only) and the copy is written. */
  let historyOnce = false;   // File > Save As with History: the next save keeps the steps whatever the preference says
  const historyCap = (): number => (historyOnce ? Math.max(loadPrefs().historyCapMb, 64) : loadPrefs().historyCapMb) * 1048576;
  const saveHolds = (p: NonNullable<typeof engine.current>): boolean => !loadPrefs().saveInBackground || historyCap() > 0 || (!giantTiles.store && p.doc.layers.some((l) => l.tiled));
  const saveTask = <T>(p: NonNullable<typeof engine.current>, fn: () => Promise<T>): Promise<T> => (saveHolds(p) ? engine.lockedTask('Save', fn) : engine.task(fn));
  function save(saveAs: boolean): Promise<boolean> {
    const running = [...saving].find(([, doc]) => doc === (engine.current?.id ?? ''));
    if (running) { toast('This document is still being saved.', 'info'); return running[0]; }
    const run = saveWork(saveAs);
    saving.set(run, engine.current?.id ?? '');
    void run.then(() => saving.delete(run), () => saving.delete(run));
    return run;
  }

  async function saveWork(saveAs: boolean): Promise<boolean> {
    const ok = await saveCore(saveAs);
    if (ok) fireEvent('save');
    if (ok && hostLink.embedded) await postHostSave();
    if (ok && !saveAs && engine.current?.doc.assetsOnSave) await generateAssets(true).catch((err) => { toast(`The project was saved, but its image assets were not written. ${message(err)}`, 'error'); });
    return ok;
  }

  /** Image Assets (36.14): the zip of every layer named like hero.png; `quiet` (on save) says nothing when none are named. */
  async function generateAssets(quiet: boolean, toFolder = false): Promise<void> {
    const p = engine.current;
    if (!p) return;
    const into = toFolder ? await pickOutFolder() : null;
    if (toFolder && !into) { toast('Choosing a folder needs a browser that can write to one; Generate Image Assets downloads a zip instead.', 'info'); }
    const files = await assetFiles(engine, !!caps);
    if (!files.length) { if (!quiet) toast('No layer names hold an asset name such as hero.png.', 'info'); return; }
    if (into) { await writeFolder(into, files); toast(`Wrote ${files.length} image asset${files.length === 1 ? '' : 's'} into ${into.name}.`, 'info'); return; }
    if (caps?.desktop && !toFolder) {
      const beside = `${stripExt(p.name).replace(/[/\\:*?"<>|]/g, '-').replace(/^[. ]+/, '') || 'Untitled'} assets`;
      for (const f of files) { if (p.filePath) await api.exportBeside(f.blob, f.name, p.filePath, beside); else await api.exportFile(f.blob, f.name, beside); }
      toast(`Wrote ${files.length} image asset${files.length === 1 ? '' : 's'} into the folder "${beside}"${p.filePath ? ' beside the document' : ' in the exports folder'}.`, 'info');
      return;
    }
    const folder = `${stripExt(p.name)}-assets`;
    if (!await deliverFile(await zipFiles(files.map((f) => ({ name: `${folder}/${f.name}`, blob: f.blob }))), `${folder}.zip`)) return;
    toast(`Generated ${files.length} image asset${files.length === 1 ? '' : 's'}.`, 'info');
  }

  /** The document written layer by layer as a stoppable job: the status line counts layers, Escape or Cancel Background Job stops it before anything is sent. */
  async function serializeJob(p: NonNullable<typeof engine.current>): ReturnType<typeof serialize> {
    const job = engine.startJob('Save', p.doc.layers.length), store = giantTiles.store;
    let copies: Array<{ release(s: NonNullable<typeof store>): void }> = [];
    try {
      const cap = historyCap();
      let doc = p.doc;
      const giants = saveHolds(p) || !store ? [] : p.doc.layers.filter((l) => l.tiled && !l.isGroup);
      if (giants.length) {
        const made = new Map<string, NonNullable<(typeof giants)[number]['tiled']>>();
        copies = [...made.values()];
        await engine.lockedTask('Save', async () => {
          for (const l of giants) { if (job.cancelled) throw new Error('The save was stopped; nothing was written.'); made.set(l.id, await (l.tiled as NonNullable<typeof l.tiled>).snapshot(store as NonNullable<typeof store>, giantTiles.share)); copies = [...made.values()]; }
          doc = p.doc;
        });
        doc = { ...doc, layers: doc.layers.map((l) => (made.has(l.id) ? { ...l, tiled: made.get(l.id) } : l)) };
      }
      return await serialize(doc, p.activeId, engine.pathsOf(p), engine.timelineFor(p), (d, n) => { if (job.cancelled) throw new Error('The save was stopped; nothing was written.'); engine.jobStep(job, d, n); }, { selection: p.selection, history: cap > 0 ? { source: p, cap, steps: 100 } : null });
    } finally { if (store) for (const c of copies) c.release(store); engine.endJob(job); historyOnce = false; }
  }

  async function saveCore(saveAs: boolean): Promise<boolean> {
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
    // The desktop app saves to files (1.87.0, CLOSE_GAPS P01): Save writes back to the document's file, Save As and the
    // first Save choose one in the save panel (the library folder first). A document opened from the library saves there.
    if (hasPanels() && (saveAs || !!p.filePath || !p.libraryName)) {
      const done = await saveToDisk(p, saveAs);
      if (done !== null) return done;
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
    return saveTask(p, async () => {
      const revision = p.history.revision;
      try {
        const thumb = thumbnailOf(p);
        const { manifest, files } = await serializeJob(p);
        // Based on the version it was opened or last saved at (1.58.8), when saving over that same library item.
        const res = await api.save(target, manifest, files, target === p.libraryName ? p.libraryVersion ?? '' : '', await thumb);
        if (p.history.revision === revision) engine.markSaved(p, res.name, res.name);
        else { p.name = res.name; p.libraryName = res.name; engine.emit('projects', null); }
        p.libraryVersion = res.version ?? null;
        if (res.conflict) toast(`${res.kept ?? target} changed elsewhere since you opened it (another device or window), so it was kept as it is; yours was saved beside it as ${res.name}.`, 'info');
        else toast(`Saved ${res.name}.`);
        noteRecent(res.name);
        return true;
      } catch (err) {
        toast(message(err), 'error');
        return false;
      }
    });
  }

  /** The desktop app's Save and Save As (1.87.0): true when saved, false when cancelled or failed, null when the save
   *  panel is not available (the library prompt is used instead). */
  async function saveToDisk(p: NonNullable<typeof engine.current>, saveAs: boolean): Promise<boolean | null> {
    let path = saveAs ? null : p.filePath;
    if (!path) {
      const folder = p.filePath ? folderOf(p.filePath) : (await api.libraryFolder())?.folder ?? '';
      const file = `${stripExt(p.name).replace(/[/\\:*?"<>|]/g, '-') || 'Untitled'}.fvd`;
      try { path = await chooseSavePath(saveAs ? 'Save As' : 'Save', folder ? `${folder}/${file}` : file, [PROJECT_FILTER]); } catch { return null; }
      if (!path) return false;
      if (!/\.fvd$/i.test(path)) path = `${path}.fvd`;
    }
    const target = path;
    return saveTask(p, async () => {
      const revision = p.history.revision;
      try {
        const thumb = thumbnailOf(p);
        const { manifest, files } = await serializeJob(p);
        const res = await api.saveTo(target, manifest, files, await thumb);
        p.filePath = res.path;
        p.libraryVersion = null;
        if (p.history.revision === revision) engine.markSaved(p, res.name, null);
        else { p.name = res.name; p.libraryName = null; engine.emit('projects', null); }
        toast(`Saved ${baseName(res.path)} in ${folderOf(res.path)}.`);
        noteRecent(res.path);
        return true;
      } catch (err) {
        toast(message(err), 'error');
        return false;
      }
    });
  }

  /** File > Save a Copy (Alt+Mod+S; 1.65.8): the document saved to the library as `name`, whole or
   *  without `layers` flattened, while the one in its tab keeps its name, its library file and its unsaved state. */
  async function saveCopy(name: string, layers: boolean): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    const doc = layers ? p.doc : engine.tiledPastCanvas(p) ? await engine.mergedDocBanded() : engine.mergedDoc();
    if (!doc) return;
    // The desktop app writes the copy where the person chooses in the save panel; the document keeps its own file.
    if (hasPanels()) {
      const folder = p.filePath ? folderOf(p.filePath) : (await api.libraryFolder().catch(() => null))?.folder ?? '';
      const file = `${name.replace(/[/\\:*?"<>|]/g, '-') || 'Untitled'}.fvd`;
      let path: string | null | undefined;
      try { path = await chooseSavePath('Save a Copy', folder ? `${folder}/${file}` : file, [PROJECT_FILTER]); } catch { path = undefined; }
      if (path === null) return;
      if (path) {
        const target = /\.fvd$/i.test(path) ? path : `${path}.fvd`;
        await engine.task(async () => {
          try {
            const { manifest, files } = await serialize(doc, layers ? p.activeId : doc.layers[0]?.id ?? null, engine.pathsOf(p), layers ? engine.timelineFor(p) : null);
            const res = await api.saveTo(target, manifest, files, await thumbnailOf(p));
            toast(`Saved a copy as ${baseName(res.path)} in ${folderOf(res.path)}.`);
            noteRecent(res.path);
          } catch (err) { toast(message(err), 'error'); }
        });
        return;
      }
    }
    const taken = (await api.library().catch(() => [])).some((i) => i.name === name);
    if (taken && !(await confirmAction('Replace project?', `${name} already exists in the library.`, 'Replace', true))) return;
    await engine.task(async () => {
      try {
        const { manifest, files } = await serialize(doc, layers ? p.activeId : doc.layers[0]?.id ?? null, engine.pathsOf(p), layers ? engine.timelineFor(p) : null);
        const res = await api.save(name, manifest, files, name === p.libraryName ? p.libraryVersion ?? '' : '', await thumbnailOf(p));
        if (name === p.libraryName && !res.conflict) p.libraryVersion = res.version ?? null;
        if (res.conflict) toast(`${res.kept ?? name} changed elsewhere since you opened it (another device or window), so it was kept as it is; the copy was saved beside it as ${res.name}.`, 'info');
        else toast(`Saved a copy as ${res.name}.`);
        noteRecent(res.name);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** File > Revert (F12 in the desktop app; 1.65.8): the library's copy of the document read back into
   *  its tab as one step that Undo takes back (engine.revertTo). */
  async function revert(): Promise<void> {
    const p = engine.current, name = p?.libraryName, file = p?.filePath;
    if (!p || !(name || file) || !p.modified) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const o = file ? await api.openPath(file) : await api.openLibrary(name ?? ''), { doc, activeId, paths, timeline } = await readOpened(o);
        if (!engine.projects.includes(p)) return;
        if (engine.current !== p) engine.switchTo(p.id);
        if (engine.revertTo(doc, activeId, paths, timeline)) p.libraryVersion = file ? null : o.version ?? null;
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function packageDocument(given?: PackageChoice): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    const choice = given ?? await packageDialog.ask();
    if (!choice || engine.current !== p) return;
    let format = choice.format;
    if (format !== 'fvd' && (p.doc.mode === 'cmyk' || p.doc.mode === 'lab')) { format = 'fvd'; toast('A CMYK or Lab document is packaged as a formvis project; use Export PSD for its PSD.', 'info'); }
    engine.settle();
    await engine.task(async () => {
      try {
        const linked = choice.links ? await linkedFiles(engine) : { files: [], missing: [], copies: new Map<string, string>() };
        const notes: string[] = [];
        let main: { name: string; blob: Blob };
        if (format === 'fvd') {
          const relinked = { ...p.doc, layers: p.doc.layers.map((l) => { const to = l.smart?.link ? linked.copies.get(l.smart.link.id) : undefined; return to && l.smart?.link ? { ...l, smart: { ...l.smart, link: { ...l.smart.link, path: to } } } : l; }) };
          const { manifest, files } = await serialize(relinked, p.activeId, engine.pathsOf(p), engine.timelineFor(p));
          main = { name: `${p.name}.fvd`, blob: await api.package(manifest, files) };
        } else {
          const flat = engine.flattened();
          if (!flat) return;
          const big = p.doc.width > 30000 || p.doc.height > 30000, psb = format === 'psb' || big;
          if (big && format === 'psd') notes.push('The document is too large for a PSD, so it is a PSB.');
          const out = await writePsdFile(p.doc, flat, psb, engine.pathsOf(p), loadExportPrefs().maximizePsd);
          main = { name: `${p.name}.${psb ? 'psb' : 'psd'}`, blob: new Blob([out.bytes], { type: 'image/vnd.adobe.photoshop' }) };
          notes.push(...out.notes);
        }
        await deliver(await zipFiles([main, ...linked.files]), `${p.name} Package.zip`);
        const n = linked.files.length;
        toast(`Packaged ${n} linked file${n === 1 ? '' : 's'}.${linked.missing.length ? ` Not reachable and left out: ${linked.missing.join(', ')}.` : ''}${notes.length ? ` ${notes.join(' ')}` : ''}`, linked.missing.length || notes.length ? 'info' : undefined);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function downloadProject(): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathsOf(p), engine.timelineFor(p));
        await deliver(await api.package(manifest, files, '', await thumbnailOf(p)), `${p.name}.fvd`);
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
   *  flattened on white; AVIF, TIFF and PDF by the engine), named with the usual suffix for scaled exports. */
  async function exportAs(all: ExportSettings): Promise<void> {
    // Several sizes (36.29): one file for each, named with the entry's suffix.
    for (const one of sizedSettings(all)) await exportAsOne(one.s, one.suffix);
  }
  /** File > Export > Quick Export: the picture in the format, quality and folder of Export Preferences, with no dialog. */
  async function quickExport(): Promise<void> {
    const pr = loadExportPrefs();
    await exportAsOne({ format: pr.format, quality: pr.quality, scale: 100, ...(pr.promptMeta ? { promptMeta: true } : {}) }, undefined, pr.folder);
  }
  /** Layer > Quick Export as PNG: each selected layer (the active one when none is) drawn alone, as a PNG or the format
   *  Export Preferences names; several layers go as one zip in the browser. */
  async function quickExportLayers(): Promise<void> {
    const p = engine.current, pr = loadExportPrefs();
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const { files, skipped } = await selectedLayerFiles(engine, 'png', pr.quality, !!caps);
        if (!files.length) { toast(skipped ? 'The selected layers have nothing visible to export.' : 'Select a pixel layer to export.', 'info'); return; }
        const out = pr.promptMeta ? await Promise.all(files.map(async (f) => ({ ...f, blob: await withGenerationText(f.blob, p.doc.layers.filter((l) => l.id === f.id)) }))) : files;
        if (out.length === 1) { await deliver(out[0].blob, out[0].name, pr.folder); return; }
        if (caps?.desktop && pr.folder) { for (const f of out) await deliver(f.blob, f.name, pr.folder); return; }
        await deliver(await zipFiles(out), `${stripExt(p.name)} layers.zip`, pr.folder);
      } catch (err) { toast(message(err), 'error'); }
    });
  }
  /** The CMYK profile an Export As names (a listed profile whose colour space is CMYK), or null. */
  async function cmykTarget(s: ExportSettings): Promise<{ id: string; name: string } | null> {
    if (!s.profile?.startsWith('id:')) return null;
    const id = s.profile.slice(3);
    try { const hit = (await api.colourProfiles()).profiles.find((x) => x.id === id); return hit?.space === 'CMYK' ? { id, name: hit.name } : null; } catch { return null; }
  }
  /** `io.layerId` exports that layer alone instead of the composite; `io.sink` takes the finished file (and the picture it
   *  was encoded from) instead of delivering it; `io.quiet` skips the busy state and the notices, for the live preview. */
  interface ExportIo { layerId?: string; sink?: (blob: Blob, name: string, view?: ReturnType<typeof createSurface>) => void; quiet?: boolean }
  async function exportAsOne(s: ExportSettings, suffix?: string, folder = '', io: ExportIo = {}): Promise<void> {
    const p = engine.current;
    if (!p) return;
    if (!io.quiet) engine.settle();
    const say = (text: string): void => { if (!io.quiet) toast(text, 'info'); };
    const give = async (blob: Blob, name: string, view?: ReturnType<typeof createSurface>): Promise<void> => { if (io.sink) io.sink(blob, name, view); else await deliver(blob, name, folder); };
    await (io.quiet ? (fn: () => Promise<void>) => fn() : (fn: () => Promise<void>) => engine.task(fn))(async () => {
      try {
        if (s.format === 'dpx') {
          const dpx = io.layerId ? null : await dpxBlob(engine, s);
          if (dpx) { if (s.scale !== 100 || s.size === 'fit' || s.size === 'frame' || s.canvas) say('DPX is written at the document\'s own size.'); await give(dpx, exportName(p.name, s, suffix)); }
          return;
        }
        if (s.format === 'pnm') {
          const deep = io.layerId ? null : await pnmDeepBlob(engine, s);
          if (deep) { if (s.scale !== 100 || s.size === 'fit' || s.size === 'frame' || s.canvas) say('A 16-bit PNM file is written at the document\'s own size.'); await give(deep, exportName(p.name, s, suffix)); return; }
        } else if ((p.doc.depth ?? 8) > 8 && (s.format === 'qoi' || s.format === 'tga' || s.format === 'ico')) say(`${s.format.toUpperCase()} holds 8 bits a channel, so the ${p.doc.depth}-bit picture is written at 8 bits.`);
        const alone = io.layerId ? engine.renderLayerAlone(io.layerId) : null;
        const base = alone ? await toBlob(alone, 'image/png') : await engine.exportBlob('image/png');
        if (!base) return;
        // By Scale, Fit Within or a Frame (1.51.8): a frame's margins are transparent, or white in JPEG.
        const bmp = await createImageBitmap(base), L = exportLayout(bmp.width, bmp.height, s), z = { w: L.w, h: L.h }, c = createSurface(z.w, z.h), x = ctxOf(c);
        if (s.format === 'jpg' || s.matte || (s.canvas && s.canvasFill)) { x.fillStyle = (s.matte ?? (s.canvas ? s.canvasFill : undefined)) === 'black' ? '#000000' : '#ffffff'; x.fillRect(0, 0, z.w, z.h); }
        x.imageSmoothingQuality = 'high';
        x.drawImage(bmp, L.dx, L.dy, L.dw, L.dh);
        bmp.close();
        const inks = await cmykTarget(s);
        if (inks && (s.format === 'jpg' || s.format === 'tiff')) {
          // CMYK JPEG or TIFF: the pixels go through the chosen press profile (LittleCMS in the engine) and are written as ink with that profile embedded.
          const px = x.getImageData(0, 0, z.w, z.h), prof = await api.colourProfileBytes(inks.id), src = p.doc.mode !== 'cmyk' && p.doc.profile ? p.doc.profile.icc : '';
          const ink = await api.convertPixels(new Uint8Array(px.data.buffer, px.data.byteOffset, px.data.byteLength), z.w, z.h, 'cmyk', toBase64(prof), src, s.intent ?? 'relative', s.bpc !== false);
          say(`Written as CMYK in ${inks.name}${s.embed === false ? '' : ' with the profile embedded'}. ${s.format === 'jpg' ? 'JPEG' : 'TIFF'} CMYK files carry no File Info or AI label here.`);
          await give(await api.encodeCmyk(ink, z.w, z.h, s.format, s.embed === false ? null : prof, s.quality, p.doc.resolution ?? 72), exportName(p.name, s, suffix), c);
          return;
        }
        if (inks) { say(`CMYK profiles write JPEG and TIFF only; ${s.format.toUpperCase()} is written in sRGB.`); s = { ...s, profile: undefined }; }
        // Colour: formvis works in sRGB; another profile converts the pixels, and every format but PDF carries the
        // profile (WebP through the engine when it is not sRGB, as the browser's WebP encoder cannot embed one).
        // A document with its own profile (1.53.5) is exported in it, the profile embedded as it is.
        // Colour export presets: any RGB profile the engine lists converts exactly through LittleCMS (intent and black
        // point compensation as the preset says), and `embed: false` leaves the profile out of the file.
        const own = engine.current?.doc.profile, listed = !own && !!s.profile?.startsWith('id:') ? (s.profile as string).slice(3) : null;
        const space: SpaceId = own || listed ? 'srgb' : (s.profile as SpaceId | undefined) ?? 'srgb';
        const icc = own ? fromBase64(own.icc) : listed ? await api.colourProfileBytes(listed) : iccProfile(space), label = listed ? profileName(icc) : SPACES[space].label;
        if (listed) {
          const img = x.getImageData(0, 0, z.w, z.h), f = new Float32Array(img.data.length);
          for (let i = 0; i < f.length; i++) f[i] = img.data[i] / 255;
          const out = await api.convertDeep(f, z.w, z.h, 'rgb', '', toBase64(icc), { intent: s.intent ?? 'relative', bpc: s.bpc !== false, bits: 8 });
          for (let i = 0; i < f.length; i++) if (i % 4 !== 3) img.data[i] = Math.round(out.data[i] * 255);
          x.putImageData(img, 0, 0);
        } else if (space !== 'srgb') { const img = x.getImageData(0, 0, z.w, z.h); convertPixels(img.data, 'srgb', space); x.putImageData(img, 0, 0); }
        const tagged = !!own || !!listed || space !== 'srgb', keep = s.embed !== false && s.format !== 'pdf' && (tagged || s.format !== 'webp') ? icc : null;
        const viaEngine = engineWrites(s) || (s.format === 'webp' && tagged && !!keep);
        if (PROFILELESS.has(s.format) && (own || listed || space !== 'srgb')) say(`${s.format.toUpperCase()} carries no color profile; the pixels are written in ${listed ? label : own ? 'the document\'s profile' : SPACES[space].label}.`);
        if (!io.quiet) {
          // What the flat file lost or changed, in one notice: depth, ink, transparency, lossy encoding, resolution.
          let clear = false;
          if (dropsAlpha(s)) {
            const probe = await createImageBitmap(base), k = Math.min(1, 1024 / Math.max(probe.width, probe.height)), pc = createSurface(Math.max(1, Math.round(probe.width * k)), Math.max(1, Math.round(probe.height * k))), px = ctxOf(pc);
            px.imageSmoothingEnabled = false;
            px.drawImage(probe, 0, 0, pc.width, pc.height);
            probe.close();
            const d = px.getImageData(0, 0, pc.width, pc.height).data;
            for (let i = 3; i < d.length && !clear; i += 4) if (d[i] < 255) clear = true;
          }
          const lost = fidelityNotes(s, p.doc, clear);
          if (lost.length) say(lost.join(' '));
        }
        // An Indexed Color document is written as a palette PNG that keeps its own colour table and clear entry.
        const pngOut = async (): Promise<Blob> => {
          const pal = p.doc.mode === 'indexed' ? p.doc.palette : undefined;
          if (!pal?.length) return toBlob(c, 'image/png');
          const img = x.getImageData(0, 0, z.w, z.h);
          return new Blob([await encodeIndexedPng({ data: img.data, width: z.w, height: z.h }, pal.map((e) => [e.r, e.g, e.b] as const), p.doc.transparentIndex) as BlobPart], { type: 'image/png' });
        };
        const blob = viaEngine ? await api.encode(await toBlob(c), (s.format === 'jpg' ? 'jpeg' : s.format) as 'avif' | 'tiff' | 'pdf' | 'webp', s.quality, p.doc.resolution ?? 72, keep, s.format === 'avif' ? { ...formatOptions(s), ...metaForEngine(exportMeta(s, p.doc.meta), new Date(), s.aiLabel && s.aiLabel !== 'none' ? s.aiLabel : undefined) } : formatOptions(s))
          : s.format === 'png' ? await withResolution(keep ? await embedPng(await pngOut(), keep, label) : await pngOut(), p.doc.resolution ?? 72)
          : s.format === 'jpg' ? await withResolution(keep ? await embedJpeg(await toBlob(c, 'image/jpeg', s.quality / 100), keep) : await toBlob(c, 'image/jpeg', s.quality / 100), p.doc.resolution ?? 72)
          : await toBlob(c, 'image/webp', s.quality / 100);
        // The AI label (1.51.8), in PNG, JPEG and WebP.
        // File Info (29.2) goes in as XMP, the AI label inside the same packet; with no File Info the label is written alone.
        const ai = s.aiLabel && s.aiLabel !== 'none' ? s.aiLabel : p.doc.meta?.aiLabel;
        // Metadata (36.29): the document's File Info, none, or only the Copyright and Contact texts.
        let meta = exportMeta(s, p.doc.meta);
        if (loadPrefs().exifColourTag && s.metadata !== 'none' && (s.format === 'jpg' || s.format === 'png' || s.format === 'webp' || s.format === 'tiff')) {
          const srgbOut = own ? isSrgbName(own.name) : listed ? isSrgbName(label) : space === 'srgb';
          meta = { ...(meta ?? {}), exif: toBase64(withColourSpaceTag(exifBlockOf(meta ?? undefined), srgbOut)) };
        }
        const labelled = metaWritable(meta) ? await withXmp(blob, s.format, meta, new Date(), ai) : ai ? await withAiLabel(blob, s.format, ai) : blob;
        await give(s.promptMeta && s.format === 'png' ? await withGenerationText(labelled, p.doc.layers) : labelled, exportName(p.name, s, suffix), c);
      } catch (err) { if (io.sink) io.sink(new Blob([]), ''); else toast(message(err), 'error'); }
    });
  }
  /** Export As preview: the file the settings would write, encoded off to the side (nothing is delivered), as its bytes,
   *  name and the picture it holds; null when the export fails. */
  async function exportPreview(s: ExportSettings, layerId?: string): Promise<{ blob: Blob; name: string; view?: ReturnType<typeof createSurface> } | null> {
    let got: { blob: Blob; name: string; view?: ReturnType<typeof createSurface> } | null = null;
    await exportAsOne(sizedSettings(s)[0].s, sizedSettings(s)[0].suffix, '', { quiet: true, ...(layerId ? { layerId } : {}), sink: (blob, name, view) => { if (name) got = { blob, name, view }; } });
    return got;
  }
  /** Layer > Export As: the Export As settings applied to each selected layer (the active one when none is) drawn alone,
   *  named for the layer; several layers go as one zip in the browser. */
  async function exportLayersAs(all: ExportSettings): Promise<void> {
    const p = engine.current;
    if (!p) return;
    const ids = (p.selectedIds.size ? [...p.selectedIds] : p.activeId ? [p.activeId] : []).filter((id) => { const l = p.layer(id); return !!l && !l.isGroup && !!l.raster; });
    if (!ids.length) { toast('Select a pixel layer to export.', 'info'); return; }
    const files: Array<{ name: string; blob: Blob }> = [], taken = new Set<string>();
    for (const id of ids) {
      const l = p.layer(id)!;
      let base = safeName(l.name), n = 1;
      while (taken.has(base.toLowerCase())) base = `${safeName(l.name)} ${++n}`;
      taken.add(base.toLowerCase());
      for (const one of sizedSettings({ ...all, fileName: base })) await exportAsOne(one.s, one.suffix, '', { layerId: id, sink: (blob, name) => { if (name) files.push({ name, blob }); } });
    }
    if (!files.length) { toast('The selected layers could not be exported.', 'error'); return; }
    if (files.length === 1) { await deliver(files[0].blob, files[0].name); return; }
    await deliver(await zipFiles(files), `${stripExt(p.name)} layers.zip`);
  }

  /** File > Export > Selection as Mask PNG: the selection as a document-sized grey picture, white selected, black not, feathered edges kept. */
  async function exportSelectionMask(): Promise<void> {
    const p = engine.current, sel = p?.selection;
    if (!p || !sel) return;
    const W = p.doc.width, H = p.doc.height, c = createSurface(W, H), x = ctxOf(c), img = x.createImageData(W, H);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    for (let j = 0; j < sel.h; j++) {
      const y = sel.y + j;
      if (y < 0 || y >= H) continue;
      for (let i = 0; i < sel.w; i++) {
        const xx = sel.x + i;
        if (xx < 0 || xx >= W) continue;
        const o = (y * W + xx) * 4, v = sel.data[j * sel.w + i]!;
        img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v;
      }
    }
    x.putImageData(img, 0, 0);
    const blob = await toBlob(c, 'image/png');
    if (blob) await deliver(blob, `${(p.name || 'Untitled').replace(/\.[^.]+$/, '')} selection.png`);
  }

  /** File > Export > Radiance HDR and OpenEXR from a 32-bit document (1.53.9): linear floats, as they are. */
  async function exportWide(kind: 'hdr' | 'exr' | 'pfm', exr: Record<string, unknown> | null = null): Promise<void> {
    const p = engine.current;
    if (!p) return;
    await flatLoss(kind);
    try {
      // 1.57.8: from any document; below 32 bits (and in CMYK and Lab) the picture the canvas shows, as linear light.
      let deep: { width: number; height: number; data: Float32Array } | { error: string };
      if (p.doc.depth === 32 && p.doc.mode !== 'lab' && p.doc.mode !== 'cmyk') deep = (await composeFloatOnWorkers(p.doc)) ?? composeDeep(p.doc);
      else {
        const flat = engine.flattened();
        if (!flat) return;
        const img = ctxOf(flat).getImageData(0, 0, flat.width, flat.height), d = new Float32Array(img.data.length);
        for (let i = 0; i < d.length; i += 4) { for (let c = 0; c < 3; c++) d[i + c] = srgbToLinear(img.data[i + c] / 255); d[i + 3] = img.data[i + 3] / 255; }
        deep = { width: flat.width, height: flat.height, data: d };
      }
      if ('error' in deep) throw new Error(deep.error);
      await deliver(await api.encodeDeep(deep.data, deep.width, deep.height, kind, null, exr), `${(p.name || 'Untitled').replace(/\.[^.]+$/, '')}.${kind}`);
    } catch (err) { toast(`Export failed: ${err instanceof Error ? err.message : String(err)}`); }
  }

  /** Image > Mode > 8 or 16 Bits/Channel; from 32 bits, HDR Toning first (1.53.9). */
  async function toDepth(depth: 8 | 16): Promise<void> {
    if (engine.current?.doc.depth === 32 && engine.current.doc.mode !== 'lab' && engine.current.doc.mode !== 'cmyk') { const tone = await hdrToning.ask(depth); if (tone) engine.setDepth(depth, tone); return; }
    engine.setDepth(depth);
  }

  /** Image > Mode at 16 bits (DEV_PLAN 28.2): every layer's own floats through LittleCMS in double precision, rounded
   *  once to 16 bits, in one step; true when the document changed. */
  async function deepMode(space: Space, choice: string, profile: DocProfile | null, intent?: string, bpc?: boolean): Promise<boolean> {
    const c = loadPrefs().colour;
    return engine.task(async () => {
      try { return await convertDocumentDeep(engine, choice, profile, space, { intent: intent ?? c.intent, bpc: bpc ?? c.bpc, dither: c.dither }, (pr) => cmykLutFor(pr)); } catch (err) { toast(message(err), 'error'); return false; }
    });
  }
  async function toGray(): Promise<boolean> {
    const ref = loadPrefs().colour.gray, id = ref.startsWith('id:') ? ref.slice(3) : 'builtin:gray-g22';
    const hit = (await api.colourProfiles().catch(() => null))?.profiles.find((x) => x.id === id);
    return deepMode('gray', `id:${id}`, await cmykProfileOf(id, hit?.name ?? 'Gray Gamma 2.2'));
  }
  /** Before a mode that starts from RGB (1.57.3, 1.57.5): a deeper document is brought down first, from 32 bits with
   *  HDR Toning as Image > Mode does; true when the document is then at `depth` or less. */
  async function downTo(depth: 8 | 16): Promise<boolean> {
    const d = engine.current?.doc.depth ?? 8;
    if (d <= depth) return true;
    await toDepth(depth);
    return (engine.current?.doc.depth ?? 8) <= depth;
  }

  /** 16 or 32 Bits/Channel from any mode (1.57.8): CMYK and Lab keep their mode at both, their ink and Lab values
   *  staying floats (not linear light); Bitmap goes to Grayscale and Indexed Color to RGB first. */
  async function toDeeper(depth: 16 | 32): Promise<void> {
    const m = engine.current?.doc.mode ?? 'rgb';
    if (m === 'bitmap') engine.convertMode('grayscale');
    else if (m === 'indexed') engine.convertMode('rgb');
    engine.setDepth(depth);
  }

  /** Whether the document is CMYK or Lab at 16 or 32 bits, whose floats go through the 16-bit conversion route. */
  function inkDeep(): boolean {
    const d = engine.current?.doc;
    return !!d && (d.depth === 16 || (d.depth === 32 && (d.mode === 'lab' || d.mode === 'cmyk')));
  }

  /** A CMYK or Lab document to RGB first (1.57.5), for Bitmap, Indexed Color and (from Lab) CMYK; true when it is RGB. */
  async function toRgbFirst(): Promise<boolean> {
    const m = engine.current?.doc.mode ?? 'rgb';
    if ((m === 'cmyk' || m === 'lab') && inkDeep()) await deepMode('rgb', loadPrefs().colour.rgb, await workingRgb());
    else if (m === 'cmyk') await cmykToRgb();
    else if (m === 'lab') engine.setRgbFromLab();
    return (engine.current?.doc.mode ?? 'rgb') !== 'cmyk' && engine.current?.doc.mode !== 'lab';
  }

  /** CMYK documents (1.54.0, H1). The engine converts pixels exactly; the window keeps a display table per profile. */
  const cmykLuts = new Map<string, { out: Lut4; in: Lut3x4 }>();
  async function cmykLutFor(profile: DocProfile): Promise<{ out: Lut4; in: Lut3x4 }> {
    const key = profile.icc.slice(0, 64) + profile.icc.length;
    let lut = cmykLuts.get(key);
    if (!lut) { lut = { out: await api.cmykLut({ icc: profile.icc }), in: await api.rgbCmykLut({ icc: profile.icc }) }; cmykLuts.set(key, lut); }
    return lut;
  }
  const tablesPending = new Set<string>();
  /** Which profile each document's tables came from (1.57.9): after Assign or Convert to Profile is undone or redone,
   *  the tables reload for the profile the document has now. */
  const tablesFor = new Map<string, string>();
  async function ensureCmykTables(): Promise<void> {
    const p = engine.current;
    if (!p || p.doc.mode !== 'cmyk' || !p.doc.profile || tablesPending.has(p.id)) return;
    const key = p.doc.profile.icc.slice(0, 64) + p.doc.profile.icc.length;
    if (p.cmykLut && (tablesFor.get(p.id) ?? key) === key) { tablesFor.set(p.id, key); return; }
    tablesPending.add(p.id);
    try { const t = await cmykLutFor(p.doc.profile); engine.setCmykTables(p, t.out, t.in); tablesFor.set(p.id, key); } catch (err) { toast(message(err), 'error'); } finally { tablesPending.delete(p.id); }
  }
  for (const ev of ['projects', 'active', 'doc'] as const) engine.on(ev, () => void ensureCmykTables());
  async function cmykProfileOf(id: string, name: string): Promise<DocProfile> { return { name, icc: toBase64(await api.colourProfileBytes(id)) }; }
  /** Color Settings' working RGB as a document profile (null for sRGB, the canvas's own space). */
  async function workingRgb(): Promise<DocProfile | null> {
    const ref = loadPrefs().colour.rgb;
    if (ref === 'display-p3' || ref === 'adobe-rgb') return { name: SPACES[ref].label, icc: toBase64(iccProfile(ref)) };
    if (!ref.startsWith('id:')) return null;
    try { const hit = (await api.colourProfiles()).profiles.find((x) => `id:${x.id}` === ref); return hit ? await cmykProfileOf(hit.id, hit.name) : null; } catch { return null; }
  }
  /** A picture with no embedded profile (Color Settings): read in the working space, or left as its numbers when the
   *  person says so; the answer is the profile to give the new document, or null for none. */
  async function missingProfile(file: string): Promise<DocProfile | null> {
    const c = loadPrefs().colour;
    if (c.rgbPolicy === 'off') return null;
    const working = await workingRgb();
    if (!c.askMissing) return working;
    const how = await colourSettingsDialogs.missing.ask(file, working?.name ?? 'sRGB IEC61966-2.1');
    if (how === 'cancel') openStopped = true;
    return how === 'assume' ? working : null;
  }
  /** Set when a colour prompt is cancelled: the files still queued are not opened. */
  let openStopped = false;
  /** Color Settings' working CMYK or gray as a document profile: the shipped press profile or the listed one. */
  async function workingSpace(kind: 'cmyk' | 'gray'): Promise<DocProfile> {
    const ref = loadPrefs().colour[kind], id = ref.startsWith('id:') ? ref.slice(3) : kind === 'gray' ? 'builtin:gray-g22' : null;
    const hit = id ? (await api.colourProfiles().catch(() => null))?.profiles.find((x) => x.id === id) : null;
    if (id && (hit || kind === 'gray')) return cmykProfileOf(id, hit?.name ?? 'Gray Gamma 2.2');
    const d = await api.defaultCmykProfile();
    if (!d) throw new Error('No CMYK profile is available: add one in View > Proof Setup > Load Profile.');
    return cmykProfileOf(d.id, d.name);
  }
  /** A CMYK or gray picture at open (Color Settings): the profile the document carries and whether its numbers convert
   *  from the embedded profile. Off ignores the embedded profile; Preserve keeps it; Convert goes to the working space;
   *  Ask When Opening asks on a mismatch, and for a gray picture with no profile. */
  async function openPolicy(kind: 'cmyk' | 'gray', file: string, embedded: DocProfile | null, working: DocProfile): Promise<{ profile: DocProfile | null; convert: boolean }> {
    const c = loadPrefs().colour, policy = kind === 'cmyk' ? c.cmykPolicy : c.grayPolicy, unmanaged = kind === 'cmyk' ? working : null;
    if (policy === 'off') return { profile: unmanaged, convert: false };
    if (!embedded) {
      if (kind === 'gray' && c.askMissing) { const how = await colourSettingsDialogs.missing.ask(file, working.name); if (how === 'cancel') openStopped = true; return { profile: how === 'assume' ? working : null, convert: false }; }
      return { profile: working, convert: false };
    }
    if (embedded.icc === working.icc || embedded.name === working.name) return { profile: embedded, convert: false };
    const asked = c.askMismatch ? await colourDialogs.mismatch.ask(file, embedded.name, working.name) : policy === 'convert' ? 'convert' : 'keep';
    if (asked === 'cancel') openStopped = true;
    const how = asked === 'cancel' ? 'keep' : asked;
    return how === 'keep' ? { profile: embedded, convert: false } : how === 'convert' ? { profile: working, convert: true } : { profile: unmanaged, convert: false };
  }
  /** CMYK ink (four bytes a pixel, then alpha) converted between press profiles by LittleCMS at the Color Settings intent. */
  async function convertInk5(ink: Uint8Array, w: number, h: number, from: DocProfile, to: DocProfile): Promise<Uint8Array> {
    const n = w * h, four = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) four.set(ink.subarray(i * 5, i * 5 + 4), i * 4);
    const out = await api.convertInk(four, w, h, from.icc, to.icc, loadPrefs().colour.intent), res = new Uint8Array(ink);
    for (let i = 0; i < n; i++) res.set(out.subarray(i * 4, i * 4 + 4), i * 5);
    return res;
  }
  /** An 8-bit gray picture opened as a Grayscale document under the Gray policy (Color Settings); null when it is not 8-bit gray. */
  async function openGray(f: File): Promise<ImportedImage | null> {
    const g = await api.decodeGray(f, f.name);
    if (!g) return null;
    const working = await workingSpace('gray'), embedded = g.icc ? { name: profileName(g.icc) || 'Embedded gray profile', icc: toBase64(g.icc) } : null, o = await openPolicy('gray', f.name, embedded, working), c = loadPrefs().colour;
    const n = g.width * g.height, img = new ImageData(g.width, g.height);
    const fl = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const x = g.px[i * 2] / 255; fl[i * 4] = x; fl[i * 4 + 1] = x; fl[i * 4 + 2] = x; fl[i * 4 + 3] = g.px[i * 2 + 1] / 255; }
    const v: Float32Array = o.convert && embedded && o.profile ? (await api.convertDeep(fl, g.width, g.height, 'rgb', embedded.icc, o.profile.icc, { intent: c.intent, bpc: c.bpc, dither: false, bits: 8 })).data : fl;
    for (let i = 0; i < n * 4; i++) img.data[i] = Math.round(v[i] * 255);
    const r = new Raster(g.width, g.height);
    r.ctx.putImageData(img, 0, 0); r.touch();
    const resolution = (await headerResolution(f)) ?? undefined;
    return { source: r.canvas as CanvasImageSource, width: g.width, height: g.height, name: f.name, mode: 'grayscale', ...(o.profile ? { profile: o.profile } : {}), ...(resolution ? { resolution } : {}) };
  }
  async function toCmyk(profile: DocProfile, intent: string, bpc: boolean): Promise<void> {
    const p = engine.current;
    if (!p || p.doc.mode === 'cmyk') return;
    await engine.task(async () => {
      try {
        const src = p.doc.profile?.icc ?? '', lut = await cmykLutFor(profile), ink = new Map<ID, ChannelPixels>();
        for (const l of p.doc.layers) {
          if (!l.raster || l.isGroup || l.adjustment) continue;
          const out = await api.convertPixels(rasterBytes(l.raster), l.raster.width, l.raster.height, 'cmyk', profile.icc, src, intent, bpc);
          ink.set(l.id, channelsFromU8(out, l.raster.width, l.raster.height));
        }
        engine.setCmyk(profile, ink, lut.out, lut.in);
      } catch (err) { toast(message(err), 'error'); }
    });
  }
  async function cmykToRgb(): Promise<void> {
    const p = engine.current;
    if (!p || p.doc.mode !== 'cmyk' || !p.doc.profile) return;
    await engine.task(async () => {
      try {
        const rasters = new Map<ID, Raster>(), working = await workingRgb();
        for (const l of p.doc.layers) {
          if (!l.channels) continue;
          const c = loadPrefs().colour;   // Color Settings' working RGB, intent and black point compensation, as 16 bits (1.87.3, D18)
          const out = await api.convertPixels(channelsToU8(l.channels.data), l.channels.width, l.channels.height, 'rgb', p.doc.profile!.icc, working?.icc ?? '', c.intent, c.bpc);
          const r = new Raster(l.channels.width, l.channels.height), img = r.ctx.createImageData(l.channels.width, l.channels.height);
          img.data.set(out); r.ctx.putImageData(img, 0, 0); r.touch();
          rasters.set(l.id, r);
        }
        engine.setRgbFromCmyk(rasters, working);
      } catch (err) { toast(message(err), 'error'); }
    });
  }
  async function openCmyk(name: string, file: { width: number; height: number; ink: Uint8Array; icc: Uint8Array | null }): Promise<void> {
    const embedded: DocProfile | null = file.icc ? { name: profileName(file.icc) || 'Embedded CMYK profile', icc: toBase64(file.icc) } : null, working = await workingSpace('cmyk');
    const o = await openPolicy('cmyk', name, embedded, working), profile = o.profile ?? working;
    const ink = o.convert && embedded ? await convertInk5(file.ink, file.width, file.height, embedded, profile) : file.ink;
    const t = await cmykLutFor(profile);
    engine.openChannels(name, channelsFromU8(ink, file.width, file.height), profile, t.out, t.in);
    if (!file.icc) toast(`${name} has no embedded profile; ${profile.name} is assumed.`);
  }
  /** A CMYK PSD opened with its layers' ink (1.56.1, DEV_PLAN 22.8). */
  /** A Lab TIFF or PSD opened as a Lab document (1.58.1, DEV_PLAN 22.11), each layer at its place, 16 bits kept. */
  function openLab(name: string, d: NonNullable<Awaited<ReturnType<typeof api.decodeLab>>>): void {
    engine.openLabLayers(name, d.width, d.height, d.layers.map((l) => ({ name: l.name, x: l.left, y: l.top, channels: { mode: 'lab' as const, n: 3 as const, width: l.width, height: l.height, data: l.data }, opacity: l.opacity / 255, visible: l.visible })), d.bits === 16 ? 16 : 8);
  }

  async function openCmykPsd(name: string, d: CmykPsd): Promise<void> {
    const embedded: DocProfile | null = d.icc ? { name: profileName(d.icc) || 'Embedded CMYK profile', icc: toBase64(d.icc) } : null, working = await workingSpace('cmyk');
    const o = await openPolicy('cmyk', name, embedded, working), profile = o.profile ?? working;
    const inks = await Promise.all(d.layers.map((l) => (o.convert && embedded ? convertInk5(l.ink, l.width, l.height, embedded, profile) : Promise.resolve(l.ink))));
    const t = await cmykLutFor(profile);
    engine.openChannelLayers(name, d.width, d.height, d.layers.map((l, i) => ({ name: l.name, x: l.left, y: l.top, channels: channelsFromU8(inks[i], l.width, l.height), opacity: l.opacity / 255, visible: l.visible, blend: l.blend })), profile, t.out, t.in);
    if (!d.icc) toast(`${name} has no embedded profile; ${profile.name} is assumed.`);
  }

  /** Export PSD from a CMYK document (1.56.1): each pixel layer placed in ink at its bounds, the composite from the
   *  document's ink, the profile embedded. Groups, masks, adjustment layers and styles are not carried as such; the
   *  composite holds their effect, and a note says so. */
  async function exportCmykPsd(): Promise<void> {
    const p = engine.current, prof = p?.doc.profile;
    if (!p || p.doc.mode !== 'cmyk' || !prof) return;
    await engine.task(async () => {
      try {
        const W = p.doc.width, H = p.doc.height, comp = composeChannels(p.doc, p.cmykTables);
        if ('error' in comp) throw new Error(comp.error);
        const metas: Array<{ name: string; left: number; top: number; width: number; height: number; opacity: number; visible: boolean; blend: string }> = [], inks: Uint8Array[] = [];
        let skipped = 0;
        for (const l of p.doc.layers) {
          if (!l.channels || l.isGroup || l.adjustment) { if (l.adjustment || l.mask || l.effects) skipped++; continue; }
          const full = new Float32Array(W * H * 5); place(full, W, H, l.channels, l.transform, 1, 5);
          let x0 = W, y0 = H, x1 = -1, y1 = -1;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (full[(y * W + x) * 5 + 4] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          if (x1 < 0) continue;
          const w = x1 - x0 + 1, h = y1 - y0 + 1, cut = new Float32Array(w * h * 5);
          for (let y = 0; y < h; y++) cut.set(full.subarray(((y0 + y) * W + x0) * 5, ((y0 + y) * W + x0 + w) * 5), y * w * 5);
          metas.push({ name: l.name, left: x0, top: y0, width: w, height: h, opacity: Math.round(l.opacity * (l.fill ?? 1) * 255), visible: l.visible, blend: l.blend ?? 'normal' });
          inks.push(channelsToU8(cut));
          if (l.mask || l.effects) skipped++;
        }
        const blob = await api.encodeCmykPsd({ width: W, height: H, layers: metas }, channelsToU8(comp.data), inks, fromBase64(prof.icc));
        await deliver(blob, `${p.name}.psd`);
        if (skipped) toast(`${skipped} layer mask, style or adjustment layer${skipped > 1 ? 's are' : ' is'} in the composite, not as such: the CMYK PSD carries pixel layers.`, 'info');
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** Export TIFF from a Lab document (1.56.6, DEV_PLAN 22.9): the Lab composite laid on white (a Lab TIFF holds no
   *  transparency here), 8 bits a channel as the usual Lab TIFF, written by the engine's Pillow. */
  async function exportLabTiff(): Promise<void> {
    const p = engine.current;
    if (!p || p.doc.mode !== 'lab') return;
    await engine.task(async () => {
      try {
        const c = composeFloat(p.doc, 3, false);
        if ('error' in c) throw new Error(c.error);
        if ((p.doc.depth ?? 8) >= 16) {
          // 16-bit Lab (1.57.8; a 32-bit Lab document is written at 16 bits, values outside the range clipped): L, a and b at 16 bits in the window's encoding, laid on white; the engine writes CIELab.
          const m = c.width * c.height, u = new Uint16Array(m * 3);
          for (let i = 0, o = 0; i < c.data.length; i += 4, o += 3) { const a = c.data[i + 3]; u[o] = Math.round(Math.max(0, Math.min(1, c.data[i] * a + (1 - a))) * 65535); u[o + 1] = Math.round(Math.max(0, Math.min(1, c.data[i + 1] * a + 0.5 * (1 - a))) * 65535); u[o + 2] = Math.round(Math.max(0, Math.min(1, c.data[i + 2] * a + 0.5 * (1 - a))) * 65535); }
          await deliver(await api.encodeTiff16(u, c.width, c.height, 'lab', null), `${p.name}.tif`);
          return;
        }
        const n = c.width * c.height, bytes = new Uint8Array(n * 3);
        for (let i = 0, o = 0; i < c.data.length; i += 4, o += 3) {
          const a = c.data[i + 3], l = c.data[i] * a + (1 - a), A = c.data[i + 1] * a + 0.5 * (1 - a), B = c.data[i + 2] * a + 0.5 * (1 - a);
          bytes[o] = Math.round(Math.max(0, Math.min(1, l)) * 255); bytes[o + 1] = Math.round(Math.max(0, Math.min(1, A)) * 255); bytes[o + 2] = Math.round(Math.max(0, Math.min(1, B)) * 255);
        }
        await deliver(await api.encodeLabTiff(bytes, c.width, c.height), `${p.name}.tif`);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** Export PSD from a Lab document (DEV_PLAN 36.11): PSD colour mode 9, each pixel layer placed at its bounds with L, a
   *  and b over 0 to 255 (a and b offset by 128) and its transparency, the composite laid on white. Groups, masks,
   *  adjustment layers and styles are in the composite, not as such; a note says so. */
  async function exportLabPsd(): Promise<void> {
    const p = engine.current;
    if (!p || p.doc.mode !== 'lab') return;
    if ((p.doc.depth ?? 8) > 8) { toast('A Lab PSD is written at 8 bits: Image > Mode > 8 Bits/Channel first.', 'info'); return; }
    await engine.task(async () => {
      try {
        const W = p.doc.width, H = p.doc.height, c = composeFloat(p.doc, 3, false);
        if ('error' in c) throw new Error(c.error);
        const comp = new Uint8Array(W * H * 3);
        for (let i = 0, o = 0; i < c.data.length; i += 4, o += 3) {
          const a = c.data[i + 3];
          comp[o] = Math.round(Math.max(0, Math.min(1, c.data[i] * a + (1 - a))) * 255);
          comp[o + 1] = Math.round(Math.max(0, Math.min(1, c.data[i + 1] * a + 0.5 * (1 - a))) * 255);
          comp[o + 2] = Math.round(Math.max(0, Math.min(1, c.data[i + 2] * a + 0.5 * (1 - a))) * 255);
        }
        const metas: Array<{ name: string; left: number; top: number; width: number; height: number; opacity: number; visible: boolean; blend: string }> = [], planes: Uint8Array[] = [];
        let skipped = 0;
        for (const l of p.doc.layers) {
          if (!l.channels || l.channels.mode !== 'lab' || l.isGroup || l.adjustment) { if (l.adjustment || l.mask || l.effects) skipped++; continue; }
          const full = new Float32Array(W * H * 4); place(full, W, H, l.channels, l.transform, 1, 4);
          let x0 = W, y0 = H, x1 = -1, y1 = -1;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (full[(y * W + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          if (x1 < 0) continue;
          const w = x1 - x0 + 1, h = y1 - y0 + 1, cut = new Float32Array(w * h * 4);
          for (let y = 0; y < h; y++) cut.set(full.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
          metas.push({ name: l.name, left: x0, top: y0, width: w, height: h, opacity: Math.round(l.opacity * (l.fill ?? 1) * 255), visible: l.visible, blend: l.blend ?? 'normal' });
          planes.push(channelsToU8(cut));
          if (l.mask || l.effects) skipped++;
        }
        await deliver(await api.encodeLabPsd({ width: W, height: H, layers: metas }, comp, planes), `${p.name}.psd`);
        if (skipped) toast(`${skipped} layer mask, style or adjustment layer${skipped > 1 ? 's are' : ' is'} in the composite, not as such: the Lab PSD carries pixel layers.`, 'info');
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function exportCmyk(kind: 'tiff' | 'jpg', quality: number): Promise<void> {
    const p = engine.current;
    if (!p || p.doc.mode !== 'cmyk' || !p.doc.profile) return;
    await engine.task(async () => {
      try {
        const ink = composeChannels(p.doc, p.cmykTables);
        if ('error' in ink) throw new Error(ink.error);
        if (kind === 'tiff' && (p.doc.depth === 16 || p.doc.depth === 32)) {
          // 16 and 32-bit CMYK (1.57.8): the inks at 16 bits, transparency laid on paper, written by the engine with tifffile.
          const n = ink.width * ink.height, u = new Uint16Array(n * 4);
          for (let j = 0; j < n; j++) { const a = ink.data[j * 5 + 4]; for (let c = 0; c < 4; c++) u[j * 4 + c] = Math.round(Math.max(0, Math.min(1, ink.data[j * 5 + c] * a)) * 65535); }
          await deliver(await api.encodeTiff16(u, ink.width, ink.height, 'cmyk', fromBase64(p.doc.profile!.icc)), `${p.name}.tif`);
          return;
        }
        const blob = await api.encodeCmyk(channelsToU8(ink.data), ink.width, ink.height, kind, fromBase64(p.doc.profile!.icc), Math.round(quality * 100), p.doc.resolution ?? 72);
        await deliver(blob, `${p.name}.${kind === 'tiff' ? 'tif' : kind}`);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** One notice for what a flat save in `kind` changes or drops: depth, ink, transparency, lossy encoding, resolution. */
  async function flatLoss(kind: string, quality = 1): Promise<void> {
    const p = engine.current;
    if (!p) return;
    try {
      let clear = false;
      const flat = engine.flattened();
      if (flat) {
        const k = Math.min(1, 1024 / Math.max(flat.width, flat.height)), pc = createSurface(Math.max(1, Math.round(flat.width * k)), Math.max(1, Math.round(flat.height * k))), px = ctxOf(pc);
        px.imageSmoothingEnabled = false;
        px.drawImage(flat as CanvasImageSource, 0, 0, pc.width, pc.height);
        const d = px.getImageData(0, 0, pc.width, pc.height).data;
        for (let i = 3; i < d.length && !clear; i += 4) if (d[i] < 255) clear = true;
      }
      const lost = saveCopyNotes(kind, p.doc, clear, quality);
      if (lost.length) toast(lost.join(' '), 'info');
    } catch { /* the notice is a courtesy; the save goes on */ }
  }
  /** True while an action plays its Save step, so the export it runs is not recorded again. */
  let replayingSave = false;
  async function exportImage(kind: 'png' | 'jpg' | 'webp' | 'tiff' | 'pdf' | 'avif', quality = 0.92, called?: string): Promise<void> {
    const p = engine.current;
    if (!p) return;
    const stem = called || p.name;
    engine.settle();
    if (!replayingSave && (kind === 'png' || kind === 'jpg' || kind === 'webp')) actions.record({ kind: 'save', label: `Save as ${kind.toUpperCase()}`, format: kind, quality });
    await flatLoss(kind, quality);
    if (p.doc.mode === 'cmyk' && (kind === 'tiff' || kind === 'jpg')) { await exportCmyk(kind, quality); return; }
    if (p.doc.mode === 'lab' && kind === 'tiff') { await exportLabTiff(); return; }
    await engine.lockedTask(`Export ${kind.toUpperCase()}`, async () => {
      try {
        // A 16-bit document's PNG and TIFF keep their 16 bits (1.53.6): composed in floating point, written by the engine.
        const deep = (p.doc.depth ?? 8) > 8 && (kind === 'png' || kind === 'tiff') ? (await composeFloatOnWorkers(p.doc)) ?? composeDeep(p.doc) : null;
        if (deep && 'error' in deep) throw new Error(deep.error);
        // The document's own profile (1.53.5), for every export that can hold one; a 32-bit document's pixels are
        // linear light, so it keeps none.
        const prof = p.doc.profile && p.doc.depth !== 32 ? { bytes: fromBase64(p.doc.profile.icc), name: p.doc.profile.name } : null;
        // A very large 8-bit picture's PNG (1.61.2, DEV_PLAN 26.4): rendered a band at a time and written by the engine
        // as it comes, so no full-size copy is made here or there.
        if (!deep && (kind === 'png' || kind === 'tiff') && engine.bandedExportable()) {
          const format = kind === 'tiff' ? 'tiff' : 'png';
          const key = await api.bandsBegin(p.doc.width, p.doc.height, p.doc.resolution ?? 72, prof, format);
          await engine.renderBands((rows) => api.bandsPut(key, rows, format));
          await deliver(await api.bandsEnd(key, format), `${stem}.${kind === 'tiff' ? 'tif' : 'png'}`);
          return;
        }
        // From 32 bits (1.53.9): TIFF stays 32-bit float; PNG is 16-bit, sRGB-encoded, brighter than white clipped.
        const blob = deep ? (p.doc.depth === 32 && kind === 'tiff' ? await api.encodeDeep(deep.data, deep.width, deep.height, 'tiff32') : await api.encodeDeep(deepToU16(p.doc.depth === 32 ? deepToned({ mode: 'rgb', n: 3, ...deep }, 0, 1).data : deep.data), deep.width, deep.height, kind as 'png' | 'tiff', prof)) : kind === 'png' || kind === 'jpg' ? await engine.exportBlob(kind === 'png' ? 'image/png' : 'image/jpeg', quality)
          : kind === 'webp' && !prof ? await engine.exportBlob('image/webp', quality)
          : await (async () => { const png = await engine.exportBlob('image/png'); return png ? api.encode(png, kind, Math.round(quality * 100), p.doc.resolution ?? 72, kind === 'pdf' ? null : prof?.bytes ?? null) : null; })();
        // A document with its own profile (1.53.5) carries it into the PNG and JPEG, embedded as Export As embeds it;
        // TIFF, AVIF and WebP take it in the engine's encode, and 16-bit files as they are written.
        const own = !deep && blob && (kind === 'png' || kind === 'jpg') ? p.doc.profile ?? { name: SPACES.srgb.label, icc: toBase64(iccProfile('srgb')) } : undefined;
        const tagged = blob && own ? (kind === 'png' ? await embedPng(blob, fromBase64(own.icc), own.name) : await embedJpeg(blob, fromBase64(own.icc))) : blob;
        if (tagged) await deliver(await withXmp(tagged, kind, p.doc.meta), `${stem}.${kind === 'tiff' ? 'tif' : kind}`);   // File Info as XMP (29.2)
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** The flattened current document as encoded bytes (DEV_PLAN 30.8), without delivering it: the core of file-in, file-out. */
  async function imageBlob(kind: 'png' | 'jpg' | 'webp' | 'tiff', quality = 0.92): Promise<Blob | null> {
    const p = engine.current;
    if (!p) return null;
    engine.settle();
    if (kind === 'png' || kind === 'jpg' || kind === 'webp') return engine.exportBlob(kind === 'png' ? 'image/png' : kind === 'jpg' ? 'image/jpeg' : 'image/webp', quality);
    const png = await engine.exportBlob('image/png');
    return png ? api.encode(png, kind, Math.round(quality * 100), p.doc.resolution ?? 72) : null;
  }

  /** The droplet script (DEV_PLAN 30.5): drop pictures onto it to run the named action over them from the formvis folder. */
  function dropletScript(action: string, format: string, o: { quality?: number; out?: string; recursive?: boolean; suffix?: string } = {}): string {
    const sh = (v: string): string => `'${v.replace(/'/g, `'\\''`)}'`, q = sh(action);
    const extra = `${o.quality && format !== 'png' && format !== 'tiff' ? ` --quality ${Math.min(100, Math.max(1, Math.round(o.quality)))}` : ''}${o.out?.trim() ? ` --out ${sh(o.out.trim())}` : ''}${o.suffix?.trim() ? ` --suffix ${sh(o.suffix.trim())}` : ''}${o.recursive ? ' --recursive' : ''}`;
    return `#!/bin/sh\n# formvis droplet for the action ${action.replace(/[\r\n]+/g, ' ')}. Keep this file in the formvis folder, then drop pictures or folders onto it or run it with their names.\ncd "$(dirname "$0")" || exit 1\nexec ./formvis cli process "$@" --action ${q} --format ${format}${extra}\n`;
  }

  /** The droplet data file (.fvdrop): the action and the output choices as JSON, run by `./formvis cli droplet FILE pictures...`. */
  function dropletData(o: { action: string; format: string; quality: number; out: string; recursive: boolean; suffix?: string }): string {
    const jpegLike = o.format === 'jpg' || o.format === 'webp';
    return `${JSON.stringify({ kind: 'formvis-droplet', version: 1, action: o.action, output: { format: o.format, ...(jpegLike ? { quality: Math.min(100, Math.max(1, Math.round(o.quality))) } : {}), ...(o.out.trim() ? { out: o.out.trim() } : {}), ...(o.suffix?.trim() ? { suffix: o.suffix.trim() } : {}), recursive: o.recursive, inPlace: false } }, null, 2)}\n`;
  }

  async function makeDroplet(o: { action: string; format: string; quality: number; out: string; recursive: boolean; kind?: 'script' | 'data'; suffix?: string }): Promise<void> {
    if (o.kind === 'data') {
      await deliver(new Blob([dropletData(o)], { type: 'application/json' }), `${o.action}.fvdrop`);
      toast('Run it with ./formvis cli droplet followed by the file and the pictures or folders.');
      return;
    }
    await deliver(new Blob([dropletScript(o.action, o.format, o)], { type: 'text/x-shellscript' }), `${o.action}-droplet.sh`);
    toast('Put the droplet in the formvis folder, make it executable, then drop pictures or folders onto it.');
  }

  /** The pictures a command was given: files as [{name, data (base64)}] and, with documents true, every open document as it shows now. */
  async function sourceFiles(a: Record<string, unknown> | undefined): Promise<File[]> {
    const out: File[] = [];
    if (Array.isArray(a?.files)) {
      for (const f of a.files as Array<{ name?: unknown; data?: unknown }>) {
        if (typeof f?.data !== 'string') continue;
        const bin = atob(f.data), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        out.push(new File([bytes], typeof f.name === 'string' && f.name ? f.name : `image-${out.length + 1}.png`));
      }
    }
    if (a?.documents === true) {
      for (const p of [...engine.projects]) {
        const s = engine.flattenedOf(p);
        if (s) out.push(new File([await toBlob(s)], `${p.name || `Document ${out.length + 1}`}.png`, { type: 'image/png' }));
      }
    }
    return out;
  }

  const SOURCE_PARAMS = {
    files: { type: 'array' as const, description: 'Pictures as a list of {name, data} with the file bytes in base64; ./formvis cli run takes plain paths (files=a.jpg,b.jpg) and reads them.' },
    documents: { type: 'boolean' as const, description: 'Use every open document as it shows now (with or without files).' },
  };

  /** Conditional Mode Change (DEV_PLAN 30.5a): a document whose mode is in `from` goes to `to` by the routes the Mode
   *  commands use (CMYK and Lab through RGB, Bitmap through Grayscale); any other document is left as it is. */
  async function conditionalMode(from: DocMode[], to: DocMode): Promise<boolean> {
    const m = engine.current?.doc.mode ?? 'rgb';
    if (!from.includes(m) || m === to) return true;
    if (to === 'rgb') {
      if (m === 'cmyk' || m === 'lab') await toRgbFirst(); else engine.convertMode('rgb');
    } else if (to === 'grayscale') {
      if (inkDeep()) await toGray();
      else if (m === 'lab') engine.setGrayFromLab();
      else if (m === 'cmyk') { if (await toRgbFirst()) engine.convertMode('grayscale'); }
      else engine.convertMode('grayscale');
    } else if (to === 'lab') {
      if (m !== 'rgb' && !(await toRgbFirst() && ((engine.current?.doc.mode ?? 'rgb') === 'rgb' || engine.convertMode('rgb')))) return false;
      if (!(await downTo(16))) return false;
      if (engine.current?.doc.depth === 16) await deepMode('lab', 'lab', null); else engine.setLab();
    } else {
      // CMYK, Bitmap and Indexed Color start from 8-bit RGB; Bitmap takes Grayscale.
      if (!(await toRgbFirst()) || !(await downTo(8))) return false;
      if ((engine.current?.doc.mode ?? 'rgb') !== 'rgb' && !engine.convertMode('rgb')) return false;   // no mode is RGB
      if (to === 'bitmap' && !engine.convertMode('grayscale')) return false;
      if (to === 'cmyk') {
        // As Mode > CMYK Color with no dialog: the shipped CMYK profile (else the first found), and Color Settings' intent and BPC.
        const all = (await api.colourProfiles()).profiles.filter((x) => x.space === 'CMYK'), pick = all.find((x) => x.shipped) ?? all[0], c = loadPrefs().colour;
        if (!pick) { toast('No CMYK profile was found. Load one in View > Proof Setup.', 'error'); return false; }
        await toCmyk(await cmykProfileOf(pick.id, pick.name), c.intent, c.bpc);
      } else if (!engine.convertMode(to)) return false;
    }
    return engine.current?.doc.mode === to;
  }

  /** Whether the current document and active layer meet a conditional step's test. */
  function conditionHolds(t: ConditionTest): boolean {
    const p = engine.current;
    if (!p) return false;
    const d = p.doc, l = p.activeLayer;
    switch (t) {
      case 'landscape': return d.width > d.height;
      case 'portrait': return d.height > d.width;
      case 'square': return d.width === d.height;
      case 'depth8': return (d.depth ?? 8) === 8;
      case 'depth16': return d.depth === 16;
      case 'depth32': return d.depth === 32;
      case 'selection': return !!p.selection;
      case 'unsaved': return p.modified;
      case 'layers': return d.layers.length > 1;
      case 'textLayer': return !!l?.text;
      case 'smartLayer': return !!l?.smart;
      case 'maskLayer': return !!(l as { mask?: unknown } | null)?.mask;
    }
  }

  /** A conditional step plays the action named for the branch that holds (none named: nothing happens). It fails when that
   *  action is missing, or when conditionals are nested more than eight deep. */
  let conditionalDepth = 0;
  async function conditionalStep(s: Extract<ActionStep, { kind: 'conditional' }>): Promise<boolean | 'stopped'> { return playNamed(conditionHolds(s.test) ? s.then : s.else); }
  /** Plays the action called `name` inside the one that is playing (a nested Play Action step, or a conditional's branch). */
  async function playNamed(name: string): Promise<boolean | 'stopped'> {
    if (!name) return true;
    const target = actions.list.find((a) => a.name === name);
    if (!target || conditionalDepth >= 8) return false;
    conditionalDepth++;
    try {
      const r = await actions.play(target, (x) => runStep(x, !!target.relative));
      return r.stopped ? 'stopped' : r.failed === null;
    } finally { conditionalDepth--; }
  }

  /** One recorded step on the current document: a command through the registry, a filter with its settings, or a
   *  size change through the engine. False when it cannot run here. */
  async function runStep(s: ActionStep, relative = false): Promise<boolean | 'stopped'> {
    if (s.kind === 'stop') return (await dialogs.stop.ask(s.message, s.allowContinue)) ? true : 'stopped';
    if (s.kind === 'command') return commands.run(s.id);
    if (s.kind === 'save') {
      replayingSave = true;
      try { await exportImage(s.format, s.quality); } finally { replayingSave = false; }
      return true;
    }
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
    if (s.kind === 'layerProps') {
      if (s.create && !(await commands.run('new-layer'))) return false;
      const l = engine.current?.activeLayer;
      if (!l) return false;
      if (s.name !== undefined) engine.renameLayer(l.id, s.name);
      if (s.opacity !== undefined) engine.setOpacity(s.opacity / 100);
      if (s.visible !== undefined && l.visible !== s.visible) engine.toggleVisibility(l.id);
      if (s.blend !== undefined) engine.setBlend(s.blend);
      if (s.fill !== undefined) engine.setFill(s.fill / 100);
      return true;
    }
    if (s.kind === 'selectLayer') {
      const hit = engine.current?.doc.layers.find((x) => x.name === s.name);
      if (!hit) return false;
      engine.selectLayer(hit.id);
      return true;
    }
    if (s.kind === 'adjustment') return dialogs.adjust.applySettings(s.adj as AdjustmentKind, s.data as Parameters<typeof dialogs.adjust.applySettings>[1], s.layer);
    if (s.kind === 'fitImage') return engine.fitImage(s.w, s.h, s.enlarge, true);
    if (s.kind === 'conditionalMode') return conditionalMode(s.from, s.to);
    if (s.kind === 'conditional') return conditionalStep(s);
    if (s.kind === 'play') return playNamed(s.name);
    if (s.kind === 'menu') {
      const c = commands.get(s.id);
      if (!c || s.id === 'play-action' || !commands.enabled(c)) return false;
      await c.run();
      return true;
    }
    if (s.kind === 'unsupported') return true;
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

  async function playAction(x: Action, from = 0): Promise<void> {
    if (!engine.current) { toast('Open a document to play an action on.'); return; }
    engine.settle();
    const r = await actions.play(x, (s) => runStep(s, !!x.relative), from);
    if (r.stopped) toast(`"${x.name}" stopped at step ${r.done + 1}.`);
    else if (r.failed) toast(`"${x.name}" stopped at step ${r.done + 1}, ${r.failed}, which could not run here.`, 'error');
    else toast(`Played "${x.name}", ${r.done} step${r.done === 1 ? '' : 's'}.`);
  }

  /** Batch: each file opens as a document, plays the action, is exported and closed; the results download as one zip. */
  async function runBatch(x: Action, files: File[], format: import('./ui/panels/actions-dialogs').BatchFormat, quality: number, template = '{name}', serial = 1, folder: FileSystemDirectoryHandle | null = null): Promise<void> {
    await engine.task(async () => {
      const out: Array<{ name: string; blob: Blob }> = [], problems: string[] = [], used = new Set<string>();
      let count = 0;
      for (const f of files) {
        try {
          const p = engine.openImage(await decodeImage(f, f.name));
          const r = await actions.play(x, (s) => (s.kind === 'save' ? true : runStep(s, !!x.relative)));
          if (r.stopped) { engine.closeProject(p.id); problems.push(`stopped at ${f.name}`); break; }
          if (r.failed) problems.push(`${f.name} stopped at ${r.failed}`);
          engine.settle();
          let blob: Blob | null;
          if (format === 'psd') {
            const flat = engine.flattened();
            blob = flat ? new Blob([(await writePsdFile(p.doc, flat, false, engine.pathsOf(p), loadExportPrefs().maximizePsd)).bytes], { type: 'image/vnd.adobe.photoshop' }) : null;
          } else if (format === 'tiff') {
            const png = await engine.exportBlob('image/png');
            blob = png ? await withXmp(await api.encode(png, 'tiff', 100, p.doc.resolution ?? 72), 'tiff', p.doc.meta) : null;
          } else blob = await engine.exportBlob(format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg', quality);
          const base = batchName(template, f.name.replace(/\.[^.]+$/, '') || 'image', serial + count++), ext = format === 'tiff' ? 'tif' : format;
          let name = `${base}.${ext}`;
          for (let k = 2; used.has(name); k++) name = `${base} ${k}.${ext}`;
          used.add(name);
          if (blob) out.push({ name, blob });
          engine.closeProject(p.id);
        } catch (err) { problems.push(`${f.name}: ${message(err)}`); }
      }
      if (out.length) { if (folder) await writeFolder(folder, out); else await deliver(await zipFiles(out), `${x.name} batch.zip`); }
      if (problems.length) toast(`Batch finished ${out.length} of ${files.length}. ${problems.join('. ')}.`, 'error');
      else toast(`Batch finished all ${files.length} image${files.length === 1 ? '' : 's'}.`);
    });
  }

  /** File > Automate > Lens Correction: each file opens, takes the Lens Correction settings, and is saved as its own type
   *  (or PNG or JPEG); the results download as one zip. */
  async function runLensBatch(o: LensBatchOptions, files: File[]): Promise<void> {
    await engine.task(async () => {
      const out: Array<{ name: string; blob: Blob }> = [], problems: string[] = [], used = new Set<string>();
      for (const f of files) {
        try {
          const p = engine.openImage(await decodeImage(f, f.name));
          const done = await dialogs.filter.applySettings('lensCorrection', { distortion: o.distortion, lensFix: structuredClone(o.lensFix) });
          if (!done) { problems.push(`${f.name} could not be corrected`); engine.closeProject(p.id); continue; }
          engine.settle();
          const jpg = o.format === 'jpg' || (o.format === 'same' && /\.jpe?g$/i.test(f.name));
          const blob = await engine.exportBlob(jpg ? 'image/jpeg' : 'image/png', o.quality / 100);
          const base = f.name.replace(/\.[^.]+$/, '') || 'image', ext = jpg ? 'jpg' : 'png';
          let name = `${base}.${ext}`;
          for (let k = 2; used.has(name); k++) name = `${base} ${k}.${ext}`;
          used.add(name);
          if (blob) out.push({ name, blob });
          engine.closeProject(p.id);
        } catch (err) { problems.push(`${f.name}: ${message(err)}`); }
      }
      if (out.length) { if (o.out) await writeFolder(o.out, out); else await deliver(await zipFiles(out), 'Lens Correction batch.zip'); }
      if (problems.length) toast(`Lens Correction finished ${out.length} of ${files.length}. ${problems.join('. ')}.`, 'error');
      else toast(`Lens Correction finished all ${files.length} image${files.length === 1 ? '' : 's'}.`);
    });
  }

  /** File > Scripts > Image Processor (DEV_PLAN 30.2): each source (chosen files, or a flattened copy of every open image)
   *  is opened afresh for each ticked type, plays the action, takes the copyright notice, is fitted and encoded, and goes
   *  into JPEG/, PSD/ or TIFF/ in one zip (browser) or in a named folder of the exports (desktop). */
  async function imageProcessor(o: ImageProcessorOptions): Promise<void> {
    const sources: File[] = [];
    if (o.useOpen) {
      const keep = engine.current?.id;
      for (const q of [...engine.projects]) {
        engine.switchTo(q.id);
        engine.settle();
        const flat = engine.flattened();
        if (flat) sources.push(new File([await toBlob(flat, 'image/png')], `${stripExt(q.name)}.png`, { type: 'image/png' }));
      }
      if (keep) engine.switchTo(keep);
    } else sources.push(...o.files);
    if (!sources.length) { toast('Choose images, or open some and tick Use Open Images.', 'info'); return; }
    const jobs: Array<{ dir: string; ext: string; fit: ImageProcessorOptions['psd']; make: () => Promise<Blob | null> }> = [];
    const here = (): NonNullable<typeof engine.current> => engine.current as NonNullable<typeof engine.current>;
    if (o.jpeg.on) jobs.push({ dir: 'JPEG', ext: 'jpg', fit: o.jpeg, make: async () => {
      const jpg = await engine.exportBlob('image/jpeg', Math.round((o.jpeg.quality * 100) / 12) / 100);
      if (!jpg) return null;
      const tagged = o.jpeg.srgb ? (await import('./io/embed-icc')).embedJpeg(jpg, (await import('./engine/icc')).iccProfile('srgb')) : jpg;
      return withXmp(await tagged, 'jpg', here().doc.meta);
    } });
    if (o.psd.on) jobs.push({ dir: 'PSD', ext: 'psd', fit: o.psd, make: async () => {
      const flat = engine.flattened();
      if (!flat) return null;
      const { bytes } = await writePsdFile(here().doc, flat, false, engine.pathsOf(here()), loadExportPrefs().maximizePsd);
      return new Blob([bytes], { type: 'image/vnd.adobe.photoshop' });
    } });
    if (o.tiff.on) jobs.push({ dir: 'TIFF', ext: 'tif', fit: o.tiff, make: async () => {
      const png = await engine.exportBlob('image/png');
      return png ? withXmp(await api.encode(png, 'tiff', 100, here().doc.resolution ?? 72), 'tiff', here().doc.meta) : null;   // the engine's TIFF is LZW-compressed; the LZW box is kept for the dialog's sake
    } });
    if (o.png.on) jobs.push({ dir: 'PNG', ext: 'png', fit: o.png, make: async () => {
      const png = await engine.exportBlob('image/png');
      return png ? withXmp(png, 'png', here().doc.meta) : null;
    } });
    if (o.webp.on) jobs.push({ dir: 'WebP', ext: 'webp', fit: o.webp, make: async () => {
      const webp = await engine.exportBlob('image/webp', o.webp.quality / 100);
      return webp ? withXmp(webp, 'webp', here().doc.meta) : null;
    } });
    if (o.tga.on) jobs.push({ dir: 'TGA', ext: 'tga', fit: o.tga, make: async () => {
      const png = await engine.exportBlob('image/png');
      return png ? api.encode(png, 'tga', 100, here().doc.resolution ?? 72, null, { bits: o.tga.option.startsWith('24') ? 24 : 32, rle: o.tga.option.endsWith('rle') }) : null;
    } });
    if (o.dpx.on) jobs.push({ dir: 'DPX', ext: 'dpx', fit: o.dpx, make: () => dpxBlob(engine, { format: 'dpx', quality: 100, scale: 100, dpxBits: o.dpx.bits, dpxTransfer: 'log' }) });
    await engine.task(async () => {
      const out: Array<{ dir: string; name: string; blob: Blob }> = [], problems: string[] = [], used = new Set<string>();
      outer: for (const f of sources) for (const j of jobs) {
        let id = '';
        try {
          const p = engine.openImage(await decodeImage(f, f.name));
          id = p.id;
          if (o.action) {
            const r = await actions.play(o.action, (s) => (s.kind === 'save' ? true : runStep(s, !!o.action?.relative)));
            if (r.stopped) { problems.push(`stopped at ${f.name}`); break outer; }
            if (r.failed) problems.push(`${f.name} stopped at ${r.failed}`);
          }
          if (o.copyright) engine.setMeta({ notice: o.copyright });
          if (j.fit.on) engine.fitImage(j.fit.w, j.fit.h, false, true);
          engine.settle();
          const blob = await j.make();
          const base = f.name.replace(/\.[^.]+$/, '') || 'image';
          let name = `${base}.${j.ext}`;
          for (let k = 2; used.has(`${j.dir}/${name}`); k++) name = `${base} ${k}.${j.ext}`;
          used.add(`${j.dir}/${name}`);
          if (blob) out.push({ dir: j.dir, name, blob });
        } catch (err) { problems.push(`${f.name}: ${message(err)}`); } finally { if (id) engine.closeProject(id); }
      }
      if (out.length) {
        if (o.out) await writeFolder(o.out, out);
        else if (caps?.desktop) { for (const f of out) await api.exportFile(f.blob, f.name, `Image Processor ${f.dir}`); }   // one folder level: the export route refuses separators
        else await deliver(await zipFiles(out.map((f) => ({ name: `${f.dir}/${f.name}`, blob: f.blob }))), 'Image Processor.zip');
      }
      if (problems.length) toast(`Image Processor wrote ${out.length} file${out.length === 1 ? '' : 's'}. ${problems.join('. ')}.`, 'error');
      else toast(`Image Processor wrote ${out.length} file${out.length === 1 ? '' : 's'} from ${sources.length} image${sources.length === 1 ? '' : 's'}.`);
    });
  }

  /** File > Export GIF: every frame of the timeline at full size, or the image as it stands when there are no frames. */
  /** File > Export > Video (MP4) (1.58.9, L1): each frame of the animation (or the picture, without one) drawn over
   *  white (video keeps no transparency) and written by the engine's ffmpeg as H.264, each frame for its delay. */
  async function exportMp4(): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        // A video timeline (1.59.2): its work area, each frame at its frame rate; else the frame animation's frames.
        const t = engine.timeline, vt = engine.video, pngs: Blob[] = [], delays: number[] = [];
        const frames: Array<{ render: () => ReturnType<typeof engine.renderFrame>; delay: number }> = vt
          ? Array.from({ length: Math.max(0, vt.workOut - vt.workIn) }, (_, i) => ({ render: () => engine.renderVideoFrame(vt.workIn + i), delay: Math.round(1000 / vt.fps) }))
          : (t.frames.length ? t.frames : [null]).map((f) => ({ render: () => engine.renderFrame(f), delay: f?.delay ?? 0 }));
        for (const f of frames) {
          const s = f.render();
          if (!s) return;
          const flat = createSurface(p.doc.width, p.doc.height), c = ctxOf(flat);
          c.fillStyle = '#ffffff'; c.fillRect(0, 0, p.doc.width, p.doc.height); c.drawImage(s as CanvasImageSource, 0, 0);
          pngs.push(await toBlob(flat, 'image/png'));
          delays.push(f?.delay ?? 0);
          await new Promise((r) => window.setTimeout(r, 0));
        }
        await deliver(await api.encodeVideo(pngs, delays, vt ? vt.fps : 0), `${p.name}.mp4`);
        toast(pngs.length > 1 ? `Exported ${pngs.length} frames as an MP4.` : 'Exported as an MP4.');
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** File > Export > Render Video (1.59.6, DEV_PLAN 25.4): the video timeline's frames `from` to `to` (excluded), scaled,
   *  as an H.264 MP4 (over white), a GIF (formvis's encoder) or numbered PNGs in a zip; each frame lasts 1/fps. */
  async function renderVideo(c: RenderChoice): Promise<void> {
    const p = engine.current, out = await renderVideoBlob(c);
    if (!p || !out) return;
    const base = (p.name || 'Untitled').replace(/\.[^.]+$/, '');
    await deliver(out, c.format === 'gif' ? `${base}.gif` : c.format === 'mp4' ? `${base}.mp4` : `${base}-frames.zip`);
    toast(`Rendered ${c.to - c.from} frames.`);
  }

  /** The rendered file itself (1.59.7), which Render Video delivers and the MCP tool timeline_render writes. */
  async function renderVideoBlob(c: RenderChoice, step?: (done: number, total: number) => Promise<boolean> | boolean): Promise<Blob | null> {
    const p = engine.current, vt = engine.video;
    if (!p || !vt) return null;
    const w = Math.max(1, Math.round(p.doc.width * c.scale)), h = Math.max(1, Math.round(p.doc.height * c.scale)), delay = Math.round(1000 / vt.fps);
    const pngs: Blob[] = [], gif: GifFrame[] = [];
    for (let f = c.from; f < c.to; f++) {
      const s = engine.renderVideoFrame(f);
      if (!s) return null;
      const flat = createSurface(w, h), g = ctxOf(flat);
      g.imageSmoothingQuality = 'high';
      if (c.format === 'mp4' || c.format === 'jpg') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); }
      g.drawImage(s as CanvasImageSource, 0, 0, w, h);
      if (c.format === 'gif') gif.push({ data: g.getImageData(0, 0, w, h), delayMs: delay });
      else if (c.format === 'jpg' || c.format === 'webp') pngs.push(await toBlob(flat, c.format === 'jpg' ? 'image/jpeg' : 'image/webp', 0.92));
      else pngs.push(await toBlob(flat, 'image/png'));
      await new Promise((r) => window.setTimeout(r, 0));
      if (step && (await step(f - c.from + 1, c.to - c.from)) === false) return null;
    }
    const base = (p.name || 'Untitled').replace(/\.[^.]+$/, '');
    if (c.format === 'gif') return new Blob([encodeGif(gif, w, h, vt.loops)], { type: 'image/gif' });
    if (c.format === 'jpg' || c.format === 'webp') return zipFiles(pngs.map((blob, i) => ({ name: `${base}_${String(c.from + i).padStart(5, '0')}.${c.format}`, blob })));
    if (c.format === 'png') return api.videoSequence(pngs, base);
    return api.encodeVideo(pngs, pngs.map(() => delay), vt.fps);
  }

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
    let list: Array<{ id: string; name: string; png: string; group?: string }> = [];
    try { list = JSON.parse(localStorage.getItem(PATTERN_KEY) ?? '[]'); } catch { list = []; }
    for (const p of Array.isArray(list) ? list : []) {
      if (typeof p?.id !== 'string' || typeof p.png !== 'string' || patternById(p.id)) continue;
      try {
        const bmp = await createImageBitmap(await (await fetch(p.png)).blob()), s = createSurface(bmp.width, bmp.height);
        ctxOf(s).drawImage(bmp, 0, 0);
        addPattern(typeof p.name === 'string' ? p.name : 'Pattern', s, p.id);
        if (typeof p.group === 'string') setPatternGroup(p.id, p.group);
      } catch { /* skip an unreadable pattern */ }
    }
  }
  async function savePatterns(): Promise<boolean> {
    const list: Array<{ id: string; name: string; png: string; group?: string }> = [];
    for (const p of allPatterns()) {
      if (p.builtin || projectPatterns.has(p.id)) continue;
      const blob = await toBlob(p.surface), png = await new Promise<string>((done) => { const r = new FileReader(); r.onload = () => done(String(r.result)); r.readAsDataURL(blob); });
      list.push({ id: p.id, name: p.name, png, ...(p.group ? { group: p.group } : {}) });
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
    engine.emit('options', null);
    if (await savePatterns()) toast(`Defined the pattern "${name}". Choose it in Layer Style > Pattern Overlay.`);
    else toast(`Defined "${name}" for this session; the pattern library is full, so it will not be kept.`, 'error');
  }

  /** The brush as the set-brush command reads it back: percent for hardness, opacity and flow, as the options bar shows them. */
  function brushState(): Record<string, unknown> {
    const b = engine.brush, s = engine.brushShape;
    return {
      size: b.diameter, hardness: Math.round(b.hardness * 100), opacity: Math.round(b.opacity * 100), flow: Math.round(engine.brushFlow * 100), mode: engine.brushBlend, preset: engine.brushPresetId, sampled_tip: !!b.tip,
      angle: s.angle, roundness: s.roundness, spacing: s.spacing ?? 25, size_jitter: s.sizeJitter, angle_jitter: s.angleJitter, roundness_jitter: s.roundnessJitter, scatter: s.scatter, both_axes: s.bothAxes, count: s.count, count_jitter: s.countJitter,
      flip_x: !!s.flipX, flip_y: !!s.flipY, noise: s.noise, wet_edges: s.wetEdges, texture: { on: s.texture.on, scale: s.texture.scale, depth: s.texture.depth }, dual: { on: s.dual.on, size: s.dual.diameter, scatter: s.dual.scatter, count: s.dual.count },
      color_dynamics: { on: s.color.on, fg_bg: s.color.fgBg, hue: s.color.hue, saturation: s.color.saturation, brightness: s.color.brightness }, transfer: { on: s.transfer.on, opacity: s.transfer.opacity, flow: s.transfer.flow },
    };
  }

  /** Edit > Define Brush Preset: the visible image within the selection, or the whole canvas, up to 2500 px a side, as a
   *  sampled tip where dark paints (coverage = (255 - luminance) * alpha / 255). */
  async function defineBrush(): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    const flat = engine.flattened();
    if (!flat) return;
    const sel = p.selection, x = sel ? Math.max(0, Math.floor(sel.x)) : 0, y = sel ? Math.max(0, Math.floor(sel.y)) : 0;
    const w = Math.min(flat.width - x, sel ? Math.ceil(sel.w) : flat.width), h = Math.min(flat.height - y, sel ? Math.ceil(sel.h) : flat.height);
    if (w < 1 || h < 1) return;
    if (w > 2500 || h > 2500) { toast('A brush tip can be at most 2500 by 2500 pixels. Select a smaller area first.', 'error'); return; }
    const s = createSurface(w, h);
    ctxOf(s).drawImage(flat as CanvasImageSource, -x, -y);
    const px = ctxOf(s).getImageData(0, 0, w, h).data, data = new Uint8Array(w * h);
    for (let i = 0; i < data.length; i++) {
      const lum = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      data[i] = Math.round(((255 - lum) * px[i * 4 + 3]) / 255);
    }
    let n = 1;
    while (importedBrushPresets.some((q) => q.name === `Sampled Brush ${n}`)) n += 1;
    const name = await promptName('Define Brush Preset', `Sampled Brush ${n}`, 'OK');
    if (!name) return;
    const r = await addSampledBrush(engine, name, { w, h, data });
    engine.emit('options', null);
    if (r.kept) toast(`Defined the brush "${name}". It is selected in the Brush tool's presets.`);
    else toast(`Defined "${name}" for this session; the brush library could not be saved, so it will not be kept.`, 'error');
  }

  /** Edit > Define Custom Shape: the current path, fitted to the shape box and added to the Shape tool's list. */
  async function defineCustomShape(): Promise<void> {
    const vp = engine.workPath;
    if (!vp || !vp.subpaths.some((sp) => sp.anchors.length > 1)) { toast('Draw a path first, then define it as a custom shape.', 'error'); return; }
    let n = 1;
    while (allCustomShapes().some((q) => q.label === `Custom Shape ${n}`)) n += 1;
    const name = await promptName('Define Custom Shape', `Custom Shape ${n}`, 'OK');
    if (!name) return;
    addCustomShape(name, vp);
    engine.emit('options', null);
    toast(`Defined the custom shape "${name}". Choose it in the Shape tool's Custom shape list.`);
  }

  /** Edit > Import Patterns: .pat files (several at once), each pattern joining the library. */
  function importPatterns(): void {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.pat'; input.multiple = true;
    input.addEventListener('change', () => void (async () => {
      let added = 0;
      for (const f of Array.from(input.files ?? [])) {
        try {
          for (const pt of readPat(new Uint8Array(await f.arrayBuffer()))) {
            const s = createSurface(pt.width, pt.height);
            ctxOf(s).putImageData(new ImageData(pt.rgba as Uint8ClampedArray<ArrayBuffer>, pt.width, pt.height), 0, 0);
            addPattern(pt.name, s);
            added += 1;
          }
        } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
      }
      if (!added) return;
      const kept = await savePatterns();
      toast(`${added === 1 ? 'Imported one pattern' : `Imported ${added} patterns`}.${kept ? '' : ' The pattern library is full, so they will not be kept.'}`, kept ? 'info' : 'error');
    })());
    input.click();
  }

  /** Edit > Export Patterns: every pattern you defined or imported, in one .pat file. */
  async function exportPatterns(): Promise<void> {
    const mine = allPatterns().filter((q) => !q.builtin);
    if (!mine.length) { toast('There are no patterns of your own to export. Define one with Edit > Define Pattern first.', 'info'); return; }
    try {
      const list = mine.map((q) => {
        const w = q.surface.width, h = q.surface.height;
        return { name: q.name, width: w, height: h, rgba: ctxOf(q.surface).getImageData(0, 0, w, h).data };
      });
      await deliver(new Blob([writePat(list) as BlobPart], { type: 'application/octet-stream' }), 'Patterns.pat');
    } catch (err) { toast(message(err), 'error'); }
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

  /** File > Export > Layers to Files and Artboards to Files (29.1): each layer or artboard alone, with its effects and
   *  mask applied, as prefix_NNNN_name files; in the desktop app written into a folder under the exports folder by the
   *  engine, in the browser handed over as one zip. */
  async function exportLayerFiles(set: LayerExportSettings): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const { files, skipped } = set.comps ? { files: await layerCompFiles(engine, set, !!caps, set.ids ?? []), skipped: 0 } : await layerFiles(engine, set, !!caps);
        if (!files.length) { toast(set.comps ? 'There are no layer comps to export.' : set.artboards ? 'There are no artboards to export.' : 'There are no layers to export.', 'info'); return; }
        const what = set.comps ? 'comp' : set.artboards ? 'artboard' : 'layer', n = `${files.length} ${what}${files.length === 1 ? '' : 's'}`, left = skipped ? ` (${skipped} with nothing to write skipped)` : '';
        const loss = layerFileLoss(set.format, set.icc), lossNote = loss ? ` ${loss}` : '';
        if (caps?.desktop) {
          const folder = set.folder.trim() || `${stripExt(p.name)} ${what}s`;
          let where = '';
          for (const f of files) where = await api.exportFile(f.blob, f.name, folder);
          toast(`Exported ${n}${left} to ${where.replace(/[\\/][^\\/]*$/, '')}.${lossNote}`, 'info');
          return;
        }
        if (set.dir) {
          await writeFolder(set.dir, files);
          toast(`Exported ${n}${left} into ${set.dir.name}.${lossNote}`, 'info');
          return;
        }
        await deliver(await zipFiles(files), `${stripExt(p.name)} ${what}s.zip`);
        toast(`Exported ${n}${left} as a zip.${lossNote}`, 'info');
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** File > Export > Artboards to PDF (29.4): one page per artboard in the Layers order, each at its own size from the
   *  document resolution, built by the engine's /io/pdf-pages. */
  async function exportArtboardsPdf(set: ArtboardPdfSettings): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const pages: Blob[] = [];
        for (const b of engine.artboards(p)) { const img = engine.artboardImage(b.id, set.contentsOnly); if (img) pages.push(await toBlob(img)); }
        if (!pages.length) { toast('There are no artboards to export.', 'info'); return; }
        const own = p.doc.profile, pdf = await api.pdfPages(pages, p.doc.resolution ?? 72, set.jpeg, set.quality, set.icc && own ? fromBase64(own.icc) : null);
        await deliver(pdf, `${set.name.replace(/\.pdf$/i, '') || stripExt(p.name)}.pdf`);
        toast(`Exported ${pages.length} artboard${pages.length === 1 ? '' : 's'} as one PDF.`, 'info');
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** File Info from a person (the dialog) or an agent (any parameter given sets those fields at once, as one step). */
  const TYPE_SHAPE_PARAMS_CIRCLE: Record<string, CommandParam> = {
    text: { type: 'string', description: 'The text to set on the circle; leave out to be asked.' },
    radius: { type: 'number', min: 1, max: 100000, description: 'Radius in pixels; a third of the smaller side when left out.' },
    offset: { type: 'number', min: 0, max: 100, description: 'Start offset in percent along the curve; 0 when left out.' },
  };
  const TYPE_SHAPE_PARAMS_ARC: Record<string, CommandParam> = {
    ...TYPE_SHAPE_PARAMS_CIRCLE,
    text: { type: 'string', description: 'The text to set on the arc; leave out to be asked.' },
    sweep: { type: 'number', min: 1, max: 360, description: 'Arc sweep in degrees; 180 when left out.' },
  };
  function typeOnShapeRun(kind: 'arc' | 'circle', a?: Record<string, unknown>): void {
    const p = engine.current;
    if (!p) return;
    if (typeof a?.text !== 'string') { dialogs.typeOnShape.show(kind); return; }
    const c = engine.shapeCentre();
    if (!c) return;
    const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const sweep = kind === 'circle' ? 360 : num(a.sweep, 180);
    void engine.createTextOnShape(a.text, { kind, cx: c.x, cy: c.y, r: num(a.radius, Math.min(p.doc.width, p.doc.height) / 3), start: -sweep / 2, sweep }, num(a.offset, 0));
  }
  const FILE_INFO_PARAMS: Record<string, CommandParam> = {
    title: { type: 'string', description: 'Document Title. A single space clears the field.' },
    author: { type: 'string', description: 'Author. A single space clears the field.' },
    author_title: { type: 'string', description: 'Author Title (the author\'s position). A single space clears the field.' },
    description: { type: 'string', description: 'Description. A single space clears the field.' },
    rating: { type: 'integer', min: 0, max: 5, description: 'Rating in stars, 0 for none.' },
    description_writer: { type: 'string', description: 'Description Writer. A single space clears the field.' },
    keywords: { type: 'string', description: 'Keywords separated by commas or semicolons; replaces the list. A single space clears it.' },
    copyright_status: { type: 'string', enum: ['unknown', 'copyrighted', 'public_domain'], description: 'Copyright Status; copyrighted puts the copyright symbol before the title in the document tab.' },
    copyright_notice: { type: 'string', description: 'Copyright Notice. A single space clears the field.' },
    copyright_url: { type: 'string', description: 'Copyright Info URL. A single space clears the field.' },
    custom: { type: 'string', description: 'Free-form text fields, one per line as "key: value"; replaces the list. A single space clears it.' },
  };
  function fileInfoRun(a?: Record<string, unknown>): unknown {
    if (!a || !Object.keys(a).length) { dialogs.fileInfo.show(); return undefined; }
    const text = (k: string): string | undefined => (a[k] === undefined ? undefined : String(a[k]));
    const status = text('copyright_status');
    const changed = engine.setMeta({
      title: text('title'), author: text('author'), authorTitle: text('author_title'), description: text('description'), descriptionWriter: text('description_writer'),
      keywords: text('keywords'), custom: text('custom'), notice: text('copyright_notice'), url: text('copyright_url'), rating: a.rating === undefined ? undefined : Number(a.rating),
      copyright: status === undefined ? undefined : status === 'public_domain' ? 'public' : status === 'copyrighted' ? 'copyrighted' : 'unknown',
    });
    const m = engine.current?.doc.meta;
    return { changed, title: m?.title ?? '', author: m?.author ?? '', rating: m?.rating ?? 0, keywords: [...(m?.keywords ?? [])], copyright_status: m?.copyright === 'public' ? 'public_domain' : m?.copyright ?? 'unknown' };
  }

  /** Layers to Files from a person (the dialog) or an agent (any parameter given runs it at once). */
  const LAYER_EXPORT_PARAMS: Record<string, CommandParam> = {
    prefix: { type: 'string', description: 'File name prefix; the document name when left out.' },
    format: { type: 'string', enum: ['png', 'jpg', 'tiff', 'tiff-layers', 'webp', 'psd', 'bmp', 'tga', 'dpx'], description: 'File type; png when left out. tiff-layers writes each file as a TIFF holding that one layer in its layer block.' },
    quality: { type: 'integer', min: 1, max: 100, description: 'JPEG and WebP quality.' },
    tga_bits: { type: 'integer', enum: [24, 32], description: 'TGA bits per pixel; 32 when left out.' },
    dpx_bits: { type: 'integer', enum: [8, 10, 12, 16], description: 'DPX bits per channel; 10 when left out.' },
    visible_only: { type: 'boolean', description: 'Only layers that are shown; true when left out. Layers only.' },
    trim: { type: 'boolean', description: 'Cut each layer to its visible pixels. Layers only.' },
    icc: { type: 'boolean', description: 'Embed the ICC profile; true when left out.' },
    folder: { type: 'string', description: 'Desktop app: the folder made inside the exports folder.' },
    selected_only: { type: 'boolean', description: 'Only the selected layers (the active one when none is selected). Layers only.' },
    names: { type: 'string', description: 'Only these artboards, their names separated by commas; every artboard when left out. Artboards only.' },
  };
  function layerExportRun(artboards: boolean, a?: Record<string, unknown>, comps = false): void {
    if (!a || !Object.keys(a).length) { dialogs.layerExport.show(artboards, comps); return; }
    const d = DEFAULT_LAYER_EXPORT, f = String(a.format ?? d.format) as LayerExportSettings['format'];
    void exportLayerFiles({ artboards, comps, prefix: String(a.prefix ?? ''), format: ['png', 'jpg', 'tiff', 'tiff-layers', 'webp', 'psd', 'bmp', 'tga', 'dpx'].includes(f) ? f : d.format, quality: Number(a.quality ?? d.quality), ...(Number(a.tga_bits) === 24 ? { tgaBits: 24 as const } : {}), ...([8, 10, 12, 16].includes(Number(a.dpx_bits)) ? { dpxBits: Number(a.dpx_bits) as 8 | 10 | 12 | 16 } : {}), visibleOnly: a.visible_only === undefined ? d.visibleOnly : a.visible_only === true, trim: a.trim === true, icc: a.icc === undefined ? d.icc : a.icc === true, folder: String(a.folder ?? ''), ...(a.selected_only === true && !artboards && !comps ? { ids: (() => { const c = engine.current; const ids = c ? (c.selectedIds.size ? [...c.selectedIds] : c.activeId ? [c.activeId] : []) : []; return ids.length ? ids : ['none']; })() } : {}), ...(artboards && typeof a.names === 'string' && a.names.trim() ? { ids: (() => { const want = a.names.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean), ids = engine.artboards().filter((b) => want.includes(b.name.toLowerCase())).map((b) => b.id); return ids.length ? ids : ['none']; })() } : {}) });
  }

  /** File > Export > OpenRaster (1.51.7): layers, groups, positions, opacity, visibility and blend modes, for any
   *  painting app that reads the open format. */
  /** File > Export > Assemble Tiles (1.52.7): the open tiles of a large picture, each as it looks now, put back together
   *  by the engine into one full-size PNG, strip by strip, downloaded straight from it (never held in this page). */
  async function assembleTiles(): Promise<void> {
    const tiles = engine.projects.filter((p) => p.tile);
    if (!tiles.length) { toast('No tiles are open: open a large picture as tiles first.', 'info'); return; }
    const source = engine.current?.tile?.source ?? (tiles[0].tile as NonNullable<typeof tiles[0]['tile']>).source;
    const mine = tiles.filter((p) => p.tile?.source === source), first = mine[0].tile as NonNullable<typeof mine[0]['tile']>, was = engine.current?.id;
    engine.settle();
    await engine.task(async () => {
      try {
        const parts: Array<{ name: string; blob: Blob }> = [], places: Array<{ x: number; y: number }> = [];
        for (const p of mine) {
          engine.switchTo(p.id);
          const c = engine.flattened();
          if (!c) continue;
          parts.push({ name: `${p.tile?.row}-${p.tile?.col}.png`, blob: await toBlob(c) });
          places.push({ x: p.tile?.x ?? 0, y: p.tile?.y ?? 0 });
        }
        if (was) engine.switchTo(was);
        const r = await api.largeAssemble(source, first.width, first.height, places, parts);
        const a = document.createElement('a');
        a.href = r.url; a.download = r.file;
        a.click();
        toast(`Assembled ${mine.length} tiles into ${r.file} (${first.width.toLocaleString()} by ${first.height.toLocaleString()}); it is also in formvis's data folder, under exports.`, 'info');
      } catch (err) { if (was) engine.switchTo(was); toast(message(err), 'error'); }
    });
  }

  async function exportOra(): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    await engine.task(async () => {
      try {
        const composite = engine.flattened();
        if (!composite) return;
        const { blob, notes } = await writeOra(p.doc, composite, (l) => (l.adjustment ? engine.renderThrough(l.id) : engine.renderLayerAlone(l.id)));
        await deliver(blob, `${p.name}.ora`);
        if (notes.length) toast(notes.join(' '), 'info');
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function exportPsd(psb = false): Promise<void> {
    const p = engine.current;
    if (!p) return;
    engine.settle();
    if (p.doc.mode === 'cmyk' && !psb) { await exportCmykPsd(); return; }
    if (p.doc.mode === 'lab' && !psb) { await exportLabPsd(); return; }
    // A PSD holds 30000 pixels a side and 2 GB; a larger document goes out as a PSB, which holds 300000 and 4 EB.
    const rasters = p.doc.layers.filter((l) => l.raster).length + 1;
    if (!psb && (p.doc.width > 30000 || p.doc.height > 30000 || p.doc.width * p.doc.height * 4 * rasters > 4e9)) { psb = true; toast('This document is too large for a PSD, so it is written as a PSB.', 'info'); }
    await engine.lockedTask(`Export ${psb ? 'PSB' : 'PSD'}`, async () => {
      try {
        if (p.doc.layers.some((l) => l.tiled) && engine.bandedExportable()) {   // a giant layered document is written in parts (SC-ED-0263)
          const job = engine.startJob(`Export ${psb ? 'PSB' : 'PSD'}`, 1);
          try {
            const out = await writePsdInParts(p.doc, psb, (put) => engine.renderBands((rows) => put(rows)), { step: (d, n) => engine.jobStep(job, d, n), stopped: () => job.cancelled });
            await deliver(out.blob, `${p.name}.${psb ? 'psb' : 'psd'}`);
            if (out.notes.length) toast(out.notes.join(' '), 'info');
          } finally { engine.endJob(job); }
          return;
        }
        const flat = engine.flattened();
        if (!flat) return;
        const { bytes, notes } = await writePsdFile(p.doc, flat, psb, engine.pathsOf(p), loadExportPrefs().maximizePsd, engine.quickMask ? p.selection : null);
        await deliver(new Blob([bytes], { type: 'image/vnd.adobe.photoshop' }), `${p.name}.${psb ? 'psb' : 'psd'}`);
        if (notes.length) toast(notes.join(' '), 'info');
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  /** `agent`: an agent's call (MCP remove_background), the mask applied at once rather than offered, failures thrown. */
  async function removeBackground(method: 'auto' | 'lite', agent = false): Promise<void> {
    const l = engine.activeLayer;
    if (!l?.raster || l.isGroup) { if (agent) throw new Error('The active layer has no pixels: choose a pixel layer with set_layer first.'); toast('Select a pixel layer first.'); return; }
    const raster = l.raster;
    await engine.task(async () => {
      try {
        const choice = mattingChoice(), file = choice && choice !== 'grabcut' ? choice : '';
        const { mask, method: used } = await subjectMask(await toBlob(raster.canvas), choice === 'grabcut' ? 'lite' : method, file);
        const bitmap = await createImageBitmap(mask);
        if (engine.activeLayer?.id !== l.id) { bitmap.close(); if (agent) throw new Error('The active layer changed before the mask was ready.'); return; }
        const by = used === 'file' ? file : used === 'ml' ? 'ML' : 'lightweight';
        if (agent) {
          if (!dialogs.background.applyNow(l.id, bitmap)) throw new Error('The mask was not applied: the Remove Background dialog is open in the formvis window. Close it, then retry.');
          toast(`Background removed with the ${by} engine.`);
          return;
        }
        dialogs.background.rerun = async (pick) => {
          try {
            const again = await subjectMask(await toBlob(raster.canvas), pick === 'grabcut' ? 'lite' : 'auto', pick && pick !== 'grabcut' ? pick : '');
            return await createImageBitmap(again.mask);
          } catch (err) { toast(message(err), 'error'); return null; }
        };
        dialogs.background.show(l.id, bitmap);
        toast(used === 'file' ? `Subject found with ${file}.` : `Subject found with the ${by} engine.`);
      } catch (err) {
        const bad = mattingChoice();
        if (bad && bad !== 'grabcut') { remembered('Remove Background', 'model', ''); if (agent) throw new Error(`${message(err)} The model choice is back to U2-Net; retry.`); toast(`${message(err)} The model choice is back to U2-Net.`, 'error'); return; }
        if (agent) throw err;
        toast(message(err), 'error');
      }
    });
  }

  /** Select > Subject: the visible image goes to the background engine and its subject mask comes back as the
   *  selection, one step. Select > Object in Selection does the same inside the current selection's bounds (draw a
   *  marquee around one object first), keeping only what falls inside that selection. */
  /** Remove People and Remove Distractions (1.57.4, M1): the area found on what the document shows (the engine's
   *  YuNet, SAM2 and U2-Net), filled with LaMa as one step; says so when nothing is found or a model is missing. */
  async function removeFound(kind: 'people' | 'distractions'): Promise<void> {
    const p = engine.current, flat = engine.flattened();
    if (!p || !flat) return;
    if (!(await modelReady('lama-inpaint'))) { toast('Remove fills with LaMa: download it in Preferences > Plugins > Local models.', 'error'); return; }
    await engine.task(async () => {
      try {
        const W = p.doc.width, H = p.doc.height, found = await createImageBitmap(await findToRemove(await toBlob(flat), kind));
        const s = createSurface(W, H), c = ctxOf(s); c.drawImage(found, 0, 0, W, H); found.close();
        const px = c.getImageData(0, 0, W, H).data, area = new Uint8Array(W * H);
        let n = 0; for (let i = 0; i < area.length; i++) if (px[i * 4] > 127) { area[i] = 255; n++; }
        if (!n) { toast(kind === 'people' ? 'No people to remove were found (the subject is kept).' : 'No distractions were found.'); return; }
        await engine.removeArea(new SelectionMask(0, 0, W, H, area), kind === 'people' ? 'Remove People' : 'Remove Distractions', localInpaint());
      } catch (err) { toast(message(err), 'error'); }
    });
  }
  engine.removeFinder = removeFound;
  let lamaWarmAt = 0;
  engine.warmRemove = () => {
    if (Date.now() - lamaWarmAt < 5 * 60_000) return;
    lamaWarmAt = Date.now();
    void warmLama().then((ok) => { engine.removeModelReady = ok; if (!ok) lamaWarmAt = Date.now() - 4.5 * 60_000; engine.emit('options', null); });
  };
  engine.removeBrushFill = async (area) => {
    if (!(await modelReady('lama-inpaint'))) { toast('LaMa is not downloaded (Preferences > Plugins > Local models), so Remove used the patch fill.'); engine.removeFillLocal(area); return; }
    await engine.task(async () => {
      try { await engine.removeArea(area, 'Remove', localInpaint()); } catch (err) { toast(message(err), 'error'); }
    });
  };

  /** Select > Sky (1.57.6, L5): the sky the engine's model finds in what the document shows, as the selection (soft at
   *  its edges), one step; says so when no sky is found or the model is missing. */
  async function selectSky(a?: Record<string, unknown>): Promise<void> {
    if (typeof a?.sampleAll === 'boolean') engine.setAutoSel({ sampleAll: a.sampleAll });
    if (typeof a?.sensitivity === 'number') engine.setAutoSel({ skySensitivity: Math.max(0, Math.min(100, a.sensitivity)) });
    if (typeof a?.softness === 'number') engine.setAutoSel({ skySoftness: Math.max(0, Math.min(250, a.softness)) });
    const p = engine.current, flat = engine.autoSelSource();
    if (!p || !flat) return;
    const quick = a?.method === 'quick' || (a?.method !== 'model' && !(await skyReady()));
    if (!quick && !(await skyReady())) {
      if (!(await confirmAction('Download the sky model?', 'Select > Sky needs the sky model (176 MB, MIT). It downloads once and runs on this computer. It can also be removed or reinstalled in Preferences > Plugins > Local models.', 'Download'))) return;
      toast('Downloading the sky model...');
      let failure = '';
      try { if (!(await installModel('skyseg', (text) => { failure = text; }))) { toast(`${failure || 'The sky model did not download.'} Try again from Preferences > Plugins > Local models.`, 'error'); dialogs.settings.show('Plugins'); return; } }
      catch { toast('The sky model could not start downloading. Is the engine running?', 'error'); return; }
      if (engine.current !== p) return;
    }
    await engine.task(async () => {
      try {
        const W = p.doc.width, H = p.doc.height, bitmap = await createImageBitmap(await skyMask(await toBlob(flat), quick));
        const s = createSurface(W, H), c = ctxOf(s); c.drawImage(bitmap, 0, 0, W, H); bitmap.close();
        const px = c.getImageData(0, 0, W, H).data, data = new Uint8Array(W * H);
        let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let i = 0; i < data.length; i++) {
          data[i] = px[i * 4];
          if (data[i] >= 128) { n++; const x = i % W, y = (i - x) / W; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
        }
        if (engine.current !== p) return;
        if (!n) { toast(quick ? 'No sky was found by the quick method.' : 'No sky was found.'); return; }
        engine.applyAutoSelection(0, 0, W, H, data, 'Select Sky', { mode: selectModeOf(a), sky: true });
        toast(`${quick ? 'Sky selected with the quick method (color and smoothness, no model; the sky model does better with sunsets and heavy cloud). ' : 'Sky selected. '}${(100 * n / (W * H)).toFixed(1)}% of the picture, from x ${x0} y ${y0} to x ${x1} y ${y1}.`);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  const AUTO_SELECT_PARAMS = {
    mode: { type: 'string' as const, enum: ['new', 'add', 'subtract', 'intersect'], description: 'How the found area combines with the selection; the options bar\'s Mode when left out (Object in Selection replaces).' },
    sampleAll: { type: 'boolean' as const, description: 'true looks at what the document shows, false at the active layer alone; the saved setting when left out.' },
  };

  /** The mode a Select command was asked for (new, add, subtract or intersect), else the options bar's. */
  function selectModeOf(a?: Record<string, unknown>): SelectionMode {
    const m = a?.mode === 'new' ? 'replace' : a?.mode;
    return m === 'replace' || m === 'add' || m === 'subtract' || m === 'intersect' ? m : engine.selectionMode;
  }

  async function selectSubject(withinSelection: boolean, a?: Record<string, unknown>): Promise<void> {
    if (typeof a?.sampleAll === 'boolean') engine.setAutoSel({ sampleAll: a.sampleAll });
    const p = engine.current;
    if (!p) return;
    const sel = p.selection, box = withinSelection && sel ? { x: sel.x, y: sel.y, w: sel.w, h: sel.h } : { x: 0, y: 0, w: p.doc.width, h: p.doc.height };
    if (withinSelection && !sel) { toast('Draw a selection around the object first.'); return; }
    const flat = engine.autoSelSource(), crop = createSurface(box.w, box.h);
    if (!flat) return;
    ctxOf(crop).drawImage(flat, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    await engine.task(async () => {
      try {
        const choice = mattingChoice();
        const { mask, method: used } = await subjectMask(await toBlob(crop), choice === 'grabcut' ? 'lite' : 'auto', choice && choice !== 'grabcut' ? choice : '');
        const bitmap = await createImageBitmap(mask), m = createSurface(box.w, box.h), c = ctxOf(m);
        c.drawImage(bitmap, 0, 0, box.w, box.h);
        bitmap.close();
        const px = c.getImageData(0, 0, box.w, box.h).data, data = new Uint8Array(box.w * box.h);
        for (let i = 0; i < data.length; i++) data[i] = withinSelection && sel && !sel.valueAt(box.x + (i % box.w), box.y + Math.floor(i / box.w)) ? 0 : px[i * 4];
        if (engine.current !== p) return;
        if (!data.some((v) => v >= 128)) { toast('No subject was found there.'); return; }
        engine.applyAutoSelection(box.x, box.y, box.w, box.h, data, withinSelection ? 'Select Object' : 'Select Subject', { mode: withinSelection && !a?.mode ? 'replace' : selectModeOf(a) });
        toast(`${withinSelection ? 'Object' : 'Subject'} selected with ${used === 'file' ? choice : `the ${used === 'ml' ? 'ML' : 'lightweight'} engine`}.`);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function maskAllObjects(): Promise<void> {
    const p = engine.current, l = p?.activeLayer, src = l ? engine.objectSource(l.id) : null;
    if (!p || !l || !src) return;
    await engine.task(async () => {
      try {
        const found = await api.findObjects(await toBlob(src));
        if (engine.current !== p) return;
        if (!found.objects.length) { toast('No objects were found in this layer.'); return; }
        const W = p.doc.width, H = p.doc.height, kx = W / found.width, ky = H / found.height, masks: ReturnType<typeof createSurface>[] = [];
        for (const o of found.objects) {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${o.mask}`)).blob()), s = createSurface(W, H), c = ctxOf(s);
          c.drawImage(bitmap, o.box[0] * kx, o.box[1] * ky, o.box[2] * kx, o.box[3] * ky);
          bitmap.close();
          const img = c.getImageData(0, 0, W, H), d = img.data;
          for (let i = 0; i < d.length; i += 4) { d[i + 3] = d[i]; d[i] = d[i + 1] = d[i + 2] = 255; }
          c.putImageData(img, 0, 0);
          masks.push(s);
        }
        engine.maskAllObjects(l.id, masks);
        toast(`${masks.length} ${masks.length === 1 ? 'object' : 'objects'} masked, each a folder to put adjustments in.`);
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

  /** The parent page's init state: a project (`manifest` and `files` of name and blob, as Save posts them) or a picture
   *  (`dataUrl` with an optional `name`) opens as a document. */
  async function openFromHost(state: unknown): Promise<void> {
    if (!state || typeof state !== 'object') return;
    const s = state as { name?: unknown; dataUrl?: unknown; manifest?: unknown; files?: unknown };
    const name = typeof s.name === 'string' && s.name ? s.name : 'Document';
    try {
      if (s.manifest && typeof s.manifest === 'object' && Array.isArray(s.files)) {
        const files = (s.files as Array<{ name?: unknown; blob?: unknown }>).filter((f): f is { name: string; blob: Blob } => !!f && typeof f.name === 'string' && f.blob instanceof Blob);
        const p = await reopen({ id: `host-${Date.now()}`, name, savedAt: Date.now(), manifest: s.manifest as Record<string, unknown>, files, modified: false }, name);
        if (p) engine.switchTo(p.id);
      } else if (typeof s.dataUrl === 'string' && s.dataUrl.startsWith('data:')) {
        const blob = await (await fetch(s.dataUrl)).blob();
        const ext = blob.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
        await importFiles([new File([blob], /\.[a-z0-9]{2,5}$/i.test(name) ? name : `${name}.${ext}`, { type: blob.type })], undefined, 'documents');
      }
    } catch (err) { toast(message(err), 'error'); }
  }

  /** What Save posts to the parent page: the project as manifest and files, or the flat picture when a layer is tiled. */
  async function postHostSave(): Promise<void> {
    const p = engine.current;
    if (!p) return;
    try {
      if (p.doc.layers.some((l) => l.tiled)) throw new Error('tiled');
      const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathsOf(p), engine.timelineFor(p));
      hostLink.save({ name: p.name, width: p.doc.width, height: p.doc.height, manifest, files });
    } catch {
      const blob = await engine.exportBlob('image/png');
      if (!blob) return;
      const dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
      hostLink.save({ name: p.name, width: p.doc.width, height: p.doc.height, dataUrl });
    }
  }

  /** Closes a document as Close Tab does, asking about unsaved changes unless `answer` already says (Close All's Apply
   *  to All, 1.65.8); true once it is closed. */
  async function requestClose(id: string, answer: 'save' | 'discard' | null = null): Promise<boolean> {
    if (saving.size) await savesDone(id);
    const p = engine.projects.find((x) => x.id === id);
    if (!p) return true;
    if (p.modified) {
      // As the target's Unsaved Changes: Save closes only once the save succeeds; Cancel keeps the document open.
      const choice = answer ?? await askSaveChanges(p.name);
      if (choice === 'cancel') return false;
      if (choice === 'save') {
        if (engine.current !== p) engine.switchTo(p.id);
        if (!(await save(false))) return false;
      }
    }
    await rememberClosed(p);
    engine.closeProject(id);
    return !engine.projects.includes(p);
  }

  /** The last few documents closed, kept whole in memory so File > Reopen Closed Tab brings one back as it was. */
  const closedTabs: RecoveryRecord[] = [];
  /** Next Document and Previous Document walk the tab strip, wrapping at the ends. */
  function stepDocument(by: number): void {
    const list = engine.projects, n = list.length;
    if (n < 2) return;
    const at = Math.max(0, list.findIndex((q) => q.id === engine.current?.id));
    engine.switchTo(list[(at + by + n) % n].id);
  }
  /** Window > Theme > Sync with System: follows the system's light or dark scheme while it is on. */
  const THEME_SYNC_KEY = 'formvis.themeSync';
  const systemScheme = window.matchMedia('(prefers-color-scheme: light)');
  function applySystemTheme(): void {
    if (stored(THEME_SYNC_KEY) !== '1') return;
    const current = readChoice().theme, isLight = !!THEMES[current]?.light;
    if (systemScheme.matches && !isLight) setTheme('light');
    else if (!systemScheme.matches && isLight) setTheme('studio');
  }
  // View > Snap and Snap To: remembered between sessions.
  const snapSave = (): void => { store('formvis.snap', JSON.stringify(snapOptions)); };
  const snapSet = (k: keyof typeof snapOptions, on: boolean): void => { snapOptions[k] = on; snapSave(); };
  try {
    const saved = JSON.parse(stored('formvis.snap') ?? 'null') as Partial<typeof snapOptions> | null;
    if (saved) for (const k of Object.keys(snapOptions) as (keyof typeof snapOptions)[]) if (typeof saved[k] === 'boolean') snapOptions[k] = saved[k] as boolean;
  } catch { /* the defaults: everything on */ }
  window.addEventListener('keydown', (e) => { if (e.key === 'Control') snapHold.off = true; });
  window.addEventListener('keyup', (e) => { if (e.key === 'Control') snapHold.off = false; });
  window.addEventListener('blur', () => { snapHold.off = false; });
  // The theme one step darker (-1) or lighter (1) by its background, or null at the end of the range.
  function themeStep(dir: 1 | -1): string | null {
    const lum = (id: string): number => { const h = (THEMES[id]?.vars['--bg-primary'] ?? '#000000').replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16) || 0; return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
    const ids = Object.keys(THEMES).sort((a, b) => lum(a) - lum(b) || a.localeCompare(b)), at = ids.indexOf(readChoice().theme);
    return at < 0 ? null : ids[at + dir] ?? null;
  }
  systemScheme.addEventListener('change', applySystemTheme);
  applySystemTheme();
  async function rememberClosed(p: ReturnType<typeof engine.addProject>): Promise<void> {
    if (p.doc.layers.some((l) => l.tiled)) return;
    try {
      const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathsOf(p), engine.timelineFor(p));
      closedTabs.push({ id: p.id, name: p.name, savedAt: Date.now(), manifest, files, modified: p.modified, libraryName: p.libraryName });
      while (closedTabs.length > 5) closedTabs.shift();
    } catch { /* the tab just cannot be reopened */ }
  }

  /** File > Close All and Close Others (1.65.8): every document, or every one but `keep`, closed in
   *  turn as Close Tab closes it; one with unsaved changes is brought forward and asked about, with Apply to All when
   *  more are waiting, and Cancel stops there. */
  async function closeMany(keep: string | null, onlyUnsaved = false): Promise<void> {
    let answer: 'save' | 'discard' | null = null;
    const kept = (x: { id: string }): boolean => x.id === keep || (!onlyUnsaved && tabs.isPinned(x.id));
    for (const p of engine.projects.filter((x) => !kept(x) && (!onlyUnsaved || x.modified))) {
      if (!engine.projects.includes(p)) continue;
      let choice = answer;
      if (p.modified && !choice) {
        if (engine.current !== p) engine.switchTo(p.id);
        const more = engine.projects.some((x) => x !== p && !kept(x) && x.modified);
        const a = more ? await askSaveChangesAll(p.name) : { choice: await askSaveChanges(p.name), all: false };
        if (a.choice === 'cancel') return;
        if (a.all) answer = a.choice;
        choice = a.choice;
      }
      if (!(await requestClose(p.id, choice))) return;
    }
    if (keep && engine.current?.id !== keep) engine.switchTo(keep);
  }

  let quitting = false;
  /** File > Exit and the shell's quit and window-close requests: each unsaved document is asked about in turn (Save,
   *  Don't Save or Cancel, Apply to All when more wait), and the app exits only once none is left. A browser page
   *  cannot close itself, so there it ends by saying the page is safe to close. */
  async function exitApp(): Promise<void> {
    if (quitting) return;
    quitting = true;
    try {
      if (await settleUnsaved()) {
        await finalSave();
        if (hostLink.embedded) hostLink.close();
        else if (hasPanels()) await confirmExit();
        else { window.close(); toast('Everything is saved. This page can be closed now.', 'info'); }
      } else if (hasPanels()) await confirmExit(true);
    } catch (err) { toast(message(err), 'error'); if (hasPanels()) await confirmExit(true).catch(() => undefined); }
    quitting = false;
  }

  /** Asks about every document with unsaved changes, as Close All does; true once none is left (each was saved or
   *  discarded), false when the person cancelled. Documents without changes stay open, so Restore Session still has them. */
  async function settleUnsaved(): Promise<boolean> {
    await savesDone();
    await closeMany(null, true);
    return !engine.projects.some((p) => p.modified);
  }

  /** Help > Check for Updates (desktop app): says what the shell's check found; for a new version, installs it and
   *  restarts once the person agrees and every unsaved document is settled. */
  async function checkUpdates(quiet = false): Promise<string> {
    if (!hasPanels()) { const text = 'Updates are checked in the desktop app; this page runs in a browser.'; if (!quiet) toast(text, 'info'); return text; }
    let report;
    try { report = await checkForUpdate(); } catch (err) { const text = `Could not check for updates: ${message(err)}`; if (!quiet) toast(text, 'error'); return text; }
    if (report.status !== 'available') { if (!quiet) toast(report.message, report.status === 'failed' ? 'error' : 'info'); return report.message; }
    if ((await api.capabilities())?.switches?.portable) {
      const text = `Version ${report.version ?? ''} is available. This portable copy does not update itself; the download page is opening.`;
      toast(text, 'info');
      window.open('https://formai.studio/formvis/download/', '_blank', 'noopener');
      return text;
    }
    const again = !!report.version && stored(SKIPPED_UPDATE_KEY) === report.version;
    if (quiet && again) return report.message;
    const choice = await dialogs.update.ask(`${report.message}${again ? ' You skipped this version earlier.' : ''} Restart and update formvis?`, report.notes ?? null);
    if (choice === 'skip') { if (report.version) store(SKIPPED_UPDATE_KEY, report.version); toast(`Skipped version ${report.version ?? ''}; Help > Check for Updates offers it again.`, 'info'); return report.message; }
    if (choice === 'later') return report.message;
    if (engine.busyWith) { toast(`Wait for ${engine.busyWith} to finish, then check for updates again.`, 'info'); return report.message; }
    if (!(await settleUnsaved())) return report.message;
    await finalSave();
    try { await installUpdate(); } catch (err) { toast(message(err), 'error'); }
    return report.message;
  }

  const imageInput = el<HTMLInputElement>(`<input type="file" multiple accept="${IMAGE_ACCEPT}" data-role="import-images" hidden>`);
  document.body.appendChild(imageInput);
  const folderInput = el<HTMLInputElement>('<input type="file" webkitdirectory multiple data-role="import-folder" hidden>');
  document.body.appendChild(folderInput);
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
  /** One PSD or text file whose notes are wanted, through a fresh input; null when cancelled. */
  const pickNotesFile = (): Promise<File | null> => new Promise((resolve) => {
    const i = el<HTMLInputElement>('<input type="file" accept=".psd,.psb,.psdt,.txt,text/plain" data-role="import-notes-file" hidden>');
    const done = (f: File | null): void => { resolve(f); i.remove(); };
    i.addEventListener('change', () => done(i.files?.[0] ?? null), { once: true });
    i.addEventListener('cancel', () => done(null), { once: true });
    document.body.appendChild(i);
    i.click();
  });
  /** One script file through a fresh input; null when cancelled. */
  const pickScriptFile = (): Promise<File | null> => new Promise((resolve) => {
    const i = el<HTMLInputElement>('<input type="file" accept=".js,.mjs,.txt,text/javascript,text/plain" data-role="script-file" hidden>');
    const done = (f: File | null): void => { resolve(f); i.remove(); };
    i.addEventListener('change', () => done(i.files?.[0] ?? null), { once: true });
    i.addEventListener('cancel', () => done(null), { once: true });
    document.body.appendChild(i);
    i.click();
  });
  /** File > Scripts > Browse: the chosen .js file runs in the sandbox with run(id, params) for the command catalogue. */
  const browseScript = async (): Promise<void> => {
    const f = await pickScriptFile();
    if (!f) return;
    if (f.size > 200000) { toast(`${f.name} is larger than a script may be (200 KB).`, 'error'); return; }
    const r = await runScriptSource(await f.text());
    if (r.ok) toast(`Ran ${f.name}${r.log.length ? `: ${r.log[0]}` : ''}.`);
    else toast(`${f.name} stopped: ${r.error}`, 'error');
  };
  /** File > Import > Notes: the text notes of a PSD, or the paragraphs of a text file, added to the document as notes. */
  const importNotes = async (): Promise<void> => {
    const f = await pickNotesFile(), p = engine.current;
    if (!f || !p) return;
    try {
      const got = await readNotesFile(f, p.doc.width, p.doc.height), n = addNotes(engine, got.notes);
      toast(n ? `${n} note${n === 1 ? '' : 's'} imported from ${f.name}.${got.skipped ? ' Sound notes were left out.' : ''}` : `${f.name} holds no text notes.`, 'info');
    } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
  };
  /** One .svg file through a fresh input; null when cancelled. */
  const pickSvg = (): Promise<File | null> => new Promise((resolve) => {
    const i = el<HTMLInputElement>('<input type="file" accept=".svg,.svgz,image/svg+xml" data-role="svg-layers-file" hidden>');
    const done = (f: File | null): void => { resolve(f); i.remove(); };
    i.addEventListener('change', () => done(i.files?.[0] ?? null), { once: true });
    i.addEventListener('cancel', () => done(null), { once: true });
    document.body.appendChild(i);
    i.click();
  });
  const openSvgLayers = async (svgText: string | null): Promise<void> => {
    try {
      let text = svgText, name = 'SVG';
      if (text === null) {
        const file = await pickSvg();
        if (!file) return;
        text = await svgSource(file);
        name = stripExt(file.name);
      }
      const parsed = svgToShapes(text);
      if (!parsed.shapes.length && !parsed.texts.length && !parsed.pictures.length) { toast(`No shapes or text found; ${parsed.skipped} elements skipped.`, 'error'); return; }
      if (!engine.newDocument(parsed.width, parsed.height, name, 'transparent')) return;
      const n = parsed.shapes.length ? engine.addShapeLayers(parsed.shapes, true) : 0;
      // Text as point type (34.4d), each its own step; the Type tool's own settings are put back afterwards.
      const kept = engine.textSettings;
      for (const tx of parsed.texts) await engine.createTextLayer({ x: tx.x, y: tx.y }, { ...kept, content: tx.content, family: tx.family, size: tx.size, color: tx.color, align: tx.align, bold: tx.bold, italic: tx.italic, box: null, direction: 'horizontal', warp: null, onPath: null, rendered: undefined });
      engine.textSettings = kept;
      // Clip paths, masks, filters, patterns and pictures cannot be shapes: each is drawn by the browser into a pixel layer on top.
      let drawn = 0;
      for (const pic of parsed.pictures) {
        try {
          const img = await rasteriseSvg(new Blob([pic.svg], { type: 'image/svg+xml' }), pic.name, parsed.width), raster = new Raster(img.width, img.height);
          raster.ctx.drawImage(img.source, 0, 0); raster.touch();
          engine.insertRasterLayer(raster, pic.name, 0, 0, {}, 'Open SVG');
          drawn++;
        } catch { parsed.skipped++; }
      }
      toast(`${n} shape layers, ${parsed.texts.length} type layers${drawn ? `, ${drawn} pixel layers` : ''}; ${parsed.skipped} elements skipped.`);
    } catch (err) { toast(message(err), 'error'); }
  };
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
  folderInput.addEventListener('change', () => {
    const all = Array.from(folderInput.files ?? []), files = all.filter((f) => !isProjectFile(f) && isImageFile(f)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    folderInput.value = '';
    if (files.length) void importFiles(files);
    else if (all.length) toast('That folder holds no pictures formvis can open.', 'info');
  });
  imageInput.addEventListener('change', () => {
    const files = Array.from(imageInput.files ?? []);
    imageInput.value = '';
    if (files.length) void importFiles(files);
  });

  const actions = new Actions();
  const scriptEvents = new ScriptEvents();
  /** A script file's source run in the sandbox against the command catalogue. */
  async function runScriptSource(source: string): ReturnType<typeof runScript> {
    return runScript(source, {
      run: async (id, params) => { const r = await catalogue.runCommand(id, params); if (!r.ok) throw new Error(r.error ?? `${id} did not run.`); return r.result; },
      list: () => catalogue.listCommands().map((c) => ({ id: c.id, label: c.label })),
    });
  }
  function fireEvent(e: ScriptEvent): void {
    void scriptEvents.fire(e, async (b) => {
      if (b.script !== undefined) {
        const r = await runScriptSource(b.script);
        if (!r.ok) throw new Error(r.error ?? 'The script failed.');
        return r.log[0] ?? 'ran';
      }
      const x = actions.list.find((a) => a.name === b.action);
      if (!x) throw new Error(`There is no action named "${b.action}".`);
      if (!engine.current) return 'no document open';   // actions play on a document; with none open (as at start) the event passes quietly
      await playAction(x);
      return 'played';
    });
  }
  let knownIds = new Set(engine.projects.map((p) => p.id)), knownNew = engine.newCount;
  engine.on('projects', () => {
    const now = new Set(engine.projects.map((p) => p.id));
    const added = [...now].some((id) => !knownIds.has(id)), removed = [...knownIds].some((id) => !now.has(id)), made = engine.newCount !== knownNew;
    knownIds = now;
    knownNew = engine.newCount;
    if (added) fireEvent(made ? 'new' : 'open');
    if (removed) fireEvent('close');
  });
  window.setTimeout(() => fireEvent('start'), 0);
  const selectMaskWorkspace = new SelectMaskWorkspace(engine, root);
  const dialogs = {
    scriptEvents: new ScriptEventsDialog(scriptEvents, actions),
    saveForWeb: new SaveForWebDialog(engine, deliver),
    exportLuts: new LutExportDialog(engine, deliver),
    measureScale: new MeasureScaleDialog(engine),
    scaleMarker: new ScaleMarkerDialog(engine),
    measureLog: new MeasurementLogDialog(engine, deliver),
    measureDataPoints: new MeasureDataPointsDialog(),
    findReplaceText: new FindReplaceTextDialog(engine),
    spelling: new SpellDialog(engine),
    missingFonts: new MissingFontsDialog(engine),
    normalMap: new NormalMapDialog(engine),
    smartFilters: new SmartFiltersDialog(engine, (): FilterPanel => dialogs.filter),
    shapeStyle: new ShapeStyleDialog(engine),
    animation: new AnimationDialog(engine),
    gif: new GifDialog(engine, (k) => exportGif(k)),
    tween: new TweenDialog(engine),
    stop: new StopDialog(),
    presetManager: new PresetManagerDialog(engine, swatches, deliver, savePatterns),
    trim: new TrimDialog(engine),
    trap: new TrapDialog(engine),
    frequency: new FrequencyDialog(engine),
    colorRange: new ColorRangeDialog(engine),
    selectionTransform: new SelectionTransformDialog(engine),
    layerTransform: new SelectionTransformDialog(engine, true),
    actions: new ActionsDialog(actions, {
      play: (x) => playAction(x), save: (b, n) => deliver(b, n),
      menu: () => commands.all().filter((c) => c.id !== 'play-action').map((c) => ({ id: c.id, label: commands.label(c) })).sort((a, b) => a.label.localeCompare(b.label)),
      run: (id, params) => commands.get(id)?.run(params),
      keyTaken: (combo) => { const c = commands.forCombo(combo); return c ? commands.label(c) : ''; },
    }),
    batch: new BatchDialog(actions, (x, f, fmt, q, t, s, out) => runBatch(x, f, fmt, q, t, s, out)),
    droplet: new DropletDialog(actions, (o) => makeDroplet(o)),
    lensBatch: new LensBatchDialog((o, f) => runLensBatch(o, f)),
    imageProcessor: new ImageProcessorDialog(actions, (o) => imageProcessor(o)),
    generative: new GenerativeDialog(engine),
    falTask: new FalTaskDialog(engine),
    layerStyle: new LayerStyleDialog(engine, deliver),
    text: new TextDialog(engine),
    newCanvas: new NewCanvasDialog(engine),
    jpeg: new JpegDialog(engine),
    background: new BackgroundPanel(engine),
    color: new ColorPickerDialog(engine),
    liveMask: new LiveMaskDialog(),
    open: new OpenDialog({ openLibrary, openFiles: (files) => importFiles(files, undefined, 'documents'), openFolder, openFromPanel: hasPanels() ? openFromPanel : null }),
    settings: new SettingsDialog((pr) => { applyPrefs(engine, pr); applyUiPrefs(pr); recoveryDelay = pr.recoverySeconds * 1000; home.sync(); syncGpu(); syncEngineDevice(); }),
    shortcuts: new ShortcutsDialog(commands, deliver),
    menusEditor: new MenusDialog(commands, () => menus, () => applyUiPrefs(loadPrefs())),
    about: new AboutDialog(),
    systemInfo: new SystemInfoDialog(),
    reportIssue: new ReportIssueDialog(),
    update: new UpdateDialog(),
    brushSettings: new BrushSettingsDialog(engine),
    warpText: new WarpTextDialog(engine),
    typeOnPath: new TypeOnPathDialog(engine),
    typeOnShape: new TypeOnShapeDialog(engine),
    paragraphStyles: new ParagraphStylesDialog(engine),
    characterStyles: new CharacterStylesDialog(engine),
    glyphs: new GlyphsDialog(engine),
    toolPresets: new ToolPresetsDialog(engine),
    benchmark: new BenchmarkDialog(async (opts) => ({ result: await runBenchmark(engine, undefined, undefined, opts), adapter: gpuProbed ? detectedName(gpuProbe) ?? 'none found' : 'not detected yet' })),
    adjust: new AdjustPanel(engine),
    filter: new FilterPanel(engine),
    fade: new FadeDialog(engine),
    compare: new CompareDialog(engine),
    duotone: new DuotoneDialog(engine),
    colorTable: new ColorTableDialog(engine),
    extrasOptions: new ExtrasOptionsDialog(),
    applyImage: new ApplyImageDialog(engine),
    neural: new NeuralFiltersDialog(engine),
    wideAngle: new WideAngleDialog(engine),
    canvasSize: new CanvasSizeDialog(engine),
    imageSize: new ImageSizeDialog(engine),
    fitImage: new FitImageDialog(engine),
    conditionalMode: new ConditionalModeDialog(),
    contactSheet: new ContactSheetDialog(engine),
    loadStack: new LoadStackDialog(engine, false),
    stackStatistics: new LoadStackDialog(engine, true),
    saveCopy: new SaveCopyDialog(engine, (n, layers, format, quality) => void (format === 'fvd' ? saveCopy(n, layers) : exportImage(format, quality / 100, n.replace(/[/\\:*?"<>|]/g, '-')))),
    palette: new CommandPalette(commands, () => menus, engine),
    notices: new NoticesDialog(),
    fillLayer: new FillLayerDialog(engine),
    amount: new AmountDialog(engine),
    matting: new MattingDialog(engine),
    findLayers: new FindLayersDialog(engine),
    lockLayers: new LockLayersDialog(engine),
    loadSelection: new LoadSelectionDialog(engine),
    saveSelection: new SaveSelectionDialog(engine),
    channelOptions: new ChannelOptionsDialog(engine),
    mergeChannels: new MergeChannelsDialog(engine),
    globalLight: new GlobalLightDialog(engine),
    fileInfo: new FileInfoDialog(engine),
    scaleEffects: new ScaleEffectsDialog(engine),
    fill: new FillDialog(engine),
    exportAs: new ExportDialog(engine, (s) => void exportAs(s), (s) => void exportLayersAs(s), exportPreview),
    exportPrefs: new ExportPrefsDialog(() => !!caps?.desktop),
    print: new PrintDialog(engine, (s) => { printDocument(engine, s); fireEvent('print'); }, (pdf, name) => { void deliver(pdf, name); }),
    layerExport: new LayerExportDialog(engine, () => !!caps?.desktop, (s) => void exportLayerFiles(s)),
    artboardPdf: new ArtboardPdfDialog(engine, (s) => void exportArtboardsPdf(s)),
    defineVariables: new DefineVariablesDialog(engine),
    dataSets: new DataSetsDialog(engine),
    guide: new GuideDialog(engine),
    editGuides: new EditGuidesDialog(engine),
    artboard: new ArtboardDialog(engine),
    newArtboard: new NewArtboardDialog(engine),
    rotateCanvas: new ArbitraryRotationDialog(engine),
    stroke: new StrokeDialog(engine),
    duplicateImage: new DuplicateImageDialog(engine),
    replaceColor: new ReplaceColorDialog(engine),
    calculations: new CalculationsDialog(engine),
    corners: new CornersDialog(engine),
    clippingPath: new ClippingPathDialog(engine),
    createShape: new CreateShapeDialog(engine),
    strokePath: new StrokePathDialog(engine),
    makeSelection: new MakeSelectionDialog(engine),
    newLayer: new NewLayerDialog(engine),
    duplicateLayer: new DuplicateLayerDialog(engine),
    newGroup: new NewGroupDialog(engine),
    liquify: new LiquifyDialog(engine),
    selectMask: new SelectMaskDialog(engine),
    contentFill: new ContentFillDialog(engine),
    gradientEditor: new GradientEditor(engine),
  };
  actionsPanel.bind(actions, { play: (x) => playAction(x), options: () => dialogs.actions.show() });
  dialogs.presetManager.onSettings = ({ shortcuts }) => {
    commands.resetKeys();
    for (const [id, keys] of Object.entries(shortcuts)) commands.setKeys(id, keys);
    applyUiPrefs(loadPrefs());
  };
  loadSavedGradients();
  engine.uiHooks.gradientEditor = () => dialogs.gradientEditor.show();
  loadCustomShapes();
  void loadImportedBrushes().then(() => engine.emit('options', null));
  const abrInput = el<HTMLInputElement>('<input type="file" accept=".abr,image/*" data-role="import-brushes" hidden>');
  document.body.appendChild(abrInput);
  dialogs.settings.workspaceLock = { get: () => dock.locked, set: (on) => { dock.locked = on; } };   // Preferences > Workspace
  dialogs.settings.checkUpdates = () => checkUpdates();   // Preferences > Plugins > Updates
  if (hasPanels() && updateAtStart()) window.setTimeout(() => void checkUpdates(true), 8000);   // the shell no longer asks by itself
  dialogs.settings.applyTiled = (on) => { engine.tiledDocuments = on; };   // Preferences > Performance > Rendering
  dialogs.settings.restartWindow = () => void commands.run('reload-window');
  dialogs.settings.canvasColour = { get: pasteboard, set: (k) => { store('formvis.pasteboard', k); applyPasteboard(); } };   // Preferences > Interface
  // Preferences > Scratch Disks: the recovery copies and closed tabs kept on this device, and the storage the browser allows.
  dialogs.settings.scratch = {
    info: async () => {
      const all = await recovery.list(), size = (r: { files: Array<{ blob: Blob }> }): number => r.files.reduce((m, f) => m + f.blob.size, 0);
      const open = all.filter((r) => engine.projects.some((q) => q.id === r.id)), stale = all.filter((r) => !engine.projects.some((q) => q.id === r.id));
      const mb = (n: number): string => (n / 1048576).toFixed(1);
      const est = await navigator.storage?.estimate?.().catch(() => null);
      return `Working files: ${open.length} open ${open.length === 1 ? 'document' : 'documents'} kept (${mb(open.reduce((n, r) => n + size(r), 0))} MB), ${stale.length} left over (${mb(stale.reduce((n, r) => n + size(r), 0))} MB), ${closedTabs.length} closed ${closedTabs.length === 1 ? 'tab' : 'tabs'} (${mb(closedTabs.reduce((n, r) => n + size(r), 0))} MB).${est?.quota ? ` This device allows ${mb(est.quota)} MB, ${mb(est.usage ?? 0)} MB in use.` : ''}`;
    },
    clean: () => { void commands.run('clean-working-files'); },
  };
  // The usual question before painting a type, shape or smart-object layer (1.50.2): rasterize it, or leave it.
  engine.askRasterize = (name, kind) => confirmAction(`Rasterize this ${kind}?`, `"${name}" must be rasterized before it can be painted on. Its ${kind === 'type layer' ? 'text' : kind === 'Smart Object' ? 'contents' : 'shape'} will no longer be editable.`, 'Rasterize');
  const noteDialog = new NoteDialog(engine);
  const modeDialog = new ModeDialog(engine);
  modeDialog.onCmyk = async (id, name, intent, bpc) => {
    const profile = await cmykProfileOf(id, name);
    if (engine.current?.doc.depth === 16) await deepMode('cmyk', `id:${id}`, profile, intent, bpc); else await toCmyk(profile, intent, bpc);
  };
  dialogs.newCanvas.prepare = async (mode, depth) => {
    let profile: DocProfile | null = null;
    if (mode === 'cmyk') {
      try {
        const all = (await api.colourProfiles()).profiles.filter((x) => x.space === 'CMYK'), pick = all.find((x) => x.shipped) ?? all[0];
        if (!pick) { toast(t('No CMYK profile was found. Load one in View > Proof Setup.'), 'error'); return null; }
        profile = await cmykProfileOf(pick.id, pick.name);
      } catch { toast(t('CMYK needs the engine service, which is not running (./formvis boot).'), 'error'); return null; }
    }
    return async () => {
      if (mode === 'bitmap' || mode === 'grayscale') engine.setDocumentMode(mode);
      else if (mode === 'lab') engine.setLab();
      else if (profile) { const c = loadPrefs().colour; await toCmyk(profile, c.intent, c.bpc); }
      if (depth === 16 || depth === 32) engine.setDepth(depth);
      const done = engine.current?.doc;
      const ok = !!done && (done.mode ?? 'rgb') === mode && (done.depth ?? 8) === (depth === 1 ? 8 : depth);
      if (!ok) toast(t('The new document could not be set to that mode and bit depth.'), 'error');
      return ok;
    };
  };
  dialogs.neural.onSuperZoom = (factor) => { commands.run(factor === 4 ? 'upscale-4x' : 'upscale-2x'); };
  const sendNodeMode = new SendDialog(engine, (t) => toast(t));
  const sendComfyUI = new SendDialog(engine, (t) => toast(t), 'comfyui');
  const runWorkflow = new RunWorkflowDialog(engine, (t) => toast(t));
  const generateImage = new GenerateImageDialog(engine, (t) => toast(t));
  const modelCanvas = new ModelCanvasDialog(engine);
  const colorMatch = new ColorMatchDialog(engine);
  // A local model's notice (Krea 2's licence requires it with its pictures) and the filter's warning (1.52.9).
  const heard = (r: { notice?: string; warning?: string; notes: string[] }): void => { if (r.warning) toast(r.warning, 'error'); if (r.notice) toast(r.notice, 'info'); };
  dialogs.generative.heard = heard;
  generateImage.heard = heard;
  const filmLayer = new FilmLayerDialog(engine);
  const aiLabelDialog = new AiLabelDialog(engine);
  const model3d = new Model3DDialog(engine, (t) => toast(t));
  const extrude3d = new Extrude3DDialog(engine, (t) => toast(t));
  const panorama = new PanoramaDialog(engine, (t) => toast(t));
  // Outside agents over MCP (1.52.1): the window runs their calls while Preferences > Plugins allows it.
  const agentConfirm = new AgentConfirmDialog();
  const psdReportDialog = new PsdReportDialog();
  // Allow, asked in the window when an agent first calls (1.53.3), is the same setting as Preferences > Plugins.
  const agents = new AgentBridge(engine, {
    ask: (title, text) => agentConfirm.ask(title, text), note: (t) => toast(t, 'info'),
    allow: () => { savePrefs({ ...loadPrefs(), agentsAllowed: true }); window.dispatchEvent(new CustomEvent('formvis:agents', { detail: true })); },
    // 1.53.3: what agents reach through the app, the same paths as its menus.
    openFile: (f) => openFiles([f]),
    renderVideo: (c, step) => renderVideoBlob(c, step),   // 1.59.7, DEV_PLAN 25.5: timeline_render
    projectBlob: async () => { const p = engine.current; if (!p) return null; engine.settle(); const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathsOf(p), engine.timelineFor(p)); return api.package(manifest, files); },
    applyFilter: (kind, settings) => {
      if (kind === 'average') { engine.averageFill(); return true; }
      const lib = isLibKind(kind) && !('lib' in settings) ? { lib: { [kind]: settings }, seed: typeof settings.seed === 'number' ? settings.seed : 0 } : settings;
      return dialogs.filter.applySettings(kind as Parameters<typeof dialogs.filter.applySettings>[0], lib);
    },
    selectSubject: () => selectSubject(false),
    removeBackground: () => removeBackground('auto', true),
    viewCapture: () => stage.capture(),
    ui: new UiControl({ engine, commands, menus: () => menus, capture: () => stage.capture(), docPoint: (x, y) => stage.docPoint(x, y) }),
    selectPoints: (inside, outside, mode) => selectByPoints(engine, inside, outside, mode),
    plugins: async () => [...(await pluginHost.list()), ...(await folderPlugins.list()).map((f) => ({ ...f, kind: 'folder' }))],
    extensions: { list: async () => { await formExt.refresh(false); return formExt.summary(); }, run: (id, command, args) => formExt.run(id, command, args) },
    log: () => [...errorLog.entries, ...engine.failures],
    status: (note, seconds) => status.setAgentNote(note, seconds),
  });
  agents.setEnabled(loadPrefs().agentsAllowed);
  window.addEventListener('formvis:agents', (ev) => agents.setEnabled((ev as CustomEvent<boolean>).detail === true));
  // The assistant (1.52.2) acts through the same bridge, whether or not outside agents are allowed.
  const assistant = new AssistantPanel(engine, agents);
  const help = new HelpDialog();
  // Help > What's New: Show Me runs the row's command through the catalogue once the dialog has closed.
  const whatsNew = new WhatsNewDialog({
    run: (id) => { void catalogue.runCommand(id).then((r) => { if (!r.ok) toast(r.error ?? 'That could not run now.', 'error'); }); },
    enabled: (id) => catalogue.describeCommand(id)?.enabled === true,
  });
  // Plugins (1.52.6): the plugins folder's plugins, each in a sandboxed frame; their commands in the Plugins menu.
  const pluginHost = new PluginHost(engine, agents, commands, (t, kind) => toast(t, kind ?? 'info'));
  // Plugin folders (plugin.json and an ES module): a side panel is a section in the dock, added and removed in place.
  const unshownPanels = new Set<string>();
  const panelBox: { get: (() => { add(id: string, label: string): HTMLElement | null; remove(id: string): void }) | null } = { get: null };
  pluginHost.panelSlot = () => panelBox.get?.() ?? null;
  const folderPlugins = new FolderPlugins({
    engine, commands, note: (t, kind) => toast(t, kind ?? 'info'),
    confirm: (title, text, ok) => confirmAction(title, text, ok), prompt: (title, value, ok) => promptName(title, value, ok),
    panels: panelBox.get = () => ({
      add: (id, label) => {
        if (document.querySelector(`section.cv-${id}`)) return null;
        if (!loadPrefs().showExtPanels) { unshownPanels.add(id); return el('<div class="cv-plugin-panel-body"></div>'); }
        const sec = el(`<section class="cv-preset-panel cv-${id}" aria-label="${label.replace(/[<>&"]/g, '')}"><div class="cv-panel-head"><span class="cv-comps-title"><span></span></span><span></span></div><div class="cv-plugin-panel-body"></div></section>`);
        setText(q(sec, '.cv-comps-title span'), label);
        q(root, '.cv-layers').appendChild(sec);
        registerPanel({ id, label, selector: `section.cv-${id}` });
        commands.add({ id: `panel-${id}`, label, checked: () => dock.isShown(id), run: () => dock.toggle(id) });
        dock.insertPanel(id, 'dock', 99);
        dock.refresh();
        return q(sec, '.cv-plugin-panel-body');
      },
      remove: (id) => {
        if (unshownPanels.delete(id)) return;
        document.querySelector(`section.cv-${id}`)?.remove();
        commands.remove(`panel-${id}`);
        dock.removePanel(id); unregisterPanel(id); dock.refresh();
      },
    }),
  });
  dialogs.settings.pluginsFolder.onSaved = () => { void folderPlugins.reloadAll().then((n) => toast(`Plugins reloaded: ${n} running.`)); };
  window.addEventListener('formvis:ext-panels', () => { void folderPlugins.reloadAll(); });
  dialogs.settings.pluginSwitches.rows = async () => [
    ...(await pluginHost.list()).map((r) => ({ id: `file:${String(r.file)}`, name: String(r.file).replace(/\.js$/, ''), on: r.on === true })),
    ...(await folderPlugins.list()).map((r) => ({ id: `folder:${String(r.id)}`, name: String(r.name ?? r.id), on: r.on === true })),
  ];
  dialogs.settings.pluginSwitches.set = async (id, on) => { if (id.startsWith('file:')) pluginHost.setOn(id.slice(5), on); else await folderPlugins.setOn(id.slice(7), on); };
  // Window > Script Console (DEV_PLAN 36.7): the plugin API under the identity 'console', no wider than a plugin's.
  const scriptConsole = new ScriptConsoleDialog({ api: () => pluginHost.apiFor('console'), agentBusy: () => agents.agentBusy });
  const consoleLog = new ConsoleLogDialog({
    entries: () => [...errorLog.entries, ...engine.failures],
    clearEntries: () => { errorLog.entries.length = 0; engine.failures.length = 0; },
    copy: (text) => { void navigator.clipboard?.writeText(text).then(() => toast('Copied the log.'), () => toast('The clipboard is not available here.', 'error')); },
  });
  const earlierStates = new EarlierStatesDialog({
    list: () => earlier.list(),
    drop: (id) => earlier.drop(id),
    open: async (set) => {
      let n = 0;
      for (const r of set.records) if (await reopen(r, `${r.name} (earlier)`)) n++;
      engine.emit('projects', null);
      if (n) toast(tn(n, 'Opened the document from {where}.', 'Opened {n} documents from {where}.').replace('{where}', t(set.kind === 'crash' ? 'a crash set' : 'an earlier session')), 'info');
      return n;
    },
  });
  const pluginsDialog = new PluginsDialog(pluginHost, folderPlugins, (title, text, ok) => confirmAction(title, text, ok));
  pluginsDialog.openFolder = () => { commands.run('open-plugins-folder'); };
  // Form extensions (the Extension Contract, API 1, 2.1.0): FormPortal's and form.ext's, beside the plugin kinds above.
  const extensionConsent = new ExtensionConsentDialog();
  // An extension's dock panel is a panel group like the app's own (its name as the tab, the grip, the panel menu's
  // place, Minimize): it moves and floats by its header, sizes by the splitters, and its tab can join another group.
  // In 2.1.0 it was a bare section the dock never wired: no grip, not movable, always last, its title squeezed.
  const extDock: ExtensionsDeps['dock'] = {
    add: (id, label) => {
      if (PanelGroup.all.has(id) || document.querySelector(`section.cv-${id}`)) return null;
      const tab = `${id}-tab`, body = el('<div class="cv-ext-panel-body"></div>');
      const group = new PanelGroup(q(root, '.cv-layers'), id, [{ id: tab, label, body }], label.replace(/[<>&"]/g, ''));
      group.root.classList.add('cv-ext-group');
      registerPanel({ id, label, selector: `section.cv-${id}` });
      commands.add({ id: `panel-${id}`, label, group: 'Window', description: `Shows or hides the ${label} extension panel.`, when: `Use when you want the ${label} panel in view.`, checked: () => dock.isShown(id), run: () => dock.toggle(id) });
      // Placed beside the Extensions panel the first time; after that wherever it was dragged.
      dock.placeAfter(id, 'extensions');
      PanelGroup.restoreHome(tab);
      dock.refresh();
      return body;
    },
    show: (id) => {
      // Its tab may live in another group (dragged there): that group opens on it.
      const host = PanelGroup.ofTab(`${id}-tab`);
      if (host && host.id !== id) { host.setMinimised(false); host.show(`${id}-tab`); return; }
      if (!dock.isShown(id)) dock.toggle(id);
      PanelGroup.all.get(id)?.setMinimised(false);
    },
    setLabel: (id, label) => PanelGroup.renameTab(`${id}-tab`, label),
    remove: (id) => {
      PanelGroup.dropTab(`${id}-tab`);
      PanelGroup.all.get(id)?.remove();
      commands.remove(`panel-${id}`); dock.removePanel(id); unregisterPanel(id); dock.refresh();
    },
  };
  const formExt = new FormExtensions({
    engine, commands, agents, catalogue, version: VERSION,
    notify: (t, kind) => toast(t, kind), consent: (ext) => extensionConsent.ask(ext),
    overlay: () => document.getElementById('overlay-root') ?? document.body,
    saveBlob: async (blob, name) => {
      const picker = 'showSaveFilePicker' in window && !navigator.webdriver && window.isSecureContext && window === window.top;
      if (!(caps?.desktop && hasPanels()) && !picker) { const named = await promptName('Save to Downloads', name, 'Save'); if (!named) return false; name = named; }
      return deliverFile(blob, name);
    },
    openUrl: (url) => { void fetch('/api/extensions/portal', { method: 'POST' }).then((r) => { if (!r.ok) toast(`Open FormPortal and choose Extensions (${url}).`); }, () => toast(`Open FormPortal and choose Extensions (${url}).`)); },
    dock: extDock,
  });
  extensionsPanel.bind(formExt, (id) => { commands.run(id); });
  commands.add(
    { id: 'extensions-panel', label: 'Extensions Panel', run: () => { if (!dock.isShown('extensions')) dock.toggle('extensions'); } },
    { id: 'extensions-reload', label: 'Reload Extensions', run: () => { void formExt.refresh(true).then((n) => toast(`Extensions reloaded: ${n} ready.`)); } },
    { id: 'extensions-manage', label: 'Manage in FormPortal', run: () => formExt.manage() },
  );
  pluginsDialog.showExtensions = () => commands.run('extensions-panel');
  formExt.start();
  const largePicture = new LargePictureDialog(engine);
  const tiffPages = new TiffPagesDialog(engine);
  const svgImport = new SvgImportDialog();
  engine.svgDraw = async (svg, w, h) => {
    try {
      const img = await rasteriseSvg(new Blob([svg.data.slice()], { type: svg.mime }), svg.name, w, h), r = new Raster(img.width, img.height);
      r.ctx.drawImage(img.source, 0, 0); r.touch();
      return r;
    } catch { return null; }
  };
  const exrChooser = new ExrPartsDialog();
  const openAs = new OpenAsDialog((f) => importFiles([f], undefined, 'documents'));
  const packageDialog = new PackageDialog();
  const colourView = new ColourView(engine);   // colour management (1.53.5)
  colourView.onProof = (label) => status.setProof(label);
  const hdrToning = new HdrToningDialog();   // 1.53.9
  const focusAreaDialog = new FocusAreaDialog(engine);   // 1.57.6
  const photomergeDialog = new MergeDialog(engine, 'panorama'), hdrMergeDialog = new MergeDialog(engine, 'hdr');   // 1.58.2
  let layerCompDialog: import('./ui/panels/layer-comp-dialog').LayerCompDialog | undefined;
  const vanishingDialog = new VanishingPointDialog(engine);   // 1.58.3
  const videoDialog = new VideoImportDialog(engine);   // 1.58.9
  const convertDialog = new ConvertProfileDialog(engine, (pr) => cmykLutFor(pr));   // CMYK's tables (1.57.9)
  const modeConvertDialog = new ModeConvertDialog(engine);
  /** Color Settings > Ask for options when changing mode: Image > Mode > RGB Color, Grayscale and Lab Color open Convert Mode instead of converting at once. */
  function askModeOptions(space: Space): boolean {
    const m = engine.current?.doc.mode ?? 'rgb';
    if (!loadPrefs().colour.askMode || !['rgb', 'grayscale', 'cmyk', 'lab'].includes(m) || (space === 'rgb' && m === 'rgb') || (space === 'gray' && m === 'grayscale') || (space === 'lab' && (m === 'lab' || m === 'grayscale'))) return false;
    void modeConvertDialog.show(space);
    return true;
  }
  modeConvertDialog.onApply = async (a) => {
    if (!(await downTo(16))) return 'Choose HDR Toning to leave 32 bits first.';
    const done = await engine.task(async () => {
      try { return await convertDocumentDeep(engine, a.choice, a.target, a.space, { intent: a.intent, bpc: a.bpc, dither: a.dither }, (pr) => cmykLutFor(pr)); } catch (err) { return message(err); }
    });
    return done === true ? null : typeof done === 'string' ? done : 'Nothing was converted.';
  };
  dialogs.filter.attachDock({ body: developHost, show: () => { if (!dock.isShown('develop')) dock.toggle('develop'); dock.activate('develop'); }, hide: () => { if (dock.isShown('develop')) dock.toggle('develop'); } });
  dialogs.filter.rawProfile = {
    async options() {
      const l = engine.current?.activeLayer, raw = l ? rawLayers.get(l.id) : undefined;
      if (!raw) return null;
      const info = await api.cameraProfiles(raw.file, raw.file.name);
      return { list: [['none', info.profiles.length ? 'Default (camera matrix)' : 'Default (no profile for this camera)'], ...info.profiles.map((e) => [e.id, e.name] as const)], current: raw.profile === 'auto' ? info.auto ?? 'none' : raw.profile };
    },
    async choose(id) {
      const l = engine.current?.activeLayer, raw = l ? rawLayers.get(l.id) : undefined;
      if (!l || !raw) return false;
      try {
        const bmp = await createImageBitmap(await api.decode(raw.file, raw.file.name, 0, id));
        if (!engine.redevelopLayer(l.id, { source: bmp, width: bmp.width, height: bmp.height, name: raw.file.name }, 'Camera Profile')) { toast('The picture could not be developed with that profile here (the layer was changed, or the document is not 8-bit).'); return false; }
        raw.profile = id;
        return true;
      } catch (err) { toast(message(err), 'error'); return false; }
    },
  };
  const colourDialogs = { assign: new AssignProfileDialog(engine, (pr) => cmykLutFor(pr), () => convertDialog.show()), convert: convertDialog, proof: new ProofSetupDialog(colourView), mismatch: new ProfileMismatchDialog(), info: new ProfileInfoDialog(engine) };
  const preview32 = new Preview32Dialog(colourView);
  void pluginHost.loadAll();
  void folderPlugins.loadAll();
  document.body.appendChild(assistant.el);
  // The terminal dock (DEV_PLAN 28.5) with its Claude Code tabs, Chat tab and ask bar: its grid row sits above the status
  // bar and is reserved by terminal.css from the first frame; the title bar's two buttons follow its active tab.
  const termDock = new TerminalDock();
  root.insertBefore(termDock.root, q(root, '.cv-status'));
  termDock.onChange = () => { window.dispatchEvent(new Event('resize')); };
  termDock.onTab = () => { titleTools.syncDock(termDock.isOpen(), termDock.activeKind()); };
  installAgentConnect(commands, engine);
  const model3dInput = el<HTMLInputElement>('<input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" data-role="place-3d" hidden>');
  model3dInput.addEventListener('change', () => { const f = model3dInput.files?.[0]; model3dInput.value = ''; if (f) void model3d.load(f); });
  document.body.appendChild(model3dInput);
  commands.add({ id: 'edit-note', label: 'Edit Note...', enabled: () => !!engine.activeNote, run: () => noteDialog.show() });   // the Note tool (1.49.6)
  commands.add(
    { id: 'load-brushes', label: 'Load Brushes...', run: () => abrInput.click() },
    { id: 'swatch-add', label: 'Add Foreground Color to Swatches', run: () => swatches.addForeground() },
    { id: 'swatches-reset', label: 'Reset Swatches', run: () => swatches.reset() },
    { id: 'preset-manager', label: 'Preset Manager...', run: () => dialogs.presetManager.show() },
    { id: 'presets-export', label: 'Export Presets...', run: () => void dialogs.presetManager.exportAll() },
    { id: 'presets-import', label: 'Import Presets...', run: () => dialogs.presetManager.pickBundle(false) },
    { id: 'presets-migrate', label: 'Migrate Presets...', run: () => dialogs.presetManager.pickBundle(true) },
    { id: 'swatches-load', label: 'Load Swatches...', run: () => dialogs.presetManager.load('swatches') },
    { id: 'swatches-save', label: 'Save Swatches...', run: () => void dialogs.presetManager.saveSet('swatches') },
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
  const brushPicker = new BrushPicker(engine);
  engine.uiHooks.brushPicker = (x, y) => brushPicker.show(x, y);
  const guideMenu = new PopupMenu(commands, null, true);
  engine.uiHooks.guideMenu = (x, y) => { guideMenu.setItems(['edit-selected-guides', 'delete-selected-guides', '-', 'lock-guides', 'clear-artboard-guides', 'clear-guides']); guideMenu.openAt(x, y); };

  const has = (): boolean => !!engine.current;
  /** Sets type attributes for new type and, when no text is being typed, the active type layer (one undo step). */
  const typeAttr = async (patch: Partial<TextSpec>): Promise<void> => {
    const l = engine.current?.activeLayer;
    engine.textSettings = { ...engine.textSettings, ...patch };
    engine.emit('options', null);
    document.dispatchEvent(new CustomEvent('cv:type-settings'));
    if (l?.text && liveText(l) && !typing.editing) await engine.updateTextLayer(l.id, { ...l.text, ...patch });
  };
  const typeNow = (): TextSpec => { const l = engine.current?.activeLayer; return l?.text && liveText(l) ? l.text : engine.textSettings; };
  /** Type > OpenType: `tag` toggled for the characters selected while typing; else for the range start to end of every selected
   *  type layer (the whole text when no range is given), in one undo step; else for new type. `on` sets it instead of toggling. */
  const typeFeature = async (tag: string, a?: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (typing.editing && typedFeatureToggle(tag)) { engine.emit('options', null); return { scope: 'selection' }; }
    const p = engine.current, num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : undefined);
    const items = typing.editing || !p ? [] : [...p.selectedIds].flatMap((id) => { const l = p.layer(id); return l?.text && liveText(l) ? [{ id, text: l.text }] : []; });
    if (!items.length) {
      const on = typeof a?.on === 'boolean' ? a.on : !featureOn(engine.textSettings.features, tag);
      await typeAttr({ features: withFeature(engine.textSettings.features, tag, on) });
      return { scope: 'new text', on };
    }
    const from = num(a?.start), to = num(a?.end), first = items[0].text;
    const changes = items.map(({ id, text }) => {
      const len = text.content.length;
      if (from !== undefined || to !== undefined) {
        const s = Math.min(from ?? 0, len), e = Math.min(to ?? len, len), on = typeof a?.on === 'boolean' ? a.on : !runFeatureOn(first.features, first.runs, Math.min(from ?? 0, first.content.length), Math.min(to ?? first.content.length, first.content.length), tag);
        return { id, spec: { ...text, runs: withRunFeature(text.runs, s, e, tag, on) } };
      }
      const on = typeof a?.on === 'boolean' ? a.on : !featureOn(first.features, tag);
      const runs = cleanRuns(text.runs?.map((r) => ({ ...r, on: r.on.filter((x) => x !== tag), off: r.off.filter((x) => x !== tag) })), len);
      return { id, spec: { ...text, features: withFeature(text.features, tag, on), runs: runs.length ? runs : undefined } };
    });
    const n = await engine.updateTextLayers(changes, 'Edit Type');
    engine.emit('options', null);
    return { scope: from !== undefined || to !== undefined ? 'range' : 'layer', layers: n };
  };
  /** Run attributes (size, colour, face, weight, shift, tracking, language) on the characters selected while typing; else on start to end
   *  (the whole text when both are left out) of every selected type layer, one undo step. `more` adds to the runs, as a style's features do. */
  const typeRange = async (patch: ReturnType<typeof runPatchFrom>, a?: Record<string, unknown>, more?: (runs: ReturnType<typeof withRunAttrs>, s: number, e: number) => ReturnType<typeof withRunAttrs>): Promise<Record<string, unknown>> => {
    if (!Object.keys(patch).length) { toast('Give the attributes to set, such as size, color or family.'); return { layers: 0 }; }
    if (typing.editing && typedStyle(patch)) { engine.emit('options', null); return { scope: 'selection' }; }
    const p = engine.current, num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : undefined);
    const items = typing.editing || !p ? [] : [...p.selectedIds].flatMap((id) => { const l = p.layer(id); return l?.text && liveText(l) ? [{ id, text: l.text }] : []; });
    if (!items.length) { toast('Select one or more type layers, or select letters while typing.'); return { layers: 0 }; }
    const from = num(a?.start), to = num(a?.end);
    const changes = items.map(({ id, text }) => {
      const len = text.content.length, s = Math.min(from ?? 0, len), e = Math.min(to ?? len, len), runs = withRunAttrs(text.runs, s, e, patch);
      return { id, spec: { ...text, runs: more ? more(runs, s, e) : runs } };
    });
    const n = await engine.updateTextLayers(changes, 'Edit Type');
    engine.emit('options', null);
    return { scope: 'range', layers: n };
  };
  const layer = () => engine.activeLayer;
  termDock.yieldsKey = () => !!layer();   // Mod+J is Layer via Copy while a layer is open; the dock keeps it inside itself and the menu opens it otherwise
  const pixel = (): boolean => { const l = engine.activeLayer; return !!l && !l.isGroup && !l.adjustment; };
  const withPixels = (): boolean => pixel() && !!engine.activeLayer?.raster;
  const selected = (): boolean => !!engine.current?.selection;
  const allHidden = (): boolean => { const p = engine.current; return !!p && p.selectedIds.size > 0 && [...p.selectedIds].every((id) => p.layer(id)?.visible === false); };
  /** Forward and Backward Layer (1.87.3, CLOSE_GAPS P06): the layer above or below the active one among those the Layers
   *  panel shows (inside closed folders skipped); Infinity goes to the top or bottom; `add` adds it to the selection. */
  const stepLayer = (dir: number, add: boolean): void => {
    const p = engine.current;
    if (!p?.doc.layers.length) return;
    const map = new Map(p.doc.layers.map((l) => [l.id, l] as const));
    const shown = p.doc.layers.filter((l) => { for (let f = l.parentId ? map.get(l.parentId) : undefined; f; f = f.parentId ? map.get(f.parentId) : undefined) if (p.collapsed.has(f.id)) return false; return true; });
    const i = shown.findIndex((l) => l.id === p.activeId);
    const at = dir === Infinity ? shown.length - 1 : dir === -Infinity ? 0 : i < 0 ? shown.length - 1 : Math.max(0, Math.min(shown.length - 1, i + dir));
    const next = shown[at];
    if (next && next.id !== p.activeId) engine.selectLayer(next.id, add ? 'toggle' : 'replace');
  };
  const folderSelected = (): boolean => { const p = engine.current; return !!p && [...p.selectedIds].some((id) => !!p.layer(id)?.isGroup); };

  commands.add(
    { id: 'new', label: 'New Canvas...', keys: ['Alt+Mod+N', 'Mod+N'], run: () => dialogs.newCanvas.show() },
    { id: 'open', label: 'Open Project...', keys: ['Mod+O'], run: () => void dialogs.open.show() },
    { id: 'recent-heading', label: 'Open Recent', enabled: () => false, run: () => undefined },
    ...Array.from({ length: 40 }, (_, i) => ({ id: `recent-${i}`, label: () => (i < recent.length ? `${i + 1}. ${isDiskPath(recent[i]) ? baseName(recent[i]) : recent[i]}` : ''), enabled: () => i < recent.length, run: () => { const n = recent[i]; if (n) void openLibrary(n); } })),
    { id: 'clear-recent', label: 'Clear Recent', enabled: () => recent.length > 0, run: () => keepRecent([]) },
    { id: 'import', label: 'Import Images...', keys: ['Shift+Mod+O'], run: () => { imageInput.accept = [IMAGE_ACCEPT, ...decodeExtensions()].join(','); imageInput.click(); } },
    { id: 'import-folder', label: 'Import Images from Folder...', run: () => folderInput.click() },
    { id: 'import-notes', label: 'Import Notes...', enabled: has, run: () => { void importNotes(); } },
    { id: 'open-as', label: 'Open As...', params: { format: { type: 'string', description: 'The format to read the file as, by extension (png, jpg, tif, tga, dpx, cin, wbmp, dds, exr, psd); leave out to choose in the dialog.' } }, run: (a) => openAs.show(typeof a?.format === 'string' ? a.format.toLowerCase() : undefined) },
    { id: 'import-video', label: 'Video Frames to Layers...', run: () => videoDialog.show() },   // 1.58.9, L1
    { id: 'video-layer-from-file', label: 'New Video Layer from File...', enabled: () => !!engine.current, run: () => { void import('./ui/panels/video-layer-file').then((m) => m.videoLayerFromFile(engine, toast)); } },   // 33.4a
    { id: 'video-layer-blank', label: 'New Blank Video Layer', enabled: () => !!engine.current, run: () => { if (engine.newBlankVideoLayer()) toast('Blank video layer added.'); } },
    { id: 'video-insert-blank-frame', label: 'Insert Blank Frame', enabled: () => !!engine.activeLayer?.video, run: () => { engine.insertBlankFrame(); } },
    { id: 'video-duplicate-frame', label: 'Duplicate Frame', enabled: () => !!engine.activeLayer?.video, run: () => { engine.duplicateFrame(); } },
    { id: 'video-delete-frame', label: 'Delete Frame', enabled: () => !!engine.activeLayer?.video, run: () => { engine.deleteVideoFrame(); } },
    { id: 'video-restore-frame', label: 'Restore Frame', enabled: () => !!engine.activeLayer?.video, run: () => { engine.restoreFrame(); } },
    { id: 'video-reload-frame', label: 'Reload Frame...', enabled: () => !!engine.activeLayer?.video, run: () => { void import('./ui/panels/video-layer-file').then((m) => m.reloadFrameFromFile(engine, toast)); } },
    { id: 'video-restore-all', label: 'Restore All Frames', enabled: () => !!engine.activeLayer?.video, run: () => { engine.restoreAllFrames(); } },
    { id: 'video-show-altered', label: 'Show Altered Video', enabled: () => !!engine.activeLayer?.video, checked: () => !engine.activeLayer?.video?.unaltered, params: { show: { type: 'boolean', description: 'true to show the painted frames, false to show the footage as loaded; toggles when left out.' } }, run: (a) => { engine.showAlteredVideo(typeof a?.show === 'boolean' ? a.show : undefined); } },
    { id: 'video-interpret-footage', label: 'Interpret Footage...', enabled: () => { const l = engine.activeLayer; return !!l?.video && !!engine.video?.tracks[l.id]; }, run: () => { void import('./ui/panels/interpret-footage').then((m) => m.openInterpretFootage(engine)); } },   // 33.4c
    { id: 'video-replace-footage', label: 'Replace Footage...', enabled: () => !!engine.activeLayer?.video, run: () => { void import('./ui/panels/video-layer-file').then((m) => m.replaceFootageFromFile(engine, toast)); } },   // 33.4b
    { id: 'video-rasterize', label: 'Rasterize Video Layer', enabled: () => !!engine.activeLayer?.video, run: () => { engine.rasterizeVideo(); } },
    { id: 'create-video-timeline', label: 'Create Video Timeline', enabled: () => !!engine.current && !engine.video && engine.timeline.frames.length === 0, run: () => { if (engine.createVideoTimeline()) toast('Video timeline ready, a track per layer.'); } },   // 1.59.3
    { id: 'export-mp4', label: 'Video (MP4)...', enabled: () => !!engine.current, run: () => void exportMp4() },
    { id: 'render-video', label: 'Render Video...', enabled: () => !!engine.video, run: () => renderDialog.show() },   // 1.59.6
    { id: 'save', label: 'Save', keys: ['Mod+S'], enabled: has, run: () => void save(false) },
    { id: 'save-as', label: 'Save As...', keys: ['Shift+Mod+S'], enabled: has, run: () => void save(true) },
    { id: 'save-as-history', label: 'Save As with History...', enabled: has, run: () => { historyOnce = true; void save(true).finally(() => { historyOnce = false; }); } },
    { id: 'save-copy', label: 'Save a Copy...', keys: ['Alt+Mod+S'], enabled: has, run: () => { engine.settle(); dialogs.saveCopy.show(); } },
    { id: 'revert', label: 'Revert', keys: '__TAURI_INTERNALS__' in window ? ['F12'] : [], enabled: () => !!(engine.current?.libraryName || engine.current?.filePath) && !!engine.current?.modified, run: () => void revert() },
    { id: 'download-project', label: 'Download Project File', enabled: has, run: () => void downloadProject() },
    { id: 'package', label: 'Package...', enabled: has, params: { format: { type: 'string', enum: ['fvd', 'psd', 'psb'], description: 'The document inside the zip: fvd (the project, relinked), psd or psb; leave out to choose in the dialog.' }, links: { type: 'boolean', description: 'Copy linked files into Links; true when left out.' } }, run: (a) => void packageDocument(a?.format === 'fvd' || a?.format === 'psd' || a?.format === 'psb' ? { format: a.format, links: a.links !== false } : undefined) },
    { id: 'export-png', label: 'Export PNG', keys: ['Shift+Mod+E'], enabled: has, run: () => void exportImage('png') },
    { id: 'export-jpg', label: 'Export JPEG...', keys: ['Alt+Shift+Mod+S'], enabled: has, run: () => { engine.settle(); dialogs.jpeg.show((q) => void exportImage('jpg', q)); } },
    { id: 'export-as', label: 'Export As...', keys: ['Alt+Shift+Mod+W'], enabled: has, run: () => dialogs.exportAs.show() },
    { id: 'quick-export', label: 'Quick Export', enabled: has, run: () => void quickExport() },
    { id: 'export-preferences', label: 'Export Preferences...', run: () => dialogs.exportPrefs.show() },
    { id: 'layer-quick-export-png', label: 'Quick Export as PNG', enabled: () => !!engine.current?.activeId, run: () => void quickExportLayers() },
    { id: 'layer-export-as', label: 'Export As...', enabled: () => !!engine.current?.activeId, run: () => dialogs.exportAs.show(true) },
    { id: 'save-for-web', label: 'Save for Web (Legacy)...', enabled: has, run: () => { engine.settle(); dialogs.saveForWeb.show(); } },
    { id: 'script-events', label: 'Script Events Manager...', run: () => dialogs.scriptEvents.show() },
    { id: 'print', label: 'Print...', keys: ['Mod+P'], enabled: has, run: () => dialogs.print.show() },
    { id: 'print-one-copy', label: 'Print One Copy', keys: ['Alt+Shift+Mod+P'], enabled: has, run: () => { printDocument(engine, { ...printSettings, selectedArea: printSettings.selectedArea && !!engine.current?.selection }); } },
    { id: 'file-info', label: 'File Info...', keys: ['Alt+Shift+Mod+I'], enabled: has, params: FILE_INFO_PARAMS, run: (a) => fileInfoRun(a) },
    { id: 'toggle-rulers', label: () => (engine.view.rulers ? 'Hide Rulers' : 'Show Rulers'), keys: ['Mod+R'], enabled: has, run: () => engine.setView({ rulers: !engine.view.rulers }) },
    { id: 'toggle-task-bar', label: 'Contextual Task Bar', checked: () => !taskBar.hidden, run: () => taskBar.toggle() },
    { id: 'task-bar-pin', label: 'Pin Task Bar', checked: () => taskBar.pinned, run: () => taskBar.togglePin() },
    { id: 'task-bar-reset', label: 'Reset Task Bar Position', run: () => taskBar.reset() },
    { id: 'toggle-guides', label: () => (engine.view.guides ? 'Hide Guides' : 'Show Guides'), keys: ['Mod+;'], enabled: has, run: () => engine.setView({ guides: !engine.view.guides }) },
    { id: 'snap', label: 'Snap', keys: ['Shift+Mod+;'], checked: () => snapOptions.on, run: () => snapSet('on', !snapOptions.on) },
    { id: 'snap-guides', label: 'Snap To Guides', checked: () => snapOptions.guides, run: () => snapSet('guides', !snapOptions.guides) },
    { id: 'snap-grid', label: 'Snap To Grid', checked: () => snapOptions.grid, run: () => snapSet('grid', !snapOptions.grid) },
    { id: 'snap-layers', label: 'Snap To Layers', checked: () => snapOptions.layers, run: () => snapSet('layers', !snapOptions.layers) },
    { id: 'snap-bounds', label: 'Snap To Document Bounds', checked: () => snapOptions.bounds, run: () => snapSet('bounds', !snapOptions.bounds) },
    { id: 'snap-slices', label: 'Snap To Slices', checked: () => snapOptions.slices, run: () => snapSet('slices', !snapOptions.slices) },
    { id: 'snap-selection', label: 'Snap To Selection', checked: () => snapOptions.selection, run: () => snapSet('selection', !snapOptions.selection) },
    { id: 'show-smart-guides', label: 'Smart Guides', checked: () => snapOptions.smart, run: () => snapSet('smart', !snapOptions.smart) },
    { id: 'show-comfy-dot', label: 'ComfyUI Connection', checked: () => comfyDot.active, run: () => { store('formvis.comfyDot', comfyDot.active ? '0' : '1'); comfyDot.sync(); } },
    { id: 'snap-all', label: 'Snap To All', checked: () => snapOptions.guides && snapOptions.grid && snapOptions.layers && snapOptions.bounds, run: () => { const all = !(snapOptions.guides && snapOptions.grid && snapOptions.layers && snapOptions.bounds); for (const k of ['guides', 'grid', 'layers', 'bounds'] as const) snapOptions[k] = all; snapSave(); } },
    { id: 'toggle-grid', label: () => (engine.view.grid ? 'Hide Grid' : 'Show Grid'), keys: ["Mod+'"], enabled: has, run: () => engine.setView({ grid: !engine.view.grid }) },
    { id: 'grid-settings', label: 'Grid Settings...', run: () => dialogs.settings.show('Guides & Grid', true) },
    { id: 'lock-guides', label: () => (engine.view.guidesLocked ? 'Unlock Guides' : 'Lock Guides'), keys: ['Alt+Mod+;'], enabled: has, run: () => engine.setView({ guidesLocked: !engine.view.guidesLocked }) },
    { id: 'clear-guides', label: 'Clear Guides', enabled: () => !!engine.current?.doc.guides?.length, run: () => engine.clearGuides() },
    { id: 'edit-selected-guides', label: 'Edit Selected Guides...', enabled: () => engine.selectedGuides.length > 0, run: () => dialogs.editGuides.show() },
    { id: 'delete-selected-guides', label: 'Delete Selected Guides', enabled: () => engine.selectedGuides.length > 0, run: () => { engine.deleteSelectedGuides(); } },
    { id: 'clear-artboard-guides', label: 'Clear Selected Artboard Guides', enabled: () => { const b = engine.guideArtboard; return !!b && !!engine.current?.doc.guides?.some((g) => g.board === b.id); }, run: () => { if (!engine.clearArtboardGuides()) toast('The selected artboard has no guides.'); } },
    { id: 'show-artboard-guides', label: 'Artboard Guides', checked: () => engine.view.artboardGuides, run: () => engine.setView({ artboardGuides: !engine.view.artboardGuides }) },
    { id: 'toggle-show-slices', label: () => (engine.view.slices ? 'Hide Slices' : 'Show Slices'), enabled: has, run: () => engine.setView({ slices: !engine.view.slices }) },
    { id: 'toggle-extras', label: 'Extras', checked: extrasOn, run: () => setExtras(!extrasOn()) },
    { id: 'show-notes', label: 'Show Notes', checked: () => extraOn('notes'), run: () => setExtra('notes', !extraOn('notes')) },
    { id: 'show-counts', label: 'Show Count', checked: () => extraOn('counts'), run: () => setExtra('counts', !extraOn('counts')) },
    { id: 'show-selection-edges', label: 'Show Selection Edges', checked: () => extraOn('selectionEdges'), run: () => setExtra('selectionEdges', !extraOn('selectionEdges')) },
    { id: 'selection-display-tint', label: 'Selection Display: Tint', checked: selectionTintOn, run: () => setSelectionTint(!selectionTintOn()) },
    { id: 'show-layer-edges', label: 'Show Layer Edges', checked: () => extraOn('layerEdges'), run: () => setExtra('layerEdges', !extraOn('layerEdges')) },
    { id: 'show-target-path', label: 'Target Path', checked: () => extraOn('targetPath'), run: () => setExtra('targetPath', !extraOn('targetPath')) },
    { id: 'show-brush-preview', label: 'Brush Preview', checked: () => extraOn('brushPreview'), run: () => setExtra('brushPreview', !extraOn('brushPreview')) },
    { id: 'show-mesh', label: 'Mesh', checked: () => extraOn('mesh'), run: () => setExtra('mesh', !extraOn('mesh')) },
    { id: 'show-edit-pins', label: 'Edit Pins', checked: () => extraOn('pins'), run: () => setExtra('pins', !extraOn('pins')) },
    { id: 'show-extras-options', label: 'Show Extras Options...', run: () => dialogs.extrasOptions.show() },
    { id: 'show-all-extras', label: 'Show All', run: () => { setAllExtras(true); engine.setView({ guides: true, grid: true, slices: true }); } },
    { id: 'show-no-extras', label: 'Show None', run: () => { setAllExtras(false); engine.setView({ guides: false, grid: false, slices: false }); } },
    { id: 'delete-slice', label: 'Delete Slice', enabled: () => !engine.view.slicesLocked && !!engine.current?.doc.slices?.some((s) => s.id === engine.activeSlice), run: () => { engine.deleteActiveSlice(); } },
    { id: 'clear-slices', label: 'Clear Slices', enabled: () => !engine.view.slicesLocked && !!engine.current?.doc.slices?.length, run: () => engine.clearSlices() },
    { id: 'lock-slices', label: () => (engine.view.slicesLocked ? 'Unlock Slices' : 'Lock Slices'), enabled: has, run: () => engine.setView({ slicesLocked: !engine.view.slicesLocked }) },
    { id: 'toggle-auto-slices', label: () => (engine.view.autoSlices ? 'Hide Auto Slices' : 'Show Auto Slices'), enabled: has, run: () => engine.setView({ autoSlices: !engine.view.autoSlices }) },
    { id: 'slices-from-guides', label: 'Slices From Guides', enabled: () => !engine.view.slicesLocked && !!engine.current?.doc.guides?.length, run: () => { if (!engine.slicesFromGuides()) toast('Add a guide first.'); } },
    { id: 'divide-slice', label: 'Divide Slice...', enabled: () => !engine.view.slicesLocked && !!engine.current?.doc.slices?.some((s) => s.id === engine.activeSlice), run: async () => { (await import('./ui/slice-divide')).openDivideSlice(engine); } },
    { id: 'slice-options', label: 'Slice Options...', enabled: () => !!engine.current?.doc.slices?.some((s) => s.id === engine.activeSlice), run: async () => { (await import('./ui/slice-options')).openSliceOptions(engine); } },
    { id: 'layer-based-slice', label: 'New Layer Based Slice', enabled: () => !!engine.current?.activeLayer, run: () => { if (engine.addLayerSlice() && !engine.view.slices) engine.setView({ slices: true }); } },
    { id: 'new-guide', label: 'New Guide...', enabled: has, run: () => dialogs.guide.show() },
    { id: 'export-psd', label: 'Export PSD...', enabled: has, run: () => void exportPsd() },
    { id: 'export-paths-ai', label: 'Paths to AI File...', enabled: () => has() && engine.paths.list.some((p) => !p.shape && !p.mask),
      params: { path: { type: 'string', description: 'Name of one path to write; all paths when left out.' } },
      run: (a) => {
        const p = engine.current;
        if (!p) return;
        const set = engine.paths, want = a?.path ? String(a.path) : '';
        const one = want ? set.list.find((n) => n.name === want && !n.shape && !n.mask) : undefined;
        if (want && !one) { toast(`No path named "${want}".`, 'info'); return; }
        const text = pathsToAi(set, p.doc.width, p.doc.height, one ? one.id : 'all');
        void deliver(new Blob([text], { type: 'application/postscript' }), `${stripExt(p.name)}.ai`);
      } },
    { id: 'assistant', label: 'Assistant', keys: ['Alt+Mod+J'], checked: () => !assistant.el.hidden, run: () => assistant.toggle() },   // 1.52.2
    { id: 'terminal.toggle', label: 'Terminal', keys: ['Mod+J'], checked: () => termDock.isOpen(), run: () => termDock.toggle() },   // DEV_PLAN 28.5
    { id: 'terminal.new', label: 'New Terminal', run: () => void termDock.newTerminal() },
    { id: 'agent.claude.open', label: 'Claude Code', checked: () => termDock.isShowing('claude'), run: () => void termDock.toggleKind('claude') },
    { id: 'agent.chat', label: 'Chat with Claude', checked: () => termDock.isShowing('chat'), run: () => void termDock.toggleKind('chat') },
    { id: 'help', label: 'formvis Help', keys: ['F1'], run: () => help.show() },   // 1.52.3
    { id: 'whats-new', label: 'What\'s New...', run: () => whatsNew.show() },
    { id: 'pref-home-launch', label: 'Show Home Screen at Launch', checked: () => loadPrefs().autoShowHome, run: () => { updatePrefs({ autoShowHome: !loadPrefs().autoShowHome }); home.sync(); } },
    { id: 'pref-home-last-close', label: 'Show Home Screen When the Last Document Closes', checked: () => loadPrefs().homeOnLastClose, run: () => { updatePrefs({ homeOnLastClose: !loadPrefs().homeOnLastClose }); home.sync(); } },
    { id: 'pref-whats-new-auto', label: 'Show What\'s New Once After an Update', checked: () => loadPrefs().whatsNewAuto, run: () => { updatePrefs({ whatsNewAuto: !loadPrefs().whatsNewAuto }); } },
    { id: 'manage-plugins', label: 'Manage Plugins...', run: () => void pluginsDialog.show() },   // 1.52.6
    { id: 'reload-plugins', label: 'Reload Plugins', run: () => { void Promise.all([pluginHost.reloadAll(), folderPlugins.reloadAll()]).then(([a, b]) => toast(`Plugins reloaded: ${a + b} running.`)); } },
    { id: 'open-plugins-folder', label: 'Open Plugins Folder', run: () => {
      void (async () => {
        const dir = (await api.capabilities())?.dataDir;
        if (!dir) { toast('The formvis engine is offline (./formvis boot).', 'error'); return; }
        const path = `${dir.replace(/[\\/]+$/, '')}/plugins`;
        try {
          const res = await fetch('/api/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
          if (!res.ok) toast(`Plugins folder: ${path}`);
        } catch { toast(`Plugins folder: ${path}`); }
      })();
    } },
    { id: 'open-svg-layers', label: 'Open SVG as Layers...', params: { svg: { type: 'string', description: 'The SVG text to open; leave out to pick a file.' } }, run: (a) => { void openSvgLayers(typeof a?.svg === 'string' ? a.svg : null); } },
    { id: 'place-3d', label: 'Place 3D Model...', enabled: has, run: () => model3dInput.click() },   // 1.51.9
    { id: 'extrude-3d', label: 'New 3D Extrusion from Selected Layer...', enabled: () => { const l = engine.current?.activeLayer; return !!l && !l.isGroup && (!!l.vector || !!l.raster); }, run: () => void extrude3d.start() },   // DEV_PLAN 32.9
    { id: 'panorama-view', label: 'Spherical Panorama...', enabled: has, run: () => {   // DEV_PLAN 35.8
      const p = engine.current;
      if (p && Math.abs(p.doc.width / p.doc.height - 2) > 0.1) toast('This picture is not close to 2:1, so it is not a full equirectangular panorama; it opens anyway.');
      panorama.start();
    } },
    { id: 'panorama-apply-view', label: 'Apply View to Panorama', enabled: () => !!engine.current && engine.panoramaLinks.has(engine.current.id), run: () => { engine.applyPanoramaView(); } },
    { id: 'assemble-tiles', label: 'Assemble Tiles...', enabled: () => engine.projects.some((p) => p.tile), run: () => void assembleTiles() },   // 1.52.7
    { id: 'export-ora', label: 'Export OpenRaster...', enabled: has, run: () => void exportOra() },   // 1.51.7
    { id: 'export-psb', label: 'Export PSB (Large Document)...', enabled: has, run: () => void exportPsd(true) },
    { id: 'export-webp', label: 'Export WebP', enabled: has, run: () => void exportImage('webp', 0.9) },
    { id: 'export-tiff', label: 'Export TIFF', enabled: () => has() && !!caps, run: () => void exportImage('tiff', 0.9) },
    { id: 'export-tiff-layers', label: 'TIFF with Layers...', enabled: () => has(), params: { layers: { type: 'boolean', description: 'true keeps the layers, false writes a flat TIFF; left out, the TIFF Options prompt asks (unless it was turned off).' } }, run: (a) => void exportLayeredTiff(a?.layers === undefined ? undefined : a.layers === true || a.layers === 'true') },
    { id: 'export-pdf', label: 'Export PDF', enabled: () => has() && !!caps, run: () => void exportImage('pdf', 0.9) },
    { id: 'export-avif', label: 'Export AVIF', enabled: () => has() && !!caps, run: () => void exportImage('avif', 0.9) },
    { id: 'export-gif', label: 'Export GIF...', enabled: () => !!engine.current, run: () => dialogs.gif.show() },
    { id: 'new-frame', label: 'New Frame', enabled: () => !!engine.current, run: () => engine.newFrame() },
    { id: 'delete-frame', label: 'Delete Frame', enabled: () => !!engine.current && engine.timeline.frames.length > 0, run: () => engine.deleteFrame() },
    { id: 'play-animation', label: 'Play Animation', enabled: () => !!engine.current && engine.timeline.frames.length > 1, run: () => dialogs.animation.show() },
    { id: 'tween-frames', label: 'Tween...', enabled: () => { const t = engine.timeline, i = t.frames.findIndex((f) => f.id === t.current); return i >= 0 && i + 1 < t.frames.length; }, run: () => dialogs.tween.show() },
    { id: 'new-snapshot', label: 'New Snapshot', enabled: () => !!engine.current, run: () => engine.takeSnapshot() },
    { id: 'new-snapshot-merged', label: 'New Snapshot of Merged Layers', enabled: () => !!engine.current, run: () => engine.takeSnapshot(undefined, 'merged') },
    { id: 'new-snapshot-layer', label: 'New Snapshot of Current Layer', enabled: () => !!engine.current?.activeLayer, run: () => engine.takeSnapshot(undefined, 'layer') },
    { id: 'trim', label: 'Trim...', enabled: () => !!engine.current, run: () => dialogs.trim.show() },
    { id: 'reveal-all', label: 'Reveal All', enabled: () => !!engine.current, run: () => engine.revealAll() },
    {
      id: 'trap', label: 'Trap...', enabled: () => engine.current?.doc.mode === 'cmyk',
      params: { width: { type: 'number', min: 1, max: 100, description: 'Trap width; 1 to 10 pixels once converted.' }, unit: { type: 'string', enum: ['pixels', 'points', 'mm'], description: 'Unit of the width; pixels when left out.' } },
      run: (a) => {
        const p = engine.current;
        if (!p) return;
        if (a?.width === undefined) { dialogs.trap.show(); return; }
        const u = String(a.unit ?? 'pixels'), unit: TrapUnit = u === 'points' || u === 'mm' ? u : 'pixels';
        engine.trap(trapPixels(Number(a.width), unit, p.doc.resolution));
      },
    },
    { id: 'actions', label: 'Actions...', run: () => dialogs.actions.show() },
    { id: 'script-console', label: 'Script Console...', run: () => scriptConsole.show() },
    { id: 'console-log', label: 'Console...', run: () => consoleLog.show() },
    { id: 'earlier-states', label: 'Earlier States...', run: () => void earlierStates.show() },
    { id: 'action-stop', label: 'Stop Recording', enabled: () => !!actions.recording, run: () => { const x = actions.recording; actions.stop(); if (x) toast(`Recorded "${x.name}", ${x.steps.length} step${x.steps.length === 1 ? '' : 's'}.`); } },
    {
      id: 'insert-conditional', label: 'Insert Conditional...', enabled: () => actions.list.length > 0,
      params: {
        action: { type: 'string', description: 'The action that gets the step; the one being recorded, else the last one, when left out.' },
        test: { type: 'string', enum: CONDITION_TESTS.map(([t]) => t), description: 'What the document is asked: landscape, portrait, square, depth8, depth16, depth32, selection, unsaved, layers, textLayer, smartLayer or maskLayer.' },
        then: { type: 'string', description: 'The name of the action played when the test holds; leave out for nothing.' },
        else: { type: 'string', description: 'The name of the action played when it does not; leave out for nothing.' },
      },
      run: (a) => {
        const test = CONDITION_TESTS.find(([t]) => t === a?.test);
        if (!a || !test) { dialogs.actions.show(); return undefined; }
        const into = typeof a.action === 'string' && a.action ? actions.list.find((x) => x.name === a.action) : actions.recording ?? actions.list[actions.list.length - 1];
        const then = typeof a.then === 'string' ? a.then : '', other = typeof a.else === 'string' ? a.else : '';
        if (!into) throw new Error(`There is no action named "${String(a.action)}".`);
        if (!then && !other) throw new Error('Give then, else or both: the name of the action to play.');
        for (const n of [then, other]) if (n && !actions.list.some((x) => x.name === n)) throw new Error(`There is no action named "${n}".`);
        into.steps.push({ kind: 'conditional', label: `If ${test[1].toLowerCase()}`, test: test[0], then, else: other });
        actions.save();
        return { action: into.name, steps: into.steps.length };
      },
    },
    {
      id: 'insert-action-step', label: 'Insert Action Step...', enabled: () => actions.list.length > 0,
      params: {
        action: { type: 'string', description: 'The action that gets the step; the one being recorded, else the last one, when left out.' },
        kind: { type: 'string', enum: ['play', 'menu'], description: 'play adds a nested Play Action step; menu adds an Insert Menu Item step that runs one command.' },
        name: { type: 'string', description: 'For play: the name of the action to play inside this one.' },
        id: { type: 'string', description: 'For menu: the id of the command to run, from list_commands.' },
      },
      run: (a) => {
        if (!a || (a.kind !== 'play' && a.kind !== 'menu')) { dialogs.actions.show(); return undefined; }
        const into = typeof a.action === 'string' && a.action ? actions.list.find((x) => x.name === a.action) : actions.recording ?? actions.list[actions.list.length - 1];
        if (!into) throw new Error(`There is no action named "${String(a.action)}".`);
        if (a.kind === 'play') {
          const n = String(a.name ?? '');
          if (!actions.list.some((x) => x.name === n)) throw new Error(`There is no action named "${n}".`);
          into.steps.push({ kind: 'play', label: `Play ${n}`, name: n });
        } else {
          const id = String(a.id ?? ''), c = commands.get(id);
          if (!c || id === 'play-action') throw new Error(`There is no command that can be a menu item step called "${id}".`);
          into.steps.push({ kind: 'menu', label: `Menu Item: ${commands.label(c)}`, id });
        }
        actions.save();
        return { action: into.name, steps: into.steps.length };
      },
    },
    {
      id: 'action-options', label: 'Action Options...', enabled: () => actions.list.length > 0,
      params: {
        action: { type: 'string', description: 'The action to change.' },
        set: { type: 'string', description: 'The set (folder) the action belongs to; an empty string takes it out of its set.' },
        colour: { type: 'string', enum: [...ACTION_COLOURS], description: 'The color of its button in Button Mode.' },
        key: { type: 'string', enum: [...ACTION_KEYS], description: 'A function-key shortcut such as F5 or Shift+F5; an empty string clears it. Another action holding it loses it.' },
      },
      run: (a) => {
        if (!a || typeof a.action !== 'string') { dialogs.actions.show(); return undefined; }
        const x = actions.list.find((y) => y.name === a.action);
        if (!x) throw new Error(`There is no action named "${a.action}".`);
        if (typeof a.set === 'string') { const s = a.set.trim().slice(0, 80); if (s) x.set = s; else delete x.set; }
        if (typeof a.colour === 'string') { if (!(ACTION_COLOURS as readonly string[]).includes(a.colour)) throw new Error('color is not one of the listed colors.'); if (a.colour === 'none') delete x.colour; else x.colour = a.colour as typeof ACTION_COLOURS[number]; }
        if (typeof a.key === 'string') { if (!ACTION_KEYS.includes(a.key)) throw new Error('key is not one of the listed function keys.'); actions.setKey(x, a.key); }
        actions.save();
        return { name: x.name, set: x.set ?? '', colour: x.colour ?? 'none', key: x.key ?? '' };
      },
    },
    {
      id: 'load-actions', label: 'Load Actions...',
      params: {
        atn_base64: { type: 'string', description: 'The bytes of an .atn actions file, base64 encoded. Steps with no formvis equivalent are kept grayed and skipped when the action plays.' },
        json: { type: 'string', description: 'Actions in formvis JSON: an array of actions or one action.' },
      },
      run: (a) => {
        if (typeof a?.atn_base64 !== 'string' && typeof a?.json !== 'string') { dialogs.actions.show(); return undefined; }
        const more = typeof a.atn_base64 === 'string' ? parseAtn(fromBase64(a.atn_base64).slice().buffer) : { actions: actionsFrom(JSON.parse(String(a.json))), unsupported: [] as string[] };
        if (!more.actions.length) throw new Error('That holds no actions formvis can read.');
        actions.add(more.actions);
        return { loaded: more.actions.map((x) => x.name), kept_unsupported: more.unsupported };
      },
    },
    {
      id: 'export-actions-atn', label: 'Save Actions...', enabled: () => actions.list.length > 0,
      params: { set: { type: 'string', description: 'Only the actions in this set; every action when left out.' } },
      run: async (a) => {
        const set = typeof a?.set === 'string' ? a.set : '', list = set ? actions.list.filter((x) => x.set === set) : actions.list;
        if (!list.length) throw new Error(set ? `There are no actions in the set "${set}".` : 'There are no actions to save.');
        const name = set || 'formvis actions', out = writeAtn(list, name);
        await deliver(new Blob([out.bytes.slice().buffer], { type: 'application/octet-stream' }), `${name}.atn`);
        if (out.left.length) toast(`Saved ${list.length} action${list.length === 1 ? '' : 's'}. ${out.left.length} step${out.left.length === 1 ? ' has' : 's have'} no .atn form and ${out.left.length === 1 ? 'was' : 'were'} left out.`, 'info');
        return { saved: list.map((x) => x.name), left_out: out.left };
      },
    },
    {
      id: 'script-browse', label: 'Browse...',
      params: { source: { type: 'string', description: 'JavaScript to run instead of choosing a file: an async function body with run(id, params), commands() and log(...) in scope, and no document, window or network. Returns its result and log lines.' } },
      run: async (a) => {
        if (typeof a?.source !== 'string' || !a.source) { await browseScript(); return undefined; }
        if (a.source.length > 200000) throw new Error('A script may be at most 200 KB.');
        const r = await runScriptSource(a.source);
        if (!r.ok) throw new Error(r.error ?? 'The script failed.');
        return { result: r.result ?? null, log: r.log };
      },
    },
    { id: 'batch', label: 'Batch...', enabled: () => actions.list.some((x) => x.steps.length > 0), run: () => dialogs.batch.show() },
    { id: 'lens-correction-batch', label: 'Lens Correction...', run: () => dialogs.lensBatch.show() },
    {
      id: 'create-droplet', label: 'Create Droplet...', enabled: () => actions.list.length > 0,
      params: {
        action: { type: 'string', description: 'The name of the recorded action the droplet runs; leave out to choose in the dialog.' },
        format: { type: 'string', description: 'png, jpg, webp or tiff; png when left out.' },
        quality: { type: 'number', min: 1, max: 100, description: 'Quality for jpg and webp; 92 when left out.' },
        out: { type: 'string', description: 'The folder the results go to; beside each picture when left out.' },
        recursive: { type: 'boolean', description: 'Search dropped folders through their sub-folders.' },
        suffix: { type: 'string', description: 'Text added to each result file name.' },
        kind: { type: 'string', enum: ['script', 'data'], description: 'script writes the droplet shell script; data writes a droplet file (.fvdrop) that ./formvis cli droplet FILE pictures runs; script when left out.' },
      },
      run: async (a) => {
        if (typeof a?.action !== 'string' || !a.action) { dialogs.droplet.show(); return undefined; }
        if (!actions.list.some((x) => x.name === a.action)) { toast(`There is no action named "${a.action}".`, 'error'); return undefined; }
        const f = String(a.format ?? 'png').toLowerCase(), format = f === 'jpeg' ? 'jpg' : f === 'tif' ? 'tiff' : f;
        if (format !== 'png' && format !== 'jpg' && format !== 'webp' && format !== 'tiff') throw new Error('format must be png, jpg, webp or tiff.');
        await makeDroplet({ action: a.action, format, quality: typeof a.quality === 'number' ? a.quality : 92, out: typeof a.out === 'string' ? a.out : '', recursive: a.recursive === true, kind: a.kind === 'data' ? 'data' : 'script', suffix: typeof a.suffix === 'string' ? a.suffix : '' });
        return undefined;
      },
    },
    {
      id: 'open-image-data', label: 'Open Image Data', params: { name: { type: 'string', description: 'The file name, with its extension.' }, data: { type: 'string', description: 'The file bytes, base64.' } },
      run: async (a) => {
        if (!a?.data) { toast('Open Image Data needs the file bytes (data, base64).', 'error'); return undefined; }   // run bare from the menu walk or the palette: say so, do not decode nothing
        const name = String(a?.name ?? 'image.png'), bin = atob(String(a.data)), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const p = engine.openImage(await decodeImage(new Blob([bytes]), name));
        return { id: p.id };
      },
    },
    {
      id: 'export-to-file', label: 'Export to File', enabled: has,
      params: {
        format: { type: 'string', description: 'png, jpg, webp, tiff, tga or dpx for the flat picture; tiff-layers, psd, psb, ora or fvd keeps the layers; png when left out.' },
        quality: { type: 'number', min: 0, max: 100, description: 'Quality for jpg and webp; 92 when left out.' },
        name: { type: 'string', description: 'The file name; the document name when left out.' },
        options: { type: 'object', description: 'tga: bits (24 or 32, 32 when left out) and rle (true or false). dpx: bits (8, 10, 12 or 16, 10 when left out) and transfer (linear, density or log, log when left out).' },
      },
      run: async (a) => {
        const p = engine.current, f = String(a?.format ?? 'png').toLowerCase(), kind = f === 'jpeg' ? 'jpg' : f === 'tif' ? 'tiff' : f;
        if (!p) return undefined;
        if (kind === 'psd' || kind === 'psb' || kind === 'ora' || kind === 'fvd') {
          engine.settle();
          const flat = engine.flattened();
          if (!flat) throw new Error('Nothing to export.');
          if (kind !== 'ora' && kind !== 'fvd' && (p.doc.mode === 'cmyk' || p.doc.mode === 'lab')) throw new Error(`A ${p.doc.mode} document goes out as a PSD from File > Export; convert it to RGB first (mode-rgb).`);
          let layered: Blob;
          if (kind === 'ora') layered = (await writeOra(p.doc, flat, (l) => (l.adjustment ? engine.renderThrough(l.id) : engine.renderLayerAlone(l.id)))).blob;
          else if (kind === 'fvd') { const { manifest, files } = await serialize(p.doc, p.activeId, engine.pathsOf(p), engine.timelineFor(p)); layered = await api.package(manifest, files); }
          else layered = new Blob([(await writePsdFile(p.doc, flat, kind === 'psb', engine.pathsOf(p), loadExportPrefs().maximizePsd)).bytes]);
          return { path: await api.exportFile(layered, typeof a?.name === 'string' && a.name ? a.name : `${p.name}.${kind}`) };
        }
        const fileName = typeof a?.name === 'string' && a.name ? a.name : `${p.name}.${kind === 'tiff-layers' ? 'tif' : kind}`;
        if (kind === 'tiff-layers') {
          engine.settle();
          const flat = engine.flattened();
          if (!flat) throw new Error('Nothing to export.');
          return { path: await api.exportFile((await writeLayeredTiff(p.doc, flat, engine.pathsOf(p))).blob, fileName) };
        }
        if (kind === 'tga' || kind === 'dpx') {
          const o = a?.options && typeof a.options === 'object' ? a.options as Record<string, unknown> : {};
          if (kind === 'dpx') {
            const bits = Number(o.bits ?? 10), transfer = String(o.transfer ?? 'log');
            if (![8, 10, 12, 16].includes(bits)) throw new Error('options.bits for dpx must be 8, 10, 12 or 16.');
            if (transfer !== 'linear' && transfer !== 'density' && transfer !== 'log') throw new Error('options.transfer for dpx must be linear, density or log.');
            const dpx = await dpxBlob(engine, { format: 'dpx', quality: 100, scale: 100, dpxBits: bits as 8 | 10 | 12 | 16, dpxTransfer: transfer });
            if (!dpx) throw new Error('The picture could not be encoded.');
            return { path: await api.exportFile(dpx, fileName) };
          }
          const bits = Number(o.bits ?? 32);
          if (bits !== 24 && bits !== 32) throw new Error('options.bits for tga must be 24 or 32.');
          const png = await imageBlob('png', 1);
          if (!png) throw new Error('The picture could not be encoded.');
          return { path: await api.exportFile(await api.encode(png, 'tga', 100, p.doc.resolution ?? 72, null, { bits, rle: o.rle === true }), fileName) };
        }
        if (kind !== 'png' && kind !== 'jpg' && kind !== 'webp' && kind !== 'tiff') throw new Error('format must be png, jpg, webp, tiff, tiff-layers, tga, dpx, psd, psb, ora or fvd.');
        const blob = await imageBlob(kind, (typeof a?.quality === 'number' ? a.quality : 92) / 100);
        if (!blob) throw new Error('The picture could not be encoded.');
        return { path: await api.exportFile(blob, typeof a?.name === 'string' && a.name ? a.name : `${p.name}.${kind}`) };
      },
    },
    {
      id: 'play-action', label: 'Play Action', enabled: () => has() && actions.list.length > 0, params: { name: { type: 'string', description: 'The action to play on the current document; the first action when left out.' }, from: { type: 'integer', min: 1, description: 'The step to start from, counting from 1; the first step when left out.' } },
      run: async (a) => {
        const x = a?.name === undefined || a.name === '' ? actions.list[0] : actions.list.find((y) => y.name === String(a.name));
        if (!x) throw new Error(`There is no action named "${String(a?.name ?? '')}".`);
        const from = a?.from === undefined ? 1 : Number(a.from);
        if (!Number.isInteger(from) || from < 1 || from > Math.max(1, x.steps.length)) throw new Error(`from must be a step number from 1 to ${Math.max(1, x.steps.length)}.`);
        await playAction(x, from - 1);
        return { played: true, from };
      },
    },
    {
      id: 'list-actions', label: 'List Actions', params: { name: { type: 'string', description: 'An action to return the steps of; leave out for every action with its step count.' } },
      run: async (a) => {
        const rec = actions.recording?.name ?? null, step = (s: Action['steps'][number], i: number) => ({ n: i + 1, kind: s.kind, label: s.label, on: !s.off, ask: 'ask' in s && s.ask === true });
        if (a?.name !== undefined && a.name !== '') {
          const x = actions.list.find((y) => y.name === String(a.name));
          if (!x) throw new Error(`There is no action named "${String(a.name)}".`);
          return { name: x.name, relative: x.relative === true, recording: rec === x.name, steps: x.steps.map(step) };
        }
        return { recording: rec, actions: actions.list.map((x) => ({ name: x.name, steps: x.steps.length, off: x.steps.filter((s) => s.off).length, relative: x.relative === true })) };
      },
    },
    {
      id: 'close-document', label: 'Close Document', enabled: has, params: { id: { type: 'string', description: 'The id of the document to close, from get_document; the current document when left out.' } },
      run: async (a) => {
        const want = a?.id === undefined || a.id === '' ? engine.current : engine.projects.find((q) => q.id === String(a.id));
        if (!want) throw new Error(`There is no open document with the id ${String(a?.id ?? '')}: call get_document for the ids.`);
        await requestClose(want.id, 'discard');
        return { closed: want.id };
      },
    },
    {
      id: 'variables-define', label: 'Define Variable...', enabled: has,
      params: {
        name: { type: 'string', description: 'The variable name; the column heading in a data set file.' },
        layer: { type: 'string', description: 'Layer id or name the variable is bound to; the active layer when left out.' },
        kind: { type: 'string', description: 'visibility, text (type layers) or pixels (pixel layers).' },
        method: { type: 'string', description: 'For pixels: fit, fill, asis or conform; fit when left out.' },
        align: { type: 'integer', min: 0, max: 8, description: 'For pixels: where the picture sits in the layer\'s box, 0 top left to 8 bottom right; 4 (the center) when left out.' },
        clip: { type: 'boolean', description: 'For pixels: clip the picture to the layer\'s box; true when left out.' },
      },
      run: (a) => {
        if (!a || !Object.keys(a).length) { dialogs.defineVariables.show(); return undefined; }
        const p = engine.current, k = String(a?.kind ?? 'visibility').toLowerCase(), ref = a?.layer === undefined ? p?.activeId : String(a.layer);
        const l = p?.doc.layers.find((x) => x.id === ref) ?? p?.doc.layers.find((x) => x.name === ref);
        if (!l || (k !== 'visibility' && k !== 'text' && k !== 'pixels')) { toast('Give a layer and a kind: visibility, text or pixels.'); return undefined; }
        const m = String(a?.method ?? 'fit').toLowerCase(), method = m === 'fill' || m === 'asis' || m === 'conform' ? m : 'fit';
        return engine.defineVariable({ name: String(a?.name ?? l.name), layer: l.id, kind: k, method, align: typeof a?.align === 'number' ? a.align : undefined, clip: a?.clip === false ? false : undefined });
      },
    },
    {
      id: 'data-sets-import', label: 'Data Sets...', enabled: has,
      params: { text: { type: 'string', description: 'CSV or tab-separated text: the first row names the variables, each later row is a data set.' }, delimiter: { type: 'string', description: 'One character that separates the fields, or \\t for a tab; left out, the comma, semicolon, bar or tab the first row uses.' } },
      run: (a) => {
        if (a?.text !== undefined) return engine.importDataSets(String(a.text), a.delimiter === undefined ? '' : String(a.delimiter));
        dialogs.dataSets.show();
        return undefined;
      },
    },
    {
      id: 'export-data-sets', label: 'Data Sets as Files...', enabled: () => !!engine.current?.doc.dataSets?.length,
      params: {
        format: { type: 'string', description: 'png, jpg, tiff, webp or psd; png when left out.' },
        template: { type: 'string', description: 'File name template with {document}, {name} and {index}; {document}_{name} when left out.' },
      },
      run: async (a) => {
        const p = engine.current, f = String(a?.format ?? 'png').toLowerCase(), format = f === 'jpg' || f === 'jpeg' ? 'jpg' : f === 'psd' ? 'psd' : f === 'webp' ? 'webp' : f === 'tif' || f === 'tiff' ? 'tiff' : 'png';
        if (!p?.doc.dataSets?.length) { toast('Import data sets first.', 'info'); return; }
        engine.settle();
        await engine.task(async () => {
          try {
            const files = await dataSetFiles(engine, format, !!caps, undefined, a?.template === undefined ? undefined : String(a.template));
            if (!files.length) { toast('There are no data sets to export.', 'info'); return; }
            await deliver(await zipFiles(files), `${stripExt(p.name)} data sets.zip`);
            toast(`Exported ${files.length} data set${files.length === 1 ? '' : 's'} as a zip.`, 'info');
          } catch (err) { toast(message(err), 'error'); }
        });
      },
    },
    {
      id: 'data-set-apply', label: 'Apply Data Set', enabled: () => !!engine.current?.doc.dataSets?.length,
      params: { name: { type: 'string', description: 'The data set to apply; the first when left out.' } },
      run: (a) => { const sets = engine.current?.doc.dataSets ?? [], n = a?.name === undefined ? sets[0]?.name : String(a.name); return n ? engine.applyDataSet(n) : undefined; },
    },
    {
      id: 'image-processor', label: 'Image Processor...', enabled: () => true,
      params: {
        types: { type: 'string', description: 'Comma list of jpg, psd, tiff, png, webp, tga, dpx; jpg when left out.' },
        quality: { type: 'integer', min: 0, max: 12, description: 'JPEG quality 0 to 12; 10 when left out.' },
        webp_quality: { type: 'integer', min: 1, max: 100, description: 'WebP quality 1 to 100; 85 when left out.' },
        max_w: { type: 'integer', min: 1, description: 'Resize to Fit width in pixels, with max_h.' },
        max_h: { type: 'integer', min: 1, description: 'Resize to Fit height in pixels, with max_w.' },
        action: { type: 'string', description: 'Name of an action to run on each image.' },
        copyright: { type: 'string', description: 'Copyright notice written into File Info and the exported XMP.' },
      },
      run: (a) => {
        if (!a || !Object.keys(a).length) { dialogs.imageProcessor.show(); return undefined; }
        const t = String(a.types ?? 'jpg').toLowerCase(), w = Number(a.max_w) || 0, h = Number(a.max_h) || 0, fit = { on: w > 0 && h > 0, w, h };
        const x = a.action === undefined ? null : actions.list.find((v) => v.name === String(a.action)) ?? null;
        void imageProcessor({
          files: [], useOpen: true, action: x, copyright: String(a.copyright ?? '').trim(),
          jpeg: { ...fit, on: t.includes('jpg') || t.includes('jpeg'), quality: Math.min(12, Math.max(0, Math.round(Number(a.quality ?? 10)))), srgb: true },
          psd: { ...fit, on: t.includes('psd') }, tiff: { ...fit, on: t.includes('tif'), lzw: true },
          png: { ...fit, on: t.includes('png') }, webp: { ...fit, on: t.includes('webp'), quality: Math.min(100, Math.max(1, Math.round(Number(a.webp_quality ?? 85)))) },
          tga: { ...fit, on: t.includes('tga'), option: '32rle' }, dpx: { ...fit, on: t.includes('dpx'), bits: 10 },
        });
        return undefined;
      },
    },
    {
      id: 'fit-image', label: 'Fit Image...', enabled: has,
      params: {
        width: { type: 'integer', min: 1, max: 30000, description: 'The widest the picture may be, in pixels; with height.' },
        height: { type: 'integer', min: 1, max: 30000, description: 'The tallest the picture may be, in pixels; with width.' },
        enlarge: { type: 'boolean', description: 'Let a smaller picture grow to the box; true when left out (false is Don\'t Enlarge).' },
        resample: { type: 'string', enum: ['high', 'smooth', 'nearest'], description: 'The resampling method; high when left out.' },
      },
      run: (a) => {
        if (!a || a.width === undefined || a.height === undefined) { dialogs.fitImage.show(); return undefined; }
        const w = Math.round(Number(a.width)), h = Math.round(Number(a.height)), enlarge = a.enlarge !== false, sampling = a.resample === 'smooth' || a.resample === 'nearest' ? a.resample : 'high';
        if (!(w >= 1 && w <= 30000 && h >= 1 && h <= 30000)) throw new Error('Give a width and a height from 1 to 30,000 pixels.');
        if (!engine.fitImage(w, h, enlarge, false, sampling)) return undefined;
        dialogs.fitImage.onApplied?.({ w, h, enlarge });
        return { message: `Fitted within ${w} x ${h} px (${sampling}).` };
      },
    },
    {
      id: 'conditional-mode-change', label: 'Conditional Mode Change...', enabled: has,
      params: {
        from: { type: 'string', description: 'Source modes as a comma list: bitmap, grayscale, duotone, indexed, rgb, cmyk, lab, multichannel.' },
        to: { type: 'string', description: 'Target mode: rgb, cmyk, lab, grayscale, bitmap or indexed.' },
      },
      run: (a) => {
        if (!a || a.from === undefined || a.to === undefined) { dialogs.conditionalMode.show(); return undefined; }
        const known = SOURCE_MODES.map(([m]) => m), to = String(a.to).trim().toLowerCase();
        const from = String(a.from).split(',').map((x) => x.trim().toLowerCase()).filter((x): x is DocMode => known.some((m) => m === x));
        const target = known.find((m) => m === to);
        if (!from.length || !target) { toast('Give from as a comma list of modes and a target mode.'); return undefined; }
        return conditionalMode(from, target).then((ok) => { if (ok) actions.record({ kind: 'conditionalMode', label: `Conditional Mode Change to ${target}`, from, to: target }); });
      },
    },
    {
      id: 'contact-sheet', label: 'Contact Sheet II...',
      params: {
        ...SOURCE_PARAMS,
        width: { type: 'number', min: 0.01, max: 30000, description: 'Page width in unit; 2480 px (A4 at 300 ppi) when left out.' },
        height: { type: 'number', min: 0.01, max: 30000, description: 'Page height in unit; 3508 px when left out.' },
        unit: { type: 'string', enum: ['px', 'in', 'cm', 'mm'], description: 'Unit of width and height; px when left out.' },
        ppi: { type: 'number', min: 1, max: 3000, description: 'Resolution; 300 when left out.' },
        columns: { type: 'integer', min: 1, max: 100, description: 'Columns of thumbnails; 5 when left out.' },
        rows: { type: 'integer', min: 1, max: 100, description: 'Rows of thumbnails; 6 when left out.' },
        spacing: { type: 'number', min: 0, max: 1000, description: 'Gap in pixels between thumbnails; automatic when left out.' },
        order: { type: 'string', enum: ['across', 'down'], description: 'Place across first (row by row) or down first; across when left out.' },
        rotate: { type: 'boolean', description: 'Rotate For Best Fit.' },
        captions: { type: 'boolean', description: 'Use the file name as a caption; true when left out.' },
        font: { type: 'string', description: 'Caption font family; Inter when left out.' },
        font_size: { type: 'integer', min: 6, max: 400, description: 'Caption size in pixels; 12 when left out.' },
        flatten: { type: 'boolean', description: 'Flatten All Layers into one layer per page.' },
        mode: { type: 'string', enum: ['rgb', 'grayscale'], description: 'Document mode of each page; rgb when left out.' },
        depth: { type: 'integer', enum: [8, 16], description: 'Bit depth of each page; 8 when left out.' },
      },
      run: async (a) => {
        if (!a || !Object.keys(a).length) { dialogs.contactSheet.show(); return undefined; }
        const files = await sourceFiles(a);
        if (!files.length && a.documents !== true) throw new Error('Give files (picture bytes) or documents=true.');
        await dialogs.contactSheet.drive(files, a);
        return undefined;
      },
    },
    {
      id: 'load-files-stack', label: 'Load Files into Stack...',
      params: { ...SOURCE_PARAMS, smart: { type: 'boolean', description: 'Create Smart Object after Loading Layers.' }, align: { type: 'boolean', description: 'Attempt to Automatically Align Source Images.' } },
      run: async (a) => {
        if (!a || !Object.keys(a).length) { dialogs.loadStack.show(); return undefined; }
        await dialogs.loadStack.drive(await sourceFiles(a), a);
        return undefined;
      },
    },
    {
      id: 'stack-statistics', label: 'Statistics...',
      params: { ...SOURCE_PARAMS, mode: { type: 'string', enum: STACK_MODES.filter((m) => m.id !== 'none').map((m) => m.id), description: 'The statistic over the aligned layers; median when left out.' }, align: { type: 'boolean', description: 'Attempt to Automatically Align Source Images.' } },
      run: async (a) => {
        if (!a || !Object.keys(a).length) { dialogs.stackStatistics.show(); return undefined; }
        await dialogs.stackStatistics.drive(await sourceFiles(a), a);
        return undefined;
      },
    },
    { id: 'crop-straighten-photos', label: 'Crop and Straighten Photos', enabled: has, run: async () => {   // DEV_PLAN 30.3 part b
      const p = engine.current, flat = engine.flattened();
      if (!p || !flat) return;
      const sel = p.selection?.rect, r = sel && sel.w > 1 && sel.h > 1 ? { x: Math.max(0, Math.floor(sel.x)), y: Math.max(0, Math.floor(sel.y)), w: Math.ceil(sel.w), h: Math.ceil(sel.h) } : null;
      const src = r ? createSurface(r.w, r.h) : flat;
      if (r) ctxOf(src).drawImage(flat as CanvasImageSource, -r.x, -r.y);
      const base = p.name;
      try {
        const found = await api.cropPhotos(await toBlob(src));
        if (!found.length) { engine.notice('No photos were found on a plain background.'); return; }
        for (let i = 0; i < found.length; i++) {
          const f = found[i], bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${f.png}`)).blob()), name = i === 0 ? `${base} copy` : `${base} copy ${i + 1}`;
          engine.openImage({ source: bmp, width: bmp.width, height: bmp.height, name }).name = name;
        }
        engine.notice(`Found ${found.length} photo${found.length === 1 ? '' : 's'}, each opened as its own document.`);
      } catch (err) { toast(message(err), 'error'); }
    } },
    {
      id: 'photomerge', label: 'Photomerge...',   // 1.58.2
      params: {
        ...SOURCE_PARAMS,
        layout: { type: 'string', enum: ['auto', 'perspective', 'cylindrical', 'collage', 'reposition'], description: 'How the photos are joined; auto when left out.' },
        crop: { type: 'boolean', description: 'Crop to the largest rectangle the photos fill (else the edges stay transparent).' },
        fill: { type: 'boolean', description: 'Fill the transparent edges and gaps of the joined picture by Selection-Aware Fill; off when left out, not used with layers.' },
        layers: { type: 'boolean', description: 'Open one layer per photo, each with a seam mask, instead of one joined picture.' },
        vignette: { type: 'boolean', description: 'Vignette Removal; needs photos of one size.' },
        distortion: { type: 'boolean', description: 'Geometric Distortion Correction.' },
      },
      run: async (a) => {
        if (!a || !Object.keys(a).length) { photomergeDialog.show(); return undefined; }
        await photomergeDialog.drive(await sourceFiles(a), a);
        return undefined;
      },
    },
    ...(['align', 'blend'] as const).map((mode) => ({   // DEV_PLAN 32.1
      id: mode === 'align' ? 'auto-align-layers' : 'auto-blend-layers', label: mode === 'align' ? 'Auto-Align Layers...' : 'Auto-Blend Layers...',
      enabled: () => { const p = engine.current; return !!p && [...p.selectedIds].filter((id) => { const l = p.layer(id); return !!l?.raster && !l.isGroup && !l.adjustment && !l.text && !l.shape && !l.smart; }).length > 1; },
      params: (mode === 'align' ? {
        projection: { type: 'string' as const, enum: ['auto', 'perspective', 'cylindrical', 'spherical', 'collage', 'reposition'], description: 'Projection; auto when left out. Cylindrical and spherical find the focal length and bend every layer onto a cylinder or a sphere; collage moves, turns and scales each layer; reposition only moves layers.' },
        reference: { type: 'string' as const, enum: ['bottom', 'middle', 'top'], description: 'Which selected layer stays put; bottom when left out.' },
        vignette: { type: 'boolean' as const, description: 'Vignette Removal; off when left out.' },
        distortion: { type: 'boolean' as const, description: 'Geometric Distortion Correction: straighten the lens bend the overlaps show; off when left out.' },
        registration: { type: 'string' as const, enum: ['features', 'intensity'], description: 'Registration: features (SIFT or ORB matches) or intensity (refines by image correlation, works with few features); features when left out.' },
      } : {
        method: { type: 'string' as const, enum: ['panorama', 'stack', 'multiband'], description: 'Blend method: panorama (soft seams), stack (sharpest layer, for focus stacking) or multiband (a pyramid blend into a new layer); panorama when left out.' },
        seamless: { type: 'boolean' as const, description: 'Seamless Tones and Colors: match each layer\'s tones to the reference; on when left out.' },
        spatial: { type: 'boolean' as const, description: 'With seamless: follow how the tone difference changes across the overlap (a smooth gain field) instead of one gain per layer; on when left out.' },
        halo: { type: 'number' as const, min: 0, max: 100, description: 'Halo Control for stack: 0 is the soft default, higher keeps the transitions on the sharp edges.' },
        depth: { type: 'boolean' as const, description: 'Stack: add a hidden Depth Map layer showing which layer is sharpest where; off when left out.' },
      }) as NonNullable<Command['params']>,
      run: (a?: Record<string, unknown>) => import('./ui/panels/align-blend-dialog').then(async (m) => {
        if (!a || !Object.keys(a).length) { m.AlignBlendDialog.get(engine, mode).show(); return undefined; }
        return { message: await m.AlignBlendDialog.execute(engine, mode, { projection: a.projection === undefined ? undefined : String(a.projection), method: a.method === undefined ? undefined : String(a.method), seamless: a.seamless === undefined ? true : !!a.seamless, spatial: a.spatial === undefined ? true : !!a.spatial, vignette: !!a.vignette, distortion: !!a.distortion, registration: a.registration === undefined ? undefined : String(a.registration), reference: a.reference === undefined ? undefined : String(a.reference), halo: typeof a.halo === 'number' ? a.halo : undefined, depth: !!a.depth }) };
      }),
    })),
    {
      id: 'merge-hdr', label: 'Merge to HDR...',
      params: {
        ...SOURCE_PARAMS,
        align: { type: 'boolean', description: 'Attempt to Automatically Align Source Images; true when left out.' },
        times: { type: 'string', description: 'Exposure times in seconds, one per photo, comma separated, as numbers or 1/60; from the photos when left out.' },
        depth: { type: 'integer', enum: [32, 16, 8], description: 'Bit depth of the result; 32 keeps the radiance, 16 or 8 tone it down. 32 when left out.' },
        ghost: { type: 'number', min: 0, max: 100, description: 'Remove ghosts: 0 is off; higher takes moving objects from the base photo at smaller disagreements. 0 when left out.' },
        method: { type: 'string', enum: ['exposure', 'highlights', 'equalize'], description: 'Toning at 16 or 8 bit: exposure (Exposure and Gamma), highlights (Highlight Compression) or equalize (Equalize Histogram). exposure when left out.' },
        exposure: { type: 'number', min: -20, max: 20, description: 'Exposure in stops for the exposure method at 16 or 8 bit. 0 when left out.' },
        gamma: { type: 'number', min: 0.1, max: 9.99, description: 'Gamma for the exposure method at 16 or 8 bit. 1 when left out.' },
        base: { type: 'integer', min: 1, description: 'Ghost base: the photo (1 is the first) that moving areas are taken from; the middle exposure when left out.' },
      },
      run: async (a) => {
        if (!a || !Object.keys(a).length) { hdrMergeDialog.show(); return undefined; }
        await hdrMergeDialog.drive(await sourceFiles(a), a);
        return undefined;
      },
    },
    { id: 'send-host', label: 'Send to NodeMode Canvas', enabled: () => has() && hostLink.embedded, run: () => void sendToHost() },
    // Standalone (1.50.8): the engine sends to the NodeMode at the address in Preferences > Plugins.
    { id: 'send-nodemode', label: 'Send to NodeMode...', enabled: has, run: () => sendNodeMode.show() },
    { id: 'send-comfyui', label: 'Send to ComfyUI...', enabled: () => has() && !caps?.switches?.noComfy, run: () => sendComfyUI.show() },   // 1.50.9; off with the engine's --no-comfy
    { id: 'comfyui-run', label: 'Run ComfyUI Workflow...', enabled: () => has() && !caps?.switches?.noComfy, run: () => runWorkflow.show() },   // 1.51.1
    // the File > Close is Cmd-W. A browser keeps Ctrl/Cmd-W for its own tab (the unload guard covers that),
    // so the web binds Alt+Mod+W; the desktop shell, with no browser tab, takes Mod+W, and Alt+Mod+W is Close All there.
    { id: 'close-tab', label: 'Close Tab', keys: '__TAURI_INTERNALS__' in window ? ['Mod+W'] : ['Alt+Mod+W'], enabled: has, run: () => { const p = engine.current; if (p && !engine.closeSpareView(p.id)) void requestClose(p.id); } },
    { id: 'close-all', label: 'Close All', keys: '__TAURI_INTERNALS__' in window ? ['Alt+Mod+W'] : [], enabled: has, run: () => void closeMany(null) },
    { id: 'close-others', label: 'Close Others', keys: ['Alt+Mod+P'], enabled: () => engine.projects.length > 1, run: () => { const p = engine.current; if (p) void closeMany(p.id); } },
    { id: 'close-tabs-right', label: 'Close Tabs to the Right', enabled: () => { const at = engine.projects.findIndex((x) => x.id === engine.current?.id); return at >= 0 && engine.projects.slice(at + 1).some((x) => !tabs.isPinned(x.id)); }, run: () => void (async () => {
      const from = engine.current;
      for (const p of engine.projects.slice(engine.projects.findIndex((x) => x.id === from?.id) + 1)) {
        if (tabs.isPinned(p.id) || !engine.projects.includes(p)) continue;
        if (!(await requestClose(p.id))) return;
      }
      if (from && engine.projects.includes(from)) engine.switchTo(from.id);
    })() },
    { id: 'pin-tab', label: () => (engine.current && tabs.isPinned(engine.current.id) ? 'Unpin Tab' : 'Pin Tab'), checked: () => !!engine.current && tabs.isPinned(engine.current.id), enabled: has, run: () => { if (engine.current) tabs.togglePin(engine.current.id); } },
    { id: 'exit', label: 'Exit', keys: hasPanels() ? ['Mod+Q'] : [], run: () => void exitApp() },
    {
      id: 'reopen-closed-tab', label: 'Reopen Closed Tab', keys: ['__TAURI_INTERNALS__' in window ? 'Shift+Mod+T' : 'Alt+Shift+Mod+T'], enabled: () => closedTabs.length > 0,
      run: async () => {
        const r = closedTabs.pop();
        if (!r) return;
        const p = await reopen(r, r.name);
        if (p) engine.switchTo(p.id); else closedTabs.push(r);
      },
    },
    { id: 'new-workspace', label: 'New Workspace...', run: async () => {
      const name = await promptName('New Workspace', '', 'Save');
      if (!name?.trim()) return;
      const l = dock.layout;
      titleTools.addCustom(name, l.order, l.hidden, stored('formvis.propsCol') !== 'hidden', l.floats);
      toast(`Workspace "${name.trim()}" saved.`);
    } },
    { id: 'delete-workspace', label: 'Delete Workspace', enabled: () => titleTools.isCustom(titleTools.currentId()), run: async () => {
      const id = titleTools.currentId(), w = titleTools.all().find((x) => x.id === id);
      if (!w || !titleTools.isCustom(id)) return;
      if (await confirmAction('Delete Workspace', `Delete the workspace "${w.label}"?`, 'Delete', true)) titleTools.removeCustom(id);
    } },
    { id: 'workspace-pixelart', label: 'Pixel Art Workspace', run: () => { const w = titleTools.all().find((x) => x.id === 'pixelart'); if (w) titleTools.choose(w.id); } },
    { id: 'next-document', label: 'Next Document', keys: ['Mod+Tab'], enabled: () => engine.projects.length > 1, run: () => stepDocument(1) },
    { id: 'previous-document', label: 'Previous Document', keys: ['Shift+Mod+Tab'], enabled: () => engine.projects.length > 1, run: () => stepDocument(-1) },
    { id: 'theme-sync-system', label: 'Sync Theme with System', checked: () => stored(THEME_SYNC_KEY) === '1', run: () => { store(THEME_SYNC_KEY, stored(THEME_SYNC_KEY) === '1' ? '0' : '1'); applySystemTheme(); } },
    ...Object.entries(THEMES).map(([tid, th]) => ({ id: `theme-${tid}`, label: `Theme: ${th.label}`, checked: () => readChoice().theme === tid, run: () => { if (readChoice().theme !== tid) setTheme(tid); } })),
    { id: 'interface-darken', label: 'Darken Interface', keys: ['Shift+Mod+F1'], enabled: () => themeStep(-1) !== null, run: () => { const id = themeStep(-1); if (id) setTheme(id); } },
    { id: 'interface-lighten', label: 'Lighten Interface', keys: ['Shift+Mod+F2'], enabled: () => themeStep(1) !== null, run: () => { const id = themeStep(1); if (id) setTheme(id); } },
    { id: 'next-appearance', label: 'Next Appearance Mode', run: () => {
      // Dark, then Light, then Auto (follows the system), then Dark again.
      if (stored(THEME_SYNC_KEY) === '1') { store(THEME_SYNC_KEY, '0'); setTheme('studio'); toast('Appearance: Dark'); }
      else if (THEMES[readChoice().theme]?.light) { store(THEME_SYNC_KEY, '1'); applySystemTheme(); toast('Appearance: Auto'); }
      else { setTheme('light'); toast('Appearance: Light'); }
    } },
    { id: 'reload-window', label: 'Reload Window', run: async () => {
      // Documents come back by the Restore Session preference; unsaved work is asked about first.
      const dirty = engine.projects.filter((p) => p.modified).length;
      if (dirty && !(await confirmAction('Reload Window', `${dirty === 1 ? 'A document has' : `${dirty} documents have`} unsaved changes that a reload would lose. Reload anyway?`, 'Reload', true))) return;
      window.location.reload();
    } },
    { id: 'developer-tools', label: 'Developer Tools', keys: '__TAURI_INTERNALS__' in window ? ['Alt+Mod+I'] : [], run: async () => {
      // The desktop window opens its web inspector; a browser tab has its own, which F12 already opens.
      if (!('__TAURI_INTERNALS__' in window)) { toast('Press F12 or use the browser menu to open its developer tools.'); return; }
      try { await (await import('@tauri-apps/api/core')).invoke('plugin:webview|internal_toggle_devtools'); } catch { toast('The inspector could not be opened in this window.', 'error'); }
    } },
    { id: 'cycle-tool-mode', label: 'Cycle Tool Mode', keys: ['Alt+Shift+M'], run: () => {
      // The first mode list the tool shows in the options bar (marquee kind, selection mode, blend, and the like) moves to its next choice.
      const spec = getTool(engine.tool)?.options?.(engine).find((o) => (o.kind === 'segment' || o.kind === 'select') && o.choices.length > 1 && (!o.when || o.when()));
      if (!spec || (spec.kind !== 'segment' && spec.kind !== 'select')) return;
      const ids = (spec.kind === 'select' && spec.live ? spec.live() : spec.choices).map((c) => c.id), at = ids.indexOf(spec.get());
      spec.set(ids[(at + 1) % ids.length]);
      engine.emit('options', null);
    } },
    { id: 'panel-color', label: 'Color', keys: ['F6'], run: () => { if (!dock.isShown('swatches')) dock.toggle('swatches'); swatches.showTab('color'); } },
    { id: 'panel-channels', label: 'Channels', run: () => { if (!dock.isShown('layers')) dock.toggle('layers'); layers.showTab('channels'); } },
    { id: 'undo', label: () => { const h = engine.current?.history; return stage.toolUndo(true) ? 'Undo Pen Point' : h?.canUndo ? `Undo ${h.undoName}` : 'Undo'; }, keys: ['Mod+Z'], enabled: () => stage.toolUndo(true) || !!engine.current?.history.canUndo, run: () => { if (!stage.toolUndo()) engine.undo(); } },
    { id: 'redo', label: () => { const h = engine.current?.history; return h?.canRedo ? `Redo ${h.redoName}` : 'Redo'; }, keys: ['Shift+Mod+Z', 'Mod+Y'], enabled: () => !!engine.current?.history.canRedo, run: () => engine.redo() },
    { id: 'compare-documents', label: 'Compare with...', enabled: () => !!engine.current && engine.projects.length > 1, run: () => dialogs.compare.show() },
    { id: 'toggle-last-state', label: 'Toggle Last State', keys: ['Alt+Mod+Z'], enabled: () => !!engine.current?.history.canUndo || !!engine.current?.history.canRedo, run: () => engine.toggleLastState() },
    { id: 'peek-original', label: 'Show Opening State', enabled: () => !!engine.current && engine.snapshots.length > 0, checked: () => stage.comparing === 'peek',
      params: { snapshot: { type: 'string', description: 'A snapshot id from the History panel; the opening snapshot when left out.' } },
      run: (a) => {
        if (stage.comparing === 'peek') { stage.compare(null); return { comparing: null }; }
        if (!stage.compare('peek', typeof a?.snapshot === 'string' ? a.snapshot : undefined)) throw new Error('No snapshot is kept to show: New Snapshot takes one.');
        return { comparing: 'peek' };
      } },
    { id: 'compare-split', label: 'Compare with Snapshot (Split)', enabled: () => !!engine.current && engine.snapshots.length > 0, checked: () => stage.comparing === 'split',
      params: { snapshot: { type: 'string', description: 'A snapshot id from the History panel; the opening snapshot when left out.' } },
      run: (a) => {
        if (stage.comparing === 'split') { stage.compare(null); return { comparing: null }; }
        if (!stage.compare('split', typeof a?.snapshot === 'string' ? a.snapshot : undefined)) throw new Error('No snapshot is kept to compare with: New Snapshot takes one.');
        return { comparing: 'split' };
      } },
    { id: 'composite-pixel', label: 'Read Composite Pixel', enabled: () => !!engine.current,
      params: { x: { type: 'number', required: true, description: 'Document column of the pixel.' }, y: { type: 'number', required: true, description: 'Document row of the pixel.' } },
      run: (a) => {
        const x = Math.floor(Number(a?.x)), y = Math.floor(Number(a?.y)), px = engine.compositePixel({ x, y });
        if (!px) throw new Error('x and y must lie inside the canvas.');
        return { x, y, ...px, hex: `#${[px.r, px.g, px.b].map((n) => n.toString(16).padStart(2, '0')).join('')}` };
      } },
    { id: 'fade', label: () => { const n = engine.fadeName; return n ? `Fade ${n}...` : 'Fade...'; }, keys: ['Shift+Mod+F'], enabled: () => !!engine.fadeName, run: () => dialogs.fade.show() },
    { id: 'fill-fg', label: 'Fill with Foreground', keys: ['Alt+Backspace', 'Alt+Delete'], enabled: pixel, run: () => engine.fill('fg') },
    { id: 'fill-bg', label: 'Fill with Background', keys: ['Mod+Backspace', 'Mod+Delete'], enabled: pixel, run: () => engine.fill('bg') },
    { id: 'fill-fg-keep', label: 'Fill with Foreground, Keep Transparency', keys: ['Alt+Shift+Backspace', 'Alt+Shift+Delete'], enabled: pixel, run: () => engine.fillWith({ color: { ...engine.fg } }, 'normal', 1, true) },
    { id: 'fill-bg-keep', label: 'Fill with Background, Keep Transparency', keys: ['Shift+Mod+Backspace', 'Shift+Mod+Delete'], enabled: pixel, run: () => engine.fillWith({ color: { ...engine.bg } }, 'normal', 1, true) },
    { id: 'fill-history', label: 'Fill with History', keys: ['Alt+Mod+Backspace', 'Alt+Mod+Delete'], enabled: pixel, run: () => engine.fillWith({ history: true }, 'normal', 1, false) },
    { id: 'fill-dialog', label: 'Fill...', keys: ['Shift+F5'], enabled: pixel, run: () => dialogs.fill.show() },
    { id: 'content-fill-workspace', label: 'Selection-Aware Fill...', enabled: () => pixel() && selected(), run: () => dialogs.contentFill.show() },
    { id: 'cancel-job', label: 'Cancel Background Job', enabled: () => engine.jobs.some((j) => !j.cancelled), run: () => { const n = engine.cancelJob(); if (n) toast(n === 1 ? 'Stopping the running job.' : `Stopping ${n} running jobs.`); } },
    { id: 'clone-source-slot', label: 'Clone Source: Choose Slot', params: { slot: { type: 'integer', required: true, min: 1, max: 5, description: 'Which of the five clone sources to use.' } }, run: (a) => { engine.selectCloneSlot(Math.round(Number(a?.slot)) - 1); } },
    { id: 'clone-source-set', label: 'Clone Source: Set Source', params: { x: { type: 'number', description: 'Document x of the source point; the current point when left out.' }, y: { type: 'number', description: 'Document y of the source point; the current point when left out.' }, width: { type: 'number', min: 1, max: 1000, description: 'Source width in percent.' }, height: { type: 'number', min: 1, max: 1000, description: 'Source height in percent; follows the width when left out and the two are linked.' }, angle: { type: 'number', min: -180, max: 180, description: 'Source angle in degrees.' }, flipH: { type: 'boolean', description: 'Flip the source horizontally.' }, flipV: { type: 'boolean', description: 'Flip the source vertically.' } }, run: (a) => {
      const r = engine.retouch, num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      const w = num(a?.width), h = num(a?.height), ang = num(a?.angle);
      if (w !== null) r.cloneScale = Math.min(1000, Math.max(1, w));
      if (h !== null) r.cloneScaleY = Math.min(1000, Math.max(1, h));
      if (ang !== null) r.cloneAngle = Math.min(180, Math.max(-180, ang));
      if (typeof a?.flipH === 'boolean') r.cloneFlipH = a.flipH;
      if (typeof a?.flipV === 'boolean') r.cloneFlipV = a.flipV;
      const cur = engine.cloneSource, x = num(a?.x) ?? cur?.x, y = num(a?.y) ?? cur?.y;
      if (x !== undefined && y !== undefined) engine.setCloneSource({ x, y }); else { engine.emit('options', null); engine.emit('overlay', null); }
    } },
    { id: 'clone-source-overlay', label: 'Clone Source: Overlay', params: { show: { type: 'boolean', description: 'Show the overlay.' }, opacity: { type: 'number', min: 0, max: 100, description: 'Overlay opacity in percent.' }, clipped: { type: 'boolean', description: 'Keep the overlay to the brush.' }, autoHide: { type: 'boolean', description: 'Hide the overlay while painting.' }, invert: { type: 'boolean', description: 'Invert the overlay.' } }, run: (a) => {
      const patch: Partial<{ show: boolean; clipped: boolean; opacity: number; autoHide: boolean; invert: boolean }> = {};
      if (typeof a?.show === 'boolean') patch.show = a.show;
      if (typeof a?.clipped === 'boolean') patch.clipped = a.clipped;
      if (typeof a?.autoHide === 'boolean') patch.autoHide = a.autoHide;
      if (typeof a?.invert === 'boolean') patch.invert = a.invert;
      if (typeof a?.opacity === 'number' && Number.isFinite(a.opacity)) patch.opacity = Math.min(100, Math.max(0, a.opacity)) / 100;
      engine.setCloneOverlay(patch);
    } },
    { id: 'clone-source-reset', label: 'Clone Source: Reset Transform', run: () => engine.resetCloneTransform() },
    { id: 'match-edges-below', label: 'Match Edges to Layer Below', enabled: pixel, run: () => { void engine.task(async () => { await new Promise((r) => requestAnimationFrame(() => window.setTimeout(r, 0))); engine.matchEdgesBelow(); }); } },
    { id: 'remove-wires', label: 'Remove Wires and Cables', enabled: pixel, run: () => { void engine.task(async () => { await new Promise((r) => requestAnimationFrame(() => window.setTimeout(r, 0))); engine.removeWires(); }); } },
    { id: 'transform-warp', label: 'Warp', enabled: pixel, run: (a) => { engine.setTool('move'); if (engine.beginMeshWarp(typeof a?.grid === 'number' ? a.grid : engine.meshWarpGrid) && typeof a?.style === 'string') engine.setMeshWarpPreset({ style: a.style as 'custom', ...(typeof a.bend === 'number' ? { bend: a.bend } : {}), ...(typeof a.horizontal === 'number' ? { horizontal: a.horizontal } : {}), ...(typeof a.vertical === 'number' ? { vertical: a.vertical } : {}), ...(a.orientation === 'vertical' ? { orientation: 'vertical' as const } : {}) }); } },
    { id: 'warp-split-h', label: 'Split Warp Horizontally', enabled: () => !!engine.meshWarpEdit, run: (a) => { engine.splitMeshWarp('h', typeof a?.x === 'number' && typeof a?.y === 'number' ? { x: a.x, y: a.y } : engine.meshSplitPoint()); } },
    { id: 'warp-split-v', label: 'Split Warp Vertically', enabled: () => !!engine.meshWarpEdit, run: (a) => { engine.splitMeshWarp('v', typeof a?.x === 'number' && typeof a?.y === 'number' ? { x: a.x, y: a.y } : engine.meshSplitPoint()); } },
    { id: 'warp-split-cross', label: 'Split Warp Crosswise', enabled: () => !!engine.meshWarpEdit, run: (a) => { engine.splitMeshWarp('cross', typeof a?.x === 'number' && typeof a?.y === 'number' ? { x: a.x, y: a.y } : engine.meshSplitPoint()); } },
    { id: 'warp-remove-split', label: 'Remove Warp Split', enabled: () => !!engine.meshWarpEdit, run: () => { engine.removeMeshWarpSplit(); } },
    { id: 'transform-again', label: 'Again', keys: ['Shift+Mod+T'], enabled: () => engine.canTransformAgain, run: () => { engine.transformAgain(); } },
    { id: 'transform-again-copy', label: 'Transform Again on a Copy', keys: ['Alt+Shift+Mod+T'], enabled: () => engine.canTransformAgain, run: () => { engine.transformAgain(true); } },
    { id: 'transform-scale', label: 'Scale', enabled: () => (!!engine.activeLayer || engine.pathTarget) && !engine.floatingSelection, run: () => engine.beginTransformMode('scale') },
    { id: 'transform-rotate', label: 'Rotate', enabled: () => (!!engine.activeLayer || engine.pathTarget) && !engine.floatingSelection, run: () => engine.beginTransformMode('rotate') },
    { id: 'transform-skew', label: 'Skew', enabled: () => !!engine.activeLayer || engine.pathTarget, run: () => { engine.beginDistortMode('skew'); } },
    { id: 'transform-distort', label: 'Distort', enabled: () => !!engine.activeLayer || engine.pathTarget, run: () => { engine.beginDistortMode('distort'); } },
    { id: 'transform-perspective', label: 'Perspective', enabled: () => !!engine.activeLayer || engine.pathTarget, run: () => { engine.beginDistortMode('perspective'); } },
    { id: 'transform-numeric', label: 'Numerically...', enabled: () => !!engine.activeLayer && !engine.pathTarget && !engine.floatingSelection && !engine.distortEdit,
      run: (a) => {
        const n = (k: string): number | undefined => (typeof a?.[k] === 'number' ? (a[k] as number) : undefined);
        const keys = ['ref', 'moveX', 'moveY', 'scaleX', 'scaleY', 'angle', 'skewH', 'skewV', 'perspH', 'perspV'] as const;
        const m = Array.isArray(a?.matrix) && a.matrix.length === 6 ? (a.matrix as unknown[]).map(Number) : undefined;
        if (m || keys.some((k) => n(k) !== undefined)) engine.transformLayerBy({ ref: n('ref'), moveX: n('moveX'), moveY: n('moveY'), scaleX: n('scaleX'), scaleY: n('scaleY'), angle: n('angle'), skewH: n('skewH'), skewV: n('skewV'), perspH: n('perspH'), perspV: n('perspV'), matrix: m });
        else dialogs.layerTransform.show();
      } },
    { id: 'layer-rotate-180', label: 'Rotate 180°', enabled: () => (!!engine.activeLayer || engine.pathTarget) && !engine.distortEdit, run: () => { engine.rotateLayers(2); } },
    { id: 'layer-rotate-90-cw', label: 'Rotate 90° Clockwise', enabled: () => (!!engine.activeLayer || engine.pathTarget) && !engine.distortEdit, run: () => { engine.rotateLayers(1); } },
    { id: 'layer-rotate-90-ccw', label: 'Rotate 90° Counter Clockwise', enabled: () => (!!engine.activeLayer || engine.pathTarget) && !engine.distortEdit, run: () => { engine.rotateLayers(3); } },
    { id: 'perspective-warp', label: 'Perspective Warp', enabled: pixel, run: () => { engine.setTool('move'); if (engine.beginPerspectiveWarp()) toast('Layout: drag to draw planes over the picture and fit their corners to it. Then choose Warp in the options bar and move the corners. Enter applies, Escape cancels.'); } },
    { id: 'puppet-warp', label: 'Puppet Warp', enabled: pixel, run: (a) => { engine.setTool('move'); if (engine.beginPuppetWarp() && a) engine.setPuppetOpts({ ...(a.mode === 'normal' || a.mode === 'distort' || a.mode === 'rigid' ? { mode: a.mode } : {}), ...(a.density === 'fewer' || a.density === 'normal' || a.density === 'more' ? { density: a.density } : {}), ...(typeof a.expansion === 'number' ? { expansion: a.expansion } : {}), ...(typeof a.showMesh === 'boolean' ? { showMesh: a.showMesh } : {}) }); if (engine.puppetEdit) toast('Click to place pins, drag them to bend the layer, Alt-click to remove one. Enter applies, Escape cancels.'); } },
    { id: 'filter-liquify', label: 'Liquify...', keys: ['Shift+Mod+X'], enabled: pixel, run: () => dialogs.liquify.show() },
    { id: 'filter-neural', label: 'Neural Filters...', enabled: pixel, run: () => dialogs.neural.show() },
    { id: 'filter-wide-angle', label: 'Adaptive Wide Angle...', keys: ['Alt+Shift+Mod+A'], enabled: pixel, run: () => dialogs.wideAngle.show() },
    { id: 'filter-vanishing-point', label: 'Vanishing Point...', keys: ['Alt+Mod+V'], enabled: pixel, run: () => vanishingDialog.show() },   // 1.58.3
    { id: 'define-pattern', label: 'Define Pattern...', enabled: () => !!engine.current, run: () => void definePattern() },
    { id: 'define-brush', label: 'Define Brush Preset...', enabled: () => !!engine.current, run: () => void defineBrush() },
    { id: 'define-custom-shape', label: 'Define Custom Shape...', enabled: () => !!engine.workPath, run: () => void defineCustomShape() },
    { id: 'patterns-import', label: 'Import Patterns...', run: () => importPatterns() },
    { id: 'patterns-export', label: 'Export Patterns...', enabled: () => allPatterns().some((q) => !q.builtin), run: () => void exportPatterns() },
    { id: 'clear', label: 'Clear Selection Pixels', enabled: () => pixel() && selected(), run: () => engine.clearPixels() },
    { id: 'delete', label: 'Delete', keys: ['Backspace', 'Delete'], enabled: () => !!layer(), run: () => (selected() && pixel() ? engine.clearPixels() : void deleteLayersWithChoice()) },
    { id: 'settings', label: 'Preferences...', keys: ['Mod+,'], run: () => dialogs.settings.show() },
    ...PREF_PAGES.map(([id, label, section]) => ({ id: `prefs-${id}`, label, run: () => dialogs.settings.show(section) })),
    // The compact layout's sheets (1.58.7): each opens its own and closes the others; again closes it.
    { id: 'sheet-tools', label: 'Tools Sheet', run: () => openSheet(root.classList.contains('is-sheet-tools') ? null : 'tools') },
    { id: 'sheet-panels', label: 'Panels Sheet', run: () => openSheet(root.classList.contains('is-sheet-panels') ? null : 'panels') },
    { id: 'sheet-props', label: 'Properties Sheet', run: () => openSheet(root.classList.contains('is-sheet-props') ? null : 'props') },
    ...ALL_PANELS.map((pn) => pn.id === 'timeline'
      // Window > Timeline (1.59.8), as Photon's: the frames panel beside a frame animation, else the panel under the canvas.
      ? { id: 'panel-timeline', label: pn.label, checked: () => (engine.timeline.frames.length ? dock.isShown('timeline') : vtl.isOpen), run: () => { if (engine.timeline.frames.length) dock.toggle('timeline'); else vtl.toggleOpen(); } }
      : pn.id === 'develop' ? { id: 'panel-develop', label: pn.label, checked: () => dock.isShown('develop'), run: () => { if (dock.isShown('develop')) dialogs.filter.close(); else dialogs.filter.showDocked(); } }
      : { id: `panel-${pn.id}`, label: pn.label, ...(pn.id === 'layers' ? { keys: ['F7'] } : pn.id === 'actions' ? { keys: ['Alt+F9'] } : {}), checked: () => dock.isShown(pn.id), run: () => dock.toggle(pn.id) }),
    { id: 'merge-columns', label: 'Merge Panel Columns', checked: () => dock.merged, run: () => { if (dock.merged) dock.separate(); else dock.merge(); } },
    { id: 'panel-float', label: 'Float Panel', params: { panel: { type: 'string', description: 'The panel group id (navigator, swatches, layers, timeline, history, properties, brushes and the rest of the Window list) or a tab id inside a group.' }, x: { type: 'number', description: 'Left edge in pixels; where it last stood when left out.' }, y: { type: 'number', description: 'Top edge in pixels.' }, w: { type: 'number', description: 'Width in pixels.' }, h: { type: 'number', description: 'Height in pixels.' } },
      run: (a) => { const id = panelGroupId(a?.panel ?? menuPanel); menuPanel = null; const n = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined); if (!id || !dock.float(id, { x: n(a?.x), y: n(a?.y), w: n(a?.w), h: n(a?.h) })) toast('No panel with that id.', 'error'); } },
    { id: 'panel-dock', label: 'Dock Panel', params: { panel: { type: 'string', description: 'The id of a floating panel (or a tab inside it).' } },
      run: (a) => { const id = panelGroupId(a?.panel ?? menuPanel); menuPanel = null; if (!id || !dock.dockBack(id)) toast('That panel is not floating.', 'error'); } },
    { id: 'panel-activate', label: 'Activate Panel', params: { panel: { type: 'string', description: 'A panel group id, or a tab id: the tab is brought to the front of its group, the group opened and shown.' } },
      run: (a) => { const v = typeof a?.panel === 'string' ? a.panel : '', id = panelGroupId(v); if (!id) { toast('No panel with that id.', 'error'); return; } const g = PanelGroup.all.get(id); g?.setMinimised(false); if (g?.hasTab(v)) g.show(v); dock.activate(id); } },
    { id: 'panel-close-group', label: 'Close Panel Group', params: { panel: { type: 'string', description: 'A panel group id, or a tab id: the whole group is closed (hidden; Window shows it again).' } },
      run: (a) => { const id = panelGroupId(typeof a?.panel === 'string' ? a.panel : ''); if (!id || !ALL_PANELS.some((x) => x.id === id)) { toast('No panel with that id.', 'error'); return; } if (dock.isShown(id)) dock.toggle(id); } },
    { id: 'panel-group', label: 'Change Panel Group', params: { tab: { type: 'string', description: 'The id of the tab to move.' }, group: { type: 'string', description: 'The id of the group that takes it (a group holds seven tabs at most).' } },
      run: (a) => { const from = typeof a?.tab === 'string' ? PanelGroup.ofTab(a.tab) : undefined, to = typeof a?.group === 'string' ? PanelGroup.all.get(a.group) : undefined; if (!from || !to || typeof a?.tab !== 'string') { toast('Give a tab id and a group id.', 'error'); return; } if (from !== to && to.full) { toast('That group already holds seven tabs.', 'error'); return; } PanelGroup.moveTab(a.tab, from, to); PanelGroup.saveHomes(); } },
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
    { id: 'invert', label: 'Invert', keys: ['Mod+I'], enabled: () => pixel() || !!engine.alphaTargeted(), run: () => engine.invertPixels() },
    { id: 'remove-bg', label: 'Remove Background', enabled: withPixels, run: () => void removeBackground('auto') },
    { id: 'remove-bg-lite', label: 'Remove Background (Lightweight)', enabled: withPixels, run: () => void removeBackground('lite') },
    { id: 'select-subject', label: 'Subject', enabled: () => !!engine.current, params: AUTO_SELECT_PARAMS, run: (a) => void selectSubject(false, a) },
    { id: 'select-subject-text', label: 'Subject by Text...', enabled: () => !!engine.current, run: () => { void dialogs.falTask.show('segment'); } },
    { id: 'select-sky', label: 'Sky', enabled: () => !!engine.current, params: { ...AUTO_SELECT_PARAMS, sensitivity: { type: 'number', min: 0, max: 100, description: 'How readily faint sky counts: 50 keeps the model as it is, higher grows the sky, lower tightens it. The saved setting when left out.' }, softness: { type: 'number', min: 0, max: 250, description: 'Edge softness in pixels (a feather); the saved setting when left out.' }, method: { type: 'string', enum: ['quick', 'model'], description: 'quick finds the sky by color and smoothness with no model; model uses the downloaded sky model. When left out the model is used if downloaded, else the quick method.' } }, run: (a) => void selectSky(a) },
    { id: 'auto-select-sample-all', label: 'Sample All Layers', checked: () => engine.autoSel.sampleAll, run: () => engine.setAutoSel({ sampleAll: !engine.autoSel.sampleAll }) },
    { id: 'sky-sensitivity', label: 'Sky Sensitivity...', run: () => void (async () => { const v = await promptName('Sky Sensitivity (0 to 100, 50 keeps the model as it is)', String(engine.autoSel.skySensitivity), 'Set'); if (v !== null && v.trim() !== '' && Number.isFinite(Number(v))) engine.setAutoSel({ skySensitivity: Math.max(0, Math.min(100, Number(v))) }); })() },
    { id: 'sky-softness', label: 'Sky Edge Softness...', run: () => void (async () => { const v = await promptName('Sky Edge Softness in pixels (0 to 250)', String(engine.autoSel.skySoftness), 'Set'); if (v !== null && v.trim() !== '' && Number.isFinite(Number(v))) engine.setAutoSel({ skySoftness: Math.max(0, Math.min(250, Number(v))) }); })() },
    { id: 'focus-area', label: 'Focus Area...', enabled: () => !!engine.current,
      params: {
        ...AUTO_SELECT_PARAMS,
        range: { type: 'number', min: 0, max: 100, description: 'In-Focus Range: higher keeps more; 50 when left out.' },
        noise: { type: 'number', min: 0, max: 100, description: 'Image Noise Level; 20 when left out.' },
        soften: { type: 'boolean', description: 'Soften Edge; on when left out.' },
      },
      run: (a) => {
        if (a && ['mode', 'sampleAll', 'range', 'noise', 'soften'].some((k) => a[k] !== undefined)) {
          if (typeof a.sampleAll === 'boolean') engine.setAutoSel({ sampleAll: a.sampleAll });
          engine.selectFocusArea({ ...(typeof a.range === 'number' ? { range: a.range } : {}), ...(typeof a.noise === 'number' ? { noise: a.noise } : {}), ...(typeof a.soften === 'boolean' ? { soften: a.soften } : {}) }, selectModeOf(a));
        } else focusAreaDialog.show();
      } },
    { id: 'select-object', label: 'Object in Selection', enabled: selected, params: AUTO_SELECT_PARAMS, run: (a) => void selectSubject(true, a) },
    { id: 'select-and-mask', label: 'Select and Mask...', keys: ['Alt+Mod+R'], enabled: selected, run: () => { if (!selectMaskWorkspace.enter()) dialogs.selectMask.show(); } },
    { id: 'select-and-mask-dialog', label: 'Select and Mask Dialog...', enabled: selected, run: () => dialogs.selectMask.show() },
    { id: 'rotate-180', label: '180°', enabled: has, run: () => engine.rotateCanvas(2) },
    { id: 'rotate-90-cw', label: '90° Clockwise', enabled: has, run: () => engine.rotateCanvas(1) },
    { id: 'rotate-90-ccw', label: '90° Counter Clockwise', enabled: has, run: () => engine.rotateCanvas(3) },
    { id: 'flip-canvas-h', label: 'Flip Canvas Horizontal', enabled: has, run: () => engine.flipCanvas(true) },
    { id: 'flip-canvas-v', label: 'Flip Canvas Vertical', enabled: has, run: () => engine.flipCanvas(false) },
    { id: 'rotate-arbitrary', label: 'Arbitrary...', enabled: has, run: () => dialogs.rotateCanvas.show() },
    { id: 'auto-tone', label: 'Auto Tone', keys: ['Shift+Mod+L'], enabled: pixel, run: () => engine.autoAdjust('tone') },
    { id: 'auto-contrast', label: 'Auto Contrast', keys: ['Alt+Shift+Mod+L'], enabled: pixel, run: () => engine.autoAdjust('contrast') },
    { id: 'auto-color', label: 'Auto Color', keys: ['Shift+Mod+B'], enabled: pixel, run: () => engine.autoAdjust('color') },
    { id: 'desaturate', label: 'Desaturate', keys: ['Shift+Mod+U'], enabled: pixel, run: () => engine.pixelAdjust('desaturate') },
    { id: 'equalize', label: 'Equalize', enabled: pixel, run: () => engine.pixelAdjust('equalize') },
    { id: 'equalize-layer-from-selection', label: 'Equalize Entire Layer Based on Selection', enabled: () => pixel() && !!engine.current?.selection, run: () => engine.pixelAdjust('equalize', 'layer') },
    { id: 'replace-color', label: 'Replace Color...', enabled: pixel, run: () => dialogs.replaceColor.show() },
    ...(['normal', 'bump'] as const).map((kind): Command => ({
      id: kind === 'normal' ? 'normal-map' : 'bump-map', label: kind === 'normal' ? 'Generate Normal Map...' : 'Generate Bump Map...', enabled: pixel,
      params: {
        strength: { type: 'number', min: 0.1, max: 20, description: kind === 'normal' ? 'Bump strength; 2 when left out.' : 'Contrast of the height map; 2 when left out.' },
        blur: { type: 'number', min: 0, max: 20, description: 'Blur radius in pixels applied to the height first; 1 when left out.' },
        invert: { type: 'boolean', description: 'Invert the height (dark becomes high).' },
        ...(kind === 'normal' ? { flip_y: { type: 'boolean', description: 'Flip the green channel for the DirectX convention; OpenGL when left out.' } } : {}),
      },
      run: (a) => {
        if (!a || !Object.keys(a).length) { dialogs.normalMap.show(kind); return undefined; }
        const n = (k: string, d: number): number => (typeof a[k] === 'number' ? a[k] : d);
        return engine.generateMap(kind, { strength: n('strength', 2), blur: n('blur', 1), invert: a.invert === true, flipY: a.flip_y === true });
      },
    })),
    { id: 'height-from-normal', label: 'Height Map from Normal Map', enabled: pixel, run: () => engine.generateMap('height', { strength: 1, blur: 0, invert: false, flipY: false }) },
    {
      id: 'apply-image', label: 'Apply Image...', enabled: pixel, params: {
        source_doc: { type: 'string', description: 'Id of the source document, which must be the target\'s pixel size; the current document when left out.' },
        layer: { type: 'string', description: 'Source layer id, or "merged" for the whole image; the active layer when left out.' },
        channel: { type: 'string', description: 'Source channel: rgb (default), red, green, blue, transparency, selection, mask (the layer mask), or a saved alpha channel\'s id or name.' },
        invert: { type: 'boolean', description: 'Invert the source channel.' },
        preserve_transparency: { type: 'boolean', description: 'Keep the target\'s transparency; true when left out. False lets the source fill transparent pixels.' },
        mode: { type: 'string', enum: APPLY_MODES, description: 'Blending mode; normal when left out. Add and subtract use scale and offset.' },
        opacity: { type: 'number', min: 0, max: 100, description: 'Opacity in percent; 100 when left out.' },
        scale: { type: 'number', min: 1, max: 255, description: 'Scale for add and subtract; 1 when left out.' },
        offset: { type: 'number', min: -255, max: 255, description: 'Offset for add and subtract; 0 when left out.' },
        mask_layer: { type: 'string', description: 'Mask layer id, or "merged"; giving any mask_ field turns the mask on.' },
        mask_channel: { type: 'string', description: 'Mask channel: rgb (its luminosity), red, green, blue, transparency, selection, mask (the layer mask), or an alpha channel\'s id or name.' },
        mask_invert: { type: 'boolean', description: 'Invert the mask.' },
      },
      run: (a) => {
        if (!a || !Object.keys(a).length) { dialogs.applyImage.show(); return undefined; }
        const s = (k: string): string | undefined => (typeof a[k] === 'string' && a[k] ? String(a[k]) : undefined), n = (k: string): number | undefined => (typeof a[k] === 'number' ? a[k] : undefined);
        const hasMask = a.mask_layer !== undefined || a.mask_channel !== undefined || a.mask_invert !== undefined;
        const ran = engine.applyImage({
          doc: s('source_doc'), layer: s('layer'), channel: s('channel'), invert: a.invert === true, mode: s('mode') as ApplyMode | undefined,
          opacity: n('opacity') === undefined ? undefined : (n('opacity') as number) / 100, scale: n('scale'), offset: n('offset'),
          mask: hasMask ? { doc: s('source_doc'), layer: s('mask_layer'), channel: s('mask_channel'), invert: a.mask_invert === true } : null,
          preserve: a.preserve_transparency !== false,
        });
        return { applied: ran };
      },
    },
    { id: 'image-crop', label: 'Crop', enabled: () => selected() || cropPending(), run: () => { if (!commitPendingCrop(engine)) engine.cropToSelection(); } },
    { id: 'perspective-crop', label: 'Perspective Crop', enabled: has, run: () => startPerspectiveCrop(engine) },
    { id: 'duplicate-image', label: 'Duplicate...', enabled: has, run: () => dialogs.duplicateImage.show() },
    { id: 'new-layer', label: 'New Layer', enabled: has, run: () => engine.addLayer() },
    { id: 'new-layer-dialog', label: 'Layer...', keys: ['Shift+Mod+N'], enabled: has, run: () => dialogs.newLayer.show() },
    { id: 'new-dodge-burn-layer', label: 'Dodge & Burn Layer', enabled: has, run: () => engine.addDodgeBurnLayer() },
    { id: 'new-folder', label: 'New Folder', enabled: has, run: () => engine.addFolder() },
    { id: 'new-folder-dialog', label: 'Group...', enabled: has, run: () => dialogs.newGroup.show() },
    { id: 'new-artboard', label: 'New Artboard', enabled: has, run: () => { engine.newArtboard(); } },
    { id: 'artboard-from-layers', label: 'Artboard from Layers', enabled: has, run: () => { engine.artboardFromLayers(); } },
    { id: 'artboard-from-layers-dialog', label: 'Artboard from Layers...', enabled: has, run: () => dialogs.newArtboard.show(false, true) },
    { id: 'new-artboard-dialog', label: 'Artboard...', enabled: has, run: () => dialogs.newArtboard.show(false) },
    { id: 'artboard-from-group', label: 'Artboard from Group...', enabled: () => { const l = engine.current?.activeLayer; return !!l?.isGroup && !l.parentId && !l.artboard && !l.frame; }, run: () => dialogs.newArtboard.show(true) },
    { id: 'frame-from-layers', label: 'Frame from Layers', enabled: () => { const p = engine.current; return !!p && [...p.selectedIds].some((id) => { const l = p.layer(id); return !!l?.raster && !l.isGroup && !l.adjustment; }); }, run: () => engine.frameFromLayers() },
    ...([['shapes-unite', 'Unite Shapes', 'combine'], ['shapes-subtract', 'Subtract Front Shape', 'subtract'], ['shapes-intersect', 'Intersect Shape Areas', 'intersect'], ['shapes-exclude', 'Exclude Overlapping Shapes', 'exclude'], ['shapes-merge', 'Merge Shape Components', 'merge']] as const)
      .map(([id, label, op]) => ({ id, label, enabled: () => { const p = engine.current, s = p ? p.doc.layers.filter((l) => p.selectedIds.has(l.id) && (!!l.vector || !!l.shape)) : []; return s.length > 1 || (s.length === 1 && ((s[0].vector?.path.subpaths.length ?? 0) > 1 || (op === 'merge' && !!s[0].vector?.path.subpaths.some((sp) => sp.op && sp.op !== 'combine')))); }, run: () => engine.combineShapes(op) })),
    { id: 'artboard-options', label: 'Artboard Options...', enabled: () => !!engine.current?.activeLayer?.artboard, run: () => dialogs.artboard.show() },
    { id: 'export-artboards', label: 'Export Artboards to Files', enabled: () => engine.artboards().length > 0, run: () => void exportArtboards() },
    { id: 'export-layers', label: 'Layers to Files...', enabled: has, params: LAYER_EXPORT_PARAMS, run: (a) => layerExportRun(false, a) },
    { id: 'export-selection-mask', label: 'Selection as Mask PNG', enabled: selected, run: () => void exportSelectionMask() },
    { id: 'generate-image-assets', label: 'Generate Image Assets', enabled: has, run: () => generateAssets(false) },
    { id: 'generate-image-assets-folder', label: 'Generate Image Assets to Folder...', enabled: has, run: () => generateAssets(false, true) },
    { id: 'image-asset-variants', label: 'Image Asset Default Variants...', run: async () => {
      const text = await promptName('Default variants: scales such as 100, 200@2x, 3x (blank for none)', loadVariantText(), 'Save');
      if (text === null) return;
      const list = parseVariants(text);
      saveVariantText(list.map((v) => `${v.pct}${v.suffix ? ` ${v.suffix}` : ''}`).join(', '));
      toast(list.length ? `Every asset name without a size is also written at ${list.map((v) => `${v.pct}%`).join(', ')}.` : 'Image assets are written once, at their own size.', 'info');
    } },
    { id: 'image-assets-on-save', label: 'Image Assets on Save', enabled: has, checked: () => !!engine.current?.doc.assetsOnSave, run: () => engine.setAssetsOnSave(!engine.current?.doc.assetsOnSave) },
    {
      id: 'measure-scale', label: 'Set Measurement Scale...', enabled: has,
      params: { pixels: { type: 'number', description: 'Pixels in the reference length.' }, length: { type: 'number', description: 'The logical length those pixels stand for.' }, units: { type: 'string', description: 'The logical units, such as cm.' } },
      run: (a) => { if (typeof a?.pixels === 'number' && typeof a?.length === 'number') engine.setMeasureScale(a.pixels, a.length, typeof a.units === 'string' ? a.units : 'px'); else dialogs.measureScale.show(); },
    },
    // Pixel Aspect Ratio presets (35.4 part b): each is checked while the document's ratio matches.
    ...([['par-square', 'Square (1)', 1], ['par-d1-ntsc', 'D1/DV NTSC (0.91)', 0.91], ['par-d1-pal', 'D1/DV PAL (1.09)', 1.09], ['par-d1-ntsc-wide', 'D1/DV NTSC Widescreen (1.21)', 1.21], ['par-d1-pal-wide', 'D1/DV PAL Widescreen (1.46)', 1.46], ['par-anamorphic', 'Anamorphic 2:1 (2)', 2], ['par-hdv', 'HDV 1080 (1.33)', 1.33], ['par-dvcpro-hd', 'DVCPRO HD 1080 (1.5)', 1.5]] as const).map(([id, label, r]) => ({
      id, label, enabled: has, checked: () => Math.abs((engine.current?.doc.pixelAspect ?? 1) - r) < 0.005, run: () => engine.setPixelAspect(r),
    })),
    {
      id: 'par-custom', label: 'Custom Pixel Aspect Ratio...', enabled: has,
      params: { ratio: { type: 'number', description: 'Pixel width over pixel height; 1 is square.' } },
      run: async (a) => {
        let r = typeof a?.ratio === 'number' ? a.ratio : NaN;
        if (Number.isNaN(r)) {
          const raw = await promptName('Custom Pixel Aspect Ratio', String(engine.current?.doc.pixelAspect ?? 1), 'OK');
          if (raw === null) return;
          r = Number(raw);
        }
        if (Number.isFinite(r)) engine.setPixelAspect(r);
      },
    },
    { id: 'par-correction', label: 'Pixel Aspect Ratio Correction', checked: () => engine.view.parCorrection, run: () => engine.setView({ parCorrection: !engine.view.parCorrection }) },
    { id: 'measure-record', label: 'Record Measurements', enabled: has, run: () => { engine.recordMeasurements(); } },
    { id: 'measure-record-features', label: 'Record Measurements per Feature', enabled: () => has() && selected(), run: () => { engine.recordMeasurements(true); } },
    { id: 'measure-data-points', label: 'Select Data Points...', enabled: has, run: () => dialogs.measureDataPoints.show() },
    {
      id: 'measure-scale-marker', label: 'Place Scale Marker...', enabled: () => !!engine.current?.doc.measureScale,
      params: {
        length: { type: 'number', description: 'The marker length in logical units; leave out for about a fifth of the width.' },
        font_size: { type: 'number', description: 'The text size in pixels; 12 when left out.' },
        text: { type: 'string', description: 'The text; the length with its units when left out.' },
        show_text: { type: 'boolean', description: 'Whether the marker has text; true when left out.' },
        text_position: { type: 'string', description: 'above or below the bar; above when left out.' },
        color: { type: 'string', description: 'black or white; black when left out.' },
      },
      run: (a) => {
        const d = engine.current?.doc, sc = d?.measureScale;
        if (!d || !sc) return;
        if (!a || Object.keys(a).length === 0) { dialogs.scaleMarker.show(); return; }
        const len = typeof a.length === 'number' && a.length > 0 ? a.length : autoMarkerLength(d.width, sc);
        engine.placeScaleMarker({ lengthUnits: len, text: a.show_text !== false, color: a.color === 'white' ? 'white' : 'black', ...(typeof a.font_size === 'number' ? { fontSize: a.font_size } : {}), ...(typeof a.text === 'string' ? { label: a.text } : {}), textBelow: a.text_position === 'below' });
      },
    },
    { id: 'measure-ruler', label: 'Ruler Tool', enabled: has, run: () => engine.setTool('ruler') },
    { id: 'measure-color-sampler', label: 'Color Sampler Tool', enabled: has, run: () => engine.setTool('colorSampler') },
    {
      id: 'sampler-add', label: 'Add Color Sampler', enabled: has,
      params: { x: { type: 'number', description: 'Document x in pixels.' }, y: { type: 'number', description: 'Document y in pixels.' } },
      run: (a) => {
        const m = engine.measure, d = engine.current?.doc;
        if (!m || !d) return { index: null };
        if (m.samplers.length >= 10) { toast('Ten samplers at most.', 'info'); return { index: null }; }
        const x = Number(a?.x), y = Number(a?.y);
        m.samplers.push({ x: Math.floor(Math.min(d.width - 1, Math.max(0, Number.isFinite(x) ? x : d.width / 2))) + 0.5, y: Math.floor(Math.min(d.height - 1, Math.max(0, Number.isFinite(y) ? y : d.height / 2))) + 0.5 });
        engine.measureChanged();
        return { index: m.samplers.length };
      },
    },
    {
      id: 'sampler-move', label: 'Move Color Sampler', enabled: () => !!engine.measure?.samplers.length,
      params: { index: { type: 'number', description: 'The sampler number as the Info panel shows it, from 1.' }, x: { type: 'number', description: 'New document x in pixels.' }, y: { type: 'number', description: 'New document y in pixels.' } },
      run: (a) => {
        const m = engine.measure, d = engine.current?.doc, i = Math.round(Number(a?.index)) - 1, x = Number(a?.x), y = Number(a?.y);
        if (!m || !d || !m.samplers[i] || !Number.isFinite(x) || !Number.isFinite(y)) { toast('Name a sampler and a position.', 'info'); return { changed: false }; }
        m.samplers[i] = { x: Math.floor(Math.min(d.width - 1, Math.max(0, x))) + 0.5, y: Math.floor(Math.min(d.height - 1, Math.max(0, y))) + 0.5 };
        engine.measureChanged();
        return { changed: true };
      },
    },
    {
      id: 'sampler-delete', label: 'Delete Color Sampler', enabled: () => !!engine.measure?.samplers.length,
      params: { index: { type: 'number', description: 'The sampler number as the Info panel shows it, from 1; the last one when left out.' } },
      run: (a) => {
        const m = engine.measure;
        if (!m?.samplers.length) return { changed: false };
        const i = a?.index === undefined ? m.samplers.length - 1 : Math.round(Number(a.index)) - 1;
        if (!m.samplers[i]) { toast('No such sampler.', 'info'); return { changed: false }; }
        m.samplers.splice(i, 1);
        engine.measureChanged();
        return { changed: true };
      },
    },
    { id: 'sampler-clear', label: 'Clear Color Samplers', enabled: () => !!engine.measure?.samplers.length, run: () => { const m = engine.measure; if (m) { m.samplers.length = 0; engine.measureChanged(); } } },
    { id: 'measure-count', label: 'Count Tool', enabled: has, run: () => engine.setTool('count') },
    {
      id: 'count-new-group', label: 'New Count Group', enabled: has,
      params: { name: { type: 'string', description: 'The group name; Group and its number when left out.' }, color: { type: 'string', description: 'The marker color as #rrggbb; one is chosen when left out.' } },
      run: (a) => { const id = engine.newCountGroup(typeof a?.name === 'string' ? a.name : undefined, typeof a?.color === 'string' ? a.color : undefined); return id ? { group: id } : { group: null }; },
    },
    {
      id: 'count-set-group', label: 'Set Count Group', enabled: () => !!engine.current?.doc.countGroups?.length,
      params: {
        group: { type: 'string', description: 'The group to change, by name or id; the group new marks go into when left out.' },
        name: { type: 'string', description: 'A new name.' },
        color: { type: 'string', description: 'A new color as #rrggbb.' },
        hidden: { type: 'boolean', description: 'Hide or show the group and its markers.' },
        active: { type: 'boolean', description: 'Make it the group new marks go into.' },
        delete: { type: 'boolean', description: 'Delete the group and its markers.' },
      },
      run: (a) => {
        const groups = engine.current?.doc.countGroups ?? [], key = typeof a?.group === 'string' ? a.group : '';
        const g = key ? groups.find((x) => x.id === key || x.name === key) : groups.find((x) => x.id === engine.activeCountGroup) ?? groups[0];
        if (!g) { toast('No such count group.', 'info'); return { changed: false }; }
        if (a?.delete === true) return { changed: engine.removeCountGroup(g.id) };
        if (a?.active === true) { engine.activeCountGroup = g.id; engine.emit('options', null); }
        const patch = { ...(typeof a?.name === 'string' ? { name: a.name } : {}), ...(typeof a?.color === 'string' ? { color: a.color } : {}), ...(typeof a?.hidden === 'boolean' ? { hidden: a.hidden } : {}) };
        return { changed: Object.keys(patch).length ? engine.setCountGroup(g.id, patch) : a?.active === true };
      },
    },
    { id: 'measure-log', label: 'Measurement Log...', enabled: has, run: () => dialogs.measureLog.show() },
    { id: 'export-luts', label: 'Color Lookup Tables...', enabled: has, run: () => dialogs.exportLuts.show() },
    { id: 'export-layer-comps', label: 'Layer Comps to Files...', enabled: () => !!engine.current?.doc.comps?.length, params: LAYER_EXPORT_PARAMS, run: (a) => layerExportRun(false, a, true) },
    { id: 'export-artboards-pdf', label: 'Artboards to PDF...', enabled: () => engine.artboards().length > 0,
      params: {
        name: { type: 'string', description: 'PDF file name; the document name when left out.' },
        jpeg: { type: 'boolean', description: 'JPEG encoding instead of lossless; false when left out.' },
        quality: { type: 'integer', min: 1, max: 100, description: 'JPEG quality; 90 when left out.' },
        icc: { type: 'boolean', description: 'Check the document ICC profile; true when left out. The PDF does not carry it yet.' },
        contents_only: { type: 'boolean', description: 'Leave out each artboard\'s background color; false when left out.' },
      },
      run: (a) => {
        if (!a || !Object.keys(a).length) { dialogs.artboardPdf.show(); return; }
        void exportArtboardsPdf({ name: String(a.name ?? ''), jpeg: a.jpeg === true, quality: Number(a.quality ?? 90), icc: a.icc !== false, contentsOnly: a.contents_only === true });
      } },
    { id: 'export-artboards-files', label: 'Artboards to Files...', enabled: () => engine.artboards().length > 0, params: LAYER_EXPORT_PARAMS, run: (a) => layerExportRun(true, a) },
    { id: 'script-delete-empty-layers', label: 'Delete All Empty Layers', enabled: has, run: () => engine.deleteEmptyLayers() },
    { id: 'script-flatten-effects', label: 'Flatten All Layer Effects', enabled: () => !!engine.current?.doc.layers.some((l) => effectsActive(l.effects)), run: () => engine.flattenAllEffects() },
    { id: 'script-flatten-masks', label: 'Flatten All Masks', enabled: () => !!engine.current?.doc.layers.some((l) => !!l.mask || !!l.vectorMask), run: () => engine.flattenAllMasks() },
    { id: 'duplicate', label: 'Layer via Copy', keys: ['Mod+J'], enabled: () => !!layer(), run: () => engine.layerViaCopy() },
    { id: 'duplicate-dialog', label: 'Duplicate Layer...', enabled: () => !!layer(), run: () => dialogs.duplicateLayer.show() },
    { id: 'delete-layer', label: 'Delete Layer', enabled: () => !!layer(), run: () => void deleteLayersWithChoice() },
    // The Layers panel's trash button asks first (1.87.3, CLOSE_GAPS P06); the Delete key and the menu do not.
    { id: 'delete-layer-ask', label: 'Delete Layer...', enabled: () => !!layer(), run: () => { const n = engine.current?.selectedIds.size ?? 0, name = layer()?.name ?? ''; void confirmAction('Delete layer?', n > 1 ? `Delete the ${n} selected layers?` : `Delete ${name}?`, 'Delete', true).then((ok) => { if (ok) void deleteLayersWithChoice(); }); } },
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
    { id: 'flip-layer-h', label: 'Flip Layer Horizontal', enabled: () => withPixels() || engine.pathTarget, run: () => engine.flipLayers(true) },
    { id: 'flip-layer-v', label: 'Flip Layer Vertical', enabled: () => withPixels() || engine.pathTarget, run: () => engine.flipLayers(false) },
    { id: 'forward', label: 'Bring Forward', keys: ['Mod+]'], enabled: () => !!layer(), run: () => engine.moveActive(1) },
    { id: 'backward', label: 'Send Backward', keys: ['Mod+['], enabled: () => !!layer(), run: () => engine.moveActive(-1) },
    // Layer and Select operations (1.64.8, DEV_PLAN 27.5).
    { id: 'bring-front', label: 'Bring to Front', keys: ['Shift+Mod+]'], enabled: () => !!layer(), run: () => engine.arrangeLayers('front') },
    { id: 'send-back', label: 'Send to Back', keys: ['Shift+Mod+['], enabled: () => !!layer(), run: () => engine.arrangeLayers('back') },
    { id: 'reverse-layers', label: 'Reverse', enabled: () => (engine.current?.selectedIds.size ?? 0) > 1, run: () => engine.arrangeLayers('reverse') },
    { id: 'layer-from-background', label: 'Layer from Background...', enabled: () => !!engine.backgroundLayer(), run: () => dialogs.newLayer.show(true) },
    { id: 'group-from-layers', label: 'Group from Layers...', enabled: () => !!layer(), run: () => dialogs.newGroup.show(true) },
    { id: 'layer-via-cut', label: 'Layer via Cut', keys: ['Shift+Mod+J'], enabled: () => pixel() && selected(), run: () => engine.layerViaCut() },
    { id: 'delete-hidden', label: 'Delete Hidden Layers', enabled: () => !!engine.current?.doc.layers.some((l) => !l.visible), run: () => engine.deleteHiddenLayers() },
    { id: 'ungroup', label: 'Ungroup Layers', enabled: () => { const p = engine.current; return !!p && [...p.selectedIds].some((id) => { const l = p.layer(id); return !!l?.isGroup && !l.artboard; }); }, run: () => engine.ungroupLayers() },
    { id: 'hide-layers', label: () => (allHidden() ? 'Show Layers' : 'Hide Layers'), enabled: () => !!layer(), run: () => engine.setLayersVisible(allHidden()) },
    { id: 'select-layer-up', label: 'Forward Layer', keys: ['Alt+]'], enabled: () => !!engine.current?.doc.layers.length, run: () => stepLayer(1, false) },
    { id: 'select-layer-down', label: 'Backward Layer', keys: ['Alt+['], enabled: () => !!engine.current?.doc.layers.length, run: () => stepLayer(-1, false) },
    { id: 'select-layer-up-add', label: 'Add Forward Layer to Selection', keys: ['Alt+Shift+]'], enabled: () => !!engine.current?.doc.layers.length, run: () => stepLayer(1, true) },
    { id: 'select-layer-down-add', label: 'Add Backward Layer to Selection', keys: ['Alt+Shift+['], enabled: () => !!engine.current?.doc.layers.length, run: () => stepLayer(-1, true) },
    { id: 'select-layer-top', label: 'Top Layer', keys: ['Alt+.'], enabled: () => !!engine.current?.doc.layers.length, run: () => stepLayer(Infinity, false) },
    { id: 'select-layer-bottom', label: 'Bottom Layer', keys: ['Alt+,'], enabled: () => !!engine.current?.doc.layers.length, run: () => stepLayer(-Infinity, false) },
    ...[null, ...LAYER_LABELS].map((c) => ({ id: `layer-label-${c ?? 'none'}`, label: c ? c[0].toUpperCase() + c.slice(1) : 'No Color', checked: () => (layer()?.label ?? null) === c, enabled: () => !!layer(), run: () => engine.setLayerLabel(c) })),
    ...[null, ...LAYER_ROLES].map((r) => ({ id: `layer-role-${r ?? 'none'}`, label: r ? LAYER_ROLE_LABELS[r] : 'No Role', checked: () => { const l = layer(); return (l ? layerRoleOf(l) : null) === r; }, enabled: () => { const l = layer(); return !!l && !l.isGroup; }, run: () => engine.setLayerRole(r) })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `pick-layer-${i}`, label: () => engine.current?.layer(picked[i] ?? '')?.name ?? '', enabled: () => i < picked.length, run: () => { const id = picked[i]; if (id) engine.selectLayer(id); } })),
    { id: 'background-from-layer', label: 'Background from Layer', enabled: () => pixel() && !engine.backgroundLayer(), run: () => { engine.backgroundFromLayer(); } },
    { id: 'stamp-visible', label: 'Stamp Visible', keys: ['Alt+Shift+Mod+E'], enabled: () => !!engine.current?.doc.layers.length, run: () => { engine.stampVisible(); } },
    {
      id: 'frequency-separation', label: 'Frequency Separation...', enabled: () => !!engine.current?.doc.layers.length,
      params: { radius: { type: 'number', min: 0.5, max: 100, description: 'Blur radius in pixels that splits color from detail; the dialog opens when left out.' } },
      run: (a) => { if (a?.radius === undefined) dialogs.frequency.show(); else engine.frequencySeparation(Number(a.radius)); },
    },
    { id: 'stamp-down', label: 'Stamp Down', keys: ['Alt+Mod+E'], enabled: () => !!layer(), run: () => { engine.stampDown(); } },
    { id: 'show-only-layer', label: 'Show Only This Layer', enabled: () => !!layer(), run: () => { const l = layer(); if (l) engine.soloLayer(l.id); } },
    { id: 'show-all-layers', label: 'Show All Layers', enabled: () => !!engine.current?.doc.layers.some((l) => !l.visible), run: () => engine.showAllLayers() },
    { id: 'merge-visible', label: 'Merge Visible', enabled: () => (engine.current?.doc.layers.length ?? 0) > 1, run: () => engine.mergeVisible() },
    { id: 'select-all-layers', label: 'All Layers', keys: ['Alt+Mod+A'], enabled: () => !!engine.current?.doc.layers.length, run: () => engine.selectAllLayers() },
    { id: 'deselect-layers', label: 'Deselect Layers', enabled: () => !!engine.current && (!!engine.current.activeId || engine.current.selectedIds.size > 0), run: () => engine.selectAllLayers(false) },
    { id: 'mask-reveal-all', label: 'Reveal All', enabled: () => !!layer(), run: () => engine.addMask(false, false) },
    { id: 'mask-hide-all', label: 'Hide All', enabled: () => !!layer(), run: () => engine.addMask(true, false) },
    { id: 'mask-view-alone', label: 'View Mask Alone', checked: () => engine.maskView?.mode === 'alone', enabled: () => !!layer()?.mask?.raster, run: () => engine.setMaskView('alone') },
    { id: 'mask-view-red', label: 'View Mask as Red Overlay', checked: () => engine.maskView?.mode === 'rubylith', enabled: () => !!layer()?.mask?.raster, run: () => engine.setMaskView('rubylith') },
    { id: 'mask-reveal-selection', label: 'Reveal Selection', enabled: () => !!layer() && !layer()?.mask && selected(), run: () => engine.addMask(false) },
    { id: 'mask-hide-selection', label: 'Hide Selection', enabled: () => !!layer() && !layer()?.mask && selected(), run: () => engine.addMask(true) },
    { id: 'mask-from-transparency', label: 'From Transparency', enabled: () => withPixels() && !layer()?.mask, run: () => engine.maskFromTransparency() },
    { id: 'vmask-reveal-all', label: 'Reveal All', enabled: () => !!layer() && !layer()?.vectorMask, run: () => engine.addVectorMask('reveal') },
    { id: 'vmask-hide-all', label: 'Hide All', enabled: () => !!layer() && !layer()?.vectorMask, run: () => engine.addVectorMask('hide') },
    { id: 'vmask-current-path', label: 'Current Path', enabled: () => !!layer() && !layer()?.vectorMask && !!engine.workPath, run: () => engine.addVectorMask('path') },
    { id: 'vmask-delete', label: 'Delete', enabled: () => !!layer()?.vectorMask, run: () => engine.changeVectorMask('delete') },
    { id: 'vmask-enable', label: () => (layer()?.vectorMask?.enabled === false ? 'Enable Vector Mask' : 'Disable Vector Mask'), enabled: () => !!layer()?.vectorMask, run: () => engine.changeVectorMask('enable') },
    { id: 'vmask-link', label: () => (layer()?.vectorMask?.linked === false ? 'Link Vector Mask' : 'Unlink Vector Mask'), enabled: () => !!layer()?.vectorMask, run: () => engine.changeVectorMask('link') },
    { id: 'rasterize-vmask', label: 'Vector Mask', enabled: () => !!layer()?.vectorMask, run: () => engine.rasterizeVectorMask() },
    { id: 'matting-decontaminate', label: 'Color Decontaminate...', enabled: withPixels, run: () => dialogs.matting.show('decontaminate') },
    { id: 'matting-defringe', label: 'Defringe...', enabled: withPixels, run: () => dialogs.matting.show('defringe') },
    { id: 'matting-black', label: 'Remove Black Matte', enabled: withPixels, run: () => engine.matting('black') },
    { id: 'matting-white', label: 'Remove White Matte', enabled: withPixels, run: () => engine.matting('white') },
    { id: 'rasterize-type', label: 'Rasterize Type', enabled: () => [...(engine.current?.selectedIds ?? [])].some((id) => !!engine.current?.layer(id)?.text), run: () => engine.rasterizeLayers('type') },
    { id: 'rasterize-shape', label: 'Rasterize Shape', enabled: () => [...(engine.current?.selectedIds ?? [])].some((id) => { const l = engine.current?.layer(id); return !!(l?.vector || l?.shape); }), run: () => engine.rasterizeLayers('shape') },
    { id: 'rasterize-fill', label: 'Rasterize Fill Content', enabled: () => [...(engine.current?.selectedIds ?? [])].some((id) => !!engine.current?.layer(id)?.fillContent), run: () => engine.rasterizeLayers('fill') },
    { id: 'rasterize-smart', label: 'Rasterize Smart Object', enabled: () => [...(engine.current?.selectedIds ?? [])].some((id) => !!engine.current?.layer(id)?.smart), run: () => engine.rasterizeLayers('smart') },
    { id: 'mask-all-objects', label: 'Mask All Objects', enabled: () => !!layer(), run: () => void maskAllObjects() },
    { id: 'reselect', label: 'Reselect', enabled: () => engine.canReselect, run: () => engine.reselect() },
    { id: 'grow', label: 'Grow', enabled: selected, run: () => engine.growSelection(true) },
    { id: 'similar', label: 'Similar', enabled: selected, run: () => engine.growSelection(false) },
    { id: 'transform-selection', label: 'Transform Selection', enabled: () => selected() && !engine.floatingSelection, run: () => { engine.beginOutlineTransform(); } },
    { id: 'transform-selection-numeric', label: 'Transform Selection Numerically...', enabled: () => selected() && !engine.floatingSelection,
      run: (a) => {
        const n = (k: string): number | undefined => (typeof a?.[k] === 'number' ? (a[k] as number) : undefined);
        const keys = ['ref', 'moveX', 'moveY', 'scaleX', 'scaleY', 'angle', 'skewH', 'skewV', 'perspH', 'perspV'] as const;
        const q = Array.isArray(a?.quad) && a.quad.length === 4 ? (a.quad as Array<{ x: number; y: number }>).map((c) => ({ x: Number(c.x), y: Number(c.y) })) : undefined;
        const m = Array.isArray(a?.matrix) && a.matrix.length === 6 ? (a.matrix as unknown[]).map(Number) : undefined;
        if (q || m || keys.some((k) => n(k) !== undefined)) engine.transformSelectionBy({ ref: n('ref'), moveX: n('moveX'), moveY: n('moveY'), scaleX: n('scaleX'), scaleY: n('scaleY'), angle: n('angle'), skewH: n('skewH'), skewV: n('skewV'), perspH: n('perspH'), perspV: n('perspV'), quad: q, matrix: m, smooth: a?.smooth !== false });
        else dialogs.selectionTransform.show();
      } },
    { id: 'select-float', label: 'Float Selected Pixels', enabled: () => selected() && engine.canTransformSelection, run: () => { engine.beginSelectionTransform(); } },
    { id: 'select-drop', label: 'Drop Floating Pixels', enabled: () => engine.floatingSelection, run: () => { engine.commitSelectionTransform(); } },
    { id: 'convert-to-shape', label: 'Convert to Shape', enabled: selected, params: { tolerance: { type: 'number', min: 0.1, max: 20, description: 'How far in pixels the outline may stray from the selection\'s edge when simplified; the saved Tolerance (1.5 at first) when left out.' } }, run: (a) => engine.selectionToShape(typeof a?.tolerance === 'number' ? a.tolerance : undefined) },
    { id: 'convert-to-shape-tolerance', label: 'Convert to Shape Tolerance...', enabled: selected, run: () => void (async () => { const v = await promptName('Convert to Shape Tolerance in pixels (0.1 to 20; lower follows the edge closer)', String(engine.shapeTolerance), 'Convert'); if (v === null || v.trim() === '' || !Number.isFinite(Number(v))) return; engine.shapeTolerance = Math.max(0.1, Math.min(20, Number(v))); engine.selectionToShape(); })() },
    { id: 'find-layers', label: 'Find Layers...', keys: ['Alt+Shift+Mod+F'], enabled: has, run: () => dialogs.findLayers.show() },
    { id: 'load-selection', label: 'Load Selection...', enabled: () => engine.alphaDocuments().some((d) => loadSources(d).length > 0), run: () => dialogs.loadSelection.show() },
    { id: 'save-selection', label: 'Save Selection...', enabled: selected, run: () => dialogs.saveSelection.show() },
    { id: 'save-selection-channel', label: 'Save Selection as Channel', enabled: selected, run: () => { engine.saveSelection(); } },
    {
      id: 'new-channel', label: 'New Channel', enabled: has,
      params: { fill: { type: 'string', enum: ['black', 'white'], description: 'Black selects nothing, white selects everything; black when left out.' }, name: { type: 'string', description: 'The channel name; Alpha N when left out.' } },
      run: (a) => { const id = engine.newAlpha({ fill: a?.fill === 'white' ? 'white' : 'black', name: typeof a?.name === 'string' ? a.name : '' }); return id ? { channel: id } : undefined; },
    },
    {
      id: 'new-spot-channel', label: 'New Spot Channel', enabled: has,
      params: { name: { type: 'string', description: 'The channel name; Spot N when left out.' }, color: { type: 'string', description: 'Ink color as #rrggbb; red when left out.' }, solidity: { type: 'number', min: 0, max: 100, description: 'How solid the ink shows on screen, in percent; 100 when left out.' }, fill: { type: 'string', enum: ['black', 'white'], description: 'Black has no ink anywhere, white has ink everywhere; black when left out.' } },
      run: (a) => {
        const hex = typeof a?.color === 'string' && /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : null;
        const id = engine.newAlpha({ fill: a?.fill === 'white' ? 'white' : 'black', name: typeof a?.name === 'string' ? a.name : '', spot: { color: hex ? { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) } : undefined, solidity: a?.solidity === undefined ? undefined : Number(a.solidity) } });
        if (id && !a) dialogs.channelOptions.show(id);
        return id ? { channel: id } : undefined;
      },
    },
    { id: 'split-channels', label: 'Split Channels', enabled: has, run: () => ({ documents: engine.splitChannels() }) },
    {
      id: 'merge-channels', label: 'Merge Channels...', enabled: () => (engine.alphaDocuments().length > 0),
      params: ['red', 'green', 'blue'].reduce((o, k) => ({ ...o, [k]: { type: 'string', description: `The gray that becomes ${k}: an open document's id or name of the current size, optionally followed by | and one of its alpha channel names. All three open the dialog when left out.` } }), {}),
      run: (a) => {
        const docs = engine.alphaDocuments(), pick = ['red', 'green', 'blue'].map((k) => { const [d, ...c] = String(a?.[k] ?? '').split('|'), q = docs.find((x) => x.id === d || x.doc.id === d || x.name === d); return q ? { doc: q.id, channel: c.join('|') || undefined } : null; });
        if (!a || pick.some((x) => !x)) { dialogs.mergeChannels.show(); return undefined; }
        const q = engine.mergeChannels(pick as Array<{ doc: ID; channel?: string }>);
        return q ? { document: q.id } : undefined;
      },
    },
    {
      id: 'duplicate-channel', label: 'Duplicate Channel', enabled: () => !!engine.alphaFor(),
      params: { channel: { type: 'string', description: 'The alpha channel (id or name); the one chosen last in the Channels panel, or the last one, when left out.' }, name: { type: 'string', description: 'The copy name; "<name> copy" when left out.' } },
      run: (a) => { const c = engine.alphaFor(typeof a?.channel === 'string' ? a.channel : undefined); const id = c ? engine.duplicateAlpha(c.id, typeof a?.name === 'string' ? a.name : undefined) : null; return id ? { channel: id } : undefined; },
    },
    {
      id: 'channel-options', label: 'Channel Options...', enabled: () => !!engine.alphaFor(),
      params: {
        channel: { type: 'string', description: 'The alpha channel (id or name); the one chosen last in the Channels panel, or the last one, when left out.' },
        name: { type: 'string', description: 'The new name.' },
        indicates: { type: 'string', enum: ['masked', 'selected'], description: 'Whether the overlay color marks the masked or the selected areas.' },
        color: { type: 'string', description: 'Overlay color as #rrggbb.' },
        opacity: { type: 'number', min: 0, max: 100, description: 'Overlay opacity in percent; the solidity of a spot channel.' },
        spot: { type: 'boolean', description: 'True makes it a spot channel (the color is its ink), false an alpha channel.' },
      },
      run: (a) => {
        const c = engine.alphaFor(typeof a?.channel === 'string' ? a.channel : undefined);
        if (!c) return undefined;
        if (!a || !['name', 'indicates', 'color', 'opacity', 'spot'].some((k) => a[k] !== undefined)) { dialogs.channelOptions.show(c.id); return undefined; }
        const hex = typeof a.color === 'string' && /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : null;
        return { changed: engine.setAlphaOptions(c.id, { name: typeof a.name === 'string' ? a.name : undefined, indicates: a.indicates === 'selected' || a.indicates === 'masked' ? a.indicates : undefined, color: hex ? { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) } : undefined, opacity: a.opacity === undefined ? undefined : Number(a.opacity), spot: typeof a.spot === 'boolean' ? a.spot : undefined }) };
      },
    },
    { id: 'channel-up', label: 'Move Channel Up', enabled: () => { const c = engine.alphaFor(); return !!c && engine.current?.doc.alphas?.[0] !== c; }, run: () => { const c = engine.alphaFor(); if (c) engine.moveAlpha(c.id, -1, true); } },
    { id: 'channel-down', label: 'Move Channel Down', enabled: () => { const c = engine.alphaFor(), l = engine.current?.doc.alphas; return !!c && !!l && l[l.length - 1] !== c; }, run: () => { const c = engine.alphaFor(); if (c) engine.moveAlpha(c.id, 1, true); } },
    { id: 'load-luminosity', label: 'Load Luminosity', keys: ['Alt+Mod+2'], enabled: has, run: () => engine.loadLuminosity() },
    { id: 'load-selection-vector-mask', label: "Vector Mask to Selection", enabled: () => !!layer()?.vectorMask, run: () => engine.loadSelection({ channel: 'vector' }) },
    { id: 'vmask-invert', label: 'Invert Vector Mask', enabled: () => !!layer()?.vectorMask, run: () => engine.changeVectorMask('invert') },
    { id: 'mask-invert', label: 'Invert Layer Mask', enabled: () => !!layer()?.mask, run: () => engine.invertMask() },
    { id: 'mask-properties', label: 'Mask Properties', enabled: () => !!layer()?.mask || !!layer()?.vectorMask, params: { target: { type: 'string', enum: ['pixel', 'vector'], description: 'Which mask; the pixel mask when left out, or the vector mask when the layer has only that.' }, density: { type: 'number', min: 0, max: 100, description: 'Mask density in percent; 100 leaves the mask as painted.' }, feather: { type: 'number', min: 0, max: 250, description: 'Mask feather in pixels; 0 leaves the edges as painted.' } }, run: (a) => { const vec = a?.target === 'vector' || (a?.target !== 'pixel' && !layer()?.mask); const shape = { ...(typeof a?.density === 'number' ? { density: a.density } : {}), ...(typeof a?.feather === 'number' ? { feather: a.feather } : {}) }; if (vec) engine.setVectorMaskShape(shape); else engine.setMaskShape(shape); } },
    { id: 'isolate-layers', label: 'Isolate Layers', checked: () => layers.isolated, enabled: () => layers.isolated || (engine.current?.selectedIds.size ?? 0) > 0, run: () => layers.toggleIsolate() },
    { id: 'lock-transparency', label: 'Lock Transparent Pixels', keys: ['/'], enabled: () => (engine.current?.selectedIds.size ?? 0) > 0, run: () => engine.toggleLock('transparency') },
    { id: 'lock-layers', label: () => (folderSelected() ? 'Lock All Layers in Group...' : 'Lock Layers...'), keys: ['Mod+/'], enabled: () => (engine.current?.selectedIds.size ?? 0) > 0, run: () => dialogs.lockLayers.show(folderSelected()) },
    { id: 'link-layers', label: () => (engine.selectionLinked ? 'Unlink Layers' : 'Link Layers'), enabled: () => engine.selectionLinked || (engine.current?.selectedIds.size ?? 0) > 1, run: () => engine.linkLayers() },
    { id: 'copy-layers', label: 'Copy Layers', enabled: () => (engine.current?.selectedIds.size ?? 0) > 0, run: () => { const n = engine.copyLayers(); if (n) toast(`Copied ${n} ${n === 1 ? 'layer' : 'layers'}.`); } },
    { id: 'paste-layers', label: 'Paste Layers', enabled: () => !!engine.current && engine.canPasteLayers, run: () => { engine.pasteLayers(); } },
    { id: 'copy-layers-to-document', label: 'Copy Layers to Document', params: { document: { type: 'string', description: 'The name or number (from 1) of the open document that takes the layers, or "new" for a new document the size of this one.' }, x: { type: 'number', description: 'Moves the copies this many pixels right; centered in the target when x and y are both left out.' }, y: { type: 'number', description: 'Moves the copies this many pixels down.' } },
      enabled: () => (engine.current?.selectedIds.size ?? 0) > 0 && engine.projects.length > 0,
      run: (a) => {
        const p = engine.current, ids = p ? [...p.selectedIds] : [], ref = a?.document === undefined || a.document === null ? '' : String(a.document).trim();
        if (!p || !ids.length) { toast('Select the layers to copy.', 'error'); return; }
        if (ref.toLowerCase() === 'new') { if (!engine.copyLayersToNewDocument(ids)) toast('The layers could not be copied to a new document.', 'error'); return; }
        const n = Number(ref), target = (Number.isInteger(n) && n >= 1 ? engine.projects[n - 1] : undefined) ?? engine.projects.find((q) => q.name === ref);
        if (!target || target === p) { toast('Name another open document, or give its number.', 'error'); return; }
        const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined), x = num(a?.x), y = num(a?.y);
        if (!engine.copyLayersToProject(ids, target.id, x === undefined && y === undefined ? false : { dx: x ?? 0, dy: y ?? 0 })) toast('The layers could not be copied.', 'error');
      } },
    { id: 'select-linked', label: 'Select Linked Layers', enabled: () => { const p = engine.current; return !!p && [...p.selectedIds].some((id) => { const k = p.layer(id)?.link; return !!k && p.doc.layers.some((l) => l.id !== id && l.link === k); }); }, run: () => engine.selectLinkedLayers() },
    { id: 'rasterize-all', label: 'Rasterize All Layers', enabled: () => !!engine.current?.doc.layers.some((l) => l.smart || l.text || l.vector || l.shape || l.fillContent), run: () => engine.rasterizeLayers('all') },
    { id: 'blend-next', label: 'Next Blend Mode', keys: ['Shift+='], enabled: pixel, run: () => engine.cycleBlend(true) },
    { id: 'blend-prev', label: 'Previous Blend Mode', keys: ['Shift+-'], enabled: pixel, run: () => engine.cycleBlend(false) },
    { id: 'select-all', label: 'All', keys: ['Mod+A'], enabled: has, run: () => engine.selectAll() },
    { id: 'deselect', label: 'Deselect', keys: ['Mod+D'], enabled: selected, run: () => engine.deselect() },
    { id: 'inverse', label: 'Inverse', keys: ['Shift+Mod+I'], enabled: selected, run: () => engine.invertSelection() },
    { id: 'color-range', label: 'Color Range...', enabled: () => !!engine.current, run: () => dialogs.colorRange.show() },
    { id: 'select-color-range', label: 'Select Color Range', enabled: () => !!engine.current,
      params: {
        mode: { type: 'string', enum: COLOR_RANGE_MODES.map(([id]) => id), description: 'What to select by: sampled colors, a hue family, tone, skin tones or depth (the Depth Map layer). Sampled Colors when left out.' },
        color: { type: 'string', description: 'For sampled colors: #rrggbb.' },
        fuzziness: { type: 'number', min: 0, max: 200, description: 'How far from the color, hue or depth limits still counts; 40 when left out.' },
        invert: { type: 'boolean', description: 'Select everything else.' },
        combine: { type: 'string', enum: ['new', 'add', 'subtract', 'intersect'], description: 'How the result meets the selection; new when left out (kept within the selection).' },
        localized: { type: 'boolean', description: 'Localized Color Clusters for sampled colors: the color counts only near x, y.' },
        spread: { type: 'number', min: 0, max: 100, description: 'Localized Color Clusters Range: percent of the picture diagonal over which the color fades out; 50 when left out.' },
        x: { type: 'number', description: 'Localized: the document x where the color was taken.' },
        y: { type: 'number', description: 'Localized: the document y where the color was taken.' },
        far_limit: { type: 'number', min: 0, max: 255, description: 'Depth mode: the farthest depth value (dark is far) to include; 128 when left out.' },
        near_limit: { type: 'number', min: 0, max: 255, description: 'Depth mode: the nearest depth value (bright is near) to include; 255 when left out.' },
      },
      run: (a) => {
        const mode = COLOR_RANGE_MODES.find(([id]) => id === a?.mode)?.[0] ?? 'sampled', m = /^#?([0-9a-f]{6})$/i.exec(String(a?.color ?? '')), n = parseInt(m?.[1] ?? '0', 16);
        if (mode === 'sampled' && !m) throw new Error('color must be #rrggbb for sampled colors.');
        const combine = a?.combine === 'new' ? 'replace' : a?.combine === 'add' || a?.combine === 'subtract' || a?.combine === 'intersect' ? a.combine : undefined;
        engine.selectColorRange({ mode, plus: mode === 'sampled' ? [{ r: n >> 16, g: (n >> 8) & 255, b: n & 255 }] : [], minus: [], fuzziness: typeof a?.fuzziness === 'number' ? a.fuzziness : 40, invert: a?.invert === true, combine, localized: a?.localized === true, spread: typeof a?.spread === 'number' ? a.spread : 50, at: [{ x: typeof a?.x === 'number' ? a.x : 0, y: typeof a?.y === 'number' ? a.y : 0 }], lo: typeof a?.far_limit === 'number' ? a.far_limit : 128, hi: typeof a?.near_limit === 'number' ? a.near_limit : 255 });
        const s = engine.current?.selection;
        return s ? { selected: true, x: s.x, y: s.y, w: s.w, h: s.h } : { selected: false };
      } },
    { id: 'layer-pixels', label: "Layer's Pixels", enabled: () => !!layer()?.raster, run: () => engine.selectLayerPixels() },
    { id: 'layer-bits-8', label: 'Convert Layer to 8 Bits', enabled: () => !!engine.current && !engine.precisionWhy(), run: () => engine.setLayerPrecision(8) },
    { id: 'layer-bits-16', label: 'Convert Layer to 16 Bits', enabled: () => !!engine.current && !engine.precisionWhy(), run: () => engine.setLayerPrecision(16) },
    { id: 'zoom-in', label: 'Zoom In', keys: ['Mod+='], enabled: has, run: () => engine.zoomStep(true) },
    { id: 'zoom-out', label: 'Zoom Out', keys: ['Mod+-'], enabled: has, run: () => engine.zoomStep(false) },
    { id: 'fit', label: 'Fit on Screen', keys: ['Mod+0'], enabled: has, run: () => engine.fit() },
    { id: 'fit-layers', label: 'Fit Layer(s) on Screen', enabled: has, run: () => { if (!engine.fitLayers()) toast('The selected layers have nothing to fit.', 'info'); } },   // 27.11
    { id: 'fit-artboard', label: 'Fit Artboard on Screen', enabled: () => !!engine.current?.doc.layers.some((l) => l.artboard), run: () => { engine.fitArtboard(); } },   // 27.11
    { id: 'guide-layout', label: 'New Guide Layout...', enabled: has, run: () => { void import('./ui/panels/guide-layout').then((m) => m.openGuideLayout(engine)); } },   // 27.11
    { id: 'guides-from-shape', label: 'New Guides From Shape', enabled: () => !!engine.current?.activeLayer?.vector || !!engine.current?.selection,
      params: { source: { type: 'string', enum: ['auto', 'layer', 'selection'], description: 'Where the box comes from: the shape layer, the selection, or the layer first and then the selection; auto when left out.' }, edges: { type: 'boolean', description: 'Guides on the four edges; true when left out.' }, centre: { type: 'boolean', description: 'Guides through the center; false when left out.' } },
      run: (a) => { if (!engine.guidesFromShape({ source: a?.source === 'layer' || a?.source === 'selection' ? a.source : 'auto', edges: a?.edges !== false, centre: a?.centre === true })) toast('Select a shape layer, or make a selection, to place guides from.', 'info'); } },   // 27.11
    { id: 'guides-from-shape-centre', label: 'New Guides From Shape Center', enabled: () => !!engine.current?.activeLayer?.vector || !!engine.current?.selection, run: () => { if (!engine.guidesFromShape({ edges: false, centre: true })) toast('Select a shape layer, or make a selection, to place guides from.', 'info'); } },
    { id: 'actual', label: 'Actual Pixels', keys: ['Mod+1'], enabled: has, run: () => engine.zoomTo(1) },
    { id: 'flip-view-h', label: 'Flip Horizontal', checked: () => !!engine.current?.viewport.flipped, enabled: has, run: () => engine.setViewFlip(!engine.current?.viewport.flipped) },
    { id: 'canvas-scrollbars', label: 'Canvas Scrollbars', checked: () => engine.canvasScrollbars, enabled: has, run: () => { engine.setCanvasScrollbars(!engine.canvasScrollbars); savePrefs({ ...loadPrefs(), canvasScrollbarsShown: engine.canvasScrollbars }); } },
    { id: 'no-tool', label: 'No Tool', enabled: has, run: () => engine.setTool('idle') },
    { id: 'print-size', label: 'Print Size', enabled: has, run: () => { const ppi = engine.current?.doc.resolution || 72; engine.zoomTo(96 / ppi); } },
    { id: 'pixel-grid', label: 'Pixel Grid', checked: () => engine.showPixelGrid, run: () => engine.update({ showPixelGrid: !engine.showPixelGrid }) },
    { id: 'pattern-preview', label: 'Pattern Preview', checked: () => engine.view.patternPreview, run: () => engine.setView({ patternPreview: !engine.view.patternPreview }) },
    { id: 'pixel-art-preview', label: 'Pixel Art Preview', checked: () => engine.view.pixelArt, run: () => engine.setView({ pixelArt: !engine.view.pixelArt }) },
    { id: 'transform-controls', label: 'Transform Controls', checked: () => engine.showTransformControls, run: () => engine.update({ showTransformControls: !engine.showTransformControls }) },
    { id: 'edit-menus', label: 'Menus...', run: () => dialogs.menusEditor.show() },
    { id: 'customize-toolbar', label: 'Toolbar...', run: () => openToolbarDialog(engine) },   // Edit > Toolbar (36.22)
    { id: 'shortcuts', label: 'Keyboard Shortcuts...', keys: ['Alt+Shift+Mod+K', 'Shift+/'], run: () => dialogs.shortcuts.show() },   // Edit and Help menus
    { id: 'search', label: 'Search...', keys: ['Mod+K'], run: () => dialogs.palette.show() },
    { id: 'notices', label: 'Notices...', run: () => dialogs.notices.show() },
    { id: 'jobs-list', label: 'Jobs', checked: () => status.jobsOpen, run: () => status.toggleJobs() },
    { id: 'apply-edit', label: 'Apply Pending Edit', keys: ['Enter'], enabled: has, run: () => stage.toolKeydown(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', cancelable: true })) },
    { id: 'cancel-edit', label: 'Cancel Pending Edit', keys: ['Escape'], enabled: has, run: () => stage.toolKeydown(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', cancelable: true })) },
    { id: 'about', label: 'About FormVis', run: () => dialogs.about.show(caps) },
    {
      id: 'system-info', label: 'System Info...',
      params: { show: { type: 'boolean', description: 'Open the System Info window; true when left out. Either way the text is returned.' } },
      run: async (a) => {
        const mb = (n?: number): string => (n === undefined ? 'not reported' : `${(n / 1048576).toFixed(0)} MB`);
        const [c, m] = [await api.capabilities(), await api.metrics()], s = window.screen, pr = loadPrefs();
        const lines = [
          `formvis ${VERSION}${c ? `, engine ${c.version}${c.desktop ? ' (desktop)' : ''}` : ', engine offline'}`,
          `System: ${navigator.platform || 'unknown'}, ${navigator.hardwareConcurrency || '?'} logical processors, ${(navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? '?'} GB reported to the page`,
          `Browser: ${navigator.userAgent}`,
          `Graphics: ${detectedName(gpuProbe) ?? 'not detected'}, renderer setting ${pr.renderer}, ${gpuDisplay ? 'GPU display in use' : 'CPU display'}`,
          `Monitor: ${s.width} x ${s.height} px at ${window.devicePixelRatio}x, ${s.colorDepth}-bit, ${matchMedia('(color-gamut: rec2020)').matches ? 'Rec.2020' : matchMedia('(color-gamut: p3)').matches ? 'Display P3' : 'sRGB'} gamut, ${matchMedia('(dynamic-range: high)').matches ? 'HDR' : 'standard'} range`,
          `Engine memory: working set ${mb(m?.rss)}, peak ${mb(m?.peak)}, private ${mb(m?.private)}, computer ${mb(m?.available)} free of ${mb(m?.total)}${m ? `, process ${m.pid}, up ${Math.round(m.uptime / 60)} min` : ''}`,
          `Graphics memory: ${m?.gpu?.length ? m.gpu.map((g) => `${g.name} ${mb(g.used)}${g.total ? ` of ${mb(g.total)}` : ''}`).join('; ') : 'not reported (needs nvidia-smi, or the Windows performance counters)'}`,
          `Pixel budget: ${c?.pixelBudget ? `${(c.pixelBudget / 1e6).toFixed(0)} MP` : 'unknown'}; open documents ${engine.projects.length}`,
          `Data folder: ${c?.dataDir ?? 'unknown'}${c?.switches?.portable ? ' (portable)' : ''}`,
          `Engine log: ${c?.logFile ?? 'none'}`,
          `Switches: ${c?.switches ? `tiles ${c.switches.tiles}, ${c.switches.noComfy ? 'no ComfyUI, ' : ''}log level ${c.switches.logLevel}` : 'unknown'}`,
        ];
        if (a?.show !== false) dialogs.systemInfo.show(lines.join('\n'));
        return lines.join('\n');
      },
    },
    {
      id: 'copy-engine-log', label: 'Copy Engine Log',
      run: async () => {
        const log = await api.engineLog(400);
        if (!log) { toast('The engine is offline, so there is no engine log to copy.', 'error'); return; }
        void navigator.clipboard?.writeText(log.text).then(() => toast(`Copied the end of ${log.path}.`), () => toast('The clipboard is not available here.', 'error'));
      },
    },
    { id: 'brush-settings', label: 'Brush Settings...', keys: ['F5'], run: () => dialogs.brushSettings.show() },
    { id: 'brush-size-up', label: 'Increase Brush Size', run: () => stepBrush(engine, 'size', 1) },
    { id: 'brush-size-down', label: 'Decrease Brush Size', run: () => stepBrush(engine, 'size', -1) },
    { id: 'brush-harder', label: 'Increase Brush Hardness', run: () => stepBrush(engine, 'hardness', 1) },
    { id: 'brush-softer', label: 'Decrease Brush Hardness', run: () => stepBrush(engine, 'hardness', -1) },
    { id: 'get-brush', label: 'Get Brush Settings', run: () => brushState() },
    {
      id: 'set-brush', label: 'Set Brush Settings',
      params: {
        size: { type: 'integer', min: 1, max: 5000, description: 'Diameter in pixels.' }, hardness: { type: 'number', min: 0, max: 100, description: 'Percent.' }, opacity: { type: 'number', min: 1, max: 100, description: 'Percent.' }, flow: { type: 'number', min: 1, max: 100, description: 'Percent.' },
        mode: { type: 'string', description: 'normal, behind, clear or a layer blend mode id such as multiply or vivid-light.' }, preset: { type: 'string', description: 'A brush preset id or name, applied before the other values.' },
        angle: { type: 'number', min: -180, max: 180 }, roundness: { type: 'number', min: 1, max: 100 }, spacing: { type: 'number', min: 1, max: 1000, description: 'Percent of the diameter.' },
        size_jitter: { type: 'number', min: 0, max: 100 }, angle_jitter: { type: 'number', min: 0, max: 100 }, roundness_jitter: { type: 'number', min: 0, max: 100 },
        scatter: { type: 'number', min: 0, max: 1000 }, both_axes: { type: 'boolean' }, count: { type: 'integer', min: 1, max: 16 }, count_jitter: { type: 'number', min: 0, max: 100 },
        flip_x: { type: 'boolean' }, flip_y: { type: 'boolean' }, noise: { type: 'boolean' }, wet_edges: { type: 'boolean' },
        texture_on: { type: 'boolean' }, texture_scale: { type: 'number', min: 1, max: 1000 }, texture_depth: { type: 'number', min: 0, max: 100 },
        dual_on: { type: 'boolean' }, dual_size: { type: 'number', min: 1, max: 5000 }, dual_scatter: { type: 'number', min: 0, max: 1000 }, dual_count: { type: 'integer', min: 1, max: 16 },
        color_on: { type: 'boolean' }, color_fg_bg: { type: 'number', min: 0, max: 100 }, color_hue: { type: 'number', min: 0, max: 100 }, color_saturation: { type: 'number', min: 0, max: 100 }, color_brightness: { type: 'number', min: 0, max: 100 },
        transfer_on: { type: 'boolean' }, transfer_opacity: { type: 'number', min: 0, max: 100 }, transfer_flow: { type: 'number', min: 0, max: 100 },
      },
      run: (a) => {
        const num = (k: string, lo: number, hi: number): number | undefined => (a?.[k] === undefined ? undefined : Math.min(hi, Math.max(lo, Number(a[k]))));
        const flag = (k: string): boolean | undefined => (a?.[k] === undefined ? undefined : a[k] === true || a[k] === 'true');
        if (a?.preset !== undefined && a.preset !== '') {
          const pr = allBrushPresets().find((q) => q.id === String(a.preset) || q.name === String(a.preset));
          if (!pr) throw new Error(`No brush preset has the id or name ${String(a.preset)}.`);
          engine.applyBrushPreset(pr);
        }
        const size = num('size', 1, 5000), hard = num('hardness', 0, 100), op = num('opacity', 1, 100), flow = num('flow', 1, 100);
        engine.setBrush({ ...(size !== undefined ? { diameter: size } : {}), ...(hard !== undefined ? { hardness: hard / 100 } : {}), ...(op !== undefined ? { opacity: op / 100 } : {}) });
        if (flow !== undefined) engine.brushFlow = flow / 100;
        if (a?.mode !== undefined) {
          const m = String(a.mode);
          if (m !== 'behind' && m !== 'clear' && !BLEND_MODES.some((b) => b.id === m)) throw new Error(`Unknown mode ${m}: use normal, behind, clear or a blend mode id.`);
          engine.setBrushBlend(m as Engine['brushBlend']);
        }
        const s = engine.brushShape, shape: Partial<Engine['brushShape']> = {};
        const put = <K extends keyof Engine['brushShape']>(k: K, v: Engine['brushShape'][K] | undefined): void => { if (v !== undefined) shape[k] = v; };
        put('angle', num('angle', -180, 180)); put('roundness', num('roundness', 1, 100));
        const sp = num('spacing', 1, 1000); if (sp !== undefined) shape.spacing = sp;
        put('sizeJitter', num('size_jitter', 0, 100)); put('angleJitter', num('angle_jitter', 0, 100)); put('roundnessJitter', num('roundness_jitter', 0, 100));
        put('scatter', num('scatter', 0, 1000)); put('bothAxes', flag('both_axes')); put('count', num('count', 1, 16)); put('countJitter', num('count_jitter', 0, 100));
        put('flipX', flag('flip_x')); put('flipY', flag('flip_y')); put('noise', flag('noise')); put('wetEdges', flag('wet_edges'));
        const tx = { on: flag('texture_on'), scale: num('texture_scale', 1, 1000), depth: num('texture_depth', 0, 100) }, du = { on: flag('dual_on'), diameter: num('dual_size', 1, 5000), scatter: num('dual_scatter', 0, 1000), count: num('dual_count', 1, 16) };
        const co = { on: flag('color_on'), fgBg: num('color_fg_bg', 0, 100), hue: num('color_hue', 0, 100), saturation: num('color_saturation', 0, 100), brightness: num('color_brightness', 0, 100) }, tr = { on: flag('transfer_on'), opacity: num('transfer_opacity', 0, 100), flow: num('transfer_flow', 0, 100) };
        const defined = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
        if (Object.keys(defined(tx)).length) shape.texture = { ...s.texture, ...defined(tx) } as typeof s.texture;
        if (Object.keys(defined(du)).length) shape.dual = { ...s.dual, ...defined(du) } as typeof s.dual;
        if (Object.keys(defined(co)).length) shape.color = { ...s.color, ...defined(co) } as typeof s.color;
        if (Object.keys(defined(tr)).length) shape.transfer = { ...s.transfer, ...defined(tr) } as typeof s.transfer;
        if (Object.keys(shape).length) { engine.brushShape = { ...s, ...shape }; if (a?.preset === undefined) engine.brushPresetId = null; engine.emit('options', null); }
        return brushState();
      },
    },
    { id: 'save-brush-preset', label: 'Save Brush Preset', params: { name: { type: 'string', description: 'The preset name; asked for when left out.' }, group: { type: 'string', description: 'The folder; My Brushes when left out.' } }, run: async (a) => { const name = a?.name === undefined ? await promptName('Save Brush Preset', `Brush ${importedBrushPresets.length + 1}`, 'Save') : String(a.name); if (!name?.trim()) return { saved: false }; const r = await saveBrushPreset(engine, name, a?.group === undefined ? undefined : String(a.group)); return { saved: true, id: r.preset.id, group: r.preset.group, kept: r.kept }; } },
    { id: 'rename-brush-preset', label: 'Rename Brush Preset', params: { id: { type: 'string', required: true }, name: { type: 'string', required: true } }, run: async (a) => { if (!a?.id) { toast('Rename Brush Preset needs the id of a saved or imported brush preset (id) and the new name.', 'error'); return undefined; } if (!(await renameImportedBrush(String(a?.id ?? ''), String(a?.name ?? '')))) throw new Error('Only saved or imported brush presets can be renamed: give the id of one.'); engine.emit('options', null); return { renamed: true }; } },
    { id: 'delete-brush-preset', label: 'Delete Brush Preset', params: { id: { type: 'string', required: true } }, run: async (a) => { if (!a?.id) { toast('Delete Brush Preset needs the id of a saved or imported brush preset (id).', 'error'); return undefined; } if (!(await removeImportedBrush(String(a?.id ?? '')))) throw new Error('Only saved or imported brush presets can be deleted: give the id of one.'); engine.emit('options', null); return { deleted: true }; } },
    { id: 'move-brush-preset', label: 'Move Brush Preset', params: { id: { type: 'string', required: true }, group: { type: 'string', description: 'The folder to move it to; it stays in its folder when left out.' }, before: { type: 'string', description: 'The id of the preset to place it before; last when left out.' } }, run: async (a) => { if (!a?.id) { toast('Move Brush Preset needs the id of a saved or imported brush preset (id).', 'error'); return undefined; } if (!(await moveBrushPreset(String(a?.id ?? ''), a?.group === undefined ? null : String(a.group), a?.before === undefined ? null : String(a.before)))) throw new Error('Only saved or imported brush presets can be moved: give the id of one.'); engine.emit('options', null); return { moved: true }; } },
    { id: 'rename-brush-group', label: 'Rename Brush Folder', params: { from: { type: 'string', required: true }, to: { type: 'string', required: true } }, run: async (a) => { if (!a?.from) { toast('Rename Brush Folder needs the folder to rename (from) and the new name (to).', 'error'); return undefined; } if (!(await renameBrushGroup(String(a?.from ?? ''), String(a?.to ?? '')))) throw new Error('No saved or imported brush preset is in that folder.'); engine.emit('options', null); return { renamed: true }; } },
    { id: 'paragraph-styles', label: 'Paragraph Styles...', run: () => dialogs.paragraphStyles.show() },
    { id: 'load-default-type-styles', label: 'Load Default Type Styles', enabled: has, run: () => { engine.loadDefaultTypeStyles(); } },
    { id: 'save-default-type-styles', label: 'Save Default Type Styles', enabled: has, run: () => { engine.saveDefaultTypeStyles(); } },
    { id: 'reset-character', label: 'Reset Character', run: async () => { await engine.resetTypeAttributes('character'); } },
    { id: 'reset-paragraph', label: 'Reset Paragraph', run: async () => { await engine.resetTypeAttributes('paragraph'); } },
    { id: 'type-all-caps', label: 'All Caps', checked: () => (typedAttrs()?.caps ?? typeNow().caps) === 'all', run: () => { const on = (typedAttrs()?.caps ?? typeNow().caps) === 'all'; if (typedStyle({ caps: on ? null : 'all' })) { engine.emit('options', null); return; } return typeAttr({ caps: on ? undefined : 'all' }); } },
    { id: 'type-small-caps', label: 'Small Caps', checked: () => (typedAttrs()?.caps ?? typeNow().caps) === 'small', run: () => { const on = (typedAttrs()?.caps ?? typeNow().caps) === 'small'; if (typedStyle({ caps: on ? null : 'small' })) { engine.emit('options', null); return; } return typeAttr({ caps: on ? undefined : 'small' }); } },
    { id: 'type-underline', label: 'Underline', checked: () => !!(typedAttrs()?.underline ?? typeNow().underline), run: () => { const on = !!(typedAttrs()?.underline ?? typeNow().underline); if (typedStyle({ underline: on ? null : true })) { engine.emit('options', null); return; } return typeAttr({ underline: !on || undefined }); } },
    { id: 'type-strikethrough', label: 'Strikethrough', checked: () => !!(typedAttrs()?.strike ?? typeNow().strike), run: () => { const on = !!(typedAttrs()?.strike ?? typeNow().strike); if (typedStyle({ strike: on ? null : true })) { engine.emit('options', null); return; } return typeAttr({ strike: !on || undefined }); } },
    ...(['none', 'sharp', 'crisp', 'strong', 'smooth', 'windows-lcd', 'windows'] as const).map((how) => ({
      id: `type-aa-${how}`, label: how === 'windows-lcd' ? 'Windows LCD' : how[0].toUpperCase() + how.slice(1),
      checked: () => (typeNow().antialias ?? 'smooth') === how, run: () => typeAttr({ antialias: how }),
    })),
    ...([['liga', 'Standard Ligatures'], ['calt', 'Contextual Alternates'], ['dlig', 'Discretionary Ligatures'], ['swsh', 'Swash'], ['onum', 'Oldstyle'], ['salt', 'Stylistic Alternates'], ['titl', 'Titling Alternates'], ['ornm', 'Ornaments'], ['ordn', 'Ordinals'], ['frac', 'Fractions']] as const).map(([tag, label]) => ({
      id: `type-ot-${tag}`, label, enabled: has,
      params: { start: { type: 'integer' as const, min: 0, description: 'First character of the range (counted from 0) of the selected type layers; the whole text when start and end are both left out.' }, end: { type: 'integer' as const, min: 0, description: 'End of the range, not included.' }, on: { type: 'boolean' as const, description: 'true turns the feature on, false off; left out, it toggles.' } },
      checked: () => typedFeatureOn(tag) ?? featureOn(typeNow().features, tag), run: (a?: Record<string, unknown>) => typeFeature(tag, a),
    })),
    { id: 'character-styles', label: 'Character Styles...', run: () => dialogs.characterStyles.show() },
    { id: 'glyphs', label: 'Glyphs', run: () => dialogs.glyphs.show() },
    { id: 'tool-presets', label: 'Tool Presets', run: () => dialogs.toolPresets.show() },
    { id: 'tool-preset-apply', label: 'Apply Tool Preset', params: { name: { type: 'string', description: 'Name of the saved tool preset to apply.' } }, run: (a) => { const n = typeof a?.name === 'string' ? a.name : ''; if (!dialogs.toolPresets.applyByName(n)) toast(`No tool preset named "${n}".`, 'info'); } },
    {
      id: 'find-replace-text', label: 'Find and Replace Text...', enabled: has,
      params: {
        find: { type: 'string', description: 'Text to find.' },
        replace: { type: 'string', description: 'Replacement text. Empty deletes the matches.' },
        case_sensitive: { type: 'boolean', description: 'Match case. Default false.' },
        whole_word: { type: 'boolean', description: 'Match whole words only. Default false.' },
        all: { type: 'boolean', description: 'Search every type layer, not only the active one. Default true.' },
      },
      run: async (a) => {
        const find = a && typeof a.find === 'string' ? a.find : '';
        if (!find) { dialogs.findReplaceText.show(); return; }
        const n = await engine.replaceText(find, typeof a?.replace === 'string' ? a.replace : '', { caseSensitive: a?.case_sensitive === true, wholeWord: a?.whole_word === true, all: a?.all !== false });
        toast(`${n} replacement${n === 1 ? '' : 's'}.`, 'info');
      },
    },
    {
      id: 'paste-lorem-ipsum', label: 'Paste Lorem Ipsum', enabled: has,
      params: {
        at: { type: 'number', min: 0, description: 'Character position in the active type layer to insert at; while typing the caret is used, and the end of the text when left out.' },
        new_layer: { type: 'boolean', description: 'Make a new paragraph type layer even when a type layer is active.' },
      },
      run: async (a) => {
        const l = engine.current?.activeLayer, p = engine.current;
        const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';
        if (a?.new_layer !== true && typing.insertAtCaret(lorem)) return;
        if (a?.new_layer !== true && l?.text && liveText(l)) {
          const c = l.text.content, at = typeof a?.at === 'number' ? Math.max(0, Math.min(c.length, Math.round(a.at))) : -1;
          await engine.updateTextLayer(l.id, { ...l.text, content: at >= 0 ? c.slice(0, at) + lorem + c.slice(at) : c.trim() ? `${c}\n${lorem}` : lorem });
          return;
        }
        // No type layer active: a new paragraph layer, in a box a third of the canvas wide, near its top left.
        if (!p) return;
        const w = Math.max(120, Math.round(p.doc.width / 3)), x = Math.round(p.doc.width / 12);
        await engine.createTextLayer({ x, y: x }, { ...engine.textSettings, content: lorem, color: { ...engine.fg }, box: { w, h: Math.round(p.doc.height / 2) }, warp: null, onPath: null, rendered: undefined });
      },
    },
    { id: 'type-horizontal', label: 'Horizontal', enabled: () => engine.liveText(engine.current?.activeLayer), run: async () => { const l = engine.current?.activeLayer; if (l?.text && liveText(l) && l.text.direction === 'vertical') await engine.updateTextLayer(l.id, { ...l.text, direction: 'horizontal' }); } },
    { id: 'type-vertical', label: 'Vertical', enabled: () => engine.liveText(engine.current?.activeLayer), run: async () => { const l = engine.current?.activeLayer; if (l?.text && liveText(l) && l.text.direction !== 'vertical') await engine.updateTextLayer(l.id, { ...l.text, direction: 'vertical', box: null }); } },
    {
      id: 'new-type-layer', label: 'Type Layer', enabled: has,
      params: {
        text: { type: 'string', description: 'The text; leave out to start typing on the canvas.' },
        x: { type: 'number', description: 'Left edge (first baseline start) in document pixels; a twelfth of the width when left out.' },
        y: { type: 'number', description: 'First baseline in document pixels; a third of the height when left out.' },
        size: { type: 'number', min: 1, max: 2000, description: 'Type size in pixels; the Type tool size when left out.' },
        font: { type: 'string', description: 'Font family; the Type tool font when left out.' },
        color: { type: 'string', description: 'Color as #rrggbb; the foreground color when left out.' },
        align: { type: 'string', enum: ['left', 'center', 'right', 'justify'], description: 'Alignment; the Type tool alignment when left out.' },
        orientation: { type: 'string', enum: ['horizontal', 'vertical'], description: 'Direction of the lines; horizontal when left out.' },
        box_width: { type: 'number', min: 1, description: 'Width of a paragraph box in pixels; point text when left out.' },
        box_height: { type: 'number', min: 1, description: 'Height of the paragraph box; a quarter of the document height when left out.' },
      },
      run: async (a) => {
        const p = engine.current;
        if (!p) return;
        const n = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
        const vertical = a?.orientation === 'vertical', bw = n(a?.box_width, 0), x = n(a?.x, Math.round(p.doc.width / 12)), y = n(a?.y, Math.round(p.doc.height / 3));
        const box = !vertical && bw >= 1 ? { w: bw, h: Math.max(1, n(a?.box_height, Math.round(p.doc.height / 4))) } : null;
        const hex = typeof a?.color === 'string' && /^#[0-9a-f]{6}$/i.test(a.color) ? parseInt(a.color.slice(1), 16) : null;
        const align = a?.align === 'left' || a?.align === 'center' || a?.align === 'right' || a?.align === 'justify' ? a.align : engine.textSettings.align;
        const spec = {
          ...engine.textSettings, align, direction: vertical ? 'vertical' as const : 'horizontal' as const, box, warp: null, onPath: null, rendered: undefined,
          size: Math.min(2000, Math.max(1, n(a?.size, engine.textSettings.size))), family: typeof a?.font === 'string' && a.font.trim() ? a.font.trim() : engine.textSettings.family,
          color: hex === null ? { ...engine.fg } : { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 },
        };
        if (typeof a?.text === 'string' && a.text.trim()) { await engine.createTextLayer({ x, y }, { ...spec, content: a.text }); return; }
        engine.typeMask = false;
        engine.textSettings = { ...spec, content: '' };
        engine.setTool('type');
        document.dispatchEvent(new CustomEvent('cv:type', { detail: { x, y, box: box ?? undefined } }));
      },
    },
    ...([['default', 'language-default', 'Default Features'], ['eastAsian', 'language-east-asian', 'East Asian Features'], ['middleEastern', 'language-middle-eastern', 'Middle Eastern Features'], ['southAsian', 'language-south-asian', 'Middle Eastern and South Asian Features']] as const).map(([shaping, id, label]) => ({
      id, label,
      checked: () => { const l = engine.current?.activeLayer; return (l?.text && liveText(l) ? l.text.shaping : engine.textSettings.shaping) === (shaping === 'default' ? undefined : shaping); },
      run: async () => {
        const l = engine.current?.activeLayer, value = shaping === 'default' ? undefined : shaping;
        engine.textSettings = { ...engine.textSettings, shaping: value };
        engine.emit('options', null);
        document.dispatchEvent(new CustomEvent('cv:type-settings'));
        if (l?.text && liveText(l) && !typing.editing && l.text.shaping !== value) await engine.updateTextLayer(l.id, { ...l.text, shaping: value });
      },
    })),
    ...([['auto', 'Follow Language Options'], ['ltr', 'Left to Right'], ['rtl', 'Right to Left']] as const).map(([dir, label]) => ({
      id: `type-direction-${dir}`, label,
      checked: () => { const l = engine.current?.activeLayer; return (l?.text && liveText(l) ? l.text.bidi : engine.textSettings.bidi) === (dir === 'auto' ? undefined : dir); },
      run: async () => {
        const l = engine.current?.activeLayer, value = dir === 'auto' ? undefined : dir;
        engine.textSettings = { ...engine.textSettings, bidi: value };
        engine.emit('options', null);
        document.dispatchEvent(new CustomEvent('cv:type-settings'));
        if (l?.text && liveText(l) && !typing.editing && l.text.bidi !== value) await engine.updateTextLayer(l.id, { ...l.text, bidi: value });
      },
    })),
    { id: 'list-fonts', label: 'List Fonts', run: () => ({ families: fontFamilies(), faces: ['Regular', 'Italic', 'Bold', 'Bold Italic'], current: engine.textSettings.family }) },
    { id: 'replace-missing-fonts', label: 'Replace All Missing Fonts', enabled: has, run: async () => { const n = await dialogs.missingFonts.replaceAll(); toast(n ? `${n} type layer${n === 1 ? '' : 's'} set to the default font.` : 'No missing fonts in the type layers.', 'info'); } },
    { id: 'convert-point-text', label: 'Convert to Point Text', enabled: () => { const l = engine.current?.activeLayer; return engine.liveText(l) && !!l?.text?.box; }, run: async () => { await engine.convertTextKind('point'); } },
    { id: 'convert-paragraph-text', label: 'Convert to Paragraph Text', enabled: () => { const l = engine.current?.activeLayer; return engine.liveText(l) && !l?.text?.box; }, run: async () => { await engine.convertTextKind('paragraph'); } },
    { id: 'check-spelling', label: 'Check Spelling...', enabled: has, run: async () => { if (!(await dialogs.spelling.show())) toast('No misspelled words found in the type layers.', 'info'); } },
    { id: 'resolve-missing-fonts', label: 'Resolve Missing Fonts...', enabled: has, run: () => { if (!dialogs.missingFonts.show()) toast('No missing fonts in the type layers.', 'info'); } },
    { id: 'type-work-path', label: 'Create Work Path', enabled: () => engine.liveText(engine.current?.activeLayer), run: () => engine.typeToWorkPath() },
    { id: 'type-to-shape', label: 'Convert to Shape', enabled: () => engine.liveText(engine.current?.activeLayer), run: () => engine.typeToShape() },
    ...FONT_PREVIEWS.map((v) => ({ id: `font-preview-${v}`, label: v === 'none' ? 'None' : v === 'extra' ? 'Extra Large' : v === 'huge' ? 'Huge' : v[0].toUpperCase() + v.slice(1), checked: () => loadPrefs().fontPreview === v, run: () => { updatePrefs({ fontPreview: v }); engine.emit('options', null); } })),   // Type > Font Preview Size (36.31)
    { id: 'add-font-files', label: 'Add Font Files...', run: () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.ttf,.otf,.woff,.woff2'; input.multiple = true;
      input.addEventListener('change', () => void (async () => {
        const names: string[] = [];
        for (const f of Array.from(input.files ?? [])) {
          try { names.push(await addFontFace(familyOfFile(f.name), await f.arrayBuffer())); } catch (err) { toast(`${f.name}: ${message(err)}`, 'error'); }
        }
        if (names.length) { engine.emit('options', null); toast(`Added ${names.join(', ')} to the font menus.`, 'info'); }
      })());
      input.click();
    } },
    { id: 'add-web-font', label: 'Add Web Font...', params: { url: { type: 'string', description: 'Address of a font file (ttf, otf, woff or woff2) the server allows pages to load.' }, family: { type: 'string', description: 'The family name to list it under.' } },
      run: async (a) => {
        const url = typeof a?.url === 'string' ? a.url.trim() : '', family = typeof a?.family === 'string' ? a.family.trim() : '';
        if (!url || !family) { toast('Give the font file address and a family name.', 'error'); return; }
        try { await addFontFace(family, url); engine.emit('options', null); toast(`Added ${family} to the font menus.`, 'info'); } catch (err) { toast(`${family}: ${message(err)}`, 'error'); }
      } },
    { id: 'update-all-text', label: 'Update All Text Layers', enabled: has, run: async () => { const n = await engine.updateAllTextLayers(); toast(tn(n, 'Updated {n} text layer.', 'Updated {n} text layers.'), 'info'); } },
    { id: 'type-features', label: 'OpenType Features', enabled: () => engine.liveText(engine.current?.activeLayer), params: { features: { type: 'string', description: 'Comma list of OpenType tags to turn on (liga, dlig, calt, salt, swsh, onum, titl, ornm, ordn, frac, smcp); -liga or -calt turns that default feature off; none clears them; left out, the features stay as they are.' } },
      run: async (a) => {
        const l = engine.current?.activeLayer;
        if (!l?.text || !engine.liveText(l)) return;
        if (a?.features === undefined || a.features === null) return;   // no argument: the layer's features stay as they are
        const list = String(a.features).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        await engine.updateTextLayer(l.id, { ...l.text, features: cleanFeatures(list) });
      } },
    { id: 'type-range-style', label: 'Character Range Style', enabled: () => engine.liveText(engine.current?.activeLayer) || typing.editing,
      params: {
        start: { type: 'integer', min: 0, description: 'First character of the range (counted from 0); the whole text when start and end are both left out.' }, end: { type: 'integer', min: 0, description: 'End of the range, not included.' },
        size: { type: 'number', min: 1, max: 2000, description: 'Size in pixels over the range.' }, color: { type: 'string', description: 'Color over the range as #rrggbb.' },
        family: { type: 'string', description: 'Font family over the range.' }, weight: { type: 'integer', min: 1, max: 1000, description: 'Weight over the range, 100 to 900.' },
        bold: { type: 'boolean', description: 'Bold over the range.' }, italic: { type: 'boolean', description: 'Italic over the range.' },
        baseline_shift: { type: 'number', min: -2000, max: 2000, description: 'Baseline shift in pixels over the range, up positive.' }, tracking: { type: 'integer', min: -1000, max: 10000, description: 'Tracking in thousandths of an em over the range.' },
        language: { type: 'string', description: 'Language tag of the range, such as ja or ar.' }, underline: { type: 'boolean', description: 'Underline over the range; false takes it off.' }, strike: { type: 'boolean', description: 'Strikethrough over the range; false takes it off.' },
        caps: { type: 'string', description: 'all, small or normal over the range.' },
        scale_x: { type: 'number', min: 10, max: 500, description: 'Horizontal scale in percent over the range; 100 takes it off.' }, scale_y: { type: 'number', min: 10, max: 500, description: 'Vertical scale in percent over the range; 100 takes it off.' },
        clear: { type: 'boolean', description: 'true clears every attribute the range sets, back to the layer\'s own.' },
      },
      run: (a) => typeRange(runPatchFrom(a), a) },
    { id: 'type-range-character-style', label: 'Apply Character Style to Range', enabled: () => engine.liveText(engine.current?.activeLayer) || typing.editing,
      params: { style: { type: 'string', description: 'Name or id of a character style of the document.' }, start: { type: 'integer', min: 0, description: 'First character of the range; the whole text when start and end are left out.' }, end: { type: 'integer', min: 0, description: 'End of the range, not included.' } },
      run: async (a) => {
        const key = String(a?.style ?? '').trim().toLowerCase(), cs = engine.current?.doc.characterStyles?.find((x) => x.id === a?.style || x.name.toLowerCase() === key);
        if (!cs) { toast('Name a character style of this document.'); return { layers: 0 }; }
        return typeRange(runPatchOfStyle(cs), a, (runs, s, e) => (cs.features ?? []).reduce((r, f) => withRunFeature(r, s, e, f.replace(/^-/, ''), !f.startsWith('-')), runs));
      } },
    { id: 'type-angle', label: 'Type Angle', enabled: () => engine.liveText(engine.current?.activeLayer), params: { angle: { type: 'number', min: -360, max: 360, description: 'Angle in degrees, clockwise; 0 or left out sets the type straight. The glyphs are drawn at the angle, so the edges stay sharp.' } },
      run: async (a) => { const v = typeof a?.angle === 'number' && Number.isFinite(a.angle) ? Math.max(-360, Math.min(360, a.angle)) : 0; await typeAttr({ angle: v || undefined }); } },
    { id: 'warp-text', label: 'Warp Text...', enabled: () => engine.liveText(engine.current?.activeLayer), run: () => dialogs.warpText.show() },
    { id: 'type-on-path', label: 'Type on Path...', enabled: () => !!engine.workPath?.subpaths.some((s) => s.anchors.length > 1), run: () => dialogs.typeOnPath.show() },
    { id: 'type-on-arc', label: 'Type on Arc...', enabled: has, params: TYPE_SHAPE_PARAMS_ARC, run: (a) => typeOnShapeRun('arc', a) },
    { id: 'type-path-flip', label: 'Flip Type on Path', enabled: () => !!engine.current?.activeLayer?.text?.onPath && engine.liveText(engine.current?.activeLayer),
      run: async () => { const l = engine.current?.activeLayer, tp = l?.text?.onPath; if (l?.text && tp && liveText(l)) await engine.updateTextLayer(l.id, { ...l.text, onPath: { ...tp, flip: !tp.flip } }); } },
    { id: 'type-path-release', label: 'Release Type from Path', enabled: () => !!engine.current?.activeLayer?.text?.onPath && engine.liveText(engine.current?.activeLayer),
      run: async () => { const l = engine.current?.activeLayer; if (l?.text?.onPath && liveText(l)) await engine.updateTextLayer(l.id, { ...l.text, onPath: null }); } },
    { id: 'type-on-circle', label: 'Type on Circle...', enabled: has, params: TYPE_SHAPE_PARAMS_CIRCLE, run: (a) => typeOnShapeRun('circle', a) },
    ...([
      ['arrange-tabs', 'Consolidate All to Tabs', 'tabs'], ['arrange-2up-v', '2-up Vertical', '2up-v'], ['arrange-2up-h', '2-up Horizontal', '2up-h'],
      ['arrange-3up', '3-up', '3up'], ['arrange-4up', '4-up', '4up'], ['arrange-6up', '6-up', '6up'],
      ['arrange-tile-v', 'Tile All Vertically', 'tile-v'], ['arrange-tile-h', 'Tile All Horizontally', 'tile-h'],
      ['arrange-3up-v', '3-up Vertical', '3up-v'], ['arrange-3up-h', '3-up Horizontal', '3up-h'],
    ] as const satisfies readonly (readonly [string, string, ArrangeLayout])[]).map(([id, label, layout]) => ({
      id, label, checked: () => viewTiles.layout === layout, enabled: () => layout === 'tabs' || engine.projects.length > 1 || engine.docViews.list.length > 0,
      run: () => { const was = viewTiles.layout; viewTiles.setLayout(layout); if (was !== layout) requestAnimationFrame(() => engine.fit()); if (layout === 'tabs') for (const v of [...engine.docViews.list]) engine.closeView(v.id); },   // Consolidate All to Tabs also brings every further view and floating window back (36.16)
    })),
    { id: 'arrange-tile', label: 'Tile', enabled: () => engine.projects.length > 1, run: () => {
      // The layout that fits the number of open documents: two side by side, then 3-up, 4-up, and 6-up for five or more.
      const n = engine.projects.length, layout: ArrangeLayout = n <= 2 ? '2up-v' : n === 3 ? '3up' : n === 4 ? '4up' : '6up', was = viewTiles.layout;
      viewTiles.setLayout(layout);
      if (was !== layout) requestAnimationFrame(() => engine.fit());
    } },
    { id: 'new-window', label: 'New Window for Document', enabled: has, run: () => { if (engine.openView() && viewTiles.layout === 'tabs') { viewTiles.setLayout('2up-v'); requestAnimationFrame(() => engine.fit()); } } },
    { id: 'float-window', label: 'Float in Window', enabled: has, run: () => floatViews.open() },
    { id: 'float-all-windows', label: 'Float All in Windows', enabled: has, run: () => floatViews.openAll() },
    { id: 'arrange-cascade', label: 'Cascade', enabled: () => floatViews.count > 0, run: () => floatViews.cascade() },
    { id: 'match-zoom', label: 'Match Zoom', enabled: () => engine.projects.length > 1, run: () => engine.matchViews({ zoom: true }) },
    { id: 'match-location', label: 'Match Location', enabled: () => engine.projects.length > 1, run: () => engine.matchViews({ location: true }) },
    { id: 'match-rotation', label: 'Match Rotation', enabled: () => engine.projects.length > 1, run: () => engine.matchViews({ rotation: true }) },
    { id: 'match-all', label: 'Match All', enabled: () => engine.projects.length > 1, run: () => engine.matchViews({ zoom: true, location: true, rotation: true }) },
    { id: 'benchmark', label: 'Performance Benchmark...', run: () => dialogs.benchmark.show() },
    { id: 'record-performance', label: 'Record Performance...', run: () => perfDialog.show() },
    { id: 'check-for-updates', label: 'Check for Updates...', enabled: hasPanels, run: () => void checkUpdates() },
    { id: 'reset-tool', label: 'Reset Tool', run: () => { const n = optionMemory.reset(engine.tool); toast(n ? `Reset ${n} ${n === 1 ? 'option' : 'options'} of the ${getTool(engine.tool)?.label ?? 'current'} tool.` : 'This tool already has its default options.', 'info'); } },
    { id: 'reset-all-tools', label: 'Reset All Tools', run: () => { const n = optionMemory.reset(); toast(n ? `Reset ${n} tool ${n === 1 ? 'option' : 'options'} to their defaults.` : 'Every tool already has its default options.', 'info'); } },
    { id: 'performance-hud', label: 'Performance HUD', checked: () => perfHud.on, run: () => perfHud.toggle() },
    { id: 'frame-trace', label: 'Frame Trace', checked: () => frameTrace.on, run: () => { if (frameTrace.on) { frameTrace.stop(); toast(frameTrace.summary(), 'info'); } else { frameTrace.start(); toast('Tracing frames; run Frame Trace again to stop, and Copy Frame Trace for the table.', 'info'); } engine.setView({}); } },
    { id: 'copy-frame-trace', label: 'Copy Frame Trace', enabled: () => frameTrace.samples.length > 0, run: () => { void navigator.clipboard?.writeText(frameTrace.csv()).then(() => toast(`Copied ${frameTrace.samples.length} traced frames as CSV.`), () => toast('The clipboard is not available here.', 'error')); } },
    { id: 'tile-grid', label: 'Tile Grid', checked: () => engine.view.tileGrid, enabled: has, run: () => engine.setView({ tileGrid: !engine.view.tileGrid }) },
    { id: 'simulate-gpu-loss', label: 'Simulate GPU Device Loss', enabled: () => !!gpuDisplay, run: () => { const d = gpuDisplay; if (d?.onLost) { d.onLost(); toast('Simulated a lost GPU device; drawing fell back.', 'info'); } } },
    { id: 'help-github', label: 'FormVis on GitHub', run: () => { window.open('https://github.com/nodemode-dev/formvis', '_blank', 'noopener'); } },
    {
      id: 'report-issue', label: 'Report an Issue...',
      run: async () => {
        const info = String(await commands.get('system-info')?.run({ show: false }) ?? '');
        dialogs.reportIssue.show(`${info}\n\nErrors this session:\n${errorLog.text().split('\n').slice(1).join('\n')}`);
      },
    },
    { id: 'copy-error-log', label: 'Copy Error Log', run: () => { void navigator.clipboard?.writeText(errorLog.text()).then(() => toast('Copied the error log.'), () => toast('The clipboard is not available here.', 'error')); } },
  );

  /** The profile the pixels of formvis's own clipboard are in, kept with the copy so a paste can ask when the target differs (Color Settings). */
  let clipSource: { stamp: string; icc: string | null; name: string } | null = null;
  async function askPasteProfile(): Promise<boolean> {
    const cb = engine.clipboard, src = clipSource, p = engine.current, dst = p?.doc.profile ?? null;
    if (!cb || !src || !p || src.stamp !== cb.stamp || !loadPrefs().colour.askPaste || p.doc.mode === 'cmyk' || p.doc.mode === 'lab' || (src.icc ?? '') === (dst?.icc ?? '')) return true;
    const how = await colourDialogs.mismatch.ask('The pasted picture', src.name, dst?.name ?? 'sRGB IEC61966-2.1');
    if (how === 'cancel') return false;
    if (how === 'convert') {
      try {
        const c = loadPrefs().colour, lut = await api.colourLut({ source: src.icc ? { icc: src.icc } : null, dest: dst ? { icc: dst.icc } : null, intent: c.intent, bpc: c.bpc });
        const s = createSurface(cb.surface.width, cb.surface.height), x = ctxOf(s);
        x.drawImage(cb.surface as CanvasImageSource, 0, 0);
        const img = x.getImageData(0, 0, s.width, s.height);
        applyLut(img.data, lut);
        x.putImageData(img, 0, 0);
        engine.clipboard = { ...cb, surface: s };
        clipSource = { stamp: cb.stamp, icc: dst?.icc ?? null, name: dst?.name ?? 'sRGB IEC61966-2.1' };
      } catch (err) { toast(`The pasted picture could not be converted: ${message(err)}`, 'error'); }
    }
    return true;
  }
  function writeClipboard(): void {
    const cb = engine.clipboard;
    if (cb) clipSource = { stamp: cb.stamp, icc: engine.current?.doc.profile?.icc ?? null, name: engine.current?.doc.profile?.name ?? 'sRGB IEC61966-2.1' };
    if (!cb || !loadPrefs().exportClipboard || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return;
    try {
      const item = new ClipboardItem({ 'image/png': toBlob(cb.surface), 'text/plain': new Blob([`formvis:${cb.stamp}`], { type: 'text/plain' }) });
      void navigator.clipboard.write([item]).catch(() => undefined);
    } catch { return; }
  }

  /** `outside` set: Paste Into (false) or Paste Outside (true) against the selection (1.65.7). */
  async function pasteExternal(file: File, outside: boolean | null = null): Promise<void> {
    await engine.task(async () => {
      try {
        const img = await decodeImage(file, file.name || 'Pasted.png');
        if (outside !== null) engine.pasteInto(outside, { raster: Raster.from(img.source, img.width, img.height), name: stripExt(img.name) });
        else if (!engine.current) engine.insertImages([img]);
        else engine.insertRasterLayer(Raster.from(img.source, img.width, img.height), stripExt(img.name), null, null);
      } catch (err) { toast(message(err), 'error'); }
    });
  }

  async function newFromClipboard(): Promise<void> {
    try {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes('text/plain') && engine.clipboard && await (await item.getType('text/plain')).text() === `formvis:${engine.clipboard.stamp}`) { engine.newFromClipboard(); return; }
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          const img = await decodeImage(new File([await item.getType(type)], 'Clipboard.png', { type }), 'Clipboard.png');
          engine.newFromClipboard({ raster: Raster.from(img.source, img.width, img.height), name: 'Clipboard', ...(img.resolution ? { resolution: img.resolution } : {}) });
          return;
        }
      }
    } catch { /* fall back to formvis's own clipboard */ }
    if (!engine.newFromClipboard()) toast('The clipboard holds no picture.');
  }

  async function readClipboardItems(): Promise<ClipboardItems> {
    const blocked = (): Error => { toast('The browser blocked clipboard access. Allow it in the site settings, or use the keyboard shortcut.', 'error'); return new Error('clipboard blocked'); };
    const state = await navigator.permissions?.query({ name: 'clipboard-read' as PermissionName }).then((s) => s.state, () => 'prompt');
    if (state === 'denied') throw blocked();
    let timer = 0;
    const wait = new Promise<never>((_, no) => { timer = window.setTimeout(() => no(blocked()), 4000); });
    try { return await Promise.race([navigator.clipboard.read().catch((x: unknown) => { throw (x as Error)?.name === 'NotAllowedError' ? blocked() : x; }), wait]); } finally { window.clearTimeout(timer); }
  }

  async function pasteFromMenu(outside: boolean | null = null, inPlace = false): Promise<void> {
    const own = (): boolean => (outside === null ? engine.pasteClipboard(inPlace) : engine.pasteInto(outside) || true);
    try {
      for (const item of await readClipboardItems()) {
        if (item.types.includes('text/plain') && engine.clipboard) {
          const text = await (await item.getType('text/plain')).text();
          if (text === `formvis:${engine.clipboard.stamp}`) { if (await askPasteProfile()) own(); return; }
        }
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) { await pasteExternal(new File([await item.getType(type)], 'Pasted.png', { type }), outside); return; }
      }
    } catch {
      if (!(await askPasteProfile())) return;
      if (!own()) toast('Nothing to paste. Use the keyboard shortcut to paste from other apps.');
      return;
    }
    if (!(await askPasteProfile())) return;
    if (!own()) toast('Nothing to paste.');
  }

  const hasTargetPixels = (): boolean => {
    const p = engine.current, l = p?.activeLayer;
    if (p && engine.alphaTargeted()) return true;
    if (!p || !l || l.isGroup || l.adjustment) return false;
    return p.maskTarget && l.mask ? !!l.mask.raster : !!l.raster;
  };
  const ADJUST_KEYS: Partial<Record<string, string[]>> = { curves: ['Mod+M'], levels: ['Mod+L'], hsv: ['Mod+U'], colorBalance: ['Mod+B'], blackWhite: ['Alt+Shift+Mod+B'] };
  const FILTERS: FilterKind[] = ['develop', 'gaussianBlur', 'lensBlur', 'motionBlur', 'radialBlur', 'surfaceBlur', 'fieldBlur', 'irisBlur', 'tiltShift', 'pathBlur', 'addNoise', 'lensCorrection', 'smartSharpen', 'shakeReduction', 'unsharpMask'];

  commands.add(
    { id: 'cut', label: 'Cut', keys: ['Mod+X'], enabled: () => pixel() && selected(), run: () => { engine.cutSelection(); writeClipboard(); } },
    { id: 'copy', label: 'Copy', keys: ['Mod+C'], enabled: pixel, run: () => { if (engine.copySelection(false)) writeClipboard(); } },
    { id: 'copy-merged', label: 'Copy Merged', keys: ['Shift+Mod+C'], enabled: has, run: () => { if (engine.copySelection(true)) writeClipboard(); } },
    { id: 'paste', label: 'Paste', keys: ['Mod+V'], run: () => void pasteFromMenu() },
    { id: 'paste-in-place', label: 'Paste in Place', keys: ['Shift+Mod+V'], run: () => void pasteFromMenu(null, true) },
    { id: 'new-from-clipboard', label: 'New from Clipboard', run: () => void newFromClipboard() },
    { id: 'paste-into', label: 'Paste Into', keys: ['Alt+Shift+Mod+V'], enabled: selected, run: () => void pasteFromMenu(false) },
    { id: 'paste-outside', label: 'Paste Outside', enabled: selected, run: () => void pasteFromMenu(true) },
    { id: 'purge-clipboard', label: 'Clipboard', enabled: () => !!engine.clipboard, run: () => { if (engine.purgeClipboard()) toast('Cleared the clipboard.'); } },
    { id: 'save-history-log', label: 'Save History Log...', enabled: () => historyLog.count > 0, run: () => void deliverFile(new Blob([historyLog.text()], { type: 'text/plain' }), 'formvis-history-log.txt') },
    { id: 'clear-history-log', label: 'Clear History Log', enabled: () => historyLog.count > 0, run: () => { const n = historyLog.count; historyLog.clear(); toast(`Cleared ${n} history log entries.`); } },
    { id: 'purge-video-cache', label: 'Video Cache', enabled: () => engine.hasVideoLayers, run: () => { const n = engine.purgeVideoCache(); toast(n > 0 ? `Purged ${(n / 1048576).toFixed(1)} MB of video frame caches.` : 'The video frame caches were already empty.'); } },
    { id: 'purge-undo', label: 'Undo', enabled: () => !!engine.current?.history.canRedo, run: () => { const n = engine.purgeUndo(); if (n) toast(`Purged ${n} undone ${n === 1 ? 'step' : 'steps'}.`); } },
    { id: 'purge-histories', label: 'Histories', enabled: () => engine.projects.some((q) => q.history.steps.names.length > 0), run: () => { const docs = engine.projects.length; void confirmAction('Purge histories?', `This clears the undo and redo history of ${docs === 1 ? 'this document' : `every open document (${docs})`}, keeping ${docs === 1 ? 'its' : 'their'} current state and snapshots. It cannot be undone.`, 'Purge', true).then((ok) => { if (ok) toast(`Purged ${engine.purgeHistories(true)} history steps.`); }); } },
    {
      id: 'clean-working-files', label: 'Working Files', enabled: () => true,
      run: async () => {
        const stale = (await recovery.list()).filter((r) => !engine.projects.some((q) => q.id === r.id));
        const bytes = stale.reduce((n, r) => n + r.files.reduce((m, f) => m + f.blob.size, 0), 0) + closedTabs.reduce((n, r) => n + r.files.reduce((m, f) => m + f.blob.size, 0), 0);
        const tabs = closedTabs.length;
        for (const r of stale) await recovery.drop(r.id);
        closedTabs.length = 0;
        toast(`Cleaned ${stale.length} recovery ${stale.length === 1 ? 'copy' : 'copies'} and ${tabs} closed ${tabs === 1 ? 'tab' : 'tabs'}, ${(bytes / 1048576).toFixed(1)} MB.`);
      },
    },
    { id: 'purge-all', label: 'All', enabled: () => !!engine.clipboard || engine.projects.some((q) => q.history.steps.names.length > 0), run: () => { void confirmAction('Purge everything?', 'This clears the clipboard and the undo and redo history of every open document, keeping their current states and snapshots. It cannot be undone.', 'Purge', true).then((ok) => { if (ok) { engine.purgeClipboard(); toast(`Purged the clipboard and ${engine.purgeHistories(true)} history steps.`); } }); } },
    { id: 'stroke-dialog', label: 'Stroke...', enabled: () => pixel() && (selected() || !!engine.activeLayer?.raster), run: () => dialogs.stroke.show() },
    { id: 'transform', label: () => (engine.pathTarget ? 'Free Transform Path' : engine.canTransformSelection || engine.floatingSelection ? 'Transform Selection' : 'Transform Layer'), keys: ['Mod+T'], enabled: () => (!!engine.activeLayer || engine.pathTarget) && !engine.floatingSelection, run: () => engine.transformCommand() },
    { id: 'transform-copy', label: 'Free Transform a Copy', keys: ['Alt+Mod+T'], enabled: () => !!engine.activeLayer && !engine.floatingSelection, run: () => { engine.transformCopy(); } },
    { id: 'content-fill', label: 'Quick Selection-Aware Fill', keys: ['Shift+Backspace'], enabled: () => pixel() && selected(), params: { prefer: { type: 'array', description: 'Where the fill should prefer to draw from: a list of rectangles {x, y, width, height} in document pixels. A preference only: the whole picture is still searched, and the strength sets how much a patch inside these rectangles is favoured. Left out, the plain quick fill runs.' }, strength: { type: 'number', min: 0, max: 0.6, description: 'Preference Strength for prefer, 0 to 0.6 (0.4 when left out); 0.6 is the strongest.' } }, run: (a) => {
      const p = engine.current, rects = Array.isArray(a?.prefer) ? a.prefer : [];
      if (p && rects.length) {
        const W = p.doc.width, H = p.doc.height, m = new Uint8Array(W * H);
        for (const r of rects as Array<{ x?: number; y?: number; width?: number; height?: number }>) {
          const rx = Number(r?.x), ry = Number(r?.y), rw = Number(r?.width), rh = Number(r?.height);
          if (![rx, ry, rw, rh].every(Number.isFinite)) continue;
          const x0 = Math.max(0, Math.floor(rx)), y0 = Math.max(0, Math.floor(ry)), x1 = Math.min(W, Math.ceil(rx + rw)), y1 = Math.min(H, Math.ceil(ry + rh));
          for (let y = y0; y < y1; y++) m.fill(1, y * W + x0, y * W + Math.max(x0, x1));
        }
        const strength = typeof a?.strength === 'number' ? a.strength : undefined;
        void engine.task(async () => { await new Promise((r) => requestAnimationFrame(() => window.setTimeout(r, 0))); engine.contentAwareFillWith(null, 'current', undefined, false, null, 3, m, strength); });
        return;
      }
      void engine.task(async () => { await new Promise((r) => requestAnimationFrame(() => window.setTimeout(r, 0))); engine.contentAwareFill(); });
    } },
    { id: 'generative-fill', label: 'Generative Fill...', enabled: () => selected(), run: (a) => void dialogs.generative.show('fill', 2, typeof a?.prompt === 'string' ? { prompt: a.prompt } : undefined) },   // the Contextual Task Bar passes the prompt it holds (undeclared: agents and the menus open the dialog)
    { id: 'generate-image', label: 'Generate Image...', enabled: () => true, run: () => void generateImage.show() },   // 1.51.2, in the Edit menu
    { id: 'new-canvas-model-preset', label: 'New Canvas from Model Preset...', enabled: () => true, run: () => void modelCanvas.show() },
    { id: 'generate-panel', label: 'Generate Panel', run: () => { if (dock.collapsed) dock.setCollapsed(false); if (!dock.isShown('generate')) dock.toggle('generate'); generatePanel.reveal(); } },
    { id: 'boxes-tool', label: 'Boxes Tool', icon: 'tBoxes', enabled: has, run: () => engine.setTool('boxes') },
    { id: 'boxes-from-selection', label: 'Selection to Box', enabled: () => has() && selected(), run: () => { engine.boxFromSelection(); engine.setTool('boxes'); } },
    { id: 'boxes-copy', label: 'Copy Box Rows', enabled: () => !!engine.current?.doc.boxes?.length, run: () => { const d = engine.current?.doc; void navigator.clipboard?.writeText(boxesText(d?.boxes, d ? { width: d.width, height: d.height } : undefined)).then(() => toast('Copied the box rows.'), () => toast('The clipboard is not available.', 'error')); } },
    { id: 'boxes-clear', label: 'Clear Boxes', enabled: () => !!engine.current?.doc.boxes?.length, run: () => engine.clearBoxes() },
    { id: 'generate-remove', label: 'Remove / Repair', icon: 'tRemove', enabled: pixel, run: () => { if (selected()) commands.run('content-fill'); else { engine.setTool('remove'); toast('The Remove tool is on: paint over what to take out.'); } } },
    { id: 'path-selection', label: 'Make Selection from Path', keys: ['Mod+Enter'], enabled: () => !!engine.workPath, params: { feather: { type: 'number', min: 0, max: 250, description: 'Feather radius in pixels; 0 when left out.' }, antialias: { type: 'boolean', description: 'Anti-aliased edge; true when left out.' }, operation: { type: 'string', enum: ['replace', 'add', 'subtract', 'intersect'], description: 'How the new selection meets the current one; replace when left out.' } }, run: (a) => { if (a && (a.feather !== undefined || a.antialias !== undefined || a.operation !== undefined)) engine.pathToSelectionWith(typeof a.feather === 'number' ? a.feather : 0, a.antialias !== false, (['add', 'subtract', 'intersect'].includes(String(a.operation)) ? a.operation : 'replace') as 'replace' | 'add' | 'subtract' | 'intersect'); else engine.pathToSelection(); } },
    { id: 'path-selection-dialog', label: 'Make Selection from Path...', enabled: () => !!engine.workPath, run: () => dialogs.makeSelection.show() },
    { id: 'selection-to-work-path', label: 'Make Work Path from Selection', enabled: selected, params: { tolerance: { type: 'number', min: 0.1, max: 20, description: 'How far in pixels the path may stray from the selection\'s edge; the saved Convert to Shape tolerance (1.5 at first) when left out.' } }, run: (a) => { engine.selectionToWorkPath(typeof a?.tolerance === 'number' ? a.tolerance : undefined); } },
    { id: 'fill-path', label: 'Fill Path', enabled: () => !!engine.workPath && pixel(), run: () => engine.fillPath() },
    { id: 'fill-path-dialog', label: 'Fill Path...', enabled: () => !!engine.workPath && pixel(), run: () => dialogs.fill.show('path') },
    { id: 'stroke-path', label: 'Stroke Path', enabled: () => !!engine.workPath && pixel(), run: () => engine.strokePath() },
    { id: 'stroke-path-dialog', label: 'Stroke Path...', enabled: () => !!engine.workPath && pixel(), run: () => dialogs.strokePath.show() },
    { id: 'delete-path', label: 'Delete Path', enabled: () => !!engine.workPath, run: () => engine.deletePath() },
    { id: 'clipping-path', label: 'Clipping Path...', enabled: () => !!engine.current, run: () => dialogs.clippingPath.show() },
    { id: 'path-fill-rule', label: 'Path Fill Rule: Even-Odd', checked: () => !!engine.workPath?.evenOdd, enabled: () => !!engine.workPath, run: () => { const vp = engine.workPath; if (!vp) return; engine.beginPathEdit(); if (vp.evenOdd) delete vp.evenOdd; else vp.evenOdd = true; engine.setWorkPath(vp); engine.endPathEdit(); } },
    { id: 'new-path', label: 'New Path', enabled: () => !!engine.current, run: () => engine.newPath() },
    { id: 'layer-style', label: 'Layer Style...', enabled: () => pixel(), run: () => dialogs.layerStyle.show() },
    {
      id: 'layer-comp-new', label: 'New Layer Comp', enabled: has,
      params: {
        name: { type: 'string', description: 'Comp name; "Layer Comp N" when left out.' },
        comment: { type: 'string', description: 'Comment kept with the comp.' },
        visibility: { type: 'boolean', description: 'Record layer visibility; true when left out.' },
        position: { type: 'boolean', description: 'Record layer x and y; true when left out.' },
        appearance: { type: 'boolean', description: 'Record opacity, blend mode, fill and effects; true when left out.' },
      },
      run: (a) => { engine.newLayerComp({ name: typeof a?.name === 'string' ? a.name : undefined, comment: typeof a?.comment === 'string' ? a.comment : undefined, useVisibility: a?.visibility !== false, usePosition: a?.position !== false, useAppearance: a?.appearance !== false }); },
    },
    { id: 'layer-comp-apply', label: 'Apply Layer Comp', enabled: () => !!engine.current?.doc.comps?.length, params: { id: { type: 'string', description: 'Comp id.' }, name: { type: 'string', description: 'Comp name, when no id is given.' } }, run: (a) => { const c = engine.current?.doc.comps?.find((x) => (a?.id ? x.id === a.id : x.name === a?.name)); if (c) engine.applyLayerComp(c.id); } },
    {
      id: 'layer-comp-update', label: 'Update Layer Comp', enabled: () => !!engine.current?.doc.activeComp,
      params: { parts: { type: 'string', description: 'Comma list of visibility, position and appearance to re-record; all of the comp\'s own switches when left out.' } },
      run: (a) => {
        const id = engine.current?.doc.activeComp, parts = String(a?.parts ?? '').split(',').map((x) => x.trim()).filter((x): x is 'visibility' | 'position' | 'appearance' => x === 'visibility' || x === 'position' || x === 'appearance');
        if (id) engine.updateLayerComp(id, parts);
      },
    },
    {
      id: 'layer-comp-options', label: 'Layer Comp Options...', enabled: () => !!engine.current?.doc.activeComp,
      params: {
        name: { type: 'string', description: 'New name for the active comp.' },
        comment: { type: 'string', description: 'New comment for the active comp.' },
        visibility: { type: 'boolean', description: 'Whether the comp keeps layer visibility.' },
        position: { type: 'boolean', description: 'Whether the comp keeps layer x and y.' },
        appearance: { type: 'boolean', description: 'Whether the comp keeps opacity, blend mode, fill and effects.' },
      },
      run: (a) => {
        const id = engine.current?.doc.activeComp;
        if (!id) return;
        if (!a || !Object.keys(a).length) { void import('./ui/panels/layer-comp-dialog').then((m) => { layerCompDialog ??= new m.LayerCompDialog(engine); layerCompDialog.show(id); }); return; }
        engine.editLayerComp(id, { name: typeof a.name === 'string' ? a.name : undefined, comment: typeof a.comment === 'string' ? a.comment : undefined, useVisibility: typeof a.visibility === 'boolean' ? a.visibility : undefined, usePosition: typeof a.position === 'boolean' ? a.position : undefined, useAppearance: typeof a.appearance === 'boolean' ? a.appearance : undefined });
      },
    },
    { id: 'layer-comp-last-state', label: 'Last Document State', enabled: () => !!engine.current?.doc.activeComp, run: () => engine.clearLayerComp() },
    { id: 'layer-comp-duplicate', label: 'Duplicate Layer Comp', enabled: () => !!engine.current?.doc.activeComp, run: () => { const id = engine.current?.doc.activeComp; if (id) engine.duplicateLayerComp(id); } },
    { id: 'layer-comp-delete', label: 'Delete Layer Comp', enabled: () => !!engine.current?.doc.activeComp, run: () => { const id = engine.current?.doc.activeComp; if (id) engine.deleteLayerComp(id); } },
    { id: 'layer-comp-next', label: 'Next Layer Comp', enabled: () => !!engine.current?.doc.comps?.length, run: () => engine.nextLayerComp(1) },
    { id: 'layer-comp-previous', label: 'Previous Layer Comp', enabled: () => !!engine.current?.doc.comps?.length, run: () => engine.nextLayerComp(-1) },
    { id: 'edit-text', label: 'Edit Type...', enabled: () => engine.liveText(engine.current?.activeLayer), run: () => { const id = engine.current?.activeId; if (id) dialogs.text.showEdit(id); } },
    { id: 'convert-smart', label: 'Convert to Smart Object', enabled: () => { const l = engine.current?.activeLayer; return !!l && ((engine.current?.selectedIds.size ?? 0) > 1 || (l.isGroup ? !!engine.current?.doc.layers.some((x) => x.parentId === l.id) : !l.adjustment && !l.smart && !!l.raster)); }, run: () => { engine.convertToSmartObject(); } },
    { id: 'rasterize', label: 'Rasterize Layer', enabled: () => { const l = engine.current?.activeLayer; return !!l && (!!l.smart || !!l.vector || !!l.shape || !!l.fillContent || liveText(l)); }, run: () => engine.rasterizeLayer() },
    { id: 'smart-filters', label: 'Smart Filters...', enabled: () => !!engine.current?.activeLayer?.smart, run: () => dialogs.smartFilters.show() },
    { id: 'smart-warp-reset', label: 'Reset Warp', enabled: () => !!engine.current?.activeLayer?.smart?.deform, run: () => { engine.resetSmartDeform(); } },
    { id: 'filter-convert-smart', label: 'Convert for Smart Filters', enabled: () => commands.enabled(commands.get('convert-smart') as Command), run: () => commands.run('convert-smart') },
    { id: 'smart-new-via-copy', label: 'New Smart Object via Copy', enabled: () => !!engine.current?.activeLayer?.smart, run: () => engine.newSmartObjectViaCopy() },
    { id: 'smart-convert-to-layers', label: 'Convert to Layers', enabled: () => !!engine.current?.activeLayer?.smart, run: () => engine.smartToLayers() },
    { id: 'smart-export-contents', label: 'Export Contents...', enabled: () => !!engine.current?.activeLayer?.smart, run: async () => {
      const c = engine.smartContents();
      if (!c) return;
      const kept = c.original, tail = (n: string): string => /\.[^.\\/]+$/.exec(n)?.[0].toLowerCase() ?? '';
      const typed = await promptName('Export Contents (end the name in .png, .jpg or .webp)', kept ? kept.name.replace(/[\\/:*?"<>|]+/g, '_') : `${c.name.replace(/[\\/:*?"<>|]+/g, '_') || 'Smart Object'}.png`, 'Export');
      if (!typed) return;
      if (kept && tail(typed) === tail(kept.name)) {
        try { await deliver(new Blob([kept.data.slice()], { type: kept.mime || 'application/octet-stream' }), typed.replace(/[\\/:*?"<>|]+/g, '_')); } catch (err) { toast(message(err), 'error'); }
        return;
      }
      const ext = /\.(jpe?g|webp|png)$/i.exec(typed)?.[1].toLowerCase() ?? 'png', type = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';
      try { await deliver(await toBlob(c.raster.canvas, type, 0.92), `${typed.replace(/\.(jpe?g|webp|png)$/i, '').replace(/[\\/:*?"<>|]+/g, '_') || 'Smart Object'}.${ext === 'jpeg' ? 'jpg' : ext}`); } catch (err) { toast(message(err), 'error'); }
    } },
    { id: 'smart-convert-to-linked', label: 'Convert to Linked...', enabled: () => { const s = engine.current?.activeLayer?.smart; return !!s && !s.link; }, run: () => { void (async () => { try { await convertToLinked(engine); } catch (err) { linkError(err); } })(); } },
    { id: 'smart-filters-disable', label: () => (engine.smartFiltersOff ? 'Enable Smart Filters' : 'Disable Smart Filters'), enabled: () => !!engine.current?.activeLayer?.smart?.filters.length, run: () => engine.toggleSmartFilters() },
    { id: 'smart-filters-clear', label: 'Clear Smart Filters', enabled: () => !!engine.current?.activeLayer?.smart?.filters.length, run: () => engine.clearSmartFilters() },
    { id: 'edit-contents', label: 'Edit Contents', enabled: () => !!engine.current?.activeLayer?.smart, run: () => engine.editContents() },
    { id: 'replace-contents', label: 'Replace Contents...', enabled: () => !!engine.current?.activeLayer?.smart, run: () => replaceInput.click() },
    { id: 'place-embedded', label: 'Place Embedded...', enabled: has, run: () => { void (async () => { const f = await pickOnce(); if (!f) return; const was = layersOf(); await engine.task(() => placeEmbedded(engine, f)); enterPlacedTransform(was); })(); } },
    { id: 'place-linked', label: 'Place Linked...', enabled: has, run: () => { void (async () => { try { const got = await pickLinkSource(pickOnce); if (got) await engine.task(() => placeLinked(engine, got.id, got.source)); } catch (err) { linkError(err); } })(); } },
    { id: 'update-linked', label: 'Update Modified Content', enabled: () => !!engine.current?.doc.layers.some((l) => l.smart?.link), run: () => { void engine.task(async () => { try { const r = await updateLinked(engine); toast(r.missing.length ? `Could not reach ${r.missing.join(', ')}. Use Relink to File.` : r.updated ? `Updated ${r.updated} linked smart object${r.updated === 1 ? '' : 's'}.` : 'Linked contents are up to date.', r.missing.length ? 'error' : undefined); } catch (err) { linkError(err); } }); } },
    { id: 'relink', label: 'Relink to File...', enabled: () => !!engine.current?.activeLayer?.smart?.link, run: () => { void (async () => { try { await relink(engine, pickOnce); } catch (err) { linkError(err); } })(); } },
    { id: 'embed-linked', label: 'Embed Linked', enabled: () => !!engine.current?.activeLayer?.smart?.link, run: () => engine.embedLinked() },
    { id: 'smart-reveal-linked', label: 'Reveal in File Manager', enabled: () => !!engine.current?.activeLayer?.smart, run: () => {
      const path = engine.current?.activeLayer?.smart?.link?.path;
      if (!path) { if (engine.editContents()) toast('This source is embedded, so it opened as a document of its own.'); return; }
      void (async () => {
        try {
          const res = await fetch('/api/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
          if (!res.ok) toast(`Linked file: ${path}`);
        } catch { toast(`Linked file: ${path}`); }
      })();
    } },
    { id: 'add-filter-mask', label: 'Add Smart Filter Mask', enabled: () => { const s = engine.current?.activeLayer?.smart; return !!s && !s.filterMask; }, run: () => engine.addSmartFilterMask() },
    { id: 'toggle-filter-mask', label: () => (engine.current?.activeLayer?.smart?.filterMaskEnabled === false ? 'Enable Smart Filter Mask' : 'Disable Smart Filter Mask'), enabled: () => !!engine.current?.activeLayer?.smart?.filterMask, run: () => engine.toggleSmartFilterMask() },
    ...STACK_MODES.map((m) => ({ id: `stack-mode-${m.id}`, label: m.label, checked: () => engine.stackMode === m.id, enabled: () => engine.stackMode !== null, run: () => { engine.setStackMode(m.id); } })),
    { id: 'delete-filter-mask', label: 'Delete Smart Filter Mask', enabled: () => !!engine.current?.activeLayer?.smart?.filterMask, run: () => engine.deleteSmartFilterMask() },
    {
      id: 'new-shape-layer', label: 'Shape Layer', enabled: has,
      params: {
        kind: { type: 'string', enum: ['rectangle', 'ellipse', 'triangle', 'polygon', 'star', 'line', 'arrow', 'heart'], description: 'The shape; rectangle when left out.' },
        x: { type: 'number', description: 'Left edge in document pixels; a quarter of the width when left out.' },
        y: { type: 'number', description: 'Top edge in document pixels; a quarter of the height when left out.' },
        width: { type: 'number', min: 1, description: 'Width in pixels (a line or arrow\'s run); half the width when left out.' },
        height: { type: 'number', min: 0, description: 'Height in pixels; half the height when left out.' },
        fill: { type: 'string', description: 'Fill color as #rrggbb, or "none"; the foreground color when left out.' },
        stroke: { type: 'string', description: 'Stroke color as #rrggbb; no stroke when left out.' },
        stroke_width: { type: 'number', min: 0.5, max: 200, description: 'Stroke width in pixels; 3 when left out.' },
        stroke_dash: { type: 'string', enum: ['solid', 'dashed', 'dotted'], description: 'Stroke type; solid when left out.' },
        stroke_align: { type: 'string', enum: ['inside', 'center', 'outside'], description: 'Stroke alignment; center when left out.' },
        cap: { type: 'string', enum: ['butt', 'round', 'square'], description: 'Stroke line caps; round when left out.' },
        join: { type: 'string', enum: ['miter', 'round', 'bevel'], description: 'Stroke corners; round when left out.' },
        corner_radius: { type: 'number', min: 0, max: 500, description: 'Corner radius in pixels for a rectangle, triangle, polygon or star; 0 when left out.' },
        sides: { type: 'integer', min: 3, max: 100, description: 'Sides of a polygon or points of a star; the Shape tool value when left out.' },
        star_inset: { type: 'number', min: 1, max: 99, description: 'Star indent in percent; the Shape tool value when left out.' },
        gradient: { type: 'string', enum: ['linear', 'radial', 'angle'], description: 'Fill the shape with a gradient from the fill color to gradient_end; a solid fill when left out.' },
        gradient_angle: { type: 'number', min: -180, max: 180, description: 'Gradient angle in degrees; 0 when left out.' },
        gradient_end: { type: 'string', description: 'Gradient end color as #rrggbb; the background color when left out.' },
      },
      run: (a) => {
        const p = engine.current;
        if (!p) return;
        const n = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
        const colour = (v: unknown): { r: number; g: number; b: number } | undefined => { if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) return undefined; const k = parseInt(v.slice(1), 16); return { r: (k >> 16) & 255, g: (k >> 8) & 255, b: k & 255 }; };
        const pick = <T extends string>(v: unknown, set: readonly T[]): T | undefined => set.find((s) => s === v);
        const kind = pick(a?.kind, ['rectangle', 'ellipse', 'triangle', 'polygon', 'star', 'line', 'arrow', 'heart'] as const) ?? 'rectangle', line = kind === 'line' || kind === 'arrow';
        const w = Math.max(1, n(a?.width, Math.round(p.doc.width / 2))), h = line ? 0 : Math.max(1, n(a?.height, Math.round(p.doc.height / 2)));
        const fill = a?.fill === 'none' ? null : colour(a?.fill), stroke = colour(a?.stroke);
        engine.newShapeLayer({
          kind, x: n(a?.x, Math.round(p.doc.width / 4)), y: n(a?.y, Math.round(p.doc.height / 4)), w, h, fill: fill === undefined ? undefined : fill, stroke, strokeWidth: n(a?.stroke_width, 3),
          strokeDash: pick(a?.stroke_dash, ['solid', 'dashed', 'dotted'] as const), strokeAlign: pick(a?.stroke_align, ['inside', 'center', 'outside'] as const), cap: pick(a?.cap, ['butt', 'round', 'square'] as const), join: pick(a?.join, ['miter', 'round', 'bevel'] as const),
          cornerRadius: n(a?.corner_radius, 0), sides: typeof a?.sides === 'number' ? Math.round(a.sides) : undefined, starInset: typeof a?.star_inset === 'number' ? a.star_inset : undefined,
          gradient: pick(a?.gradient, ['linear', 'radial', 'angle'] as const), gradientAngle: n(a?.gradient_angle, 0), gradientEnd: colour(a?.gradient_end),
        });
      },
    },
    { id: 'new-shape-path', label: 'New Shape Layer from Path', enabled: () => !!engine.workPath?.subpaths.some((s) => s.anchors.length > 1), run: () => engine.newShapeFromPath() },
    { id: 'apply-redactions', label: 'Apply Redactions', enabled: () => !!engine.current?.doc.layers.some((l) => l.vector && /^Redaction \d+$/.test(l.name)), run: () => { const n = engine.applyRedactions(); if (n) toast(`Redacted: the boxes burned into ${n} layer${n === 1 ? '' : 's'}.`); } },   // 1.60.3
    { id: 'shape-color', label: 'Shape Color from Foreground', enabled: () => !!engine.current?.activeLayer?.vector, run: () => engine.recolorShape() },
    { id: 'shape-style', label: 'Shape Fill and Stroke...', enabled: () => !!engine.current?.activeLayer?.vector, run: () => dialogs.shapeStyle.show() },
    { id: 'shape-style-copy', label: 'Copy Shape Fill and Stroke', enabled: () => !!engine.current?.activeLayer?.vector, run: () => { engine.copyShapeStyle(); } },
    { id: 'shape-style-paste', label: 'Paste Shape Fill and Stroke', enabled: () => !!engine.current?.activeLayer?.vector && !!engine.shapeStyleClip, run: () => { engine.pasteShapeStyle(); } },
    { id: 'shape-corners', label: 'Corner Radii...', enabled: () => { const s = engine.current?.activeLayer?.shape; return !!s && s.kind !== 'Ellipse'; }, run: () => dialogs.corners.show() },
    { id: 'copy-layer-style', label: 'Copy Layer Style', enabled: () => effectsPresent(engine.current?.activeLayer?.effects), run: () => engine.copyLayerStyle() },
    { id: 'paste-layer-style', label: 'Paste Layer Style', enabled: () => pixel() && engine.canPasteLayerStyle, run: () => engine.pasteLayerStyle() },
    { id: 'clear-layer-style', label: 'Clear Layer Style', enabled: () => effectsPresent(engine.current?.activeLayer?.effects), run: () => engine.clearLayerStyle() },
    ...([['copy-style-below', 'Copy Layer Style to Layer Below', false], ['move-style-below', 'Move Layer Style to Layer Below', true]] as const).map(([id, label, move]) => ({
      id, label,
      enabled: () => { const p = engine.current, l = p?.activeLayer, below = p && l ? p.doc.layers[p.doc.layers.indexOf(l) - 1] : undefined; return effectsPresent(l?.effects) && !!below && !below.isGroup && !below.adjustment; },
      run: () => { const p = engine.current, l = p?.activeLayer, below = p && l ? p.doc.layers[p.doc.layers.indexOf(l) - 1] : undefined; if (l && below && effectsPresent(l.effects)) engine.transferEffects(l.id, below.id, ['dropShadow', 'outerGlow', 'stroke', 'innerShadow', 'innerGlow', 'colorOverlay', 'gradientOverlay', 'bevel', 'satin', 'patternOverlay'], move); },
    })),
    ...([['style-blending', 'Blending Options...', 'blending'], ['style-bevel', 'Bevel & Emboss...', 'bevel'], ['style-stroke', 'Stroke...', 'stroke'], ['style-inner-shadow', 'Inner Shadow...', 'innerShadow'], ['style-inner-glow', 'Inner Glow...', 'innerGlow'], ['style-satin', 'Satin...', 'satin'],
      ['style-color-overlay', 'Color Overlay...', 'colorOverlay'], ['style-gradient-overlay', 'Gradient Overlay...', 'gradientOverlay'], ['style-pattern-overlay', 'Pattern Overlay...', 'patternOverlay'], ['style-outer-glow', 'Outer Glow...', 'outerGlow'], ['style-drop-shadow', 'Drop Shadow...', 'dropShadow']] as const)
      .map(([id, label, section]) => ({ id, label, enabled: () => pixel(), run: () => dialogs.layerStyle.show(section) })),
    { id: 'global-light', label: 'Global Light...', enabled: has, run: () => dialogs.globalLight.show() },
    { id: 'create-layers', label: 'Create Layers', enabled: () => effectsActive(engine.current?.activeLayer?.effects) && !engine.current?.activeLayer?.clipId, run: () => { engine.effectsToLayers(); } },
    { id: 'hide-all-effects', label: () => (engine.effectsShown ? 'Hide All Effects' : 'Show All Effects'), enabled: () => !!engine.current?.doc.layers.some((l) => effectsPresent(l.effects)), run: () => engine.setAllEffectsHidden(engine.effectsShown) },
    { id: 'toggle-layer-effects', label: () => (engine.current?.activeLayer?.effects?.hidden ? 'Show Layer Effects' : 'Hide Layer Effects'), enabled: () => effectsPresent(engine.current?.activeLayer?.effects), run: () => engine.setLayerEffectsHidden(!engine.current?.activeLayer?.effects?.hidden) },
    { id: 'rasterize-style', label: 'Layer Style', enabled: () => [...(engine.current?.selectedIds ?? [])].some((id) => effectsActive(engine.current?.layer(id)?.effects)), run: () => engine.rasterizeLayerStyle() },
    { id: 'scale-effects', label: 'Scale Effects...', enabled: () => effectsPresent(engine.current?.activeLayer?.effects), run: () => dialogs.scaleEffects.show() },
    { id: 'generative-expand', label: 'Generative Expand...', enabled: has, run: () => void dialogs.generative.show('expand') },
    { id: 'upscale-2x', label: 'Upscale 2x...', enabled: has, run: () => void dialogs.generative.show('upscale', 2) },
    { id: 'upscale-4x', label: 'Upscale 4x...', enabled: has, run: () => void dialogs.generative.show('upscale', 4) },
    { id: 'compute-depth-map', label: 'Compute Depth Map', enabled: has, run: () => void (async () => {
      if (!(await depthReady())) { toast('Compute Depth Map needs Depth Anything V2 Small (99 MB): download it in Preferences > Plugins > Local models.', 'error'); return; }
      if (await engine.task(() => engine.computeDepthMap(localDepth))) toast('Added a Depth Map layer: near is bright, far is dark.');
    })() },
    { id: 'compute-depth-map-16', label: 'Compute Depth Map as 16-Bit Document', enabled: has, run: () => void (async () => {
      if (!(await depthReady())) { toast('Compute Depth Map needs Depth Anything V2 Small (99 MB): download it in Preferences > Plugins > Local models.', 'error'); return; }
      const p = engine.current, flat = engine.flattened();
      if (!p || !flat) return;
      const W = p.doc.width, H = p.doc.height;
      let deep: ReturnType<typeof deepFromU16> | null = null;
      await engine.task(async () => {
        try {
          const d = await api.decodeDeep(await localDepth16(await toBlob(flat), W, H), 'Depth Map.png');
          if (d.depth === 16) deep = deepFromU16(d.data as Uint16Array, d.width, d.height);
          else toast('The depth route gave 8 bits, so no 16-bit document was made.', 'error');
        } catch (err) { toast(message(err), 'error'); }
      });
      if (deep) { engine.openDeep(`${p.name} Depth`, deep, 16, p.doc.resolution); toast('Opened the depth as a 16-bit gray document: near is bright, far is dark.'); }
    })() },
    { id: 'select-by-depth', label: 'Select by Depth...', enabled: has,
      params: {
        near: { type: 'number', min: 0, max: 100, description: 'The nearest depth to select, percent of the range (100 is nearest); 100 when left out.' },
        far: { type: 'number', min: 0, max: 100, description: 'The farthest depth to select, percent of the range (0 is farthest); 60 when left out.' },
        feather: { type: 'number', min: 0, max: 50, description: 'Percent of the range over which the selection fades out past each end; 10 when left out.' },
        combine: { type: 'string', enum: ['new', 'add', 'subtract', 'intersect'], description: 'How the result meets the selection; new when left out.' },
        quality: { type: 'string', enum: ['standard', 'detail'], description: 'standard reads the depth at the model\'s own size; detail reads it larger and again, for finer edges, slower. standard when left out.' },
        dialog: { type: 'boolean', description: 'Open the Color Range dialog on depth instead of selecting at once.' },
      },
      run: (a) => void (async () => {
        if (!(await depthReady())) { toast('Select by Depth needs Depth Anything V2 Small (99 MB): download it in Preferences > Plugins > Local models.', 'error'); return; }
        const fine = a?.quality === 'detail';
        const d = await engine.task(() => engine.ensureDocDepth((i, w, h) => localDepthValues(i, w, h, fine), fine));
        if (!d) return;
        const hasParams = typeof a?.near === 'number' || typeof a?.far === 'number' || typeof a?.feather === 'number';
        if (!hasParams && a?.dialog !== false && !a?.combine) { dialogs.colorRange.show('depth'); return; }
        const mode = a?.combine === 'add' ? 'add' : a?.combine === 'subtract' ? 'subtract' : a?.combine === 'intersect' ? 'intersect' : 'replace';
        engine.selectByDepth({ near: typeof a?.near === 'number' ? a.near : 100, far: typeof a?.far === 'number' ? a.far : 60, feather: typeof a?.feather === 'number' ? a.feather : 10, mode });
      })() },
    { id: 'depth-map-from-layer', label: 'Depth Map from Layer', enabled: () => !!layer() && !layer()?.isGroup, run: () => void (async () => {
      if (!(await depthReady())) { toast('Depth Map from Layer needs Depth Anything V2 Small (99 MB): download it in Preferences > Plugins > Local models.', 'error'); return; }
      const id = engine.current?.activeLayer?.id;
      if (id && await engine.task(() => engine.computeDepthMap(localDepth, { layer: id }))) toast('Added a Depth Map layer read from that layer alone.');
    })() },
    { id: 'depth-map-recompute', label: 'Recompute Depth Map', enabled: () => !!engine.depthLayer(), run: () => void (async () => {
      if (!(await depthReady())) { toast('Recompute Depth Map needs Depth Anything V2 Small (99 MB): download it in Preferences > Plugins > Local models.', 'error'); return; }
      if (await engine.task(() => engine.computeDepthMap(localDepth, { recompute: true }))) toast('Recomputed the Depth Map from what the document shows.');
    })() },
    { id: 'depth-map-show', label: 'Show Depth Map', enabled: () => !!engine.depthLayer() || !!engine.depthView, checked: () => !!engine.depthView && engine.depthView.project === engine.current, run: () => engine.showDepthMap() },
    ...(['flatten', 'nearer', 'farther'] as const).map((kind) => ({
      id: `depth-map-${kind}`, label: { flatten: 'Flatten Depth Map', nearer: 'Depth Map Nearer', farther: 'Depth Map Farther' }[kind], enabled: () => !!engine.depthLayer(),
      params: { amount: { type: 'number' as const, min: 1, max: 100, description: `Percent of the depth range to ${kind === 'flatten' ? 'pull toward mid gray' : kind === 'nearer' ? 'brighten by' : 'darken by'}; ${kind === 'flatten' ? 50 : 10} when left out. Works inside the selection when there is one.` } },
      run: (a?: Record<string, unknown>) => ({ applied: engine.correctDepthMap(kind, (typeof a?.amount === 'number' ? Math.min(100, Math.max(1, a.amount)) : kind === 'flatten' ? 50 : 10) / 100) }),
    })),
    { id: 'depth-map-smooth', label: 'Smooth Depth Map', enabled: () => !!engine.depthLayer(), params: { radius: { type: 'number', min: 1, max: 32, description: 'Blur radius in pixels; 4 when left out.' }, edges: { type: 'boolean', description: 'Keep depth sharp at the picture\'s own edges (edge snap, radius up to 9); false when left out.' } },
      run: (a) => ({ applied: engine.correctDepthMap('smooth', typeof a?.radius === 'number' ? a.radius : 4, a?.edges === true) }) },
    { id: 'depth-map-detail', label: 'Depth Map Detail', enabled: () => !!engine.depthLayer(), params: { amount: { type: 'number', min: 1, max: 100, description: 'How much of the picture\'s fine detail is added to the depth, in percent; 50 when left out.' } },
      run: (a) => ({ applied: engine.correctDepthMap('detail', (typeof a?.amount === 'number' ? Math.min(100, Math.max(1, a.amount)) : 50) / 100) }) },
    { id: 'depth-map-snap', label: 'Snap Depth Map to Edges', enabled: () => !!engine.depthLayer(), params: { radius: { type: 'number', min: 1, max: 9, description: 'Window radius in pixels; 4 when left out.' } },
      run: (a) => ({ applied: engine.correctDepthMap('smooth', typeof a?.radius === 'number' ? Math.min(9, a.radius) : 4, true) }) },
    { id: 'free-helper-models', label: 'Free Helper Models', run: () => void api.freeHelpers().then((freed) => toast(freed.length ? `Freed ${freed.length} helper model${freed.length === 1 ? '' : 's'}: ${freed.join(', ')}.` : 'No helper model was held in memory.'), () => toast('The formvis engine is offline (./formvis boot).', 'error')) },
    { id: 'mask-black', label: "Mask's Black Areas", enabled: () => !!layer()?.mask, run: () => engine.selectMaskBlack() },
    { id: 'expand', label: () => `Expand by ${engine.selectionAmounts.expand} px...`, enabled: selected, params: { amount: { type: 'number', description: 'Pixels to expand by, 1 to 1024; leave out to open the dialog.' } },
      run: (a) => { if (typeof a?.amount === 'number') engine.resizeSelection(Math.min(1024, Math.max(1, Math.round(a.amount))), engine.selectionAtBounds); else dialogs.amount.show(true); } },
    { id: 'contract', label: () => `Contract by ${engine.selectionAmounts.contract} px...`, enabled: selected, params: { amount: { type: 'number', description: 'Pixels to contract by, 1 to 1024; leave out to open the dialog.' } },
      run: (a) => { if (typeof a?.amount === 'number') engine.resizeSelection(-Math.min(1024, Math.max(1, Math.round(a.amount))), engine.selectionAtBounds); else dialogs.amount.show(false); } },
    { id: 'feather', label: 'Feather...', keys: ['Shift+F6'], enabled: selected, params: { radius: { type: 'number', description: 'Feather radius in pixels, 0.1 to 1000; leave out to open the dialog.' } },
      run: (a) => { if (typeof a?.radius === 'number') engine.modifySelection('feather', Math.min(1000, Math.max(0.1, Math.round(a.radius * 10) / 10)), engine.selectionAtBounds); else dialogs.amount.show(false, 'feather'); } },
    { id: 'border', label: 'Border...', enabled: selected, run: () => dialogs.amount.show(false, 'border') },
    { id: 'smooth', label: 'Smooth...', enabled: selected, run: () => dialogs.amount.show(false, 'smooth') },
    ...(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as const).map((k) => ({ id: `align-${k}`, label: `Align ${{ left: 'Left Edges', hcenter: 'Horizontal Centers', right: 'Right Edges', top: 'Top Edges', vcenter: 'Vertical Centers', bottom: 'Bottom Edges' }[k]}`, enabled: () => !!layer(), run: () => engine.alignLayers(k) })),
    ...(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom', 'hspace', 'vspace'] as const).map((k) => ({ id: `distribute-${k}`, label: `Distribute ${{ left: 'Left Edges', hcenter: 'Horizontal Centers', right: 'Right Edges', top: 'Top Edges', vcenter: 'Vertical Centers', bottom: 'Bottom Edges', hspace: 'Horizontal Spacing', vspace: 'Vertical Spacing' }[k]}`, enabled: () => (engine.current?.selectedIds.size ?? 0) > (engine.alignTo === 'auto' ? 2 : 1), run: () => engine.distributeLayers(k) })),
    ...ADJUSTMENT_KINDS.map((kind) => ({ id: `adj-${kind}`, label: `${ADJUSTMENT_LABELS[kind]}...`, keys: ADJUST_KEYS[kind], enabled: hasTargetPixels, run: () => dialogs.adjust.openForImage(kind) })),
    ...ADJUSTMENT_KINDS.map((kind) => ({ id: `new-adj-${kind}`, label: `New ${ADJUSTMENT_LABELS[kind]} Layer...`, enabled: has, run: () => { const id = engine.addAdjustmentLayer(kind); if (id) dialogs.adjust.openForLayer(id, true); } })),
    { id: 'edit-adjustment', label: 'Edit Adjustment...', enabled: () => !!layer()?.adjustment && layer()?.adjustment?.kind !== 'filter', run: () => { const l = layer(); if (l?.adjustment) dialogs.adjust.openForLayer(l.id); } },
    { id: 'new-filter-layer', label: 'New Filter Layer', enabled: has, params: { filter: { type: 'string', required: true, description: 'The id of any filter, such as gaussianBlur, motionBlur, addNoise, unsharpMask or a library filter like emboss or oilPaint.' }, settings: { type: 'object', description: 'The filter settings by key, as the Filter dialog names them (radius, angle, distance, amount); left out keys take their defaults.' } },
      run: (a) => {
        const kind = typeof a?.filter === 'string' ? a.filter : '';
        if (!(kind in FILTER_LABELS)) return { id: null, error: `${kind || 'No filter'} is not a filter id.` };
        const id = engine.addFilterLayer(kind, FILTER_LABELS[kind as FilterKind], a?.settings && typeof a.settings === 'object' ? a.settings as Record<string, unknown> : {});
        return { id };
      } },
    { id: 'set-filter-layer', label: 'Set Filter Layer', enabled: () => layer()?.adjustment?.kind === 'filter', params: { settings: { type: 'object', required: true, description: 'The filter settings to change by key; the other keys stay as they were.' } },
      run: (a) => ({ applied: !!a?.settings && typeof a.settings === 'object' && engine.setFilterLayerSettings(a.settings as Record<string, unknown>) }) },
    { id: 'new-fill-solid', label: 'Solid Color...', enabled: has, run: () => dialogs.fillLayer.showNew('solid') },
    { id: 'new-fill-gradient', label: 'Gradient...', enabled: has, run: () => dialogs.fillLayer.showNew('gradient') },
    { id: 'new-fill-pattern', label: 'Pattern...', enabled: has, run: () => dialogs.fillLayer.showNew('pattern') },
    { id: 'new-fill-adjustment', label: 'New Fill or Adjustment Layer', enabled: has, run: () => { const b = root.querySelector<HTMLElement>('.cv-layers [data-cmd="new-fill-adjustment"]'), r = b?.getBoundingClientRect(); fillMenu.openAt(r ? r.left : 40, r ? r.bottom : 40); } },
    { id: 'new-relight-layer', label: 'Relight Layer...', icon: 'relight', enabled: () => has() && !relight.editing, run: () => { void relight.begin(); } },
    { id: 'filter-relight', label: 'Relight...', icon: 'relight', enabled: () => has() && !relight.editing, run: () => { void relight.begin(); } },
    { id: 'filter-relight-fal', label: 'Relight with fal...', icon: 'relight', enabled: has, run: () => { void dialogs.falTask.show('relight'); } },
    { id: 'edit-relight', label: 'Edit Lighting...', icon: 'relight', enabled: () => !!layer()?.relight && !relight.editing, run: () => { const l = layer(); if (l?.relight) void relight.begin(l.id); } },
    { id: 'layer-content-options', label: 'Layer Content Options...', enabled: () => !!layer()?.adjustment || !!layer()?.fillContent || !!layer()?.relight || !!layer()?.vector || !!layer()?.text || !!layer()?.smart, run: () => { const l = layer(); if (l?.fillContent) dialogs.fillLayer.showEdit(l.id); else if (l?.adjustment) { if (l.adjustment.kind === 'filter') editFilterLayer(l.id); else dialogs.adjust.openForLayer(l.id); } else if (l?.relight) void relight.begin(l.id); else if (l?.vector) dialogs.shapeStyle.show(); else if (l?.text) document.dispatchEvent(new CustomEvent('cv:type', { detail: { layerId: l.id } })); else if (l?.smart) engine.editContents(); } },
    { id: 'film-leak', label: 'Light Leak...', enabled: () => !!engine.current, run: () => filmLayer.show('leak') },   // 1.51.6
    { id: 'film-frame', label: 'Frame...', enabled: () => !!engine.current, run: () => filmLayer.show('frame') },
    { id: 'film-apply-look', label: 'Apply Film Look', enabled: () => !!engine.current, params: { look: { type: 'string', description: 'A film look id (portrait400, vivid100, slide50, slide200, mono400, monoFine100, monoPush1600, cineTungsten500, cineDaylight250, faded); Portrait Negative 400 when left out.' }, strength: { type: 'number', min: 0, max: 100, description: 'How much of the look is mixed in, percent (100).' }, grain: { type: 'number', min: 0, max: 100, description: 'Grain, percent (40).' } }, run: async (a) => { const r = await packTool(engine, 'film_apply_look', { look: typeof a?.look === 'string' && a.look ? a.look : 'portrait400', ...(typeof a?.strength === 'number' ? { strength: a.strength } : {}), ...(typeof a?.grain === 'number' ? { grain: a.grain } : {}) }); if (r.isError) throw new Error(r.content[0].type === 'text' ? r.content[0].text : 'failed'); return r.structuredContent; } },
    { id: 'film-copy-points', label: 'Copy Film Curve Points', enabled: () => engine.activeLayer?.adjustment?.kind === 'filmLook', run: () => { const l = engine.activeLayer, pts = l ? filmPointsOf(engine, l.id) : null; if (pts) { setFilmClipboard(pts); toast(`Copied ${pts.length} curve points.`); } return { points: pts }; } },
    { id: 'film-paste-points', label: 'Paste Film Curve Points', enabled: () => engine.activeLayer?.adjustment?.kind === 'filmLook' && !!filmClipboard(), run: () => { const l = engine.activeLayer, pts = filmClipboard(); return !!l && !!pts && setFilmPoints(engine, l.id, pts, 'Paste Film Curve Points'); } },
    { id: 'ai-label-add', label: 'Add EU AI Label...', enabled: () => !!engine.current, params: { kind: { type: 'string', enum: ['generated', 'edited'], description: 'generated: made with AI. edited: edited with AI. Without kind the dialog opens.' }, badge: { type: 'boolean', description: 'Add the visible badge layer (true).' }, anchor: { type: 'string', description: 'top-left, top, top-right, left, center, right, bottom-left, bottom or bottom-right (bottom-right).' }, style: { type: 'string', enum: ['dark', 'light', 'outline'], description: 'Badge style (dark).' } }, run: async (a) => { if (!a?.kind) { aiLabelDialog.show(); return undefined; } const r = await packTool(engine, 'ailabel_add', a); if (r.isError) throw new Error(r.content[0].type === 'text' ? r.content[0].text : 'failed'); return r.structuredContent; } },
    { id: 'ai-label-remove', label: 'Remove EU AI Label', enabled: () => !!engine.current?.doc.meta?.aiLabel || !!engine.current?.doc.layers.some((l) => l.name === 'EU AI label'), run: () => removeAiLabel(engine) },
    { id: 'ai-label-info', label: 'EU AI Label Info', enabled: () => !!engine.current, run: () => { const i = aiLabelInfo(engine); toast(i?.label ? `Marked as ${i.label === 'edited' ? 'edited with' : 'made with'} AI: ${String(i.digital_source_type)}` : 'This document is not marked as AI content.'); return i; } },
    { id: 'color-match', label: 'Color Match...', enabled: () => { const l = engine.activeLayer; return !!l && (!!l.raster && !l.adjustment || (l.name === 'Color Match' && !!l.clipId)); }, run: () => colorMatch.show() },   // 1.51.3
    { id: 'canvas-size', label: 'Canvas Size...', keys: ['Alt+Mod+C'], enabled: has, run: () => dialogs.canvasSize.show() },
    { id: 'image-size', label: 'Image Size...', keys: ['Alt+Mod+I'], enabled: has, run: () => dialogs.imageSize.show() },
    // Image > Mode and Layer > Flatten Image (1.50.2, the owner's walkthrough).
    { id: 'mode-rgb', label: 'RGB Color', enabled: has, checked: () => (engine.current?.doc.mode ?? 'rgb') === 'rgb', run: () => { if (askModeOptions('rgb')) return; const m = engine.current?.doc.mode; if (m === 'cmyk' || m === 'lab') void toRgbFirst(); else engine.convertMode('rgb'); } },
    { id: 'mode-lab', label: 'Lab Color', enabled: () => has() && ['rgb', 'lab'].includes(engine.current?.doc.mode ?? 'rgb'), checked: () => engine.current?.doc.mode === 'lab', run: () => { if (askModeOptions('lab')) return; if (engine.current?.doc.mode !== 'lab') void downTo(16).then((ok) => { if (!ok) return; if (engine.current?.doc.depth === 16) void deepMode('lab', 'lab', null); else engine.setLab(); }); } },
    { id: 'mode-cmyk', label: 'CMYK Color...', enabled: () => has() && ['rgb', 'cmyk', 'lab'].includes(engine.current?.doc.mode ?? 'rgb'), checked: () => engine.current?.doc.mode === 'cmyk', params: { profile: { type: 'string', description: 'default for the shipped CMYK profile, or a CMYK profile id or name: converts at once with no dialog. Left out, the CMYK dialog opens.' } }, run: (a) => { if (engine.current?.doc.mode === 'cmyk') return; void ((engine.current?.doc.depth ?? 8) > 8 ? downTo(16) : toRgbFirst().then((rgb) => (rgb ? downTo(8) : false))).then(async (ok) => {
      if (!ok) return;
      if (typeof a?.profile !== 'string') { modeDialog.show('cmyk'); return; }
      try {
        const all = (await api.colourProfiles()).profiles.filter((x) => x.space === 'CMYK'), pick = a.profile === 'default' ? (all.find((x) => x.shipped) ?? all[0]) : all.find((x) => x.id === a.profile || x.name === a.profile);
        if (!pick) { toast(t('No CMYK profile was found. Load one in View > Proof Setup.'), 'error'); return; }
        const c = loadPrefs().colour, profile = await cmykProfileOf(pick.id, pick.name);
        if (engine.current?.doc.depth === 16) await deepMode('cmyk', `id:${pick.id}`, profile, c.intent, c.bpc); else await toCmyk(profile, c.intent, c.bpc);
      } catch (err) { toast(message(err), 'error'); }
    }); } },
    { id: 'mode-grayscale', label: 'Grayscale', enabled: has, checked: () => engine.current?.doc.mode === 'grayscale', run: () => { if (askModeOptions('gray')) return; const m = engine.current?.doc.mode; if (inkDeep() && m !== 'grayscale') void toGray(); else if (m === 'lab') engine.setGrayFromLab(); else if (m === 'cmyk') void toRgbFirst().then((ok) => { if (ok) engine.convertMode('grayscale'); }); else engine.convertMode('grayscale'); } },
    { id: 'mode-duotone', label: 'Duotone...', enabled: () => has() && ['grayscale', 'duotone'].includes(engine.current?.doc.mode ?? 'rgb'), checked: () => engine.current?.doc.mode === 'duotone', run: () => dialogs.duotone.show() },   // 31.3a
    { id: 'mode-grayscale-from', label: 'Grayscale From Channels...', enabled: () => has() && ['rgb', 'indexed', 'grayscale'].includes(engine.current?.doc.mode ?? 'rgb') && (engine.current?.doc.depth ?? 8) === 8, run: () => modeDialog.show('grayscale') },
    { id: 'mode-bitmap', label: 'Bitmap...', enabled: has, checked: () => engine.current?.doc.mode === 'bitmap', run: () => void toRgbFirst().then((rgb) => (rgb ? downTo(8) : false)).then((ok) => { if (ok) modeDialog.show('bitmap'); }) },
    { id: 'mode-convert', label: 'Convert Mode...', enabled: () => has() && ['rgb', 'grayscale', 'cmyk', 'lab'].includes(engine.current?.doc.mode ?? 'rgb'), run: () => void modeConvertDialog.show() },
    { id: 'mode-multichannel', label: 'Multichannel', enabled: () => has() && (engine.current?.doc.depth ?? 8) === 8, checked: () => engine.current?.doc.mode === 'multichannel', run: () => { engine.convertMode('multichannel'); } },   // 31.3b
    { id: 'mode-indexed', label: 'Indexed Color...', enabled: has, checked: () => engine.current?.doc.mode === 'indexed', run: () => void toRgbFirst().then((rgb) => (rgb ? downTo(8) : false)).then((ok) => { if (ok) modeDialog.show('indexed'); }) },
    { id: 'color-table', label: 'Color Table...', enabled: () => has() && engine.current?.doc.mode === 'indexed', run: () => dialogs.colorTable.show() },   // 31.4
    // Bit depth (1.53.6, H1).
    { id: 'depth-8', label: '8 Bits/Channel', enabled: has, checked: () => (engine.current?.doc.depth ?? 8) === 8, run: () => void toDepth(8) },
    { id: 'depth-16', label: '16 Bits/Channel', enabled: has, checked: () => engine.current?.doc.depth === 16, run: () => { if (engine.current?.doc.depth === 32) void toDepth(16); else void toDeeper(16); } },
    { id: 'depth-32', label: '32 Bits/Channel', enabled: has, checked: () => engine.current?.doc.depth === 32, run: () => void toDeeper(32) },   // 1.53.9; every mode 1.57.8
    { id: 'export-hdr', label: 'Radiance HDR...', enabled: () => !!engine.current, run: () => void exportWide('hdr') },
    { id: 'export-exr', label: 'OpenEXR...', enabled: () => !!engine.current, run: () => void exportWide('exr') },
    { id: 'export-pfm', label: 'Float PFM...', enabled: () => !!engine.current, run: () => void exportWide('pfm') },
    { id: 'export-exr-half', label: 'OpenEXR Half Float...', enabled: () => !!engine.current, run: () => void exportWide('exr', { compression: 'zip', half: true }) },
    { id: 'export-exr-piz', label: 'OpenEXR PIZ...', enabled: () => !!engine.current, run: () => void exportWide('exr', { compression: 'piz' }) },
    { id: 'export-exr-none', label: 'OpenEXR Uncompressed...', enabled: () => !!engine.current, run: () => void exportWide('exr', { compression: 'none' }) },
    // Colour management (1.53.5, H2). Proof Colors has no key by default: Mod+Y is Redo here.
    { id: 'assign-profile', label: 'Assign Profile...', enabled: has, run: () => void colourDialogs.assign.show() },
    { id: 'convert-profile', label: 'Convert to Profile...', enabled: has, run: () => void colourDialogs.convert.show() },
    { id: 'profile-info', label: 'Profile Info...', enabled: has, run: () => void colourDialogs.info.show() },
    { id: 'proof-setup', label: 'Proof Setup...', enabled: has, run: () => void colourDialogs.proof.show() },
    ...PROOF_KINDS.map(([kind, name]): Command => ({ id: `proof-preset-${kind}`, label: name, enabled: has, checked: () => colourView.proof && colourView.preset === kind, run: () => colourView.usePreset(kind) })),
    { id: 'proof-colors', label: 'Proof Colors', enabled: () => has() && (!!colourView.setup || !!colourView.preset), checked: () => colourView.proof, run: () => { colourView.proof = !colourView.proof; if (!colourView.proof) colourView.gamut = false; void colourView.refresh(); } },
    { id: 'preview-32', label: '32-bit Preview Options...', enabled: () => engine.current?.doc.depth === 32, run: () => preview32.show() },
    {
      id: 'pick-screen-colour', label: 'Pick Color from Screen', enabled: () => 'EyeDropper' in window,
      run: async () => {
        const Pick = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
        if (!Pick) { toast('Picking from the screen needs a browser with the EyeDropper API.', 'error'); return; }
        try {
          const hex = (await new Pick().open()).sRGBHex, v = parseInt(hex.slice(1), 16);
          engine.setColors({ r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 });
        } catch { /* cancelled with Escape */ }
      },
    },
    { id: 'gamut-warning', label: 'Gamut Warning', keys: ['Shift+Mod+Y'], enabled: () => has() && (!!colourView.setup || !!colourView.preset), checked: () => colourView.gamut, run: () => { colourView.gamut = !colourView.gamut; if (colourView.gamut) colourView.proof = true; void colourView.refresh(); } },
    {
      id: 'calculations', label: 'Calculations...', enabled: has,
      params: {
        source1_doc: { type: 'string', description: 'Source 1 document (name) of the same pixel size as the current one; the current document when left out.' },
        source2_doc: { type: 'string', description: 'Source 2 document (name) of the same pixel size as the current one; the current document when left out.' },
        source1_layer: { type: 'string', description: 'Source 1 layer (id or name), or Merged; Merged when left out.' },
        source1_channel: { type: 'string', description: 'Source 1 channel: gray, red, green, blue, transparency, or an alpha channel (id or name); gray when left out.' },
        source1_invert: { type: 'boolean', description: 'Invert Source 1.' },
        source2_layer: { type: 'string', description: 'Source 2 layer (id or name), or Merged; Merged when left out. Source 2 is the backdrop.' },
        source2_channel: { type: 'string', description: 'Source 2 channel: gray, red, green, blue, transparency, or an alpha channel (id or name); gray when left out.' },
        source2_invert: { type: 'boolean', description: 'Invert Source 2.' },
        mode: { type: 'string', enum: [...CALC_MODES], description: 'Blending mode; normal when left out.' },
        opacity: { type: 'number', min: 0, max: 100, description: 'Opacity in percent; 100 when left out.' },
        scale: { type: 'number', min: 1, max: 2, description: 'Scale for add and subtract; 1 when left out.' },
        offset: { type: 'number', min: -255, max: 255, description: 'Offset for add and subtract; 0 when left out.' },
        mask_channel: { type: 'string', description: 'An alpha channel (id or name) used as the mask.' },
        result: { type: 'string', enum: ['channel', 'document', 'selection'], description: 'Where the result goes: a new alpha channel (the default), a new document, or the selection.' },
      },
      run: (a) => {
        if (!a || !Object.keys(a).length) { dialogs.calculations.show(); return undefined; }
        const text = (k: string): string | undefined => (a[k] === undefined ? undefined : String(a[k]));
        const num = (k: string): number | undefined => (a[k] === undefined ? undefined : Number(a[k]));
        const docId = (name: string | undefined): string | undefined => (name ? engine.projects.find((q) => q.doc.id === name || q.name === name)?.doc.id : undefined);
        const r = engine.calculations({
          source1: { doc: docId(text('source1_doc')), layer: text('source1_layer'), channel: text('source1_channel'), invert: a.source1_invert === true },
          source2: { doc: docId(text('source2_doc')), layer: text('source2_layer'), channel: text('source2_channel'), invert: a.source2_invert === true },
          mode: text('mode') as CalcMode | undefined, opacity: num('opacity') === undefined ? undefined : num('opacity')! / 100, scale: num('scale'), offset: num('offset'),
          mask: text('mask_channel'), result: text('result') as 'channel' | 'document' | 'selection' | undefined,
        });
        return r ? { channel: r.channel, document: r.project?.doc.id, selection: r.selection } : undefined;
      },
    },
    { id: 'flatten', label: 'Flatten Image', enabled: () => (engine.current?.doc.layers.length ?? 0) > 1, run: () => { engine.flattenImage(); } },
    ...FILTERS.map((kind) => ({ id: `filter-${kind}`, label: `${FILTER_LABELS[kind]}...`, ...(kind === 'develop' ? { keys: ['Shift+Mod+A'] } : kind === 'lensCorrection' ? { keys: ['Shift+Mod+R'] } : {}), enabled: hasTargetPixels, run: () => dialogs.filter.show(kind) })),
    ...LIBRARY.map((f) => ({ id: `filter-${f.id}`, label: libHasDialog(f.id) ? `${f.label}...` : f.label, enabled: f.fills ? () => hasTargetPixels() || engine.canGivePixels : hasTargetPixels, run: () => {
      if (libHasDialog(f.id)) { dialogs.filter.show(f.id); return; }
      const settings = { lib: { [f.id]: libDefaults(f.id) }, seed: randomSeed() };
      dialogs.filter.onApplied?.(f.id, settings);
      void dialogs.filter.applySettings(f.id, settings);
    } })),
    ...GALLERY_FX.map((fx) => ({ id: `filter-fx-${fx.key}`, label: `${fx.label}...`, enabled: hasTargetPixels,
      params: { values: { type: 'object' as const, description: `The ${fx.label} controls by key (${fx.params.map((p) => p.key).join(', ')}); with values the effect is applied at once, without them the Filter Gallery opens with this effect.` } },
      run: (a?: Record<string, unknown>) => {
        const settings = { lib: { filterGallery: { effects: [{ filter: fx.key, values: a?.values && typeof a.values === 'object' ? a.values : {}, visible: true }] } }, seed: randomSeed() };
        if (!a?.values || typeof a.values !== 'object') { dialogs.filter.showWith('filterGallery', settings); return; }
        dialogs.filter.onApplied?.('filterGallery', settings);
        return dialogs.filter.applySettings('filterGallery', settings);
      } })),
    { id: 'filter-average', label: 'Average', enabled: hasTargetPixels, run: () => engine.averageFill() },
    { id: 'filter-last', label: () => { const k = dialogs.filter.lastFilter; return k ? FILTER_LABELS[k] : 'Last Filter'; }, keys: ['Mod+F'], enabled: () => !!dialogs.filter.lastFilter && hasTargetPixels(), run: () => { void dialogs.filter.applyLast(); } },
  );

  // Filter > Plug-ins (WebAssembly): one command per installed plug-in, added and dropped as the list changes.
  const wasmFilter = new WasmFilterDialog(engine), wasmManager = new WasmPluginsDialog((id) => wasmFilter.show(id)), wasmIds = new Set<string>();
  commands.add(
    { id: 'wasm-plugins', label: 'Manage Plug-ins (WebAssembly)...', run: () => wasmManager.show() },
    { id: 'wasm-plugin-install', label: 'Install Plug-in...', run: () => wasmManager.pick() },
    { id: 'wasm-plugin-example', label: 'Install Example Plug-in', run: () => void wasmManager.installExample() },
    { id: 'wasm-plugin-remove', label: 'Remove Plug-in', params: { id: { type: 'string', required: true, description: 'The id of the installed plug-in to remove.' } }, run: (a) => { void wasmPlugins.remove(String(a?.id ?? '')).then((ok) => toast(ok ? 'Plug-in removed.' : 'No plug-in has that id.', ok ? 'info' : 'error')); } },
    { id: 'wasm-plugin-run', label: 'Run Plug-in', enabled: hasTargetPixels, params: { id: { type: 'string', required: true, description: 'The id of an installed plug-in.' }, values: { type: 'object', description: 'Parameter values by key, as the plug-in\'s schema declares them; left out keys take the defaults.' } }, run: (a) => {
      const e = wasmPlugins.get(String(a?.id ?? ''));
      if (!e) { toast('No plug-in has that id.', 'error'); return false; }
      return applyWasm(engine, e, wasmValues(e.manifest, a?.values));
    } },
  );
  const syncWasm = (): void => {
    const list = wasmPlugins.list(), now = new Set(list.map((e) => e.manifest.id));
    for (const id of [...wasmIds]) if (!now.has(id)) { commands.remove(`wasm-run-${id}`); wasmIds.delete(id); }
    for (const e of list) {
      const id = e.manifest.id;
      if (wasmIds.has(id)) continue;
      wasmIds.add(id);
      commands.add({ id: `wasm-run-${id}`, label: () => `${wasmPlugins.get(id)?.manifest.name ?? id}...`, enabled: hasTargetPixels, group: 'Filter', description: `Opens the ${e.manifest.name} WebAssembly plug-in's dialog. ${e.manifest.description}`.trim(), when: 'Use when you want to run this installed plug-in; run_command wasm-plugin-run applies it without the dialog.', mutates: true, run: () => wasmFilter.show(id) });
    }
  };
  wasmPlugins.watch(syncWasm);
  dialogs.smartFilters.editWasm = (id, settings, done) => wasmFilter.showFor(id, settings, done);
  dialogs.smartFilters.editLiquify = (settings, done) => dialogs.liquify.show({ settings, done });
  dialogs.smartFilters.editWideAngle = (settings, done) => dialogs.wideAngle.show({ settings, done });
  void wasmPlugins.load();

  const filterName =(id: string): string => (id === 'filter-average' ? 'Average' : FILTER_LABELS[id.slice('filter-'.length) as FilterKind] ?? id);
  const filterGroup = (group: LibGroup, core: string[]): string[] => [...core, ...libInGroup(group).map((f) => `filter-${f.id}`)].sort((a, b) => filterName(a).localeCompare(filterName(b)));
  const drawnFirst = ['filter-flame', 'filter-pictureFrame', 'filter-tree'];
  const menus: MenuDef[] = [
    { label: 'File', items: () => ['new', 'new-from-clipboard', 'open', 'open-as', 'import', 'import-folder', 'import-notes', 'import-video', 'create-video-timeline', 'place-embedded', 'place-linked', 'place-3d', 'open-svg-layers', ...(recent.length ? [{ label: 'Open Recent', items: [...recent.slice(0, loadPrefs().recentFileCount).map((_, i) => `recent-${i}`), '-', 'clear-recent'] }] : []), '-', 'save', 'save-as', 'save-as-history', 'save-copy', 'revert', 'earlier-states', 'download-project', 'package', '-',
      { label: 'Export', items: ['quick-export', 'export-as', 'export-preferences', 'save-for-web', '-', 'export-png', 'export-jpg', 'export-webp', 'export-avif', 'export-tiff', 'export-tiff-layers', 'export-hdr', 'export-exr', 'export-exr-half', 'export-exr-piz', 'export-exr-none', 'export-pfm', 'export-pdf', 'export-gif', 'export-mp4', 'render-video', '-', 'export-psd', 'export-psb', 'export-ora', 'export-paths-ai', 'assemble-tiles', '-', 'export-layers', 'export-layer-comps', 'export-selection-mask', 'generate-image-assets', 'generate-image-assets-folder', 'image-asset-variants', 'image-assets-on-save', 'export-luts', 'export-artboards-files', 'export-data-sets', 'export-artboards'] },
      { label: 'Automate', items: ['actions', 'action-stop', 'insert-conditional', 'insert-action-step', 'action-options', '-', 'load-actions', 'export-actions-atn', '-', 'batch', 'create-droplet', '-', 'lens-correction-batch', 'fit-image', 'conditional-mode-change', 'contact-sheet', 'crop-straighten-photos', 'photomerge', 'merge-hdr'] },
      { label: 'Scripts', items: ['script-delete-empty-layers', 'script-flatten-effects', 'script-flatten-masks', '-', 'script-browse', 'image-processor', 'script-events', 'load-files-stack', 'stack-statistics', '-', 'export-layers', 'export-artboards-files'] }, 'file-info', ...(hostLink.embedded ? ['send-host'] : ['send-nodemode']), 'send-comfyui', 'comfyui-run', '-', 'print', 'print-one-copy', '-', 'close-tab', 'reopen-closed-tab', 'close-all', 'close-others', 'close-tabs-right', 'pin-tab', '-', 'exit'] },
    { label: 'Edit', items: ['undo', 'redo', 'toggle-last-state', 'peek-original', 'compare-split', 'cancel-job', { label: 'Snapshot', items: ['new-snapshot', 'new-snapshot-merged', 'new-snapshot-layer'] }, '-', 'fade', 'compare-documents', '-', 'cut', 'copy', 'copy-merged', 'paste', { label: 'Paste Special', items: ['paste-in-place', 'paste-into', 'paste-outside'] }, 'clear', '-', 'search', 'pick-screen-colour', 'cycle-tool-mode', '-',
      { label: 'Purge', items: ['purge-clipboard', 'purge-undo', 'purge-histories', 'purge-video-cache', 'clean-working-files', 'free-helper-models', 'purge-all'] }, { label: 'History Log', items: ['save-history-log', 'clear-history-log'] }, 'apply-edit', 'cancel-edit', 'reset-tool', 'reset-all-tools', '-',
      { label: 'Fill', items: ['fill-dialog', 'fill-fg', 'fill-bg', 'fill-fg-keep', 'fill-bg-keep', 'fill-history'] }, 'stroke-dialog', 'content-fill-workspace', 'content-fill', 'generative-fill', 'generate-image', 'remove-wires', { label: 'Clone Source', items: ['clone-source-slot', 'clone-source-set', 'clone-source-overlay', 'clone-source-reset'] }, '-', 'auto-align-layers', 'auto-blend-layers', 'match-edges-below', '-',
      'fill-path-dialog', 'stroke-path-dialog', '-', 'transform', 'transform-copy', { label: 'Transform', items: ['transform-again', '-', 'transform-scale', 'transform-rotate', 'transform-skew', 'transform-distort', 'transform-perspective', 'transform-numeric', 'transform-warp', 'warp-split-h', 'warp-split-v', 'warp-split-cross', 'warp-remove-split', '-', 'layer-rotate-180', 'layer-rotate-90-cw', 'layer-rotate-90-ccw', '-', 'flip-layer-h', 'flip-layer-v'] }, 'perspective-warp', 'puppet-warp', '-', 'define-pattern', 'define-brush', 'define-custom-shape', { label: 'Presets', items: ['preset-manager', '-', 'presets-export', 'presets-import', 'presets-migrate', '-', 'swatches-load', 'swatches-save'] }, '-', 'assign-profile', 'convert-profile', 'profile-info', 'colour.settings', '-', 'customize-toolbar', 'shortcuts', 'edit-menus', { label: 'Preferences', items: ['settings', '-', ...PREF_PAGES.slice(0, 7).map(([id]) => `prefs-${id}`), 'export-preferences', ...PREF_PAGES.slice(7).map(([id]) => `prefs-${id}`)] }] },
    { label: 'Image', items: [
      'apply-image', 'calculations', { label: 'Adjustments', items: ['adj-levels', 'adj-curves', 'adj-exposure', '-', 'adj-hsv', ...PARAM_KINDS.map((k) => `adj-${k}`), '-', 'adj-gradientMap', 'adj-grain', '-', 'invert', '-', 'desaturate', 'replace-color', 'equalize', 'equalize-layer-from-selection'] }, '-',
      'auto-tone', 'auto-contrast', 'auto-color', '-',
      { label: 'Mode', items: ['mode-bitmap', 'mode-grayscale', 'mode-grayscale-from', 'mode-duotone', 'mode-indexed', 'mode-multichannel', 'color-table', 'mode-rgb', 'mode-cmyk', 'mode-lab', 'mode-convert', '-', 'split-channels', 'merge-channels', '-', 'depth-8', 'depth-16', 'depth-32'] }, '-',
      'image-size', 'canvas-size', { label: 'Pixel Aspect Ratio', items: ['par-square', 'par-d1-ntsc', 'par-d1-pal', 'par-d1-ntsc-wide', 'par-d1-pal-wide', 'par-anamorphic', 'par-hdv', 'par-dvcpro-hd', '-', 'par-custom'] }, { label: 'Image Rotation', items: ['rotate-180', 'rotate-90-cw', 'rotate-90-ccw', 'rotate-arbitrary', '-', 'flip-canvas-h', 'flip-canvas-v'] }, '-', 'image-crop', 'perspective-crop', 'trim', 'reveal-all', 'trap', '-', 'frequency-separation', 'duplicate-image', '-', { label: 'Variables', items: ['variables-define', 'data-sets-import', 'data-set-apply'] }, '-', 'generative-expand', { label: 'Upscale', items: ['upscale-2x', 'upscale-4x'] }, '-', { label: 'Analysis', items: ['measure-scale', 'measure-ruler', 'measure-color-sampler', { label: 'Color Samplers', items: ['sampler-add', 'sampler-move', 'sampler-delete', 'sampler-clear'] }, 'measure-count', { label: 'Count Groups', items: ['count-new-group', 'count-set-group'] }, 'measure-record', 'measure-record-features', 'measure-data-points', 'measure-scale-marker', 'measure-log'] }] },
    { label: 'Layer', items: [
      { label: 'New', items: ['new-layer-dialog', 'new-type-layer', 'new-shape-layer', 'new-dodge-burn-layer', 'layer-from-background', 'background-from-layer', 'new-folder-dialog', 'group-from-layers', '-', 'new-artboard-dialog', 'artboard-from-group', 'artboard-from-layers-dialog', 'frame-from-layers', '-', 'duplicate', 'layer-via-cut', '-', 'new-relight-layer', 'new-filter-layer', 'set-filter-layer'] }, 'artboard-options', '-',
      { label: 'New Fill Layer', items: ['new-fill-solid', 'new-fill-gradient', 'new-fill-pattern'] }, 'new-fill-adjustment', { label: 'Video Layers', items: ['video-layer-from-file', 'video-layer-blank', '-', 'video-insert-blank-frame', 'video-duplicate-frame', 'video-delete-frame', '-', 'video-restore-frame', 'video-reload-frame', 'video-restore-all', 'video-show-altered', 'video-replace-footage', 'video-interpret-footage', 'video-rasterize'] },{ label: 'New Adjustment Layer', items: ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`) }, 'edit-relight', 'layer-content-options', 'color-match', { label: 'New Film Layer', items: ['film-leak', 'film-frame'] }, { label: 'Film Pack', items: ['film-apply-look', 'new-adj-filmLook', 'new-adj-chromaticShift', '-', 'film-copy-points', 'film-paste-points'] }, { label: 'EU AI Label', items: ['ai-label-add', 'ai-label-remove', 'ai-label-info'] }, '-',
      'duplicate-dialog', 'copy-layers', 'paste-layers', 'copy-layers-to-document', { label: 'Delete', items: ['delete-layer', 'delete-hidden'] }, 'rename', 'layer-quick-export-png', 'layer-export-as', '-',
      { label: 'Layer Style', items: ['style-blending', 'style-bevel', 'style-stroke', 'style-inner-shadow', 'style-inner-glow', 'style-satin', 'style-color-overlay', 'style-gradient-overlay', 'style-pattern-overlay', 'style-outer-glow', 'style-drop-shadow', '-',
        'copy-layer-style', 'paste-layer-style', 'clear-layer-style', 'copy-style-below', 'move-style-below', '-', 'global-light', 'create-layers', 'hide-all-effects', 'toggle-layer-effects', 'scale-effects'] },
      { label: '3D', items: ['extrude-3d', 'place-3d', '-', 'panorama-view', 'panorama-apply-view'] },
      { label: 'Smart Objects', items: ['convert-smart', 'smart-new-via-copy', 'smart-convert-to-layers', 'edit-contents', 'replace-contents', 'smart-export-contents', { label: 'Stack Mode', items: STACK_MODES.map((m) => `stack-mode-${m.id}`) }, '-', 'transform-warp', 'perspective-warp', 'puppet-warp', 'smart-warp-reset', '-', 'smart-convert-to-linked', 'update-linked', 'relink', 'embed-linked', 'smart-reveal-linked', '-', 'smart-filters', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask'] },
      { label: 'Smart Filter', items: ['smart-filters-disable', 'smart-filters-clear'] },
      { label: 'Rasterize', items: ['rasterize-type', 'rasterize-shape', 'rasterize-fill', 'rasterize-smart', 'rasterize-vmask', 'rasterize-style', '-', 'rasterize', 'rasterize-all'] }, 'layer-bits-8', 'layer-bits-16', { label: 'Type', items: ['check-spelling', 'find-replace-text', 'paste-lorem-ipsum', '-', { label: 'Orientation', items: ['type-horizontal', 'type-vertical'] }, { label: 'Language Options', items: ['language-default', 'language-east-asian', 'language-middle-eastern', 'language-south-asian'] }, { label: 'Text Direction', items: ['type-direction-auto', 'type-direction-ltr', 'type-direction-rtl'] }, { label: 'Anti-Alias', items: ['none', 'sharp', 'crisp', 'strong', 'smooth', 'windows-lcd', 'windows'].map((how) => `type-aa-${how}`) }, { label: 'Style', items: ['type-all-caps', 'type-small-caps', 'type-underline', 'type-strikethrough', '-', 'reset-character', 'reset-paragraph'] }, { label: 'OpenType', items: ['liga', 'calt', 'dlig', 'swsh', 'onum', 'salt', 'titl', 'ornm', 'ordn', 'frac'].map((tag) => `type-ot-${tag}`) }, 'convert-point-text', 'convert-paragraph-text', '-', 'type-work-path', 'type-to-shape', '-', 'type-angle', 'type-range-style', 'type-range-character-style', '-', 'update-all-text', 'resolve-missing-fonts', 'replace-missing-fonts', 'save-default-type-styles', 'load-default-type-styles', 'add-font-files', 'add-web-font', '-', { label: 'Font Preview Size', items: FONT_PREVIEWS.map((v) => `font-preview-${v}`) }, '-', 'type-on-arc', 'type-on-circle', 'type-path-flip', 'type-path-release'] }, 'edit-text', 'warp-text', 'type-on-path', { label: 'Shape', items: ['new-shape-path', 'shape-color', 'shape-style', 'shape-style-copy', 'shape-style-paste', 'shape-corners', '-', 'apply-redactions'] }, '-',
      { label: 'Layer Mask', items: ['mask-reveal-all', 'mask-hide-all', 'mask-reveal-selection', 'mask-hide-selection', 'mask-from-transparency', '-', 'delete-mask', 'apply-mask', '-', 'toggle-mask', 'link-mask', 'mask-invert', 'mask-properties', '-', 'mask-view-alone', 'mask-view-red'] },
      { label: 'Vector Mask', items: ['vmask-reveal-all', 'vmask-hide-all', 'vmask-current-path', 'vmask-delete', '-', 'vmask-enable', 'vmask-link', 'vmask-invert'] }, 'clip', 'mask-all-objects', '-',
      'group', 'ungroup', 'move-out', 'hide-layers', '-',
      { label: 'Arrange', items: ['bring-front', 'forward', 'backward', 'send-back', '-', 'reverse-layers'] },
      { label: 'Combine Shapes', items: ['shapes-unite', 'shapes-subtract', 'shapes-intersect', 'shapes-exclude', '-', 'shapes-merge'] },
      { label: 'Align', items: ['align-left', 'align-hcenter', 'align-right', '-', 'align-top', 'align-vcenter', 'align-bottom'] },
      { label: 'Distribute', items: ['distribute-left', 'distribute-hcenter', 'distribute-right', '-', 'distribute-top', 'distribute-vcenter', 'distribute-bottom', '-', 'distribute-hspace', 'distribute-vspace'] },
      { label: 'Flip', items: ['flip-layer-h', 'flip-layer-v'] }, '-',
      'lock-transparency', 'lock-layers', '-', 'link-layers', 'select-linked', '-',
      'merge', 'merge-visible', 'stamp-visible', 'frequency-separation', 'stamp-down', 'flatten', '-', 'show-only-layer', 'show-all-layers', { label: 'Color Label', items: ['layer-label-none', '-', ...LAYER_LABELS.map((c) => `layer-label-${c}`)] }, { label: 'Role', items: ['layer-role-none', '-', ...LAYER_ROLES.map((r) => `layer-role-${r}`)] }, '-',
      { label: 'Matting', items: ['matting-decontaminate', 'matting-defringe', 'matting-black', 'matting-white'] }] },
    { label: 'Select', items: ['select-all', 'deselect', 'reselect', 'inverse', 'convert-to-shape', 'convert-to-shape-tolerance', 'selection-to-work-path', '-', 'select-all-layers', 'deselect-layers', 'find-layers', 'isolate-layers', '-', 'color-range', 'select-by-depth', 'focus-area', 'select-subject', 'select-sky', 'select-object', 'select-subject-text', { label: 'Subject and Sky Options', items: ['auto-select-sample-all', 'sky-sensitivity', 'sky-softness'] }, 'select-and-mask', 'select-and-mask-dialog', '-', 'layer-pixels', 'mask-black', '-',
      { label: 'Modify', items: ['expand', 'contract', 'feather', 'border', 'smooth'] }, 'grow', 'similar', '-', 'transform-selection', 'transform-selection-numeric', 'select-float', 'select-drop', '-', 'quick-mask', '-', 'load-selection', 'load-luminosity', 'load-selection-vector-mask', 'save-selection', { label: 'Channel', items: ['new-channel', 'new-spot-channel', 'duplicate-channel', 'channel-options', '-', 'channel-up', 'channel-down'] }, 'path-selection', 'path-selection-dialog', 'delete-path'] },
    { label: 'Filter', items: ['filter-last', 'filter-convert-smart', '-', 'filter-filterGallery', 'filter-develop', 'filter-wide-angle', 'filter-lensCorrection', 'filter-liquify', 'filter-vanishing-point', 'filter-neural', '-',
      { label: 'Blur', items: filterGroup('Blur', ['filter-average', 'filter-gaussianBlur', 'filter-lensBlur', 'filter-motionBlur', 'filter-radialBlur', 'filter-surfaceBlur']) },
      { label: 'Blur Gallery', items: ['filter-fieldBlur', 'filter-irisBlur', 'filter-tiltShift', 'filter-pathBlur', 'filter-spinBlur'] },
      { label: 'Distort', items: filterGroup('Distort', []) },
      { label: 'Noise', items: filterGroup('Noise', ['filter-addNoise']) },
      { label: 'Pixelate', items: filterGroup('Pixelate', []) },
      { label: 'Render', items: [...drawnFirst, 'filter-relight-fal', '-', ...filterGroup('Render', []).filter((id) => !drawnFirst.includes(id))] },
      { label: 'Sharpen', items: filterGroup('Sharpen', ['filter-smartSharpen', 'filter-shakeReduction', 'filter-unsharpMask']) },
      { label: 'Stylize', items: filterGroup('Stylize', []) },
      { label: 'Video', items: filterGroup('Video', []) },
      { label: 'Other', items: filterGroup('Other', []) },
      { label: '3D', items: ['normal-map', 'bump-map', 'height-from-normal'] },
      { label: 'Plug-ins (WebAssembly)', get items() { const ids = [...wasmIds].map((i) => `wasm-run-${i}`); return [...ids, ...(ids.length ? ['-'] : []), 'wasm-plugins', 'wasm-plugin-install', 'wasm-plugin-example']; } }, '-', 'remove-bg', 'remove-bg-lite'] },
    // Generate: the generative commands in one place (the Generate panel, models, fill, repair, size, relight, and the ComfyUI and NodeMode links).
    { label: 'Generate', items: ['generate-panel', '-', 'generate-image', 'new-canvas-model-preset', 'generative-fill', 'generative-expand', '-', 'boxes-tool', 'boxes-from-selection', 'boxes-copy', 'boxes-clear', '-', 'generate-remove', 'content-fill-workspace', 'content-fill', 'remove-wires', '-', 'remove-bg', 'remove-bg-lite', '-', 'upscale-2x', 'upscale-4x', 'compute-depth-map', 'compute-depth-map-16', { label: 'Depth Map', items: ['depth-map-from-layer', 'depth-map-recompute', 'depth-map-show', '-', 'depth-map-flatten', 'depth-map-nearer', 'depth-map-farther', 'depth-map-smooth', 'depth-map-snap', 'depth-map-detail'] }, 'new-relight-layer', '-', 'comfyui-run', 'send-comfyui', ...(hostLink.embedded ? ['send-host'] : ['send-nodemode'])] },
    { label: 'View', items: [{ label: 'Proof Setup', items: ['proof-setup', '-', 'proof-preset-monitor', 'proof-preset-macrgb', 'proof-preset-internet', 'proof-preset-cmyk', 'proof-preset-cyan', 'proof-preset-magenta', 'proof-preset-yellow', 'proof-preset-black', 'proof-preset-cmy', '-', 'proof-preset-protanopia', 'proof-preset-deuteranopia'] }, 'proof-colors', 'gamut-warning', 'preview-32', '-', 'zoom-in', 'zoom-out', 'fit', 'fit-layers', 'fit-artboard', 'actual', 'print-size', 'flip-view-h', 'canvas-scrollbars', 'no-tool', '-', 'toggle-extras', 'toggle-rulers', 'toggle-grid', 'grid-settings', 'pixel-grid', 'pattern-preview', 'pixel-art-preview', 'par-correction', 'transform-controls', 'toggle-task-bar', 'performance-hud', '-',
      { label: 'Guides', items: ['toggle-guides', 'lock-guides', 'new-guide', 'guide-layout', 'guides-from-shape', 'guides-from-shape-centre', 'edit-selected-guides', 'clear-guides', 'clear-artboard-guides'] }, 'snap', { label: 'Snap To', items: ['snap-all', '-', 'snap-guides', 'snap-grid', 'snap-layers', 'snap-bounds', 'snap-slices', 'snap-selection'] }, { label: 'Show', items: ['show-all-extras', 'show-no-extras', '-', 'show-selection-edges', 'selection-display-tint', 'show-layer-edges', 'show-artboard-guides', 'show-target-path','show-smart-guides', 'show-comfy-dot', 'show-notes', 'show-counts', 'show-brush-preview', 'show-mesh', 'show-edit-pins', '-', 'show-extras-options', '-', 'toggle-show-slices', 'toggle-auto-slices', 'lock-slices', 'layer-based-slice', 'slices-from-guides', 'slice-options', 'divide-slice', 'delete-slice', 'clear-slices'] }, '-',
      { label: 'Screen Mode', items: ['screen-standard', 'screen-menu', 'screen-full'] }, 'os-full-screen', 'toggle-panels', 'rail-columns', 'interface-rtl', 'next-favourite-theme', 'interface-zoom-in', 'interface-zoom-out', 'interface-zoom-reset', 'custom-title-bar', 'menus-in-window', { label: 'Pasteboard', items: ['pasteboard-default', 'pasteboard-black', 'pasteboard-dark', 'pasteboard-mid', 'pasteboard-light'] }] },
    { label: 'Plugins', items: () => { const ids = [...pluginHost.commandIds(), ...folderPlugins.commandIds()]; return ['manage-plugins', 'reload-plugins', 'open-plugins-folder', ...(ids.length && loadPrefs().showExtPanels ? ['-', ...ids] : [])]; } },
    { label: 'Extensions', items: () => formExt.menuItems() },
    { label: 'Window', items: [{ label: 'Arrange', items: ['new-window', 'float-window', 'float-all-windows', 'arrange-cascade', '-', 'arrange-tabs','arrange-2up-v', 'arrange-2up-h', 'arrange-3up', 'arrange-3up-v', 'arrange-3up-h', 'arrange-4up', 'arrange-6up', 'arrange-tile-v', 'arrange-tile-h', 'arrange-tile', '-', 'match-zoom', 'match-location', 'match-rotation', 'match-all'] }, 'assistant', 'agent.claude.open', 'agent.chat', 'agent.connect.open', 'agent.connect.copy-claude-code', 'agent.connect.copy-claude-desktop', 'terminal.toggle', 'terminal.new', 'script-console', 'brush-settings', { label: 'Brush Size', items: ['brush-size-up', 'brush-size-down', 'brush-harder', 'brush-softer'] }, { label: 'Brush Presets', items: ['save-brush-preset', 'rename-brush-preset', 'delete-brush-preset', 'move-brush-preset', 'rename-brush-group', '-', 'set-brush', 'get-brush'] }, 'paragraph-styles', 'character-styles', 'glyphs', 'tool-presets', '-', ...ALL_PANELS.map((pn) => `panel-${pn.id}`), 'panel-paths', 'panel-channels', 'panel-color', 'panel-tools', 'panel-options', 'panel-properties-col', 'merge-columns', 'toggle-dock-panels', '-', 'panel-float', 'panel-dock', 'panel-activate', 'panel-group', 'panel-close-group', '-', { label: 'Workspace', items: ['workspace-pixelart', '-', 'new-workspace', 'delete-workspace'] }, 'reset-panels', '-', 'next-document', 'previous-document', 'notices', 'jobs-list', '-', { label: 'Theme', items: Object.keys(THEMES).map((tid) => `theme-${tid}`) }, 'theme-sync-system', 'next-appearance', 'interface-darken', 'interface-lighten', '-', 'reload-window', 'developer-tools'] },
    { label: 'Help', items: ['help', 'whats-new', '-', 'shortcuts', 'console-log', 'copy-error-log', 'copy-engine-log', 'benchmark', 'record-performance', 'frame-trace', 'copy-frame-trace', 'tile-grid', 'simulate-gpu-loss', '-', 'help-github', 'report-issue', '-', 'check-for-updates', 'system-info', 'about'] },
  ];
  const menubar = new MenuBar(q(root, '.cv-menubar'), commands, menus);
  // The desktop app on macOS puts these menus in the system menu bar, as the target's (Phase 21); the in-window bar then hides.
  if (wantsNativeMenus()) {
    const native = new NativeMenus(commands, () => menus);
    void native.build().catch(() => undefined);
    for (const ev of ['active', 'doc', 'selection', 'history', 'tool'] as const) engine.on(ev, () => native.refresh());
    engine.on('projects', () => { void native.build().catch(() => undefined); });   // Open Recent and what is enabled
    onLanguage(() => { void native.build().catch(() => undefined); });
  }
  contextMenu.setItems(['duplicate-dialog', 'delete-layer', 'rename', 'edit-text', 'warp-text', '-',
    { label: 'Smart Objects', items: ['convert-smart', 'smart-new-via-copy', 'smart-convert-to-layers', 'smart-export-contents', { label: 'Stack Mode', items: STACK_MODES.map((m) => `stack-mode-${m.id}`) }, 'rasterize', 'edit-contents', 'replace-contents', '-', 'smart-convert-to-linked', 'update-linked', 'relink', 'embed-linked', 'smart-reveal-linked', '-', 'smart-filters', 'add-filter-mask', 'toggle-filter-mask', 'delete-filter-mask'] },
    { label: 'Shape', items: ['new-shape-path', 'shape-color', 'shape-style', 'shape-style-copy', 'shape-style-paste', 'shape-corners', '-', 'apply-redactions'] },
    { label: 'Layer Style', items: ['layer-style', '-', 'copy-layer-style', 'paste-layer-style', 'clear-layer-style'] },
    { label: 'Layer Comps', items: ['layer-comp-new', 'layer-comp-apply', 'layer-comp-update', 'layer-comp-options', 'layer-comp-duplicate', 'layer-comp-delete', '-', 'layer-comp-last-state', 'layer-comp-next', 'layer-comp-previous'] }, '-',
    { label: 'Layer Mask', items: ['mask-reveal-all', 'mask-hide-all', '-', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask'] }, 'clip', 'link-layers', 'select-linked', '-', 'hide-layers', 'show-only-layer', 'show-all-layers', { label: 'Color Label', items: ['layer-label-none', '-', ...LAYER_LABELS.map((c) => `layer-label-${c}`)] }, { label: 'Role', items: ['layer-role-none', '-', ...LAYER_ROLES.map((r) => `layer-role-${r}`)] }, '-', 'group', 'ungroup', 'move-out', 'merge', 'merge-visible', 'flatten', '-', 'copy-layers', 'paste-layers', 'layer-quick-export-png', 'layer-export-as', '-', 'layer-pixels', 'layer-bits-8', 'layer-bits-16', { label: 'Convert Bit Depth', items: ['depth-8', 'depth-16'] }]);
  fillMenu.setItems([{ label: 'New Fill Layer', items: ['new-fill-solid', 'new-fill-gradient', 'new-fill-pattern'] }, { label: 'New Adjustment Layer', items: ADJUSTMENT_KINDS.map((k) => `new-adj-${k}`) }]);
  const tabMenu = new PopupMenu(commands, null, true);
  tabMenu.setItems(['close-tab', 'close-others', 'close-tabs-right', 'close-all', '-', 'pin-tab', 'reopen-closed-tab', '-', 'next-document', 'previous-document']);
  const tabs = new Tabs(q(root, '.cv-tab-strip'), engine, (id) => void (engine.closeSpareView(id) || requestClose(id)), (_id, x, y) => tabMenu.openAt(x, y), q(root, '.cv-tb-doc'));   // a further view closes first; the document stays open while one remains (36.16)

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
        const why = t(commands.why(cmd));
        setTitle(b, why || (keys ? `${label} (${keys})` : label));
        if (b.classList.contains('cv-icon-btn') && b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
      }
    });
  };
  for (const k of ['projects', 'history', 'active', 'doc', 'selection', 'viewport', 'options', 'tool'] as const) engine.on(k, syncChrome);
  syncChrome();

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-cmd]');
    // Alt-click on a Layers panel footer button asks for the options first (New Layer..., New Group...); on the mask button it hides the selection.
    const ask: Record<string, string> = { 'new-layer': 'new-layer-dialog', 'new-folder': 'new-folder-dialog', 'add-mask': 'add-mask-hide' };
    if (b && root.contains(b) && !b.disabled) commands.run((e.altKey && ask[b.dataset.cmd ?? '']) || (b.dataset.cmd ?? ''));
  });
  // Recording: commands that change the document, filters with their settings, and size changes.
  commands.onRun = (cmd, label) => { if (RECORDABLE.has(cmd.id)) actions.record({ kind: 'command', id: cmd.id, label }); };
  dialogs.filter.onApplied = (kind, settings) => actions.record({ kind: 'filter', filter: kind, label: FILTER_LABELS[kind], settings });
  // Adjustments applied to the image, or new adjustment layers, record with their settings; edits of an existing
  // adjustment layer do not, since a replay could not know which layer to change.
  dialogs.layerStyle.onApplied = (fx) => actions.record({ kind: 'layerStyle', label: fx ? 'Layer Style' : 'Clear Layer Style', effects: fx as unknown as Record<string, unknown> | null });
  dialogs.adjust.onApplied = (v) => { if (!v.layer || v.made) actions.record({ kind: 'adjustment', adj: v.kind, label: v.layer ? `New ${ADJUSTMENT_LABELS[v.kind]} Layer` : ADJUSTMENT_LABELS[v.kind], data: v.data as Record<string, unknown>, layer: v.layer }); };
  dialogs.imageSize.onApplied = (v) => actions.record({ kind: 'imageSize', label: `Image Size ${v.w} x ${v.h}`, ...v });
  dialogs.conditionalMode.onApply = (from, to) => void conditionalMode(from, to).then((ok) => { if (ok) actions.record({ kind: 'conditionalMode', label: `Conditional Mode Change to ${to}`, from, to }); });
  dialogs.fitImage.onApplied =(v) => actions.record({ kind: 'fitImage', label: `Fit Image ${v.w} x ${v.h}${v.enlarge ? '' : ', no enlarging'}`, ...v });
  dialogs.canvasSize.onApplied = (v) => actions.record({ kind: 'canvasSize', label: `Canvas Size ${v.w} x ${v.h}`, ...v });
  root.addEventListener('cv:edit-layer-style', () => dialogs.layerStyle.show());
  root.addEventListener('cv:edit-layer-effect', (e) => {
    const d = (e as CustomEvent<{ id: string; key: StyleSection }>).detail;
    if (engine.current?.activeId !== d.id) engine.selectLayer(d.id);
    dialogs.layerStyle.show(d.key);
  });
  root.addEventListener('cv:smart-filters', () => dialogs.smartFilters.show());
  root.addEventListener('cv:shape-style', () => dialogs.shapeStyle.show());
  document.addEventListener('cv:create-shape', (e) => { const d = (e as CustomEvent<{ x: number; y: number }>).detail; if (d) dialogs.createShape.show({ x: d.x, y: d.y }); });
  root.addEventListener('cv:fill-options', (e) => dialogs.fillLayer.showEdit((e as CustomEvent<string>).detail));
  root.addEventListener('cv:relight-edit', (e) => { void relight.begin((e as CustomEvent<string>).detail); });
  watchLinked(engine, (names) => toast(`Updated from changed file${names.length > 1 ? 's' : ''}: ${names.join(', ')}.`));
  engine.smartFilterMargin = (kind, settings) => kind === 'liquify' || kind === 'wideangle' ? 0 : isWasmKind(kind) ? wasmPlugins.get(wasmIdOf(kind))?.manifest.reach ?? 0 : filterMargin(kind as FilterKind,{ ...defaultFilterSettings(), ...(settings as Partial<FilterPanelSettings>) });
  void loadPatterns();
  engine.smartFilterRunnerAsync = (kind, settings, src) => {
    if (kind === 'liquify') return Promise.resolve(runLiquifySmart(settings, src));
    if (kind === 'wideangle') return Promise.resolve(runWideAngleSmart(settings, src));
    if (isWasmKind(kind)) {
      const e = wasmPlugins.get(wasmIdOf(kind));
      if (!e) { toast(`The plug-in ${wasmIdOf(kind)} is not installed, so its smart filter is skipped.`, 'error'); return Promise.resolve(src); }
      return runWasmFilter(e, wasmValues(e.manifest, settings.values), src).catch((err: unknown) => { toast(`${e.manifest.name}: ${err instanceof Error ? err.message : 'it failed.'}`, 'error'); return src; });
    }
    const s ={ ...defaultFilterSettings(), ...(settings as Partial<FilterPanelSettings>) }, seed = typeof settings.seed === 'number' ? settings.seed : 0;
    return runFilterOffThread(kind as FilterKind, s, 1, seed, src) ?? Promise.resolve(runFilter(kind as FilterKind, s, seed, src, 1));
  };
  depthSource.read = (c) => {
    const p = engine.current, dl = engine.depthLayer();
    if (!p || !dl?.raster || dl.raster.width !== p.doc.width || dl.raster.height !== p.doc.height) return null;
    const grey = dl.raster.read().data, DW = dl.raster.width, DH = dl.raster.height, out = new Uint8Array(c.width * c.height);
    for (let y = 0; y < c.height; y++) {
      const sy = Math.min(DH - 1, Math.max(0, Math.floor(c.originY + (y + 0.5) * c.unitsPerPixel)));
      for (let x = 0; x < c.width; x++) out[y * c.width + x] = grey[(sy * DW + Math.min(DW - 1, Math.max(0, Math.floor(c.originX + (x + 0.5) * c.unitsPerPixel)))) * 4];
    }
    return out;
  };
  filterLayerHook.run = (kind, settings, src, scale) => isWasmKind(kind) || kind === 'liquify' || kind === 'wideangle' ? src : runFilter(kind as FilterKind, { ...defaultFilterSettings(), ...(settings as Partial<FilterPanelSettings>) }, typeof settings.seed === 'number' ? settings.seed : 0, src, scale);
  engine.smartFilterRunner = (kind, settings, src) => kind === 'liquify' ? runLiquifySmart(settings, src) : kind === 'wideangle' ? runWideAngleSmart(settings, src) : isWasmKind(kind) ? src : runFilter(kind as FilterKind, { ...defaultFilterSettings(), ...(settings as Partial<FilterPanelSettings>) }, typeof settings.seed === 'number' ? settings.seed : 0, src, 1);
  document.addEventListener('cv:type', (e) => {
    const d = (e as CustomEvent<{ layerId?: string; x?: number; y?: number; box?: { w: number; h: number } }>).detail;
    if (d?.layerId) typing.begin({ layerId: d.layerId });
    else if (typeof d?.x === 'number' && typeof d?.y === 'number') typing.begin({ x: d.x, y: d.y, box: d.box });   // a box: paragraph text
  });
  root.addEventListener('cv:edit-adjustment', (e) => {
    const id = (e as CustomEvent<string>).detail;
    if (typeof id !== 'string') return;
    if (engine.current?.doc.layers.find((x) => x.id === id)?.adjustment?.kind === 'filter') editFilterLayer(id);
    else dialogs.adjust.openForLayer(id);
  });
  function editFilterLayer(id: string): void {
    const l = engine.current?.doc.layers.find((x) => x.id === id), data = l?.adjustment?.kind === 'filter' ? l.adjustment.data : null;
    const kind = typeof data?.filter === 'string' ? data.filter : '';
    if (!l || !data || !kind) return;
    if (isWasmKind(kind) || kind === 'liquify' || kind === 'wideangle') { toast('This filter has its own window; a filter layer cannot hold it.'); return; }
    if (!engine.beginLive(`Edit ${l.name}`)) return;
    const base = (data.settings ?? {}) as Record<string, unknown>;
    const put = (settings: Record<string, unknown>): void => engine.updateLive((p) => p.updateLayer(id, { adjustment: { kind: 'filter', data: { ...data, settings: structuredClone(settings) } } }));
    dialogs.filter.showFor(kind as FilterKind, base, (settings) => { put(settings); engine.commitLive(); }, { change: put, cancel: () => engine.cancelLive() });
    if (!dialogs.filter.isOpen) engine.cancelLive();
  }
  root.addEventListener('cv:mask-properties', () => { commands.run('panel-activate', { panel: 'properties' }); });

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
  // A double-click on the edge puts the panel column back to its first width.
  resizer.addEventListener('dblclick', () => {
    if (dock.locked || resizer.classList.contains('is-inert')) return;
    store(LAYERS_W_KEY, ''); setStyleVar(root, '--cv-layers-w', '288px');
    window.dispatchEvent(new Event('resize'));
  });

  // Number fields everywhere (ui/number-fields.ts): typed arithmetic, Shift with the arrows steps ten times as far, Return or Escape leaves the field, labels scrub, a pop-up slider.
  installNumberFields();

  window.addEventListener('keydown', (e) => {
    if (anyDialogOpen() || e.defaultPrevented) return;
    if (menubar.isOpen || contextMenu.isOpen) {
      if (e.key === 'Escape') { e.preventDefault(); menubar.close(); contextMenu.close(); }
      return;
    }
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    const keyed = /^F\d+$/.test(e.key) ? actions.forKey(comboOf(e)) : undefined;
    if (keyed) { e.preventDefault(); if (!e.repeat) void playAction(keyed); return; }
    if (e.code === 'Space' && !e.shiftKey) { e.preventDefault(); if (!e.repeat) stage.setSpace(true); return; }   // with Ctrl or Cmd it is the temporary Zoom (a drag)
    if (e.code === 'Backslash' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && engine.current) {   // held: the opening snapshot shows in place of the document
      e.preventDefault();
      if (!e.repeat && !stage.comparing && !stage.compare('peek')) toast('No snapshot is kept to peek at: New Snapshot takes one.');
      return;
    }
    // Return and Escape reach the tool through the two edit commands, so Keyboard Shortcuts can move them: a key bound to
    // one is passed on as the tool's own Return or Escape, and a plain Return or Escape that was rebound away is not.
    const cmd = commands.forEvent(e), plain = !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
    const editCmd = cmd?.id === 'apply-edit' || cmd?.id === 'cancel-edit';
    if (editCmd && e.key !== (cmd?.id === 'apply-edit' ? 'Enter' : 'Escape')) { if (cmd && commands.get(cmd.id)?.run()) e.preventDefault(); return; }
    const rebound = plain && ((e.key === 'Enter' && cmd?.id !== 'apply-edit') || (e.key === 'Escape' && cmd?.id !== 'cancel-edit'));
    if (!rebound && stage.toolKeydown(e)) { e.preventDefault(); return; }
    if (cmd?.id === 'paste') return;
    if (cmd && !editCmd) {
      e.preventDefault();
      if (!e.repeat || /^(undo|redo|zoom-in|zoom-out)$/.test(cmd.id)) commands.run(cmd.id);
      return;
    }
    // Escape deselects once no tool, menu or dialog has used it and the focus is on the canvas or the toolbar.
    if (e.key === 'Escape' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && selected() && (!target || target === document.body || !!target.closest('.cv-stage, .cv-rail'))) { e.preventDefault(); commands.run('deselect'); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const k = e.code.startsWith('Key') ? e.code.slice(3) : '';
    if (!k) return;
    if (k === 'X') engine.swapColors();
    else if (k === 'D') engine.defaultColors();
    // E and B pick their groups' tools like any letter (1.49.5: the Eraser is its own tool, the Pencil beside the Brush).
    else if (k === 'M' && e.shiftKey) { engine.setTool('marquee'); engine.update({ marqueeKind: engine.marqueeKind === 'rectangle' ? 'ellipse' : 'rectangle' }); }
    else if (k === 'L' && e.shiftKey) { engine.setTool('lasso'); engine.update({ lassoKind: engine.lassoKind === 'freehand' ? 'polygonal' : engine.lassoKind === 'polygonal' ? 'magnetic' : 'freehand' }); }
    else if (toolForKey(k)) {
      // A letter picks its slot's tool (the one last chosen from its group), keeping one already
      // chosen from the same group; Shift with it cycles the group.
      const group = toolsForKey(k), at = group.findIndex((t) => t.id === engine.tool);
      if (loadPrefs().shiftToolSwitch ? e.shiftKey : at >= 0 && !e.shiftKey) { if (group.length > 1) engine.setTool(group[(at + 1) % group.length].id); }
      else if (at < 0) { const prev = engine.tool; const g = toolGroups().find((x) => x.key === k); engine.setTool(g ? slotTool(g, engine.tool).id : group[0].id); if (engine.tool !== prev) spring = { code: e.code, prev, at: performance.now() }; }
    }
    else return;
    e.preventDefault();
  });
  // Spring-loaded tool keys: a tool letter held past a moment lends its tool, and the tool before it returns on release.
  let spring: { code: string; prev: typeof engine.tool; at: number } | null = null;
  const SPRING_HOLD_MS = 400;
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') stage.setSpace(false);
    if (e.code === 'Backslash' && stage.comparing === 'peek') stage.compare(null);
    if (spring && spring.code === e.code) {
      const s = spring;
      spring = null;
      if (performance.now() - s.at >= SPRING_HOLD_MS) engine.setTool(s.prev);
    }
  });
  window.addEventListener('blur', () => { stage.setSpace(false); spring = null; });

  document.addEventListener('paste', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (anyDialogOpen() || target?.closest('input, textarea, [contenteditable="true"]')) return;
    const files = Array.from(e.clipboardData?.files ?? []).filter(isImageFile);
    const marker = e.clipboardData?.getData('text/plain') ?? '';
    if (!files.length && /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(marker)) { e.preventDefault(); void importFiles([new File([marker], 'Pasted.svg', { type: 'image/svg+xml' })]); return; }
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
    const at = stage.docPoint(e.clientX, e.clientY) ?? undefined, ctrlDrop = e.ctrlKey || e.metaKey;
    const onTabs = e.target instanceof Element && !!e.target.closest('.cv-doc-tabs'), shiftDrop = e.shiftKey && !ctrlDrop && !onTabs;
    const tabAt = onTabs ? Array.from(root.querySelectorAll<HTMLElement>('.cv-tab-strip .cv-tab')).filter((t) => { const r = t.getBoundingClientRect(); return e.clientX > r.left + r.width / 2; }).length : -1;
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
      if (shiftDrop) {
        const refs = files.filter((f) => !isProjectFile(f) && isImageFile(f) && f.type.startsWith('image/'));
        if (refs.length) {
          if (!dock.isShown('reference')) dock.toggle('reference');
          document.dispatchEvent(new CustomEvent('nm:add-references', { detail: refs }));
          files.splice(0, files.length, ...files.filter((f) => !refs.includes(f)));
          toast(refs.length === 1 ? `${refs[0].name} added to the Reference panel.` : `${refs.length} pictures added to the Reference panel.`, 'info');
        }
      }
      if (!files.length) return;
      const before = new Set(engine.projects.map((q) => q.id)), was = layersOf();
      const many = files.filter((f) => !isProjectFile(f) && isImageFile(f)).length > 1;
      await importFiles(files, at, ctrlDrop || onTabs || (!engine.current && many) ? 'documents' : 'layers');
      if (onTabs) {
        const list = engine.projects, fresh = list.filter((q) => !before.has(q.id));
        if (fresh.length) {
          const rest = list.filter((q) => before.has(q.id));
          list.splice(0, list.length, ...rest.slice(0, tabAt), ...fresh, ...rest.slice(tabAt));
          engine.emit('projects', null);
        }
      } else if (!ctrlDrop && files.length === 1) enterPlacedTransform(was);
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
    if (!saving.size && !engine.projects.some((p) => p.modified)) return;
    void keepModified();   // a last recovery write begins while the browser asks
    e.preventDefault();
    e.returnValue = '';
  });

  status.setEngine('Engine: checking');
  // The engine's compute device (Phase 18.6): the preference sent, the engine's report shown in Preferences.
  // The requests go one after another, each sending the preference as it is when its turn comes, so the engine ends
  // on the latest choice and a slower earlier answer never overwrites the line a later one wrote.
  let deviceChain: Promise<void> = Promise.resolve(), deviceTurn = 0;
  function syncEngineDevice(): void {
    if (!caps) { dialogs.settings.setEngine('Engine: offline, so the engine processor cannot be set.'); return; }
    const turn = ++deviceTurn;
    deviceChain = deviceChain.then(async () => {
      const r = await api.setCompute(loadPrefs().engineDevice);
      if (turn === deviceTurn) dialogs.settings.setEngine(r ? `Engine: ${r.label} (${r.reason}).` : 'Engine: could not be reached.');
    });
  }
  let noted = false;
  const applyCaps = (c: Capabilities | null): void => {
    caps = c;
    if (c?.pixelBudget) setPixelBudget(c.pixelBudget);   // the largest document, from this computer's memory (1.53.4)
    // What formvis may hold in pixels (1.60.2, DEV_PLAN 26.1): 45% of this computer's memory, leaving the browser and
    // the system theirs (measured: the page was killed at 3.45 GB of 4 GB with the browser itself near 0.9 GB).
    if (c?.memory) { engine.setMemoryBudget(Math.max(512 * 1048576, Math.round(c.memory * 0.45))); status.syncMemory(); }   // the history's limit with it (1.61.3)
    // Older undo kept on the engine's disk past its share of memory (1.60.8, DEV_PLAN 26.3).
    if (c) engine.undoStore = { put: (b) => api.undoPut(b), get: (k) => api.undoGet(k), drop: (k) => api.undoDrop(k), dropMany: (ks) => api.undoDropMany(ks) };
    if (c) Object.assign(giantTiles, { store: engine.undoStore, page: () => engine.pageTiles(), share: () => engine.tileShare() });   // giant layers saved and opened (1.62.8)
    status.setEngine(c ? `Engine ${c.version}${c.desktop ? ' · desktop' : ''}` : 'Engine offline');
    if (!c && !noted) { noted = true; toast(SERVICE_NOTE); }   // once: the one note that the engine service is not running (36.19)
    syncEngineDevice();
    if (c) resendScratch();
    engine.emit('options', null);   // the commands that wait for the service follow it: menus, the palette and the chrome re-read them
  };
  void api.capabilities().then(applyCaps);
  // The service started (or stopped) later: the window re-checks on focus while it is down, and takes the new report.
  onServiceChange(() => { void api.capabilities().then(applyCaps); });
  // The desktop app lists the installed fonts from the shell at once (no permission is asked there);
  // a browser keeps "Load system fonts..." in the Type tool, since Local Font Access asks the user first.
  if ('__TAURI_INTERNALS__' in window) void loadSystemFonts().then((f) => { if (f) engine.emit('options', null); });
  void serviceReady().then((up) => (up ? loadUserFonts() : null)).then((f) => { if (f?.length) engine.emit('options', null); });

  const passes = (c: { id: string }): boolean => /^(zoom-|panel-|screen-|recent-|toggle-)/.test(c.id);
  // 1.55.9 (DEV_PLAN 22.7): at 16 bits and in CMYK every command runs, the ones not on the float model through derive
  // (engine/derive.ts); these are the ones that cannot work in that mode yet. 32 bits joined them in 1.56.8.
  const CMYK_NOT = new Set<string>();
  const DEEP16_NOT = new Set<string>();
  const LAB_NOT = new Set<string>();
  // 1.56.8 (DEV_PLAN 22.10): 32 bits as a denylist too, everything else through derive in linear light; since 1.57.1 it
  // composes on the one compositor, so what remains is the adjustments other than Exposure, Unsharp Mask and Add Noise,
  // the colour models and the profile and proof commands.
  const DEEP32_NOT = new Set<string>();
  // 36.19, the browser build: these commands need the engine service (library, video, AI models, the terminal and
  // agents, ComfyUI and NodeMode, LittleCMS conversions). With it not running they are off, with a title saying why.
  const ENGINE_ONLY = new Set<string>(['save', 'save-as', 'save-as-history', 'save-copy', 'open', 'revert', 'export-tiff', 'export-pdf', 'export-avif', 'convert-profile', 'mode-cmyk', 'mode-convert',
    'remove-bg', 'remove-bg-lite', 'select-subject', 'select-object', 'generative-fill', 'generate-image', 'generative-expand', 'upscale-2x', 'upscale-4x', 'assistant',
    'terminal.toggle', 'terminal.new', 'agent.claude.open', 'agent.chat', 'send-nodemode', 'send-comfyui', 'comfyui-run', 'photomerge', 'merge-hdr', 'manage-plugins', 'reload-plugins', 'open-plugins-folder',
    'import-video', 'video-layer-from-file', 'video-replace-footage', 'video-reload-frame', 'export-mp4', 'render-video']);
  // Relight lights the 8-bit RGB picture beneath it (its shader reads and writes 8-bit RGBA), so other modes and depths say why it waits.
  const relightWhy = (): string => {
    const d = engine.current?.doc;
    if (!d) return '';
    if ((d.mode ?? 'rgb') !== 'rgb') return 'Relight works on RGB documents: Image > Mode > RGB Color first.';
    return (d.depth ?? 8) > 8 ? 'Relight works on 8-bit documents: Image > Mode > 8 Bits/Channel first.' : '';
  };
  commands.blocked = (c) => serviceDown() && ENGINE_ONLY.has(c.id) ? 'Needs the engine service, which is not running (./formvis boot).' : c.id === 'new-relight-layer' || c.id === 'filter-relight' ? relightWhy() : c.id === 'layer-bits-8' || c.id === 'layer-bits-16' ? engine.precisionWhy() : '';
  commands.gate = (c) => engine.current?.doc.mode === 'cmyk' ? !CMYK_NOT.has(c.id) || passes(c)
    : engine.current?.doc.mode === 'lab' ? !LAB_NOT.has(c.id) || passes(c)
    : (engine.current?.doc.depth ?? 8) === 8 || (engine.current?.doc.depth === 16 && !DEEP16_NOT.has(c.id)) || (engine.current?.doc.depth === 32 && (!DEEP32_NOT.has(c.id) || passes(c)));
  // Rebound keys (1.53.4), applied once every command is registered.
  for (const [id, keys] of Object.entries(loadPrefs().shortcuts)) commands.setKeys(id, keys);
  attachCatalogue({
    engine, commands,
    applyFilter: (kind, settings) => {
      if (kind === 'average') { engine.averageFill(); return true; }
      const lib = isLibKind(kind) && !('lib' in settings) ? { lib: { [kind]: settings }, seed: typeof settings.seed === 'number' ? settings.seed : 0 } : settings;
      return dialogs.filter.applySettings(kind as Parameters<typeof dialogs.filter.applySettings>[0], lib);
    },
    applyAdjustment: (kind, data, layer) => dialogs.adjust.applySettings(kind as AdjustmentKind, data as Parameters<typeof dialogs.adjust.applySettings>[1], layer),
    applyRelight: (content) => relight.apply(content),
  });
  (window as unknown as { formvis: unknown }).formvis = { catalogue };
  if (import.meta.env.DEV) Object.assign((window as unknown as { formvis: object }).formvis, { engine, commands, actions, agents, extDock, animation: dialogs.animation, colour: colourView, workers: { bandStats: bandPoolStats, bandsShared, compositeStats, setComposite: setCompositeOnWorkers, compositeOnWorkers, poolSize: bandPoolSize } });

  // Session restore (1.52.4): every open document is kept on this device (a copy per document, rewritten when it
  // changes, is saved, or moves library entry) with the tab order and the active tab, and reopens at the next start.
  // Off, only unsaved documents are kept and formvis asks after a crash, as before.
  const SESSION = 'formvis.session';
  const keptAt = new Map<string, string>();
  const tiledKeptAt = new Map<string, number>();
  let keepTimer = 0;
  async function keepModified(): Promise<void> {
    const whole = loadPrefs().restoreSession;
    for (const p of engine.projects) {
      if (!p.modified && !whole) { if (keptAt.delete(p.id)) await recovery.drop(p.id); continue; }
      const key = `${p.history.revision}:${p.modified}:${p.libraryName ?? ''}:${p.name}`;
      if (keptAt.get(p.id) === key) continue;
      const store = giantTiles.store, giants = p.doc.layers.filter((l) => l.tiled && !l.isGroup);
      if (giants.length && !store) continue;   // tiles are written through the engine's bands
      if (giants.length && (engine.busyWith || Date.now() - (tiledKeptAt.get(p.id) ?? 0) < 45_000)) { keepSoon(); continue; }   // not while a band job changes them, and at most one copy in 45 seconds: a tiled document's takes a while (1.91.0)
      const copies = new Map(giants.map((l) => [l.id, (l.tiled as NonNullable<typeof l.tiled>).clone()]));   // its tiles shared, so the copy is of this instant whatever is drawn while it is written
      try {
        const doc = copies.size ? { ...p.doc, layers: p.doc.layers.map((l) => (copies.has(l.id) ? { ...l, tiled: copies.get(l.id) } : l)) } : p.doc;
        const { manifest, files } = await serialize(doc, p.activeId, engine.pathsOf(p), engine.timelineFor(p));
        if (await recovery.keep({ id: p.id, name: p.name, savedAt: Date.now(), manifest, files, modified: p.modified, libraryName: p.libraryName })) { keptAt.set(p.id, key); if (copies.size) tiledKeptAt.set(p.id, Date.now()); }
      } catch (err) { errorLog.add('Recovery copy', message(err)); }
      finally { if (store) for (const c of copies.values()) c.release(store); }
    }
    for (const id of [...keptAt.keys()]) if (!engine.projects.some((p) => p.id === id)) { keptAt.delete(id); await recovery.drop(id); }
    try {
      if (whole) localStorage.setItem(SESSION, JSON.stringify({ order: engine.projects.map((p) => p.id), active: engine.current?.id ?? null }));
      else localStorage.removeItem(SESSION);
    } catch { /* the order is a convenience */ }
  }
  const keepSoon = (): void => { if (!keepTimer) keepTimer = window.setTimeout(() => { keepTimer = 0; void keepModified(); }, recoveryDelay); };
  let recoveryDelay = loadPrefs().recoverySeconds * 1000;
  /** The last write before the window closes or an update restarts it: waits for the recovery copies, and when that
   *  takes over a few seconds asks Keep waiting or Quit now. True once the copies are written or the person quit. */
  async function finalSave(): Promise<boolean> {
    let done = false;
    const saving = keepModified().then(() => { done = true; }, () => { done = true; });
    for (;;) {
      await Promise.race([saving, new Promise((r) => window.setTimeout(r, 3000))]);
      if (done) return true;
      if (await confirmAction('Still saving', 'formvis is still writing recovery copies of your open documents. Keep waiting, or quit now?', 'Quit now', true, 'Keep waiting')) return true;
    }
  }
  engine.on('history', keepSoon);
  engine.on('projects', keepSoon);
  async function reopen(r: RecoveryRecord, name: string): Promise<ReturnType<typeof engine.addProject> | null> {
    try {
      const byName = new Map(r.files.map((f) => [f.name, f.blob]));
      const giant = (Array.isArray(r.manifest.layers) ? r.manifest.layers : []).some((x) => !!(x as { tiled?: unknown } | null)?.tiled);   // a copy with layers kept in tiles is read back by the engine, a band at a time (1.91.0)
      const { doc, activeId, paths, timeline } = giant
        ? await readOpened(await api.importProject([new File([JSON.stringify(r.manifest)], 'manifest.json'), ...r.files.map((f) => new File([f.blob], f.name))], ['recovery/manifest.json', ...r.files.map((f) => `recovery/images/${f.name}`)]))
        : await deserialize(r.manifest, (n) => { const b = byName.get(n); return b ? Promise.resolve(b) : Promise.reject(new Error(`${n} is missing.`)); });
      const p = engine.addProject(doc, name, activeId);
      if (paths) engine.setPathsOf(p, paths);
      if (timeline) engine.setTimelineFor(p, timeline);
      if (r.modified !== false) p.history.markUnsaved();
      p.libraryName = r.libraryName ?? null;
      return p;
    } catch (err) { toast(`${r.name}: ${message(err)}`, 'error'); return null; }
  }
  async function offerRecovery(): Promise<void> {
    const found = await recovery.list();
    if (!found.length) return;
    await earlier.add(found);   // kept for File > Earlier States before the copies are reopened, offered or cleared
    if (loadPrefs().restoreSession && !engine.projects.length) {
      let meta: { order?: string[]; active?: string | null } = {};
      try { meta = JSON.parse(localStorage.getItem(SESSION) ?? '{}') as typeof meta; } catch { /* by age */ }
      const at = (id: string): number => { const i = meta.order?.indexOf(id) ?? -1; return i < 0 ? 1e9 : i; };
      const ordered = [...found].sort((a, b) => at(a.id) - at(b.id) || a.savedAt - b.savedAt);
      let active: string | null = null, n = 0;
      for (const r of ordered) { const p = await reopen(r, r.name); if (p) { n++; if (r.id === meta.active) active = p.id; } }
      if (active) engine.switchTo(active);
      engine.emit('projects', null);
      // Fresh copies first, then the last session's removed: a crash in between loses nothing.
      await keepModified();
      for (const r of await recovery.list()) if (!engine.projects.some((p) => p.id === r.id)) await recovery.drop(r.id);
      if (n) toast(`Reopened ${n === 1 ? 'the document' : `${n} documents`} from last time.`, 'info');
      return;
    }
    const lost = found.filter((r) => r.modified !== false);
    for (const r of found) if (r.modified === false) await recovery.drop(r.id);
    if (!lost.length) return;
    const names = lost.map((r) => r.name).join(', ');
    if (!(await confirmAction('Recover unsaved work?', `formvis closed with unsaved changes in ${names}. Open them again?`, 'Recover'))) { await recovery.clear(); return; }
    for (const r of lost) await reopen(r, `${r.name} (recovered)`);
    engine.emit('projects', null);
    await recovery.clear();
  }
  if (import.meta.env.DEV) Object.assign((window as unknown as { formvis: object }).formvis, { errorLog, comfyDot, keepModified, finalSave, offerRecovery, setRecoveryDelay: (ms: number) => { recoveryDelay = ms; } });

  // The desktop shell hands the page the files the system opened formvis with (double-clicked, or a second launch) and
  // the window's close and quit requests; the app exits only after every unsaved document is saved or discarded.
  if (hasPanels()) {
    // A system file dialog that has not come back after a while may never come (a failing desktop file portal): the
    // person can stop waiting, and the shell says what the dialogs need here.
    dialogWatch.slow = (stop) => toast('The system file dialog has not come back. If no dialog is on screen, the desktop file portal may have failed the request.', 'error', {
      ms: 0,
      actions: [{ label: 'Stop waiting', run: () => { stop(); void fileDialogReport().then((r) => { toast(`File dialog report: ${r}`, 'error', { ms: 0 }); }).catch(() => undefined); } }],
    });
    void listenShell({
      open: (paths) => openPaths(paths),
      // Launch arguments (--command, --action, --script) run one after another; a failure is a notice and the rest still run.
      run: async (runs) => {
        for (const r of runs) {
          try {
            if (r.kind === 'error') throw new Error(r.value);
            const { ran } = r.kind === 'command' ? await commands.call(r.value)
              : r.kind === 'action' ? await commands.call('play-action', { name: r.value })
                : await commands.call('script-browse', { source: r.value });
            if (!ran) throw new Error(r.kind === 'command' ? `There is no command "${r.value}" that can run now.` : r.kind === 'action' ? `The action "${r.value}" cannot play without an open document.` : 'The script cannot run now.');
          } catch (err) { toast(`Launch ${r.kind}: ${err instanceof Error ? err.message : String(err)}`, 'error'); }
        }
      },
      exitRequested: () => { void exitApp(); },
    }).catch(() => undefined);
  }

  const faces = Promise.all(['400', '500', '600'].map((w) => document.fonts.load(`${w} 12px Inter`))).catch(() => undefined);
  // What's New once after an update, never again for the same version: not on a first start (nothing was updated), not
  // for an automated browser, and after any recovery question has been answered.
  function offerWhatsNew(): void {
    const p = loadPrefs();
    if (!p.whatsNewAuto || p.whatsNewSeen === VERSION || !RELEASES.length) return;
    if (freshProfile && p.whatsNewSeen === '') { updatePrefs({ whatsNewSeen: VERSION }); return; }
    if (navigator.webdriver || anyDialogOpen()) return;
    updatePrefs({ whatsNewSeen: VERSION });
    whatsNew.show();
  }
  void Promise.race([faces, new Promise((r) => window.setTimeout(r, 2500))]).then(() => requestAnimationFrame(() => { revealApp(); void offerRecovery().then(() => { offerWhatsNew(); }); }));
}
