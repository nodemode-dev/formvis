import type { Paint } from '../extensions/registry';

export interface StagePaint extends Paint { checkerA: string; checkerB: string; grid: string; edge: string }

let cache: StagePaint | null = null;

export function paint(): StagePaint {
  if (cache) return cache;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string): string => cs.getPropertyValue(name).trim();
  cache = {
    accent: v('--accent-color'), handle: v('--cv-handle-fill'), antsA: v('--cv-ants-a'), antsB: v('--cv-ants-b'),
    checkerA: v('--cv-checker-a'), checkerB: v('--cv-checker-b'), grid: v('--cv-pixel-grid'), edge: v('--cv-doc-edge'),
  };
  return cache;
}

export function invalidatePaint(): void { cache = null; }
