/**
 * Grid Configuration Presets
 *
 * Quality levels map to scale factors applied to case-specific base grids.
 * Each case type defines its own base dimensions, aspect ratio, and
 * characteristic length for physical dimension mapping.
 */

import type { GridPreset, CaseGridDefaults, QualityLevel, GridConfig } from '../types';

/* ------------------------------------------------------------------ */
/*  Quality Presets                                                     */
/* ------------------------------------------------------------------ */

export const GRID_PRESETS: GridPreset[] = [
  { name: 'draft',    label: 'Draft',    description: 'Fast preview (~30 sec)',       scale: 0.5 },
  { name: 'standard', label: 'Standard', description: 'Balanced accuracy (~2 min)',   scale: 1.0 },
  { name: 'high',     label: 'High',     description: 'Publication quality (~8 min)',  scale: 2.0 },
  { name: 'ultra',    label: 'Ultra',    description: 'Maximum fidelity (~30 min)',    scale: 3.0 },
  { name: 'custom',   label: 'Custom',   description: 'Manual grid dimensions',        scale: 1.0 },
];

/* ------------------------------------------------------------------ */
/*  Case-Specific Grid Defaults                                        */
/* ------------------------------------------------------------------ */

export const CASE_GRID_DEFAULTS: Record<string, CaseGridDefaults> = {
  cylinder: {
    baseNx: 800,
    baseNy: 300,
    aspectRatio: 800 / 300,  // ~2.67:1
    characteristicLengthCells: 60,  // D = 60 cells at base resolution
    characteristicLabel: 'Diameter (D)',
  },
  cavity: {
    baseNx: 512,
    baseNy: 512,
    aspectRatio: 1.0,  // square
    characteristicLengthCells: 512,  // L = full width
    characteristicLabel: 'Cavity width (L)',
  },
  step: {
    baseNx: 800,
    baseNy: 300,
    aspectRatio: 800 / 300,  // ~2.67:1
    characteristicLengthCells: 150,  // step height h = NY/2 = 150
    characteristicLabel: 'Step height (h)',
  },
  custom: {
    baseNx: 800,
    baseNy: 400,
    aspectRatio: null,  // unconstrained
    characteristicLengthCells: 100,
    characteristicLabel: 'Reference length',
  },
};

/* ------------------------------------------------------------------ */
/*  Grid Computation                                                   */
/* ------------------------------------------------------------------ */

/** Minimum grid dimension (solver validation) */
export const GRID_MIN = 32;

/** Maximum grid dimension (solver validation) */
export const GRID_MAX = 4096;

/**
 * Compute grid dimensions for a given case type and quality preset.
 * Clamps to [GRID_MIN, GRID_MAX] and rounds to nearest 16 for cache alignment.
 */
export function computeGridForPreset(
  caseType: string,
  quality: QualityLevel,
): { nx: number; ny: number } {
  const defaults = CASE_GRID_DEFAULTS[caseType] ?? CASE_GRID_DEFAULTS.custom;
  const preset = GRID_PRESETS.find((p) => p.name === quality) ?? GRID_PRESETS[1]; // default: standard

  let nx = Math.round(defaults.baseNx * preset.scale);
  let ny = Math.round(defaults.baseNy * preset.scale);

  // Round to nearest 16 for cache-line alignment (LBM stores 9 distributions per node)
  nx = Math.round(nx / 16) * 16;
  ny = Math.round(ny / 16) * 16;

  // Clamp to solver bounds
  nx = Math.max(GRID_MIN, Math.min(GRID_MAX, nx));
  ny = Math.max(GRID_MIN, Math.min(GRID_MAX, ny));

  return { nx, ny };
}

/**
 * Compute ny from nx while maintaining the case's aspect ratio.
 * Used when user edits nx with aspect-ratio lock enabled.
 */
export function computeNyFromNx(
  caseType: string,
  nx: number,
): number {
  const defaults = CASE_GRID_DEFAULTS[caseType] ?? CASE_GRID_DEFAULTS.custom;
  if (!defaults.aspectRatio) return nx; // unconstrained -> square
  let ny = Math.round(nx / defaults.aspectRatio);
  ny = Math.round(ny / 16) * 16;
  return Math.max(GRID_MIN, Math.min(GRID_MAX, ny));
}

/**
 * Compute nx from ny while maintaining the case's aspect ratio.
 */
export function computeNxFromNy(
  caseType: string,
  ny: number,
): number {
  const defaults = CASE_GRID_DEFAULTS[caseType] ?? CASE_GRID_DEFAULTS.custom;
  if (!defaults.aspectRatio) return ny; // unconstrained -> square
  let nx = Math.round(ny * defaults.aspectRatio);
  nx = Math.round(nx / 16) * 16;
  return Math.max(GRID_MIN, Math.min(GRID_MAX, nx));
}

/**
 * Compute resolution in cells per meter.
 * Given a characteristic length in grid cells and its physical size in meters.
 */
export function computeResolution(
  characteristicLengthCells: number,
  physicalLengthMeters: number,
): number {
  if (physicalLengthMeters <= 0) return 0;
  return characteristicLengthCells / physicalLengthMeters;
}

/**
 * Get the default GridConfig for a case type.
 */
export function getDefaultGridConfig(caseType: string): GridConfig {
  const { nx, ny } = computeGridForPreset(caseType, 'standard');
  return {
    nx,
    ny,
    quality: 'standard',
    lockAspectRatio: true,
  };
}
