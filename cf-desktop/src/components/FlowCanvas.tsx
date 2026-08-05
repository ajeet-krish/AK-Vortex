import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { sampleColormap } from '../utils/colormap';
import { sampleField, buildStreamlines } from '../utils/streamline';
import { drawQuiver, type QuiverConfig, DEFAULT_QUIVER_CONFIG } from '../utils/quiver';

export interface FrameData {
    nx: number;
    ny: number;
    velocity: number[];
    u: number[];
    v: number[];
    rho: number[];
    p: number[];
    omega: number[];
    obstacle: number[];
}

export interface ProbeInfo {
    x: number;
    y: number;
    u: number;
    v: number;
    speed: number;
    p: number;
    omega: number;
    canvasX: number;
    canvasY: number;
}

interface FlowCanvasProps {
    frameData: FrameData;
    field: 'velocity' | 'pressure' | 'vorticity';
    showStreamlines: boolean;
    showQuiver: boolean;
    quiverConfig?: QuiverConfig;
    canvasSize: { width: number; height: number };
    colorRange?: { min: number; max: number } | null;
    onProbe?: (info: ProbeInfo | null) => void;
}

export default function FlowCanvas({
    frameData,
    field,
    showStreamlines,
    showQuiver,
    quiverConfig,
    canvasSize,
    colorRange,
    onProbe,
}: FlowCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageDataRef = useRef<ImageData | null>(null);
    const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [probe, setProbe] = useState<ProbeInfo | null>(null);

    const { nx, ny, velocity, u, v, p, omega, obstacle } = frameData;

    // Compute color range from data (NaN-safe, symmetric for pressure)
    const range = useMemo(() => {
        if (colorRange) return colorRange;

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
            // Fallback for empty, NaN-only, or constant fields
            if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal === maxVal) {
                return { min: -1, max: 1 };
            }
            // Use symmetric range around 0 for pressure (fluctuations are symmetric)
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
    }, [field, velocity, p, omega, colorRange]);

    // Choose colormap
    const cmap = field === 'vorticity' ? 'rdbu' : field === 'pressure' ? 'coolwarm' : 'jet';

    // Get the values array for the selected field
    const values = field === 'velocity' ? velocity : field === 'pressure' ? p : omega;

    // Memoize streamline paths to avoid recomputation every render
    const streamlines = useMemo(() => {
        if (field !== 'velocity' || !showStreamlines || !frameData) return [];
        return buildStreamlines(u, v, nx, ny, obstacle, 13);
    }, [frameData, field, showStreamlines, u, v, nx, ny, obstacle]);

    // Render contour + obstacles
    const renderContour = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;

        const { min, max } = range;
        const dataRange = max - min || 1;

        // Create or reuse pixel buffer at native grid resolution
        if (!imageDataRef.current || imageDataRef.current.width !== nx || imageDataRef.current.height !== ny) {
            imageDataRef.current = ctx.createImageData(nx, ny);
        }
        const imageData = imageDataRef.current;
        const data = imageData.data;

        // FLIP: canvas row 0 = data row ny-1 (top = lid)
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
                const c = sampleColormap(cmap, t);
                data[pixelIdx] = c[0];
                data[pixelIdx + 1] = c[1];
                data[pixelIdx + 2] = c[2];
                data[pixelIdx + 3] = 255;
            }
        }

        // Scale up to display canvas (reuse temp canvas)
        if (!tempCanvasRef.current) {
            tempCanvasRef.current = document.createElement('canvas');
        }
        const tempCanvas = tempCanvasRef.current;
        tempCanvas.width = nx;
        tempCanvas.height = ny;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;

        tempCtx.putImageData(imageData, 0, 0);

        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(tempCanvas, 0, 0, canvasSize.width, canvasSize.height);

        // Compute scale factors for overlays
        const sx = canvasSize.width / nx;
        const sy = canvasSize.height / ny;

        // Draw obstacle boundary edges
        drawObstacles(ctx, obstacle, nx, ny, sx, sy);

        // Draw streamlines (only for velocity field)
        if (field === 'velocity' && showStreamlines && streamlines.length > 0) {
            drawStreamlines(ctx, streamlines, u, v, nx, ny, range.max, sx, sy);
        }

        // Draw quiver arrows (velocity field only)
        if (field === 'velocity' && showQuiver && u && v && obstacle) {
            const scaleX = canvas.width / nx;
            const scaleY = canvas.height / ny;
            const scale = Math.min(scaleX, scaleY);
            const offX = (canvas.width - nx * scale) / 2;
            const offY = (canvas.height - ny * scale) / 2;
            drawQuiver(ctx, u, v, nx, ny, obstacle, range.max, scale, scale, offX, offY, cmap, quiverConfig ?? DEFAULT_QUIVER_CONFIG);
        }
    }, [frameData, field, showStreamlines, showQuiver, quiverConfig, canvasSize, range, cmap, values, obstacle, u, v, nx, ny, streamlines]);

    useEffect(() => {
        renderContour();
    }, [renderContour]);

    // Mouse probe handler
    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const canvas = canvasRef.current;
            if (!canvas || !onProbe) return;

            const rect = canvas.getBoundingClientRect();
            const scaleX = nx / rect.width;
            const scaleY = ny / rect.height;

            // Convert to grid coordinates (y=0 at bottom in data, top in canvas)
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;
            const gx = canvasX * scaleX;
            const gy = ny - 1 - canvasY * scaleY;

            if (gx < 0 || gx >= nx || gy < 0 || gy >= ny) {
                setProbe(null);
                onProbe(null);
                return;
            }

            const ix = Math.floor(gx);
            const iy = Math.floor(gy);
            const idx = iy * nx + ix;

            const uVal = sampleField(u, nx, ny, gx, gy);
            const vVal = sampleField(v, nx, ny, gx, gy);

            const info: ProbeInfo = {
                x: ix,
                y: iy,
                u: uVal,
                v: vVal,
                speed: Math.hypot(uVal, vVal),
                p: p[idx],
                omega: omega[idx],
                canvasX,
                canvasY,
            };

            setProbe(info);
            onProbe(info);
        },
        [u, v, p, omega, nx, ny, onProbe]
    );

    const handleMouseLeave = useCallback(() => {
        setProbe(null);
        if (onProbe) onProbe(null);
    }, [onProbe]);

    // Guard: skip render when grid has zero size
    if (nx === 0 || ny === 0) {
        return <div className="flow-canvas-container" />;
    }

    return (
        <div className="flow-canvas-container">
            <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: 'crosshair' }}
            />
            {probe && (
                <div
                    className="probe-tooltip"
                    style={{
                        left: Math.min(probe.canvasX + 12, canvasSize.width - 150),
                        top: Math.max(Math.min(probe.canvasY - 40, canvasSize.height - 80), 4),
                    }}
                >
                    <span>x={probe.x}, y={probe.y}</span>
                    <span>u={probe.u.toFixed(4)}</span>
                    <span>v={probe.v.toFixed(4)}</span>
                    <span>|V|={probe.speed.toFixed(4)}</span>
                    <span>p={probe.p.toFixed(4)}</span>
                    <span>&omega;={probe.omega.toFixed(4)}</span>
                </div>
            )}
        </div>
    );
}

// Draw obstacle boundary cells as dark filled rectangles
function drawObstacles(
    ctx: CanvasRenderingContext2D,
    obs: number[],
    nx: number,
    ny: number,
    sx: number,
    sy: number
) {
    ctx.fillStyle = '#1a1e22';

    const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
            if (!obs[y * nx + x]) continue;

            // Only draw boundary cells (adjacent to fluid)
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
                ctx.fillRect(
                    x * sx,
                    (ny - 1 - y) * sy,
                    sx + 0.5,
                    sy + 0.5
                );
            }
        }
    }
}

// Draw speed-colored streamlines
function drawStreamlines(
    ctx: CanvasRenderingContext2D,
    lines: Array<Array<{ x: number; y: number }>>,
    u: number[],
    v: number[],
    nx: number,
    ny: number,
    vmax: number,
    sx: number,
    sy: number
) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.5;

    for (const line of lines) {
        for (let i = 1; i < line.length; i++) {
            const a = line[i - 1];
            const b = line[i];

            // Sample speed at midpoint for coloring
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const sp = Math.hypot(
                sampleField(u, nx, ny, mx, my),
                sampleField(v, nx, ny, mx, my)
            );
            const t = Math.min(1, sp / (vmax || 1));
            const [r, g, bl] = sampleColormap('jet', t);

            ctx.strokeStyle = `rgba(${r},${g},${bl},0.9)`;

            // Transform: canvas_y = ny - 1 - grid_y (y=0 bottom in data, top in canvas)
            ctx.beginPath();
            ctx.moveTo(a.x * sx, (ny - 1 - a.y) * sy);
            ctx.lineTo(b.x * sx, (ny - 1 - b.y) * sy);
            ctx.stroke();
        }
    }
}
