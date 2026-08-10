import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Renderer, type RenderConfig } from '../renderer/Renderer';
import type { ColormapName } from '../renderer/ColormapTexture';
import type { FrameData, ProbeInfo } from '../types';
import { sampleField } from '../utils/streamline';

export type { ProbeInfo } from '../types';

interface FlowCanvasProps {
    frameData: FrameData;
    field: 'velocity' | 'pressure' | 'vorticity';
    showQuiver: boolean;
    quiverConfig?: { gridSpacing: number; arrowScale: number };
    canvasSize: { width: number; height: number };
    colorRange?: { min: number; max: number } | null;
    onProbe?: (info: ProbeInfo | null) => void;
}

export default function FlowCanvas({
    frameData,
    field,
    showQuiver,
    quiverConfig,
    canvasSize,
    colorRange,
    onProbe,
}: FlowCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<Renderer | null>(null);
    const [webglError, setWebglError] = useState<string | null>(null);

    // Initialize WebGL renderer on mount
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        try {
            rendererRef.current = new Renderer(canvas);
            setWebglError(null);
        } catch (e) {
            console.error('WebGL initialization failed:', e);
            setWebglError(e instanceof Error ? e.message : 'WebGL initialization failed');
        }

        return () => {
            rendererRef.current?.destroy();
            rendererRef.current = null;
        };
    }, []);

    // Handle canvas resize
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;
        rendererRef.current?.resize(canvasSize.width, canvasSize.height);
    }, [canvasSize]);

    // Compute color range (NaN-safe, symmetric for pressure)
    const effectiveRange = useMemo(() => {
        if (colorRange) return colorRange;

        if (field === 'velocity') {
            let maxVal = 0;
            for (const val of frameData.velocity) {
                if (Number.isFinite(val) && val > maxVal) maxVal = val;
            }
            return { min: 0, max: maxVal || 1 };
        } else if (field === 'pressure') {
            let minVal = Infinity;
            let maxVal = -Infinity;
            for (const val of frameData.p) {
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
            for (const val of frameData.omega) {
                if (Number.isFinite(val)) {
                    const abs = Math.abs(val);
                    if (abs > maxAbs) maxAbs = abs;
                }
            }
            return { min: -maxAbs, max: maxAbs || 1 };
        }
    }, [field, frameData, colorRange]);

    // Choose colormap based on field
    const cmap: ColormapName = field === 'vorticity' ? 'rdbu' : field === 'pressure' ? 'coolwarm' : 'jet';

    // Upload frame data (obstacles uploaded internally by Renderer)
    useEffect(() => {
        if (!rendererRef.current) return;
        rendererRef.current.uploadFrameData(frameData);
    }, [frameData]);

    // Upload quiver data to GPU
    useEffect(() => {
        if (!rendererRef.current) return;
        if (showQuiver) {
            const step = quiverConfig?.gridSpacing ?? 8;
            rendererRef.current.uploadQuiver(frameData.u, frameData.v, frameData.obstacle, step);
        }
    }, [frameData, showQuiver, quiverConfig]);

    // Render frame via WebGL
    useEffect(() => {
        const renderer = rendererRef.current;
        if (!renderer) return;

        const config: RenderConfig = {
            field,
            showObstacles: true,
            showQuiver,
            colorRange: effectiveRange,
            cmap,
        };

        renderer.render(config, frameData);
    }, [frameData, field, showQuiver, effectiveRange, cmap]);

    // Mouse probe: convert canvas pixel to grid coordinate (accounting for Y flip)
    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (!rendererRef.current || !onProbe) return;
            const canvas = canvasRef.current;
            if (!canvas) return;

            const rect = canvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;

            // Convert CSS pixels to canvas pixel coordinates
            const cx = canvasX * (canvas.width / rect.width);
            const cy = canvasY * (canvas.height / rect.height);

            // Invert the viewport transform (projection flips Y)
            const viewport = rendererRef.current.getViewport();
            const vs = viewport.getState();
            const gx = vs.centerX + (cx - canvas.width / 2) / vs.zoom;
            const gy = vs.centerY - (cy - canvas.height / 2) / vs.zoom;

            if (gx < 0 || gx >= frameData.nx || gy < 0 || gy >= frameData.ny) {
                onProbe(null);
                return;
            }

            const ix = Math.floor(gx);
            const iy = Math.floor(gy);
            const idx = iy * frameData.nx + ix;

            const uVal = sampleField(frameData.u, frameData.nx, frameData.ny, gx, gy);
            const vVal = sampleField(frameData.v, frameData.nx, frameData.ny, gx, gy);

            const info: ProbeInfo = {
                x: ix,
                y: iy,
                u: uVal,
                v: vVal,
                speed: Math.hypot(uVal, vVal),
                p: frameData.p[idx],
                omega: frameData.omega[idx],
                canvasX,
                canvasY,
            };

            onProbe(info);
        },
        [frameData, onProbe]
    );

    const handleMouseLeave = useCallback(() => {
        onProbe?.(null);
    }, [onProbe]);

    // Guard: skip render when grid has zero size
    if (frameData.nx === 0 || frameData.ny === 0) {
        return <div className="flow-canvas-container" />;
    }

    // WebGL initialization failed fallback
    if (webglError) {
        return (
            <div className="flow-canvas-container" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '24px',
                color: 'var(--danger)',
                background: 'var(--bg-tertiary)',
                borderRadius: '4px',
                width: canvasSize.width,
                height: canvasSize.height,
            }}>
                <p style={{ margin: 0, fontWeight: 600 }}>WebGL Error</p>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>{webglError}</p>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                    WebGL 2.0 is required for visualization. Please check your graphics drivers.
                </p>
            </div>
        );
    }

    return (
        <div className="flow-canvas-container">
            <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            />
        </div>
    );
}
