import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

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
    const DEFAULT_CASE = 'cylinder';
    const [config, setConfig] = useState<SimConfig>({
        nx: CASE_DEFAULTS[DEFAULT_CASE].nx,
        ny: CASE_DEFAULTS[DEFAULT_CASE].ny,
        re: 100,
        uInflow: 0.1,
        maxSteps: 30000,
        saveInterval: 1000,
        caseType: DEFAULT_CASE,
    });
    const [running, setRunning] = useState(false);
    const [outputDir, setOutputDir] = useState<string | null>(null);
    const [frames, setFrames] = useState<number[]>([]);
    const [frameIndex, setFrameIndex] = useState(0);
    const [frameData, setFrameData] = useState<FrameData | null>(null);
    const [field, setField] = useState<'velocity' | 'pressure' | 'vorticity'>('velocity');

    // Playback state
    const [playing, setPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(200);

    // Responsive canvas sizing
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
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

    // Render canvas when data, field, or display size changes
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !frameData) return;

        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;
        renderField(canvas, frameData, field);
    }, [frameData, field, canvasSize]);

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

    const runSimulation = async () => {
        setRunning(true);
        setPlaying(false);
        setFrames([]);
        setFrameData(null);
        try {
            const dir = await invoke<string>('run_simulation', {
                nx: config.nx,
                ny: config.ny,
                re: config.re,
                uInflow: config.uInflow,
                maxSteps: config.maxSteps,
                saveInterval: config.saveInterval,
                caseType: config.caseType,
            });
            setOutputDir(dir);
            const frameList = await invoke<number[]>('list_frames', { path: dir });
            setFrames(frameList);
            if (frameList.length > 0) {
                setFrameIndex(frameList.length - 1);
            }
        } catch (e) {
            console.error(e);
            alert(`Simulation failed: ${e}`);
        }
        setRunning(false);
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

                        <button className="btn-primary" onClick={runSimulation} disabled={running}>
                            {running ? 'Running...' : 'Run Simulation'}
                        </button>
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
                </aside>

                <main className="content">
                    {frameData ? (
                        <div className="visualization" ref={containerRef}>
                            <h2>{field.charAt(0).toUpperCase() + field.slice(1)} Field - Step {currentStep}</h2>
                            <canvas ref={canvasRef} />
                        </div>
                    ) : (
                        <div className="placeholder">
                            <p>{running ? 'Running simulation...' : 'Configure and run a simulation to see results'}</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

function renderField(
    canvas: HTMLCanvasElement,
    data: FrameData,
    field: 'velocity' | 'pressure' | 'vorticity'
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { nx, ny, velocity, p, omega, obstacle } = data;

    let values: number[];
    let minVal = 0;
    let maxVal = 0;

    if (field === 'velocity') {
        values = velocity;
        for (const v of values) if (v > maxVal) maxVal = v;
    } else if (field === 'pressure') {
        values = p;
        minVal = Infinity;
        maxVal = -Infinity;
        for (const v of values) {
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
        }
    } else {
        values = omega;
        maxVal = 0;
        for (const v of values) if (Math.abs(v) > maxVal) maxVal = Math.abs(v);
        minVal = -maxVal;
    }

    const imageData = ctx.createImageData(nx, ny);
    const range = maxVal - minVal || 1;

    for (let i = 0; i < values.length; i++) {
        const idx = i * 4;
        if (obstacle[i]) {
            imageData.data[idx] = 30;
            imageData.data[idx + 1] = 30;
            imageData.data[idx + 2] = 30;
            imageData.data[idx + 3] = 255;
            continue;
        }

        const t = (values[i] - minVal) / range;
        const c = jetColormap(t);
        imageData.data[idx] = c[0];
        imageData.data[idx + 1] = c[1];
        imageData.data[idx + 2] = c[2];
        imageData.data[idx + 3] = 255;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = nx;
    tempCanvas.height = ny;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCtx.putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
}

function jetColormap(t: number): [number, number, number] {
    t = Math.max(0, Math.min(1, t));
    let r: number, g: number, b: number;

    if (t < 0.125) {
        r = 0; g = 0; b = 0.5 + t * 4;
    } else if (t < 0.375) {
        r = 0; g = (t - 0.125) * 4; b = 1;
    } else if (t < 0.625) {
        r = (t - 0.375) * 4; g = 1; b = 1 - (t - 0.375) * 4;
    } else if (t < 0.875) {
        r = 1; g = 1 - (t - 0.625) * 4; b = 0;
    } else {
        r = 1 - (t - 0.875) * 4 * 0.5; g = 0; b = 0;
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export default App;
