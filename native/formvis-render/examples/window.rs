//! A document drawn into a real window by the native renderer, to check the display on a real window system (run under
//! a virtual display in CI, screenshot and measured): a 1,000 by 700 document, red on its left half and blue on its
//! right, with a 200 px green square placed at 45 degrees about its centre, shown at pan (50, 40) and zoom 0.5 on the
//! dark pasteboard. Prints READY once frames are showing, keeps the window up for FORMVIS_HOLD seconds (default 4), then
//! exits. Run: cargo run --example window

use formvis_render::composite::{Affine, Blender, Stack};
use formvis_render::display::{Checker, Display, Presented, View};
use formvis_render::{Gpu, TiledLayer};
use std::sync::Arc;
use std::time::{Duration, Instant};
use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::window::{Window, WindowId};

const DOC: (u32, u32) = (1000, 700);

struct Scene {
    window: Arc<Window>,
    gpu: Gpu,
    display: Display,
    blender: Blender,
    halves: TiledLayer,
    square: TiledLayer,
    shown: u32,
    until: Option<Instant>,
}

#[derive(Default)]
struct App {
    scene: Option<Scene>,
}

impl ApplicationHandler for App {
    fn resumed(&mut self, el: &ActiveEventLoop) {
        if self.scene.is_some() {
            return;
        }
        let window = Arc::new(el.create_window(Window::default_attributes().with_title("formvis native display").with_inner_size(winit::dpi::PhysicalSize::new(800, 600))).expect("window"));
        let (gpu, surface) = Gpu::for_window(window.clone()).expect("a GPU that can present to this window");
        let size = window.inner_size();
        let display = Display::new(&gpu, surface, size.width, size.height);
        println!("adapter: {} ({:?}); surface format {:?}", gpu.info.name, gpu.info.backend, display.format());
        let mut halves = TiledLayer::new(DOC.0, DOC.1);
        // Opaque down to y 600; the last 100 rows are left transparent, so the checkerboard shows there.
        let px: Vec<u8> = (0..600).flat_map(|_| (0..DOC.0).flat_map(|x| if x < DOC.0 / 2 { [220, 30, 30, 255] } else { [30, 60, 220, 255] })).collect();
        halves.write(&gpu, 0, 0, DOC.0, 600, &px);
        let mut square = TiledLayer::new(200, 200);
        square.write(&gpu, 0, 0, 200, 200, &vec![[40u8, 200, 60, 255]; 200 * 200].concat());
        let blender = Blender::new(&gpu);
        self.scene = Some(Scene { window, gpu, display, blender, halves, square, shown: 0, until: None });
        el.set_control_flow(ControlFlow::Poll);
    }

    fn window_event(&mut self, el: &ActiveEventLoop, _: WindowId, event: WindowEvent) {
        let Some(s) = self.scene.as_mut() else { return };
        match event {
            WindowEvent::CloseRequested => el.exit(),
            WindowEvent::Resized(size) => s.display.resize(&s.gpu, size.width, size.height),
            WindowEvent::RedrawRequested => {
                // The square's centre (100, 100) to the document's centre (500, 350), turned 45 degrees.
                let place = compose(Affine::translate(400.0, 250.0), Affine::rotate_about(45.0, 100.0, 100.0));
                let layers = [Stack::new(&s.halves, 0, 1.0), Stack::new(&s.square, 0, 1.0).transformed(place)];
                let checker = Checker { a: [0.8, 0.8, 0.8], b: [0.55, 0.55, 0.55], cell: 8.0 };
                if s.display.present(&s.gpu, &s.blender, &layers, DOC.0, DOC.1, View { pan: [50.0, 40.0], zoom: 0.5 }, Some(checker)) == Presented::Shown {
                    s.shown += 1;
                    if s.shown == 3 {
                        println!("READY");
                        let hold: u64 = std::env::var("FORMVIS_HOLD").ok().and_then(|v| v.parse().ok()).unwrap_or(4);
                        s.until = Some(Instant::now() + Duration::from_secs(hold));
                    }
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, el: &ActiveEventLoop) {
        if let Some(s) = self.scene.as_ref() {
            if s.until.is_some_and(|t| Instant::now() >= t) {
                el.exit();
                return;
            }
            s.window.request_redraw();
            std::thread::sleep(Duration::from_millis(16));
        }
    }
}

/// `outer` after `inner`: a point goes through `inner`, then `outer`.
fn compose(outer: Affine, inner: Affine) -> Affine {
    Affine {
        a: outer.a * inner.a + outer.b * inner.d,
        b: outer.a * inner.b + outer.b * inner.e,
        c: outer.a * inner.c + outer.b * inner.f + outer.c,
        d: outer.d * inner.a + outer.e * inner.d,
        e: outer.d * inner.b + outer.e * inner.e,
        f: outer.d * inner.c + outer.e * inner.f + outer.f,
    }
}

fn main() {
    let el = EventLoop::new().expect("event loop");
    el.run_app(&mut App::default()).expect("run");
}
