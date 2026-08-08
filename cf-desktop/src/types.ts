export interface FrameData {
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
