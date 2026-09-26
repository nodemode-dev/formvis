use sonny_render::budget::{budget_for, system_budget, BYTES_PER_PIXEL};

#[test]
fn the_budget_follows_the_machine() {
    let gb = 1u64 << 30;
    let b = budget_for(16 * gb);
    assert_eq!(b.bytes, (16.0 * gb as f64 * 0.6) as u64);
    assert_eq!(b.max_pixels, b.bytes / BYTES_PER_PIXEL);
    assert!(b.max_pixels > 600_000_000, "16 GB holds about 644 MP, six times the web build's 100 MP cap");
    assert_eq!(budget_for(8 * gb).max_pixels * 2, budget_for(16 * gb).max_pixels, "twice the memory, twice the document");
}

#[test]
fn this_machines_budget_is_read_from_the_system() {
    let b = system_budget();
    eprintln!("this machine: {:.1} GB, budget {:.1} GB, largest document {:.0} MP", b.ram as f64 / 1e9, b.bytes as f64 / 1e9, b.max_pixels as f64 / 1e6);
    assert!(b.ram > 0 && b.max_pixels > 0);
}
