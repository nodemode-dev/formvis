import { Viewport } from './viewport';
import { uid } from './types';

/** A floating panel's rectangle, in the stage column's pixels. */
export interface FloatRect { x: number; y: number; w: number; h: number }

/** A further view of an open document (Window > Arrange > New Window for Document, Float in Window; DEV_PLAN 36.16).
 *  It points at a project by id and carries only view state: its own zoom, pan and rotation (a Viewport the Stage
 *  never reads). The project, its layers and its history are shared, so an edit in any view shows in all. A project's
 *  own tab view stays the one `Project.viewport` drives; a document with no DocView behaves as before. */
export class DocView {
  readonly id = uid();
  readonly viewport = new Viewport();
  constructor(
    readonly projectId: string,
    /** Its number in the title, "name (2)" and up. */
    readonly n: number,
    /** Set while it floats over the tiles; null while it sits in a tile. */
    public floating: FloatRect | null,
  ) {}

  /** Sizes the view's box and, while it is fitted, fits the document in it. */
  fitIn(w: number, h: number, dw: number, dh: number): void {
    const v = this.viewport;
    if (v.width === w && v.height === h && !v.fitted) return;
    if (v.fitted) {
      const margin = 8;
      const z = Math.min((w - margin * 2) / dw, (h - margin * 2) / dh);
      v.zoom = Math.min(Viewport.MAX, Math.max(Viewport.MIN, Number.isFinite(z) && z > 0 ? z : Viewport.MIN));
      v.panX = Math.round((w - dw * v.zoom) / 2);
      v.panY = Math.round((h - dh * v.zoom) / 2);
      v.width = w;
      v.height = h;
    } else v.resize(w, h);
  }
}

/** The views of the open documents beyond each one's tab. */
export class DocViews {
  readonly list: DocView[] = [];

  of(projectId: string): DocView[] { return this.list.filter((v) => v.projectId === projectId); }

  find(id: string): DocView | null { return this.list.find((v) => v.id === id) ?? null; }

  open(projectId: string, rotation: number, floating: FloatRect | null): DocView {
    const used = new Set(this.of(projectId).map((v) => v.n));
    let n = 2;
    while (used.has(n)) n++;
    const v = new DocView(projectId, n, floating);
    v.viewport.rotation = rotation;
    this.list.push(v);
    return v;
  }

  close(id: string): boolean {
    const i = this.list.findIndex((v) => v.id === id);
    if (i < 0) return false;
    this.list.splice(i, 1);
    return true;
  }

  closeAllOf(projectId: string): void {
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].projectId === projectId) this.list.splice(i, 1);
  }
}
