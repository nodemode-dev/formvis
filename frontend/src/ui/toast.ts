import { el } from './dom';

export function toast(text: string, kind: 'info' | 'error' = 'info'): void {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = el(`<div class="cv-toast${kind === 'error' ? ' is-error' : ''}" role="status"></div>`);
  node.textContent = text;
  root.appendChild(node);
  while (root.children.length > 4) root.firstElementChild?.remove();
  window.setTimeout(() => node.remove(), kind === 'error' ? 6000 : 3600);
}
