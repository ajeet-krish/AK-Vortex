/**
 * React wrapper for deck.gl CFD flow visualization.
 *
 * Renders the flow field via DeckGL with OrthographicView and the
 * layer stack produced by buildLayers(). Handles hover probing,
 * view state, and DPR-aware sizing.
 *
 * This component is the deck.gl counterpart to the existing FlowCanvas
 * (custom WebGL) and can be swapped in via feature flag.
 */
import { useMemo, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { OrthographicView, type PickingInfo } from '@deck.gl/core';
import { buildLayers } from '../renderer/deckgl/buildLayers';
import type { FrameData, FrameBatchData, ProbeInfo } from '../types';

interface DeckGLFlowCanvasProps {
  frameData: FrameData;
  field: 'velocity' | 'pressure' | 'vorticity';
  showQuiver: boolean;
  canvasSize: { width: number; height: number };
  colorRange?: { min: number; max: number } | null;
  onProbe?: (info: ProbeInfo | null) => void;
  batchFrames?: FrameBatchData | null;
  frameIndex?: number;
  texture?: WebGLTexture | null;
}

export default function DeckGLFlowCanvas({
  frameData,
  field,
  showQuiver,
  canvasSize,
  colorRange,
  onProbe,
  batchFrames,
  frameIndex,
  texture,
}: DeckGLFlowCanvasProps) {
  const layers = useMemo(() => {
    return buildLayers({
      frameData,
      field,
      showQuiver,
      showObstacles: true,
      colorRange: colorRange ?? { min: 0, max: 1 },
      batchFrames,
      frameIndex,
      texture,
    });
  }, [frameData, field, showQuiver, colorRange, batchFrames, frameIndex, texture]);

  const viewState = useMemo(
    () => ({
      target: [
        (batchFrames?.nx ?? frameData.nx) / 2,
        (batchFrames?.ny ?? frameData.ny) / 2,
      ] as [number, number],
      zoom: 0,
    }),
    [batchFrames, frameData],
  );

  const onViewStateChange = useCallback(
    ({ viewState: _vs }: { viewState: Record<string, unknown> }) => {
      // TODO: Sync with probe coordinate transform (Phase 3d)
    },
    [],
  );

  const onHover = useCallback(
    (info: PickingInfo) => {
      if (!info.coordinate || !onProbe) return;

      const [worldX, worldY] = info.coordinate;
      const nx = batchFrames?.nx ?? frameData.nx;
      const ny = batchFrames?.ny ?? frameData.ny;

      const ix = Math.floor(worldX);
      const iy = Math.floor(worldY);

      if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) {
        onProbe(null);
        return;
      }

      const idx = iy * nx + ix;
      onProbe({
        x: ix,
        y: iy,
        u: frameData.u[idx],
        v: frameData.v[idx],
        speed: frameData.velocity[idx],
        p: frameData.p[idx],
        omega: frameData.omega[idx],
        canvasX: info.pixel?.[0] ?? 0,
        canvasY: info.pixel?.[1] ?? 0,
      });
    },
    [frameData, batchFrames, onProbe],
  );

  return (
    <div className="flow-canvas-container">
      <DeckGL
        views={new OrthographicView()}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        layers={layers}
        onHover={onHover}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
