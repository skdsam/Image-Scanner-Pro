# Image Scanner Setup and Implementation Plan

This plan outlines the steps to install the required development environment and build a Rust-based image scanner with a Tauri interface.

## User Review Required

> [!IMPORTANT]
> - **Visual Studio Build Tools**: We need C++ build tools for Rust/Tauri. If not present, I will attempt to install them via `winget`. This may take significant time and potentially require a system restart.
> - **Rust Installation**: I will install Rust using `rustup` via `winget`.
> - **Scanner Functionality**: Initially, I'll implement a basic image viewer and metadata scanner. We can later expand this to OCR or QR scanning if desired.

## Proposed Changes

### 1. Environment Setup
- Install `Rustlang.Rustup` via `winget`. (Done)
- Verify C++ compiler (`cl.exe` or `gcc`) availability. (Done)
- Install `Microsoft.VisualStudio.2022.BuildTools` with C++ workloads. (Done)

### 2. Project Initialization
- Create a new Tauri project. (Done)
- Add dependencies: `image`, `serde`, `walkdir`, `tauri-plugin-dialog`.

### 3. Core Logic Expansion
- **Folder Scanning**: Implement `scan_directory` in Rust using `walkdir` to find all images in a path.
- **Search & Filter**: Frontend logic to dynamically filter the list of images.
- **Thumbnails**: Use Tauri's asset protocol to display small versions of the images in the list.
- **Metadata**: Detailed extraction for selected images.

---

### [MODIFY] Tauri Frontend
- **index.html**: Add "Scan Folder" button, search input, and a list/grid container for image results.
- **main.js**: 
    - Handle folder selection via `open` dialog.
    - Call `scan_directory` and render the list with thumbnails.
    - Implement search filtering on the frontend.
    - Show detailed metadata in a side panel or modal.

### [MODIFY] Tauri Backend (Rust)
- **src-tauri/src/lib.rs**: 
    - `scan_directory`: Returns a list of image paths and basic info.
    - `scan_image`: Detailed metadata for a single file. (Exist, but needs verification)
    - `menu`: Implement native menu setup and event handling.

### 4. UI Enhancements
- **Native Menu**: Add a system menu with "File", "Edit", "View", and "Help" categories.
- **Theme Support**: Add "Theme" submenu to "View" with "Light", "Dark", and "System" options.
- **UI Polish**: Use CSS variables for themes, improve typography, and add subtle animations for a premium feel.
- **Advanced Filtering**: Add a format filter dropdown or chips near the search bar.
- **Conditional Actions**: Only show "Open Directory" when an image is selected.


### 5. Bug Fixes
- **Open Directory**: Modify `open_folder` in `lib.rs` to open the parent directory of a file path, or use `explorer /select` on Windows to highlight the file.

### 6. Final Polish & Info
- **About Page**: Implement a modal in `index.html` that displays application information (Version, Purpose, Technologies). [DONE]
- **Menu Integration**: Connect the native "About" menu item to open this modal. [DONE]

### 7. Performance & Scale
- **Thumbnail Cache**: Rust-side thumbnail generation using `image` crate, stored in a temporary or app-specific cache directory to speed up LIST rendering.
- **Recursive Toggle**: Add a switch in the sidebar to control `WalkDir` depth.

### 8. Deeper Image Analysis
- **EXIF Extraction**: Use `kamadak-exif` or `rexif` to pull camera settings.
- **Color Palette**: Analyze image pixel data to find dominant colors (K-means or simple quantization).

### 9. Utility & Comparisons
- **Comparison Mode**: A dual-view layout in the frontend to select and compare two images.
- **System Integration**: Use `tauri-plugin-opener` or custom commands to launch files in external editors.

### 10. Non-Destructive Edits
- **Rust Transforms**: Commands to rotate/flip using the `image` crate.

### 11. Intelligence & Analysis
- **Focus Peak**: Implement a Rust command using Sobel or Laplacian filters to identify sharp edges. Return a "heatmap" overlay to the frontend to visualize focus areas.
- **Smart Search (OCR)**: Integrate a local OCR engine (like `ocrs` or `leptess`) to extract text from images during the scan process, making screenshot and document contents searchable.

### 12. Refinement & Export [FIXING]
- **Heatmap Scaling Fix (V2)**:
    - Instead of just `grid`, I will use a JS-free approach where the container matches the image aspect ratio, OR ensure both images have `width: 100%; height: 100%; object-fit: contain` inside a fixed-size flex/grid container.
    - Actually, `position: absolute` heatmap on a `display: inline-block` wrapper around the image is safest.
- **Interactive Export Modal**:
    - Remove `prompt()` and `idx` logic.
    - Create a custom modal overlay in `index.html` with distinct buttons for each format.
    - Use the existing `showToast` for feedback.

## Verification Plan

### Automated Tests
- Run `npm run tauri dev` and verify no compilation errors.

### Manual Verification
1. **Scaling**: Open an image, enable "Focus", and resize the window/sidebar. Verify the green heatmap stays perfectly aligned with the sharp edges.
2. **Palette**: Select a vibrant image. Confirm 10 colors are shown.
3. **Export**: Click the Export button. Test JSON and CSS exports.
