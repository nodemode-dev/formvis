import { clamp } from '../engine';
import { el, patchList, q, setHidden, setText } from './dom';
import { icon } from './icons';

interface Ref { id: string; name: string; url: string; w: number; h: number }

/** The Reference panel (Window menu, DEV_PLAN 36.5): images to keep beside the work. Add (a file picker) or drop images
 *  on the panel; each shows as a thumbnail; clicking one shows it larger with the wheel to zoom and a drag to pan;
 *  Remove takes it out. The images are kept in memory for this session only: they are not saved with any document and are
 *  gone when formvis closes. Built once; adding or removing patches the list in place. */
export function createReferencePanel(root: HTMLElement): void {
  root.insertAdjacentHTML('beforeend',
    '<section class="cv-preset-panel cv-reference" aria-label="Reference">' +
    `<div class="cv-panel-head"><span class="cv-comps-title">${icon('layers', 14)}<span>Reference</span></span><span></span><span class="cv-comps-count"></span></div>` +
    `<div class="cv-ref-bar"><button class="cv-btn" type="button" data-act="add" title="Add reference images">${icon('plus', 14)}<span>Add</span></button>` +
    `<button class="cv-btn" type="button" data-act="remove" title="Remove the selected image" disabled>${icon('delete', 14)}<span>Remove</span></button>` +
    '<input type="file" accept="image/*" multiple hidden aria-label="Add reference images"></div>' +
    '<div class="cv-styles-grid cv-ref-list" role="listbox" aria-label="Reference images"></div>' +
    '<div class="cv-ref-view" hidden tabindex="0" aria-label="Selected reference image: scroll to zoom, drag to pan"><img class="cv-ref-img" alt="" draggable="false"></div>' +
    '<p class="cv-ref-note">Drop images here or press Add. They are kept in memory for this session only.</p></section>');
  const sec = q(root, 'section.cv-reference');
  const list = q(sec, '.cv-ref-list'), view = q(sec, '.cv-ref-view'), img = q<HTMLImageElement>(sec, '.cv-ref-img');
  const input = q<HTMLInputElement>(sec, 'input[type="file"]'), count = q(sec, '.cv-comps-count'), remove = q<HTMLButtonElement>(sec, '[data-act="remove"]');
  const refs: Ref[] = [];
  let active: string | null = null, zoom = 1, ox = 0, oy = 0, seq = 0;

  const paint = (): void => { img.style.transform = `translate(${ox}px, ${oy}px) scale(${zoom})`; };
  const fit = (r: Ref): void => {
    const vw = view.clientWidth || 200, vh = view.clientHeight || 200;
    zoom = Math.min(vw / r.w, vh / r.h, 1);
    ox = (vw - r.w * zoom) / 2; oy = (vh - r.h * zoom) / 2;
    paint();
  };
  const sync = (): void => {
    patchList(list, refs, {
      key: (r) => r.id,
      create: (r) => {
        const b = el<HTMLButtonElement>('<button class="cv-style-tile cv-ref-tile" type="button" role="option"><img alt="" draggable="false"><span class="cv-style-name"></span></button>');
        (q(b, 'img') as HTMLImageElement).src = r.url;
        b.title = r.name;
        return b;
      },
      update: (node, r) => {
        setText(q(node, '.cv-style-name'), r.name);
        const on = r.id === active;
        node.classList.toggle('is-active', on);
        node.setAttribute('aria-selected', String(on));
      },
    });
    setText(count, refs.length ? String(refs.length) : '');
    const cur = refs.find((r) => r.id === active) ?? null;
    setHidden(view, !cur);
    if (remove.disabled !== !cur) remove.disabled = !cur;
    if (cur && img.dataset.id !== cur.id) { img.dataset.id = cur.id; img.src = cur.url; fit(cur); }
  };

  const add = (files: Iterable<File>): void => {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const url = URL.createObjectURL(f), probe = new Image();
      const id = `ref${++seq}`;
      probe.onload = () => { refs.push({ id, name: f.name, url, w: probe.naturalWidth || 1, h: probe.naturalHeight || 1 }); active = id; sync(); };
      probe.onerror = () => URL.revokeObjectURL(url);
      probe.src = url;
    }
  };

  q(sec, '[data-act="add"]').addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files) add(Array.from(input.files)); input.value = ''; });
  remove.addEventListener('click', () => {
    const i = refs.findIndex((r) => r.id === active);
    if (i < 0) return;
    URL.revokeObjectURL(refs[i].url);
    refs.splice(i, 1);
    active = refs.length ? refs[Math.min(i, refs.length - 1)].id : null;
    if (!active) { img.removeAttribute('src'); delete img.dataset.id; }
    sync();
  });
  list.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-key]') : null;
    if (!t?.dataset.key) return;
    active = t.dataset.key;
    sync();
  });
  sec.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); sec.classList.add('is-drop'); } });
  sec.addEventListener('dragleave', () => sec.classList.remove('is-drop'));
  sec.addEventListener('drop', (e) => { e.preventDefault(); sec.classList.remove('is-drop'); if (e.dataTransfer) add(Array.from(e.dataTransfer.files)); });

  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = view.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, next = clamp(zoom * Math.exp(-e.deltaY * 0.0015), 0.05, 32);
    ox = px - (px - ox) * (next / zoom); oy = py - (py - oy) * (next / zoom); zoom = next;
    paint();
  }, { passive: false });
  let drag: { x: number; y: number; ox: number; oy: number } | null = null;
  view.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; view.setPointerCapture(e.pointerId); view.classList.add('is-panning'); });
  view.addEventListener('pointermove', (e) => { if (!drag) return; ox = drag.ox + e.clientX - drag.x; oy = drag.oy + e.clientY - drag.y; paint(); });
  const end = (): void => { drag = null; view.classList.remove('is-panning'); };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  view.addEventListener('dblclick', () => { const cur = refs.find((r) => r.id === active); if (cur) fit(cur); });
}
