/**
 * GridConfigPanel
 *
 * Grid/mesh configuration panel with quality presets, dimension inputs,
 * memory/runtime estimation, and validation warnings.
 *
 * Replaces the inline grid inputs that were previously in FeatureTree.
 */

import { useMemo, useCallback } from 'react';
import type {
  QualityLevel,
  MeshShape,
  GridConfig,
  SystemInfo,
  ValidationResult,
  CaseGridDefaults,
} from '../types';
import {
  GRID_PRESETS,
  CASE_GRID_DEFAULTS,
  MESH_SHAPE_OPTIONS,
  computeGridForPreset,
  computeNyFromNx,
  computeNxFromNy,
  GRID_MIN,
  GRID_MAX,
} from '../config/gridPresets';
import { validateGrid } from '../config/gridValidation';

import type { Shape } from './GeometryEditor';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface GridConfigPanelProps {
  caseType: string;
  gridConfig: GridConfig;
  onGridConfigChange: (config: GridConfig) => void;
  maxSteps: number;
  saveInterval: number;
  systemInfo: SystemInfo | null;
  disabled: boolean;
  /** Placed geometry shapes (custom case only) */
  shapes: Shape[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function GridConfigPanel({
  caseType,
  gridConfig,
  onGridConfigChange,
  maxSteps,
  saveInterval,
  systemInfo,
  disabled,
  shapes,
}: GridConfigPanelProps) {
  const defaults: CaseGridDefaults =
    CASE_GRID_DEFAULTS[caseType] ?? CASE_GRID_DEFAULTS.custom;

  // --- Validation ---
  const validation: ValidationResult = useMemo(
    () => validateGrid(gridConfig.nx, gridConfig.ny, maxSteps, saveInterval, systemInfo),
    [gridConfig.nx, gridConfig.ny, maxSteps, saveInterval, systemInfo],
  );

  // --- Preset selection ---
  const handlePresetChange = useCallback(
    (quality: QualityLevel) => {
      if (quality === 'custom') {
        onGridConfigChange({ ...gridConfig, quality });
        return;
      }
      const { nx, ny } = computeGridForPreset(caseType, quality);
      onGridConfigChange({ ...gridConfig, nx, ny, quality });
    },
    [caseType, gridConfig, onGridConfigChange],
  );

  // --- Dimension inputs ---
  const handleNxChange = useCallback(
    (value: number) => {
      const nx = Math.max(GRID_MIN, Math.min(GRID_MAX, value));
      const ny = gridConfig.lockAspectRatio
        ? computeNyFromNx(caseType, nx)
        : gridConfig.ny;
      onGridConfigChange({
        ...gridConfig,
        nx,
        ny,
        quality: 'custom',
      });
    },
    [caseType, gridConfig, onGridConfigChange],
  );

  const handleNyChange = useCallback(
    (value: number) => {
      const ny = Math.max(GRID_MIN, Math.min(GRID_MAX, value));
      const nx = gridConfig.lockAspectRatio
        ? computeNxFromNy(caseType, ny)
        : gridConfig.nx;
      onGridConfigChange({
        ...gridConfig,
        nx,
        ny,
        quality: 'custom',
      });
    },
    [caseType, gridConfig, onGridConfigChange],
  );

  const handleAspectRatioToggle = useCallback(() => {
    const newLock = !gridConfig.lockAspectRatio;
    let { nx, ny } = gridConfig;
    if (newLock) {
      // Re-align to case aspect ratio
      ny = computeNyFromNx(caseType, nx);
    }
    onGridConfigChange({ ...gridConfig, ny, lockAspectRatio: newLock });
  }, [caseType, gridConfig, onGridConfigChange]);

  // --- Mesh shape selection ---
  const handleMeshShapeChange = useCallback(
    (meshShape: MeshShape) => {
      if (import.meta.env.DEV) {
        console.log(`[GridConfigPanel] Mesh shape changed to: ${meshShape}`);
      }
      onGridConfigChange({ ...gridConfig, meshShape });
    },
    [gridConfig, onGridConfigChange],
  );

  // Show mesh shape selector only for custom geometry cases with shapes placed
  const showMeshShape = caseType === 'custom' && shapes.length > 0;

  const totalNodes = gridConfig.nx * gridConfig.ny;
  const totalNodesDisplay =
    totalNodes >= 1_000_000
      ? `${(totalNodes / 1_000_000).toFixed(1)}M`
      : totalNodes >= 1_000
        ? `${(totalNodes / 1_000).toFixed(0)}K`
        : `${totalNodes}`;

  return (
    <div className="grid-config-panel">
      {/* ---- Quality Presets (2x2 grid) ---- */}
      <div className="gcp-presets-grid">
        {GRID_PRESETS.filter((p) => p.name !== 'custom').map((preset) => (
          <button
            key={preset.name}
            className={`gcp-preset ${gridConfig.quality === preset.name ? 'active' : ''}`}
            onClick={() => handlePresetChange(preset.name)}
            disabled={disabled}
            title={preset.description}
          >
            <span className="gcp-preset-name">{preset.label}</span>
            <span className="gcp-preset-desc">{preset.scale}x</span>
          </button>
        ))}
      </div>

      {/* ---- Mesh Shape (custom geometry only) ---- */}
      {showMeshShape && (
        <div className="gcp-mesh-shape">
          <label className="gcp-mesh-label">Mesh topology</label>
          <div className="gcp-mesh-options">
            {MESH_SHAPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`gcp-mesh-btn ${gridConfig.meshShape === opt.value ? 'active' : ''}`}
                onClick={() => handleMeshShapeChange(opt.value)}
                disabled={disabled}
                title={opt.description}
              >
                <span className="gcp-mesh-btn-label">{opt.label}</span>
                <span className="gcp-mesh-btn-desc">{opt.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- Grid Dimensions ---- */}
      <div className="gcp-dims-row">
        <label className="gcp-dim-label">NX</label>
        <input
          type="number"
          className="gcp-dim-input"
          min={GRID_MIN}
          max={GRID_MAX}
          step={16}
          value={gridConfig.nx}
          onChange={(e) => handleNxChange(+e.target.value || GRID_MIN)}
          disabled={disabled}
        />
        <label className="gcp-dim-label">NY</label>
        <input
          type="number"
          className="gcp-dim-input"
          min={GRID_MIN}
          max={GRID_MAX}
          step={16}
          value={gridConfig.ny}
          onChange={(e) => handleNyChange(+e.target.value || GRID_MIN)}
          disabled={disabled}
        />
        <button
          className={`gcp-lock-btn ${gridConfig.lockAspectRatio ? 'locked' : ''}`}
          onClick={handleAspectRatioToggle}
          disabled={disabled}
          title={
            gridConfig.lockAspectRatio
              ? 'Aspect ratio locked (click to unlock)'
              : 'Aspect ratio unlocked (click to lock)'
          }
        >
          {gridConfig.lockAspectRatio ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="3" y="6" width="8" height="6" rx="1" />
              <path d="M5 6V4a2 2 0 014 0v2" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="3" y="6" width="8" height="6" rx="1" />
              <path d="M5 6V4a2 2 0 014 0" />
            </svg>
          )}
        </button>
      </div>

      {/* ---- Compact Stats (cells + aspect only) ---- */}
      <div className="gcp-stats-compact">
        <div className="gcp-stat-item">
          <span className="gcp-stat-label">Cells</span>
          <span className="gcp-stat-value">{totalNodesDisplay}</span>
        </div>
        <div className="gcp-stat-item">
          <span className="gcp-stat-label">Aspect</span>
          <span className="gcp-stat-value">
            {(gridConfig.nx / gridConfig.ny).toFixed(1)}:1
          </span>
        </div>
      </div>

      {/* ---- Validation Messages ---- */}
      {validation.errors.length > 0 && (
        <div className="gcp-errors">
          {validation.errors.map((err, i) => (
            <div key={i} className="gcp-error">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
                <path d="M6 3v3M6 8v.5" strokeWidth="1.2" />
              </svg>
              {err}
            </div>
          ))}
        </div>
      )}

      {/* ---- Case Info ---- */}
      <div className="gcp-case-info">
        <span className="gcp-case-info-label">
          {defaults.characteristicLabel}:
        </span>
        <span className="gcp-case-info-value">
          {defaults.characteristicLengthCells} cells (base)
        </span>
      </div>
    </div>
  );
}
