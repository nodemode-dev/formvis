import './links.css';

const DEMOS: ReadonlyArray<{ href: string; label: string; current?: boolean }> = [
  { href: './index.html', label: 'Paint', current: true },
  { href: '../demos/retouch/index.html', label: 'Retouch' },
  { href: '../demos/design/index.html', label: 'Design' },
];

export function mountLinks(): void {
  const nav = document.createElement('nav');
  nav.className = 'dz-links';
  nav.setAttribute('aria-label', 'FormVis demos');
  const head = document.createElement('span');
  head.textContent = 'Demos';
  nav.append(head);
  for (const d of DEMOS) {
    const a = document.createElement('a');
    a.href = d.href;
    a.textContent = d.label;
    if (d.current) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  document.body.append(nav);
}
