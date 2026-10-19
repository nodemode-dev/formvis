//! How large a document the machine can hold, in place of a fixed pixel cap (the web build's 100 MP). The renderer may
//! use 60 percent of the machine's memory, and a document pixel costs 16 bytes at most: its layer tile, the two textures the blend alternates between,
//! and the display's copy, each 4 bytes. wgpu does not report the graphics processor's own memory, so the budget is the
//! system's RAM; on machines with separate video memory the tiles also live there, which this does not yet measure.

/// The share of memory the renderer may use.
pub const SHARE: f64 = 0.6;
/// Bytes one document pixel may cost.
pub const BYTES_PER_PIXEL: u64 = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Budget {
    /// The machine's memory.
    pub ram: u64,
    /// What the renderer may use.
    pub bytes: u64,
    /// The largest document, in pixels.
    pub max_pixels: u64,
}

/// The budget for a machine with `ram` bytes of memory.
pub fn budget_for(ram: u64) -> Budget {
    let bytes = (ram as f64 * SHARE) as u64;
    Budget { ram, bytes, max_pixels: bytes / BYTES_PER_PIXEL }
}

/// The budget for this machine.
pub fn system_budget() -> Budget {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    budget_for(sys.total_memory())
}
