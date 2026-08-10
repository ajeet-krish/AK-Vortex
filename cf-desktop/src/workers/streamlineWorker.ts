// Streamline computation Web Worker.
// Runs bilinear-traced streamlines off the main thread for responsive rendering.

// Module-scoped Web Worker type declarations (avoids DOM/WebWorker lib conflicts)
declare const self: {
    postMessage(data: StreamlineResult, transfer?: ArrayBufferLike[]): void;
    onmessage: ((e: { data: StreamlineRequest }) => void) | null;
};

interface StreamlineRequest {
    type: 'compute';
    requestId: number;
    u: Float32Array;
    v: Float32Array;
    nx: number;
    ny: number;
    obstacle: Float32Array;
    nSeeds?: number;
}

interface StreamlineResult {
    type: 'streamlines';
    requestId: number;
    nLines: number;
    counts: Uint32Array;
    xy: Float32Array;
}

function sampleField(
    arr: Float32Array,
    nx: number,
    ny: number,
    x: number,
    y: number
): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || xi >= nx - 1 || yi < 0 || yi >= ny - 1) return 0;
    const fx = x - xi;
    const fy = y - yi;
    const idx = yi * nx + xi;
    return (
        arr[idx] * (1 - fx) * (1 - fy) +
        arr[idx + 1] * fx * (1 - fy) +
        arr[idx + nx] * (1 - fx) * fy +
        arr[idx + nx + 1] * fx * fy
    );
}

function traceStreamline(
    u: Float32Array,
    v: Float32Array,
    nx: number,
    ny: number,
    x0: number,
    y0: number,
    maxSteps: number = 180,
    ds: number = 0.5
): { xs: number[]; ys: number[] } {
    const xs: number[] = [x0];
    const ys: number[] = [y0];
    let x = x0;
    let y = y0;

    for (let i = 0; i < maxSteps; i++) {
        const ux = sampleField(u, nx, ny, x, y);
        const vy = sampleField(v, nx, ny, x, y);
        const speed = Math.sqrt(ux * ux + vy * vy);
        if (speed < 1e-6) break;

        x += (ux / speed) * ds;
        y += (vy / speed) * ds;

        if (x < 0 || x >= nx - 1 || y < 0 || y >= ny - 1) break;
        xs.push(x);
        ys.push(y);
    }

    return { xs, ys };
}

function buildStreamlines(
    u: Float32Array,
    v: Float32Array,
    nx: number,
    ny: number,
    obstacle: Float32Array,
    nSeeds: number = 13
): { nLines: number; counts: Uint32Array; xy: Float32Array } {
    // Seed along left edge
    const lines: { xs: number[]; ys: number[] }[] = [];
    for (let i = 0; i < nSeeds; i++) {
        const y = Math.floor((i + 1) * ny / (nSeeds + 1));
        if (obstacle[y * nx] === 1) continue;
        lines.push(traceStreamline(u, v, nx, ny, 0.5, y + 0.5));
    }

    // Count total points
    let totalPoints = 0;
    const counts = new Uint32Array(lines.length);
    for (let i = 0; i < lines.length; i++) {
        counts[i] = lines[i].xs.length;
        totalPoints += counts[i];
    }

    // Pack into flat array
    const xy = new Float32Array(totalPoints * 2);
    let offset = 0;
    for (const line of lines) {
        for (let j = 0; j < line.xs.length; j++) {
            xy[offset++] = line.xs[j];
            xy[offset++] = line.ys[j];
        }
    }

    return { nLines: lines.length, counts, xy };
}

self.onmessage = (e: { data: StreamlineRequest }) => {
    const msg = e.data;
    if (msg.type === 'compute') {
        const result = buildStreamlines(
            msg.u,
            msg.v,
            msg.nx,
            msg.ny,
            msg.obstacle,
            msg.nSeeds ?? 13
        );
        const response: StreamlineResult = {
            type: 'streamlines',
            requestId: msg.requestId,
            nLines: result.nLines,
            counts: result.counts,
            xy: result.xy,
        };
        // Transfer Float32Array and Uint32Array for zero-copy
        self.postMessage(response, [result.xy.buffer, result.counts.buffer]);
    }
};

export {};

