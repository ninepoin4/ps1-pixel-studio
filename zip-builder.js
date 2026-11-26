/**
 * Minimal zero-dependency PKZIP (STORE / method 0, UTF-8 filenames) builder.
 * Ideal for bundling PNG pixel assets cleanly on both file:// and http://.
 */
(function (global) {
  'use strict';

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function buildZipBlob(entries) {
    const encoder = new TextEncoder();
    const now = new Date();
    const dosTime =
      ((now.getHours() & 0x1f) << 11) |
      ((now.getMinutes() & 0x3f) << 5) |
      ((now.getSeconds() >> 1) & 0x1f);
    const dosDate =
      (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
      (((now.getMonth() + 1) & 0x0f) << 5) |
      (now.getDate() & 0x1f);

    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const nameBytes = encoder.encode(entry.name);
      const data = entry.data;
      const crc = crc32(data);

      // Local file header (30 bytes + filename)
      const localHdr = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHdr.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);      // Version needed
      lv.setUint16(6, 0x0800, true);  // UTF-8 filename flag
      lv.setUint16(8, 0, true);       // Method 0 (STORE)
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHdr.set(nameBytes, 30);

      localParts.push(localHdr, data);

      // Central directory header (46 bytes + filename)
      const cdHdr = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cdHdr.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cdHdr.set(nameBytes, 46);

      centralParts.push(cdHdr);
      offset += localHdr.length + data.length;
    }

    let centralSize = 0;
    for (let i = 0; i < centralParts.length; i++) {
      centralSize += centralParts[i].length;
    }

    // End of central directory (22 bytes)
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
  }

  global.PS1ZipBuilder = { buildZipBlob };
})(window);
