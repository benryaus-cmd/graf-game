export interface HslColor {
  h: number;
  s: number;
  l: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function hexToHsl(hex: string): HslColor {
  const clean = hex.replace('#', '');
  const red = parseInt(clean.slice(0, 2), 16) / 255;
  const green = parseInt(clean.slice(2, 4), 16) / 255;
  const blue = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }
  hue = (hue * 60 + 360) % 360;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { h: hue, s: saturation * 100, l: lightness * 100 };
}

export function hslToHex({ h, s, l }: HslColor): string {
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = ((h % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs(segment % 2 - 1));
  let channels: [number, number, number] = [0, 0, 0];
  if (segment < 1) channels = [chroma, x, 0];
  else if (segment < 2) channels = [x, chroma, 0];
  else if (segment < 3) channels = [0, chroma, x];
  else if (segment < 4) channels = [0, x, chroma];
  else if (segment < 5) channels = [x, 0, chroma];
  else channels = [chroma, 0, x];
  const match = lightness - chroma / 2;
  const hex = channels.map((channel) => Math.round((channel + match) * 255)
    .toString(16).padStart(2, '0'));
  return `#${hex.join('')}`;
}

export function paintColor(base: string, hue: number, darkness: number, paleness: number): string {
  const hsl = hexToHsl(base);
  return hslToHex({
    h: hue,
    s: clamp(hsl.s - paleness * 0.53, 0, 100),
    l: clamp(hsl.l - darkness * 0.42 + paleness * 0.36, 5, 95),
  });
}