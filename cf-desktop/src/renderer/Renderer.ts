import { createGLContext, type GLContext } from './WebGLContext';
import { ColormapTexture, type ColormapName } from './ColormapTexture';
import { Viewport } from './Viewport';
import { ContourPass } from './passes/ContourPass';
import { ObstaclePass } from './passes/ObstaclePass';
import { MeshPass } from './passes/MeshPass';
import { StreamlinePass } from './passes/StreamlinePass';
import { QuiverPass } from './passes/QuiverPass';
import { ColorBarPass } from './passes/ColorBarPass';
import type { FrameData } from '../types';
import type { Point } from '../utils/streamline';

export interface RenderConfig {
  field: 'velocity' | 'pressure' | 'vorticity';
  showMesh: boolean;
  showObstacles: boolean;
  showStreamlines: boolean;
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
  private meshPass: MeshPass;
  private streamlinePass: StreamlinePass;
  private quiverPass: QuiverPass;
  private colorbarPass: ColorBarPass;
  private nx = 0;
  private ny = 0;
  private quiverVmax = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = createGLContext(canvas);
    this.cmap = new ColormapTexture(this.ctx.gl);
    this.viewport = new Viewport(canvas, 100, 100);
    this.contourPass = new ContourPass(this.ctx.gl);
    this.obstaclePass = new ObstaclePass(this.ctx.gl);
    this.meshPass = new MeshPass(this.ctx.gl);
    this.streamlinePass = new StreamlinePass(this.ctx.gl);
    this.quiverPass = new QuiverPass(this.ctx.gl);
    this.colorbarPass = new ColorBarPass(this.ctx.gl);
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

  uploadStreamlines(
    lines: Point[][],
    speed: Float32Array,
    vmax: number,
  ): void {
    this.streamlinePass.uploadStreamlines(lines, speed, this.nx, this.ny, vmax);
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
    this.contourPass.uploadField(fieldData, this.nx, this.ny);
    this.contourPass.render(
      proj,
      this.cmap,
      config.colorRange.min,
      config.colorRange.max,
      this.nx,
      this.ny,
    );

    // 2. Obstacles (semi-transparent overlay)
    if (config.showObstacles) {
      this.obstaclePass.render(proj, this.nx, this.ny);
    }

    // 3. Mesh (semi-transparent grid lines)
    if (config.showMesh) {
      const zoom = this.viewport.getState().zoom;
      this.meshPass.updateGrid(this.nx, this.ny, zoom);
      this.meshPass.render(proj, zoom);
    }

    // 4. Streamlines (colored line strips)
    if (config.showStreamlines) {
      this.streamlinePass.render(proj, this.cmap);
    }

    // 5. Quiver (instanced arrow glyphs)
    if (config.showQuiver) {
      this.quiverPass.render(
        proj,
        this.cmap,
        this.nx,
        this.ny,
        this.quiverVmax,
      );
    }

    // 6. Color bar (screen-space overlay, always shown)
    this.colorbarPass.render(
      this.cmap,
      cw,
      ch,
      config.colorRange.min,
      config.colorRange.max,
    );
  }

  resize(width: number, height: number): void {
    const canvas = this.ctx.gl.canvas as HTMLCanvasElement;
    canvas.width = width;
    canvas.height = height;
  }

  getViewport(): Viewport {
    return this.viewport;
  }

  destroy(): void {
    this.contourPass.destroy();
    this.obstaclePass.destroy();
    this.meshPass.destroy();
    this.streamlinePass.destroy();
    this.quiverPass.destroy();
    this.colorbarPass.destroy();
    this.cmap.destroy();
    this.viewport.destroy();
  }
}
