//! Layers blended on the GPU tile by tile, in formvis's 27 blend modes (the same WGSL functions as the web renderer, in
//! blend.wgsl). Each output tile is built bottom to top between two textures, so the whole image never has to fit one
//! texture; a layer with no tile there is transparent there and is skipped. The fragment shader follows the web
//! renderer's layer blend (frontend/src/gpu/blend-wgsl.ts): the source unpremultiplied in float, the per-pixel modes'
//! 8-bit rounding, Dissolve on the document pixel, Linear Dodge additive, and the source over the backdrop. The result is
//! straight RGBA8. Transforms, masks and clipping follow in the next parts.

use crate::{read_tile, Gpu, TiledLayer, FORMAT, TILE};

const HEAD: &str = r#"
struct Comp { inv0: vec4<f32>, inv1: vec4<f32>, tile_origin: vec2<f32>, opacity: f32, mode: u32, has_mask: u32, has_clip: u32, base_opacity: f32, base_has_mask: u32, stage_origin: vec2<f32>, stage_size: vec2<f32>, layer_size: vec2<f32>, transformed: u32, pad: u32 };
@group(0) @binding(0) var backdrop: texture_2d<f32>;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var<uniform> comp: Comp;
@group(0) @binding(3) var mask_tile: texture_2d<f32>;
@group(0) @binding(4) var base_tile: texture_2d<f32>;
@group(0) @binding(5) var base_mask_tile: texture_2d<f32>;
@group(0) @binding(6) var smp: sampler;

/// A mask's coverage at a pixel: its alpha (a missing mask tile is bound as white, so it reveals, as an untouched mask).
fn mask_cover(has: u32, t: texture_2d<f32>, px: vec2<i32>) -> f32 {
  if (has == 0u) { return 1.0; }
  return textureLoad(t, px, 0).a;
}

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4<f32>(p[i], 0.0, 1.0);
}
"#;

const FS: &str = r#"
@fragment fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let px = vec2<i32>(floor(pos.xy));
  let bd = textureLoad(backdrop, px, 0);
  // Coverage: the layer's mask, and for a clipped layer its base's alpha at the base's opacity through the base's mask.
  var cov = mask_cover(comp.has_mask, mask_tile, px);
  if (comp.has_clip == 1u) {
    cov = cov * textureLoad(base_tile, px, 0).a * comp.base_opacity * mask_cover(comp.base_has_mask, base_mask_tile, px);
  }
  // An adjustment layer as a lookup table (mode 100), as the web renderer applies it: each backdrop channel looked up by
  // its 8-bit value in the 256 by 1 table bound as the source, mixed in by opacity and coverage; alpha kept.
  if (comp.mode == 100u) {
    if (bd.a <= 0.0) { return bd; }
    let i = vec3<i32>(round(bd.rgb * 255.0));
    let t = vec3<f32>(textureLoad(source, vec2<i32>(i.r, 0), 0).r, textureLoad(source, vec2<i32>(i.g, 0), 0).g, textureLoad(source, vec2<i32>(i.b, 0), 0).b);
    return vec4<f32>(bd.rgb + (t - bd.rgb) * comp.opacity * cov, bd.a);
  }
  // A 3D table (mode 101), as engine/lut.ts lut3Sample computes it: the eight nodes around the 8-bit colour, weighted per
  // axis, rounded to 8 bits, then mixed in by opacity and coverage; alpha kept.
  if (comp.mode == 101u) {
    if (bd.a <= 0.0) { return bd; }
    let v = round(bd.rgb * 255.0) / 5.0;
    let b0 = min(vec3<i32>(floor(v)), vec3<i32>(50));
    let f = v - vec3<f32>(b0);
    var acc = vec3<f32>(0.0);
    for (var k = 0; k < 8; k++) {
      let o = vec3<i32>(k & 1, (k >> 1) & 1, (k >> 2) & 1);
      let w = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1) * select(1.0 - f.z, f.z, o.z == 1);
      let c = b0 + o;
      acc += w * textureLoad(source, vec2<i32>(c.x + c.y * 52, c.z), 0).rgb;
    }
    let t3 = round(acc * 255.0) / 255.0;
    return vec4<f32>(bd.rgb + (t3 - bd.rgb) * comp.opacity * cov, bd.a);
  }
  var s0 = vec4<f32>(0.0);
  if (comp.transformed == 1u) {
    // The document pixel's centre, back into the layer's own pixels; outside the layer it is transparent.
    let p = vec3<f32>(comp.tile_origin + pos.xy, 1.0);
    let q = vec2<f32>(dot(comp.inv0.xyz, p), dot(comp.inv1.xyz, p));
    if (q.x < 0.0 || q.y < 0.0 || q.x >= comp.layer_size.x || q.y >= comp.layer_size.y) { return bd; }
    // The staging texture holds the layer's pixels around this tile's footprint, contiguous across the layer's tile
    // edges, so bilinear sampling (on the premultiplied values) has no seams.
    s0 = textureSampleLevel(source, smp, (q - comp.stage_origin) / comp.stage_size, 0.0);
  } else {
    s0 = textureLoad(source, px, 0);
  }
  var sc = s0;
  if (s0.a > 0.0) { sc = vec4<f32>(s0.rgb / s0.a, s0.a); }
  let m = comp.mode;
  if (m == 1u || m == 5u || m == 6u || m == 11u || (m >= 15u && m <= 18u) || m == 21u || m == 22u || m >= 27u) {
    sc = vec4<f32>(floor(sc.rgb * 255.0 + 0.5005) / 255.0, sc.a);
  }
  let sa = sc.a * comp.opacity * cov;
  if (sa <= 0.0) { return bd; }
  let ab = bd.a;
  if (m == 1u) {
    let doc = vec2<i32>(comp.tile_origin) + px;
    if (dissolveNoise(doc.x, doc.y) >= sa) { return bd; }
    return vec4<f32>(sc.rgb, 1.0);
  }
  if (m == 10u) {
    let lo = min(1.0, sa + ab);
    let lc = min(vec3<f32>(1.0), sc.rgb * sa + bd.rgb * ab);
    return vec4<f32>(lc / max(lo, 1e-6), lo);
  }
  let ao = sa + ab * (1.0 - sa);
  if (ao <= 0.0) { return vec4<f32>(0.0); }
  var r = sc.rgb;
  if (m != 0u) { r = blend(m, bd.rgb, sc.rgb); }
  let co = (sa * (1.0 - ab) * sc.rgb + sa * ab * r + (1.0 - sa) * ab * bd.rgb) / ao;
  return floor(vec4<f32>(co, ao) * 255.0 + 0.5005) / 255.0;
}
"#;

/// What a layer in a stack draws: its pixels, or (an adjustment layer) a lookup table applied to what is beneath.
pub enum Source<'a> {
    Pixels(&'a TiledLayer),
    Table(&'a Lut),
}

/// The layer a clipped layer shows through: its pixels, its opacity and its mask.
pub struct Clip<'a> {
    pub base: &'a TiledLayer,
    pub opacity: f32,
    pub mask: Option<&'a TiledLayer>,
}

/// A layer's placement: its own pixel (x, y) lands at (a x + b y + c, d x + e y + f) in the document.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Affine {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub e: f32,
    pub f: f32,
}

impl Affine {
    pub fn translate(x: f32, y: f32) -> Affine {
        Affine { a: 1.0, b: 0.0, c: x, d: 0.0, e: 1.0, f: y }
    }
    /// Turned by `degrees` (clockwise on screen, y pointing down) about the layer point (cx, cy), which stays put.
    pub fn rotate_about(degrees: f32, cx: f32, cy: f32) -> Affine {
        let (s, k) = degrees.to_radians().sin_cos();
        Affine { a: k, b: -s, c: cx - k * cx + s * cy, d: s, e: k, f: cy - s * cx - k * cy }
    }
    /// Scaled by (sx, sy) about the layer point (cx, cy).
    pub fn scale_about(sx: f32, sy: f32, cx: f32, cy: f32) -> Affine {
        Affine { a: sx, b: 0.0, c: cx - sx * cx, d: 0.0, e: sy, f: cy - sy * cy }
    }
    pub fn apply(&self, x: f32, y: f32) -> (f32, f32) {
        (self.a * x + self.b * y + self.c, self.d * x + self.e * y + self.f)
    }
    pub fn inverse(&self) -> Affine {
        let det = self.a * self.e - self.b * self.d;
        let (a, b, d, e) = (self.e / det, -self.b / det, -self.d / det, self.a / det);
        Affine { a, b, c: -(a * self.c + b * self.f), d, e, f: -(d * self.c + e * self.f) }
    }
}

/// One layer in a stack: what it draws, its blend mode (formvis's index, 0 Normal to 26 Luminosity), its opacity, its
/// mask (coverage in the mask's alpha; a tile the mask lacks reveals), the base it is clipped to, and its placement
/// (none: its pixels are the document's). Masks are in document space for now; a mask with its own placement comes later.
pub struct Stack<'a> {
    pub source: Source<'a>,
    pub mode: u32,
    pub opacity: f32,
    pub mask: Option<&'a TiledLayer>,
    pub clip: Option<Clip<'a>>,
    pub transform: Option<Affine>,
}

impl<'a> Stack<'a> {
    pub fn new(layer: &'a TiledLayer, mode: u32, opacity: f32) -> Stack<'a> {
        Stack { source: Source::Pixels(layer), mode, opacity, mask: None, clip: None, transform: None }
    }
    /// An adjustment layer: its table applied to everything beneath, at `opacity`.
    pub fn adjustment(table: &'a Lut, opacity: f32) -> Stack<'a> {
        Stack { source: Source::Table(table), mode: if table.three { 101 } else { 100 }, opacity, mask: None, clip: None, transform: None }
    }
    /// Placed in the document by `t` (its tiles are in the layer's own pixels).
    pub fn transformed(mut self, t: Affine) -> Stack<'a> {
        self.transform = Some(t);
        self
    }
    pub fn masked(mut self, mask: &'a TiledLayer) -> Stack<'a> {
        self.mask = Some(mask);
        self
    }
    pub fn clipped_to(mut self, base: &'a TiledLayer, opacity: f32, mask: Option<&'a TiledLayer>) -> Stack<'a> {
        self.clip = Some(Clip { base, opacity, mask });
        self
    }
}

/// An adjustment's lookup table: 256 output values for each of red, green and blue, as a 256 by 1 texture.
pub struct Lut {
    texture: wgpu::Texture,
    three: bool,
}

/// A 3D table's lattice: 52 nodes a side, a node every 5 levels, packed as x = r + g * 52, y = b.
pub const LUT3_SIDE: u32 = 52;

impl Lut {
    /// A 3D table from its 52 by 52 by 52 nodes as straight RGBA8, in the order frontend/src/engine/lut.ts packs them.
    pub fn new3(gpu: &Gpu, rgba: &[u8]) -> Lut {
        let n = LUT3_SIDE;
        let size = wgpu::Extent3d { width: n * n, height: n, depth_or_array_layers: 1 };
        let texture = gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("lut3"),
            size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: FORMAT,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        gpu.queue.write_texture(texture.as_image_copy(), rgba, wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(n * n * 4), rows_per_image: Some(n) }, size);
        Lut { texture, three: true }
    }

    pub fn new(gpu: &Gpu, red: &[u8; 256], green: &[u8; 256], blue: &[u8; 256]) -> Lut {
        let texture = gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("lut"),
            size: wgpu::Extent3d { width: 256, height: 1, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: FORMAT,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let data: Vec<u8> = (0..256).flat_map(|i| [red[i], green[i], blue[i], 255]).collect();
        gpu.queue.write_texture(texture.as_image_copy(), &data, wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(1024), rows_per_image: Some(1) }, wgpu::Extent3d { width: 256, height: 1, depth_or_array_layers: 1 });
        Lut { texture, three: false }
    }
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct Comp {
    inv0: [f32; 4],
    inv1: [f32; 4],
    tile_origin: [f32; 2],
    opacity: f32,
    mode: u32,
    has_mask: u32,
    has_clip: u32,
    base_opacity: f32,
    base_has_mask: u32,
    stage_origin: [f32; 2],
    stage_size: [f32; 2],
    layer_size: [f32; 2],
    transformed: u32,
    pad: u32,
}
const _: () = assert!(std::mem::size_of::<Comp>() == 96, "the uniform must match the WGSL struct's 96 bytes");

fn tile_texture(gpu: &Gpu) -> wgpu::Texture {
    gpu.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("stack"),
        size: wgpu::Extent3d { width: TILE, height: TILE, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    })
}

type Placement = ([f32; 2], [f32; 2], Affine, [f32; 2]);

/// The blend pass, built once and used for every tile.
pub struct Blender {
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    white: wgpu::Texture,
    sampler: wgpu::Sampler,
}

impl Blender {
    pub fn new(gpu: &Gpu) -> Blender {
        let source = format!("{HEAD}{}{FS}", include_str!("blend.wgsl"));
        let module = gpu.device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("blend"), source: wgpu::ShaderSource::Wgsl(source.into()) });
        let tex_entry = |binding| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: false }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
            count: None,
        };
        let layout = gpu.device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("blend"),
            entries: &[
                tex_entry(0),
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
                tex_entry(3),
                tex_entry(4),
                tex_entry(5),
                wgpu::BindGroupLayoutEntry { binding: 6, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
            ],
        });
        let pl = gpu.device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("blend"), bind_group_layouts: &[Some(&layout)], ..Default::default() });
        let pipeline = gpu.device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("blend"),
            layout: Some(&pl),
            vertex: wgpu::VertexState { module: &module, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &module, entry_point: Some("fs"), targets: &[Some(wgpu::ColorTargetState { format: FORMAT, blend: None, write_mask: wgpu::ColorWrites::ALL })], compilation_options: Default::default() }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        let white = gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("white"),
            size: wgpu::Extent3d { width: TILE, height: TILE, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: FORMAT,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        gpu.queue.write_texture(white.as_image_copy(), &vec![255u8; (TILE * TILE * 4) as usize], wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(TILE * 4), rows_per_image: Some(TILE) }, wgpu::Extent3d { width: TILE, height: TILE, depth_or_array_layers: 1 });
        let sampler = gpu.device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("placed layer"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        Blender { pipeline, layout, white, sampler }
    }

    /// The layer's pixels around one output tile's footprint (its corners mapped back through the placement, widened by a
    /// pixel for the bilinear filter, clamped to the layer), copied into one texture so sampling crosses the layer's tile
    /// edges without seams; with the footprint's origin and size in the layer's pixels. None when the footprint misses
    /// the layer, or is wider than the GPU's largest texture (a scale below about TILE / that limit, 1.6 percent at 16,384,
    /// which needs mipmapped sampling, not done yet).
    fn stage(&self, gpu: &Gpu, enc: &mut wgpu::CommandEncoder, layer: &TiledLayer, t: &Affine, tx: u32, ty: u32) -> Option<(wgpu::Texture, [f32; 2], [f32; 2])> {
        let inv = t.inverse();
        let (ox, oy, s) = ((tx * TILE) as f32, (ty * TILE) as f32, TILE as f32);
        let pts = [(ox, oy), (ox + s, oy), (ox, oy + s), (ox + s, oy + s)].map(|(x, y)| inv.apply(x, y));
        let (mut lx, mut ly, mut hx, mut hy) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for (x, y) in pts {
            lx = lx.min(x);
            ly = ly.min(y);
            hx = hx.max(x);
            hy = hy.max(y);
        }
        let (x0, y0) = ((lx.floor() - 1.0).max(0.0) as u32, (ly.floor() - 1.0).max(0.0) as u32);
        let (x1, y1) = ((hx.ceil() + 1.0).min(layer.width as f32).max(0.0) as u32, (hy.ceil() + 1.0).min(layer.height as f32).max(0.0) as u32);
        if x1 <= x0 || y1 <= y0 {
            return None;
        }
        let (w, h) = (x1 - x0, y1 - y0);
        if w > gpu.limits.max_texture_dimension_2d || h > gpu.limits.max_texture_dimension_2d {
            return None;
        }
        let stage = gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("stage"),
            size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        {
            // Cleared first, so a tile the layer lacks reads as transparent.
            let view = stage.create_view(&Default::default());
            let _ = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("stage"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &view, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store } })],
                ..Default::default()
            });
        }
        for sy in y0 / TILE..=(y1 - 1) / TILE {
            for sx in x0 / TILE..=(x1 - 1) / TILE {
                let Some(tile) = layer.tile_at(sx, sy) else { continue };
                let (rx0, ry0) = (x0.max(sx * TILE), y0.max(sy * TILE));
                let (rx1, ry1) = (x1.min((sx + 1) * TILE), y1.min((sy + 1) * TILE));
                enc.copy_texture_to_texture(
                    wgpu::TexelCopyTextureInfo { texture: tile, mip_level: 0, origin: wgpu::Origin3d { x: rx0 - sx * TILE, y: ry0 - sy * TILE, z: 0 }, aspect: wgpu::TextureAspect::All },
                    wgpu::TexelCopyTextureInfo { texture: &stage, mip_level: 0, origin: wgpu::Origin3d { x: rx0 - x0, y: ry0 - y0, z: 0 }, aspect: wgpu::TextureAspect::All },
                    wgpu::Extent3d { width: rx1 - rx0, height: ry1 - ry0, depth_or_array_layers: 1 },
                );
            }
        }
        Some((stage, [x0 as f32, y0 as f32], [w as f32, h as f32]))
    }

    /// One output tile, the layers blended bottom to top over transparency, left on the GPU (straight RGBA8) for the
    /// display to draw; submitted, not waited for.
    pub fn render_tile(&self, gpu: &Gpu, layers: &[Stack], tx: u32, ty: u32) -> wgpu::Texture {
        let (mut back, mut front) = (tile_texture(gpu), tile_texture(gpu));
        let mut enc = gpu.device.create_command_encoder(&Default::default());
        {
            let view = back.create_view(&Default::default());
            let _ = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("clear"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &view, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store } })],
                ..Default::default()
            });
        }
        let mut uniforms = Vec::new();
        for l in layers {
            // Pixels with no tile here are transparent here; a table applies everywhere; a placed layer reads its pixels
            // around this tile's footprint, staged into one texture.
            let mut placed: Option<Placement> = None;
            let src: wgpu::Texture = match (&l.source, &l.transform) {
                (Source::Pixels(layer), Some(t)) => match self.stage(gpu, &mut enc, layer, t, tx, ty) {
                    Some((tex, origin, size)) => {
                        placed = Some((origin, size, t.inverse(), [layer.width as f32, layer.height as f32]));
                        tex
                    }
                    None => continue,
                },
                (Source::Pixels(layer), None) => match layer.tile_at(tx, ty) { Some(t) => t.clone(), None => continue },
                (Source::Table(lut), _) => lut.texture.clone(),
            };
            let src = &src;
            // A clipped layer shows nothing where its base has no pixels.
            let base = match &l.clip {
                Some(c) => match c.base.tile_at(tx, ty) { Some(t) => Some(t), None => continue },
                None => None,
            };
            let mask = l.mask.map(|m| m.tile_at(tx, ty).unwrap_or(&self.white));
            let base_mask = l.clip.as_ref().and_then(|c| c.mask).map(|m| m.tile_at(tx, ty).unwrap_or(&self.white));
            let (inv, stage_origin, stage_size, layer_size) = match placed {
                Some((o, s, i, ls)) => (i, o, s, ls),
                None => (Affine::translate(0.0, 0.0), [0.0; 2], [1.0; 2], [0.0; 2]),
            };
            let u = Comp {
                inv0: [inv.a, inv.b, inv.c, 0.0],
                inv1: [inv.d, inv.e, inv.f, 0.0],
                tile_origin: [(tx * TILE) as f32, (ty * TILE) as f32],
                opacity: l.opacity.clamp(0.0, 1.0),
                mode: l.mode,
                has_mask: mask.is_some() as u32,
                has_clip: base.is_some() as u32,
                base_opacity: l.clip.as_ref().map_or(1.0, |c| c.opacity.clamp(0.0, 1.0)),
                base_has_mask: base_mask.is_some() as u32,
                stage_origin,
                stage_size,
                layer_size,
                transformed: placed.is_some() as u32,
                pad: 0,
            };
            let buf = crate::uniform_buffer(&gpu.device, bytemuck::bytes_of(&u));
            let (bv, sv, fv) = (back.create_view(&Default::default()), src.create_view(&Default::default()), front.create_view(&Default::default()));
            let mv = mask.unwrap_or(&self.white).create_view(&Default::default());
            let basev = base.unwrap_or(&self.white).create_view(&Default::default());
            let bmv = base_mask.unwrap_or(&self.white).create_view(&Default::default());
            let bind = gpu.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("blend"),
                layout: &self.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&bv) },
                    wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&sv) },
                    wgpu::BindGroupEntry { binding: 2, resource: buf.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::TextureView(&mv) },
                    wgpu::BindGroupEntry { binding: 4, resource: wgpu::BindingResource::TextureView(&basev) },
                    wgpu::BindGroupEntry { binding: 5, resource: wgpu::BindingResource::TextureView(&bmv) },
                    wgpu::BindGroupEntry { binding: 6, resource: wgpu::BindingResource::Sampler(&self.sampler) },
                ],
            });
            {
                let mut pass = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("blend"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &fv, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store } })],
                    ..Default::default()
                });
                pass.set_pipeline(&self.pipeline);
                pass.set_bind_group(0, &bind, &[]);
                pass.draw(0..3, 0..1);
            }
            uniforms.push(buf);
            std::mem::swap(&mut back, &mut front);
        }
        gpu.queue.submit([enc.finish()]);
        back
    }

    /// The layers blended in a rectangle of the document, read back as straight RGBA8 (for tests and export).
    pub fn blend_region(&self, gpu: &Gpu, layers: &[Stack], x: u32, y: u32, w: u32, h: u32) -> Vec<u8> {
        let mut out = vec![0u8; (w * h * 4) as usize];
        for ty in y / TILE..=(y + h - 1) / TILE {
            for tx in x / TILE..=(x + w - 1) / TILE {
                let px = read_tile(gpu, &self.render_tile(gpu, layers, tx, ty));
                for py in 0..TILE {
                    let ly = ty * TILE + py;
                    if ly < y || ly >= y + h {
                        continue;
                    }
                    for qx in 0..TILE {
                        let lx = tx * TILE + qx;
                        if lx < x || lx >= x + w {
                            continue;
                        }
                        let s = ((py * TILE + qx) * 4) as usize;
                        let d = (((ly - y) * w + (lx - x)) * 4) as usize;
                        out[d..d + 4].copy_from_slice(&px[s..s + 4]);
                    }
                }
            }
        }
        out
    }
}

/// The layers blended in a rectangle, with a blend pass built for this call (tests and one-off exports).
pub fn blend_region(gpu: &Gpu, layers: &[Stack], x: u32, y: u32, w: u32, h: u32) -> Vec<u8> {
    Blender::new(gpu).blend_region(gpu, layers, x, y, w, h)
}
