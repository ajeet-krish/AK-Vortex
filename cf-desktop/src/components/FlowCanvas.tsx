import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Renderer, type RenderConfig } from '../renderer/Renderer';
import { FallbackRenderer, type FallbackRenderConfig } from '../renderer/FallbackRenderer';
import type { ColormapName } from '../renderer/ColormapTexture';
import type { FrameData, FrameBatchData, ProbeInfo } from '../types';
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
    /** Pre-loaded batch frames for TEXTURE_2D_ARRAY rendering. */
    batchFrames?: FrameBatchData | null;
    /** Current frame index for batch rendering. */
    frameIndex?: number;
}

export default function FlowCanvas({
    frameData,
    field,
    showQuiver,
    quiverConfig,
    canvasSize,
    colorRange,
    onProbe,
    batchFrames,
    frameIndex,
}: FlowCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<Renderer | null>(null);
    const fallbackRef = useRef<FallbackRenderer | null>(null);
    const [useFallback, setUseFallback] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const batchUploadedRef = useRef(false);

    // Precompute field ranges for diagnostic overlay (avoids Math.min/max spread on large arrays)
    const diagURange = useMemo(() => computeRange(frameData.u), [frameData]);
    const diagVRange = useMemo(() => computeRange(frameData.v), [frameData]);
    const diagVelRange = useMemo(() => computeRange(frameData.velocity), [frameData]);

    // Compute batch velocity max for color range
    const batchVelMax = useMemo(() => {
        if (!batchFrames) return 0;
        let maxVal = 0;
        const n = batchFrames.nx * batchFrames.ny;
        for (let f = 0; f < batchFrames.nFrames; f++) {
            const base = f * batchFrames.nChannels * n;
            for (let i = 0; i < n; i++) {
                const ux = batchFrames.layers[base + i];
                const vy = batchFrames.layers[base + n + i];
                const sp = ux * ux + vy * vy;
                if (sp > maxVal) maxVal = sp;
            }
        }
        return Math.sqrt(maxVal);
    }, [batchFrames]);

    // Container ref: the parent div that holds whichever canvas is active
    const containerRef = useRef<HTMLDivElement>(null);

    // Initialize WebGL renderer, fall back to Canvas2D on failure
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        try {
            rendererRef.current = new Renderer(canvas);
            setUseFallback(false);
        } catch (e) {
            console.warn('WebGL initialization failed, using Canvas2D fallback:', e);
            // Create a fresh Canvas2D renderer (its own canvas element)
            try {
                const fb = new FallbackRenderer();
                fallbackRef.current = fb;
                // Swap: hide WebGL canvas, insert the 2D canvas into the container
                canvas.style.display = 'none';
                const fbCanvas = fb.getElement();
                fbCanvas.style.display = 'block';
                fbCanvas.style.width = canvas.style.width;
                fbCanvas.style.height = canvas.style.height;
                container.appendChild(fbCanvas);
                setUseFallback(true);
            } catch (fbErr) {
                console.error('Canvas2D fallback also failed:', fbErr);
            }
        }

        return () => {
            rendererRef.current?.destroy();
            rendererRef.current = null;
            if (fallbackRef.current) {
                const fbCanvas = fallbackRef.current.getElement();
                fbCanvas.parentElement?.removeChild(fbCanvas);
                fallbackRef.current.destroy();
                fallbackRef.current = null;
            }
        };
    }, []);

    // Handle canvas resize (DPR-aware for retina-sharp rendering)
    useEffect(() => {
        if (useFallback) {
            // Resize the fallback's own canvas
            const fbCanvas = fallbackRef.current?.getElement();
            if (fbCanvas) {
                fbCanvas.width = canvasSize.width * (window.devicePixelRatio || 1);
                fbCanvas.height = canvasSize.height * (window.devicePixelRatio || 1);
                fbCanvas.style.width = `${canvasSize.width}px`;
                fbCanvas.style.height = `${canvasSize.height}px`;
            }
        } else {
            const canvas = canvasRef.current;
            if (!canvas) return;
            rendererRef.current?.resize(canvasSize.width, canvasSize.height);
        }
    }, [canvasSize, useFallback]);

    // Upload batch frames to GPU (one-time operation per batch change)
    useEffect(() => {
        if (useFallback) return;
        const renderer = rendererRef.current;
        if (!batchFrames || !renderer) {
            batchUploadedRef.current = false;
            return;
        }

        renderer.uploadAllFrames(
            batchFrames.layers,
            batchFrames.nx,
            batchFrames.ny,
            batchFrames.nFrames,
            batchFrames.nChannels,
        );
        batchUploadedRef.current = true;
        console.log(`[FlowCanvas] Batch uploaded ${batchFrames.nFrames} frames to GPU`);
    }, [batchFrames, useFallback]);

    // Compute color range (NaN-safe, symmetric for pressure)
    const effectiveRange = useMemo(() => {
        if (colorRange) {
            return colorRange;
        }

        // Batch mode: use batchVelMax for velocity, or compute from last frameData for other fields
        if (batchFrames) {
            if (field === 'velocity') {
                const headroom = batchVelMax > 0 ? batchVelMax * 1.05 : 1;
                return { min: 0, max: headroom };
            }
            // For pressure/vorticity in batch mode, fall through to frameData computation below
        }

        let range: { min: number; max: number };

        if (field === 'velocity') {
            let maxVal = 0;
            for (const val of frameData.velocity) {
                if (Number.isFinite(val) && val > maxVal) {
                    maxVal = val;
                }
            }
            // Add 5% headroom so max value doesn't clip at pure red
            const headroom = maxVal > 0 ? maxVal * 1.05 : 1;
            range = { min: 0, max: headroom };
        } else if (field === 'pressure') {
            let minVal = Infinity;
            let maxVal = -Infinity;
            for (const val of frameData.p) {
                if (!Number.isFinite(val)) continue;
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
            }
            if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal === maxVal) {
                range = { min: -1, max: 1 };
            } else {
                const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
                range = { min: -absMax, max: absMax };
            }
        } else {
            let maxAbs = 0;
            for (const val of frameData.omega) {
                if (Number.isFinite(val)) {
                    const abs = Math.abs(val);
                    if (abs > maxAbs) maxAbs = abs;
                }
            }
            const headroom = maxAbs > 0 ? maxAbs * 1.05 : 1;
            range = { min: -headroom, max: headroom };
        }

        return range;
    }, [field, frameData, colorRange, batchFrames, batchVelMax]);

    // Choose colormap based on field
    const cmap: ColormapName = field === 'vorticity' ? 'rdbu' : field === 'pressure' ? 'coolwarm' : 'jet';

    // Upload frame data (obstacles uploaded internally by Renderer)
    useEffect(() => {
        if (useFallback) {
            // FallbackRenderer was already created in the init effect with its own canvas
            fallbackRef.current?.uploadFrameData(frameData);
        } else {
            // In batch mode, obstacles are in the TEXTURE_2D_ARRAY (channel 4)
            if (!batchFrames) {
                rendererRef.current?.uploadFrameData(frameData);
            }
        }
    }, [frameData, useFallback, batchFrames]);

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

        // Batch mode: render from pre-uploaded texture array
        if (batchFrames && batchUploadedRef.current && frameIndex !== undefined) {
            renderer.renderFrame(config, frameIndex);
            return;
        }

        // Single-frame mode (legacy path)
        renderer.render(config, frameData);
    }, [frameData, field, showQuiver, effectiveRange, cmap, useFallback, batchFrames, frameIndex, canvasSize]);

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
        <div className="flow-canvas-container" ref={containerRef} style={{ position: 'relative' }}>
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
                    <div>Mode: {batchFrames ? `Batch (${batchFrames.nFrames} frames)` : 'Single frame'}</div>
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
