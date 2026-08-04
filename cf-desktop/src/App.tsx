import { useState, useRef, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import GeometryEditor, { type Shape } from './components/GeometryEditor';
import FlowCanvas, { type ProbeInfo } from './components/FlowCanvas';
import ColorScaleBar from './components/ColorScaleBar';
import StaticPlots from './components/StaticPlots';

interface SimConfig {
    nx: number;
    ny: number;
    re: number;
    uInflow: number;
    maxSteps: number;
    saveInterval: number;
    caseType: string;
}

interface FrameData {
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

const CASE_DEFAULTS: Record<string, { nx: number; ny: number }> = {
    cylinder: { nx: 800, ny: 300 },
    cavity: { nx: 512, ny: 512 },
    step: { nx: 800, ny: 300 },
};

function App() {
    const DEFAULT_CASE = 'custom';
    const [config, setConfig] = useState<SimConfig>({
        nx: 800,
        ny: 300,
        re: 100,
        uInflow: 0.1,
        maxSteps: 30000,
        saveInterval: 1000,
        caseType: DEFAULT_CASE,
    });
    const [running, setRunning] = useState(false);
    const [simProgress, setSimProgress] = useState({ step: 0, total: 0, status: '' });
    const [outputDir, setOutputDir] = useState<string | null>(null);
    const [frames, setFrames] = useState<number[]>([]);
    const [frameIndex, setFrameIndex] = useState(0);
    const [frameData, setFrameData] = useState<FrameData | null>(null);
    const [field, setField] = useState<'velocity' | 'pressure' | 'vorticity'>('velocity');

    // Playback state
    const [playing, setPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(200);

    // Visualization state
    const [showStreamlines, setShowStreamlines] = useState(true);
    const [useManualRange, setUseManualRange] = useState(false);
    const [manualMin, setManualMin] = useState('0');
    const [manualMax, setManualMax] = useState('0.1');
    const [probe, setProbe] = useState<ProbeInfo | null>(null);

    // Geometry editor state
    const [shapes, setShapes] = useState<Shape[]>([]);

    // Solver log state
    const [solverLog, setSolverLog] = useState<string[]>([]);
    const [showLog, setShowLog] = useState(false);
    const logEndRef = useRef<HTMLDivElement>(null);

    // Responsive canvas sizing
    const containerRef = useRef<HTMLDivElement>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 400 });

    const currentStep = frames.length > 0 ? frames[frameIndex] : 0;

    // Responsive canvas: measure container and compute display size
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const computeSize = () => {
            const rect = container.getBoundingClientRect();
            const availW = rect.width - 48;
            const availH = rect.height - 60;

            if (frameData && frameData.ny > 0 && frameData.nx > 0) {
                const aspect = frameData.nx / frameData.ny;
                let w = availW;
                let h = w / aspect;
                if (h > availH) {
                    h = availH;
                    w = h * aspect;
                }
                setCanvasSize({
                    width: Math.max(100, Math.floor(w)),
                    height: Math.max(100, Math.floor(h)),
                });
            } else {
                setCanvasSize({
                    width: Math.min(800, Math.max(100, availW)),
                    height: Math.min(400, Math.max(100, availH)),
                });
            }
        };

        computeSize();
        const observer = new ResizeObserver(computeSize);
        observer.observe(container);
        return () => observer.disconnect();
    }, [frameData]);

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

    // Playback auto-advance timer
    useEffect(() => {
        if (!playing || frames.length === 0) return;

        const timer = setInterval(() => {
            setFrameIndex((prev) => {
                const next = prev + 1;
                if (next >= frames.length) {
                    setPlaying(false);
                    return prev;
                }
                return next;
            });
        }, playbackSpeed);

        return () => clearInterval(timer);
    }, [playing, playbackSpeed, frames.length]);

    // Poll solver log while simulation is running
    useEffect(() => {
        if (!running) return;

        const pollLog = async () => {
            try {
                const entries = await invoke<string[]>('get_solver_log', {});
                setSolverLog(entries);
                // Auto-scroll to bottom
                if (logEndRef.current) {
                    logEndRef.current.scrollIntoView({ behavior: 'smooth' });
                }
            } catch (e) {
                console.error('Failed to fetch solver log:', e);
            }
        };

        // Initial fetch
        pollLog();
        const timer = setInterval(pollLog, 500);
        return () => clearInterval(timer);
    }, [running]);

    // Compute color range for the color scale bar (NaN-safe, symmetric for pressure)
    const colorRange = useMemo(() => {
        if (!frameData) return { min: 0, max: 1 };

        if (useManualRange) {
            return { min: parseFloat(manualMin) || 0, max: parseFloat(manualMax) || 1 };
        }

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
    }, [frameData, field, useManualRange, manualMin, manualMax]);

    const runSimulation = async () => {
        setRunning(true);
        setPlaying(false);
        setFrames([]);
        setFrameData(null);
        setSimProgress({ step: 0, total: config.maxSteps, status: 'Initializing...' });
        try {
            let dir: string;
            if (config.caseType === 'custom') {
                const geometryJson = JSON.stringify(shapes.map(s => {
                    if (s.type === 'circle') {
                        return { type: 'circle', x: s.x, y: s.y, radius: s.radius };
                    } else if (s.type === 'rectangle') {
                        return { type: 'rectangle', x: s.x, y: s.y, width: s.width, height: s.height };
                    } else {
                        // Convert {x,y} objects to [x,y] arrays for C++ parser
                        return { type: 'polygon', points: s.points?.map(p => [p.x, p.y]) || [] };
                    }
                }));
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
            setSimProgress({ step: config.maxSteps, total: config.maxSteps, status: 'Complete!' });
            setOutputDir(dir);
            const frameList = await invoke<number[]>('list_frames', { path: dir });
            setFrames(frameList);
            if (frameList.length > 0) {
                setFrameIndex(frameList.length - 1);
            }
        } catch (e) {
            console.error(e);
            setSimProgress({ step: 0, total: 0, status: 'Failed!' });
            alert(`Simulation failed: ${e}`);
        }
        setRunning(false);
    };

    const resetSimulation = () => {
        setOutputDir(null);
        setFrames([]);
        setFrameData(null);
        setFrameIndex(0);
        setPlaying(false);
        setShapes([]);
    };

    const handleCaseTypeChange = (caseType: string) => {
        const defaults = CASE_DEFAULTS[caseType] || { nx: 800, ny: 300 };
        setConfig({ ...config, caseType, nx: defaults.nx, ny: defaults.ny });
    };

    const handleSliderChange = (index: number) => {
        setFrameIndex(index);
    };

    const togglePlay = () => {
        if (playing) {
            setPlaying(false);
        } else {
            if (frameIndex >= frames.length - 1) {
                setFrameIndex(0);
            }
            setPlaying(true);
        }
    };

    const handleExportPng = async () => {
        const canvas = document.querySelector('.flow-canvas-container canvas') as HTMLCanvasElement | null;
        if (!canvas) return;

        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
        const buffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

        const path = await save({
            defaultPath: `lbm_${config.caseType}_re${config.re}_step${currentStep}_${field}.png`,
            filters: [{ name: 'PNG', extensions: ['png'] }],
        });

        if (path) {
            await writeFile(path, uint8);
        }
    };

    return (
        <div className="app">
            <header className="app-header">
                <h1>LBM-2D Desktop CFD</h1>
                <span className="subtitle">Lattice Boltzmann Method Solver</span>
            </header>

            <div className="main-layout">
                <aside className="sidebar">
                    <div className="panel">
                        <h2>Case Configuration</h2>

                        <div className="form-group">
                            <label>Case Type</label>
                            <select
                                value={config.caseType}
                                onChange={(e) => handleCaseTypeChange(e.target.value)}
                            >
                                <option value="cylinder">Cylinder Flow</option>
                                <option value="cavity">Lid-Driven Cavity</option>
                                <option value="step">Backward Step</option>
                                <option value="custom">Custom Geometry</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Grid: {config.nx} x {config.ny}</label>
                            <input
                                type="range"
                                min="100"
                                max="2000"
                                step="100"
                                value={config.nx}
                                onChange={(e) => setConfig({ ...config, nx: +e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label>Reynolds Number: {config.re}</label>
                            <input
                                type="range"
                                min="10"
                                max="2000"
                                step="10"
                                value={config.re}
                                onChange={(e) => setConfig({ ...config, re: +e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label>Max Steps: {config.maxSteps.toLocaleString()}</label>
                            <input
                                type="range"
                                min="1000"
                                max="100000"
                                step="1000"
                                value={config.maxSteps}
                                onChange={(e) => setConfig({ ...config, maxSteps: +e.target.value })}
                            />
                        </div>

                        {running ? (
                            <div className="sim-progress">
                                <div className="sim-progress-bar">
                                    <div className="sim-progress-fill" style={{ width: `${simProgress.total > 0 ? (simProgress.step / simProgress.total) * 100 : 0}%` }} />
                                </div>
                                <span className="sim-progress-text">{simProgress.status}</span>
                            </div>
                        ) : (
                            <button className="btn-primary" onClick={runSimulation}>
                                Run Simulation
                            </button>
                        )}
                    </div>

                    {frames.length > 0 && (
                        <div className="panel">
                            <h2>Playback</h2>
                            <div className="playback-controls">
                                <button
                                    className="btn-play"
                                    onClick={togglePlay}
                                >
                                    {playing ? 'Pause' : 'Play'}
                                </button>
                                <select
                                    className="speed-select"
                                    value={playbackSpeed}
                                    onChange={(e) => setPlaybackSpeed(+e.target.value)}
                                >
                                    <option value={500}>0.5x</option>
                                    <option value={200}>1x</option>
                                    <option value={100}>2x</option>
                                    <option value={50}>4x</option>
                                    <option value={25}>8x</option>
                                </select>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={frames.length - 1}
                                value={frameIndex}
                                onChange={(e) => handleSliderChange(+e.target.value)}
                            />
                            <span>Frame {currentStep} / {frames[frames.length - 1]}</span>
                        </div>
                    )}

                    {frameData && (
                        <div className="panel">
                            <h2>Field Selector</h2>
                            <div className="field-buttons">
                                <button
                                    className={field === 'velocity' ? 'active' : ''}
                                    onClick={() => setField('velocity')}
                                >
                                    Velocity
                                </button>
                                <button
                                    className={field === 'pressure' ? 'active' : ''}
                                    onClick={() => setField('pressure')}
                                >
                                    Pressure
                                </button>
                                <button
                                    className={field === 'vorticity' ? 'active' : ''}
                                    onClick={() => setField('vorticity')}
                                >
                                    Vorticity
                                </button>
                            </div>
                        </div>
                    )}

                    {frameData && (
                        <div className="panel">
                            <h2>Visualization</h2>

                            <div className="form-group">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={showStreamlines}
                                        onChange={(e) => setShowStreamlines(e.target.checked)}
                                        disabled={field !== 'velocity'}
                                    />
                                    Streamlines
                                </label>
                            </div>

                            <div className="form-group">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={useManualRange}
                                        onChange={(e) => setUseManualRange(e.target.checked)}
                                    />
                                    Manual Color Range
                                </label>
                            </div>

                            {useManualRange && (
                                <div className="range-inputs">
                                    <div className="form-group">
                                        <label>Min</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={manualMin}
                                            onChange={(e) => setManualMin(e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Max</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={manualMax}
                                            onChange={(e) => setManualMax(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            <button className="btn-export" onClick={handleExportPng}>
                                Export PNG
                            </button>

                            <button className="btn-reset" onClick={resetSimulation}>
                                New Simulation
                            </button>
                        </div>
                    )}

                    {probe && (
                        <div className="panel probe-panel">
                            <h2>Probe</h2>
                            <div className="probe-values">
                                <span>x: {probe.x}</span>
                                <span>y: {probe.y}</span>
                                <span>u: {probe.u.toFixed(4)}</span>
                                <span>v: {probe.v.toFixed(4)}</span>
                                <span>|V|: {probe.speed.toFixed(4)}</span>
                                <span>p: {probe.p.toFixed(4)}</span>
                                <span>&omega;: {probe.omega.toFixed(4)}</span>
                            </div>
                        </div>
                    )}
                </aside>

                <main className="content">
                    {frameData ? (
                        <div className="visualization" ref={containerRef}>
                            <h2>{field.charAt(0).toUpperCase() + field.slice(1)} Field - Step {currentStep}</h2>
                            <div className="visualization-body">
                                <FlowCanvas
                                    frameData={frameData}
                                    field={field}
                                    showStreamlines={showStreamlines}
                                    canvasSize={canvasSize}
                                    colorRange={useManualRange ? colorRange : null}
                                    onProbe={setProbe}
                                />
                                <ColorScaleBar
                                    min={colorRange.min}
                                    max={colorRange.max}
                                    cmap={field === 'vorticity' ? 'rdbu' : field === 'pressure' ? 'coolwarm' : 'jet'}
                                />
                            </div>
                            <StaticPlots
                                frameData={frameData}
                                width={Math.min(canvasSize.width, 400)}
                            />
                        </div>
                    ) : config.caseType === 'custom' && !running ? (
                        <div className="geometry-container">
                            <h2>Draw Geometry</h2>
                            <GeometryEditor
                                nx={config.nx}
                                ny={config.ny}
                                onGeometryChange={setShapes}
                            />
                        </div>
                    ) : (
                        <div className="placeholder">
                            <p>{running ? 'Running simulation...' : 'Configure and run a simulation to see results'}</p>
                        </div>
                    )}
                </main>
            </div>

            {/* Solver Log Panel */}
            {solverLog.length > 0 && (
                <div className="log-panel">
                    <div className="log-header">
                        <button
                            className="log-toggle"
                            onClick={() => setShowLog(!showLog)}
                        >
                            {showLog ? 'Hide Log' : 'Show Log'} ({solverLog.length})
                        </button>
                        <button
                            className="log-clear"
                            onClick={() => {
                                setSolverLog([]);
                                invoke('clear_solver_log');
                            }}
                        >
                            Clear
                        </button>
                    </div>
                    {showLog && (
                        <div className="log-content">
                            {solverLog.map((entry, i) => (
                                <div key={i} className="log-entry">{entry}</div>
                            ))}
                            <div ref={logEndRef} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default App;
