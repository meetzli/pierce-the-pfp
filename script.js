(function () {
  "use strict";

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  let originalImage = null;
  let fileInputsWired = false;
  let slidersWired = false;

  let db = null;
  const DB_NAME = "PierceThePFPImages";
  const DB_VERSION = 1;
  const STORE_NAME = "recentImages";
  const MAX_RECENT_IMAGES = 12;

  function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });
  }

  function saveImageToDB(imageData, filename) {
    if (!db) return Promise.reject("Database not initialized");

    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const imageRecord = {
      filename: filename,
      imageData: imageData,
      timestamp: Date.now(),
      date: new Date().toLocaleDateString(),
    };

    return new Promise((resolve, reject) => {
      const request = store.add(imageRecord);
      request.onsuccess = () => {
        cleanupOldImages();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  function cleanupOldImages() {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("timestamp");

    const request = index.openCursor(null, "prev");
    let count = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        count++;
        if (count > MAX_RECENT_IMAGES) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  }

  function clearAllImages() {
    if (!db) return Promise.reject("Database not initialized");

    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function deleteImageById(id) {
    if (!db) return Promise.reject("Database not initialized");

    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function loadRecentImages() {
    if (!db) return Promise.resolve([]);

    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("timestamp");

    return new Promise((resolve, reject) => {
      const request = index.getAll();
      request.onsuccess = () => {
        const images = request.result.sort((a, b) => b.timestamp - a.timestamp);
        resolve(images);
      };
      request.onerror = () => reject(request.error);
    });
  }

  function displayRecentImages() {
    loadRecentImages()
      .then((images) => {
        const grid = document.getElementById("recentImagesGrid");
        const section = document.getElementById("recentImagesSection");

        if (!grid || !section) return;

        grid.innerHTML = "";

        if (images.length === 0) {
          section.style.display = "none";
          return;
        }

        section.style.display = "block";

        images.forEach((imageRecord) => {
          const item = document.createElement("div");
          item.className = "recent-image-item";

          const img = document.createElement("img");
          img.src = imageRecord.imageData;
          img.alt = imageRecord.filename;

          const date = document.createElement("div");
          date.className = "recent-image-date";
          date.textContent = imageRecord.date;

          const deleteBtn = document.createElement("div");
          deleteBtn.className = "delete-btn";
          deleteBtn.innerHTML = "×";
          deleteBtn.title = "Delete this image";

          deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm("Delete this image?")) {
              deleteImageById(imageRecord.id)
                .then(() => {
                  displayRecentImages();
                })
                .catch((error) => {
                  console.error("Error deleting image:", error);
                });
            }
          });

          item.appendChild(img);
          item.appendChild(date);
          item.appendChild(deleteBtn);

          item.addEventListener("click", () => {
            loadImageFromData(imageRecord.imageData, imageRecord.filename);
          });

          grid.appendChild(item);
        });
      })
      .catch((error) => {
        console.error("Error loading recent images:", error);
      });
  }

  function loadImageFromData(dataURL, filename) {
    const img = new Image();
    img.onload = function () {
      originalImage = img;
      setupCanvas();
      applyEffect();

      updateFileButtonsText(`📸 ${filename}`);
      updateUploadButtonText();
      const previewInfo = document.getElementById("previewInfo");
      if (previewInfo) previewInfo.style.display = "none";

      const panelToggle = document.getElementById("panelToggle");
      if (panelToggle) panelToggle.classList.add("visible");
      const downloadButton = document.querySelector(".download-button");
      if (downloadButton) downloadButton.style.display = "block";
      const backButton = document.getElementById("backButton");
      if (backButton) backButton.classList.add("visible");
    };
    img.src = dataURL;
  }
  const contrastSlider = document.getElementById("contrast");
  const brightnessSlider = document.getElementById("brightness");
  const yellowSlider = document.getElementById("yellowIntensity");
  const dotSizeSlider = document.getElementById("dotSize");
  const halftoneSlider = document.getElementById("halftoneIntensity");

  function updateDisplayValues() {
    const contrastValueEl = document.getElementById("contrastValue");
    const brightnessValueEl = document.getElementById("brightnessValue");
    const yellowValueEl = document.getElementById("yellowValue");
    const dotSizeValueEl = document.getElementById("dotSizeValue");
    const halftoneValueEl = document.getElementById("halftoneValue");

    if (contrastValueEl && contrastSlider)
      contrastValueEl.textContent = contrastSlider.value;
    if (brightnessValueEl && brightnessSlider)
      brightnessValueEl.textContent = brightnessSlider.value;
    if (yellowValueEl && yellowSlider)
      yellowValueEl.textContent = yellowSlider.value;
    if (dotSizeValueEl && dotSizeSlider)
      dotSizeValueEl.textContent = dotSizeSlider.value;
    if (halftoneValueEl && halftoneSlider)
      halftoneValueEl.textContent = halftoneSlider.value;
  }

  function updateUploadButtonText() {
    const uploadButton = document.getElementById("uploadButton");
    if (uploadButton) {
      if (originalImage) {
        uploadButton.textContent = "📸 Upload Another";
      } else {
        uploadButton.textContent = "📸 Upload Photo";
      }
    }
  }

  function updateFileButtonsText(text) {
    const buttons = document.querySelectorAll(".file-input-button");
    buttons.forEach((btn) => {
      if (btn.id === "centralUploadButton") {
        btn.textContent = text;
      } else {
        btn.textContent = text;
      }
    });
  }

  function handleFileSelect(file) {
    if (!file) return;

    updateFileButtonsText(`📸 ${file.name}`);

    const reader = new FileReader();
    reader.onload = function (event) {
      const img = new Image();
      img.onload = function () {
        originalImage = img;
        setupCanvas();
        applyEffect();
        const previewInfo = document.getElementById("previewInfo");
        if (previewInfo) previewInfo.style.display = "none";

        const saveCheckbox = document.getElementById("saveImageCheckbox");
        if (saveCheckbox && saveCheckbox.checked) {
          saveImageToDB(event.target.result, file.name)
            .then(() => {
              displayRecentImages();
            })
            .catch((error) => {
              console.error("Error saving image:", error);
            });
        }

        const panelToggle = document.getElementById("panelToggle");
        if (panelToggle) panelToggle.classList.add("visible");
        const downloadButton = document.querySelector(".download-button");
        if (downloadButton) downloadButton.style.display = "block";
        const backButton = document.getElementById("backButton");
        if (backButton) backButton.classList.add("visible");

        updateUploadButtonText();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  function wireFileInputs() {
    if (fileInputsWired) return;
    fileInputsWired = true;

    const wrappers = document.querySelectorAll(
      ".file-input-wrapper, .upload-wrapper"
    );
    wrappers.forEach((wrapper) => {
      const input = wrapper.querySelector(".file-input");
      const button = wrapper.querySelector(
        ".file-input-button, .upload-button"
      );

      if (!input || !button) return;

      button.addEventListener("click", (e) => {
        e.preventDefault();
        input.click();
      });

      input.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file && file.type && file.type.startsWith("image/")) {
          handleFileSelect(file);
          e.target.value = "";
        }
      });

      const onDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (button) button.style.backgroundColor = "rgba(255, 215, 0, 0.9)";
      };
      const onDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (button) button.style.backgroundColor = "";
      };
      const onDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (button) button.style.backgroundColor = "";
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) {
          const file = files[0];
          if (file.type && file.type.startsWith("image/")) {
            try {
              input.files = files;
            } catch (err) {}
            handleFileSelect(file);
          }
        }
      };

      wrapper.addEventListener("dragover", onDragOver);
      wrapper.addEventListener("dragleave", onDragLeave);
      wrapper.addEventListener("drop", onDrop);
      button.addEventListener("dragover", onDragOver);
      button.addEventListener("dragleave", onDragLeave);
      button.addEventListener("drop", onDrop);
    });
  }

  function setupCanvas() {
    if (!originalImage) return;

    const maxWidth = 800;
    const maxHeight = 600;

    let { width, height } = originalImage;

    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }

    if (height > maxHeight) {
      width = (width * maxHeight) / height;
      height = maxHeight;
    }

    canvas.width = width;
    canvas.height = height;
    canvas.style.display = "block";
  }

  function applyEffect() {
    if (!originalImage) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const contrast = contrastSlider
      ? parseFloat(contrastSlider.value) / 100
      : 1;
    const brightness = brightnessSlider
      ? parseFloat(brightnessSlider.value) / 100
      : 1;
    const yellowIntensity = yellowSlider
      ? parseFloat(yellowSlider.value) / 100
      : 0;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      let processed = gray * brightness;
      processed = (processed - 128) * contrast + 128;
      processed = Math.max(0, Math.min(255, processed));

      const normalizedGray = processed / 255;

      const fadeYellow = yellowIntensity * 0.85;
      const warmth = yellowIntensity * 0.25;

      if (normalizedGray > 0.6) {
        r = Math.min(255, processed + (250 - processed) * fadeYellow);
        g = Math.min(255, processed + (235 - processed) * fadeYellow);
        b = Math.max(0, processed * (1 - fadeYellow * 0.7) + 35 * warmth);
      } else if (normalizedGray > 0.25) {
        const yellowFactor = (normalizedGray - 0.25) / 0.35;
        r = processed + (230 - processed) * yellowFactor * fadeYellow;
        g = processed + (210 - processed) * yellowFactor * fadeYellow;
        b = processed * (1 - yellowFactor * fadeYellow * 0.6) + 25 * warmth;
      } else {
        r = processed * (0.95 + warmth * 0.15);
        g = processed * (0.85 + warmth * 0.12);
        b = processed * (0.65 + warmth * 0.08);
      }

      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }

    ctx.putImageData(imageData, 0, 0);
    applyHalftoneEffect();
  }

  function applyHalftoneEffect() {
    const halftoneIntensity = halftoneSlider
      ? parseFloat(halftoneSlider.value) / 100
      : 0;
    const cell = dotSizeSlider ? parseInt(dotSizeSlider.value, 10) : 4;

    if (halftoneIntensity <= 0) return;

    const w = canvas.width;
    const h = canvas.height;

    const srcData = ctx.getImageData(0, 0, w, h).data;

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "#000000";

    const gamma = 1.18;
    const jitterMax = cell * 0.18 * halftoneIntensity;

    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        let sum = 0;
        let count = 0;

        for (let dy = 0; dy < cell && y + dy < h; dy += 2) {
          let idx = ((y + dy) * w + x) * 4;
          for (let dx = 0; dx < cell && x + dx < w; dx += 2) {
            const r = srcData[idx];
            const g = srcData[idx + 1];
            const b = srcData[idx + 2];
            sum += 0.299 * r + 0.587 * g + 0.114 * b;
            count++;
            idx += 8;
          }
        }

        if (!count) continue;

        const avg = sum / count; // 0..255
        const tone = 1 - Math.pow(avg / 255, gamma); // 0 (light) .. 1 (dark)
        if (tone <= 0) continue;

        const maxRadius = cell * 0.5;
        const scale = 0.4 + 0.6 * halftoneIntensity;
        let radius = Math.sqrt(tone) * maxRadius * scale;

        if (radius < 0.25) continue;

        const jx = (Math.random() - 0.5) * jitterMax;
        const jy = (Math.random() - 0.5) * jitterMax;

        ctx.beginPath();
        ctx.arc(x + cell / 2 + jx, y + cell / 2 + jy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  window.downloadImage = function () {
    if (!originalImage) {
      alert("Please upload an image first!");
      return;
    }

    const link = document.createElement("a");
    link.download = "pierce-the-pfp-effect.png";
    link.href = canvas.toDataURL();
    link.click();
  };

  // Wire sliders to live preview
  if (!slidersWired) {
    slidersWired = true;
    [
      contrastSlider,
      brightnessSlider,
      yellowSlider,
      dotSizeSlider,
      halftoneSlider,
    ].forEach((slider) => {
      if (!slider) return;
      slider.addEventListener("input", function () {
        updateDisplayValues();
        if (originalImage) applyEffect();
      });
    });
  }

  updateDisplayValues();

  const controlsPanel = document.querySelector(".controls");
  const panelToggle = document.getElementById("panelToggle");
  const settingsOverlay = document.getElementById("settingsOverlay");

  if (panelToggle && controlsPanel) {
    panelToggle.addEventListener("click", () => {
      const isCollapsed = controlsPanel.classList.contains("collapsed");
      controlsPanel.classList.toggle("collapsed");

      if (settingsOverlay) {
        if (isCollapsed) {
          settingsOverlay.classList.add("active");
        } else {
          settingsOverlay.classList.remove("active");
        }
      }
    });
  }

  if (settingsOverlay && controlsPanel) {
    settingsOverlay.addEventListener("click", () => {
      controlsPanel.classList.add("collapsed");
      settingsOverlay.classList.remove("active");
    });
  }

  const backButton = document.getElementById("backButton");
  if (backButton) {
    backButton.addEventListener("click", () => {
      originalImage = null;
      const canvas = document.getElementById("canvas");
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = "none";
      }

      const panelToggle = document.getElementById("panelToggle");
      if (panelToggle) panelToggle.classList.remove("visible");
      const downloadButton = document.querySelector(".download-button");
      if (downloadButton) downloadButton.style.display = "none";
      backButton.classList.remove("visible");

      const previewInfo = document.getElementById("previewInfo");
      if (previewInfo) previewInfo.style.display = "block";

      updateFileButtonsText("📸 Choose Image");
      updateUploadButtonText();
      const fileInputs = document.querySelectorAll(".file-input");
      fileInputs.forEach((input) => (input.value = ""));
    });
  }

  const forgetButton = document.getElementById("forgetButton");
  if (forgetButton) {
    forgetButton.addEventListener("click", () => {
      if (
        confirm(
          "Are you sure you want to delete all saved images? This action cannot be undone."
        )
      ) {
        clearAllImages()
          .then(() => {
            displayRecentImages();
            originalImage = null;
            const canvas = document.getElementById("canvas");
            if (canvas) {
              const ctx = canvas.getContext("2d");
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              canvas.style.display = "none";
            }

            const panelToggle = document.getElementById("panelToggle");
            if (panelToggle) panelToggle.classList.remove("visible");
            const downloadButton = document.querySelector(".download-button");
            if (downloadButton) downloadButton.style.display = "none";
            const backButton = document.getElementById("backButton");
            if (backButton) backButton.classList.remove("visible");

            const previewInfo = document.getElementById("previewInfo");
            if (previewInfo) previewInfo.style.display = "block";

            updateFileButtonsText("📸 Choose Image");
            updateUploadButtonText();
            const fileInputs = document.querySelectorAll(".file-input");
            fileInputs.forEach((input) => (input.value = ""));
          })
          .catch((error) => {
            console.error("Error clearing images:", error);
          });
      }
    });
  }

  wireFileInputs();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      updateDisplayValues();
      wireFileInputs();
    });
  } else {
    updateDisplayValues();
  }

  initDB()
    .then(() => {
      displayRecentImages();
      updateUploadButtonText();
    })
    .catch((error) => {
      console.error("Error initializing database:", error);
    });
})();
