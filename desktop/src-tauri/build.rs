// The same rule the app applies at runtime, so a release build with a bad URL never ships.
#[allow(dead_code)]
#[path = "src/app_origin.rs"]
mod app_origin;

use app_origin::{AppOrigin, BuildProfile};

const DEV_APP_URL: &str = "http://localhost:5173";

fn main() {
    println!("cargo:rerun-if-env-changed=LORKARIUM_APP_URL");
    let profile = build_profile();
    let raw = std::env::var("LORKARIUM_APP_URL").ok();
    let raw = match (raw, profile) {
        (Some(value), _) => value,
        (None, BuildProfile::Debug) => DEV_APP_URL.to_owned(),
        (None, BuildProfile::Release) => {
            panic!("LORKARIUM_APP_URL ausente no build de release; esperado https://host[:porta]")
        }
    };
    if let Err(problem) = AppOrigin::parse(&raw, profile) {
        panic!("{problem}");
    }
    println!("cargo:rustc-env=LORKARIUM_APP_URL={raw}");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["begin_startup", "retry_connection"]),
    ))
    .expect("tauri-build falhou");
}

fn build_profile() -> BuildProfile {
    match std::env::var("PROFILE").as_deref() {
        Ok("release") => BuildProfile::Release,
        _ => BuildProfile::Debug,
    }
}
