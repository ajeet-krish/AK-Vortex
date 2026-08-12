// Binary frame parser for the AK-Vortex CFD desktop viewer.
// Parses the 24-byte header + float32 channel data produced by the Rust backend.

import type { FrameData } from "../types";

const BINARY_MAGIC = 0x4C424D31;

/**
 * Parse a binary frame buffer into a FrameData-compatible object.
 *
 * Binary format (little-endian):
 *   [0..3]   magic        uint32  0x4C424D31 ("LBM1")
 *   [4..7]   version      uint32  (reserved, currently 0)
 *   [8..11]  nx           uint32  grid width
 *   [12..15] ny           uint32  grid height
 *   [16..19] nChannels    uint32  number of float32 channels (5)
 *   [20..23] dtypeFlag    uint32  0 = float32, 1 = float16
 *   [24..]   data         float32[nChannels * nx * ny]
 *
 * Channel order: [u, v, p, omega, obstacle]
 */
export function parseBinaryFrame(buffer: ArrayBuffer): FrameData {
  const dv = new DataView(buffer);

  const magic = dv.getUint32(0, true);
  const version = dv.getUint32(4, true);
  const nx = dv.getUint32(8, true);
  const ny = dv.getUint32(12, true);
  const nChannels = dv.getUint32(16, true);
  const dtypeFlag = dv.getUint32(20, true);

  if (magic !== BINARY_MAGIC) {
    throw new Error(
      `Bad binary frame magic: 0x${magic.toString(16)} (expected 0x${BINARY_MAGIC.toString(16)})`
    );
  }
  if (version !== 1) {
    throw new Error(
      `Unsupported binary frame version: ${version} (expected 1)`
    );
  }
  if (dtypeFlag !== 0) {
    throw new Error(
      `Unsupported dtype_flag=${dtypeFlag} (expected 0=float32)`
    );
  }
  if (nChannels < 5) {
    throw new Error(
      `Expected at least 5 channels, got ${nChannels}`
    );
  }

  const MAX_DIM = 4096;
  if (nx > MAX_DIM || ny > MAX_DIM) {
    throw new Error(
      `Binary frame dimensions too large: ${nx}x${ny} (max ${MAX_DIM}x${MAX_DIM})`
    );
  }

  const expectedSize = 24 + nChannels * nx * ny * 4;
  if (buffer.byteLength < expectedSize) {
    throw new Error(
      `Binary frame truncated: expected ${expectedSize} bytes, got ${buffer.byteLength}`
    );
  }

  const n = nx * ny;
  const f32 = new Float32Array(buffer, 24);

  // Zero-copy views into the underlying buffer (no allocation per channel)
  const u = new Float32Array(f32.buffer, f32.byteOffset + 0 * n * 4, n);
  const v = new Float32Array(f32.buffer, f32.byteOffset + 1 * n * 4, n);
  const p = new Float32Array(f32.buffer, f32.byteOffset + 2 * n * 4, n);
  const omega = new Float32Array(f32.buffer, f32.byteOffset + 3 * n * 4, n);
  const obstacle = new Float32Array(f32.buffer, f32.byteOffset + 4 * n * 4, n);

  // Derived channel: velocity magnitude (requires new allocation)
  const velocity = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    velocity[k] = Math.sqrt(u[k] * u[k] + v[k] * v[k]);
  }

  // Diagnostic: log field ranges after parsing
  const fieldRanges = [
    { name: "u", data: u },
    { name: "v", data: v },
    { name: "velocity", data: velocity },
    { name: "p", data: p },
    { name: "obstacle", data: obstacle },
  ];
  console.log(`[BinaryFrame] Parsed ${nx}x${ny} frame:`);
  for (const f of fieldRanges) {
    let fMin = Infinity;
    let fMax = -Infinity;
    for (let i = 0; i < f.data.length; i++) {
      if (Number.isFinite(f.data[i])) {
        if (f.data[i] < fMin) fMin = f.data[i];
        if (f.data[i] > fMax) fMax = f.data[i];
      }
    }
    console.log(`  ${f.name}: [${fMin.toFixed(6)}, ${fMax.toFixed(6)}]`);
  }

  // Incompressible LBM: rho is approximately 1.0 everywhere.
  // The binary format does not store rho, so fill with constant 1.0.
  const rho = new Float32Array(n);
  rho.fill(1.0);

  return { nx, ny, velocity, u, v, rho, p, omega, obstacle };
}

/**
 * Wrap a JSON-serialized frame (number[] fields) into a FrameData with
 * Float32Array fields. Used as the fallback when binary frames are unavailable.
 */
export function wrapFrameData(json: {
  nx: number; ny: number;
  velocity: number[]; u: number[]; v: number[];
  rho: number[]; p: number[]; omega: number[]; obstacle: number[];
}): FrameData {
  return {
    nx: json.nx,
    ny: json.ny,
    velocity: new Float32Array(json.velocity),
    u: new Float32Array(json.u),
    v: new Float32Array(json.v),
    rho: new Float32Array(json.rho),
    p: new Float32Array(json.p),
    omega: new Float32Array(json.omega),
    obstacle: new Float32Array(json.obstacle),
  };
}
