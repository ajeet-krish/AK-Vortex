import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SimConfig, FrameData } from '../types';
import type { Shape } from '../components/GeometryEditor';

export interface SimProgress {
    step: number;
    total: number;
    status: string;
}

const CASE_DEFAULTS: Record<string, { nx: number; ny: number }> = {
    cylinder: { nx: 800, ny: 300 },
    cavity: { nx: 512, ny: 512 },
    step: { nx: 800, ny: 300 },
};

export interface SimulationState {
    config: SimConfig;
    setConfig: React.Dispatch<React.SetStateAction<SimConfig>>;
    running: boolean;
    canCancel: boolean;
    simProgress: SimProgress;
    outputDir: string | null;
    frames: number[];
    frameIndex: number;
    setFrameIndex: React.Dispatch<React.SetStateAction<number>>;
    frameData: FrameData | null;
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
    const [running, setRunning] = useState(false);
    const [canCancel, setCanCancel] = useState(false);
    const [simProgress, setSimProgress] = useState<SimProgress>({ step: 0, total: 0, status: '' });
    const [outputDir, setOutputDir] = useState<string | null>(null);
    const [frames, setFrames] = useState<number[]>([]);
    const [frameIndex, setFrameIndex] = useState(0);
    const [frameData, setFrameData] = useState<FrameData | null>(null);
    const [solverLog, setSolverLog] = useState<string[]>([]);

    const outputDirRef = useRef(outputDir);
    outputDirRef.current = outputDir;

    // Auto-load frame when frameIndex changes
    useEffect(() => {
        if (frames.length === 0 || !outputDir) return;
        const step = frames[frameIndex];
        if (step === undefined) return;

        let cancelled = false;
        invoke<FrameData>('read_frame_json', { path: outputDir, step })
            .then((data) => { if (!cancelled) setFrameData(data); })
            .catch((e) => { if (!cancelled) console.error(e); });

        return () => { cancelled = true; };
    }, [frameIndex, frames, outputDir]);

    // Poll solver status while simulation is running
    useEffect(() => {
        if (!running) return;

        let prevFrameCount = 0;
        let prevLogLen = 0;

        const pollStatus = async () => {
            try {
                const status = await invoke<{ running: boolean; log: string[] }>('get_simulation_status');

                // Only update log if it grew
                if (status.log.length !== prevLogLen) {
                    prevLogLen = status.log.length;
                    setSolverLog(status.log);
                }

                // Check for new frames (only update state if count changed)
                if (outputDirRef.current) {
                    const frameList = await invoke<number[]>('list_frames', { path: outputDirRef.current });
                    if (frameList.length !== prevFrameCount) {
                        prevFrameCount = frameList.length;
                        setFrames(frameList);
                        setSimProgress({
                            step: frameList[frameList.length - 1],
                            total: config.maxSteps,
                            status: status.running ? 'Running...' : 'Complete!',
                        });
                    }
                }

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
    }, [config, shapes]);

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
        const defaults = CASE_DEFAULTS[caseType] || { nx: 800, ny: 300 };
        setConfig((prev) => ({ ...prev, caseType, nx: defaults.nx, ny: defaults.ny }));
    }, []);

    return {
        config,
        setConfig,
        running,
        canCancel,
        simProgress,
        outputDir,
        frames,
        frameIndex,
        setFrameIndex,
        frameData,
        runSimulation,
        cancelSimulation,
        resetSimulation,
        handleCaseTypeChange,
        solverLog,
        setSolverLog,
    };
}
