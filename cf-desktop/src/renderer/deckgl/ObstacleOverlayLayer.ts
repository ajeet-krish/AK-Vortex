/**
 * ObstacleOverlayLayer: renders obstacle cells as semi-transparent polygons.
 *
 * Extracts boundary cells from the obstacle mask and draws them via deck.gl
 * PolygonLayer for crisp vector edges at any zoom level.
 */
import { PolygonLayer } from '@deck.gl/layers';

/* ------------------------------------------------------------------ */
/*  Boundary extraction                                                */
/* ------------------------------------------------------------------ */

export interface ObstacleCell {
  polygon: [number, number][];  // 4 corners of the cell
}

/** Extract obstacle boundary cells from the obstacle mask. */
export function extractObstaclePolygons(
  obstacle: Float32Array,
  nx: number,
  ny: number,
): ObstacleCell[] {
  const cells: ObstacleCell[] = [];

  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const idx = y * nx + x;
      if (obstacle[idx] <= 0.5) continue;

      // Include all obstacle cells for full overlay
      cells.push({
        polygon: [
          [x, y],
          [x + 1, y],
          [x + 1, y + 1],
          [x, y + 1],
        ],
      });
    }
  }

  return cells;
}

/* ------------------------------------------------------------------ */
/*  Layer factory                                                      */
/* ------------------------------------------------------------------ */

export interface ObstacleOverlayLayerProps {
  obstacle: Float32Array;
  nx: number;
  ny: number;
  visible: boolean;
}

/** Create a PolygonLayer for obstacle overlay. */
export function createObstacleLayer(props: ObstacleOverlayLayerProps): PolygonLayer | null {
  const { obstacle, nx, ny, visible } = props;
  if (!visible) return null;

  const polygons = extractObstaclePolygons(obstacle, nx, ny);
  if (polygons.length === 0) return null;

  return new PolygonLayer({
    id: 'obstacle-overlay',
    data: polygons,
    getPolygon: (d: ObstacleCell) => d.polygon,
    getFillColor: [30, 30, 40, 200],      // dark gray, 78% opacity
    getLineColor: [0, 255, 204, 150],     // cyan accent, 59% opacity
    getLineWidth: 1,
    lineWidthUnits: 'pixels' as const,
    filled: true,
    stroked: true,
    pickable: false,
    visible,
  });
}
