# Rust Image Image Scanner Pro - Final Walkthrough

Image Scanner Pro is a high-performance image analysis tool. Explore the source code on [GitHub](https://github.com/skdsam/Image-Scanner-Pro).

## Pro Features

- **About Page**: A custom-designed modal providing context on the application's purpose and technology stack, accessible via the native Help menu.
- **Advanced Metadata**: Extract and display EXIF camera settings (ISO, Aperture) and live brightness histograms.
- **Color Palettes**: Automatically generate a 3-color palette for every image with click-to-copy hex codes.
- **Image Transformations**: Rotate and flip images directly within the app, saving changes instantly.
- **Side-by-Side Comparison**: Evaluate two images simultaneously in a dedicated comparison mode.
- **System Integration**: Quick access to open files in the default system viewer or highlight them in Explorer.
- **Focus Peak**: One-click analysis that overlays a bright green heatmap showing exactly where your lens is focused.
- **Smart Search (OCR)**: Local text recognition that extracts text from any image, making documents and screenshots searchable.
- **Precision Scaling**: Focus heatmap now remains perfectly locked to the image context even when resizing panels or the window.
- **Pro Color Export**: Extract 10 dominant colors and export them as CSS Variables, JSON, or CSV for professional workflows.
- **Custom Branding**: Application icons have been generated from original artwork, giving the app a distinct, professional identity on the desktop and taskbar.
- **Production Build optimization**: Configured to run silently without an attached terminal window on Windows release builds.
- **Standalone Installer**: A complete setup executable has been generated for final distribution.

## Features Implemented

### 📂 Folder Scanning
- Recursively scans a selected directory for images (JPG, PNG, WebP, GIF, BMP).
- Uses the high-performance `walkdir` crate in Rust.

### 🖼️ Premium UI & Gallery
- **Sidebar Layout**: Quickly browse through found images.
- **Thumbnails**: Real-time previews using Tauri's secure asset protocol.
- **Search**: Instant filtering of the image list by filename or path.
- **Open Directory Fix**: Updated the logic to open the containing folder and automatically highlight the selected image (Windows Explorer `/select` mode).
- **API Fix**: Resolved the `window.__TAURI__` undefined error by enabling global injection.
- **Image Fix**: Resolved the `net::ERR_CONNECTION_REFUSED` error by correctly configuring the Tauri asset protocol scope and registering the filesystem plugin.

### 🔍 Metadata Extraction
- Detailed image information: Dimensions, format, color space, and file size.
- Powered by the `image` crate in the Rust backend.

## How to Run

1. **Launch App**: The application should already be running if you didn't close the terminal. If not, run:
   ```powershell
   $env:PATH += ";$env:USERPROFILE\.cargo\bin"; npm run tauri dev
   ```
2. **Scan**: Click the **"Scan Folder"** button in the top toolbar.
3. **Browse**: Select any image from the sidebar to view it in full and see its metadata in the right-hand panel.
4. **Search**: Use the search box above the image list to find specific files.

## Technical Details
- **Backend**: Rust (Tauri v2)
- **Frontend**: Vanilla JavaScript + CSS (Modern Glassmorphism Design)
- **Permissions**: Configured via `src-tauri/capabilities/default.json` for dialog and resource access.

---

### [task.md](file:///C:/Users/skdso/.gemini/antigravity\brain/6f766d2e-dbfd-444c-a1d2-662e9aaf8477/task.md)
Check out the final task log to see the step-by-step progress.
