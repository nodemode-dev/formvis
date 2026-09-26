//! The canvas on screen: the document's visible tiles, blended by the Blender, drawn into a window's GPU surface at the
//! view's pan and zoom (screen = pan + document * zoom). The surface format is a non-sRGB one, since sonny's pixel
//! values are already sRGB-encoded bytes and an sRGB surface would encode them again. Only tiles in view are blended;
//! zoomed in, pixels are drawn nearest-neighbour so they stay crisp, zoomed out, filtered.

use crate::composite::{Blender, Stack};
use crate::{Gpu, TILE};

const BLIT_WGSL: &str = r#"
struct Quad { rect: vec4<f32> };   // left, top, right, bottom in clip space
@group(0) @binding(0) var tile: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> quad: Quad;
struct Out { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
  let c = array<vec2<f32>, 6>(vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 1.0));
  let t = c[i];
  var o: Out;
  o.pos = vec4<f32>(mix(quad.rect.x, quad.rect.z, t.x), mix(quad.rect.y, quad.rect.w, t.y), 0.0, 1.0);
  o.uv = t;
  return o;
}
@fragment fn fs(in: Out) -> @location(0) vec4<f32> { return textureSample(tile, smp, in.uv); }
"#;

/// Where the document is on screen: its top-left corner at `pan` (screen pixels), `zoom` screen pixels per document pixel.
#[derive(Clone, Copy, Debug)]
pub struct View {
    pub pan: [f32; 2],
    pub zoom: f32,
}

/// What presenting a frame came to.
#[derive(Debug, PartialEq, Eq)]
pub enum Presented {
    /// Drawn and shown.
    Shown,
    /// Not drawn this time (the surface was out of date, lost, timed out or hidden); try the next frame.
    Skipped,
}

pub struct Display {
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    nearest: wgpu::Sampler,
    linear: wgpu::Sampler,
    /// The colour around the document (the pasteboard).
    pub background: wgpu::Color,
}

impl Display {
    pub fn new(gpu: &Gpu, surface: wgpu::Surface<'static>, width: u32, height: u32) -> Display {
        let caps = surface.get_capabilities(&gpu.adapter);
        let format = caps.formats.iter().copied().find(|f| !f.is_srgb()).unwrap_or(caps.formats[0]);
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: width.max(1),
            height: height.max(1),
            present_mode: wgpu::PresentMode::Fifo,
            desired_maximum_frame_latency: 2,
            alpha_mode: caps.alpha_modes[0],
            view_formats: vec![],
            color_space: wgpu::SurfaceColorSpace::Auto,
        };
        surface.configure(&gpu.device, &config);
        let module = gpu.device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("blit"), source: wgpu::ShaderSource::Wgsl(BLIT_WGSL.into()) });
        let layout = gpu.device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("blit"),
            entries: &[
                wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }, count: None },
                wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
                wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::VERTEX, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
            ],
        });
        let pl = gpu.device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("blit"), bind_group_layouts: &[Some(&layout)], ..Default::default() });
        let pipeline = gpu.device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("blit"),
            layout: Some(&pl),
            vertex: wgpu::VertexState { module: &module, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fs"),
                // The tiles are straight RGBA; drawn over the pasteboard with ordinary alpha blending.
                targets: &[Some(wgpu::ColorTargetState { format, blend: Some(wgpu::BlendState::ALPHA_BLENDING), write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default(),
            }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        let sampler = |filter| gpu.device.create_sampler(&wgpu::SamplerDescriptor { mag_filter: filter, min_filter: filter, address_mode_u: wgpu::AddressMode::ClampToEdge, address_mode_v: wgpu::AddressMode::ClampToEdge, ..Default::default() });
        let (nearest, linear) = (sampler(wgpu::FilterMode::Nearest), sampler(wgpu::FilterMode::Linear));
        Display { surface, config, pipeline, layout, nearest, linear, background: wgpu::Color { r: 0.118, g: 0.118, b: 0.118, a: 1.0 } }
    }

    pub fn format(&self) -> wgpu::TextureFormat {
        self.config.format
    }

    pub fn resize(&mut self, gpu: &Gpu, width: u32, height: u32) {
        self.config.width = width.max(1);
        self.config.height = height.max(1);
        self.surface.configure(&gpu.device, &self.config);
    }

    /// Draws the document (doc_w by doc_h, its layers in `layers`) at `view` and shows the frame.
    pub fn present(&mut self, gpu: &Gpu, blender: &Blender, layers: &[Stack], doc_w: u32, doc_h: u32, view: View) -> Presented {
        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(f) | wgpu::CurrentSurfaceTexture::Suboptimal(f) => f,
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                self.surface.configure(&gpu.device, &self.config);
                return Presented::Skipped;
            }
            _ => return Presented::Skipped,
        };
        let (sw, sh, z) = (self.config.width as f32, self.config.height as f32, view.zoom.max(1e-4));
        // The document tiles on screen.
        let doc_x0 = ((-view.pan[0]) / z).max(0.0);
        let doc_y0 = ((-view.pan[1]) / z).max(0.0);
        let doc_x1 = ((sw - view.pan[0]) / z).min(doc_w as f32);
        let doc_y1 = ((sh - view.pan[1]) / z).min(doc_h as f32);
        let mut tiles = Vec::new();
        if doc_x1 > doc_x0 && doc_y1 > doc_y0 {
            for ty in (doc_y0 as u32) / TILE..=((doc_y1 - 1e-3) as u32) / TILE {
                for tx in (doc_x0 as u32) / TILE..=((doc_x1 - 1e-3) as u32) / TILE {
                    tiles.push((tx, ty, blender.render_tile(gpu, layers, tx, ty)));
                }
            }
        }
        let target = frame.texture.create_view(&Default::default());
        let sampler = if z >= 1.0 { &self.nearest } else { &self.linear };
        let mut enc = gpu.device.create_command_encoder(&Default::default());
        let mut keep = Vec::new();
        {
            let mut pass = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("canvas"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &target, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(self.background), store: wgpu::StoreOp::Store } })],
                ..Default::default()
            });
            pass.set_pipeline(&self.pipeline);
            for (tx, ty, tex) in &tiles {
                // The tile's screen rectangle, to clip space (y up).
                let (x0, y0) = (view.pan[0] + (tx * TILE) as f32 * z, view.pan[1] + (ty * TILE) as f32 * z);
                let (x1, y1) = (x0 + TILE as f32 * z, y0 + TILE as f32 * z);
                let rect = [x0 / sw * 2.0 - 1.0, 1.0 - y0 / sh * 2.0, x1 / sw * 2.0 - 1.0, 1.0 - y1 / sh * 2.0];
                let buf = crate::uniform_buffer(&gpu.device, bytemuck::cast_slice(&rect));
                let tv = tex.create_view(&Default::default());
                let bind = gpu.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("blit"),
                    layout: &self.layout,
                    entries: &[
                        wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&tv) },
                        wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(sampler) },
                        wgpu::BindGroupEntry { binding: 2, resource: buf.as_entire_binding() },
                    ],
                });
                pass.set_bind_group(0, &bind, &[]);
                pass.draw(0..6, 0..1);
                keep.push((buf, bind));
            }
        }
        gpu.queue.submit([enc.finish()]);
        gpu.queue.present(frame);
        Presented::Shown
    }
}
