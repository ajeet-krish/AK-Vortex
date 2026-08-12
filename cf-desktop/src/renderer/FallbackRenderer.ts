// Canvas2D fallback renderer for when WebGL is unavailable or produces incorrect output.
// Reuses the proven CPU-side colormap functions from utils/colormap.ts.
// API-compatible with the WebGL Renderer for seamless swapping in FlowCanvas.

import { sampleColormap } from '../utils/colormap';
import type { FrameData } from '../types';

export interface FallbackRenderConfig {
  field: 'velocity' | 'pressure' | 'vorticity';
  showObstacles: boolean;
  colorRange: { min: number; max: number };
  cmap: 'jet' | 'coolwarm' | 'rdbu';
}

/**
 * Minimal viewport interface matching what FlowCanvas reads from the WebGL
 * Renderer for mouse probe calculations. The fallback has no pan/zoom, so
 * this returns a fixed fit-to-view state.
 */
interface FallbackViewport {
  getState(): { centerX: number; centerY: number; zoom: number };
}

export class FallbackRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nx = 0;
  private ny = 0;
  private obstacleData: Float32Array | null = null;
  private offscreen: HTMLCanvasElement | null = null;
  private offCtx: CanvasRenderingContext2D | null = null;
  private offscreenNx = 0;
  private offscreenNy = 0;

  /**
   * Create a FallbackRenderer with its own canvas element.
   * A single canvas cannot have both a WebGL2 and a Canvas2D context, so the
   * fallback creates a fresh <canvas> and exposes it via `getElement()`. The
   * caller (FlowCanvas) is responsible for swapping this element into the DOM.
   */
  constructor(_existingCanvas?: HTMLCanvasElement) {
    // Always create a brand-new canvas to avoid the "context already acquired" error.
    // If a canvas with a WebGL context is passed in, we ignore it.
    const canvas = document.createElement('canvas');
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get Canvas2D context');
    this.ctx = ctx;
    console.log('[FallbackRenderer] Canvas2D fallback initialized on fresh canvas');
  }

  /** Return the canvas element managed by this renderer (for DOM insertion). */
  getElement(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Store frame metadata and obstacle data (mirrors WebGL Renderer.uploadFrameData).
   */
  uploadFrameData(frame: FrameData): void {
    this.nx = frame.nx;
    this.ny = frame.ny;
    this.obstacleData = frame.obstacle;
  }

  /**
   * No-op for quiver data (Canvas2D fallback does not draw quiver glyphs).
   */
  uploadQuiver(
    _u: Float32Array,
    _v: Float32Array,
    _obstacle: Float32Array,
    _step?: number,
  ): void {
    // Quiver is WebGL-only in the fallback path
  }

  /**
   * Return a fixed fit-to-view viewport (no pan/zoom in fallback mode).
   */
  getViewport(): FallbackViewport {
    const self = this;
    return {
      getState() {
        return { centerX: self.nx / 2, centerY: self.ny / 2, zoom: 1 };
      },
    };
  }

  /**
   * Render the flow field to the canvas using Canvas2D.
   * Produces a contour image at grid resolution, then scales to fill the
   * canvas with nearest-neighbor interpolation for crisp pixel boundaries.
   */
  render(config: FallbackRenderConfig, frameData: FrameData): void {
    this.nx = frameData.nx;
    this.ny = frameData.ny;

    const { min, max } = config.colorRange;
    const range = max - min;

    // Select field data
    let fieldData: Float32Array;
    switch (config.field) {
      case 'pressure':
        fieldData = frameData.p;
        break;
      case 'vorticity':
        fieldData = frameData.omega;
        break;
      default:
        fieldData = frameData.velocity;
        break;
    }

    // Build contour image at grid resolution
    const imageData = this.ctx.createImageData(this.nx, this.ny);
    const pixels = imageData.data;

    for (let y = 0; y < this.ny; y++) {
      for (let x = 0; x < this.nx; x++) {
        const idx = y * this.nx + x;
        const val = fieldData[idx];
        const pi = idx * 4;

        // Obstacle cells get a dark background
        if (this.obstacleData && this.obstacleData[idx] > 0.5) {
          pixels[pi] = 30;
          pixels[pi + 1] = 30;
          pixels[pi + 2] = 40;
          pixels[pi + 3] = 255;
          continue;
        }

        // Non-finite values get the same dark background
        if (!Number.isFinite(val)) {
          pixels[pi] = 30;
          pixels[pi + 1] = 30;
          pixels[pi + 2] = 40;
          pixels[pi + 3] = 255;
          continue;
        }

        // Normalize to [0, 1] and sample colormap
        const t = Math.max(0, Math.min(1, range > 1e-10 ? (val - min) / range : 0));
        const [r, g, b] = sampleColormap(config.cmap, t);

        pixels[pi] = r;
        pixels[pi + 1] = g;
        pixels[pi + 2] = b;
        pixels[pi + 3] = 255;
      }
    }

    // Draw at grid resolution, then scale to fill the canvas with nearest-neighbor
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    if (this.nx === cw && this.ny === ch) {
      // Grid matches canvas size exactly -- direct put
      this.ctx.putImageData(imageData, 0, 0);
    } else {
      // Scale via offscreen canvas for crisp nearest-neighbor upscaling
      if (!this.offscreen || this.offscreenNx !== this.nx || this.offscreenNy !== this.ny) {
        this.offscreen = document.createElement('canvas');
        this.offscreen.width = this.nx;
        this.offscreen.height = this.ny;
        this.offCtx = this.offscreen.getContext('2d')!;
        this.offscreenNx = this.nx;
        this.offscreenNy = this.ny;
      }
      this.offCtx!.putImageData(imageData, 0, 0);

      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(this.offscreen, 0, 0, cw, ch);
    }
  }

  /**
   * Resize the canvas backing store (DPR-aware, matches WebGL Renderer.resize).
   */
  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    const newW = Math.round(width * dpr);
    const newH = Math.round(height * dpr);
    if (this.canvas.width === newW && this.canvas.height === newH) return;
    this.canvas.width = newW;
    this.canvas.height = newH;
  }

  /**
   * No GPU resources to release in the Canvas2D path.
   */
  destroy(): void {
    this.obstacleData = null;
    console.log('[FallbackRenderer] Destroyed');
  }
}
