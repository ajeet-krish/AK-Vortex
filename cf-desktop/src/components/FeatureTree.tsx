import { useState, type ReactNode } from 'react';
import type { Shape } from './GeometryEditor';
import type { ProbeInfo, SimConfig, FrameData } from '../types';
import type { QuiverConfig } from '../utils/quiver';

interface SimProgress {
    step: number;
    total: number;
    status: string;
}

interface GciResults {
    grids: Array<{ grid: string; nx: number; ny: number; maxVel: number }>;
    apparentOrder: number;
    gci: number;
    ratio: number;
}

interface FeatureTreeProps {
    config: SimConfig;
    setConfig: (cfg: SimConfig) => void;
    onCaseTypeChange: (caseType: string) => void;
    running: boolean;
    simProgress: SimProgress;
    frames: number[];
    frameIndex: number;
    setFrameIndex: (i: number) => void;
    frameData: FrameData | null;
    field: 'velocity' | 'pressure' | 'vorticity';
    setField: (f: 'velocity' | 'pressure' | 'vorticity') => void;
    playing: boolean;
    playbackSpeed: number;
    setPlaybackSpeed: (s: number) => void;
    togglePlay: () => void;
    useManualRange: boolean;
    setUseManualRange: (v: boolean) => void;
    manualMin: string;
    setManualMin: (v: string) => void;
    manualMax: string;
    setManualMax: (v: string) => void;
    runSimulation: () => void;
    resetSimulation: () => void;
    handleExportPng: () => void;
    handleExportVtk: () => void;
    probe: ProbeInfo | null;
    shapes: Shape[];
    solverLog: string[];
    setSolverLog: (log: string[]) => void;
    showQuiver: boolean;
    setShowQuiver: (v: boolean) => void;
    quiverConfig: QuiverConfig;
    setQuiverConfig: (cfg: QuiverConfig) => void;
    selectedShapeId: string | null;
    onCreateArray: (count: number, spacing: number, angle: number) => void;
    compareMode: boolean;
    loadComparison: () => void;
    unloadComparison: () => void;
    gciRunning: boolean;
    gciResults: GciResults | null;
    runGci: () => void;
}

/* ------------------------------------------------------------------ */
/*  SVG Icons (inline, 14x14, monochrome)                             */
/* ------------------------------------------------------------------ */

const Chevron = ({ open }: { open: boolean }) => (
    <svg
        className={`tree-chevron ${open ? 'open' : ''}`}
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
    >
        <path d="M5 3l4 4-4 4" />
    </svg>
);

const IconGeometry = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="2" width="10" height="10" rx="1" stroke="#569cd6" strokeWidth="1.2" />
        <circle cx="7" cy="7" r="2.5" stroke="#4ec9b0" strokeWidth="1" />
    </svg>
);

const IconPhysics = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2 10L5 4l3 4 2-2 2 4" stroke="#c586c0" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
);

const IconSolver = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <polygon points="4,2 12,7 4,12" fill="#dcdcaa" opacity="0.8" />
    </svg>
);

const IconResults = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="8" width="2.5" height="4" rx="0.5" fill="#4ec9b0" />
        <rect x="5.5" y="5" width="2.5" height="7" rx="0.5" fill="#569cd6" />
        <rect x="9" y="3" width="2.5" height="9" rx="0.5" fill="#ce9178" />
    </svg>
);

const IconViz = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5" stroke="#808080" strokeWidth="1" />
        <path d="M3 7C5 4 9 4 11 7C9 10 5 10 3 7Z" stroke="#569cd6" strokeWidth="0.8" fill="rgba(86,156,216,0.15)" />
    </svg>
);

const IconProbe = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="2" fill="#d19a66" />
        <circle cx="7" cy="7" r="4.5" stroke="#d19a66" strokeWidth="0.8" strokeDasharray="2 1.5" />
    </svg>
);

const IconCircle = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="4" stroke="#4ec9b0" strokeWidth="1" />
    </svg>
);

const IconRect = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="2" y="2" width="8" height="8" stroke="#569cd6" strokeWidth="1" />
    </svg>
);

const IconPoly = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <polygon points="6,1 11,5 9,11 3,11 1,5" stroke="#c586c0" strokeWidth="1" fill="none" />
    </svg>
);

const shapeIcon = (type: string) => {
    switch (type) {
        case 'circle': return <IconCircle />;
        case 'rectangle': return <IconRect />;
        default: return <IconPoly />;
    }
};

const shapeLabel = (s: Shape): string => {
    if (s.type === 'circle') return `${s.name}  r=${s.radius?.toFixed(0)}`;
    if (s.type === 'rectangle') return `${s.name}  ${s.width?.toFixed(0)}x${s.height?.toFixed(0)}`;
    return `${s.name}  (${s.points?.length} pts)`;
};

/* ------------------------------------------------------------------ */
/*  Collapsible Section                                                */
/* ------------------------------------------------------------------ */

function TreeSection({
    icon,
    label,
    defaultOpen = true,
    badge,
    children,
}: {
    icon: ReactNode;
    label: string;
    defaultOpen?: boolean;
    badge?: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className={`tree-section ${open ? 'open' : ''}`}>
            <button className="tree-header" onClick={() => setOpen(!open)}>
                <Chevron open={open} />
                <span className="tree-header-icon">{icon}</span>
                <span className="tree-header-label">{label}</span>
                {badge !== undefined && <span className="tree-badge">{badge}</span>}
            </button>
            {open && <div className="tree-content">{children}</div>}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Inline Tree Item (label : value)                                   */
/* ------------------------------------------------------------------ */

function TreeItem({ label, children, indent = 0 }: { label: string; children: ReactNode; indent?: number }) {
    return (
        <div className="tree-item" style={{ paddingLeft: 12 + indent * 16 }}>
            <span className="tree-item-label">{label}</span>
            <span className="tree-item-value">{children}</span>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Selectable Item (for obstacles)                                    */
/* ------------------------------------------------------------------ */

function TreeSelectableItem({
    icon,
    label,
    selected,
    onClick,
    onDelete,
}: {
    icon: ReactNode;
    label: string;
    selected: boolean;
    onClick: () => void;
    onDelete?: () => void;
}) {
    return (
        <div
            className={`tree-item tree-item-selectable ${selected ? 'selected' : ''}`}
            onClick={onClick}
        >
            <span className="tree-item-icon">{icon}</span>
            <span className="tree-item-label">{label}</span>
            {onDelete && (
                <button
                    className="tree-item-delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    title="Delete"
                >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path d="M2 2l6 6M8 2l-6 6" />
                    </svg>
                </button>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Main Feature Tree                                                  */
/* ------------------------------------------------------------------ */

export default function FeatureTree({
    config,
    setConfig,
    onCaseTypeChange,
    running,
    simProgress,
    frames,
    frameIndex,
    setFrameIndex,
    frameData,
    field,
    setField,
    playing,
    playbackSpeed,
    setPlaybackSpeed,
    togglePlay,
    useManualRange,
    setUseManualRange,
    manualMin,
    setManualMin,
    manualMax,
    setManualMax,
    runSimulation,
    resetSimulation,
    handleExportPng,
    handleExportVtk,
    probe,
    shapes,
    solverLog,
    setSolverLog,
    showQuiver,
    setShowQuiver,
    quiverConfig,
    setQuiverConfig,
    selectedShapeId,
    onCreateArray,
    compareMode,
    loadComparison,
    unloadComparison,
    gciRunning,
    gciResults,
    runGci,
}: FeatureTreeProps) {
    const [arrayCount, setArrayCount] = useState(5);
    const [arraySpacing, setArraySpacing] = useState(50);
    const [arrayAngle, setArrayAngle] = useState(0);
    const hasResults = frames.length > 0;
    const hasFrame = !!frameData;
    const currentStep = frames.length > 0 ? frames[frameIndex] : 0;
    const totalSteps = frames.length > 0 ? frames[frames.length - 1] : 0;

    return (
        <div className="feature-tree">
            {/* ---- Root node ---- */}
            <div className="tree-root">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <rect x="1" y="1" width="12" height="12" rx="2" fill="#0078d4" opacity="0.2" stroke="#0078d4" strokeWidth="0.8" />
                    <text x="7" y="10" textAnchor="middle" fill="#0078d4" fontSize="7" fontWeight="600">L2</text>
                </svg>
                <span className="tree-root-label">AK-Vortex Desktop CFD</span>
            </div>

            {/* ============================================================ */}
            {/*  GEOMETRY                                                     */}
            {/* ============================================================ */}
            <TreeSection icon={<IconGeometry />} label="Geometry" defaultOpen={true}>
                <TreeItem label="Case">
                    <select
                        className="tree-select"
                        value={config.caseType}
                        onChange={(e) => onCaseTypeChange(e.target.value)}
                    >
                        <option value="cylinder">Cylinder Flow</option>
                        <option value="cavity">Lid-Driven Cavity</option>
                        <option value="step">Backward Step</option>
                        <option value="custom">Custom Geometry</option>
                    </select>
                </TreeItem>

                <TreeItem label="Grid">
                    <span className="tree-inline-inputs">
                        <input
                            type="number"
                            className="tree-num-input"
                            min="100"
                            max="2000"
                            step="100"
                            value={config.nx}
                            onChange={(e) => setConfig({ ...config, nx: Math.max(100, Math.min(2000, +e.target.value || 100)) })}
                        />
                        <span className="tree-x">×</span>
                        <input
                            type="number"
                            className="tree-num-input"
                            min="100"
                            max="2000"
                            step="100"
                            value={config.ny}
                            onChange={(e) => setConfig({ ...config, ny: Math.max(100, Math.min(2000, +e.target.value || 100)) })}
                        />
                    </span>
                </TreeItem>

                {config.caseType === 'custom' && shapes.length > 0 && (
                    <div className="tree-subgroup">
                        <div className="tree-subgroup-header">Obstacles ({shapes.length})</div>
                        {shapes.map((s) => (
                            <TreeSelectableItem
                                key={s.id}
                                icon={shapeIcon(s.type)}
                                label={shapeLabel(s)}
                                selected={false}
                                onClick={() => {}}
                            />
                        ))}
                        {selectedShapeId && (
                            <div className="tree-array-tool">
                                <div className="tree-subgroup-header">Array Tool</div>
                                <TreeItem label="Count">
                                    <input
                                        type="number"
                                        className="tree-num-input"
                                        min="2"
                                        max="50"
                                        value={arrayCount}
                                        onChange={(e) => setArrayCount(Math.max(2, Math.min(50, +e.target.value || 2)))}
                                    />
                                </TreeItem>
                                <TreeItem label="Spacing">
                                    <input
                                        type="number"
                                        className="tree-num-input"
                                        min="10"
                                        max="500"
                                        step="10"
                                        value={arraySpacing}
                                        onChange={(e) => setArraySpacing(Math.max(10, +e.target.value || 50))}
                                    />
                                </TreeItem>
                                <TreeItem label="Angle">
                                    <input
                                        type="number"
                                        className="tree-num-input"
                                        min="0"
                                        max="360"
                                        step="5"
                                        value={arrayAngle}
                                        onChange={(e) => setArrayAngle(+e.target.value || 0)}
                                    />
                                </TreeItem>
                                <button
                                    className="tree-action-btn"
                                    onClick={() => onCreateArray(arrayCount, arraySpacing, arrayAngle)}
                                >
                                    Create Array
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </TreeSection>

            {/* ============================================================ */}
            {/*  PHYSICS                                                      */}
            {/* ============================================================ */}
            <TreeSection icon={<IconPhysics />} label="Physics" defaultOpen={true}>
                <TreeItem label="Reynolds">
                    <input
                        type="number"
                        className="tree-num-input"
                        min="10"
                        max="2000"
                        step="10"
                        value={config.re}
                        onChange={(e) => setConfig({ ...config, re: Math.max(10, Math.min(2000, +e.target.value || 10)) })}
                    />
                </TreeItem>

                <TreeItem label="Inflow">
                    <input
                        type="number"
                        className="tree-num-input"
                        min="0.001"
                        max="0.5"
                        step="0.001"
                        value={config.uInflow}
                        onChange={(e) => setConfig({ ...config, uInflow: Math.max(0.001, Math.min(0.5, +e.target.value || 0.01)) })}
                    />
                </TreeItem>

                <TreeItem label="Max Steps">
                    <input
                        type="number"
                        className="tree-num-input"
                        min="1000"
                        max="100000"
                        step="1000"
                        value={config.maxSteps}
                        onChange={(e) => setConfig({ ...config, maxSteps: Math.max(1000, Math.min(100000, +e.target.value || 1000)) })}
                    />
                </TreeItem>

                <TreeItem label="Save Interval">
                    <input
                        type="number"
                        className="tree-num-input"
                        min="100"
                        max="10000"
                        step="100"
                        value={config.saveInterval}
                        onChange={(e) => setConfig({ ...config, saveInterval: Math.max(100, Math.min(10000, +e.target.value || 1000)) })}
                    />
                </TreeItem>
            </TreeSection>

            {/* ============================================================ */}
            {/*  SOLVER                                                       */}
            {/* ============================================================ */}
            <TreeSection
                icon={<IconSolver />}
                label="Solver"
                defaultOpen={true}
                badge={running ? 'Running' : hasResults ? 'Complete' : 'Ready'}
            >
                {running ? (
                    <div className="tree-solver-progress">
                        <div className="tree-progress-bar">
                            <div
                                className="tree-progress-fill"
                                style={{ width: `${simProgress.total > 0 ? (simProgress.step / simProgress.total) * 100 : 0}%` }}
                            />
                        </div>
                        <div className="tree-progress-text">{simProgress.status}</div>
                    </div>
                ) : (
                    <button className="tree-run-btn" onClick={runSimulation}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                            <polygon points="2,1 11,6 2,11" />
                        </svg>
                        Run Simulation
                    </button>
                )}
            </TreeSection>

            {/* ============================================================ */}
            {/*  RESULTS (visible after simulation)                           */}
            {/* ============================================================ */}
            {hasResults && (
                <TreeSection
                    icon={<IconResults />}
                    label="Results"
                    defaultOpen={true}
                >
                    <TreeItem label="Frame">
                        <span className="tree-frame-label">{currentStep} / {totalSteps}</span>
                    </TreeItem>

                    <div className="tree-item">
                        <input
                            type="range"
                            className="tree-slider"
                            min={0}
                            max={frames.length - 1}
                            value={frameIndex}
                            onChange={(e) => setFrameIndex(+e.target.value)}
                        />
                    </div>

                    <div className="tree-playback-row">
                        <button className="tree-play-btn" onClick={togglePlay}>
                            {playing ? (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                                    <rect x="1" y="1" width="3" height="8" rx="0.5" />
                                    <rect x="6" y="1" width="3" height="8" rx="0.5" />
                                </svg>
                            ) : (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                                    <polygon points="1,0 10,5 1,10" />
                                </svg>
                            )}
                        </button>
                        <select
                            className="tree-speed-select"
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

                    <div className="tree-subgroup">
                        <div className="tree-subgroup-header">Field</div>
                        <div className="tree-field-btns">
                            <button className={`tree-field-btn ${field === 'velocity' ? 'active' : ''}`} onClick={() => setField('velocity')}>Velocity</button>
                            <button className={`tree-field-btn ${field === 'pressure' ? 'active' : ''}`} onClick={() => setField('pressure')}>Pressure</button>
                            <button className={`tree-field-btn ${field === 'vorticity' ? 'active' : ''}`} onClick={() => setField('vorticity')}>Vorticity</button>
                        </div>
                    </div>

                    <div className="tree-action-row">
                        <button className="tree-action-btn" onClick={handleExportPng} title="Export PNG">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                                <path d="M6 1v7M3 5l3 3 3-3M1 9v1.5a.5.5 0 00.5.5h7a.5.5 0 00.5-.5V9" />
                            </svg>
                            PNG
                        </button>
                        <button className="tree-action-btn" onClick={handleExportVtk} title="Export VTK">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                                <path d="M2 2h8v8H2zM2 6h8M5 2v8" />
                            </svg>
                            VTK
                        </button>
                        <button className="tree-action-btn tree-action-reset" onClick={resetSimulation} title="New Simulation">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                                <path d="M1 6a5 5 0 019-3M11 6a5 5 0 01-9 3" />
                                <path d="M10 1v2h-2M2 11V9h2" />
                            </svg>
                            New
                        </button>
                    </div>

                    <div className="tree-action-row">
                        {compareMode ? (
                            <button className="tree-action-btn tree-action-compare-active" onClick={unloadComparison} title="Exit Comparison">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                                    <path d="M2 2l8 8M10 2l-8 8" />
                                </svg>
                                Exit Compare
                            </button>
                        ) : (
                            <button className="tree-action-btn" onClick={loadComparison} title="Load another simulation for side-by-side comparison">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                                    <rect x="1" y="2" width="4" height="8" rx="0.5" />
                                    <rect x="7" y="2" width="4" height="8" rx="0.5" />
                                </svg>
                                Compare
                            </button>
                        )}
                    </div>
                </TreeSection>
            )}

            {/* ============================================================ */}
            {/*  MESH STUDY (GCI)                                            */}
            {/* ============================================================ */}
            {hasResults && (
                <TreeSection
                    icon={
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2 12L7 2l5 10" stroke="#569cd6" strokeWidth="1.2" fill="none" />
                            <path d="M4 8h6" stroke="#569cd6" strokeWidth="0.8" strokeDasharray="1.5 1" />
                        </svg>
                    }
                    label="Mesh Study"
                    defaultOpen={false}
                >
                    {gciRunning ? (
                        <div className="tree-solver-progress">
                            <div className="tree-progress-bar">
                                <div className="tree-progress-fill" style={{ width: '60%' }} />
                            </div>
                            <div className="tree-progress-text">Running GCI study (3 grids)...</div>
                        </div>
                    ) : (
                        <>
                            <div className="tree-item">
                                <span className="tree-item-label">Refinement Ratio</span>
                                <span className="tree-item-value">
                                    <span className="tree-inline-inputs">
                                        <span className="tree-x">r =</span>
                                        <span className="tree-mono-val">2.0</span>
                                    </span>
                                </span>
                            </div>
                            <button className="tree-run-btn" onClick={runGci}>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                                    <path d="M1 3h10M1 6h10M1 9h10" />
                                    <circle cx="4" cy="3" r="1" fill="currentColor" />
                                    <circle cx="8" cy="6" r="1" fill="currentColor" />
                                    <circle cx="5" cy="9" r="1" fill="currentColor" />
                                </svg>
                                Run GCI Study
                            </button>
                        </>
                    )}

                    {gciResults && (
                        <div className="gci-results">
                            <div className="gci-table-wrap">
                                <table className="gci-table">
                                    <thead>
                                        <tr>
                                            <th>Grid</th>
                                            <th>Nx</th>
                                            <th>Ny</th>
                                            <th>Max |V|</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {gciResults.grids.map((g) => (
                                            <tr key={g.grid}>
                                                <td>{g.grid}</td>
                                                <td>{g.nx}</td>
                                                <td>{g.ny}</td>
                                                <td>{g.maxVel.toFixed(6)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="gci-summary">
                                <div className="gci-summary-row">
                                    <span className="gci-key">Apparent Order</span>
                                    <span className="gci-val">{gciResults.apparentOrder.toFixed(3)}</span>
                                </div>
                                <div className="gci-summary-row">
                                    <span className="gci-key">GCI (Fine)</span>
                                    <span className="gci-val">{gciResults.gci.toExponential(3)}</span>
                                </div>
                                <div className="gci-summary-row">
                                    <span className="gci-key">Ratio</span>
                                    <span className="gci-val">{gciResults.ratio}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </TreeSection>
            )}

            {/* ============================================================ */}
            {/*  VISUALIZATION                                                */}
            {/* ============================================================ */}
            {hasFrame && (
                <TreeSection icon={<IconViz />} label="Visualization" defaultOpen={true}>
                    <div className="tree-item">
                        <label className="tree-checkbox">
                            <input
                                type="checkbox"
                                checked={showQuiver}
                                onChange={(e) => setShowQuiver(e.target.checked)}
                                disabled={field !== 'velocity'}
                            />
                            <span>Quiver (Vectors)</span>
                        </label>
                    </div>

                    {showQuiver && (
                        <div className="tree-range-row">
                            <div className="tree-range-field">
                                <span className="tree-range-label">Grid</span>
                                <input
                                    type="number"
                                    step="1"
                                    min="4"
                                    max="80"
                                    className="tree-num-input"
                                    value={quiverConfig.gridSpacing}
                                    onChange={(e) => setQuiverConfig({ ...quiverConfig, gridSpacing: Math.max(4, +e.target.value || 20) })}
                                />
                            </div>
                            <div className="tree-range-field">
                                <span className="tree-range-label">Scale</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    max="5"
                                    className="tree-num-input"
                                    value={quiverConfig.arrowScale}
                                    onChange={(e) => setQuiverConfig({ ...quiverConfig, arrowScale: Math.max(0.1, +e.target.value || 1.0) })}
                                />
                            </div>
                        </div>
                    )}

                    <div className="tree-item">
                        <label className="tree-checkbox">
                            <input
                                type="checkbox"
                                checked={useManualRange}
                                onChange={(e) => setUseManualRange(e.target.checked)}
                            />
                            <span>Manual Range</span>
                        </label>
                    </div>

                    {useManualRange && (
                        <div className="tree-range-row">
                            <div className="tree-range-field">
                                <span className="tree-range-label">Min</span>
                                <input
                                    type="number"
                                    step="any"
                                    className="tree-num-input"
                                    value={manualMin}
                                    onChange={(e) => setManualMin(e.target.value)}
                                />
                            </div>
                            <div className="tree-range-field">
                                <span className="tree-range-label">Max</span>
                                <input
                                    type="number"
                                    step="any"
                                    className="tree-num-input"
                                    value={manualMax}
                                    onChange={(e) => setManualMax(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                </TreeSection>
            )}

            {/* ============================================================ */}
            {/*  PROBE                                                        */}
            {/* ============================================================ */}
            {probe && (
                <TreeSection icon={<IconProbe />} label="Probe" defaultOpen={true}>
                    <div className="tree-probe-grid">
                        <span className="tree-probe-key">x</span><span className="tree-probe-val">{probe.x}</span>
                        <span className="tree-probe-key">y</span><span className="tree-probe-val">{probe.y}</span>
                        <span className="tree-probe-key">u</span><span className="tree-probe-val">{probe.u.toFixed(4)}</span>
                        <span className="tree-probe-key">v</span><span className="tree-probe-val">{probe.v.toFixed(4)}</span>
                        <span className="tree-probe-key">|V|</span><span className="tree-probe-val">{probe.speed.toFixed(4)}</span>
                        <span className="tree-probe-key">p</span><span className="tree-probe-val">{probe.p.toFixed(4)}</span>
                        <span className="tree-probe-key">&omega;</span><span className="tree-probe-val">{probe.omega.toFixed(4)}</span>
                    </div>
                </TreeSection>
            )}

            {/* ============================================================ */}
            {/*  LOG (collapsible at bottom)                                  */}
            {/* ============================================================ */}
            {solverLog.length > 0 && (
                <TreeSection
                    icon={
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <rect x="2" y="3" width="10" height="8" rx="1" stroke="#808080" strokeWidth="1" />
                            <path d="M4 6h3M4 8h5" stroke="#808080" strokeWidth="0.8" />
                        </svg>
                    }
                    label="Log"
                    defaultOpen={false}
                    badge={`${solverLog.length}`}
                >
                    <div className="tree-log-content">
                        {solverLog.slice(-50).map((entry, i) => (
                            <div key={i} className="tree-log-entry">{entry}</div>
                        ))}
                    </div>
                    <button
                        className="tree-log-clear"
                        onClick={() => {
                            setSolverLog([]);
                        }}
                    >
                        Clear Log
                    </button>
                </TreeSection>
            )}
        </div>
    );
}
