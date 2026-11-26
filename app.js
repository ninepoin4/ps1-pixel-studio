/**
 * PS1 Pixel Studio — Main UI & Interactive Controller
 */
(function () {
  'use strict';

  const Engine = window.PS1PixelEngine;
  const AudioFX = window.PS1Audio;
  const ZipBuilder = window.PS1ZipBuilder;

  const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
  const supportsDirPicker = typeof window.showDirectoryPicker === 'function';

  // Application State
  const state = {
    assets: [],
    activeAssetId: null,
    undoStack: [],
    activePresetId: 'rpg-outline',
    params: null,
    viewMode: 'split', // 'split' | 'wipe' | 'output'
    zoom: 'fit',       // 'fit' | 2 | 4 | 8 | 12
    backdrop: 'bg-checker',
    showGrid: false,
    crtOn: false,
    wipeRatio: 0.5,
    lastResult: null,
    batchBusy: false,
  };

  // DOM References
  const el = {
    fileInput: document.getElementById('fileInput'),
    folderInput: document.getElementById('folderInput'),
    btnUpload: document.getElementById('btnUpload'),
    btnUploadFolder: document.getElementById('btnUploadFolder'),
    btnCompareAll: document.getElementById('btnCompareAll'),
    btnToggleCrt: document.getElementById('btnToggleCrt'),
    btnToggleSfx: document.getElementById('btnToggleSfx'),
    btnExportMain: document.getElementById('btnExportMain'),
    btnExportSide: document.getElementById('btnExportSide'),
    btnResetPreset: document.getElementById('btnResetPreset'),
    btnToggleGrid: document.getElementById('btnToggleGrid'),

    memcardSection: document.getElementById('memcardSection'),
    slotCountBadge: document.getElementById('slotCountBadge'),
    btnUndoSlot: document.getElementById('btnUndoSlot'),
    btnClearSlots: document.getElementById('btnClearSlots'),
    btnRestoreSample: document.getElementById('btnRestoreSample'),
    batchBar: document.getElementById('batchBar'),
    btnBatchExport: document.getElementById('btnBatchExport'),
    btnBatchDir: document.getElementById('btnBatchDir'),

    telemetryText: document.getElementById('telemetryText'),
    activeStyleBadge: document.getElementById('activeStyleBadge'),
    memcardGrid: document.getElementById('memcardGrid'),
    presetList: document.getElementById('presetList'),

    viewModeGroup: document.getElementById('viewModeGroup'),
    zoomGroup: document.getElementById('zoomGroup'),
    bgGroup: document.getElementById('bgGroup'),
    crtScreen: document.getElementById('crtScreen'),
    stageBackdrop: document.getElementById('stageBackdrop'),

    splitView: document.getElementById('splitView'),
    wipeView: document.getElementById('wipeView'),
    outputView: document.getElementById('outputView'),
    emptyStateView: document.getElementById('emptyStateView'),
    emptyBtnUpload: document.getElementById('emptyBtnUpload'),
    emptyBtnFolder: document.getElementById('emptyBtnFolder'),
    emptyBtnSample: document.getElementById('emptyBtnSample'),
    emptyBtnUndo: document.getElementById('emptyBtnUndo'),

    origLabel: document.getElementById('origLabel'),
    pixelLabel: document.getElementById('pixelLabel'),
    origPreviewImg: document.getElementById('origPreviewImg'),
    splitOutFrame: document.getElementById('splitOutFrame'),
    splitOutCanvas: document.getElementById('splitOutCanvas'),
    splitGridOverlay: document.getElementById('splitGridOverlay'),

    wipePixelCanvas: document.getElementById('wipePixelCanvas'),
    wipeOrigLayer: document.getElementById('wipeOrigLayer'),
    wipeOrigImg: document.getElementById('wipeOrigImg'),
    wipeHandle: document.getElementById('wipeHandle'),

    singleOutFrame: document.getElementById('singleOutFrame'),
    singleOutCanvas: document.getElementById('singleOutCanvas'),
    singleGridOverlay: document.getElementById('singleGridOverlay'),
    rpgItemCaption: document.getElementById('rpgItemCaption'),

    clutMeta: document.getElementById('clutMeta'),
    clutSwatches: document.getElementById('clutSwatches'),

    // Controls
    rngWidth: document.getElementById('rngWidth'),
    valWidth: document.getElementById('valWidth'),
    selSampling: document.getElementById('selSampling'),
    rngAlpha: document.getElementById('rngAlpha'),
    valAlpha: document.getElementById('valAlpha'),
    chkSoftAlpha: document.getElementById('chkSoftAlpha'),

    rngSharpen: document.getElementById('rngSharpen'),
    valSharpen: document.getElementById('valSharpen'),
    rngContrast: document.getElementById('rngContrast'),
    valContrast: document.getElementById('valContrast'),
    rngSaturation: document.getElementById('rngSaturation'),
    valSaturation: document.getElementById('valSaturation'),

    selPalette: document.getElementById('selPalette'),
    colorCountRow: document.getElementById('colorCountRow'),
    rngColors: document.getElementById('rngColors'),
    valColors: document.getElementById('valColors'),
    selDither: document.getElementById('selDither'),
    ditherStrengthRow: document.getElementById('ditherStrengthRow'),
    rngDither: document.getElementById('rngDither'),
    valDither: document.getElementById('valDither'),

    selOutline: document.getElementById('selOutline'),
    chkCleanOrphans: document.getElementById('chkCleanOrphans'),
    chkSafePadding: document.getElementById('chkSafePadding'),
    selExportScale: document.getElementById('selExportScale'),
    selExportBg: document.getElementById('selExportBg'),

    compareModal: document.getElementById('compareModal'),
    matrixGrid: document.getElementById('matrixGrid'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    btnExportMatrix: document.getElementById('btnExportMatrix'),
  };

  function shapeSymbol(shape) {
    if (shape === 'triangle') return '<span class="g-tri">▲</span>';
    if (shape === 'circle') return '<span class="g-cir">●</span>';
    if (shape === 'cross') return '<span class="g-cro">✕</span>';
    return '<span class="g-squ">■</span>';
  }

  function getActiveAsset() {
    return state.assets.find((a) => a.id === state.activeAssetId) || state.assets[0] || null;
  }

  function getPresetById(id) {
    return Engine.STYLE_PRESETS.find((p) => p.id === id) || Engine.STYLE_PRESETS[0];
  }

  function isImageFile(file) {
    return Boolean(file) && (
      (file.type && file.type.startsWith('image/')) ||
      IMAGE_EXT_RE.test(file.name || '')
    );
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('File read error'));
      reader.readAsDataURL(file);
    });
  }

  function loadImageFromSrc(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err || new Error('Image decode error'));
      img.src = src;
    });
  }

  function createThumbnailDataUrl(img) {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(size / w, size / h);
    const dw = Math.max(1, Math.round(w * scale));
    const dh = Math.max(1, Math.round(h * scale));
    ctx.drawImage(img, Math.round((size - dw) / 2), Math.round((size - dh) / 2), dw, dh);
    return c.toDataURL('image/png');
  }

  /**
   * Ensure asset has full decoded Image (and dataUrl for preview) loaded on demand.
   */
  async function ensureAssetLoaded(asset) {
    if (!asset) return null;
    if (asset.img && asset.dataUrl) return asset;
    if (asset.file) {
      const dataUrl = asset.dataUrl || (await readFileAsDataUrl(asset.file));
      const img = asset.img || (await loadImageFromSrc(dataUrl));
      asset.dataUrl = dataUrl;
      asset.img = img;
      return asset;
    }
    return asset;
  }

  // Undo History Management
  function pushUndoSnapshot() {
    state.undoStack.push({
      assets: state.assets.slice(),
      activeAssetId: state.activeAssetId,
    });
    if (state.undoStack.length > 25) {
      state.undoStack.shift();
    }
    updateSlotHeaderControls();
  }

  async function undoSlotChange() {
    if (!state.undoStack.length || state.batchBusy) return;
    const prev = state.undoStack.pop();
    state.assets = prev.assets;
    state.activeAssetId = prev.activeAssetId;
    AudioFX.tick();
    renderMemoryCards();
    await activateAndRenderCurrent();
  }

  async function deleteAssetById(id) {
    if (state.batchBusy) return;
    const idx = state.assets.findIndex((a) => a.id === id);
    if (idx === -1) return;

    pushUndoSnapshot();
    state.assets.splice(idx, 1);

    if (state.activeAssetId === id) {
      if (state.assets.length > 0) {
        const nextIdx = Math.min(idx, state.assets.length - 1);
        state.activeAssetId = state.assets[nextIdx].id;
      } else {
        state.activeAssetId = null;
      }
    }

    AudioFX.tick();
    renderMemoryCards();
    await activateAndRenderCurrent();
  }

  async function clearAllAssets() {
    if (!state.assets.length || state.batchBusy) return;
    pushUndoSnapshot();
    state.assets = [];
    state.activeAssetId = null;
    AudioFX.tick();
    renderMemoryCards();
    await activateAndRenderCurrent();
  }

  async function restoreSampleAsset() {
    if (state.batchBusy) return;
    const samples = window.PS1_SAMPLE_ASSETS || [];
    if (!samples.length) return;

    const existing = state.assets.find((a) => a.id === samples[0].id);
    if (existing) {
      state.activeAssetId = existing.id;
      AudioFX.load();
      renderMemoryCards();
      await activateAndRenderCurrent();
      return;
    }

    pushUndoSnapshot();
    const item = samples[0];
    const img = await loadImageFromSrc(item.dataUrl);
    state.assets.unshift({
      id: item.id,
      name: item.name,
      label: item.label,
      relativePath: item.name,
      file: null,
      dataUrl: item.dataUrl,
      thumbUrl: createThumbnailDataUrl(img),
      img,
    });
    state.activeAssetId = item.id;
    AudioFX.load();
    renderMemoryCards();
    await activateAndRenderCurrent();
  }

  function updateSlotHeaderControls() {
    const count = state.assets.length;
    el.slotCountBadge.textContent = `${count} 张`;
    el.btnUndoSlot.disabled = state.undoStack.length === 0;
    el.btnClearSlots.disabled = count === 0;

    const hasSample = state.assets.some((a) => a.id === 'sample-soap');
    el.btnRestoreSample.classList.toggle('hidden', hasSample);
    el.emptyBtnUndo.classList.toggle('hidden', state.undoStack.length === 0);

    el.batchBar.classList.toggle('hidden', count === 0);
    if (!state.batchBusy) {
      el.btnBatchExport.querySelector('span').textContent =
        count > 1 ? `批量打包导出 ZIP (${count} 张)` : '打包导出 ZIP (1 张)';
      el.btnBatchDir.classList.toggle('hidden', !supportsDirPicker || count === 0);
    }
  }

  function selectPreset(presetId, silent) {
    const preset = getPresetById(presetId);
    state.activePresetId = preset.id;
    state.params = Object.assign({}, preset.params);
    if (!silent) AudioFX.select();
    renderPresetButtons();
    syncControlsFromParams();
    processAndRender();
  }

  function renderPresetButtons() {
    el.presetList.innerHTML = '';
    Engine.STYLE_PRESETS.forEach((preset) => {
      const btn = document.createElement('button');
      btn.className = 'preset-btn' + (preset.id === state.activePresetId ? ' active' : '');
      btn.dataset.presetId = preset.id;
      btn.innerHTML = `
        <div class="preset-top">
          <span class="preset-title">${preset.code} · ${preset.name}</span>
          <span class="preset-tag">${shapeSymbol(preset.shape)} ${preset.tag}</span>
        </div>
        <div class="preset-desc">${preset.desc}</div>
      `;
      btn.addEventListener('click', () => selectPreset(preset.id, false));
      el.presetList.appendChild(btn);
    });
  }

  function renderMemoryCards() {
    el.memcardGrid.innerHTML = '';
    state.assets.forEach((asset, idx) => {
      const slot = document.createElement('div');
      slot.className = 'mem-slot' + (asset.id === state.activeAssetId ? ' active' : '');
      slot.title = asset.relativePath || asset.name;

      const delBtn = document.createElement('button');
      delBtn.className = 'mem-slot-del';
      delBtn.type = 'button';
      delBtn.title = `移除 ${asset.name}`;
      delBtn.textContent = '×';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteAssetById(asset.id);
      });

      const imgEl = document.createElement('img');
      imgEl.src = asset.thumbUrl || asset.dataUrl;
      imgEl.alt = asset.label;

      const nameEl = document.createElement('div');
      nameEl.className = 'mem-slot-name';
      nameEl.textContent = `${String(idx + 1).padStart(2, '0')}:${asset.label}`;

      slot.appendChild(delBtn);
      slot.appendChild(imgEl);
      slot.appendChild(nameEl);

      slot.addEventListener('click', async () => {
        if (state.activeAssetId !== asset.id && !state.batchBusy) {
          state.activeAssetId = asset.id;
          AudioFX.tick();
          renderMemoryCards();
          await activateAndRenderCurrent();
        }
      });

      el.memcardGrid.appendChild(slot);
    });

    const addFileSlot = document.createElement('div');
    addFileSlot.className = 'mem-slot add-slot';
    addFileSlot.innerHTML = '<span>＋ 图片</span><span style="font-size:10px;opacity:0.78;">多选/粘贴</span>';
    addFileSlot.addEventListener('click', () => el.fileInput.click());
    el.memcardGrid.appendChild(addFileSlot);

    const addFolderSlot = document.createElement('div');
    addFolderSlot.className = 'mem-slot add-slot';
    addFolderSlot.innerHTML = '<span>▤ 文件夹</span><span style="font-size:10px;opacity:0.78;">整目录导入</span>';
    addFolderSlot.addEventListener('click', () => el.folderInput.click());
    el.memcardGrid.appendChild(addFolderSlot);

    updateSlotHeaderControls();
  }

  function syncControlsFromParams() {
    const p = state.params;
    el.rngWidth.value = p.targetWidth;
    el.valWidth.textContent = `${p.targetWidth} PX`;

    el.selSampling.value = p.sampling;
    el.rngAlpha.value = p.alphaThreshold;
    el.valAlpha.textContent = String(p.alphaThreshold);
    el.chkSoftAlpha.checked = Boolean(p.keepSoftAlpha);

    el.rngSharpen.value = p.sharpen;
    el.valSharpen.textContent = `${p.sharpen}%`;

    el.rngContrast.value = p.contrast;
    el.valContrast.textContent = p.contrast > 0 ? `+${p.contrast}` : String(p.contrast);

    el.rngSaturation.value = p.saturation;
    el.valSaturation.textContent = p.saturation > 0 ? `+${p.saturation}` : String(p.saturation);

    el.selPalette.value = p.paletteMode;
    el.rngColors.value = p.colorCount;
    el.valColors.textContent = `${p.colorCount} 色`;
    el.colorCountRow.style.opacity = p.paletteMode === 'auto' ? '1' : '0.42';
    el.rngColors.disabled = p.paletteMode !== 'auto';

    el.selDither.value = p.ditherMode;
    el.rngDither.value = p.ditherStrength;
    el.valDither.textContent = `${p.ditherStrength}%`;
    const ditherEnabled = p.ditherMode !== 'none' && p.paletteMode !== 'full';
    el.ditherStrengthRow.style.opacity = ditherEnabled ? '1' : '0.42';
    el.rngDither.disabled = !ditherEnabled;

    el.selOutline.value = p.outline;
    el.chkCleanOrphans.checked = Boolean(p.cleanOrphans);
    el.chkSafePadding.checked = Boolean(p.safePadding);

    const preset = getPresetById(state.activePresetId);
    el.activeStyleBadge.textContent = preset ? preset.tag : 'CUSTOM';
  }

  let renderRaf = 0;
  function scheduleProcess() {
    if (renderRaf) cancelAnimationFrame(renderRaf);
    renderRaf = requestAnimationFrame(() => {
      renderRaf = 0;
      processAndRender();
    });
  }

  function computeDisplaySize(pixelW, pixelH, maxBoxW, maxBoxH) {
    if (state.zoom !== 'fit') {
      const mult = Number(state.zoom);
      return {
        w: pixelW * mult,
        h: pixelH * mult,
      };
    }
    const scale = Math.min(maxBoxW / pixelW, maxBoxH / pixelH);
    const niceScale = Math.max(1, scale);
    return {
      w: Math.round(pixelW * niceScale),
      h: Math.round(pixelH * niceScale),
    };
  }

  function applyGridOverlay(overlayEl, pixelW, pixelH, dispW, dispH) {
    if (!state.showGrid) {
      overlayEl.classList.add('hidden');
      return;
    }
    const cellW = dispW / pixelW;
    const cellH = dispH / pixelH;
    if (cellW < 3 || cellH < 3) {
      overlayEl.classList.add('hidden');
      return;
    }
    overlayEl.classList.remove('hidden');
    overlayEl.style.backgroundImage =
      `linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px),` +
      `linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)`;
    overlayEl.style.backgroundSize = `${cellW}px ${cellH}px`;
  }

  function drawCanvasToTarget(targetCanvas, srcCanvas, dispW, dispH) {
    targetCanvas.width = srcCanvas.width;
    targetCanvas.height = srcCanvas.height;
    targetCanvas.style.width = `${dispW}px`;
    targetCanvas.style.height = `${dispH}px`;
    const ctx = targetCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    ctx.drawImage(srcCanvas, 0, 0);
  }

  async function activateAndRenderCurrent() {
    const asset = getActiveAsset();
    if (!asset) {
      state.lastResult = null;
      renderEmptyState();
      return;
    }
    await ensureAssetLoaded(asset);
    processAndRender();
  }

  function renderEmptyState() {
    el.splitView.classList.add('hidden');
    el.wipeView.classList.add('hidden');
    el.outputView.classList.add('hidden');
    el.emptyStateView.classList.remove('hidden');
    el.telemetryText.textContent = 'MEMCARD EMPTY · NO ACTIVE IMAGE';
    el.clutMeta.textContent = 'VRAM CLUT: 0 COLORS · --×-- PX';
    el.clutSwatches.innerHTML = '';
    updateSlotHeaderControls();
  }

  function processAndRender() {
    const asset = getActiveAsset();
    if (!asset) {
      renderEmptyState();
      return;
    }
    if (!asset.img) {
      ensureAssetLoaded(asset).then(() => processAndRender());
      return;
    }

    el.emptyStateView.classList.add('hidden');

    const result = Engine.processImage(asset.img, state.params);
    state.lastResult = result;

    const preset = getPresetById(state.activePresetId);
    el.telemetryText.textContent =
      `${result.width}×${result.height} PX · ${result.totalUniqueColors} COLORS · ${preset.tag} · ${result.renderTimeMs}ms`;

    el.origLabel.textContent = `ORIG // ${asset.img.naturalWidth}×${asset.img.naturalHeight}`;
    el.pixelLabel.textContent = `PIXEL // ${result.width}×${result.height} · ${preset.name}`;

    renderViewport(asset, result);
    renderClut(result);
  }

  function renderViewport(asset, result) {
    if (!asset || !result) return;

    const rect = el.crtScreen.getBoundingClientRect();
    const availW = Math.max(240, rect.width - 56);
    const availH = Math.max(240, rect.height - 64);

    el.splitView.classList.toggle('hidden', state.viewMode !== 'split');
    el.wipeView.classList.toggle('hidden', state.viewMode !== 'wipe');
    el.outputView.classList.toggle('hidden', state.viewMode !== 'output');

    const isRpgSlot = state.backdrop === 'bg-rpgslot';
    el.splitOutFrame.classList.toggle('rpg-item-box', isRpgSlot);
    el.singleOutFrame.classList.toggle('rpg-item-box', isRpgSlot);

    if (state.viewMode === 'split') {
      const halfW = Math.max(140, (availW - 44) / 2);
      const paneH = Math.max(180, availH - 36);
      const disp = computeDisplaySize(result.width, result.height, halfW, paneH);

      el.origPreviewImg.src = asset.dataUrl;
      el.origPreviewImg.style.width = `${disp.w}px`;
      el.origPreviewImg.style.height = `${disp.h}px`;

      drawCanvasToTarget(el.splitOutCanvas, result.canvas, disp.w, disp.h);
      applyGridOverlay(el.splitGridOverlay, result.width, result.height, disp.w, disp.h);
    } else if (state.viewMode === 'wipe') {
      const disp = computeDisplaySize(result.width, result.height, availW, availH);
      el.wipeView.style.width = `${disp.w}px`;
      el.wipeView.style.height = `${disp.h}px`;

      drawCanvasToTarget(el.wipePixelCanvas, result.canvas, disp.w, disp.h);
      el.wipeOrigImg.src = asset.dataUrl;
      el.wipeOrigImg.style.width = `${disp.w}px`;
      el.wipeOrigImg.style.height = `${disp.h}px`;

      updateWipePosition(state.wipeRatio);
    } else {
      const disp = computeDisplaySize(result.width, result.height, availW - 40, availH - 40);
      drawCanvasToTarget(el.singleOutCanvas, result.canvas, disp.w, disp.h);
      applyGridOverlay(el.singleGridOverlay, result.width, result.height, disp.w, disp.h);

      el.rpgItemCaption.classList.toggle('hidden', !isRpgSlot);
      if (isRpgSlot) {
        const preset = getPresetById(state.activePresetId);
        el.rpgItemCaption.textContent = `ITEM: ${asset.label.toUpperCase()}  |  ${result.width}×${result.height}  |  ${preset.tag}`;
      }
    }
  }

  function updateWipePosition(ratio) {
    state.wipeRatio = Math.max(0.02, Math.min(0.98, ratio));
    const pct = (state.wipeRatio * 100).toFixed(2);
    el.wipeHandle.style.left = `${pct}%`;
    el.wipeOrigLayer.style.clipPath = `inset(0 ${(100 - Number(pct)).toFixed(2)}% 0 0)`;
  }

  function renderClut(result) {
    el.clutMeta.textContent = `VRAM CLUT: ${result.totalUniqueColors} COLORS · ${result.width}×${result.height} PX`;
    el.clutSwatches.innerHTML = '';
    const maxChips = 36;
    const list = result.usedColors.slice(0, maxChips);
    list.forEach(([r, g, b]) => {
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      const chip = document.createElement('div');
      chip.className = 'clut-chip';
      chip.style.backgroundColor = hex;
      chip.title = hex;
      el.clutSwatches.appendChild(chip);
    });
    if (result.totalUniqueColors > maxChips) {
      const more = document.createElement('span');
      more.style.cssText = 'font-family:var(--font-mono);font-size:10px;color:#3d4b3f;margin-left:4px;';
      more.textContent = `+${result.totalUniqueColors - maxChips}`;
      el.clutSwatches.appendChild(more);
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function downloadCanvasPng(canvas, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  function exportCurrentAsset() {
    const asset = getActiveAsset();
    if (!asset || !state.lastResult) return;
    const scale = Number(el.selExportScale.value || 8);
    const bg = el.selExportBg.value || 'transparent';
    const out = Engine.buildExportCanvas(state.lastResult.canvas, scale, bg);
    const baseName = asset.name.replace(/\.[^.]+$/, '');
    downloadCanvasPng(out, `${baseName}_${state.activePresetId}_${scale}x.png`);
    AudioFX.confirm();
  }

  function buildUniqueExportPath(asset, scale, usedNames) {
    const rel = (asset.relativePath || asset.name || 'asset.png').replace(/\\/g, '/');
    const cleanRel = rel.replace(/^\/+/, '');
    const dotIdx = cleanRel.lastIndexOf('.');
    const stem = dotIdx > 0 ? cleanRel.slice(0, dotIdx) : cleanRel;
    let candidate = `${stem}_${state.activePresetId}_${scale}x.png`;

    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    let seq = 2;
    while (usedNames.has(`${stem}_${state.activePresetId}_${scale}x_${seq}.png`)) {
      seq++;
    }
    candidate = `${stem}_${state.activePresetId}_${scale}x_${seq}.png`;
    usedNames.add(candidate);
    return candidate;
  }

  async function exportBatchZip() {
    if (!state.assets.length || state.batchBusy) return;
    state.batchBusy = true;
    const scale = Number(el.selExportScale.value || 8);
    const bg = el.selExportBg.value || 'transparent';
    const total = state.assets.length;
    const entries = [];
    const usedNames = new Set();

    try {
      for (let i = 0; i < total; i++) {
        const asset = state.assets[i];
        el.btnBatchExport.querySelector('span').textContent = `打包中 (${i + 1}/${total})...`;
        el.telemetryText.textContent = `BATCH ZIP: CONVERTING ${i + 1} / ${total} ...`;
        await new Promise((r) => setTimeout(r, 0));

        // Load transient copy if file wasn't decoded yet without bloating active memory
        let img = asset.img;
        if (!img && asset.file) {
          const url = await readFileAsDataUrl(asset.file);
          img = await loadImageFromSrc(url);
        }
        if (!img) continue;

        const res = Engine.processImage(img, state.params);
        const outCanvas = Engine.buildExportCanvas(res.canvas, scale, bg);
        const blob = await canvasToPngBlob(outCanvas);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        entries.push({
          name: buildUniqueExportPath(asset, scale, usedNames),
          data: bytes,
        });
      }

      if (entries.length) {
        const zipBlob = ZipBuilder.buildZipBlob(entries);
        downloadBlob(zipBlob, `ps1_pixel_${state.activePresetId}_${scale}x_${entries.length}pcs.zip`);
        AudioFX.confirm();
      }
    } finally {
      state.batchBusy = false;
      updateSlotHeaderControls();
      processAndRender();
    }
  }

  async function writeFileToSubdir(rootHandle, relPath, blob) {
    const parts = relPath.split('/').filter(Boolean);
    const filename = parts.pop();
    let dir = rootHandle;
    for (let i = 0; i < parts.length; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    const fh = await dir.getFileHandle(filename, { create: true });
    const writable = await fh.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  async function exportBatchToDirectory() {
    if (!supportsDirPicker || !state.assets.length || state.batchBusy) return;
    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (_) {
      return; // User cancelled directory picker
    }

    state.batchBusy = true;
    const scale = Number(el.selExportScale.value || 8);
    const bg = el.selExportBg.value || 'transparent';
    const total = state.assets.length;
    const usedNames = new Set();

    try {
      for (let i = 0; i < total; i++) {
        const asset = state.assets[i];
        el.btnBatchDir.querySelector('span').textContent = `写入 (${i + 1}/${total})...`;
        el.telemetryText.textContent = `BATCH DIR: WRITING ${i + 1} / ${total} ...`;
        await new Promise((r) => setTimeout(r, 0));

        let img = asset.img;
        if (!img && asset.file) {
          const url = await readFileAsDataUrl(asset.file);
          img = await loadImageFromSrc(url);
        }
        if (!img) continue;

        const res = Engine.processImage(img, state.params);
        const outCanvas = Engine.buildExportCanvas(res.canvas, scale, bg);
        const blob = await canvasToPngBlob(outCanvas);
        const relOut = buildUniqueExportPath(asset, scale, usedNames);
        await writeFileToSubdir(dirHandle, relOut, blob);
      }
      AudioFX.confirm();
    } finally {
      state.batchBusy = false;
      el.btnBatchDir.querySelector('span').textContent = '写入文件夹';
      updateSlotHeaderControls();
      processAndRender();
    }
  }

  /**
   * Import array of { file, relativePath } or FileList cleanly with thumbnail caching
   */
  async function importFileEntries(rawEntries) {
    const items = Array.from(rawEntries || [])
      .map((entry) => (entry instanceof File ? { file: entry, relativePath: entry.webkitRelativePath || entry.name } : entry))
      .filter((entry) => isImageFile(entry.file))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }));

    if (!items.length || state.batchBusy) return;

    pushUndoSnapshot();
    const keepFullInMem = items.length <= 8;
    const newAssets = [];
    const total = items.length;

    for (let i = 0; i < total; i++) {
      const { file, relativePath } = items[i];
      if (total > 6) {
        el.telemetryText.textContent = `IMPORTING FOLDER: ${i + 1} / ${total} ...`;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const img = await loadImageFromSrc(dataUrl);
        const thumbUrl = createThumbnailDataUrl(img);
        const id = 'user_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6);
        const shortName = file.name.replace(/\.[^.]+$/, '').slice(0, 14);
        newAssets.push({
          id,
          name: file.name,
          label: shortName || '商品图',
          relativePath: relativePath || file.name,
          file,
          dataUrl: keepFullInMem || i === 0 ? dataUrl : null,
          thumbUrl,
          img: keepFullInMem || i === 0 ? img : null,
        });
      } catch (_) {
        // Skip unreadable image file gracefully
      }
      if (i % 6 === 5) await new Promise((r) => setTimeout(r, 0));
    }

    if (!newAssets.length) {
      state.undoStack.pop();
      updateSlotHeaderControls();
      return;
    }

    state.assets.push(...newAssets);
    state.activeAssetId = newAssets[0].id;
    AudioFX.load();
    renderMemoryCards();
    await activateAndRenderCurrent();
  }

  async function readDirectoryEntryRecursively(dirEntry, prefix) {
    const reader = dirEntry.createReader();
    const collected = [];

    const readBatch = () =>
      new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });

    while (true) {
      const entries = await readBatch();
      if (!entries.length) break;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isFile) {
          const file = await new Promise((res, rej) => entry.file(res, rej));
          collected.push({ file, relativePath: path });
        } else if (entry.isDirectory) {
          const sub = await readDirectoryEntryRecursively(entry, path);
          collected.push(...sub);
        }
      }
    }
    return collected;
  }

  async function extractEntriesFromDrop(dataTransfer) {
    const dtItems = dataTransfer && dataTransfer.items;
    if (dtItems && dtItems.length && typeof dtItems[0].webkitGetAsEntry === 'function') {
      const results = [];
      const entries = [];
      for (let i = 0; i < dtItems.length; i++) {
        const entry = dtItems[i].webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.isFile) {
          const file = await new Promise((res, rej) => entry.file(res, rej));
          results.push({ file, relativePath: file.name });
        } else if (entry.isDirectory) {
          const sub = await readDirectoryEntryRecursively(entry, entry.name);
          results.push(...sub);
        }
      }
      return results;
    }
    return Array.from((dataTransfer && dataTransfer.files) || []);
  }

  async function openCompareMatrix() {
    const asset = getActiveAsset();
    if (!asset) return;
    await ensureAssetLoaded(asset);
    AudioFX.select();
    el.matrixGrid.innerHTML = '';

    Engine.STYLE_PRESETS.forEach((preset) => {
      const res = Engine.processImage(asset.img, preset.params);
      const card = document.createElement('div');
      card.className = 'matrix-card' + (preset.id === state.activePresetId ? ' is-current' : '');

      const previewBox = document.createElement('div');
      previewBox.className = 'matrix-preview-box';
      const c = document.createElement('canvas');
      c.width = res.width;
      c.height = res.height;
      c.style.width = '152px';
      c.style.height = `${Math.round((res.height / res.width) * 152)}px`;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(res.canvas, 0, 0);
      previewBox.appendChild(c);

      const title = document.createElement('div');
      title.className = 'matrix-card-title';
      title.innerHTML = `<span>${preset.code} · ${preset.name}</span><span>${shapeSymbol(preset.shape)}</span>`;

      const meta = document.createElement('div');
      meta.className = 'matrix-card-meta';
      meta.textContent = `${res.width}×${res.height} PX · ${res.totalUniqueColors} COLORS · ${preset.tag}`;

      card.appendChild(previewBox);
      card.appendChild(title);
      card.appendChild(meta);

      card.addEventListener('click', () => {
        el.compareModal.classList.add('hidden');
        selectPreset(preset.id, false);
      });

      el.matrixGrid.appendChild(card);
    });

    el.compareModal.classList.remove('hidden');
  }

  async function exportSevenStyleSheet() {
    const asset = getActiveAsset();
    if (!asset) return;
    await ensureAssetLoaded(asset);

    const cols = 4;
    const rows = 2;
    const cellW = 280;
    const cellH = 310;
    const pad = 20;
    const sheet = document.createElement('canvas');
    sheet.width = cols * cellW + pad * 2;
    sheet.height = rows * cellH + pad * 2 + 44;
    const ctx = sheet.getContext('2d');

    ctx.fillStyle = '#c4ccb9';
    ctx.fillRect(0, 0, sheet.width, sheet.height);

    ctx.fillStyle = '#1f2821';
    ctx.font = 'bold 18px Consolas, monospace';
    ctx.fillText(`PLAY-PIXEL STATION // 7 RETRO STYLES MATRIX (${asset.name})`, pad, 34);

    const tiles = [
      { title: '00 · ORIGINAL PHOTO', sub: `${asset.img.naturalWidth}×${asset.img.naturalHeight} ORIG`, img: asset.img, isPixel: false },
      ...Engine.STYLE_PRESETS.map((p) => {
        const res = Engine.processImage(asset.img, p.params);
        return {
          title: `${p.code} · ${p.name}`,
          sub: `${res.width}×${res.height} · ${res.totalUniqueColors} COLORS`,
          img: res.canvas,
          isPixel: true,
        };
      }),
    ];

    tiles.forEach((tile, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = pad + col * cellW;
      const y = 52 + pad + row * cellH;

      ctx.fillStyle = '#d3dac8';
      ctx.fillRect(x + 6, y + 6, cellW - 12, cellH - 12);
      ctx.strokeStyle = '#6f7965';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 6, y + 6, cellW - 12, cellH - 12);

      const bx = x + 20;
      const by = y + 20;
      const bw = cellW - 40;
      const bh = 210;
      ctx.fillStyle = '#3c4248';
      ctx.fillRect(bx, by, bw, bh);

      const srcW = tile.img.naturalWidth || tile.img.width;
      const srcH = tile.img.naturalHeight || tile.img.height;
      const scale = Math.min((bw - 16) / srcW, (bh - 16) / srcH);
      const dw = Math.round(srcW * scale);
      const dh = Math.round(srcH * scale);
      const dx = bx + Math.round((bw - dw) / 2);
      const dy = by + Math.round((bh - dh) / 2);

      ctx.imageSmoothingEnabled = !tile.isPixel;
      ctx.drawImage(tile.img, dx, dy, dw, dh);

      ctx.fillStyle = '#1e2720';
      ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
      ctx.fillText(tile.title, x + 20, y + 258);

      ctx.fillStyle = '#445247';
      ctx.font = '12px Consolas, monospace';
      ctx.fillText(tile.sub, x + 20, y + 280);
    });

    const baseName = asset.name.replace(/\.[^.]+$/, '');
    downloadCanvasPng(sheet, `${baseName}_7styles_matrix.png`);
    AudioFX.confirm();
  }

  function bindEvents() {
    el.btnUpload.addEventListener('click', () => {
      AudioFX.tick();
      el.fileInput.click();
    });
    el.btnUploadFolder.addEventListener('click', () => {
      AudioFX.tick();
      el.folderInput.click();
    });
    el.emptyBtnUpload.addEventListener('click', () => el.fileInput.click());
    el.emptyBtnFolder.addEventListener('click', () => el.folderInput.click());
    el.emptyBtnSample.addEventListener('click', restoreSampleAsset);
    el.emptyBtnUndo.addEventListener('click', undoSlotChange);

    el.btnUndoSlot.addEventListener('click', undoSlotChange);
    el.btnClearSlots.addEventListener('click', clearAllAssets);
    el.btnRestoreSample.addEventListener('click', restoreSampleAsset);

    el.fileInput.addEventListener('change', (e) => {
      importFileEntries(e.target.files);
      e.target.value = '';
    });
    el.folderInput.addEventListener('change', (e) => {
      importFileEntries(e.target.files);
      e.target.value = '';
    });

    el.btnExportMain.addEventListener('click', exportCurrentAsset);
    el.btnExportSide.addEventListener('click', exportCurrentAsset);
    el.btnBatchExport.addEventListener('click', exportBatchZip);
    el.btnBatchDir.addEventListener('click', exportBatchToDirectory);

    el.btnResetPreset.addEventListener('click', () => selectPreset(state.activePresetId, false));

    el.btnToggleCrt.addEventListener('click', () => {
      state.crtOn = !state.crtOn;
      document.body.classList.toggle('lcd-matrix-on', state.crtOn);
      el.crtScreen.classList.toggle('lcd-fx', state.crtOn);
      el.btnToggleCrt.classList.toggle('is-on', state.crtOn);
      el.btnToggleCrt.querySelector('span:last-child').textContent = state.crtOn ? 'LCD点阵: ON' : 'LCD点阵: OFF';
      AudioFX.tick();
    });

    el.btnToggleSfx.addEventListener('click', () => {
      const next = !AudioFX.isEnabled();
      AudioFX.setEnabled(next);
      el.btnToggleSfx.classList.toggle('is-on', next);
      el.btnToggleSfx.querySelector('span:last-child').textContent = next ? 'SFX: ON' : 'SFX: OFF';
    });

    el.btnToggleGrid.addEventListener('click', () => {
      state.showGrid = !state.showGrid;
      el.btnToggleGrid.classList.toggle('is-on', state.showGrid);
      el.btnToggleGrid.querySelector('span').textContent = state.showGrid ? '网格: ON' : '网格: OFF';
      AudioFX.tick();
      renderViewport(getActiveAsset(), state.lastResult);
    });

    // View mode, zoom, backdrop segmented groups
    el.viewModeGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.viewMode = btn.dataset.view;
      el.viewModeGroup.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
      AudioFX.tick();
      renderViewport(getActiveAsset(), state.lastResult);
    });

    el.zoomGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.zoom = btn.dataset.zoom;
      el.zoomGroup.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
      AudioFX.tick();
      renderViewport(getActiveAsset(), state.lastResult);
    });

    el.bgGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.backdrop = btn.dataset.bg;
      el.stageBackdrop.className = `stage-backdrop ${state.backdrop}`;
      el.bgGroup.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
      AudioFX.tick();
      renderViewport(getActiveAsset(), state.lastResult);
    });

    // Wipe Slider dragging
    let wiping = false;
    const handleWipePointer = (clientX) => {
      const r = el.wipeView.getBoundingClientRect();
      if (r.width <= 0) return;
      updateWipePosition((clientX - r.left) / r.width);
    };
    el.wipeHandle.addEventListener('pointerdown', (e) => {
      wiping = true;
      el.wipeHandle.setPointerCapture(e.pointerId);
      handleWipePointer(e.clientX);
    });
    window.addEventListener('pointermove', (e) => {
      if (wiping) handleWipePointer(e.clientX);
    });
    window.addEventListener('pointerup', () => { wiping = false; });

    // Parameter Controls
    const bindRange = (input, key) => {
      input.addEventListener('input', () => {
        state.params[key] = Number(input.value);
        syncControlsFromParams();
        scheduleProcess();
      });
    };

    bindRange(el.rngWidth, 'targetWidth');
    bindRange(el.rngAlpha, 'alphaThreshold');
    bindRange(el.rngSharpen, 'sharpen');
    bindRange(el.rngContrast, 'contrast');
    bindRange(el.rngSaturation, 'saturation');
    bindRange(el.rngColors, 'colorCount');
    bindRange(el.rngDither, 'ditherStrength');

    el.selSampling.addEventListener('change', () => {
      state.params.sampling = el.selSampling.value;
      AudioFX.tick();
      scheduleProcess();
    });
    el.chkSoftAlpha.addEventListener('change', () => {
      state.params.keepSoftAlpha = el.chkSoftAlpha.checked;
      AudioFX.tick();
      scheduleProcess();
    });
    el.selPalette.addEventListener('change', () => {
      state.params.paletteMode = el.selPalette.value;
      AudioFX.tick();
      syncControlsFromParams();
      scheduleProcess();
    });
    el.selDither.addEventListener('change', () => {
      state.params.ditherMode = el.selDither.value;
      if (state.params.ditherMode !== 'none' && state.params.ditherStrength === 0) {
        state.params.ditherStrength = 40;
      }
      AudioFX.tick();
      syncControlsFromParams();
      scheduleProcess();
    });
    el.selOutline.addEventListener('change', () => {
      state.params.outline = el.selOutline.value;
      AudioFX.tick();
      scheduleProcess();
    });
    el.chkCleanOrphans.addEventListener('change', () => {
      state.params.cleanOrphans = el.chkCleanOrphans.checked;
      AudioFX.tick();
      scheduleProcess();
    });
    el.chkSafePadding.addEventListener('change', () => {
      state.params.safePadding = el.chkSafePadding.checked;
      AudioFX.tick();
      scheduleProcess();
    });

    // Drag & Drop files or entire folders onto CRT screen or Memory Card tray
    [el.crtScreen, el.memcardSection].forEach((dropZone) => {
      ['dragenter', 'dragover'].forEach((evt) => {
        dropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          el.crtScreen.classList.add('drag-over');
        });
      });
      ['dragleave', 'drop'].forEach((evt) => {
        dropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          el.crtScreen.classList.remove('drag-over');
        });
      });
      dropZone.addEventListener('drop', async (e) => {
        const entries = await extractEntriesFromDrop(e.dataTransfer);
        importFileEntries(entries);
      });
    });

    // Clipboard Paste
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      const files = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) importFileEntries(files);
    });

    // Keyboard shortcuts (ESC closes modal, Ctrl+Z undoes slot change)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el.compareModal.classList.contains('hidden')) {
        el.compareModal.classList.add('hidden');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          undoSlotChange();
        }
      }
    });

    // Compare Matrix Modal
    el.btnCompareAll.addEventListener('click', openCompareMatrix);
    el.btnCloseModal.addEventListener('click', () => {
      el.compareModal.classList.add('hidden');
      AudioFX.tick();
    });
    el.compareModal.addEventListener('click', (e) => {
      if (e.target === el.compareModal) {
        el.compareModal.classList.add('hidden');
      }
    });
    el.btnExportMatrix.addEventListener('click', exportSevenStyleSheet);

    // Responsive Resize
    window.addEventListener('resize', () => {
      if (state.lastResult) renderViewport(getActiveAsset(), state.lastResult);
    });
  }

  function bootstrap() {
    bindEvents();
    const samples = window.PS1_SAMPLE_ASSETS || [];
    if (!samples.length) return;

    let loaded = 0;
    samples.forEach((item) => {
      const img = new Image();
      img.onload = () => {
        state.assets.push({
          id: item.id,
          name: item.name,
          label: item.label,
          relativePath: item.name,
          file: null,
          dataUrl: item.dataUrl,
          thumbUrl: createThumbnailDataUrl(img),
          img,
        });
        loaded++;
        if (loaded === samples.length) {
          state.activeAssetId = state.assets[0].id;
          renderMemoryCards();
          selectPreset('rpg-outline', true);
        }
      };
      img.src = item.dataUrl;
    });
  }

  bootstrap();
})();
