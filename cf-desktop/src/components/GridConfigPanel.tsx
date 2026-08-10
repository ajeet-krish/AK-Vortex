/**
 * GridConfigPanel
 *
 * Grid/mesh configuration panel with quality presets, dimension inputs,
 * memory/runtime estimation, and validation warnings.
 *
 * Replaces the inline grid inputs that were previously in FeatureTree.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  QualityLevel,
  GridConfig,
  SystemInfo,
  ValidationResult,
  CaseGridDefaults,
} from '../types';
import {
  GRID_PRESETS,
  CASE_GRID_DEFAULTS,
  computeGridForPreset,
  computeNyFromNx,
  computeNxFromNy,
  GRID_MIN,
  GRID_MAX,
} from '../config/gridPresets';
import { validateGrid } from '../config/gridValidation';

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

  // --- Memory bar color ---
  const memoryBarColor = validation.ramPercent > 80
    ? 'var(--danger)'
    : validation.ramPercent > 50
      ? 'var(--warning)'
      : 'var(--success)';

  const totalNodes = gridConfig.nx * gridConfig.ny;
  const totalNodesDisplay =
    totalNodes >= 1_000_000
      ? `${(totalNodes / 1_000_000).toFixed(1)}M`
      : totalNodes >= 1_000
        ? `${(totalNodes / 1_000).toFixed(0)}K`
        : `${totalNodes}`;

  return (
    <div className="grid-config-panel">
      {/* ---- Quality Presets ---- */}
      <div className="gcp-presets">
        {GRID_PRESETS.map((preset) => (
          <button
            key={preset.name}
            className={`gcp-preset-btn ${gridConfig.quality === preset.name ? 'active' : ''}`}
            onClick={() => handlePresetChange(preset.name)}
            disabled={disabled}
            title={preset.description}
          >
            <span className="gcp-preset-label">{preset.label}</span>
            {preset.name !== 'custom' && (
              <span className="gcp-preset-scale">{preset.scale}x</span>
            )}
          </button>
        ))}
      </div>

      {/* ---- Grid Dimensions ---- */}
      <div className="gcp-dimensions">
        <div className="gcp-dim-row">
          <label className="gcp-dim-label">Nx</label>
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
        </div>

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

        <div className="gcp-dim-row">
          <label className="gcp-dim-label">Ny</label>
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
        </div>
      </div>

      {/* ---- Summary Stats ---- */}
      <div className="gcp-stats">
        <div className="gcp-stat">
          <span className="gcp-stat-label">Cells</span>
          <span className="gcp-stat-value">{totalNodesDisplay}</span>
        </div>
        <div className="gcp-stat">
          <span className="gcp-stat-label">Aspect</span>
          <span className="gcp-stat-value">
            {(gridConfig.nx / gridConfig.ny).toFixed(2)}:1
          </span>
        </div>
        <div className="gcp-stat">
          <span className="gcp-stat-label">Memory</span>
          <span className="gcp-stat-value">{validation.memoryDisplay}</span>
        </div>
        <div className="gcp-stat">
          <span className="gcp-stat-label">Runtime</span>
          <span className="gcp-stat-value">{validation.runtimeDisplay}</span>
        </div>
      </div>

      {/* ---- Memory Bar ---- */}
      {systemInfo && (
        <div className="gcp-memory-bar-container">
          <div className="gcp-memory-bar-label">
            RAM: {validation.ramPercent.toFixed(0)}% of available
          </div>
          <div className="gcp-memory-bar-track">
            <div
              className="gcp-memory-bar-fill"
              style={{
                width: `${Math.min(100, validation.ramPercent)}%`,
                background: memoryBarColor,
              }}
            />
          </div>
        </div>
      )}

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

      {validation.warnings.length > 0 && (
        <div className="gcp-warnings">
          {validation.warnings.map((warn, i) => (
            <div key={i} className="gcp-warning">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M6 1L11 10H1z" fill="none" stroke="currentColor" strokeWidth="1" />
                <path d="M6 4.5v2.5M6 8.5v.5" strokeWidth="1" />
              </svg>
              {warn}
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
