import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Renderer, type RenderConfig } from '../renderer/Renderer';
import { FallbackRenderer, type FallbackRenderConfig } from '../renderer/FallbackRenderer';
import type { ColormapName } from '../renderer/ColormapTexture';
import type { FrameData, ProbeInfo } from '../types';
import { sampleField } from '../utils/streamline';

/** Loop-based range computation (avoids call-stack overflow on large arrays). */
const computeRange = (arr: Float32Array): { min: number; max: number } => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        if (Number.isFinite(arr[i])) {
            if (arr[i] < lo) lo = arr[i];
            if (arr[i] > hi) hi = arr[i];
        }
    }
    return { min: lo, max: hi };
};

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
    const fallbackRef = useRef<FallbackRenderer | null>(null);
    const [useFallback, setUseFallback] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);

    // Precompute field ranges for diagnostic overlay (avoids Math.min/max spread on large arrays)
    const diagURange = useMemo(() => computeRange(frameData.u), [frameData]);
    const diagVRange = useMemo(() => computeRange(frameData.v), [frameData]);
    const diagVelRange = useMemo(() => computeRange(frameData.velocity), [frameData]);

    // Initialize WebGL renderer, fall back to Canvas2D on failure
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        try {
            rendererRef.current = new Renderer(canvas);
            setUseFallback(false);
        } catch (e) {
            console.warn('WebGL initialization failed, using Canvas2D fallback:', e);
            setUseFallback(true);
        }

        return () => {
            rendererRef.current?.destroy();
            rendererRef.current = null;
            fallbackRef.current?.destroy();
            fallbackRef.current = null;
        };
    }, []);

    // Handle canvas resize (DPR-aware for retina-sharp rendering)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (useFallback) {
            fallbackRef.current?.resize(canvasSize.width, canvasSize.height);
        } else {
            rendererRef.current?.resize(canvasSize.width, canvasSize.height);
        }
        // CSS dimensions (what the user sees)
        canvas.style.width = `${canvasSize.width}px`;
        canvas.style.height = `${canvasSize.height}px`;
    }, [canvasSize, useFallback]);

    // Compute color range (NaN-safe, symmetric for pressure)
    const effectiveRange = useMemo(() => {
        if (colorRange) {
            return colorRange;
        }

        let range: { min: number; max: number };

        if (field === 'velocity') {
            let maxVal = 0;
            let finiteCount = 0;
            for (const val of frameData.velocity) {
                if (Number.isFinite(val) && val > maxVal) {
                    maxVal = val;
                    finiteCount++;
                }
            }
            // Add 5% headroom so max value doesn't clip at pure red
            const headroom = maxVal > 0 ? maxVal * 1.05 : 1;
            range = { min: 0, max: headroom };
        } else if (field === 'pressure') {
            let minVal = Infinity;
            let maxVal = -Infinity;
            let finiteCount = 0;
            for (const val of frameData.p) {
                if (!Number.isFinite(val)) continue;
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
                finiteCount++;
            }
            if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal === maxVal) {
                range = { min: -1, max: 1 };
            } else {
                const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
                range = { min: -absMax, max: absMax };
            }
        } else {
            let maxAbs = 0;
            let finiteCount = 0;
            for (const val of frameData.omega) {
                if (Number.isFinite(val)) {
                    const abs = Math.abs(val);
                    if (abs > maxAbs) maxAbs = abs;
                    finiteCount++;
                }
            }
            const headroom = maxAbs > 0 ? maxAbs * 1.05 : 1;
            range = { min: -headroom, max: headroom };
        }

        return range;
    }, [field, frameData, colorRange]);

    // Choose colormap based on field
    const cmap: ColormapName = field === 'vorticity' ? 'rdbu' : field === 'pressure' ? 'coolwarm' : 'jet';

    // Upload frame data (obstacles uploaded internally by Renderer)
    useEffect(() => {
        if (useFallback) {
            if (!fallbackRef.current && canvasRef.current) {
                fallbackRef.current = new FallbackRenderer(canvasRef.current);
            }
            fallbackRef.current?.uploadFrameData(frameData);
        } else {
            rendererRef.current?.uploadFrameData(frameData);
        }
    }, [frameData, useFallback]);

    // Upload quiver data to GPU (no-op for Canvas2D fallback)
    useEffect(() => {
        if (useFallback) return;
        if (!rendererRef.current) return;
        if (showQuiver) {
            const step = quiverConfig?.gridSpacing ?? 8;
            rendererRef.current.uploadQuiver(frameData.u, frameData.v, frameData.obstacle, step);
        }
    }, [frameData, showQuiver, quiverConfig, useFallback]);

    // Render frame via WebGL or Canvas2D fallback
    useEffect(() => {
        if (useFallback) {
            const fb = fallbackRef.current;
            if (!fb) return;

            const config: FallbackRenderConfig = {
                field,
                showObstacles: true,
                colorRange: effectiveRange,
                cmap,
            };

            fb.render(config, frameData);
            return;
        }

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
    }, [frameData, field, showQuiver, effectiveRange, cmap, useFallback]);

    // Mouse probe: convert canvas pixel to grid coordinate (accounting for Y flip)
    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (!onProbe) return;
            const canvas = canvasRef.current;
            if (!canvas) return;

            const rect = canvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;

            // Convert CSS pixels to canvas pixel coordinates
            const cx = canvasX * (canvas.width / rect.width);
            const cy = canvasY * (canvas.height / rect.height);

            // Get viewport state from whichever renderer is active
            const viewport = useFallback
                ? fallbackRef.current?.getViewport()
                : rendererRef.current?.getViewport();
            if (!viewport) return;

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
        [frameData, onProbe, useFallback]
    );

    const handleMouseLeave = useCallback(() => {
        onProbe?.(null);
    }, [onProbe]);

    // Toggle diagnostic overlay with Ctrl+D
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setShowDiagnostics((prev) => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Guard: skip render when grid has zero size
    if (frameData.nx === 0 || frameData.ny === 0) {
        return <div className="flow-canvas-container" />;
    }

    return (
        <div className="flow-canvas-container" style={{ position: 'relative' }}>
            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            />
            {showDiagnostics && (
                <div style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    background: 'rgba(0,0,0,0.85)',
                    color: '#0f0',
                    padding: 12,
                    fontFamily: 'monospace',
                    fontSize: 11,
                    zIndex: 100,
                    borderRadius: 4,
                    maxHeight: 240,
                    overflow: 'auto',
                    lineHeight: 1.5,
                    pointerEvents: 'none',
                }}>
                    <div style={{ color: '#0ff', marginBottom: 4 }}>Diagnostics (Ctrl+D)</div>
                    <div>Grid: {frameData.nx}x{frameData.ny}</div>
                    <div>Field: {field}</div>
                    <div>Range: [{effectiveRange.min.toFixed(6)}, {effectiveRange.max.toFixed(6)}]</div>
                    <div>u: [{diagURange.min.toFixed(6)}, {diagURange.max.toFixed(6)}]</div>
                    <div>v: [{diagVRange.min.toFixed(6)}, {diagVRange.max.toFixed(6)}]</div>
                    <div>vel: [{diagVelRange.min.toFixed(6)}, {diagVelRange.max.toFixed(6)}]</div>
                    <div>Canvas: {canvasSize.width}x{canvasSize.height} (DPR: {window.devicePixelRatio})</div>
                    <div>Renderer: {useFallback ? 'Canvas2D (fallback)' : 'WebGL2'}</div>
                    <div>Colormap: {cmap}</div>
                </div>
            )}
            {useFallback && (
                <div style={{
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
                    background: 'rgba(0,0,0,0.7)',
                    color: '#f0ad4e',
                    padding: '4px 8px',
                    fontFamily: 'monospace',
                    fontSize: 10,
                    borderRadius: 3,
                    pointerEvents: 'none',
                }}>
                    Canvas2D fallback
                </div>
            )}
        </div>
    );
}
