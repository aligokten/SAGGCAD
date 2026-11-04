//! SAGGCAD BIM çekirdeği — saf Rust, dış bağımlılık yok (`std` yalnız): masaüstünde ve tarayıcıda (WASM) aynı kod.
//!
//! OpenCAD Studio eklenti mimarisindeki "Layer C — domain engine crate" katmanıdır: çizim nesnelerini bilmez; uygulama
//! (`src/modules/bim`) bu crate'in ürettiği geometriyi DWG nesnelerine çevirir ve BIM verisini nesnelerin XDATA'sında
//! (`SAGGCAD` uygulama adı) saklar — DWG / DXF gidiş-dönüşünde kaybolmaz.
//!
//! Birimler: çizim birimi mm (DWG `$INSUNITS` 4). Donatı hesabı içeride cm ile çalışır; dönüşüm `rebar` modülündedir.

pub mod axis;
pub mod band;
pub mod column;
pub mod grids;
pub mod rebar;
pub mod room;
pub mod wall;
pub mod xdata;

/// XDATA uygulama adı (DWG APPID tablosu)
pub const APP: &str = "SAGGCAD";
/// BIM veri biçimi sürümü (XDATA'daki `v` alanı)
pub const SCHEMA: u32 = 1;
