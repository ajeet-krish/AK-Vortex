// NACA 4-digit airfoil coordinate generation.
// Ported from src/geometry.hpp naca_coords().

export interface Point {
    x: number;
    y: number;
}

/**
 * Generate NACA 4-digit airfoil coordinates.
 * @param m - Max camber as fraction of chord (0 to 0.09)
 * @param p - Camber position as fraction of chord (0 to 0.9)
 * @param t - Max thickness as fraction of chord (0 to 0.40)
 * @param nPoints - Number of points per surface (total polygon = 2*nPoints - 2)
 * @returns Closed polygon points (upper surface TE->LE, lower surface LE->TE)
 */
export function naca4Airfoil(
    m: number,
    p: number,
    t: number,
    nPoints: number = 100
): Point[] {
    const n = nPoints;

    // Cosine spacing for LE/TE clustering
    const x: number[] = [];
    for (let i = 0; i < n; i++) {
        const beta = (i / (n - 1)) * Math.PI;
        x.push((1 - Math.cos(beta)) / 2);
    }

    // Thickness distribution
    const yt: number[] = [];
    for (let i = 0; i < n; i++) {
        yt.push(
            5 *
                t *
                (0.2969 * Math.sqrt(x[i]) -
                    0.126 * x[i] -
                    0.3516 * x[i] * x[i] +
                    0.2843 * x[i] * x[i] * x[i] -
                    0.1015 * x[i] * x[i] * x[i] * x[i])
        );
    }

    // Camber line
    const yc: number[] = new Array(n).fill(0);
    const dyc_dx: number[] = new Array(n).fill(0);

    if (m > 1e-10 && p > 1e-10) {
        for (let i = 0; i < n; i++) {
            if (x[i] < p) {
                yc[i] = (m / (p * p)) * (2 * p * x[i] - x[i] * x[i]);
                dyc_dx[i] = ((2 * m) / (p * p)) * (p - x[i]);
            } else {
                yc[i] =
                    (m / ((1 - p) * (1 - p))) *
                    (1 - 2 * p + 2 * p * x[i] - x[i] * x[i]);
                dyc_dx[i] =
                    ((2 * m) / ((1 - p) * (1 - p))) * (p - x[i]);
            }
        }
    }

    // Combine perpendicular to camber line
    // Negate y so upper surface (camber) appears on top in canvas coordinates
    // (canvas y increases downward, but aerodynamic convention has camber going up)
    const upper: Point[] = [];
    const lower: Point[] = [];
    for (let i = 0; i < n; i++) {
        const theta = Math.atan(dyc_dx[i]);
        const xt = x[i];
        upper.push({
            x: xt - yt[i] * Math.sin(theta),
            y: -(yc[i] + yt[i] * Math.cos(theta)),
        });
        lower.push({
            x: xt + yt[i] * Math.sin(theta),
            y: -(yc[i] - yt[i] * Math.cos(theta)),
        });
    }

    // Build closed polygon: TE -> upper surface -> LE -> lower surface -> TE
    const result: Point[] = [];

    // Upper surface: from TE (index n-1) to LE (index 0)
    for (let i = n - 1; i >= 0; i--) {
        result.push(upper[i]);
    }

    // Lower surface: skip first point (LE, already included) and last point (TE)
    for (let i = 1; i < n; i++) {
        result.push(lower[i]);
    }

    return result;
}

/**
 * Transform points: rotate, scale, translate.
 * @param points - Input points (modified in place)
 * @param cx - Translation X
 * @param cy - Translation Y
 * @param scale - Scale factor
 * @param angleDeg - Rotation angle in degrees
 */
export function transformPoints(
    points: Point[],
    cx: number,
    cy: number,
    scale: number,
    angleDeg: number
): Point[] {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    return points.map((pt) => {
        // Scale around origin
        const xs = pt.x * scale;
        const ys = pt.y * scale;
        // Rotate
        const xr = xs * cosA - ys * sinA;
        const yr = xs * sinA + ys * cosA;
        // Translate
        return { x: xr + cx, y: yr + cy };
    });
}

/**
 * Check if two shapes overlap using AABB + simple polygon intersection.
 * Uses bounding box for circles/rectangles, point-in-polygon for polygons.
 */
export function shapesOverlap(
    a: { type: string; x: number; y: number; radius?: number; width?: number; height?: number; points?: Point[] },
    b: { type: string; x: number; y: number; radius?: number; width?: number; height?: number; points?: Point[] }
): boolean {
    // Get bounding boxes
    const getBBox = (shape: typeof a) => {
        if (shape.type === 'circle' && shape.radius !== undefined) {
            return {
                minX: shape.x - shape.radius,
                maxX: shape.x + shape.radius,
                minY: shape.y - shape.radius,
                maxY: shape.y + shape.radius,
            };
        }
        if (shape.type === 'rectangle' && shape.width !== undefined && shape.height !== undefined) {
            return {
                minX: shape.x,
                maxX: shape.x + shape.width,
                minY: shape.y,
                maxY: shape.y + shape.height,
            };
        }
        if (shape.type === 'polygon' && shape.points && shape.points.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const pt of shape.points) {
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
            }
            return { minX, maxX, minY, maxY };
        }
        return { minX: shape.x, maxX: shape.x, minY: shape.y, maxY: shape.y };
    };

    const bboxA = getBBox(a);
    const bboxB = getBBox(b);

    // AABB overlap test
    if (
        bboxA.minX > bboxB.maxX ||
        bboxA.maxX < bboxB.minX ||
        bboxA.minY > bboxB.maxY ||
        bboxA.maxY < bboxB.minY
    ) {
        return false;
    }

    // For polygon-polygon or mixed, do a more detailed check
    // Check if any vertex of A is inside B or vice versa
    const pointInCircle = (px: number, py: number, cx: number, cy: number, r: number) => {
        const dx = px - cx;
        const dy = py - cy;
        return dx * dx + dy * dy <= r * r;
    };

    const pointInRect = (px: number, py: number, rx: number, ry: number, w: number, h: number) => {
        return px >= rx && px <= rx + w && py >= ry && py <= ry + h;
    };

    const pointInPolygon = (px: number, py: number, poly: Point[]) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;
            if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    };

    // Test vertices of A against shape B
    const testPointInB = (px: number, py: number) => {
        if (b.type === 'circle' && b.radius !== undefined) {
            return pointInCircle(px, py, b.x, b.y, b.radius);
        }
        if (b.type === 'rectangle' && b.width !== undefined && b.height !== undefined) {
            return pointInRect(px, py, b.x, b.y, b.width, b.height);
        }
        if (b.type === 'polygon' && b.points) {
            return pointInPolygon(px, py, b.points);
        }
        return false;
    };

    // Test vertices of B against shape A
    const testPointInA = (px: number, py: number) => {
        if (a.type === 'circle' && a.radius !== undefined) {
            return pointInCircle(px, py, a.x, a.y, a.radius);
        }
        if (a.type === 'rectangle' && a.width !== undefined && a.height !== undefined) {
            return pointInRect(px, py, a.x, a.y, a.width, a.height);
        }
        if (a.type === 'polygon' && a.points) {
            return pointInPolygon(px, py, a.points);
        }
        return false;
    };

    // Test A vertices against B
    if (a.type === 'circle' && a.radius !== undefined) {
        if (testPointInB(a.x, a.y)) return true;
    }
    if (a.type === 'rectangle' && a.width !== undefined && a.height !== undefined) {
        const corners = [
            { x: a.x, y: a.y },
            { x: a.x + a.width, y: a.y },
            { x: a.x, y: a.y + a.height },
            { x: a.x + a.width, y: a.y + a.height },
        ];
        for (const c of corners) {
            if (testPointInB(c.x, c.y)) return true;
        }
    }
    if (a.type === 'polygon' && a.points) {
        for (const pt of a.points) {
            if (testPointInB(pt.x, pt.y)) return true;
        }
    }

    // Test B vertices against A
    if (b.type === 'circle' && b.radius !== undefined) {
        if (testPointInA(b.x, b.y)) return true;
    }
    if (b.type === 'rectangle' && b.width !== undefined && b.height !== undefined) {
        const corners = [
            { x: b.x, y: b.y },
            { x: b.x + b.width, y: b.y },
            { x: b.x, y: b.y + b.height },
            { x: b.x + b.width, y: b.y + b.height },
        ];
        for (const c of corners) {
            if (testPointInA(c.x, c.y)) return true;
        }
    }
    if (b.type === 'polygon' && b.points) {
        for (const pt of b.points) {
            if (testPointInA(pt.x, pt.y)) return true;
        }
    }

    return false;
}
