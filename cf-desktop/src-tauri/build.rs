fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let lib_path = std::path::Path::new(&manifest_dir).join("../../build");
    let omp_path = std::path::Path::new("/opt/homebrew/opt/libomp/lib");
    
    // Link against the C++ solver library
    println!("cargo:rustc-link-search=native={}", lib_path.to_string_lossy());
    println!("cargo:rustc-link-search=native={}", omp_path.to_string_lossy());
    println!("cargo:rustc-link-lib=dylib=lbm_solver_shared");
    println!("cargo:rustc-link-lib=omp");
    
    // Force the linker to find the library by passing full path
    let dylib_path = lib_path.join("liblbm_solver_shared.dylib");
    println!("cargo:rustc-link-arg=-Wl,-force_load,{}", dylib_path.to_string_lossy());
    
    // RPATH for macOS to find the dylib at runtime
    println!("cargo:rustc-link-arg=-Wl,-rpath,{}", lib_path.to_string_lossy());
    println!("cargo:rustc-link-arg=-Wl,-rpath,{}", omp_path.to_string_lossy());

    tauri_build::build()
}
