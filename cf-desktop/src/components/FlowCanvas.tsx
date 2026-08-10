import { useRef, useEffect, useCallback, useMemo } from 'react';
import { Renderer, type RenderConfig } from '../renderer/Renderer';
import type { ColormapName } from '../renderer/ColormapTexture';
import type { FrameData, ProbeInfo } from '../types';
import type { Point } from '../utils/streamline';
import { sampleField } from '../utils/streamline';

export type { ProbeInfo } from '../types';

interface FlowCanvasProps {
    frameData: FrameData;
    field: 'velocity' | 'pressure' | 'vorticity';
    showStreamlines: boolean;
    showQuiver: boolean;
    showMesh?: boolean;
    quiverConfig?: { gridSpacing: number; arrowScale: number };
    canvasSize: { width: number; height: number };
    colorRange?: { min: number; max: number } | null;
    onProbe?: (info: ProbeInfo | null) => void;
    streamlines?: Point[][];
}

export default function FlowCanvas({
    frameData,
    field,
    showStreamlines,
    showQuiver,
    showMesh = false,
    quiverConfig,
    canvasSize,
    colorRange,
    onProbe,
    streamlines: streamlinesProp,
}: FlowCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<Renderer | null>(null);

    // Initialize WebGL renderer on mount
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        try {
            rendererRef.current = new Renderer(canvas);
        } catch (e) {
            console.error('WebGL initialization failed:', e);
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

    // Upload streamlines to GPU
    useEffect(() => {
        if (!rendererRef.current) return;
        const lines = streamlinesProp ?? [];
        if (lines.length > 0) {
            rendererRef.current.uploadStreamlines(lines, frameData.velocity, effectiveRange.max);
        }
    }, [streamlinesProp, frameData, effectiveRange]);

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
            showMesh,
            showObstacles: true,
            showStreamlines,
            showQuiver,
            colorRange: effectiveRange,
            cmap,
        };

        renderer.render(config, frameData);
    }, [frameData, field, showMesh, showStreamlines, showQuiver, effectiveRange, cmap]);

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
