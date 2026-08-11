import { createGLContext, type GLContext } from './WebGLContext';
import { ColormapTexture, type ColormapName } from './ColormapTexture';
import { Viewport } from './Viewport';
import { ContourPass } from './passes/ContourPass';
import { ObstaclePass } from './passes/ObstaclePass';
import { QuiverPass } from './passes/QuiverPass';
import type { FrameData } from '../types';

export interface RenderConfig {
  field: 'velocity' | 'pressure' | 'vorticity';
  showObstacles: boolean;
  showQuiver: boolean;
  colorRange: { min: number; max: number };
  cmap: ColormapName;
}

export class Renderer {
  private ctx: GLContext;
  private cmap: ColormapTexture;
  private viewport: Viewport;
  private contourPass: ContourPass;
  private obstaclePass: ObstaclePass;
  private quiverPass: QuiverPass;
  private nx = 0;
  private ny = 0;
  private quiverVmax = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = createGLContext(canvas);
    this.cmap = new ColormapTexture(this.ctx.gl);
    this.viewport = new Viewport(canvas, 100, 100);
    this.contourPass = new ContourPass(this.ctx.gl);
    this.obstaclePass = new ObstaclePass(this.ctx.gl);
    this.quiverPass = new QuiverPass(this.ctx.gl);
  }

  uploadFrameData(frame: FrameData): void {
    this.nx = frame.nx;
    this.ny = frame.ny;

    // Reposition viewport to center on new grid without re-creating
    // (avoids re-attaching mouse/wheel listeners)
    this.viewport.setState({
      centerX: this.nx / 2,
      centerY: this.ny / 2,
      zoom: this.viewport.getState().zoom,
    });

    // Upload obstacle texture
    this.obstaclePass.uploadObstacle(frame.obstacle, this.nx, this.ny);
  }

  uploadQuiver(
    u: Float32Array,
    v: Float32Array,
    obstacle: Float32Array,
    step?: number,
  ): void {
    this.quiverPass.uploadQuiver(u, v, obstacle, this.nx, this.ny, step);
    // Compute max velocity magnitude for arrow scaling and coloring
    let maxSpeed = 0;
    for (let i = 0; i < u.length; i++) {
      if (obstacle[i] > 0.5) continue;
      const sp = Math.sqrt(u[i] * u[i] + v[i] * v[i]);
      if (sp > maxSpeed) maxSpeed = sp;
    }
    this.quiverVmax = maxSpeed;
  }

  render(config: RenderConfig, frameData: FrameData): void {
    const gl = this.ctx.gl;
    const cw = gl.canvas.width;
    const ch = gl.canvas.height;
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0.08, 0.09, 0.12, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.cmap.upload(config.cmap);
    const proj = this.viewport.getProjectionMatrix();

    // Select field data
    let fieldData: Float32Array;
    switch (config.field) {
      case 'pressure':
        fieldData = frameData.p;
        break;
      case 'vorticity':
        fieldData = frameData.omega;
        break;
      default: // velocity
        fieldData = frameData.velocity;
        break;
    }

    // 1. Contour (opaque background)
    // Map field type to analytic colormap index: 0=jet, 1=coolwarm, 2=rdbu
    let cmapType = 0;
    if (config.field === 'pressure') cmapType = 1;
    else if (config.field === 'vorticity') cmapType = 2;

    this.contourPass.uploadField(fieldData, this.nx, this.ny);
    this.contourPass.render(
      proj,
      cmapType,
      config.colorRange.min,
      config.colorRange.max,
      this.nx,
      this.ny,
    );

    // 2. Obstacles (semi-transparent overlay)
    if (config.showObstacles) {
      this.obstaclePass.render(proj, this.nx, this.ny);
    }

    // 3. Quiver (instanced arrow glyphs)
    if (config.showQuiver) {
      this.quiverPass.render(
        proj,
        this.cmap,
        this.nx,
        this.ny,
        this.quiverVmax,
      );
    }
  }

  resize(width: number, height: number): void {
    const canvas = this.ctx.gl.canvas as HTMLCanvasElement;
    const dpr = window.devicePixelRatio || 1;
    // Backing store = CSS size * DPR for retina-sharp rendering
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    // CSS size is set by FlowCanvas (style.width/height)
  }

  getViewport(): Viewport {
    return this.viewport;
  }

  destroy(): void {
    this.contourPass.destroy();
    this.obstaclePass.destroy();
    this.quiverPass.destroy();
    this.cmap.destroy();
    this.viewport.destroy();
  }
}
