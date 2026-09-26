//! Layers blended on the GPU tile by tile, in sonny's 27 blend modes (the same WGSL functions as the web renderer, in
//! blend.wgsl). Each output tile is built bottom to top between two textures, so the whole image never has to fit one
//! texture; a layer with no tile there is transparent there and is skipped. The fragment shader follows the web
//! renderer's layer blend (frontend/src/gpu/blend-wgsl.ts): the source unpremultiplied in float, the per-pixel modes'
//! 8-bit rounding, Dissolve on the document pixel, Linear Dodge additive, and the source over the backdrop. The result is
//! straight RGBA8. Transforms, masks and clipping follow in the next parts.

use crate::{read_tile, Gpu, TiledLayer, FORMAT, TILE};

const HEAD: &str = r#"
struct Comp { tile_origin: vec2<f32>, opacity: f32, mode: u32, has_mask: u32, has_clip: u32, base_opacity: f32, base_has_mask: u32 };
@group(0) @binding(0) var backdrop: texture_2d<f32>;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var<uniform> comp: Comp;
@group(0) @binding(3) var mask_tile: texture_2d<f32>;
@group(0) @binding(4) var base_tile: texture_2d<f32>;
@group(0) @binding(5) var base_mask_tile: texture_2d<f32>;

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
  let s0 = textureLoad(source, px, 0);
  var sc = s0;
  if (s0.a > 0.0) { sc = vec4<f32>(s0.rgb / s0.a, s0.a); }
  let m = comp.mode;
  if (m == 1u || m == 5u || m == 6u || m == 11u || (m >= 15u && m <= 18u) || m == 21u || m == 22u) {
    sc = vec4<f32>(round(sc.rgb * 255.0) / 255.0, sc.a);
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
  return vec4<f32>(co, ao);
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

/// One layer in a stack: what it draws, its blend mode (sonny's index, 0 Normal to 26 Luminosity), its opacity, its
/// mask (coverage in the mask's alpha; a tile the mask lacks reveals) and the base it is clipped to.
pub struct Stack<'a> {
    pub source: Source<'a>,
    pub mode: u32,
    pub opacity: f32,
    pub mask: Option<&'a TiledLayer>,
    pub clip: Option<Clip<'a>>,
}

impl<'a> Stack<'a> {
    pub fn new(layer: &'a TiledLayer, mode: u32, opacity: f32) -> Stack<'a> {
        Stack { source: Source::Pixels(layer), mode, opacity, mask: None, clip: None }
    }
    /// An adjustment layer: its table applied to everything beneath, at `opacity`.
    pub fn adjustment(table: &'a Lut, opacity: f32) -> Stack<'a> {
        Stack { source: Source::Table(table), mode: 100, opacity, mask: None, clip: None }
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
}

impl Lut {
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
        Lut { texture }
    }
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct Comp {
    tile_origin: [f32; 2],
    opacity: f32,
    mode: u32,
    has_mask: u32,
    has_clip: u32,
    base_opacity: f32,
    base_has_mask: u32,
}

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

/// The blend pass, built once and used for every tile.
pub struct Blender {
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    white: wgpu::Texture,
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
                tex_entry(1),
                wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
                tex_entry(3),
                tex_entry(4),
                tex_entry(5),
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
        Blender { pipeline, layout, white }
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
            // Pixels with no tile here are transparent here; a table applies everywhere.
            let src = match l.source {
                Source::Pixels(layer) => match layer.tile_at(tx, ty) { Some(t) => t, None => continue },
                Source::Table(lut) => &lut.texture,
            };
            // A clipped layer shows nothing where its base has no pixels.
            let base = match &l.clip {
                Some(c) => match c.base.tile_at(tx, ty) { Some(t) => Some(t), None => continue },
                None => None,
            };
            let mask = l.mask.map(|m| m.tile_at(tx, ty).unwrap_or(&self.white));
            let base_mask = l.clip.as_ref().and_then(|c| c.mask).map(|m| m.tile_at(tx, ty).unwrap_or(&self.white));
            let u = Comp {
                tile_origin: [(tx * TILE) as f32, (ty * TILE) as f32],
                opacity: l.opacity.clamp(0.0, 1.0),
                mode: l.mode,
                has_mask: mask.is_some() as u32,
                has_clip: base.is_some() as u32,
                base_opacity: l.clip.as_ref().map_or(1.0, |c| c.opacity.clamp(0.0, 1.0)),
                base_has_mask: base_mask.is_some() as u32,
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
