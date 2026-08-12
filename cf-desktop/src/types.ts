export interface FrameData {
  nx: number;
  ny: number;
  velocity: Float32Array;
  u: Float32Array;
  v: Float32Array;
  rho: Float32Array;
  p: Float32Array;
  omega: Float32Array;
  obstacle: Float32Array;
}

export interface SimConfig {
  nx: number;
  ny: number;
  re: number;
  uInflow: number;
  maxSteps: number;
  saveInterval: number;
  caseType: string;
}

export interface ProbeInfo {
  x: number;
  y: number;
  u: number;
  v: number;
  speed: number;
  p: number;
  omega: number;
  canvasX: number;
  canvasY: number;
}

/* ------------------------------------------------------------------ */
/*  Grid Configuration Types                                           */
/* ------------------------------------------------------------------ */

export type QualityLevel = 'draft' | 'standard' | 'high' | 'ultra' | 'custom';

export interface GridPreset {
  name: QualityLevel;
  label: string;
  description: string;
  /** Multiplier applied to case-specific base grid */
  scale: number;
}

export interface CaseGridDefaults {
  /** Base grid dimensions for this case at "standard" quality */
  baseNx: number;
  baseNy: number;
  /** Aspect ratio constraint (nx/ny). null = unconstrained */
  aspectRatio: number | null;
  /** Characteristic length in grid cells (e.g., cylinder diameter = 60) */
  characteristicLengthCells: number;
  /** Human-readable characteristic length name */
  characteristicLabel: string;
}

export interface GridConfig {
  nx: number;
  ny: number;
  quality: QualityLevel;
  /** Whether aspect ratio is locked to case default */
  lockAspectRatio: boolean;
}

export interface SystemInfo {
  totalRamBytes: number;
  availableRamBytes: number;
  cpuCores: number;
  devicePixelRatio: number;
}

export interface FieldRange {
  min: number;
  max: number;
  maxAbs: number;
}

export interface FrameBatchData {
  layers: Float32Array;
  nx: number;
  ny: number;
  nFrames: number;
  nChannels: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Estimated memory in bytes for this grid */
  estimatedMemoryBytes: number;
  /** Human-readable memory string (e.g., "293 MB") */
  memoryDisplay: string;
  /** Estimated runtime in seconds */
  estimatedRuntimeSec: number;
  /** Human-readable runtime string (e.g., "~2 min 30 sec") */
  runtimeDisplay: string;
  /** Percentage of available RAM */
  ramPercent: number;
}
