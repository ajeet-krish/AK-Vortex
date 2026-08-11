import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeFile, readTextFile } from '@tauri-apps/plugin-fs';
import ErrorBoundary from './components/ErrorBoundary';
import GeometryEditor, { type Shape } from './components/GeometryEditor';
import FlowCanvas from './components/FlowCanvas';
import ColorScaleBar from './components/ColorScaleBar';
import ReportPlots from './components/ReportPlots';
import FeatureTree from './components/FeatureTree';
import { useSimulation } from './hooks/useSimulation';
import { usePlayback } from './hooks/usePlayback';
import { useVisualization } from './hooks/useVisualization';
import { wrapFrameData } from './utils/binaryFrame';

function App() {
  // Geometry editor state (local to layout)
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // Hooks
  const sim = useSimulation(shapes);
  const playback = usePlayback(sim.frames.length, sim.setFrameIndex);
  const viz = useVisualization(sim.frameData);

  const [gciRunning, setGciRunning] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const [gciResults, setGciResults] = useState<{
    grids: Array<{ grid: string; nx: number; ny: number; maxVel: number }>;
    apparentOrder: number;
    gci: number;
    ratio: number;
  } | null>(null);

  // Responsive canvas sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 400 });

  const currentStep = sim.frames.length > 0 ? sim.frames[sim.frameIndex] : 0;

  // Derived LBM quantities for status bar
  const tau = useMemo(() => {
    const nu = sim.config.uInflow * sim.config.ny / sim.config.re;
    return 0.5 + 3 * nu;
  }, [sim.config.uInflow, sim.config.ny, sim.config.re]);

  // Result metrics from frame data
  const resultMetrics = useMemo(() => {
    if (!sim.frameData) return null;
    let maxVel = 0;
    let maxOmega = 0;
    let minP = Infinity;
    let maxP = -Infinity;
    for (let i = 0; i < sim.frameData.velocity.length; i++) {
      const v = sim.frameData.velocity[i];
      if (Number.isFinite(v) && v > maxVel) maxVel = v;
      const o = sim.frameData.omega[i];
      if (Number.isFinite(o)) {
        const abs = Math.abs(o);
        if (abs > maxOmega) maxOmega = abs;
      }
      const p = sim.frameData.p[i];
      if (Number.isFinite(p)) {
        if (p < minP) minP = p;
        if (p > maxP) maxP = p;
      }
    }
    return {
      maxVel,
      maxOmega,
      pressureRange: Number.isFinite(minP) && Number.isFinite(maxP)
        ? `${minP.toFixed(4)} / ${maxP.toFixed(4)}`
        : '--',
    };
  }, [sim.frameData]);

  // Status text for status bar
  const statusText = useMemo(() => {
    if (sim.running) return sim.simProgress.status || 'Running...';
    if (sim.frameData) return 'Ready';
    return 'Idle';
  }, [sim.running, sim.frameData, sim.simProgress.status]);

  // Auto-navigate to Results tab when simulation completes
  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (wasRunningRef.current && !sim.running && sim.frames.length > 0) {
      // Navigate to Results as soon as frames are available (don't wait for frameData)
      viz.setViewMode('results');
      viz.setVizMode('interactive');
      // Ensure frameIndex is set to last frame for immediate display
      if (sim.frameIndex < sim.frames.length - 1) {
        sim.setFrameIndex(sim.frames.length - 1);
      }
    }
    wasRunningRef.current = sim.running;
  }, [sim.running, sim.frames.length, viz]);

  // Responsive canvas: measure container and compute display size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const computeSize = () => {
      const rect = container.getBoundingClientRect();
      const availW = rect.width - 48;
      const availH = rect.height - 60;

      if (sim.frameData && sim.frameData.ny > 0 && sim.frameData.nx > 0) {
        const aspect = sim.frameData.nx / sim.frameData.ny;
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
          width: Math.max(100, availW),
          height: Math.max(100, availH),
        });
      }
    };

    computeSize();
    const observer = new ResizeObserver(computeSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [sim.frameData]);

  const handleExportPng = useCallback(async () => {
    const canvas = document.querySelector('.flow-canvas-container canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    const buffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    const path = await save({
      defaultPath: `lbm_${sim.config.caseType}_re${sim.config.re}_step${currentStep}_${viz.field}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });

    if (path) {
      await writeFile(path, uint8);
    }
  }, [sim.config, currentStep, viz.field]);

  const handleExportVtk = useCallback(async () => {
    if (!sim.outputDir) {
      alert('No simulation data to export. Run a simulation first.');
      return;
    }
    const path = await save({
      defaultPath: `lbm_${sim.config.caseType}_re${sim.config.re}_step${currentStep}.vtk`,
      filters: [{ name: 'VTK', extensions: ['vtk'] }],
    });
    if (path) {
      try {
        await invoke('export_vtk', { srcDir: sim.outputDir, step: currentStep, destPath: path });
      } catch (e) {
        console.error('VTK export failed:', e);
        alert(`VTK export failed: ${e}`);
      }
    }
  }, [sim.outputDir, sim.config, currentStep]);

  const loadComparison = useCallback(async () => {
    const dir = await open({ directory: true, multiple: false });
    if (dir) {
      const frameList = await invoke<number[]>('list_frames', { path: dir });
      if (frameList.length > 0) {
        const lastFrame = frameList[frameList.length - 1];
        const json = await invoke<{
          nx: number; ny: number;
          velocity: number[]; u: number[]; v: number[];
          rho: number[]; p: number[]; omega: number[]; obstacle: number[];
        }>('read_frame_json', { path: dir, step: lastFrame });
        viz.setCompareData(wrapFrameData(json));
        viz.setCompareMode(true);
      }
    }
  }, [viz]);

  const unloadComparison = useCallback(() => {
    viz.setCompareMode(false);
    viz.setCompareData(null);
  }, [viz]);

  const runGci = useCallback(async () => {
    setGciRunning(true);
    setGciResults(null);
    try {
      await invoke('reset_solver');
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
      const dir = await invoke<string>('run_gci', {
        nxBase: sim.config.nx,
        nyBase: sim.config.ny,
        re: sim.config.re,
        uInflow: sim.config.uInflow,
        maxSteps: sim.config.maxSteps,
        saveInterval: sim.config.saveInterval,
        refinementRatio: 2.0,
        geometryJson,
      });
      const csvPath = `${dir}/gci_results.csv`;
      const csvContent = await readTextFile(csvPath).catch(() => null);
      if (csvContent) {
        const lines = csvContent.split('\n').filter((l) => l.trim());
        const grids: Array<{ grid: string; nx: number; ny: number; maxVel: number }> = [];
        let apparentOrder = 2.0;
        let gci = 0;
        let ratio = 2.0;
        for (const line of lines) {
          if (line.startsWith('Coarse,') || line.startsWith('Medium,') || line.startsWith('Fine,')) {
            const parts = line.split(',');
            grids.push({
              grid: parts[0],
              nx: parseInt(parts[1]),
              ny: parseInt(parts[2]),
              maxVel: parseFloat(parts[3]),
            });
          } else if (line.startsWith('Apparent Order,')) {
            apparentOrder = parseFloat(line.split(',')[1]);
          } else if (line.startsWith('GCI (Fine),')) {
            gci = parseFloat(line.split(',')[1]);
          } else if (line.startsWith('Refinement Ratio,')) {
            ratio = parseFloat(line.split(',')[1]);
          }
        }
        setGciResults({ grids, apparentOrder, gci, ratio });
      }
    } catch (e) {
      console.error('GCI study failed:', e);
      alert(`GCI study failed: ${e}`);
    }
    setGciRunning(false);
  }, [sim.config, shapes]);

  // Report generation handler
  const handleGenerateReport = useCallback(async () => {
    viz.setReportLoading(true);
    try {
      const geometryJson = JSON.stringify(shapes.map((s) => {
        if (s.type === 'circle') return { type: 'circle', x: s.x, y: s.y, radius: s.radius };
        if (s.type === 'rectangle') return { type: 'rectangle', x: s.x, y: s.y, width: s.width, height: s.height };
        return { type: 'polygon', points: s.points?.map((p) => [p.x, p.y]) || [] };
      }));
      const result = await invoke<{
        velocity_png: string;
        streamlines_png: string;
        pressure_png: string;
        vorticity_png: string;
      }>('generate_report_plots', {
        outputDir: sim.outputDir,
        step: currentStep,
        geometry: geometryJson,
        config: JSON.stringify(sim.config),
      });
      viz.setReportPlots({
        velocityPng: result.velocity_png,
        streamlinesPng: result.streamlines_png,
        pressurePng: result.pressure_png,
        vorticityPng: result.vorticity_png,
      });
    } catch (e) {
      console.error('Report generation failed:', e);
      alert(`Report generation failed: ${e}`);
    }
    viz.setReportLoading(false);
  }, [sim.outputDir, currentStep, shapes, sim.config, viz]);

  // Wrapped runSimulation that also stops playback
  const handleRunSimulation = useCallback(async () => {
    playback.stopPlayback();
    await sim.runSimulation();
  }, [playback, sim]);

  // Wrapped reset that clears all cross-cutting state
  const handleReset = useCallback(() => {
    sim.resetSimulation();
    playback.stopPlayback();
    setShapes([]);
    setSelectedShapeId(null);
    viz.setViewMode('domain');
    viz.setVizMode('interactive');
    viz.setCompareMode(false);
    viz.setCompareData(null);
    viz.setReportPlots(null);
  }, [sim, playback, viz]);

  const handleDeleteShape = useCallback((id: string) => {
    setShapes((prev) => prev.filter((s) => s.id !== id));
    setSelectedShapeId((prev) => (prev === id ? null : prev));
  }, []);

  const handleDuplicateShape = useCallback((id: string) => {
    setShapes((prev) => {
      const original = prev.find((s) => s.id === id);
      if (!original) return prev;
      const copy: Shape = {
        ...original,
        id: Date.now().toString(),
        name: `${original.name} Copy`,
        x: original.x + 20,
        y: original.y + 20,
        points: original.points ? original.points.map((p) => ({ x: p.x + 20, y: p.y + 20 })) : undefined,
      };
      return [...prev, copy];
    });
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>AK-Vortex</h1>
        <div className="header-toolbar">
          <button className="header-btn" onClick={handleReset} title="New Simulation">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M7 3v4M5 5h4" />
              <rect x="2" y="2" width="10" height="10" rx="2" />
            </svg>
            New
          </button>
          <button
            className="header-btn header-btn-accent"
            onClick={handleRunSimulation}
            disabled={sim.running}
            title="Run Simulation"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <polygon points="4,2 12,7 4,12" />
            </svg>
            Run
          </button>
          {sim.canCancel && (
            <button
              className="header-btn header-btn-danger"
              onClick={sim.cancelSimulation}
              title="Cancel Simulation"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="3" y="3" width="8" height="8" rx="1" />
              </svg>
              Cancel
            </button>
          )}
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar">
          <FeatureTree
            config={sim.config}
            setConfig={sim.setConfig}
            gridConfig={sim.gridConfig}
            setGridConfig={sim.setGridConfig}
            systemInfo={sim.systemInfo}
            onCaseTypeChange={sim.handleCaseTypeChange}
            running={sim.running}
            simProgress={sim.simProgress}
            frames={sim.frames}
            frameIndex={sim.frameIndex}
            setFrameIndex={sim.setFrameIndex}
            field={viz.field}
            setField={viz.setField}
            playing={playback.playing}
            playbackSpeed={playback.playbackSpeed}
            setPlaybackSpeed={playback.setPlaybackSpeed}
            togglePlay={playback.togglePlay}
            runSimulation={handleRunSimulation}
            resetSimulation={handleReset}
            handleExportPng={handleExportPng}
            handleExportVtk={handleExportVtk}
            probe={viz.probe}
            shapes={shapes}
            selectedShapeId={selectedShapeId}
            onSelectShape={setSelectedShapeId}
            onDeleteShape={handleDeleteShape}
            onDuplicateShape={handleDuplicateShape}
            compareMode={viz.compareMode}
            loadComparison={loadComparison}
            unloadComparison={unloadComparison}
            gciRunning={gciRunning}
            gciResults={gciResults}
            runGci={runGci}
          />
        </aside>

        <main className="content">
          <ErrorBoundary fallbackTitle="Visualization error" onReset={() => {
            viz.setViewMode('domain');
          }}>
          {/* View Mode Tabs */}
          <div className="view-mode-tabs">
            <button
              className={`view-mode-tab ${viz.viewMode === 'domain' ? 'active' : ''}`}
              onClick={() => viz.setViewMode('domain')}
            >
              Domain
            </button>
            <button
              className={`view-mode-tab ${viz.viewMode === 'results' ? 'active' : ''}`}
              onClick={() => viz.setViewMode('results')}
              disabled={!sim.frameData}
            >
              Results
            </button>
          </div>

          {/* Sub-view tabs in Results */}
          {viz.viewMode === 'results' && (
            <div className="sub-view-tabs">
              <button
                className={`sub-view-tab ${viz.vizMode === 'interactive' ? 'active' : ''}`}
                onClick={() => viz.setVizMode('interactive')}
              >
                Interactive
              </button>
              <button
                className={`sub-view-tab ${viz.vizMode === 'report' ? 'active' : ''}`}
                onClick={() => viz.setVizMode('report')}
              >
                Report
              </button>
            </div>
          )}

          {/* Domain view */}
          <div style={{ display: viz.viewMode === 'domain' ? 'contents' : 'none' }}>
            {sim.config.caseType === 'custom' && !sim.running ? (
              <div className="geometry-container">
                <h2>Draw Geometry</h2>
                <GeometryEditor
                  nx={sim.config.nx}
                  ny={sim.config.ny}
                  onGeometryChange={setShapes}
                  onSelectionChange={setSelectedShapeId}
                  externalShapes={shapes}
                  externalSelectedId={selectedShapeId}
                />
              </div>
            ) : (
              <div className="placeholder">
                <p>{sim.running ? 'Running simulation...' : 'Configure and run a simulation to see results'}</p>
              </div>
            )}
          </div>

          {/* Results - Interactive mode */}
          <div style={{ display: viz.viewMode === 'results' && viz.vizMode === 'interactive' ? 'contents' : 'none' }}>
            {/* Info bar - above canvas */}
            {sim.frameData && (
              <div className="info-bar">
                <span>Re: {sim.config.re}</span>
                <span>Grid: {sim.config.nx} x {sim.config.ny}</span>
                <span>Step: {currentStep}</span>
                <span>Max |V|: {resultMetrics?.maxVel.toFixed(4) || '--'}</span>
              </div>
            )}
            {sim.frameData ? (
              <div className="visualization" ref={containerRef}>
                <h2>{viz.field.charAt(0).toUpperCase() + viz.field.slice(1)} Field - Step {currentStep}</h2>
                <div className="visualization-body">
                  <FlowCanvas
                    frameData={sim.frameData}
                    field={viz.field}
                    showQuiver={viz.showQuiver}
                    quiverConfig={viz.quiverConfig}
                    canvasSize={canvasSize}
                    colorRange={viz.useManualRange ? viz.colorRange : null}
                    onProbe={viz.setProbe}
                  />
                  <ColorScaleBar
                    min={viz.colorRange.min}
                    max={viz.colorRange.max}
                    cmap={viz.field === 'vorticity' ? 'rdbu' : viz.field === 'pressure' ? 'coolwarm' : 'jet'}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Summary bar - removed (info is now above canvas) */}

          {/* Results - Report mode */}
          {viz.viewMode === 'results' && viz.vizMode === 'report' && (
            <ReportPlots
              plots={viz.reportPlots}
              loading={viz.reportLoading}
              onGenerate={handleGenerateReport}
              config={sim.config}
              step={currentStep}
            />
          )}
          </ErrorBoundary>
        </main>
      </div>

      {/* Playback Bar (fixed at bottom) */}
      <div className="playback-bar" style={{ display: viz.viewMode === 'results' && viz.vizMode === 'interactive' && sim.frameData ? 'flex' : 'none' }}>
        <button className="play-btn" onClick={playback.togglePlay}>
          {playback.playing ? '\u23F8' : '\u25B6'}
        </button>
        <input
          type="range"
          className="playback-slider"
          min={0}
          max={sim.frames.length - 1}
          value={sim.frameIndex}
          onChange={(e) => sim.setFrameIndex(parseInt(e.target.value))}
        />
        <span className="playback-label">
          Step {currentStep} ({sim.frameIndex + 1}/{sim.frames.length})
        </span>
        <select
          className="speed-select"
          value={playback.playbackSpeed}
          onChange={(e) => playback.setPlaybackSpeed(parseInt(e.target.value))}
        >
          <option value={500}>0.5x</option>
          <option value={200}>1x</option>
          <option value={100}>2x</option>
          <option value={50}>4x</option>
          <option value={25}>8x</option>
        </select>
      </div>

      {/* Log expansion - appears above status bar when expanded */}
      {logExpanded && (
        <div className="log-panel" style={{
          position: 'fixed',
          bottom: '24px',
          left: '280px',
          right: 0,
          height: '180px',
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
          overflow: 'auto',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px',
          padding: '6px 12px',
          zIndex: 15,
        }}>
          {sim.solverLog.length === 0 && (
            <div style={{ color: 'var(--text-muted)', padding: '8px 0' }}>No log entries</div>
          )}
          {sim.solverLog.map((entry, i) => (
            <div key={i} style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{entry}</div>
          ))}
          <button
            onClick={() => sim.setSolverLog([])}
            style={{
              position: 'sticky',
              bottom: 0,
              float: 'right',
              padding: '3px 8px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: '2px',
              color: 'var(--text-muted)',
              fontSize: '10px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-item">
          <div className={`status-dot ${sim.running ? 'running' : sim.frameData ? '' : 'idle'}`} />
          <span>{statusText}</span>
        </div>
        <div className="status-separator" />
        <div className="status-item"><span>Grid: {sim.config.nx}x{sim.config.ny}</span></div>
        <div className="status-item"><span>Re: {sim.config.re}</span></div>
        <div className="status-item"><span>Tau: {tau.toFixed(3)}</span></div>
        <div className="status-separator" />
        <div className="status-item"><span>Frame: {currentStep}</span></div>
        <div className="status-item"><span>Shapes: {shapes.length}</span></div>
        <div className="status-separator" />
        <button
          onClick={() => setLogExpanded(!logExpanded)}
          style={{
            marginLeft: 'auto',
            padding: '2px 8px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            color: 'var(--text-secondary)',
            fontSize: '11px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {logExpanded ? '▼ Log' : '▶ Log'}
          {sim.solverLog.length > 0 && (
            <span style={{ marginLeft: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
              ({sim.solverLog.length})
            </span>
          )}
        </button>
      </div>

    </div>
  );
}

export default App;
