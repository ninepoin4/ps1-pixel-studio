/**
 * PS1 Pixel Studio — Retro Pixel-Art Conversion Engine
 * Pure client-side image processing pipeline:
 * 1. Aspect-preserving grid layout with optional safe sprite padding
 * 2. Premultiplied-alpha area/nearest downsampling (prevents edge halos)
 * 3. Pre-FX (sharpen, contrast, saturation, brightness)
 * 4. Perceptual OKLab palette quantization (Median Cut + classic hardware palettes + PS1 15-bit)
 * 5. Ordered Bayer (2x2/4x4/8x8) & alpha-aware Floyd-Steinberg dithering
 * 6. Pixel sprite outline & orphan-dot cleanup
 */
(function (global) {
  'use strict';

  const BAYER_2 = [
    [0, 2],
    [3, 1],
  ];

  const BAYER_4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  const BAYER_8 = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ];

  const HARDWARE_PALETTES = {
    gameboy: [
      [15, 56, 15],
      [48, 98, 48],
      [139, 172, 15],
      [155, 188, 15],
    ],
    pico8: [
      [0, 0, 0],
      [29, 43, 83],
      [126, 37, 83],
      [0, 135, 81],
      [171, 82, 54],
      [95, 87, 79],
      [194, 195, 199],
      [255, 241, 232],
      [255, 0, 77],
      [255, 163, 0],
      [255, 236, 39],
      [0, 228, 54],
      [41, 173, 255],
      [131, 118, 156],
      [255, 119, 168],
      [255, 204, 170],
    ],
    nes: [
      [84, 84, 84], [0, 30, 116], [8, 16, 144], [48, 0, 136], [68, 0, 100], [92, 0, 48], [84, 4, 0], [60, 24, 0],
      [32, 42, 0], [8, 58, 0], [0, 64, 0], [0, 60, 0], [0, 50, 60], [0, 0, 0],
      [152, 150, 152], [8, 76, 196], [48, 50, 236], [92, 30, 228], [136, 20, 176], [160, 20, 100], [152, 34, 32], [120, 60, 0],
      [84, 90, 0], [40, 114, 0], [8, 124, 0], [0, 118, 40], [0, 102, 120],
      [236, 238, 236], [76, 154, 236], [120, 124, 236], [176, 98, 236], [228, 84, 236], [236, 88, 180], [236, 106, 100], [212, 136, 32],
      [160, 170, 0], [116, 196, 0], [76, 208, 32], [56, 204, 108], [56, 180, 204], [60, 60, 60],
      [168, 204, 236], [188, 188, 236], [212, 178, 236], [236, 174, 236], [236, 174, 212], [236, 180, 176], [228, 196, 144],
      [204, 210, 120], [180, 222, 120], [168, 226, 144], [152, 226, 180], [160, 214, 228], [160, 162, 160],
    ],
    endesga32: [
      [190, 74, 47], [215, 118, 67], [234, 212, 170], [228, 166, 114], [184, 111, 80], [115, 62, 57], [62, 39, 49], [162, 38, 51],
      [228, 59, 68], [247, 118, 34], [254, 174, 52], [254, 231, 97], [99, 199, 77], [62, 137, 72], [38, 92, 66], [25, 60, 62],
      [18, 78, 137], [0, 149, 233], [44, 232, 245], [255, 255, 255], [192, 203, 220], [139, 155, 180], [90, 105, 136], [58, 68, 102],
      [38, 43, 68], [24, 20, 37], [255, 0, 68], [104, 56, 108], [181, 80, 136], [246, 117, 122], [232, 183, 150], [194, 133, 105],
    ],
    mono1bit: [
      [18, 20, 28],
      [242, 238, 224],
    ],
  };

  const STYLE_PRESETS = [
    {
      id: 'raw-snapshot',
      code: '01',
      name: '低分截图像素风',
      tag: 'RAW SNAPSHOT',
      shape: 'square',
      desc: '模拟低分辨率窗口截图再无损放大，保留摄影级光影与柔和过渡。',
      params: {
        targetWidth: 72,
        sampling: 'area',
        alphaThreshold: 64,
        keepSoftAlpha: true,
        sharpen: 10,
        contrast: 4,
        saturation: 6,
        brightness: 0,
        paletteMode: 'full',
        colorCount: 64,
        ditherMode: 'none',
        ditherStrength: 0,
        outline: 'none',
        cleanOrphans: false,
        safePadding: false,
      },
    },
    {
      id: 'true-crisp',
      code: '02',
      name: '保留本色精致风',
      tag: 'CRISP ASSET',
      shape: 'circle',
      desc: '智能提取商品 32 色主色盘 + 锐利透明边界，干净还原实物色彩质感。',
      params: {
        targetWidth: 64,
        sampling: 'area',
        alphaThreshold: 120,
        keepSoftAlpha: false,
        sharpen: 35,
        contrast: 12,
        saturation: 14,
        brightness: 2,
        paletteMode: 'auto',
        colorCount: 32,
        ditherMode: 'bayer2',
        ditherStrength: 22,
        outline: 'none',
        cleanOrphans: true,
        safePadding: true,
      },
    },
    {
      id: 'rpg-outline',
      code: '03',
      name: 'RPG 道具描边风',
      tag: 'GBA ITEM ICON',
      shape: 'cross',
      desc: '高饱和 20 色 + 1px 自适应深色像素外描边，直接变身复古游戏商店道具。',
      params: {
        targetWidth: 48,
        sampling: 'area',
        alphaThreshold: 128,
        keepSoftAlpha: false,
        sharpen: 45,
        contrast: 18,
        saturation: 24,
        brightness: 4,
        paletteMode: 'auto',
        colorCount: 20,
        ditherMode: 'bayer2',
        ditherStrength: 18,
        outline: 'auto-dark',
        cleanOrphans: true,
        safePadding: true,
      },
    },
    {
      id: 'ps1-vram',
      code: '04',
      name: 'PS1 15-bit 抖动',
      tag: 'PSX HARDWARE',
      shape: 'triangle',
      desc: 'PlayStation 1 原生 15-bit RGB555 帧缓冲色深 + 4×4 Bayer 硬件矩阵抖动。',
      params: {
        targetWidth: 80,
        sampling: 'area',
        alphaThreshold: 128,
        keepSoftAlpha: false,
        sharpen: 28,
        contrast: 14,
        saturation: 10,
        brightness: 0,
        paletteMode: 'ps1-15bit',
        colorCount: 32,
        ditherMode: 'bayer4',
        ditherStrength: 62,
        outline: 'none',
        cleanOrphans: true,
        safePadding: true,
      },
    },
    {
      id: 'gameboy-dmg',
      code: '05',
      name: '经典掌机 4 色',
      tag: 'DMG HANDHELD',
      shape: 'triangle',
      desc: '初代掌机 4 阶橄榄绿调色板配合亮度自适应与 4×4 有序网点，立体掌机质感。',
      params: {
        targetWidth: 52,
        sampling: 'area',
        alphaThreshold: 128,
        keepSoftAlpha: false,
        sharpen: 40,
        contrast: 18,
        saturation: 0,
        brightness: 0,
        paletteMode: 'gameboy',
        colorCount: 4,
        ditherMode: 'bayer4',
        ditherStrength: 68,
        outline: 'black',
        cleanOrphans: true,
        safePadding: true,
      },
    },
    {
      id: 'pico8',
      code: '06',
      name: 'PICO-8 卡带风',
      tag: '16-COLOR CART',
      shape: 'circle',
      desc: '高饱和 PICO-8 16 色硬件调色板 + 网点过渡与硬边描边，潮流像素贴纸感。',
      params: {
        targetWidth: 48,
        sampling: 'area',
        alphaThreshold: 128,
        keepSoftAlpha: false,
        sharpen: 42,
        contrast: 24,
        saturation: 24,
        brightness: -8,
        paletteMode: 'pico8',
        colorCount: 16,
        ditherMode: 'bayer4',
        ditherStrength: 58,
        outline: 'black',
        cleanOrphans: true,
        safePadding: true,
      },
    },
    {
      id: 'pc98',
      code: '07',
      name: 'PC-98 杂志扫描',
      tag: 'ERROR DIFFUSION',
      shape: 'square',
      desc: '16 色索引调色板配合 Floyd-Steinberg 误差扩散颗粒，90 年代电脑杂志质感。',
      params: {
        targetWidth: 84,
        sampling: 'area',
        alphaThreshold: 128,
        keepSoftAlpha: false,
        sharpen: 25,
        contrast: 10,
        saturation: 10,
        brightness: 0,
        paletteMode: 'auto',
        colorCount: 16,
        ditherMode: 'floyd',
        ditherStrength: 78,
        outline: 'none',
        cleanOrphans: false,
        safePadding: true,
      },
    },
  ];

  // Fast sRGB [0..255] -> OKLab conversion for accurate perceptual color distance
  const srgbLut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    srgbLut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function rgbToOklab(r, g, b) {
    const lr = srgbLut[r < 0 ? 0 : r > 255 ? 255 : r | 0];
    const lg = srgbLut[g < 0 ? 0 : g > 255 ? 255 : g | 0];
    const lb = srgbLut[b < 0 ? 0 : b > 255 ? 255 : b | 0];

    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
  }

  function clampByte(v) {
    return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }

  /**
   * Downsample source canvas/image cleanly using premultiplied-alpha area averaging
   * or center-pixel nearest sampling, returning an ImageData at (gridW, gridH).
   */
  function sampleToGrid(sourceImageData, srcW, srcH, gridW, gridH, padPx, samplingMode) {
    const out = new Uint8ClampedArray(gridW * gridH * 4);
    const innerW = Math.max(1, gridW - padPx * 2);
    const innerH = Math.max(1, gridH - padPx * 2);
    const src = sourceImageData.data;

    for (let gy = 0; gy < innerH; gy++) {
      const sy0 = (gy * srcH) / innerH;
      const sy1 = ((gy + 1) * srcH) / innerH;
      const iy0 = Math.max(0, Math.floor(sy0));
      const iy1 = Math.min(srcH, Math.ceil(sy1));

      for (let gx = 0; gx < innerW; gx++) {
        const sx0 = (gx * srcW) / innerW;
        const sx1 = ((gx + 1) * srcW) / innerW;
        const dstIdx = ((gy + padPx) * gridW + (gx + padPx)) * 4;

        if (samplingMode === 'nearest') {
          const cx = Math.min(srcW - 1, Math.floor((sx0 + sx1) * 0.5));
          const cy = Math.min(srcH - 1, Math.floor((sy0 + sy1) * 0.5));
          const sIdx = (cy * srcW + cx) * 4;
          out[dstIdx] = src[sIdx];
          out[dstIdx + 1] = src[sIdx + 1];
          out[dstIdx + 2] = src[sIdx + 2];
          out[dstIdx + 3] = src[sIdx + 3];
          continue;
        }

        const ix0 = Math.max(0, Math.floor(sx0));
        const ix1 = Math.min(srcW, Math.ceil(sx1));
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumA = 0;
        let areaTotal = 0;

        for (let sy = iy0; sy < iy1; sy++) {
          const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
          if (wy <= 0) continue;
          const rowOff = sy * srcW;

          for (let sx = ix0; sx < ix1; sx++) {
            const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
            if (wx <= 0) continue;
            const w = wx * wy;
            const sIdx = (rowOff + sx) * 4;
            const a = src[sIdx + 3] / 255;
            areaTotal += w;
            if (a > 0) {
              const pa = w * a;
              sumR += src[sIdx] * pa;
              sumG += src[sIdx + 1] * pa;
              sumB += src[sIdx + 2] * pa;
              sumA += pa;
            }
          }
        }

        if (sumA > 1e-6 && areaTotal > 0) {
          out[dstIdx] = clampByte(sumR / sumA);
          out[dstIdx + 1] = clampByte(sumG / sumA);
          out[dstIdx + 2] = clampByte(sumB / sumA);
          out[dstIdx + 3] = clampByte((sumA / areaTotal) * 255);
        } else {
          out[dstIdx] = 0;
          out[dstIdx + 1] = 0;
          out[dstIdx + 2] = 0;
          out[dstIdx + 3] = 0;
        }
      }
    }

    return new ImageData(out, gridW, gridH);
  }

  /**
   * Unsharp mask + brightness/contrast/saturation on grid-sized or intermediate buffer.
   */
  function applyPreEffects(imgData, params) {
    const { width: w, height: h, data } = imgData;
    const sharpAmt = (params.sharpen || 0) / 100;
    const contrastFactor = Math.pow((100 + (params.contrast || 0)) / 100, 2);
    const satFactor = 1 + (params.saturation || 0) / 100;
    const brightOffset = (params.brightness || 0) * 2.55;

    // Step 1: alpha-aware 3x3 sharpen on opaque pixels
    let work = data;
    if (sharpAmt > 0.01) {
      const copy = new Uint8ClampedArray(data);
      const strength = sharpAmt * 1.15;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (data[i + 3] === 0) continue;

          let nr = 0, ng = 0, nb = 0, count = 0;
          const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          for (let d = 0; d < 4; d++) {
            const nx = x + dirs[d][0];
            const ny = y + dirs[d][1];
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const ni = (ny * w + nx) * 4;
              if (data[ni + 3] > 20) {
                nr += data[ni];
                ng += data[ni + 1];
                nb += data[ni + 2];
                count++;
              }
            }
          }

          if (count > 0) {
            const avgR = nr / count;
            const avgG = ng / count;
            const avgB = nb / count;
            copy[i] = clampByte(data[i] + (data[i] - avgR) * strength);
            copy[i + 1] = clampByte(data[i + 1] + (data[i + 1] - avgG) * strength);
            copy[i + 2] = clampByte(data[i + 2] + (data[i + 2] - avgB) * strength);
          }
        }
      }
      work = copy;
    }

    // Step 2: brightness, contrast, saturation
    const out = new Uint8ClampedArray(work);
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) continue;
      let r = work[i] + brightOffset;
      let g = work[i + 1] + brightOffset;
      let b = work[i + 2] + brightOffset;

      r = (r - 128) * contrastFactor + 128;
      g = (g - 128) * contrastFactor + 128;
      b = (b - 128) * contrastFactor + 128;

      if (Math.abs(satFactor - 1) > 0.001) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = lum + (r - lum) * satFactor;
        g = lum + (g - lum) * satFactor;
        b = lum + (b - lum) * satFactor;
      }

      out[i] = clampByte(r);
      out[i + 1] = clampByte(g);
      out[i + 2] = clampByte(b);
    }

    return new ImageData(out, w, h);
  }

  /**
   * Median Cut Quantization over foreground pixels (alpha > 0)
   */
  function extractMedianCutPalette(data, maxColors) {
    const samples = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        samples.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
    if (samples.length === 0) return [[0, 0, 0]];

    // Deduplicate slightly if huge, though grid is <= 200x200 so always fast
    let boxes = [samples];
    while (boxes.length < maxColors) {
      let bestIdx = -1;
      let bestScore = -1;
      let bestChannel = 0;

      for (let bi = 0; bi < boxes.length; bi++) {
        const box = boxes[bi];
        if (box.length < 2) continue;
        let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
        for (let k = 0; k < box.length; k++) {
          const p = box[k];
          if (p[0] < minR) minR = p[0];
          if (p[0] > maxR) maxR = p[0];
          if (p[1] < minG) minG = p[1];
          if (p[1] > maxG) maxG = p[1];
          if (p[2] < minB) minB = p[2];
          if (p[2] > maxB) maxB = p[2];
        }
        const rRange = maxR - minR;
        const gRange = maxG - minG;
        const bRange = maxB - minB;
        const maxRange = Math.max(rRange, gRange, bRange);
        if (maxRange === 0) continue;

        // Weight range by log(count) so dominant product tones get more subdivisions
        const score = maxRange * Math.log2(box.length + 1);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = bi;
          bestChannel = rRange >= gRange && rRange >= bRange ? 0 : gRange >= bRange ? 1 : 2;
        }
      }

      if (bestIdx === -1) break;
      const target = boxes[bestIdx];
      target.sort((a, b) => a[bestChannel] - b[bestChannel]);
      const mid = Math.floor(target.length / 2);
      boxes.splice(bestIdx, 1, target.slice(0, mid), target.slice(mid));
    }

    const palette = boxes.map((box) => {
      let sr = 0, sg = 0, sb = 0;
      for (let i = 0; i < box.length; i++) {
        sr += box[i][0];
        sg += box[i][1];
        sb += box[i][2];
      }
      return [
        clampByte(sr / box.length),
        clampByte(sg / box.length),
        clampByte(sb / box.length),
      ];
    });

    // Sort palette by luminance (dark -> bright) for a clean CLUT strip
    palette.sort((a, b) => (0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]) - (0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2]));
    return palette;
  }

  function buildPaletteWithLabs(palette) {
    return palette.map((rgb) => ({
      rgb,
      lab: rgbToOklab(rgb[0], rgb[1], rgb[2]),
    }));
  }

  function findNearestColor(r, g, b, paletteMode, preparedPalette) {
    if (paletteMode === 'ps1-15bit') {
      // Authentic PS1 5-bit per channel (0..31)
      const q5 = (v) => Math.round((clampByte(v) / 255) * 31) * (255 / 31);
      return [clampByte(q5(r)), clampByte(q5(g)), clampByte(q5(b))];
    }
    if (paletteMode === 'full') {
      return [clampByte(r), clampByte(g), clampByte(b)];
    }

    const cr = clampByte(r);
    const cg = clampByte(g);
    const cb = clampByte(b);
    const lab = rgbToOklab(cr, cg, cb);

    let bestDist = Infinity;
    let bestRgb = preparedPalette[0].rgb;
    for (let i = 0; i < preparedPalette.length; i++) {
      const pLab = preparedPalette[i].lab;
      const dl = lab[0] - pLab[0];
      const da = lab[1] - pLab[1];
      const db = lab[2] - pLab[2];
      const dist = dl * dl + da * da + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestRgb = preparedPalette[i].rgb;
      }
    }
    return bestRgb;
  }

  /**
   * Apply palette + ordered or error-diffusion dithering
   */
  function quantizeAndDither(imgData, params) {
    const { width: w, height: h, data } = imgData;
    const out = new Uint8ClampedArray(data);
    const paletteMode = params.paletteMode || 'auto';
    const ditherMode = params.ditherMode || 'none';
    const ditherStrength = (params.ditherStrength || 0) / 100;

    let palette = [];
    if (paletteMode === 'auto') {
      palette = extractMedianCutPalette(data, Math.max(2, Math.min(64, params.colorCount || 16)));
    } else if (HARDWARE_PALETTES[paletteMode]) {
      palette = HARDWARE_PALETTES[paletteMode];
    }

    const prepared = palette.length ? buildPaletteWithLabs(palette) : [];

    // For monochromatic / 4-shade handheld palettes (Game Boy, 1-bit), normalize
    // foreground luminance across the full tonal span so bright or dark products
    // utilize all 4 shades instead of collapsing into 1-2 shades.
    let workData = data;
    if (paletteMode === 'gameboy' || paletteMode === 'mono1bit') {
      const lums = [];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
          lums.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }
      }
      if (lums.length > 4) {
        lums.sort((a, b) => a - b);
        const low = lums[Math.floor(lums.length * 0.02)];
        const high = lums[Math.floor(lums.length * 0.98)];
        const span = Math.max(24, high - low);
        const normed = new Uint8ClampedArray(data);
        for (let i = 0; i < normed.length; i += 4) {
          if (normed[i + 3] === 0) continue;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          // Map toward olive-green / neutral gray luminance range matching DMG/1-bit
          const norm = Math.max(0, Math.min(1, (lum - low) / span));
          const targetLum = paletteMode === 'gameboy' ? 35 + norm * 165 : 15 + norm * 225;
          normed[i] = clampByte(targetLum * 0.85);
          normed[i + 1] = clampByte(targetLum);
          normed[i + 2] = clampByte(targetLum * 0.35);
        }
        workData = normed;
      }
    }

    // Estimate spread amplitude based on palette density
    let baseSpread = 36;
    if (paletteMode === 'ps1-15bit') baseSpread = 10;
    else if (paletteMode === 'full') baseSpread = 0;
    else if (palette.length <= 4) baseSpread = 68;
    else if (palette.length <= 16) baseSpread = 44;
    else baseSpread = 28;

    const spread = baseSpread * ditherStrength;

    if (ditherMode === 'floyd' && paletteMode !== 'full') {
      const buf = new Float32Array(w * h * 3);
      for (let i = 0; i < w * h; i++) {
        buf[i * 3] = workData[i * 4];
        buf[i * 3 + 1] = workData[i * 4 + 1];
        buf[i * 3 + 2] = workData[i * 4 + 2];
      }

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          const p4 = idx * 4;
          if (out[p4 + 3] === 0) continue;

          const p3 = idx * 3;
          const oldR = buf[p3];
          const oldG = buf[p3 + 1];
          const oldB = buf[p3 + 2];
          const [newR, newG, newB] = findNearestColor(oldR, oldG, oldB, paletteMode, prepared);

          out[p4] = newR;
          out[p4 + 1] = newG;
          out[p4 + 2] = newB;

          const errR = (oldR - newR) * ditherStrength;
          const errG = (oldG - newG) * ditherStrength;
          const errB = (oldB - newB) * ditherStrength;

          const pushErr = (nx, ny, factor) => {
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) return;
            const nIdx = ny * w + nx;
            if (out[nIdx * 4 + 3] === 0) return;
            const n3 = nIdx * 3;
            buf[n3] += errR * factor;
            buf[n3 + 1] += errG * factor;
            buf[n3 + 2] += errB * factor;
          };

          pushErr(x + 1, y, 7 / 16);
          pushErr(x - 1, y + 1, 3 / 16);
          pushErr(x, y + 1, 5 / 16);
          pushErr(x + 1, y + 1, 1 / 16);
        }
      }
    } else {
      const matrix =
        ditherMode === 'bayer2' ? BAYER_2
          : ditherMode === 'bayer4' ? BAYER_4
            : ditherMode === 'bayer8' ? BAYER_8
              : null;
      const mSize = matrix ? matrix.length : 1;
      const mTotal = mSize * mSize;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p4 = (y * w + x) * 4;
          if (out[p4 + 3] === 0) continue;

          let offset = 0;
          if (matrix && spread > 0) {
            offset = ((matrix[y % mSize][x % mSize] + 0.5) / mTotal - 0.5) * spread;
          }

          const [nr, ng, nb] = findNearestColor(
            workData[p4] + offset,
            workData[p4 + 1] + offset,
            workData[p4 + 2] + offset,
            paletteMode,
            prepared
          );
          out[p4] = nr;
          out[p4 + 1] = ng;
          out[p4 + 2] = nb;
        }
      }
    }

    // Collect actual unique colors present in output for VRAM CLUT display
    const usedColorsMap = new Map();
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) continue;
      const key = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2];
      usedColorsMap.set(key, (usedColorsMap.get(key) || 0) + 1);
    }

    const usedColors = Array.from(usedColorsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 64)
      .map(([key]) => [(key >> 16) & 255, (key >> 8) & 255, key & 255]);

    return {
      imgData: new ImageData(out, w, h),
      usedColors,
      totalUniqueColors: usedColorsMap.size,
    };
  }

  function cleanOrphanPixels(imgData) {
    const { width: w, height: h, data } = imgData;
    const out = new Uint8ClampedArray(data);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3] === 0) continue;
        let neighbors = 0;
        if (x > 0 && data[(y * w + x - 1) * 4 + 3] > 0) neighbors++;
        if (x < w - 1 && data[(y * w + x + 1) * 4 + 3] > 0) neighbors++;
        if (y > 0 && data[((y - 1) * w + x) * 4 + 3] > 0) neighbors++;
        if (y < h - 1 && data[((y + 1) * w + x) * 4 + 3] > 0) neighbors++;
        if (neighbors === 0) {
          out[i + 3] = 0;
        }
      }
    }
    return new ImageData(out, w, h);
  }

  function applyPixelOutline(imgData, outlineMode, usedColors) {
    if (!outlineMode || outlineMode === 'none') return imgData;
    const { width: w, height: h, data } = imgData;
    const out = new Uint8ClampedArray(data);

    let borderRgb = [22, 18, 28];
    if (outlineMode === 'black') {
      borderRgb = [16, 16, 22];
    } else if (outlineMode === 'white') {
      borderRgb = [250, 250, 252];
    } else if (outlineMode === 'auto-dark') {
      // Derive rich dark border from the image's main hue (e.g., deep amber-brown for yellow soap)
      if (usedColors && usedColors.length > 0) {
        let sumR = 0, sumG = 0, sumB = 0;
        const count = Math.min(usedColors.length, 8);
        for (let i = 0; i < count; i++) {
          sumR += usedColors[i][0];
          sumG += usedColors[i][1];
          sumB += usedColors[i][2];
        }
        borderRgb = [
          clampByte((sumR / count) * 0.24),
          clampByte((sumG / count) * 0.20),
          clampByte((sumB / count) * 0.18),
        ];
      }
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3] > 0) continue;

        const hasOpaqueNeighbor =
          (x > 0 && data[(y * w + x - 1) * 4 + 3] >= 128) ||
          (x < w - 1 && data[(y * w + x + 1) * 4 + 3] >= 128) ||
          (y > 0 && data[((y - 1) * w + x) * 4 + 3] >= 128) ||
          (y < h - 1 && data[((y + 1) * w + x) * 4 + 3] >= 128);

        if (hasOpaqueNeighbor) {
          out[i] = borderRgb[0];
          out[i + 1] = borderRgb[1];
          out[i + 2] = borderRgb[2];
          out[i + 3] = 255;
        }
      }
    }

    return {
      imgData: new ImageData(out, w, h),
      outlineRgb: borderRgb,
    };
  }

  /**
   * Main conversion pipeline
   */
  function processImage(sourceImage, params) {
    const t0 = performance.now();
    const srcW = sourceImage.naturalWidth || sourceImage.width;
    const srcH = sourceImage.naturalHeight || sourceImage.height;

    // Extract raw source ImageData (cap working copy at 1024px max side for speed)
    const maxWork = 1024;
    const scaleDown = Math.min(1, maxWork / Math.max(srcW, srcH));
    const workW = Math.max(1, Math.round(srcW * scaleDown));
    const workH = Math.max(1, Math.round(srcH * scaleDown));

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = workW;
    srcCanvas.height = workH;
    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    srcCtx.drawImage(sourceImage, 0, 0, workW, workH);
    const srcImageData = srcCtx.getImageData(0, 0, workW, workH);

    // Determine target pixel grid dimensions
    const targetW = Math.max(16, Math.min(200, Math.round(params.targetWidth || 64)));
    const padPx = params.safePadding && params.outline !== 'none' ? 1 : params.safePadding ? 1 : 0;
    const innerW = Math.max(8, targetW - padPx * 2);
    const innerH = Math.max(8, Math.round((workH / workW) * innerW));
    const gridW = innerW + padPx * 2;
    const gridH = innerH + padPx * 2;

    // 1. Sample cleanly to pixel grid
    let gridData = sampleToGrid(srcImageData, workW, workH, gridW, gridH, padPx, params.sampling || 'area');

    // 2. Alpha thresholding (binary crispness vs soft alpha)
    const alphaThresh = params.alphaThreshold != null ? params.alphaThreshold : 128;
    const keepSoft = Boolean(params.keepSoftAlpha);
    const d = gridData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (keepSoft) {
        if (d[i + 3] < alphaThresh * 0.25) d[i + 3] = 0;
      } else {
        d[i + 3] = d[i + 3] >= alphaThresh ? 255 : 0;
      }
    }

    // 3. Clean isolated single-pixel specks before outline
    if (params.cleanOrphans) {
      gridData = cleanOrphanPixels(gridData);
    }

    // 4. Pre-FX (sharpen / contrast / saturation / brightness)
    gridData = applyPreEffects(gridData, params);

    // 5. Quantize & Dither
    const quantResult = quantizeAndDither(gridData, params);
    let finalData = quantResult.imgData;
    const usedColors = quantResult.usedColors.slice();
    let totalUniqueColors = quantResult.totalUniqueColors;

    // 6. Optional 1px Pixel Sprite Outline
    if (params.outline && params.outline !== 'none') {
      const outlined = applyPixelOutline(finalData, params.outline, usedColors);
      finalData = outlined.imgData;
      const oRgb = outlined.outlineRgb;
      const alreadyHas = usedColors.some((c) => c[0] === oRgb[0] && c[1] === oRgb[1] && c[2] === oRgb[2]);
      if (!alreadyHas) {
        usedColors.unshift(oRgb);
        totalUniqueColors++;
      }
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = gridW;
    outCanvas.height = gridH;
    outCanvas.getContext('2d').putImageData(finalData, 0, 0);

    return {
      canvas: outCanvas,
      width: gridW,
      height: gridH,
      usedColors,
      totalUniqueColors,
      renderTimeMs: Math.max(1, Math.round(performance.now() - t0)),
    };
  }

  /**
   * Render scaled crisp PNG canvas for export
   */
  function buildExportCanvas(pixelCanvas, scale, bgMode) {
    const mult = Math.max(1, Math.round(scale || 8));
    const out = document.createElement('canvas');
    out.width = pixelCanvas.width * mult;
    out.height = pixelCanvas.height * mult;
    const ctx = out.getContext('2d');

    if (bgMode === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);
    } else if (bgMode === 'ps1-blue') {
      const grad = ctx.createLinearGradient(0, 0, 0, out.height);
      grad.addColorStop(0, '#182a6b');
      grad.addColorStop(1, '#080e28');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, out.width, out.height);
    } else if (bgMode === 'dark') {
      ctx.fillStyle = '#12151f';
      ctx.fillRect(0, 0, out.width, out.height);
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pixelCanvas, 0, 0, out.width, out.height);
    return out;
  }

  global.PS1PixelEngine = {
    STYLE_PRESETS,
    HARDWARE_PALETTES,
    processImage,
    buildExportCanvas,
  };
})(window);
