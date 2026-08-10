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
