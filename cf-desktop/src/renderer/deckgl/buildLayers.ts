/**
 * Layer factory: assembles the deck.gl layer stack from current visualization state.
 *
 * Returns an array of Layer instances in draw order (back to front):
 *   1. ContourLayer (flow field contour, always present when texture is ready)
 *   2. ObstacleOverlayLayer (semi-transparent obstacle overlay)
 *   3. QuiverArrowLayer (velocity arrow glyphs)
 */
import { type Layer } from '@deck.gl/core';
import { ContourLayer } from './ContourLayer';
import { createQuiverLayer } from './QuiverArrowLayer';
import { createObstacleLayer } from './ObstacleOverlayLayer';
import type { FrameData, FrameBatchData } from '../../types';

export interface BuildLayersConfig {
  frameData: FrameData;
  field: 'velocity' | 'pressure' | 'vorticity';
  showQuiver: boolean;
  showObstacles: boolean;
  colorRange: { min: number; max: number };
  quiverStep?: number;
  quiverVmax?: number;
  batchFrames?: FrameBatchData | null;
  frameIndex?: number;
  texture?: WebGLTexture | null;
}

export function buildLayers(config: BuildLayersConfig): Layer[] {
  const layers: Layer[] = [];
  const nx = config.batchFrames?.nx ?? config.frameData.nx;
  const ny = config.batchFrames?.ny ?? config.frameData.ny;

  // 1. Contour layer (requires uploaded texture + batch metadata)
  if (config.texture && config.batchFrames) {
    // Map field to colormap type: 0=jet, 1=coolwarm, 2=rdbu
    let cmapType = 0;
    if (config.field === 'pressure') cmapType = 1;
    else if (config.field === 'vorticity') cmapType = 2;

    layers.push(
      new ContourLayer({
        id: 'contour',
        texture: config.texture,
        frameIndex: config.frameIndex ?? 0,
        cmapType,
        valueRange: [config.colorRange.min, config.colorRange.max],
        gridSize: [nx, ny],
        nChannels: config.batchFrames.nChannels,
        bounds: [0, 0, nx, ny],
      }) as Layer,
    );
  }

  // 2. Obstacle overlay (vector polygons from obstacle mask)
  const obstacleLayer = createObstacleLayer({
    obstacle: config.frameData.obstacle,
    nx,
    ny,
    visible: config.showObstacles,
  });
  if (obstacleLayer) layers.push(obstacleLayer as Layer);

  // 3. Quiver arrows (instanced velocity glyphs)
  const quiverLayer = createQuiverLayer({
    frameData: config.frameData,
    nx,
    ny,
    step: config.quiverStep ?? 8,
    vmax: config.quiverVmax ?? 1,
    visible: config.showQuiver,
  });
  if (quiverLayer) layers.push(quiverLayer as Layer);

  return layers;
}
