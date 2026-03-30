import { ColorSwatch } from './colorExtractor';

/**
 * Writes a big-endian uint16 into a DataView at the given offset.
 */
function writeUint16BE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, false);
}

/**
 * Writes a big-endian uint32 into a DataView at the given offset.
 */
function writeUint32BE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, false);
}

/**
 * Writes a big-endian float32 into a DataView at the given offset.
 */
function writeFloat32BE(view: DataView, offset: number, value: number): void {
  view.setFloat32(offset, value, false);
}

/**
 * Encodes a string as UTF-16 Big-Endian bytes WITH a null terminator (2 zero bytes at end).
 * Returns the raw bytes as a Uint8Array.
 * The "char count" stored in the ASE block = number of UTF-16 chars INCLUDING the null terminator.
 */
function encodeNameUTF16BE(name: string): { bytes: Uint8Array; charCount: number } {
  // Each character = 2 bytes, plus 2 bytes for null terminator
  const charCount = name.length + 1; // includes null terminator
  const bytes = new Uint8Array(charCount * 2);
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    bytes[i * 2]     = (code >> 8) & 0xff;
    bytes[i * 2 + 1] = code & 0xff;
  }
  // null terminator is already zeros from Uint8Array initialization
  return { bytes, charCount };
}

/**
 * Generates a valid Adobe Swatch Exchange (.ase) binary file.
 *
 * Verified ASE binary format:
 *
 * HEADER (12 bytes):
 *   [0–3]   "ASEF" signature (4 bytes ASCII)
 *   [4–5]   Major version = 0x0001 (uint16 BE)
 *   [6–7]   Minor version = 0x0000 (uint16 BE)
 *   [8–11]  Block count   (uint32 BE) — total number of blocks including group start/end
 *
 * GROUP START BLOCK:
 *   [0–1]   Block type = 0xC001 (uint16 BE)
 *   [2–5]   Block length (uint32 BE) = 2 + nameBytes.length
 *            (= size in bytes of everything AFTER this length field)
 *   [6–7]   Name char count (uint16 BE) = chars in name + 1 (for null terminator)
 *   [8…]    Name in UTF-16 BE + 2-byte null terminator
 *
 * COLOR BLOCK:
 *   [0–1]   Block type = 0x0001 (uint16 BE)
 *   [2–5]   Block length (uint32 BE) = 2 + nameBytes.length + 4 + 12 + 2
 *   [6–7]   Name char count (uint16 BE) = chars in name + 1 (for null terminator)
 *   [8…]    Name in UTF-16 BE + 2-byte null terminator
 *   […+4]   Color space = "RGB " (4 bytes ASCII)
 *   […+4]   Red   float32 BE (0.0–1.0)
 *   […+4]   Green float32 BE (0.0–1.0)
 *   […+4]   Blue  float32 BE (0.0–1.0)
 *   […+2]   Color type: 0x0000 = Global, 0x0001 = Spot, 0x0002 = Process/Normal
 *
 * GROUP END BLOCK:
 *   [0–1]   Block type = 0xC002 (uint16 BE)
 *   [2–5]   Block length = 0x00000000 (uint32 BE)
 */
export function generateASEFile(swatches: ColorSwatch[], paletteName: string = 'Palette'): Uint8Array {
  const safeName = paletteName.trim() || 'Palette';

  // Pre-encode all names so we can calculate total byte size
  const groupNameEncoded = encodeNameUTF16BE(safeName);
  const colorNames: Array<{ hex: string; r: number; g: number; b: number; encoded: ReturnType<typeof encodeNameUTF16BE> }> = swatches.map(s => ({
    hex: s.hex,
    r: s.r,
    g: s.g,
    b: s.b,
    encoded: encodeNameUTF16BE(s.hex.replace('#', '').toUpperCase()),
  }));

  // Calculate total buffer size
  const HEADER_SIZE = 12; // "ASEF" + version(4) + blockCount(4)

  // Group start block size:
  //   blockType(2) + blockLength(4) + nameCharCount(2) + nameBytes(n)
  const groupStartSize = 2 + 4 + 2 + groupNameEncoded.bytes.length;

  // Each color block size:
  //   blockType(2) + blockLength(4) + nameCharCount(2) + nameBytes(n) + "RGB "(4) + floats(12) + colorType(2)
  const colorBlockSizes = colorNames.map(c => 2 + 4 + 2 + c.encoded.bytes.length + 4 + 12 + 2);
  const totalColorSize = colorBlockSizes.reduce((a, b) => a + b, 0);

  // Group end block size: blockType(2) + blockLength(4)
  const groupEndSize = 2 + 4;

  const totalSize = HEADER_SIZE + groupStartSize + totalColorSize + groupEndSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;

  // ── HEADER ──────────────────────────────────────────────────────────────────
  // "ASEF"
  bytes[offset++] = 0x41; // A
  bytes[offset++] = 0x53; // S
  bytes[offset++] = 0x45; // E
  bytes[offset++] = 0x46; // F

  // Version 1.0
  writeUint16BE(view, offset, 0x0001); offset += 2;
  writeUint16BE(view, offset, 0x0000); offset += 2;

  // Block count: group start + colors + group end
  const blockCount = 1 + swatches.length + 1;
  writeUint32BE(view, offset, blockCount); offset += 4;

  // ── GROUP START BLOCK ────────────────────────────────────────────────────────
  // Block type: 0xC001
  writeUint16BE(view, offset, 0xC001); offset += 2;

  // Block length = 2 (charCount field) + nameBytes length
  const groupBlockLength = 2 + groupNameEncoded.bytes.length;
  writeUint32BE(view, offset, groupBlockLength); offset += 4;

  // Name char count (includes null terminator)
  writeUint16BE(view, offset, groupNameEncoded.charCount); offset += 2;

  // Name bytes (UTF-16 BE + null terminator)
  bytes.set(groupNameEncoded.bytes, offset);
  offset += groupNameEncoded.bytes.length;

  // ── COLOR BLOCKS ─────────────────────────────────────────────────────────────
  for (let i = 0; i < colorNames.length; i++) {
    const { r, g, b, encoded } = colorNames[i];

    // Block type: 0x0001
    writeUint16BE(view, offset, 0x0001); offset += 2;

    // Block length = 2 (charCount) + nameBytes + 4 (color space) + 12 (3 floats) + 2 (color type)
    const colorBlockLength = 2 + encoded.bytes.length + 4 + 12 + 2;
    writeUint32BE(view, offset, colorBlockLength); offset += 4;

    // Name char count (includes null terminator)
    writeUint16BE(view, offset, encoded.charCount); offset += 2;

    // Name bytes (UTF-16 BE + null terminator)
    bytes.set(encoded.bytes, offset);
    offset += encoded.bytes.length;

    // Color space "RGB "
    bytes[offset++] = 0x52; // R
    bytes[offset++] = 0x47; // G
    bytes[offset++] = 0x42; // B
    bytes[offset++] = 0x20; // (space)

    // RGB float values in range [0.0, 1.0]
    writeFloat32BE(view, offset, r / 255); offset += 4;
    writeFloat32BE(view, offset, g / 255); offset += 4;
    writeFloat32BE(view, offset, b / 255); offset += 4;

    // Color type: 0x0002 = Process (normal/spot-less)
    writeUint16BE(view, offset, 0x0002); offset += 2;
  }

  // ── GROUP END BLOCK ──────────────────────────────────────────────────────────
  // Block type: 0xC002
  writeUint16BE(view, offset, 0xC002); offset += 2;

  // Block length: 0
  writeUint32BE(view, offset, 0x00000000); offset += 4;

  return new Uint8Array(buffer);
}

/**
 * Triggers a browser download of the generated .ase file.
 */
export function downloadASEFile(
  swatches: ColorSwatch[],
  filename: string = 'palette',
  paletteName: string = 'Palette'
): void {
  const data = generateASEFile(swatches, paletteName);
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.ase`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
