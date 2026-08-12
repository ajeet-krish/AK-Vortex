/**
 * QuiverArrowLayer: renders velocity arrows as instanced icons via deck.gl IconLayer.
 *
 * Each arrow is an instanced icon positioned at a grid cell center, rotated to
 * match the local velocity direction, and colored by speed using the jet colormap.
 * The arrow icon is pre-rasterized to a small canvas at initialization.
 */
import { IconLayer } from '@deck.gl/layers';
import type { FrameData } from '../../types';

/* ------------------------------------------------------------------ */
/*  Arrow icon generation (runs once)                                  */
/* ------------------------------------------------------------------ */

/** Generate a small arrow icon as an ImageData-compatible RGBA buffer. */
function createArrowIcon(size = 32): { data: Uint8Array; width: number; height: number } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Transparent background
  ctx.clearRect(0, 0, size, size);

  // Draw arrow pointing right (will be rotated per-instance)
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = 'white';
  ctx.fillStyle = 'white';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const len = size * 0.35;
  const headLen = size * 0.15;
  const headW = size * 0.12;

  // Shaft
  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.lineTo(len - headLen, 0);
  ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(len - headLen, -headW);
  ctx.lineTo(len - headLen, headW);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  const imageData = ctx.getImageData(0, 0, size, size);
  return { data: new Uint8Array(imageData.data.buffer), width: size, height: size };
}

/* ------------------------------------------------------------------ */
/*  Instance data builder                                              */
/* ------------------------------------------------------------------ */

export interface QuiverInstance {
  position: [number, number];
  angle: number;    // radians, rotation from +x
  speed: number;    // magnitude for color mapping
}

/** Build quiver instance array from velocity field. */
export function buildQuiverInstances(
  u: Float32Array,
  v: Float32Array,
  obstacle: Float32Array,
  nx: number,
  ny: number,
  step: number,
): QuiverInstance[] {
  const instances: QuiverInstance[] = [];
  const halfStep = Math.floor(step / 2);

  for (let y = halfStep; y < ny; y += step) {
    for (let x = halfStep; x < nx; x += step) {
      const idx = y * nx + x;
      if (obstacle[idx] > 0.5) continue;

      const ux = u[idx];
      const vy = v[idx];
      const speed = Math.sqrt(ux * ux + vy * vy);
      if (speed < 1e-6) continue;

      instances.push({
        position: [x + 0.5, y + 0.5],
        angle: Math.atan2(vy, ux),
        speed,
      });
    }
  }

  return instances;
}

/* ------------------------------------------------------------------ */
/*  Layer factory                                                      */
/* ------------------------------------------------------------------ */

export interface QuiverArrowLayerProps {
  frameData: FrameData;
  nx: number;
  ny: number;
  step: number;
  vmax: number;       // max velocity for colormap normalization
  visible: boolean;
}

/** Create an IconLayer for quiver arrows. */
export function createQuiverLayer(props: QuiverArrowLayerProps): IconLayer | null {
  const { frameData, nx, ny, step, vmax, visible } = props;
  if (!visible) return null;

  const instances = buildQuiverInstances(
    frameData.u, frameData.v, frameData.obstacle,
    nx, ny, step,
  );

  if (instances.length === 0) return null;

  const icon = createArrowIcon(32);

  // Jet colormap helper (matches the GLSL analytic jet in ContourLayer)
  const jet = (t: number): [number, number, number, number] => {
    const r = Math.max(0, Math.min(255, Math.round(255 * (1.5 - Math.abs(4 * t - 3)))));
    const g = Math.max(0, Math.min(255, Math.round(255 * (1.5 - Math.abs(4 * t - 2)))));
    const b = Math.max(0, Math.min(255, Math.round(255 * (1.5 - Math.abs(4 * t - 1)))));
    return [r, g, b, 153]; // 60% alpha
  };

  return new IconLayer({
    id: 'quiver-arrows',
    data: instances,
    getIcon: () => ({
      url: '',
      width: icon.width,
      height: icon.height,
      data: icon.data,
    }),
    getPosition: (d: QuiverInstance) => d.position,
    getAngle: (d: QuiverInstance) => -(d.angle * 180) / Math.PI,
    getColor: (d: QuiverInstance) => {
      const t = vmax > 0 ? Math.min(d.speed / vmax, 1) : 0;
      return jet(t);
    },
    getSize: 8,
    sizeScale: 1,
    sizeUnits: 'pixels' as const,
    pickable: false,
    visible,
  });
}
