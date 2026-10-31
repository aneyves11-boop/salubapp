// Extraction légère et 100 % côté client des coordonnées GPS EXIF d'une photo (JPEG / HEIC / WebP)
// Permet de récupérer le lieu réel où une photo a été prise hors-ligne, avant le nettoyage EXIF lié au floutage.

export interface ExifGpsResult {
  lat: number;
  lng: number;
  capturedAt?: string;
}

export async function extractExifGps(file: File): Promise<ExifGpsResult | null> {
  try {
    const slice = file.slice(0, 12 * 1024 * 1024);
    const buffer = await slice.arrayBuffer();
    if (buffer.byteLength < 16) return null;

    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    // 1. Parcours rapide des segments JPEG (0xFFD8 -> APP1 0xFFE1 "Exif\0\0")
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
        const marker = bytes[offset + 1];
        if (marker === 0xff) {
          offset += 1;
          continue;
        }
        if (marker === 0xda || marker === 0xd9) break;

        const segLength = view.getUint16(offset + 2, false);
        if (segLength < 2) break;

        if (
          marker === 0xe1 &&
          offset + 10 <= bytes.length &&
          bytes[offset + 4] === 0x45 &&
          bytes[offset + 5] === 0x78 &&
          bytes[offset + 6] === 0x69 &&
          bytes[offset + 7] === 0x66 &&
          bytes[offset + 8] === 0x00 &&
          bytes[offset + 9] === 0x00
        ) {
          const segEnd = Math.min(bytes.length, offset + 2 + segLength);
          const parsed = parseTiffForGps(view, bytes, offset + 10, segEnd);
          if (parsed) return parsed;
        }

        offset += 2 + segLength;
      }
    }

    // 2. Fallback universel (HEIC / iPhone / WebP / JPEG atypique) : recherche de "Exif\0\0" + en-tête TIFF
    const limit = bytes.length - 14;
    for (let i = 0; i < limit; i++) {
      if (
        bytes[i] === 0x45 &&
        bytes[i + 1] === 0x78 &&
        bytes[i + 2] === 0x69 &&
        bytes[i + 3] === 0x66 &&
        bytes[i + 4] === 0x00 &&
        bytes[i + 5] === 0x00
      ) {
        const tiffPos = i + 6;
        const isLE =
          bytes[tiffPos] === 0x49 &&
          bytes[tiffPos + 1] === 0x49 &&
          bytes[tiffPos + 2] === 0x2a &&
          bytes[tiffPos + 3] === 0x00;
        const isBE =
          bytes[tiffPos] === 0x4d &&
          bytes[tiffPos + 1] === 0x4d &&
          bytes[tiffPos + 2] === 0x00 &&
          bytes[tiffPos + 3] === 0x2a;

        if (isLE || isBE) {
          const parsed = parseTiffForGps(view, bytes, tiffPos, bytes.length);
          if (parsed) return parsed;
        }
      }
    }

    return null;
  } catch (err) {
    console.warn("Lecture EXIF GPS impossible :", err);
    return null;
  }
}

function parseTiffForGps(
  view: DataView,
  bytes: Uint8Array,
  tiffStart: number,
  maxEnd: number
): ExifGpsResult | null {
  if (tiffStart + 8 > maxEnd) return null;

  const byteOrder = view.getUint16(tiffStart, false);
  const le = byteOrder === 0x4949;
  if (!le && byteOrder !== 0x4d4d) return null;

  const magic = view.getUint16(tiffStart + 2, le);
  if (magic !== 0x002a) return null;

  const u16 = (pos: number): number | null =>
    pos >= tiffStart && pos + 2 <= maxEnd ? view.getUint16(pos, le) : null;
  const u32 = (pos: number): number | null =>
    pos >= tiffStart && pos + 4 <= maxEnd ? view.getUint32(pos, le) : null;
  const i32 = (pos: number): number | null =>
    pos >= tiffStart && pos + 4 <= maxEnd ? view.getInt32(pos, le) : null;

  const readAscii = (entryPos: number, count: number): string | null => {
    if (count <= 0 || count > 64) return null;
    let dataPos = entryPos + 8;
    if (count > 4) {
      const rel = u32(entryPos + 8);
      if (rel == null) return null;
      dataPos = tiffStart + rel;
    }
    if (dataPos < tiffStart || dataPos + count > maxEnd) return null;
    let out = "";
    for (let i = 0; i < count; i++) {
      const ch = bytes[dataPos + i];
      if (ch === 0) break;
      out += String.fromCharCode(ch);
    }
    return out.trim() || null;
  };

  const readDmsRationals = (entryPos: number, type: number, count: number): number | null => {
    if (count < 3 || (type !== 5 && type !== 10)) return null;
    const rel = u32(entryPos + 8);
    if (rel == null) return null;
    const dataPos = tiffStart + rel;
    if (dataPos < tiffStart || dataPos + 24 > maxEnd) return null;

    const parts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const num = type === 10 ? i32(dataPos + i * 8) : u32(dataPos + i * 8);
      const den = type === 10 ? i32(dataPos + i * 8 + 4) : u32(dataPos + i * 8 + 4);
      if (num == null || den == null || den === 0) return null;
      parts.push(num / den);
    }

    const decimal = parts[0] + parts[1] / 60 + parts[2] / 3600;
    return Number.isFinite(decimal) ? decimal : null;
  };

  const ifd0Rel = u32(tiffStart + 4);
  if (ifd0Rel == null) return null;
  const ifd0Pos = tiffStart + ifd0Rel;
  const ifd0Count = u16(ifd0Pos);
  if (ifd0Count == null || ifd0Count > 512) return null;

  let gpsIfdRel: number | null = null;
  let exifIfdRel: number | null = null;
  let dateTimeStr: string | null = null;

  for (let i = 0; i < ifd0Count; i++) {
    const entryPos = ifd0Pos + 2 + i * 12;
    if (entryPos + 12 > maxEnd) break;
    const tag = u16(entryPos);
    const type = u16(entryPos + 2);
    const count = u32(entryPos + 4);
    if (tag == null || type == null || count == null) continue;

    if (tag === 0x8825) {
      gpsIfdRel = u32(entryPos + 8);
    } else if (tag === 0x8769) {
      exifIfdRel = u32(entryPos + 8);
    } else if (tag === 0x0132 && type === 2) {
      dateTimeStr = readAscii(entryPos, count);
    }
  }

  if (gpsIfdRel == null) return null;

  if (exifIfdRel != null) {
    const exifPos = tiffStart + exifIfdRel;
    const exifCount = u16(exifPos);
    if (exifCount != null && exifCount <= 512) {
      for (let i = 0; i < exifCount; i++) {
        const entryPos = exifPos + 2 + i * 12;
        if (entryPos + 12 > maxEnd) break;
        const tag = u16(entryPos);
        const type = u16(entryPos + 2);
        const count = u32(entryPos + 4);
        if (tag === 0x9003 && type === 2 && count != null) {
          const orig = readAscii(entryPos, count);
          if (orig) dateTimeStr = orig;
          break;
        }
      }
    }
  }

  const gpsPos = tiffStart + gpsIfdRel;
  const gpsCount = u16(gpsPos);
  if (gpsCount == null || gpsCount > 256) return null;

  let latRef: string | null = null;
  let lngRef: string | null = null;
  let latVal: number | null = null;
  let lngVal: number | null = null;

  for (let i = 0; i < gpsCount; i++) {
    const entryPos = gpsPos + 2 + i * 12;
    if (entryPos + 12 > maxEnd) break;
    const tag = u16(entryPos);
    const type = u16(entryPos + 2);
    const count = u32(entryPos + 4);
    if (tag == null || type == null || count == null) continue;

    if (tag === 0x0001) {
      latRef = readAscii(entryPos, Math.max(1, count));
    } else if (tag === 0x0002) {
      latVal = readDmsRationals(entryPos, type, count);
    } else if (tag === 0x0003) {
      lngRef = readAscii(entryPos, Math.max(1, count));
    } else if (tag === 0x0004) {
      lngVal = readDmsRationals(entryPos, type, count);
    }
  }

  if (latVal == null || lngVal == null) return null;

  let lat = Math.abs(latVal);
  let lng = Math.abs(lngVal);

  if (latRef && latRef.toUpperCase().startsWith("S")) lat = -lat;
  if (lngRef && lngRef.toUpperCase().startsWith("W")) lng = -lng;

  if ((lat === 0 && lng === 0) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }

  return {
    lat,
    lng,
    capturedAt: formatExifDate(dateTimeStr),
  };
}

function formatExifDate(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return undefined;
  return `${m[3]}/${m[2]}/${m[1]} à ${m[4]}h${m[5]}`;
}
