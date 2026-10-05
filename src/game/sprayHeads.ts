export type PaintHead = 'fine' | 'soft' | 'fat' | 'marker' | 'roller' | 'drip';
export type BrushHead = PaintHead;
export const paintHeads: readonly PaintHead[] = ['fine', 'soft', 'fat', 'marker', 'roller', 'drip'];

const footprints: Record<PaintHead, readonly [string, number, number]> = {
  fine: ['circle', 0.42, 0.08],
  soft: ['aerosol', 1, 0.55],
  fat: ['circle', 1.65, 0.12],
  marker: ['square', 0.88, 0],
  roller: ['roller', 1.35, 0],
  drip: ['drip', 0.7, 2.8],
};

export function headForTool(tool: string | undefined): PaintHead | undefined {
  if (tool === 'spray' || tool === 'eraser') return undefined;
  return paintHeads.includes(tool as PaintHead) ? tool as PaintHead : 'soft';
}

export function paintHeadFootprint(head: PaintHead): readonly [string, number, number] {
  return footprints[head];
}

export function nextHoldSamples(
  previous: { worldPoint?: readonly [number, number, number]; holdSamples?: number } | null | undefined,
  worldPoint: readonly [number, number, number],
): number {
  return previous?.worldPoint && Math.hypot(
    previous.worldPoint[0] - worldPoint[0],
    previous.worldPoint[1] - worldPoint[1],
    previous.worldPoint[2] - worldPoint[2],
  ) <= 0.005
    ? Math.min(60, (previous.holdSamples ?? 1) + 1)
    : 1;
}

export function drawPaintHead(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  head: PaintHead,
  holdSamples = 1,
): void {
  const [kind, scale, tail] = paintHeadFootprint(head);
  const dwellScale = ['aerosol', 'circle', 'drip'].includes(kind)
    ? 1 + Math.min(29, Math.max(0, holdSamples - 1)) * 0.02
    : 1;
  const r = radius * scale * dwellScale;
  context.beginPath();
  if (kind === 'square') {
    context.fillRect(x - r, y - r, r * 2, r * 2);
  } else if (kind === 'roller') {
    context.fillRect(x - r * 1.55, y - r * 0.58, r * 3.1, r * 1.16);
  } else if (kind === 'aerosol') {
    context.save();
    context.globalAlpha *= 0.7;
    context.filter = `blur(${Math.max(1, radius * 32)}px)`;
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
    context.restore();
  } else {
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }
  if (tail) {
    const length = Math.min(12, tail + Math.min(29, Math.max(0, holdSamples - 1)) * 0.33);
    context.beginPath();
    context.moveTo(x, y + r * 0.45);
    context.lineTo(x, y + r * length);
    context.lineWidth = radius * 0.24;
    context.lineCap = 'round';
    context.stroke();
  }
}
