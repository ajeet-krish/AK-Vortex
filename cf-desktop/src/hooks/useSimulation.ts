import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { SimConfig, FrameData, GridConfig, SystemInfo, FrameBatchData } from '../types';
import type { Shape } from '../components/GeometryEditor';
import { parseBinaryFrame, parseBinaryFrameRaw, wrapFrameData } from '../utils/binaryFrame';
import { getDefaultGridConfig } from '../config/gridPresets';
import { getSystemInfo } from '../utils/systemInfo';

export interface SimProgress {
    step: number;
    total: number;
    status: string;
}

const MAX_BATCH_FRAMES = 500;

const CASE_DEFAULTS: Record<string, { nx: number; ny: number }> = {
    cylinder: { nx: 800, ny: 300 },
    cavity: { nx: 512, ny: 512 },
    step: { nx: 800, ny: 300 },
};

export interface SimulationState {
    config: SimConfig;
    setConfig: React.Dispatch<React.SetStateAction<SimConfig>>;
    gridConfig: GridConfig;
    setGridConfig: React.Dispatch<React.SetStateAction<GridConfig>>;
    systemInfo: SystemInfo | null;
    running: boolean;
    canCancel: boolean;
    simProgress: SimProgress;
    outputDir: string | null;
    frames: number[];
    frameIndex: number;
    setFrameIndex: React.Dispatch<React.SetStateAction<number>>;
    frameData: FrameData | null;
    batchFrames: FrameBatchData | null;
    loadAllFrames: () => Promise<FrameBatchData | null>;
    runSimulation: () => Promise<void>;
    cancelSimulation: () => Promise<void>;
    resetSimulation: () => void;
    handleCaseTypeChange: (caseType: string) => void;
    solverLog: string[];
    setSolverLog: React.Dispatch<React.SetStateAction<string[]>>;
}

export function useSimulation(shapes: Shape[]): SimulationState {
    const [config, setConfig] = useState<SimConfig>({
        nx: 1200,
        ny: 400,
        re: 100,
        uInflow: 0.1,
        maxSteps: 30000,
        saveInterval: 1000,
        caseType: 'custom',
    });

    const [gridConfig, setGridConfig] = useState<GridConfig>(
        getDefaultGridConfig('custom'),
    );

    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

    const [running, setRunning] = useState(false);
    const [canCancel, setCanCancel] = useState(false);
    const [simProgress, setSimProgress] = useState<SimProgress>({ step: 0, total: 0, status: '' });
    const [outputDir, setOutputDir] = useState<string | null>(null);
    const [frames, setFrames] = useState<number[]>([]);
    const [frameIndex, setFrameIndex] = useState(0);
    const [frameData, setFrameData] = useState<FrameData | null>(null);
    const [batchFrames, setBatchFrames] = useState<FrameBatchData | null>(null);
    const [solverLog, setSolverLog] = useState<string[]>([]);

    const outputDirRef = useRef(outputDir);
    outputDirRef.current = outputDir;

    // Query system info on mount
    useEffect(() => {
        getSystemInfo().then(setSystemInfo).catch(console.warn);
    }, []);

    // Sync gridConfig.nx/ny -> config.nx/ny (gridConfig is the source of truth)
    useEffect(() => {
        setConfig((prev) => ({
            ...prev,
            nx: gridConfig.nx,
            ny: gridConfig.ny,
        }));
    }, [gridConfig.nx, gridConfig.ny]);

    // Auto-load frame when frameIndex changes (batch-first, then binary, then JSON fallback)
    useEffect(() => {
        if (frames.length === 0 || !outputDir) return;
        const step = frames[frameIndex];
        if (step === undefined) return;

        let cancelled = false;

        // Batch path: frame data is already in batchFrames.layers
        if (batchFrames && frameIndex < batchFrames.nFrames) {
            const n = batchFrames.nx * batchFrames.ny;
            const base = frameIndex * batchFrames.nChannels * n;
            const u = batchFrames.layers.subarray(base + 0 * n, base + 1 * n);
            const v = batchFrames.layers.subarray(base + 1 * n, base + 2 * n);
            const p = batchFrames.layers.subarray(base + 2 * n, base + 3 * n);
            const omega = batchFrames.layers.subarray(base + 3 * n, base + 4 * n);
            const obstacle = batchFrames.layers.subarray(base + 4 * n, base + 5 * n);
            const velocity = new Float32Array(n);
            for (let k = 0; k < n; k++) {
                velocity[k] = Math.sqrt(u[k] * u[k] + v[k] * v[k]);
            }
            const rho = new Float32Array(n);
            rho.fill(1.0);
            if (!cancelled) {
                setFrameData({
                    nx: batchFrames.nx,
                    ny: batchFrames.ny,
                    velocity,
                    u: new Float32Array(u),
                    v: new Float32Array(v),
                    rho,
                    p: new Float32Array(p),
                    omega: new Float32Array(omega),
                    obstacle: new Float32Array(obstacle),
                });
            }
            return () => { cancelled = true; };
        }

        // Try binary frame first (faster, single network read)
        invoke<number[]>("read_frame_binary", { path: outputDir, step })
            .then((bytes) => {
                if (cancelled) return;
                const buf = new Uint8Array(bytes).buffer;
                const data = parseBinaryFrame(buf);
                setFrameData(data);
            })
            .catch(() => {
                // Binary not available; fall back to JSON
                if (cancelled) return;
                invoke<{nx:number;ny:number;velocity:number[];u:number[];v:number[];rho:number[];p:number[];omega:number[];obstacle:number[]}>('read_frame_json', { path: outputDir, step })
                    .then((json) => {
                        if (!cancelled) setFrameData(wrapFrameData(json));
                    })
                    .catch((e) => {
                        if (!cancelled) console.error(e);
                    });
            });

        return () => { cancelled = true; };
    }, [frameIndex, frames, outputDir, batchFrames]);

    // Subscribe to incremental solver-log events while running
    useEffect(() => {
        if (!running) return;

        const unlisten = listen<string>('solver-log', (event) => {
            setSolverLog((prev) => {
                const next = [...prev, event.payload];
                return next.length > 5000 ? next.slice(next.length - 5000) : next;
            });
        });

        return () => { unlisten.then((fn) => fn()); };
    }, [running]);

    // Event-driven frame discovery during simulation
    useEffect(() => {
        if (!running || !outputDir) return;

        let cancelled = false;

        // Listen for frame-ready events from solver
        const unlisten = listen<number>('solver:frame-ready', async (event) => {
            if (cancelled) return;
            const step = event.payload;

            // Refresh frame list
            try {
                const frameList = await invoke<number[]>('list_frames', { path: outputDir });
                if (!cancelled) {
                    setFrames(frameList);
                    setSimProgress({
                        step,
                        total: config.maxSteps,
                        status: 'Running...',
                    });
                    // Auto-advance to latest frame
                    if (frameList.length > 0) {
                        setFrameIndex(frameList.length - 1);
                    }
                }
            } catch (e) {
                if (!cancelled) console.error('Failed to list frames:', e);
            }
        });

        return () => {
            cancelled = true;
            unlisten.then((fn) => fn());
        };
    }, [running, outputDir, config.maxSteps]);

    // Poll solver status to detect simulation completion
    useEffect(() => {
        if (!running) return;

        const pollStatus = async () => {
            try {
                const status = await invoke<{ running: boolean }>('get_simulation_status');

                if (!status.running && outputDirRef.current) {
                    setRunning(false);
                    setCanCancel(false);
                    // Load final frame list on completion
                    const frameList = await invoke<number[]>('list_frames', { path: outputDirRef.current });
                    setFrames(frameList);
                    if (frameList.length > 0) {
                        setFrameIndex(frameList.length - 1);
                    }
                }
            } catch (e) {
                console.error('Failed to poll status:', e);
            }
        };

        pollStatus();
        const timer = setInterval(pollStatus, 1500);
        return () => clearInterval(timer);
    }, [running]);

    // Eagerly load frame data when frames list changes (fixes black screen on Results tab)
    // This ensures frame data is available immediately when the user switches to Results
    useEffect(() => {
        if (frames.length === 0 || !outputDir) return;
        // If frameData is null and we have frames, load the current frameIndex
        if (frameData === null && frameIndex >= 0 && frameIndex < frames.length) {
            const step = frames[frameIndex];
            if (step !== undefined) {
                invoke<number[]>("read_frame_binary", { path: outputDir, step })
                    .then((bytes) => {
                        const buf = new Uint8Array(bytes).buffer;
                        const data = parseBinaryFrame(buf);
                        setFrameData(data);
                    })
                    .catch(() => {
                        invoke<{nx:number;ny:number;velocity:number[];u:number[];v:number[];rho:number[];p:number[];omega:number[];obstacle:number[]}>('read_frame_json', { path: outputDir, step })
                            .then((json) => setFrameData(wrapFrameData(json)))
                            .catch((e) => console.error(e));
                    });
            }
        }
    }, [frames, outputDir, frameIndex, frameData]);

    // Clear stale batch data when frames list changes (new sim or directory load)
    useEffect(() => {
        setBatchFrames(null);
    }, [frames]);

    /**
     * Load all frames via Tauri IPC, parse to interleaved layers, and return
     * FrameBatchData for upload to the GPU texture array.
     *
     * Call this once after simulation completes (or when opening an existing
     * output directory) to enable zero-copy frame switching.
     */
    const loadAllFrames = useCallback(async (): Promise<FrameBatchData | null> => {
        if (!outputDir || frames.length === 0) return null;

        const framesToLoad = frames.length > MAX_BATCH_FRAMES
          ? frames.slice(0, MAX_BATCH_FRAMES)
          : frames;
        if (frames.length > MAX_BATCH_FRAMES) {
          console.warn(
            `[useSimulation] Frame count ${frames.length} exceeds limit ${MAX_BATCH_FRAMES}, loading first ${MAX_BATCH_FRAMES}`
          );
        }

        console.log(`[useSimulation] Loading ${framesToLoad.length} frames from ${outputDir}`);

        const allRaw: Array<{
            nx: number; ny: number;
            u: Float32Array; v: Float32Array;
            p: Float32Array; omega: Float32Array;
            obstacle: Float32Array;
        }> = [];

        for (const step of framesToLoad) {
            try {
                const bytes = await invoke<number[]>("read_frame_binary", {
                    path: outputDir,
                    step,
                });
                const buf = new Uint8Array(bytes).buffer;
                allRaw.push(parseBinaryFrameRaw(buf));
            } catch {
                console.warn(`[useSimulation] Failed to load frame step ${step}, skipping`);
            }
        }

        if (allRaw.length === 0) return null;

        const nx = allRaw[0].nx;
        const ny = allRaw[0].ny;
        const nChannels = 5;
        const nFrames = allRaw.length;
        const pixelsPerFrame = nChannels * nx * ny;

        // Build interleaved layer array: [u0, v0, p0, omega0, obs0, u1, ...]
        const layers = new Float32Array(nFrames * pixelsPerFrame);
        for (let f = 0; f < nFrames; f++) {
            const src = allRaw[f];
            const n = nx * ny;
            const base = f * pixelsPerFrame;
            layers.set(src.u, base + 0 * n);
            layers.set(src.v, base + 1 * n);
            layers.set(src.p, base + 2 * n);
            layers.set(src.omega, base + 3 * n);
            layers.set(src.obstacle, base + 4 * n);
        }

        const result: FrameBatchData = { layers, nx, ny, nFrames, nChannels };
        setBatchFrames(result);

        const memMB = (layers.byteLength / (1024 * 1024)).toFixed(1);
        console.log(
            `[useSimulation] Batch loaded ${nFrames} frames (${nx}x${ny}, ${memMB} MB)`
        );

        return result;
    }, [outputDir, frames]);

    const runSimulation = useCallback(async () => {
        setRunning(true);
        setCanCancel(true);
        setFrames([]);
        setFrameData(null);
        setSimProgress({ step: 0, total: config.maxSteps, status: 'Initializing...' });

        try {
            await invoke('reset_solver');

            let dir: string;
            if (config.caseType === 'custom') {
                const geometryJson = JSON.stringify(
                    shapes.map((s) => {
                        if (s.type === 'circle') {
                            return { type: 'circle', x: s.x, y: s.y, radius: s.radius };
                        } else if (s.type === 'rectangle') {
                            return { type: 'rectangle', x: s.x, y: s.y, width: s.width, height: s.height };
                        } else {
                            return { type: 'polygon', points: s.points?.map((p) => [p.x, p.y]) || [] };
                        }
                    })
                );
                setSimProgress({ step: 0, total: config.maxSteps, status: 'Building geometry mesh...' });
                dir = await invoke<string>('run_geometry_simulation', {
                    nx: config.nx,
                    ny: config.ny,
                    re: config.re,
                    uInflow: config.uInflow,
                    maxSteps: config.maxSteps,
                    saveInterval: config.saveInterval,
                    geometryJson,
                    meshShape: gridConfig.meshShape,
                });
            } else {
                setSimProgress({ step: 0, total: config.maxSteps, status: 'Setting up simulation...' });
                dir = await invoke<string>('run_simulation', {
                    nx: config.nx,
                    ny: config.ny,
                    re: config.re,
                    uInflow: config.uInflow,
                    maxSteps: config.maxSteps,
                    saveInterval: config.saveInterval,
                    caseType: config.caseType,
                });
            }

            setOutputDir(dir);
        } catch (e) {
            console.error(e);
            setSimProgress({ step: 0, total: 0, status: 'Failed!' });
            setRunning(false);
            setCanCancel(false);
            alert(`Simulation failed: ${e}`);
        }
    }, [config, shapes, gridConfig]);

    const cancelSimulation = useCallback(async () => {
        try {
            await invoke('cancel_simulation');
            setSimProgress((prev) => ({ ...prev, status: 'Cancelling...' }));
        } catch (e) {
            console.error('Failed to cancel:', e);
        }
    }, []);

    const resetSimulation = useCallback(() => {
        setOutputDir(null);
        setFrames([]);
        setFrameData(null);
        setFrameIndex(0);
        setSolverLog([]);
    }, []);

    const handleCaseTypeChange = useCallback((caseType: string) => {
        const newGridConfig = getDefaultGridConfig(caseType);
        setGridConfig(newGridConfig);
        const defaults = CASE_DEFAULTS[caseType] || { nx: 800, ny: 300 };
        setConfig((prev) => ({ ...prev, caseType, nx: defaults.nx, ny: defaults.ny }));
    }, []);

    return {
        config,
        setConfig,
        gridConfig,
        setGridConfig,
        systemInfo,
        running,
        canCancel,
        simProgress,
        outputDir,
        frames,
        frameIndex,
        setFrameIndex,
        frameData,
        batchFrames,
        loadAllFrames,
        runSimulation,
        cancelSimulation,
        resetSimulation,
        handleCaseTypeChange,
        solverLog,
        setSolverLog,
    };
}
