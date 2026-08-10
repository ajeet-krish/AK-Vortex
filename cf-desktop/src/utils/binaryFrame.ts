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

  // Extract channels as number[] (FlowCanvas expects number[])
  const u = new Array<number>(n);
  const v = new Array<number>(n);
  const p = new Array<number>(n);
  const omega = new Array<number>(n);
  const obstacle = new Array<number>(n);
  const velocity = new Array<number>(n);

  for (let k = 0; k < n; k++) {
    u[k] = f32[k];                          // channel 0
    v[k] = f32[n + k];                      // channel 1
    p[k] = f32[2 * n + k];                  // channel 2
    omega[k] = f32[3 * n + k];              // channel 3
    obstacle[k] = f32[4 * n + k];           // channel 4
    velocity[k] = Math.sqrt(u[k] * u[k] + v[k] * v[k]);
  }

  // Incompressible LBM: rho is approximately 1.0 everywhere.
  // The binary format does not store rho, so fill with constant 1.0.
  const rho = new Array<number>(n).fill(1.0);

  return { nx, ny, velocity, u, v, rho, p, omega, obstacle };
}
