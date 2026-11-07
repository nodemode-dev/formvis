export type KernelChunk = 'mask' | 'tone' | 'blur' | 'resample' | 'dither' | 'heal' | 'noise' | 'patch' | 'color' | 'blend' | 'transfer';
export interface Taps { start: Int32Array; offs: Uint32Array; weights: Float32Array }

const no = (): boolean => false;
const none = (): null => null;

export const warmKernels = (_name: KernelChunk): Promise<boolean> => Promise.resolve(false);
export const kernelChunk = none;
export const setKernelsEnabled = (_on: boolean): void => undefined;
export const kernelStats = (): { enabled: boolean; chunks: Record<string, never> } => ({ enabled: false, chunks: {} });
export const wasmLut = no;
export const wasmInvert = no;
export const wasmDesaturate = no;
export const wasmGradientRamp = no;
export const wasmTableAll = no;
export const wasmWand = none;
export const wasmAntialias = none;
export const wasmEnhanceEdge = none;
export const wasmSensitivity = none;
export const wasmGaussian = no;
export const wasmResample = none;
export const wasmDither = no;
export const wasmNoiseUniform = no;
export const wasmHealFull = no;
export const wasmMembrane = no;
export const wasmPatchCorrect = no;
export const wasmHsvCube = no;
export const wasmGrain = no;
export const wasmBlend = no;
export const wasmTransfer = no;
