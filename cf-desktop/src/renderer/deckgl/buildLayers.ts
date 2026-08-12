/**
 * Layer factory: assembles the deck.gl layer stack from current visualization state.
 *
 * Returns an array of Layer instances in draw order (back to front):
 *   1. ContourLayer (flow field contour, always present when texture is ready)
 *   2. QuiverArrowLayer (TODO, Phase 3d)
 *   3. ObstacleOverlayLayer (TODO, Phase 3e)
 */
import { type Layer } from '@deck.gl/core';
import { ContourLayer } from './ContourLayer';
import type { FrameData, FrameBatchData } from '../../types';

export interface BuildLayersConfig {
  frameData: FrameData;
  field: 'velocity' | 'pressure' | 'vorticity';
  showQuiver: boolean;
  showObstacles: boolean;
  colorRange: { min: number; max: number };
  batchFrames?: FrameBatchData | null;
  frameIndex?: number;
  texture?: WebGLTexture | null;
}

export function buildLayers(config: BuildLayersConfig): Layer[] {
  const layers: Layer[] = [];

  // Map field to colormap type: 0=jet, 1=coolwarm, 2=rdbu
  let cmapType = 0;
  if (config.field === 'pressure') cmapType = 1;
  else if (config.field === 'vorticity') cmapType = 2;

  // Contour layer (requires uploaded texture + batch metadata)
  if (config.texture && config.batchFrames) {
    layers.push(
      new ContourLayer({
        id: 'contour',
        texture: config.texture,
        frameIndex: config.frameIndex ?? 0,
        cmapType,
        valueRange: [config.colorRange.min, config.colorRange.max],
        gridSize: [config.batchFrames.nx, config.batchFrames.ny],
        nChannels: config.batchFrames.nChannels,
        bounds: [0, 0, config.batchFrames.nx, config.batchFrames.ny],
      }) as Layer,
    );
  }

  // TODO: Add QuiverArrowLayer (Phase 3d)
  // TODO: Add ObstacleOverlayLayer (Phase 3e)

  return layers;
}
