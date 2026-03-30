export interface ColorSwatch {
  hex: string;
  r: number;
  g: number;
  b: number;
  name: string;
  count: number;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function quantizeColor(r: number, g: number, b: number, factor: number): string {
  const qr = Math.round(r / factor) * factor;
  const qg = Math.round(g / factor) * factor;
  const qb = Math.round(b / factor) * factor;
  return `${qr},${qg},${qb}`;
}

function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number
): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function mergeSimilarColors(
  colors: Map<string, { r: number; g: number; b: number; count: number }>,
  threshold: number
) {
  const entries = Array.from(colors.entries()).sort((a, b) => b[1].count - a[1].count);
  const merged: Map<string, { r: number; g: number; b: number; count: number }> = new Map();

  for (const [key, val] of entries) {
    let foundMatch = false;
    for (const [mKey, mVal] of merged.entries()) {
      const dist = colorDistance(val.r, val.g, val.b, mVal.r, mVal.g, mVal.b);
      if (dist < threshold) {
        // Weighted average merge
        const totalCount = mVal.count + val.count;
        merged.set(mKey, {
          r: Math.round((mVal.r * mVal.count + val.r * val.count) / totalCount),
          g: Math.round((mVal.g * mVal.count + val.g * val.count) / totalCount),
          b: Math.round((mVal.b * mVal.count + val.b * val.count) / totalCount),
          count: totalCount,
        });
        foundMatch = true;
        break;
      }
    }
    if (!foundMatch) {
      merged.set(key, { ...val });
    }
  }
  return merged;
}

/**
 * Auto-detects all perceptually distinct colors from an image.
 * No max-color cap — returns every unique cluster found.
 *
 * quantizeFactor : coarseness of initial bucketing (lower = more colors)
 * mergeThreshold : Euclidean RGB distance below which two colors merge (lower = more colors)
 */
export function extractColorsFromImage(
  imageElement: HTMLImageElement,
  quantizeFactor: number = 8,
  mergeThreshold: number = 28
): Promise<ColorSwatch[]> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');

    // Scale image down for faster processing while keeping accuracy
    const MAX_DIM = 400;
    let { width, height } = imageElement;
    if (width > MAX_DIM || height > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imageElement, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    const colorMap = new Map<string, { r: number; g: number; b: number; count: number }>();

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      // Skip transparent / near-transparent pixels
      if (a < 128) continue;

      const key = quantizeColor(r, g, b, quantizeFactor);
      if (colorMap.has(key)) {
        colorMap.get(key)!.count++;
      } else {
        const parts = key.split(',').map(Number);
        colorMap.set(key, { r: parts[0], g: parts[1], b: parts[2], count: 1 });
      }
    }

    // Merge perceptually similar colors
    const merged = mergeSimilarColors(colorMap, mergeThreshold);

    // Filter out very rare colors (noise), then sort by frequency
    const totalPixels = (pixels.length / 4);
    const minCount = Math.max(1, Math.floor(totalPixels * 0.001)); // at least 0.1% of pixels

    const sorted = Array.from(merged.values())
      .filter(c => c.count >= minCount)
      .sort((a, b) => b.count - a.count);

    const swatches: ColorSwatch[] = sorted.map((c, i) => {
      const r = Math.min(255, Math.max(0, c.r));
      const g = Math.min(255, Math.max(0, c.g));
      const b = Math.min(255, Math.max(0, c.b));
      const hex = rgbToHex(r, g, b);
      return {
        hex,
        r,
        g,
        b,
        name: `Color ${i + 1} ${hex}`,
        count: c.count,
      };
    });

    resolve(swatches);
  });
}
