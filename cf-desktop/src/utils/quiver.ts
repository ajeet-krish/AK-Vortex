import { sampleField } from './streamline';
import { sampleColormap } from './colormap';

export interface QuiverConfig {
  gridSpacing: number;
  arrowScale: number;
  colorBySpeed: boolean;
  headAngle: number;
  headLength: number;
}

export const DEFAULT_QUIVER_CONFIG: QuiverConfig = {
  gridSpacing: 20,
  arrowScale: 1.0,
  colorBySpeed: true,
  headAngle: 0.4,
  headLength: 0.3,
};

export function drawQuiver(
  ctx: CanvasRenderingContext2D,
  u: number[],
  v: number[],
  nx: number,
  ny: number,
  obstacle: number[],
  vmax: number,
  sx: number,
  sy: number,
  offsetX: number,
  offsetY: number,
  cmap: string,
  config: QuiverConfig = DEFAULT_QUIVER_CONFIG
): void {
  const stride = Math.max(4, Math.floor(nx / config.gridSpacing));

  ctx.lineWidth = 1.5;

  for (let j = Math.floor(stride / 2); j < ny; j += stride) {
    for (let i = Math.floor(stride / 2); i < nx; i += stride) {
      const idx = j * nx + i;
      if (obstacle[idx]) continue;

      const uVal = sampleField(u, nx, ny, i, j);
      const vVal = sampleField(v, nx, ny, i, j);
      const speed = Math.hypot(uVal, vVal);
      if (speed < 1e-6) continue;

      const len = Math.min(stride * 0.4, speed * config.arrowScale * stride * 2);
      const angle = Math.atan2(-vVal, uVal);

      const cx = offsetX + i * sx;
      const cy = offsetY + (ny - 1 - j) * sy;

      const headX = cx + Math.cos(angle) * len;
      const headY = cy + Math.sin(angle) * len;

      const t = Math.min(1, speed / (vmax || 1));
      const [r, g, b] = sampleColormap(cmap, t);
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.fillStyle = `rgb(${r},${g},${b})`;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(headX, headY);
      ctx.stroke();

      const hl = len * config.headLength;
      const ha1 = angle + Math.PI + config.headAngle;
      const ha2 = angle + Math.PI - config.headAngle;
      ctx.beginPath();
      ctx.moveTo(headX, headY);
      ctx.lineTo(headX + Math.cos(ha1) * hl, headY + Math.sin(ha1) * hl);
      ctx.moveTo(headX, headY);
      ctx.lineTo(headX + Math.cos(ha2) * hl, headY + Math.sin(ha2) * hl);
      ctx.stroke();
    }
  }
}
