use serde::Serialize;
use std::path::{Path, PathBuf};
use std::fs;
use image::GenericImageView;
use walkdir::WalkDir;
use sha2::{Sha256, Digest};
use ocrs::{OcrEngine, OcrEngineParams, ImageSource};
use rten::Model;
use std::io::BufReader;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

#[derive(Serialize)]
pub struct ImageInfo {
    width: u32,
    height: u32,
    format: String,
    color_type: String,
    size_bytes: u64,
    path: String,
    name: String,
    exif: Option<std::collections::HashMap<String, String>>,
    palette: Vec<String>,
    histogram: Vec<u32>,
    ocr_text: Option<String>,
}

#[derive(Serialize)]
pub struct SimpleImageInfo {
    path: String,
    name: String,
    ocr_text: Option<String>,
}

#[tauri::command]
fn scan_image(path: String) -> Result<ImageInfo, String> {
    let img = image::open(&path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    
    let (width, height) = img.dimensions();
    let format = format!("{:?}", image::ImageFormat::from_path(&path).unwrap_or(image::ImageFormat::Jpeg));
    let color_type = format!("{:?}", img.color());
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;

    // Extract EXIF
    let mut exif_map = std::collections::HashMap::new();
    if let Ok(file) = fs::File::open(&path) {
        let mut reader = BufReader::new(file);
        let exif_reader = exif::Reader::new();
        if let Ok(exif) = exif_reader.read_from_container(&mut reader) {
            for field in exif.fields() {
                let tag_str = format!("{:?}", field.tag);
                let value_str = field.display_value().with_unit(&exif).to_string();
                exif_map.insert(tag_str, value_str);
            }
        }
    }

    // Extract Palette (10 colors)
    let mut palette = Vec::new();
    let sample_points = [
        (10.min(width-1), 10.min(height-1)),
        (width/2, height/2),
        ((width-10).max(0) as u32, (height-10).max(0) as u32),
        (width/4, height/4),
        (3*width/4, height/4),
        (width/4, 3*height/4),
        (3*width/4, 3*height/4),
        (width/2, height/4),
        (width/2, 3*height/4),
        (width/4, height/2),
    ];

    for (sx, sy) in sample_points {
        palette.push(get_pixel_hex(&img, sx, sy));
    }

    // Calculate Brightness Histogram (0-255)
    let mut histogram = vec![0u32; 256];
    let gray = img.to_luma8();
    for pixel in gray.pixels() {
        histogram[pixel[0] as usize] += 1;
    }

    Ok(ImageInfo {
        width,
        height,
        format,
        color_type,
        size_bytes: metadata.len(),
        path: path.clone(),
        name: Path::new(&path).file_name().unwrap().to_string_lossy().to_string(),
        exif: if exif_map.is_empty() { None } else { Some(exif_map) },
        palette,
        histogram,
        ocr_text: None,
    })
}

fn get_pixel_hex(img: &image::DynamicImage, x: u32, y: u32) -> String {
    let pixel = img.get_pixel(x, y);
    format!("#{:02x}{:02x}{:02x}", pixel[0], pixel[1], pixel[2])
}

#[tauri::command]
fn scan_directory(path: String, recursive: bool) -> Result<Vec<SimpleImageInfo>, String> {
    let mut images = Vec::new();
    let extensions = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];

    let mut walker = WalkDir::new(path);
    if !recursive {
        walker = walker.max_depth(1);
    }

    for entry in walker.into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                if extensions.contains(&ext.to_lowercase().as_str()) {
                    images.push(SimpleImageInfo {
                        path: entry.path().to_string_lossy().to_string(),
                        name: entry.file_name().to_string_lossy().to_string(),
                        ocr_text: None,
                    });
                }
            }
        }
    }
    Ok(images)
}

#[tauri::command]
fn get_thumbnail(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let cache_dir = app.path().app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?;
    
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    let hash = format!("{:x}.jpg", hasher.finalize());
    let thumb_path = cache_dir.join(hash);

    if thumb_path.exists() {
        return Ok(thumb_path.to_string_lossy().to_string());
    }

    // Generate thumbnail
    let img = image::open(&path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    
    let thumb = img.thumbnail(100, 100);
    thumb.save(&thumb_path)
        .map_err(|e| format!("Failed to save thumbnail: {}", e))?;

    Ok(thumb_path.to_string_lossy().to_string())
}

#[tauri::command]
fn generate_focus_heatmap(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let img = image::open(&path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    
    // Resize for faster processing if image is very large
    let (width, height) = img.dimensions();
    let max_dim = 1000;
    let img = if width > max_dim || height > max_dim {
        img.thumbnail(max_dim, max_dim)
    } else {
        img
    };

    let gray = img.to_luma8();
    let mut edges = image::ImageBuffer::new(img.width(), img.height());

    // Laplacian kernel
    let kernel = [
        0, -1,  0,
       -1,  4, -1,
        0, -1,  0,
    ];

    for y in 1..img.height()-1 {
        for x in 1..img.width()-1 {
            let mut sum = 0i32;
            for ky in 0..3 {
                for kx in 0..3 {
                    let pixel = gray.get_pixel(x + kx - 1, y + ky - 1)[0] as i32;
                    sum += pixel * kernel[ky as usize * 3 + kx as usize];
                }
            }
            // Enhance the focus edges (convert to bright green/yellow heatmap style potentially)
            // For now, let's just create a high-contrast grayscale edge map
            let val = (sum.abs() * 5).min(255) as u8;
            edges.put_pixel(x, y, image::Luma([val]));
        }
    }

    // Save heatmap to cache
    let cache_dir = app.path().app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?;
    
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    hasher.update(b"focus_peak");
    let hash = format!("{:x}.png", hasher.finalize());
    let heatmap_path = cache_dir.join(hash);

    // Save as RGBA to make it look like a heatmap (e.g., green for focus)
    let mut heatmap_rgba = image::ImageBuffer::new(img.width(), img.height());
    for (x, y, pixel) in edges.enumerate_pixels() {
        let val = pixel[0];
        if val > 40 { // Focus threshold
             // Bright green for sharp edges
            heatmap_rgba.put_pixel(x, y, image::Rgba([0, 255, 0, val]));
        } else {
            heatmap_rgba.put_pixel(x, y, image::Rgba([0, 0, 0, 0])); // Transparent
        }
    }

    heatmap_rgba.save(&heatmap_path)
        .map_err(|e| format!("Failed to save heatmap: {}", e))?;

    Ok(heatmap_path.to_string_lossy().to_string())
}

#[tauri::command]
fn transform_image(path: String, action: String) -> Result<(), String> {
    let img = image::open(&path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    
    let transformed = match action.as_str() {
        "rotate90" => img.rotate90(),
        "rotate180" => img.rotate180(),
        "rotate270" => img.rotate270(),
        "flip_h" => img.fliph(),
        "flip_v" => img.flipv(),
        "strip_meta" => {
            // Simply saving the image usually loses most EXIF metadata
            // if we just return the DynamicImage and save it.
            img
        },
        _ => return Err("Unknown action".to_string()),
    };

    transformed.save(&path)
        .map_err(|e| format!("Failed to save transformed image: {}", e))?;
    
    Ok(())
}

fn ensure_ocr_models(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get data dir: {}", e))?;
    
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    }

    let det_path = data_dir.join("text-detection.rten");
    let rec_path = data_dir.join("text-recognition.rten");

    if !det_path.exists() {
        println!("Downloading detection model...");
        let status = std::process::Command::new("certutil")
            .args(&["-urlcache", "-f", "https://ocrs-models.s3.amazonaws.com/text-detection.rten", det_path.to_str().unwrap()])
            .status()
            .map_err(|e| format!("Failed to download detection model: {}", e))?;
        if !status.success() {
            return Err("Failed to download text-detection model".into());
        }
    }

    if !rec_path.exists() {
        println!("Downloading recognition model...");
        let status = std::process::Command::new("certutil")
            .args(&["-urlcache", "-f", "https://ocrs-models.s3.amazonaws.com/text-recognition.rten", rec_path.to_str().unwrap()])
            .status()
            .map_err(|e| format!("Failed to download recognition model: {}", e))?;
        if !status.success() {
            return Err("Failed to download text-recognition model".into());
        }
    }

    Ok((det_path, rec_path))
}

#[tauri::command]
fn perform_ocr(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let (det_path, rec_path) = ensure_ocr_models(&app)?;

    let det_model_data = fs::read(det_path).map_err(|e| e.to_string())?;
    let rec_model_data = fs::read(rec_path).map_err(|e| e.to_string())?;

    let det_model = Model::load(det_model_data).map_err(|e| e.to_string())?;
    let rec_model = Model::load(rec_model_data).map_err(|e| e.to_string())?;

    let engine = OcrEngine::new(OcrEngineParams {
        detection_model: Some(det_model),
        recognition_model: Some(rec_model),
        ..Default::default()
    }).map_err(|e| e.to_string())?;

    let img = image::open(&path).map_err(|e| e.to_string())?;
    let (width, height) = img.dimensions();
    let rgb_img = img.to_rgb8();
    let img_source = ImageSource::from_bytes(rgb_img.as_raw(), (width, height))
        .map_err(|e| e.to_string())?;

    let ocr_input = engine.prepare_input(img_source).map_err(|e| e.to_string())?;
    let word_rects = engine.detect_words(&ocr_input).map_err(|e| e.to_string())?;
    let line_rects = engine.find_text_lines(&ocr_input, &word_rects);
    let line_texts = engine.recognize_text(&ocr_input, &line_rects).map_err(|e| e.to_string())?;

    let result = line_texts
        .into_iter()
        .flatten()
        .map(|l| l.to_string())
        .collect::<Vec<String>>()
        .join("\n");

    Ok(result)
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        // For macOS/Linux, opening the parent directory is a good fallback
        let path = std::path::Path::new(&path);
        let dir = if path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
        };
        
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(dir)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(dir)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            
            let scan_item = MenuItem::with_id(handle, "scan", "Scan Folder...", true, None::<&str>)?;
            let open_item = MenuItem::with_id(handle, "open-dir", "Open Directory", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(handle, "quit", "Quit", true, None::<&str>)?;

            let file_menu = Submenu::with_items(
                handle,
                "File",
                true,
                &[
                    &scan_item,
                    &open_item,
                    &PredefinedMenuItem::separator(handle)?,
                    &quit_item,
                ],
            )?;

            let edit_menu = Submenu::with_items(
                handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(handle, None)?,
                    &PredefinedMenuItem::redo(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &PredefinedMenuItem::select_all(handle, None)?,
                ],
            )?;

            let light_theme = MenuItem::with_id(handle, "theme-light", "Light", true, None::<&str>)?;
            let dark_theme = MenuItem::with_id(handle, "theme-dark", "Dark", true, None::<&str>)?;
            let system_theme = MenuItem::with_id(handle, "theme-system", "System", true, None::<&str>)?;

            let theme_menu = Submenu::with_items(
                handle,
                "Theme",
                true,
                &[&light_theme, &dark_theme, &system_theme],
            )?;

            let view_menu = Submenu::with_items(
                handle,
                "View",
                true,
                &[&theme_menu],
            )?;

            let about_item = MenuItem::with_id(handle, "about", "About Scanner Pro", true, None::<&str>)?;
            let help_menu = Submenu::with_items(
                handle,
                "Help",
                true,
                &[&about_item],
            )?;

            let menu = Menu::with_items(
                handle,
                &[&file_menu, &edit_menu, &view_menu, &help_menu],
            )?;

            app.set_menu(menu)?;

            app.on_menu_event(move |app, event| {
                if event.id == "scan" {
                    let _ = app.emit("menu-scan", ());
                } else if event.id == "open-dir" {
                    let _ = app.emit("menu-open-dir", ());
                } else if event.id == "quit" {
                    std::process::exit(0);
                } else if event.id == "theme-light" {
                    let _ = app.emit("theme-change", "light");
                } else if event.id == "theme-dark" {
                    let _ = app.emit("theme-change", "dark");
                } else if event.id == "theme-system" {
                    let _ = app.emit("theme-change", "system");
                } else if event.id == "about" {
                    let _ = app.emit("menu-about", ());
                }
            });

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![scan_image, scan_directory, open_folder, get_thumbnail, transform_image, generate_focus_heatmap, perform_ocr])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
