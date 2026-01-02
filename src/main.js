// No top-level destructuring to avoid race conditions
function getAssetUrl(path) {
  try {
    if (!window.__TAURI__ || !window.__TAURI__.core) {
      console.error("Tauri core not available for path:", path);
      return path;
    }
    const url = window.__TAURI__.core.convertFileSrc(path);
    console.log("SUCCESS: Converted", path, "to", url);
    return url;
  } catch (e) {
    console.error("convertFileSrc EXCEPTION for path:", path, e);
    return path;
  }
}

let scanBtn;
let searchInput;
let formatFilter;
let imageList;
let mainPreview;
let detailsPanel;
let metaContent;
let emptyViewer;
let openDirBtn;
let dualViewer;
let compareBtn;

let allImages = [];
let filteredImages = [];
let currentPath = "";

async function selectFolder() {
  const selected = await window.__TAURI__.dialog.open({
    directory: true,
    multiple: false,
    title: "Select Folder to Scan",
    defaultPath: "C:\\"
  });

  if (selected) {
    currentPath = selected;
    await performScan(selected);
  }
}

async function performScan(path) {
  try {
    const isRecursive = document.querySelector("#recursive-toggle")?.checked ?? true;
    allImages = await window.__TAURI__.core.invoke("scan_directory", {
      path,
      recursive: isRecursive
    });
    applyFilters();
  } catch (error) {
    console.error("Scan failed:", error);
    alert("Error scanning folder: " + error);
  }
}

async function showExportOptions(palette, fileName) {
  const modal = document.querySelector("#export-modal");
  if (!modal) {
    alert("Export modal not found.");
    return;
  }

  modal.style.display = "flex";

  const buttons = modal.querySelectorAll(".export-opt");
  buttons.forEach(btn => {
    btn.onclick = async () => {
      const format = btn.getAttribute("data-format");
      await exportPaletteToClipboard(palette, fileName, format);
      modal.style.display = "none";
    };
  });

  document.querySelector("#close-export").onclick = () => {
    modal.style.display = "none";
  };
}

async function exportPaletteToClipboard(palette, fileName, format) {
  let textToCopy = "";

  if (format === "css") {
    textToCopy = palette.map((c, i) => `--color-${i + 1}: ${c};`).join("\n");
  } else if (format === "json") {
    textToCopy = JSON.stringify({
      name: fileName,
      colors: palette
    }, null, 2);
  } else if (format === "csv") {
    textToCopy = "Index,Hex\n" + palette.map((c, i) => `${i + 1},${c}`).join("\n");
  } else {
    textToCopy = palette.join("\n");
  }

  await navigator.clipboard.writeText(textToCopy);
  showToast(`Palette copied as ${format.toUpperCase()}!`);
}

function showToast(msg) {
  const toast = document.createElement("div");
  toast.style = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--accent); color:white; padding:10px 20px; border-radius:30px; z-index:9999; box-shadow:0 10px 30px rgba(0,0,0,0.3); font-size:0.9rem; font-weight:600;";
  toast.innerText = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function renderList() {
  if (!imageList) return;
  imageList.innerHTML = "";

  if (filteredImages.length === 0) {
    imageList.innerHTML = '<div class="empty-state" style="padding: 2rem; color: var(--text-dim); text-align: center;">No images found.</div>';
    return;
  }

  filteredImages.forEach(async (img) => {
    const item = document.createElement("div");
    item.className = "image-item";

    // Request thumbnail from Rust
    let displayUrl;
    try {
      const thumbPath = await window.__TAURI__.core.invoke("get_thumbnail", {
        path: img.path
      });
      displayUrl = getAssetUrl(thumbPath);
    } catch (e) {
      console.error("Thumbnail generation failed, falling back to original:", e);
      displayUrl = getAssetUrl(img.path);
    }

    item.innerHTML = `
      <img src="${displayUrl}" class="thumb-small" loading="lazy" />
      <div class="image-info-mini">
        <div class="image-name-mini">${img.name}</div>
      </div>
    `;

    item.addEventListener("click", () => selectImage(img, item));
    imageList.appendChild(item);
  });
}

let compareMode = false;
let comparisonImages = [null, null]; // [A, B]

async function selectImage(img, element) {
  // Update UI selection
  if (!compareMode) {
    document.querySelectorAll(".image-item").forEach(el => el.classList.remove("active"));
    element.classList.add("active");
  }

  const assetUrl = getAssetUrl(img.path);

  if (compareMode) {
    // Comparison Logic
    if (!comparisonImages[0]) {
      comparisonImages[0] = img;
      document.querySelector("#compare-a").src = assetUrl;
      element.classList.add("active-a");
    } else {
      // Replace B, or if B exists, just update B
      comparisonImages[1] = img;
      document.querySelector("#compare-b").src = assetUrl;
      // Clear previous active-b
      document.querySelectorAll(".active-b").forEach(el => el.classList.remove("active-b"));
      element.classList.add("active-b");
    }
  } else {
    // Normal Mode
    mainPreview.src = assetUrl;
    document.querySelector("#preview-wrapper").style.display = "flex";
    mainPreview.style.display = "block";
    emptyViewer.style.display = "none";
    detailsPanel.style.display = "block";
    dualViewer.style.display = "none";

    // Reset focus peak when switching images
    const focusHeatmap = document.querySelector("#focus-heatmap");
    if (focusHeatmap) {
      focusHeatmap.style.display = "none";
      focusPeakMode = false;
      const focusBtn = document.querySelector("#focus-peak-btn");
      if (focusBtn) {
        focusBtn.style.backgroundColor = "var(--card-bg)";
        focusBtn.style.color = "var(--text-color)";
        focusBtn.style.display = "flex"; // Ensure it's shown
      }
    }

    // Show Open Dir & System buttons
    if (openDirBtn) {
      openDirBtn.style.display = "flex";
      const openSystemBtn = document.querySelector("#open-system-btn");
      if (openSystemBtn) openSystemBtn.style.display = "flex";
      currentPath = img.path;
    }

    // Show details
    try {
      const details = await window.__TAURI__.core.invoke("scan_image", {
        path: img.path
      });
      displayDetails(details);

      // Show transform toolbar
      const transformToolbar = document.querySelector("#transform-toolbar");
      if (transformToolbar) transformToolbar.style.display = "flex";

      // Update individual currentPath for transformations
      currentPath = img.path;
    } catch (error) {
      console.error("Failed to load details:", error);
    }
  }
}

async function handleTransform(action) {
  if (!currentPath) return;
  try {
    await window.__TAURI__.core.invoke("transform_image", {
      path: currentPath,
      action
    });

    // Refresh preview
    const timestamp = new Date().getTime();
    mainPreview.src = getAssetUrl(currentPath) + "?t=" + timestamp;

    // Refresh details
    const details = await window.__TAURI__.core.invoke("scan_image", {
      path: currentPath
    });
    displayDetails(details);

    // Note: thumbnail cache might be stale, but we can't easily clear it without more logic
    // or just updating the URL with a timestamp too if thumbnails are served via asset:
  } catch (error) {
    console.error("Transformation failed:", error);
    alert("Transformation failed: " + error);
  }
}

function displayDetails(data) {
  if (!metaContent) return;
  metaContent.innerHTML = "";

  // 3. Palette Section
  if (data.palette && data.palette.length > 0) {
    const paletteTitle = document.createElement("div");
    paletteTitle.className = "meta-label";
    paletteTitle.innerText = "Color Palette";
    metaContent.appendChild(paletteTitle);

    const paletteContainer = document.createElement("div");
    paletteContainer.className = "palette-container";
    data.palette.slice(0, 10).forEach(color => { // Limit to 10 colors
      const colorDiv = document.createElement("div");
      colorDiv.className = "palette-color";
      colorDiv.style.backgroundColor = color;
      colorDiv.title = `Click to copy: ${color}`;
      colorDiv.onclick = () => {
        navigator.clipboard.writeText(color);
        showToast(`Copied ${color}`);
      };
      paletteContainer.appendChild(colorDiv);
    });
    metaContent.appendChild(paletteContainer);

    const exportBtn = document.createElement("button");
    exportBtn.className = "export-palette-btn";
    exportBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
      Export Palette
    `;
    exportBtn.onclick = () => showExportOptions(data.palette, data.name);
    metaContent.appendChild(exportBtn);
  }

  // 2. Core Metadata
  const fields = [{
      label: "File Name",
      value: data.name
    },
    {
      label: "Dimensions",
      value: `${data.width} × ${data.height}`
    },
    {
      label: "Format",
      value: data.format
    },
    {
      label: "Color Space",
      value: data.color_type
    },
    {
      label: "Size",
      value: `${(data.size_bytes / 1024).toFixed(2)} KB`
    }
  ];

  fields.forEach(field => {
    const group = document.createElement("div");
    group.className = "meta-group";
    group.innerHTML = `
      <div class="meta-label">${field.label}</div>
      <div class="meta-value">${field.value}</div>
    `;
    metaContent.appendChild(group);
  });

  // 3. EXIF Section
  if (data.exif) {
    const exifSection = document.createElement("div");
    exifSection.className = "exif-section";
    const exifTitle = document.createElement("div");
    exifTitle.className = "meta-label";
    exifTitle.style.marginBottom = "0.75rem";
    exifTitle.innerText = "EXIF Metadata";
    exifSection.appendChild(exifTitle);

    Object.entries(data.exif).forEach(([key, value]) => {
      const item = document.createElement("div");
      item.className = "exif-item";
      item.innerHTML = `
        <span class="exif-label">${key}</span>
        <span class="exif-value">${value}</span>
      `;
      exifSection.appendChild(item);
    });
    metaContent.appendChild(exifSection);
  }

  // 4. Histogram Section
  if (data.histogram) {
    const histTitle = document.createElement("div");
    histTitle.className = "meta-label";
    histTitle.style.marginTop = "1.5rem";
    histTitle.innerText = "Brightness Histogram";
    metaContent.appendChild(histTitle);

    const histContainer = document.createElement("div");
    histContainer.className = "histogram-container";

    const maxVal = Math.max(...data.histogram);
    const step = Math.ceil(data.histogram.length / 64); // Sample 64 bars for performance/display

    for (let i = 0; i < data.histogram.length; i += step) {
      let val = 0;
      for (let j = 0; j < step && (i + j) < data.histogram.length; j++) {
        val = Math.max(val, data.histogram[i + j]);
      }
      const bar = document.createElement("div");
      bar.className = "histogram-bar";
      const height = (val / maxVal) * 100;
      bar.style.height = `${height}%`;
      histContainer.appendChild(bar);
    }
    metaContent.appendChild(histContainer);
  }

  // 5. OCR Section
  if (data.ocr_text || !data.ocr_text) { // Show section even if empty but with a scan button
    const ocrSection = document.createElement("div");
    ocrSection.className = "ocr-section";

    const ocrTitle = document.createElement("div");
    ocrTitle.className = "meta-label";
    ocrTitle.style.display = "flex";
    ocrTitle.style.justifyContent = "space-between";
    ocrTitle.style.alignItems = "center";
    ocrTitle.innerHTML = `
      <span>Extracted Text</span>
      <button id="run-ocr-btn" class="btn" style="padding: 2px 8px; font-size: 0.7rem; height: auto;">Scan Text</button>
    `;
    ocrSection.appendChild(ocrTitle);

    const ocrBox = document.createElement("div");
    ocrBox.className = "ocr-text-box";
    ocrBox.id = "ocr-result-box";
    ocrBox.innerText = data.ocr_text || "No text extracted. Click 'Scan Text' to recognize text in this image.";
    ocrSection.appendChild(ocrBox);

    metaContent.appendChild(ocrSection);

    document.querySelector("#run-ocr-btn")?.addEventListener("click", async () => {
      const btn = document.querySelector("#run-ocr-btn");
      const box = document.querySelector("#ocr-result-box");
      btn.innerText = "Scanning...";
      btn.disabled = true;
      try {
        const text = await window.__TAURI__.core.invoke("perform_ocr", {
          path: data.path
        });
        box.innerText = text || "No text found in image.";
        btn.innerText = "Re-scan";
      } catch (error) {
        console.error("OCR failed:", error);
        box.innerText = "OCR Error: " + error;
        btn.innerText = "Retry";
      } finally {
        btn.disabled = false;
      }
    });
  }
}

function applyFilters() {
  const query = searchInput ? searchInput.value.toLowerCase() : "";
  const format = formatFilter ? formatFilter.value : "all";

  filteredImages = allImages.filter(img => {
    const matchesSearch = img.name.toLowerCase().includes(query) || img.path.toLowerCase().includes(query);
    const matchesFormat = format === "all" || img.name.toLowerCase().endsWith("." + format) || (format === "jpg" && img.name.toLowerCase().endsWith(".jpeg"));
    return matchesSearch && matchesFormat;
  });

  renderList();
}

window.addEventListener("DOMContentLoaded", () => {
  scanBtn = document.querySelector("#scan-btn");
  searchInput = document.querySelector("#search-input");
  formatFilter = document.querySelector("#format-filter");
  imageList = document.querySelector("#image-list");
  mainPreview = document.querySelector("#main-preview");
  detailsPanel = document.querySelector("#details-panel");
  metaContent = document.querySelector("#meta-content");
  emptyViewer = document.querySelector("#empty-viewer");
  openDirBtn = document.querySelector("#open-dir-btn");
  compareBtn = document.querySelector("#compare-btn");
  dualViewer = document.querySelector("#dual-viewer");

  if (scanBtn) scanBtn.addEventListener("click", selectFolder);

  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
  }

  if (formatFilter) {
    formatFilter.addEventListener("change", applyFilters);
  }

  if (compareBtn) {
    compareBtn.addEventListener("click", () => {
      compareMode = !compareMode;
      compareBtn.style.backgroundColor = compareMode ? "var(--accent)" : "var(--card-bg)";
      compareBtn.style.color = compareMode ? "white" : "var(--text-color)";

      if (compareMode) {
        mainPreview.style.display = "none";
        dualViewer.style.display = "flex";
        emptyViewer.style.display = "none";
        // Reset comparison
        comparisonImages = [null, null];
        document.querySelector("#compare-a").src = "";
        document.querySelector("#compare-b").src = "";
        document.querySelectorAll(".active, .active-a, .active-b").forEach(el => el.classList.remove("active", "active-a", "active-b"));
      } else {
        emptyViewer.style.display = "flex";
      }
    });
  }

  // Transform Button Listeners
  document.querySelector("#rotate-ccw")?.addEventListener("click", () => handleTransform("rotate270"));
  document.querySelector("#rotate-cw")?.addEventListener("click", () => handleTransform("rotate90"));
  document.querySelector("#flip-h")?.addEventListener("click", () => handleTransform("flip_h"));
  document.querySelector("#flip-v")?.addEventListener("click", () => handleTransform("flip_v"));
  document.querySelector("#strip-meta")?.addEventListener("click", () => {
    if (confirm("This will overwrite the original file and strip most metadata. Proceed?")) {
      handleTransform("strip_meta");
    }
  });



  let focusPeakMode = false;
  document.querySelector("#focus-peak-btn")?.addEventListener("click", async () => {
    if (!currentPath) return;
    const focusBtn = document.querySelector("#focus-peak-btn");
    const heatmapImg = document.querySelector("#focus-heatmap");

    focusPeakMode = !focusPeakMode;
    focusBtn.style.backgroundColor = focusPeakMode ? "var(--accent)" : "var(--card-bg)";
    focusBtn.style.color = focusPeakMode ? "white" : "var(--text-color)";

    if (focusPeakMode) {
      try {
        focusBtn.innerText = "Processing...";
        const heatmapPath = await window.__TAURI__.core.invoke("generate_focus_heatmap", {
          path: currentPath
        });
        heatmapImg.src = getAssetUrl(heatmapPath);
        heatmapImg.style.display = "block";
        focusBtn.innerText = "Focus";
      } catch (error) {
        console.error("Focus peak failed:", error);
        focusPeakMode = false;
        focusBtn.style.backgroundColor = "var(--card-bg)";
        focusBtn.style.color = "var(--text-color)";
        focusBtn.innerText = "Focus Error";
      }
    } else {
      heatmapImg.style.display = "none";
    }
  });

  document.querySelector("#open-system-btn")?.addEventListener("click", async () => {
    console.log("Opening in system viewer:", currentPath);
    if (currentPath) {
      try {
        await window.__TAURI__.core.invoke("plugin:opener|open_path", {
          path: currentPath
        });
      } catch (error) {
        console.error("Failed to open file in system:", error);
        alert("Failed to open file in system: " + error);
      }
    } else {
      alert("No image selected.");
    }
  });

  if (openDirBtn) {
    openDirBtn.addEventListener("click", async () => {
      console.log("Opening directory:", currentPath);
      if (currentPath) {
        try {
          await window.__TAURI__.core.invoke("open_folder", {
            path: currentPath
          });
        } catch (error) {
          console.error("Failed to open folder:", error);
          alert("Failed to open folder: " + error);
        }
      } else {
        alert("No image selected yet.");
      }
    });
  }

  // Theme Management
  function applyTheme(theme) {
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('theme-preference', theme);
    console.log("Applied theme:", theme);
  }

  // About Modal Logic
  const aboutModal = document.querySelector("#about-modal");
  const closeAboutBtn = document.querySelector("#close-about");

  function showAbout() {
    if (aboutModal) aboutModal.style.display = "flex";
  }

  function hideAbout() {
    if (aboutModal) aboutModal.style.display = "none";
  }

  if (closeAboutBtn) closeAboutBtn.addEventListener("click", hideAbout);
  if (aboutModal) {
    aboutModal.addEventListener("click", (e) => {
      if (e.target === aboutModal) hideAbout();
    });
  }

  // Listen for menu events from Rust
  if (window.__TAURI__ && window.__TAURI__.event) {
    window.__TAURI__.event.listen("theme-change", (event) => {
      applyTheme(event.payload);
    });

    window.__TAURI__.event.listen("menu-scan", () => {
      selectFolder();
    });

    window.__TAURI__.event.listen("menu-open-dir", () => {
      if (openDirBtn && openDirBtn.style.display !== 'none') openDirBtn.click();
    });

    window.__TAURI__.event.listen("menu-about", () => {
      showAbout();
    });
  }

  // Initial Theme Load
  const savedTheme = localStorage.getItem('theme-preference') || 'system';
  applyTheme(savedTheme);

  // Watch for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem('theme-preference') === 'system') {
      applyTheme('system');
    }
  });
});