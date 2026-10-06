export interface HsvColor { h: number; s: number; v: number }
const clamp = (n: number) => Math.max(0, Math.min(100, n));
export function hexToHsv(hex: string): HsvColor {
  const [r, g, b] = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  const high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
  let h = 0;
  if (delta) h = 60 * (high === r ? (g - b) / delta : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
  return { h: (h + 360) % 360, s: high ? delta / high * 100 : 0, v: high * 100 };
}
export function hsvToHex({ h, s, v }: HsvColor): string {
  const hue = ((h % 360) + 360) % 360 / 60;
  const c = clamp(v) / 100 * clamp(s) / 100, x = c * (1 - Math.abs(hue % 2 - 1)), m = clamp(v) / 100 - c;
  const channels = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x];
  return '#' + channels.map(n => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('');
}
