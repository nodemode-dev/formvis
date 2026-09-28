//! The renderer's mirror of the app's document: each layer's pixels as tiles, adjustment tables, and the stack (order
//! and properties). The app stays the document's owner and sends changes (put_pixels, put_table, set_stack, remove);
//! the renderer blends and presents what the mirror holds. Rules as in the app: hidden layers draw nothing; a clipped
//! layer shows through its base at the base's opacity and through the base's mask, and nothing when the base is hidden.

use crate::composite::{Affine, Lut, Stack};
use crate::{Gpu, TiledLayer};
use std::collections::HashMap;

/// One entry of the stack, bottom first.
#[derive(Clone, Debug, PartialEq)]
pub struct LayerSpec {
    pub id: String,
    /// formvis's blend mode index (0 Normal to 26 Luminosity).
    pub mode: u32,
    pub opacity: f32,
    pub visible: bool,
    /// Where the layer's own pixels land in the document; None: its pixels are the document's.
    pub transform: Option<Affine>,
    /// The id of a layer whose alpha is this layer's mask.
    pub mask: Option<String>,
    /// The id of the base this layer is clipped to.
    pub clip_to: Option<String>,
    /// An adjustment layer: the id of its table (put_table); it draws that table over everything beneath.
    pub table: Option<String>,
}

impl LayerSpec {
    pub fn pixels(id: &str) -> LayerSpec {
        LayerSpec { id: id.to_string(), mode: 0, opacity: 1.0, visible: true, transform: None, mask: None, clip_to: None, table: None }
    }
}

pub struct Document {
    pub width: u32,
    pub height: u32,
    layers: HashMap<String, TiledLayer>,
    tables: HashMap<String, Lut>,
    order: Vec<LayerSpec>,
}

impl Document {
    pub fn new(width: u32, height: u32) -> Document {
        Document { width, height, layers: HashMap::new(), tables: HashMap::new(), order: Vec::new() }
    }

    /// Pixels for layer `id` (its own size `lw` by `lh`), straight RGBA8, w by h at (x, y) in the layer's own pixels. A
    /// layer seen for the first time, or at a new size, starts transparent.
    #[allow(clippy::too_many_arguments)]
    pub fn put_pixels(&mut self, gpu: &Gpu, id: &str, lw: u32, lh: u32, x: u32, y: u32, w: u32, h: u32, rgba: &[u8]) {
        let fresh = self.layers.get(id).is_none_or(|l| l.width != lw || l.height != lh);
        if fresh {
            self.layers.insert(id.to_string(), TiledLayer::new(lw, lh));
        }
        if w > 0 && h > 0 {
            self.layers.get_mut(id).expect("inserted").write(gpu, x, y, w, h, rgba);
        }
    }

    pub fn put_table(&mut self, gpu: &Gpu, id: &str, red: &[u8; 256], green: &[u8; 256], blue: &[u8; 256]) {
        self.tables.insert(id.to_string(), Lut::new(gpu, red, green, blue));
    }

    pub fn set_stack(&mut self, order: Vec<LayerSpec>) {
        self.order = order;
    }

    /// Forgets a layer's pixels or a table.
    pub fn remove(&mut self, id: &str) {
        self.layers.remove(id);
        self.tables.remove(id);
    }

    pub fn layer(&self, id: &str) -> Option<&TiledLayer> {
        self.layers.get(id)
    }

    /// The stack to blend: what each visible entry draws, bottom first. Entries whose pixels or table have not arrived
    /// are left out, as are clipped layers whose base is hidden or missing.
    pub fn stack(&self) -> Vec<Stack<'_>> {
        let spec = |id: &str| self.order.iter().find(|s| s.id == id);
        let mut out = Vec::new();
        for s in self.order.iter().filter(|s| s.visible) {
            let mut item = if let Some(t) = &s.table {
                let Some(lut) = self.tables.get(t) else { continue };
                Stack::adjustment(lut, s.opacity)
            } else {
                let Some(pixels) = self.layers.get(&s.id) else { continue };
                let mut p = Stack::new(pixels, s.mode, s.opacity);
                if let Some(t) = s.transform {
                    p = p.transformed(t);
                }
                p
            };
            if let Some(m) = s.mask.as_deref().and_then(|m| self.layers.get(m)) {
                item = item.masked(m);
            }
            if let Some(base_id) = &s.clip_to {
                let (Some(base_spec), Some(base)) = (spec(base_id), self.layers.get(base_id)) else { continue };
                if !base_spec.visible {
                    continue;
                }
                let base_mask = base_spec.mask.as_deref().and_then(|m| self.layers.get(m));
                item = item.clipped_to(base, base_spec.opacity, base_mask);
            }
            out.push(item);
        }
        out
    }
}
