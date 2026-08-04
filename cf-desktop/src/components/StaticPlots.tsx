import { useRef, useEffect, useMemo } from 'react';
import { sampleColormap } from '../utils/colormap';
import { buildStreamlines, sampleField } from '../utils/streamline';
import type { FrameData } from './FlowCanvas';

interface StaticPlotsProps {
  frameData: FrameData;
  width?: number;
  height?: number;
}

interface PlotSpec {
  label: string;
  field: 'velocity' | 'pressure' | 'vorticity';
  showStreamlines: boolean;
  cmap: string;
}

const PLOTS: PlotSpec[] = [
  { label: 'Velocity Contour', field: 'velocity', showStreamlines: false, cmap: 'jet' },
  { label: 'Streamlines', field: 'velocity', showStreamlines: true, cmap: 'jet' },
  { label: 'Pressure', field: 'pressure', showStreamlines: false, cmap: 'jet' },
  { label: 'Vorticity', field: 'vorticity', showStreamlines: false, cmap: 'rdbu' },
];

function computeRange(frameData: FrameData, field: string) {
  const { velocity, p, omega } = frameData;
  if (field === 'velocity') {
    let maxVal = 0;
    for (const val of velocity) {
      if (Number.isFinite(val) && val > maxVal) maxVal = val;
    }
    return { min: 0, max: maxVal || 1 };
  } else if (field === 'pressure') {
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const val of p) {
      if (!Number.isFinite(val)) continue;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal === maxVal) {
      return { min: -1, max: 1 };
    }
    const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
    return { min: -absMax, max: absMax };
  } else {
    let maxAbs = 0;
    for (const val of omega) {
      if (Number.isFinite(val)) {
        const abs = Math.abs(val);
        if (abs > maxAbs) maxAbs = abs;
      }
    }
    return { min: -maxAbs, max: maxAbs || 1 };
  }
}

function drawObstacles(
  ctx: CanvasRenderingContext2D,
  obs: number[],
  nx: number,
  ny: number,
  sx: number,
  sy: number,
) {
  ctx.fillStyle = '#1a1e22';
  const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      if (!obs[y * nx + x]) continue;
      const isBoundary = neighbors.some(([dx, dy]) => {
        const nx2 = x + dx;
        const ny2 = y + dy;
        return (
          nx2 >= 0 &&
          nx2 < nx &&
          ny2 >= 0 &&
          ny2 < ny &&
          !obs[ny2 * nx + nx2]
        );
      });
      if (isBoundary) {
        ctx.fillRect(x * sx, (ny - 1 - y) * sy, sx + 0.5, sy + 0.5);
      }
    }
  }
}

function drawStreamlines(
  ctx: CanvasRenderingContext2D,
  lines: Array<Array<{ x: number; y: number }>>,
  u: number[],
  v: number[],
  nx: number,
  ny: number,
  vmax: number,
  sx: number,
  sy: number,
) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.2;

  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const sp = Math.hypot(
        sampleField(u, nx, ny, mx, my),
        sampleField(v, nx, ny, mx, my),
      );
      const t = Math.min(1, sp / (vmax || 1));
      const [r, g, bl] = sampleColormap('jet', t);
      ctx.strokeStyle = `rgba(${r},${g},${bl},0.9)`;
      ctx.beginPath();
      ctx.moveTo(a.x * sx, (ny - 1 - a.y) * sy);
      ctx.lineTo(b.x * sx, (ny - 1 - b.y) * sy);
      ctx.stroke();
    }
  }
}

function PlotCanvas({
  frameData,
  spec,
  width,
  height,
}: {
  frameData: FrameData;
  spec: PlotSpec;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { nx, ny, velocity, u, v, p, omega, obstacle } = frameData;
  const values = spec.field === 'velocity' ? velocity : spec.field === 'pressure' ? p : omega;
  const range = useMemo(() => computeRange(frameData, spec.field), [frameData, spec.field]);

  const streamlines = useMemo(() => {
    if (!spec.showStreamlines || spec.field !== 'velocity') return [];
    return buildStreamlines(u, v, nx, ny, obstacle, 9);
  }, [frameData, spec.showStreamlines, spec.field, u, v, nx, ny, obstacle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    const { min, max } = range;
    const dataRange = max - min || 1;

    // Render at native grid resolution then scale
    const imageData = ctx.createImageData(nx, ny);
    const data = imageData.data;

    for (let j = 0; j < ny; j++) {
      const srcRow = ny - 1 - j;
      for (let i = 0; i < nx; i++) {
        const pixelIdx = (j * nx + i) * 4;
        const valIdx = srcRow * nx + i;

        if (obstacle[valIdx]) {
          data[pixelIdx] = 30;
          data[pixelIdx + 1] = 30;
          data[pixelIdx + 2] = 30;
          data[pixelIdx + 3] = 255;
          continue;
        }

        const t = (values[valIdx] - min) / dataRange;
        const c = sampleColormap(spec.cmap, t);
        data[pixelIdx] = c[0];
        data[pixelIdx + 1] = c[1];
        data[pixelIdx + 2] = c[2];
        data[pixelIdx + 3] = 255;
      }
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = nx;
    tempCanvas.height = ny;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCtx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tempCanvas, 0, 0, width, height);

    const sx = width / nx;
    const sy = height / ny;

    drawObstacles(ctx, obstacle, nx, ny, sx, sy);

    if (spec.showStreamlines && streamlines.length > 0) {
      drawStreamlines(ctx, streamlines, u, v, nx, ny, range.max, sx, sy);
    }
  }, [frameData, spec, width, height, range, values, obstacle, u, v, nx, ny, streamlines]);

  return (
    <div className="static-plot-cell">
      <span className="static-plot-label">{spec.label}</span>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
    </div>
  );
}

export default function StaticPlots({ frameData, width = 400, height }: StaticPlotsProps) {
  const aspect = frameData.nx / frameData.ny;
  const cellHeight = height || Math.round(width / aspect);

  return (
    <div className="static-plots-section">
      <h2>Static Results</h2>
      <div className="static-plots-grid">
        {PLOTS.map((spec) => (
          <PlotCanvas
            key={spec.label}
            frameData={frameData}
            spec={spec}
            width={width}
            height={cellHeight}
          />
        ))}
      </div>
    </div>
  );
}
