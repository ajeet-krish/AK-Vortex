import { useState, type ReactNode } from 'react';
import type { Shape } from './GeometryEditor';
import type { ProbeInfo, SimConfig, GridConfig, SystemInfo } from '../types';
import GridConfigPanel from './GridConfigPanel';
import ObstacleTree from './ObstacleTree';
import ValidatedInput from './ValidatedInput';

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
    gridConfig: GridConfig;
    setGridConfig: (cfg: GridConfig) => void;
    systemInfo: SystemInfo | null;
    onCaseTypeChange: (caseType: string) => void;
    running: boolean;
    simProgress: SimProgress;
    frames: number[];
    frameIndex: number;
    setFrameIndex: (i: number) => void;
    field: 'velocity' | 'pressure' | 'vorticity';
    setField: (f: 'velocity' | 'pressure' | 'vorticity') => void;
    playing: boolean;
    playbackSpeed: number;
    setPlaybackSpeed: (s: number) => void;
    togglePlay: () => void;
    runSimulation: () => void;
    resetSimulation: () => void;
    handleExportPng: () => void;
    handleExportVtk: () => void;
    probe: ProbeInfo | null;
    shapes: Shape[];
    selectedShapeId: string | null;
    onSelectShape: (id: string | null) => void;
    onDeleteShape: (id: string) => void;
    onDuplicateShape: (id: string) => void;
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

const IconProbe = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="2" fill="#d19a66" />
        <circle cx="7" cy="7" r="4.5" stroke="#d19a66" strokeWidth="0.8" strokeDasharray="2 1.5" />
    </svg>
);

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
/*  Main Feature Tree                                                  */
/* ------------------------------------------------------------------ */

export default function FeatureTree({
    config,
    setConfig,
    gridConfig,
    setGridConfig,
    systemInfo,
    onCaseTypeChange: _onCaseTypeChange,
    running,
    simProgress,
    frames,
    frameIndex,
    setFrameIndex,
    field,
    setField,
    playing,
    playbackSpeed,
    setPlaybackSpeed,
    togglePlay,
    runSimulation,
    resetSimulation,
    handleExportPng,
    handleExportVtk,
    probe,
    shapes,
    selectedShapeId,
    onSelectShape,
    onDeleteShape,
    onDuplicateShape,
    compareMode,
    loadComparison,
    unloadComparison,
    gciRunning,
    gciResults,
    runGci,
}: FeatureTreeProps) {
    const hasResults = frames.length > 0;
    const currentStep = frames.length > 0 ? frames[frameIndex] : 0;
    const totalSteps = frames.length > 0 ? frames[frames.length - 1] : 0;

    return (
        <div className="feature-tree">
            {/* ============================================================ */}
            {/*  GEOMETRY                                                     */}
            {/* ============================================================ */}
            <TreeSection icon={<IconGeometry />} label="Grid" defaultOpen={false}>
                <TreeItem label="Resolution">
                    <GridConfigPanel
                        caseType={config.caseType}
                        gridConfig={gridConfig}
                        onGridConfigChange={setGridConfig}
                        maxSteps={config.maxSteps}
                        saveInterval={config.saveInterval}
                        systemInfo={systemInfo}
                        disabled={running}
                        shapes={shapes}
                    />
                </TreeItem>
            </TreeSection>

            {/* ============================================================ */}
            {/*  OBSTACLES (dedicated tree section)                          */}
            {/* ============================================================ */}
            <TreeSection
                icon={<IconGeometry />}
                label="Obstacles"
                defaultOpen={shapes.length > 0}
                badge={shapes.length > 0 ? String(shapes.length) : undefined}
            >
                <ObstacleTree
                    shapes={shapes}
                    selectedId={selectedShapeId}
                    onSelect={onSelectShape}
                    onDelete={onDeleteShape}
                    onDuplicate={onDuplicateShape}
                    disabled={running}
                />
            </TreeSection>

            {/* ============================================================ */}
            {/*  PHYSICS                                                      */}
            {/* ============================================================ */}
            <TreeSection icon={<IconPhysics />} label="Physics" defaultOpen={false}>
                <TreeItem label="Reynolds">
                    <ValidatedInput
                        value={config.re}
                        min={10}
                        max={2000}
                        step={10}
                        label=""
                        onChange={(val) => setConfig({ ...config, re: val })}
                        disabled={running}
                    />
                </TreeItem>

                <TreeItem label="Inflow">
                    <ValidatedInput
                        value={config.uInflow}
                        min={0.001}
                        max={0.5}
                        step={0.001}
                        label=""
                        onChange={(val) => setConfig({ ...config, uInflow: val })}
                        disabled={running}
                    />
                </TreeItem>

                <TreeItem label="Max Steps">
                    <ValidatedInput
                        value={config.maxSteps}
                        min={1000}
                        max={100000}
                        step={1000}
                        label=""
                        onChange={(val) => setConfig({ ...config, maxSteps: val })}
                        disabled={running}
                    />
                </TreeItem>

                <TreeItem label="Save Interval">
                    <ValidatedInput
                        value={config.saveInterval}
                        min={100}
                        max={10000}
                        step={100}
                        label=""
                        onChange={(val) => setConfig({ ...config, saveInterval: val })}
                        disabled={running}
                    />
                </TreeItem>
            </TreeSection>

            {/* ============================================================ */}
            {/*  SOLVER                                                       */}
            {/* ============================================================ */}
            <TreeSection
                icon={<IconSolver />}
                label="Solver"
                defaultOpen={false}
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

        </div>
    );
}
