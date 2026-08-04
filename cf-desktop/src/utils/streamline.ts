// Streamline tracing utilities ported from flow-viewer.js.
// Bilinear field sampling, RK4 streamline integration, and seed generation.

export interface Point {
    x: number;
    y: number;
}

/**
 * Bilinear sample a flat field array at continuous coordinates (x, y).
 * Coordinates are clamped to grid bounds.
 */
export function sampleField(
    arr: number[],
    nx: number,
    ny: number,
    x: number,
    y: number
): number {
    const cx = Math.max(0, Math.min(nx - 1, x));
    const cy = Math.max(0, Math.min(ny - 1, y));
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const x1 = Math.min(nx - 1, x0 + 1);
    const y1 = Math.min(ny - 1, y0 + 1);
    const fx = cx - x0;
    const fy = cy - y0;

    const v00 = arr[y0 * nx + x0];
    const v10 = arr[y0 * nx + x1];
    const v01 = arr[y1 * nx + x0];
    const v11 = arr[y1 * nx + x1];

    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) +
           (v01 * (1 - fx) + v11 * fx) * fy;
}

/**
 * Trace a single streamline using RK4 integration with constant arc-length stepping.
 * @param u - u-velocity field (flat, row-major, y=0 at bottom)
 * @param v - v-velocity field
 * @param nx, ny - grid dimensions
 * @param obs - obstacle mask (1 = obstacle)
 * @param x0, y0 - starting point in grid coordinates
 * @param dir - +1 forward, -1 backward
 * @param maxSteps - maximum integration steps
 * @param stepLen - arc-length per step in grid cells
 * @returns Array of points along the streamline
 */
export function traceStreamline(
    u: number[],
    v: number[],
    nx: number,
    ny: number,
    obs: number[],
    x0: number,
    y0: number,
    dir: 1 | -1,
    maxSteps = 90,
    stepLen = 1.0
): Point[] {
    const pts: Point[] = [];
    let x = x0;
    let y = y0;

    for (let i = 0; i < maxSteps; i++) {
        if (x < 0 || x > nx - 1 || y < 0 || y > ny - 1) break;

        const ix = Math.floor(y) * nx + Math.floor(x);
        if (obs[ix] > 0.5) break;

        const ux = sampleField(u, nx, ny, x, y);
        const vy = sampleField(v, nx, ny, x, y);
        const sp = Math.hypot(ux, vy);
        if (sp < 1e-5) break;

        pts.push({ x, y });

        const inv = (dir * stepLen) / sp;

        // RK4 stages
        const k1x = ux;
        const k1y = vy;

        const ax = x + inv * 0.5 * k1x;
        const ay = y + inv * 0.5 * k1y;
        const k2x = sampleField(u, nx, ny, ax, ay);
        const k2y = sampleField(v, nx, ny, ax, ay);

        const bx = x + inv * 0.5 * k2x;
        const by = y + inv * 0.5 * k2y;
        const k3x = sampleField(u, nx, ny, bx, by);
        const k3y = sampleField(v, nx, ny, bx, by);

        const cx = x + inv * k3x;
        const cy = y + inv * k3y;
        const k4x = sampleField(u, nx, ny, cx, cy);
        const k4y = sampleField(v, nx, ny, cx, cy);

        x += inv * (k1x + 2 * k2x + 2 * k3x + k4x) / 6;
        y += inv * (k1y + 2 * k2y + 2 * k3y + k4y) / 6;
    }

    return pts;
}

/**
 * Build a set of streamlines over the domain using uniform seed placement.
 * @param nSeeds - approximate number of seeds along each axis
 * @returns Array of polylines (each an array of Points)
 */
export function buildStreamlines(
    u: number[],
    v: number[],
    nx: number,
    ny: number,
    obs: number[],
    nSeeds = 13
): Point[][] {
    const lines: Point[][] = [];
    const step = Math.max(4, Math.floor(nx / nSeeds));

    for (let j = Math.floor(step / 2); j < ny; j += step) {
        for (let i = Math.floor(step / 2); i < nx; i += step) {
            if (obs[Math.floor(j) * nx + Math.floor(i)] > 0.5) continue;

            const back = traceStreamline(u, v, nx, ny, obs, i, j, -1, 90, 1.0);
            const fwd = traceStreamline(u, v, nx, ny, obs, i, j, 1, 90, 1.0);
            const line = back.reverse().concat(fwd);

            if (line.length > 2) {
                lines.push(line);
            }
        }
    }

    return lines;
}
