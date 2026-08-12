// Data validation utility for frame data integrity checks.
// Used to diagnose the "static blue" rendering bug in the flow viewer.

import type { FrameData } from "../types";

export interface FieldDiagnostics {
  name: string;
  min: number;
  max: number;
  mean: number;
  nanCount: number;
  infCount: number;
  zeroCount: number;
  totalCount: number;
  isAllZero: boolean;
  isAllNaN: boolean;
}

export interface FrameDiagnostics {
  nx: number;
  ny: number;
  fields: FieldDiagnostics[];
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Analyze a single Float32Array field and return diagnostics.
 */
function analyzeField(
  name: string,
  data: Float32Array,
): FieldDiagnostics {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let nanCount = 0;
  let infCount = 0;
  let zeroCount = 0;
  const totalCount = data.length;

  for (let i = 0; i < totalCount; i++) {
    const v = data[i];
    if (Number.isNaN(v)) {
      nanCount++;
    } else if (!Number.isFinite(v)) {
      infCount++;
    } else {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      if (v === 0) zeroCount++;
    }
  }

  const validCount = totalCount - nanCount - infCount;
  const mean = validCount > 0 ? sum / validCount : 0;

  return {
    name,
    min: validCount > 0 ? min : 0,
    max: validCount > 0 ? max : 0,
    mean,
    nanCount,
    infCount,
    zeroCount,
    totalCount,
    isAllZero: zeroCount === validCount && validCount > 0,
    isAllNaN: nanCount === totalCount,
  };
}

/**
 * Validate a parsed frame and return comprehensive diagnostics.
 */
export function validateFrameData(frame: FrameData): FrameDiagnostics {
  const fields: FieldDiagnostics[] = [
    analyzeField("velocity", frame.velocity),
    analyzeField("u", frame.u),
    analyzeField("v", frame.v),
    analyzeField("p", frame.p),
    analyzeField("omega", frame.omega),
    analyzeField("obstacle", frame.obstacle),
  ];

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for critical issues
  for (const f of fields) {
    if (f.isAllNaN) {
      errors.push(`${f.name}: all values are NaN`);
    }
    if (f.nanCount > 0) {
      warnings.push(`${f.name}: ${f.nanCount}/${f.totalCount} NaN values (${((f.nanCount / f.totalCount) * 100).toFixed(1)}%)`);
    }
    if (f.infCount > 0) {
      warnings.push(`${f.name}: ${f.infCount}/${f.totalCount} Inf values`);
    }
    if (f.isAllZero && f.name !== "obstacle") {
      warnings.push(`${f.name}: all values are zero`);
    }
  }

  // Velocity-specific checks
  const vel = fields[0];
  if (!vel.isAllNaN && vel.max === 0 && vel.min === 0) {
    warnings.push("velocity magnitude is zero everywhere -- flow field is trivial");
  }

  // Obstacle check: should have both 0 and 1 values
  const obs = fields[5];
  if (obs.isAllZero) {
    warnings.push("obstacle field is all zero -- no obstacle defined");
  } else if (obs.max === 1 && obs.zeroCount === 0) {
    warnings.push("obstacle field is all ones -- entire domain is obstacle");
  }

  return {
    nx: frame.nx,
    ny: frame.ny,
    fields,
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Log a formatted diagnostics summary to the console.
 */
export function logDiagnostics(diag: FrameDiagnostics): void {
  console.log(`[DataValidator] Frame ${diag.nx}x${diag.ny} diagnostics:`);

  if (diag.errors.length > 0) {
    for (const e of diag.errors) {
      console.error(`[DataValidator] ERROR: ${e}`);
    }
  }
  if (diag.warnings.length > 0) {
    for (const w of diag.warnings) {
      console.warn(`[DataValidator] WARN: ${w}`);
    }
  }

  // Tabular field summary
  const header = "  Field          Min         Max        Mean     NaN   Inf  Zeros    Total";
  const sep = "  -------------- ----------- ---------- --------- ----- ---- -------- -------";
  console.log(`[DataValidator] ${header}`);
  console.log(`[DataValidator] ${sep}`);
  for (const f of diag.fields) {
    const name = f.name.padEnd(14);
    const min = f.min.toFixed(6).padStart(11);
    const max = f.max.toFixed(6).padStart(10);
    const mean = f.mean.toFixed(6).padStart(10);
    const nan = String(f.nanCount).padStart(5);
    const inf = String(f.infCount).padStart(4);
    const zeros = String(f.zeroCount).padStart(8);
    const total = String(f.totalCount).padStart(7);
    console.log(`[DataValidator] ${name}${min}${max}${mean}${nan}${inf}${zeros}${total}`);
  }

  console.log(`[DataValidator] Valid: ${diag.isValid ? "YES" : "NO"}`);
}
