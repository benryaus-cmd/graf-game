import type { SkyMode } from '@/game/worldTypes';

const SKY_COLORS: Record<SkyMode, { top: string; horizon: string; cloud: string }> = {
  day: { top: '#43a9ef', horizon: '#ffe0ab', cloud: '#ffffff' },
  sunset: { top: '#d93d36', horizon: '#ff9a4f', cloud: '#f4b7a0' },
  pastel: { top: '#dba2d8', horizon: '#ffe3d0', cloud: '#a4e4ec' },
  rain: { top: '#44535e', horizon: '#8f9a9d', cloud: '#b8c1c3' },
  night: { top: '#091324', horizon: '#25364d', cloud: '#8a96b3' },
};

export function drawSky(canvas: HTMLCanvasElement, mode: SkyMode): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const colors = SKY_COLORS[mode];
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, colors.top);
  gradient.addColorStop(0.58, colors.horizon);
  gradient.addColorStop(1, mode === 'rain' ? '#69777d' : colors.horizon);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalAlpha = mode === 'rain' ? 0.12 : mode === 'night' ? 0.035 : 0.19;
  context.fillStyle = colors.cloud;
  for (let row = 0; row < 7; row += 1) {
    const y = 72 + row * 58;
    for (let cloud = 0; cloud < 6; cloud += 1) {
      const x = cloud * 190 + ((row * 71) % 120) - 45;
      const width = mode === 'day' ? 110 : 170;
      context.beginPath();
      context.ellipse(x, y, width, 4, 0, 0, Math.PI * 2);
      context.ellipse(x + 24, y - 5, width * 0.56, 4, 0, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;
  if (mode === 'day' || mode === 'sunset') {
    context.fillStyle = mode === 'day' ? '#fff7d7' : '#ffe0ad';
    context.beginPath();
    context.arc(760, 145, mode === 'day' ? 42 : 54, 0, Math.PI * 2);
    context.fill();
  }
  if (mode === 'night') drawNightDetails(context, canvas);
}

function drawNightDetails(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const starLimit = Math.floor(canvas.height * 0.72);
  for (let index = 0; index < 142; index += 1) {
    const x = (index * 157 + 53) % canvas.width;
    const y = (index * 73 + index * index * 11 + 19) % starLimit;
    const radius = index % 19 === 0 ? 1.8 : 0.55 + (index % 4) * 0.22;
    context.globalAlpha = 0.55 + (index % 5) * 0.09;
    context.fillStyle = index % 7 === 0 ? '#d8e8ff' : '#fff7df';
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  const glow = context.createRadialGradient(760, 145, 12, 760, 145, 82);
  glow.addColorStop(0, 'rgba(224, 235, 255, 0.27)');
  glow.addColorStop(1, 'rgba(180, 203, 245, 0)');
  context.fillStyle = glow;
  context.fillRect(670, 55, 180, 180);
  context.fillStyle = '#f6f0d8';
  context.beginPath();
  context.arc(760, 145, 35, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#14233a';
  context.beginPath();
  context.arc(746, 134, 31, 0, Math.PI * 2);
  context.fill();
}