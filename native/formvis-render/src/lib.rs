//! formvis's native GPU renderer (Phase 20): the canvas drawn by the graphics processor from the desktop binary, through
//! wgpu (Metal on macOS, Vulkan on Linux, Direct3D 12 on Windows). This first part is the base Large images needs:
//! layers stored as 256-pixel tiles, allocated only where something is drawn, so a layer is not limited by the GPU's
//! largest texture and costs memory only where it has pixels; and a brush whose dabs are drawn on the GPU into exactly
//! the tiles they touch. Pixels are premultiplied RGBA8 on the GPU, as blending needs; readback returns straight RGBA.

use std::collections::HashMap;

pub mod bench;
pub mod budget;
pub mod composite;
pub mod display;
pub mod document;

pub const TILE: u32 = 256;
const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The device the renderer draws with, and what it is.
pub struct Gpu {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    pub info: wgpu::AdapterInfo,
    pub limits: wgpu::Limits,
    pub adapter: wgpu::Adapter,
    dab: wgpu::RenderPipeline,
    dab_layout: wgpu::BindGroupLayout,
}

/// One dab of the brush, in the layer's pixels: centre, radius, hardness (0 soft to 1 hard), straight RGBA colour and
/// flow (0 to 1), as the uniform the dab shader reads.
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct DabUniform {
    centre: [f32; 2],
    tile_origin: [f32; 2],
    radius: f32,
    hardness: f32,
    flow: f32,
    _pad: f32,
    colour: [f32; 4],
}

const DAB_WGSL: &str = r#"
struct Dab { centre: vec2<f32>, tile_origin: vec2<f32>, radius: f32, hardness: f32, flow: f32, pad: f32, colour: vec4<f32> };
@group(0) @binding(0) var<uniform> dab: Dab;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  // One triangle covering the whole tile; the fragment shader decides coverage.
  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4<f32>(p[i], 0.0, 1.0);
}

@fragment fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  // pos.xy is the pixel centre within the tile; the distance is measured in the layer's pixels.
  let d = distance(dab.tile_origin + pos.xy, dab.centre);
  // Hard edge inside radius * hardness, falling off smoothly to zero at the radius.
  let inner = dab.radius * dab.hardness;
  var cover = 1.0 - smoothstep(inner, max(dab.radius, inner + 1e-4), d);
  if (dab.hardness >= 1.0) { cover = select(0.0, 1.0, d <= dab.radius); }
  let a = dab.colour.a * cover * dab.flow;
  // Premultiplied, for source-over in the blend unit.
  return vec4<f32>(dab.colour.rgb * a, a);
}
"#;

impl Gpu {
    /// The best adapter there is (high performance first), without a window; None when the machine has no usable GPU
    /// backend at all.
    pub fn new() -> Option<Gpu> {
        Self::build(None).map(|(g, _)| g)
    }

    pub fn describe(&self) -> String {
        format!("{} ({:?})", self.info.name, self.info.backend)
    }

    /// A device for drawing into a window, with the window's surface: the adapter is chosen to be able to present to it.
    pub fn for_window(target: impl Into<wgpu::SurfaceTarget<'static>>) -> Option<(Gpu, wgpu::Surface<'static>)> {
        let (g, s) = Self::build(Some(target.into()))?;
        Some((g, s?))
    }

    fn build(target: Option<wgpu::SurfaceTarget<'static>>) -> Option<(Gpu, Option<wgpu::Surface<'static>>)> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle_from_env());
        let surface = match target {
            Some(t) => Some(instance.create_surface(t).ok()?),
            None => None,
        };
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            compatible_surface: surface.as_ref(),
            apply_limit_buckets: false,
        }))
        .ok()?;
        let info = adapter.get_info();
        let limits = adapter.limits();
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("formvis-render"),
            required_limits: limits.clone(),
            ..Default::default()
        }))
        .ok()?;
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("dab"), source: wgpu::ShaderSource::Wgsl(DAB_WGSL.into()) });
        let dab_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("dab"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            }],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("dab"), bind_group_layouts: &[Some(&dab_layout)], ..Default::default() });
        let over = wgpu::BlendState {
            color: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::One, dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha, operation: wgpu::BlendOperation::Add },
            alpha: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::One, dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha, operation: wgpu::BlendOperation::Add },
        };
        let dab = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("dab"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState { module: &module, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fs"),
                targets: &[Some(wgpu::ColorTargetState { format: FORMAT, blend: Some(over), write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default(),
            }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        Some((Gpu { device, queue, info, limits, adapter, dab, dab_layout }, surface))
    }
}

/// The renderer started on request: the device and the memory it may use.
pub struct Native {
    pub gpu: Gpu,
    pub budget: budget::Budget,
}

/// Whether FORMVIS_NATIVE asks for the native renderer.
pub fn enabled() -> bool {
    matches!(std::env::var("FORMVIS_NATIVE").as_deref(), Ok("1") | Ok("true") | Ok("on") | Ok("yes"))
}

/// The renderer when FORMVIS_NATIVE is set and a GPU backend exists; nothing otherwise.
pub fn native_start() -> Option<Native> {
    if !enabled() {
        return None;
    }
    native_force()
}

/// The renderer whether or not FORMVIS_NATIVE is set (probes and the command line).
pub fn native_force() -> Option<Native> {
    let gpu = Gpu::new()?;
    Some(Native { gpu, budget: budget::system_budget() })
}

/// A layer as tiles: only tiles something was drawn into exist.
pub struct TiledLayer {
    pub width: u32,
    pub height: u32,
    tiles: HashMap<(u32, u32), wgpu::Texture>,
}

impl TiledLayer {
    pub fn new(width: u32, height: u32) -> TiledLayer {
        TiledLayer { width, height, tiles: HashMap::new() }
    }

    pub(crate) fn tile_at(&self, tx: u32, ty: u32) -> Option<&wgpu::Texture> {
        self.tiles.get(&(tx, ty))
    }

    /// Puts straight RGBA8 pixels (w by h, rows packed) at (x, y), premultiplied into the tiles they fall in; transparent
    /// runs allocate nothing new.
    pub fn write(&mut self, gpu: &Gpu, x: u32, y: u32, w: u32, h: u32, rgba: &[u8]) {
        assert_eq!(rgba.len(), (w as usize) * (h as usize) * 4);
        for ty in y / TILE..=(y + h - 1) / TILE {
            for tx in x / TILE..=(x + w - 1) / TILE {
                let (ox, oy) = (tx * TILE, ty * TILE);
                let (x0, y0, x1, y1) = (x.max(ox), y.max(oy), (x + w).min(ox + TILE), (y + h).min(oy + TILE));
                let any = (y0..y1).any(|py| (x0..x1).any(|px| rgba[(((py - y) as usize) * w as usize + (px - x) as usize) * 4 + 3] > 0));
                if !any && !self.tiles.contains_key(&(tx, ty)) {
                    continue;
                }
                let mut tile = if self.tiles.contains_key(&(tx, ty)) { read_tile(gpu, &self.tiles[&(tx, ty)]) } else { vec![0u8; (TILE * TILE * 4) as usize] };
                for py in y0..y1 {
                    for px in x0..x1 {
                        let s = (((py - y) as usize) * w as usize + (px - x) as usize) * 4;
                        let d = (((py - oy) * TILE + (px - ox)) * 4) as usize;
                        let a = rgba[s + 3] as u32;
                        for c in 0..3 {
                            tile[d + c] = ((rgba[s + c] as u32 * a + 127) / 255) as u8;
                        }
                        tile[d + 3] = a as u8;
                    }
                }
                let tex = self.tile(gpu, tx, ty);
                gpu.queue.write_texture(
                    tex.as_image_copy(),
                    &tile,
                    wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(TILE * 4), rows_per_image: Some(TILE) },
                    wgpu::Extent3d { width: TILE, height: TILE, depth_or_array_layers: 1 },
                );
            }
        }
    }

    /// How many tiles hold pixels, and the bytes they take on the GPU.
    pub fn allocated(&self) -> (usize, u64) {
        (self.tiles.len(), self.tiles.len() as u64 * (TILE * TILE * 4) as u64)
    }

    fn tile(&mut self, gpu: &Gpu, tx: u32, ty: u32) -> &wgpu::Texture {
        self.tiles.entry((tx, ty)).or_insert_with(|| {
            gpu.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("tile"),
                size: wgpu::Extent3d { width: TILE, height: TILE, depth_or_array_layers: 1 },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: FORMAT,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC | wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            })
        })
    }

    /// One brush dab, drawn on the GPU into each tile it touches (new tiles start transparent).
    pub fn dab(&mut self, gpu: &Gpu, centre: [f32; 2], radius: f32, hardness: f32, colour: [f32; 4], flow: f32) {
        if radius <= 0.0 {
            return;
        }
        let (x0, y0) = ((centre[0] - radius).floor().max(0.0) as u32, (centre[1] - radius).floor().max(0.0) as u32);
        let x1 = ((centre[0] + radius).ceil() as u32).min(self.width.saturating_sub(1));
        let y1 = ((centre[1] + radius).ceil() as u32).min(self.height.saturating_sub(1));
        if x0 > x1 || y0 > y1 {
            return;
        }
        let mut encoder = gpu.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("dab") });
        let mut uniforms = Vec::new();
        for ty in y0 / TILE..=y1 / TILE {
            for tx in x0 / TILE..=x1 / TILE {
                let fresh = !self.tiles.contains_key(&(tx, ty));
                let view = self.tile(gpu, tx, ty).create_view(&Default::default());
                let u = DabUniform {
                    centre,
                    tile_origin: [(tx * TILE) as f32, (ty * TILE) as f32],
                    radius,
                    hardness: hardness.clamp(0.0, 1.0),
                    flow: flow.clamp(0.0, 1.0),
                    _pad: 0.0,
                    colour,
                };
                let buf = uniform_buffer(&gpu.device, bytemuck::bytes_of(&u));
                let bind = gpu.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("dab"),
                    layout: &gpu.dab_layout,
                    entries: &[wgpu::BindGroupEntry { binding: 0, resource: buf.as_entire_binding() }],
                });
                {
                    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                        label: Some("dab"),
                        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                            view: &view,
                            depth_slice: None,
                            resolve_target: None,
                            ops: wgpu::Operations { load: if fresh { wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT) } else { wgpu::LoadOp::Load }, store: wgpu::StoreOp::Store },
                        })],
                        ..Default::default()
                    });
                    pass.set_pipeline(&gpu.dab);
                    pass.set_bind_group(0, &bind, &[]);
                    pass.draw(0..3, 0..1);
                }
                uniforms.push(buf);
            }
        }
        gpu.queue.submit([encoder.finish()]);
    }

    /// The layer's pixels in a rectangle, straight (not premultiplied) RGBA8; transparent where there is no tile.
    pub fn read(&self, gpu: &Gpu, x: u32, y: u32, w: u32, h: u32) -> Vec<u8> {
        let mut out = vec![0u8; (w as usize) * (h as usize) * 4];
        for ty in y / TILE..=(y + h - 1) / TILE {
            for tx in x / TILE..=(x + w - 1) / TILE {
                let Some(tex) = self.tiles.get(&(tx, ty)) else { continue };
                let px = read_tile(gpu, tex);
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
                        let d = (((ly - y) as usize) * w as usize + (lx - x) as usize) * 4;
                        let a = px[s + 3] as f32 / 255.0;
                        for c in 0..3 {
                            out[d + c] = if a > 0.0 { ((px[s + c] as f32 / 255.0 / a) * 255.0).round().min(255.0) as u8 } else { 0 };
                        }
                        out[d + 3] = px[s + 3];
                    }
                }
            }
        }
        out
    }
}

fn read_tile(gpu: &Gpu, tex: &wgpu::Texture) -> Vec<u8> {
    let bytes_per_row = TILE * 4; // 1024, already a multiple of 256
    let buf = gpu.device.create_buffer(&wgpu::BufferDescriptor { label: Some("read"), size: (bytes_per_row * TILE) as u64, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false });
    let mut encoder = gpu.device.create_command_encoder(&Default::default());
    encoder.copy_texture_to_buffer(
        tex.as_image_copy(),
        wgpu::TexelCopyBufferInfo { buffer: &buf, layout: wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(bytes_per_row), rows_per_image: Some(TILE) } },
        wgpu::Extent3d { width: TILE, height: TILE, depth_or_array_layers: 1 },
    );
    gpu.queue.submit([encoder.finish()]);
    let slice = buf.slice(..);
    slice.map_async(wgpu::MapMode::Read, |_| {});
    let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());
    let data = slice.get_mapped_range().expect("the read buffer is mapped").to_vec();
    buf.unmap();
    data
}

/// A small uniform buffer filled with `bytes`.
fn uniform_buffer(device: &wgpu::Device, bytes: &[u8]) -> wgpu::Buffer {
    use wgpu::util::DeviceExt;
    device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("uniform"), contents: bytes, usage: wgpu::BufferUsages::UNIFORM })
}
