// Web Worker entry point for binary frame parsing.
// Receives raw ArrayBuffer[] from main thread, returns interleaved layers
// for TEXTURE_2D_ARRAY upload on the GPU.
//
// Binary format (little-endian, 24-byte header):
//   [0..3]   magic        uint32  0x4C424D31 ("LBM1")
//   [4..7]   version      uint32  (currently 1)
//   [8..11]  nx           uint32  grid width
//   [12..15] ny           uint32  grid height
//   [16..19] nChannels    uint32  number of float32 channels (5)
//   [20..23] dtypeFlag    uint32  0 = float32
//   [24..]   data         float32[nChannels * nx * ny]
//   Channel order: [u, v, p, omega, obstacle]

const BINARY_MAGIC = 0x4C424D31;

// Typed postMessage helper: avoids needing the webworker lib in tsconfig
// Workers support postMessage(msg, transfer) where transfer is Transferable[]
function postResponse(message: unknown, transfer?: Transferable[]): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).postMessage(message, transfer);
}

export interface FieldRange {
  min: number;
  max: number;
  maxAbs: number;
}

export interface WorkerRequest {
  type: 'parse';
  buffers: ArrayBuffer[];
  frameSteps: number[];
}

export interface WorkerResponse {
  type: 'parsed';
  layers: Float32Array;
  nx: number;
  ny: number;
  nFrames: number;
  nChannels: number;
  ranges: {
    u: FieldRange;
    v: FieldRange;
    p: FieldRange;
    omega: FieldRange;
    velocity: FieldRange;
    obstacle: FieldRange;
  };
  frameSteps: number[];
}

// Listen for messages from main thread
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { type, buffers, frameSteps } = e.data;

  if (type === 'parse') {
    try {
      const result = parseFrames(buffers, frameSteps);
      // Transfer ownership of the layers buffer to avoid copy
      postResponse(result, [result.layers.buffer]);
    } catch (err) {
      postResponse({ type: 'error', message: String(err) });
    }
  }
};

function initRange(): FieldRange {
  return { min: Infinity, max: -Infinity, maxAbs: 0 };
}

function updateRange(range: FieldRange, value: number): void {
  if (!Number.isFinite(value)) return;
  if (value < range.min) range.min = value;
  if (value > range.max) range.max = value;
  const abs = Math.abs(value);
  if (abs > range.maxAbs) range.maxAbs = abs;
}

function parseFrames(
  buffers: ArrayBuffer[],
  frameSteps: number[],
): WorkerResponse {
  if (buffers.length === 0) {
    throw new Error('No frame buffers provided');
  }

  // Parse first frame to get dimensions
  const firstDv = new DataView(buffers[0]);
  const magic = firstDv.getUint32(0, true);
  if (magic !== BINARY_MAGIC) {
    throw new Error(
      `Bad binary frame magic: 0x${magic.toString(16)} (expected 0x${BINARY_MAGIC.toString(16)})`,
    );
  }

  const version = firstDv.getUint32(4, true);
  const nx = firstDv.getUint32(8, true);
  const ny = firstDv.getUint32(12, true);
  const nChannels = firstDv.getUint32(16, true);
  const dtypeFlag = firstDv.getUint32(20, true);
  const nFrames = buffers.length;

  const MAX_DIM = 4096;
  if (nx > MAX_DIM || ny > MAX_DIM) {
    throw new Error(`Dimensions too large: ${nx}x${ny} (max ${MAX_DIM})`);
  }
  if (version !== 1) {
    throw new Error(`Unsupported version: ${version}`);
  }
  // Validate buffer size
  const expectedSize = 24 + nChannels * nx * ny * 4;
  if (buffers[0].byteLength < expectedSize) {
    throw new Error(`Buffer truncated: expected ${expectedSize}, got ${buffers[0].byteLength}`);
  }
  if (dtypeFlag !== 0) {
    throw new Error(`Unsupported dtype_flag=${dtypeFlag} (expected 0=float32)`);
  }
  if (nChannels < 5) {
    throw new Error(`Expected at least 5 channels, got ${nChannels}`);
  }

  const n = nx * ny;
  const totalLayers = nFrames * nChannels;

  // Allocate interleaved layers: [frame][channel][y][x]
  // Each layer is a single-channel nx*ny float32 slab for TEXTURE_2D_ARRAY
  const layers = new Float32Array(totalLayers * n);

  // Per-channel ranges
  const ranges = {
    u: initRange(),
    v: initRange(),
    p: initRange(),
    omega: initRange(),
    velocity: initRange(),
    obstacle: initRange(),
  };

  for (let f = 0; f < nFrames; f++) {
    const dv = new DataView(buffers[f]);

    // Validate header consistency across frames
    if (f > 0) {
      const fNx = dv.getUint32(8, true);
      const fNy = dv.getUint32(12, true);
      if (fNx !== nx || fNy !== ny) {
        throw new Error(
          `Frame ${f} dimension mismatch: ${fNx}x${fNy} (expected ${nx}x${ny})`,
        );
      }
    }

    // Zero-copy float32 view starting after the 24-byte header
    const f32 = new Float32Array(buffers[f], 24);

    // Channel views into the source buffer (no allocation)
    const u = new Float32Array(f32.buffer, f32.byteOffset + 0 * n * 4, n);
    const v = new Float32Array(f32.buffer, f32.byteOffset + 1 * n * 4, n);
    const p = new Float32Array(f32.buffer, f32.byteOffset + 2 * n * 4, n);
    const omega = new Float32Array(f32.buffer, f32.byteOffset + 3 * n * 4, n);
    const obstacle = new Float32Array(f32.buffer, f32.byteOffset + 4 * n * 4, n);

    // Copy each channel into its layer slot and compute ranges
    const channels = [u, v, p, omega, obstacle];
    const rangeKeys: Array<keyof typeof ranges> = ['u', 'v', 'p', 'omega', 'obstacle'];

    for (let c = 0; c < 5; c++) {
      const layerOffset = (f * nChannels + c) * n;
      const src = channels[c];
      const range = ranges[rangeKeys[c]];

      for (let i = 0; i < n; i++) {
        const val = src[i];
        layers[layerOffset + i] = val;
        updateRange(range, val);
      }
    }

    // Compute velocity magnitude range from u and v
    for (let i = 0; i < n; i++) {
      const vel = Math.sqrt(u[i] * u[i] + v[i] * v[i]);
      updateRange(ranges.velocity, vel);
    }
  }

  // Clamp Infinity ranges for empty or all-NaN fields
  for (const key of Object.keys(ranges) as Array<keyof typeof ranges>) {
    const r = ranges[key];
    if (r.min === Infinity) r.min = 0;
    if (r.max === -Infinity) r.max = 0;
  }

  console.log(
    `[FrameWorker] Parsed ${nFrames} frames, ${nx}x${ny}, ` +
    `${nChannels}ch, ${totalLayers} layers`,
  );

  return {
    type: 'parsed',
    layers,
    nx,
    ny,
    nFrames,
    nChannels,
    ranges,
    frameSteps,
  };
}
