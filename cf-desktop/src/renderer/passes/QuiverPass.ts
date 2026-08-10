import { ShaderProgram } from '../ShaderProgram';
import type { ColormapTexture } from '../ColormapTexture';
import vertSrc from '../shaders/quiver.vert.glsl';
import fragSrc from '../shaders/quiver.frag.glsl';

// Arrow template: simple triangle arrow pointing right (+x)
const ARROW_TEMPLATE = new Float32Array([
  // Shaft + head (2 triangles, 6 vertices)
  -0.5,  0.0,
   0.5,  0.0,
   0.3,  0.15,
  -0.5,  0.0,
   0.3,  0.15,
   0.3, -0.15,
]);

export class QuiverPass {
  private gl: WebGL2RenderingContext;
  private program: ShaderProgram;
  private vao: WebGLVertexArrayObject;
  private templateVBO: WebGLBuffer;
  private instanceVBO: WebGLBuffer;
  private instanceCount = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = new ShaderProgram(gl, vertSrc, fragSrc);
    this.templateVBO = gl.createBuffer()!;
    this.instanceVBO = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;

    gl.bindVertexArray(this.vao);

    // Arrow template (per-vertex)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.templateVBO);
    gl.bufferData(gl.ARRAY_BUFFER, ARROW_TEMPLATE, gl.STATIC_DRAW);
    const vertLoc = this.program.getAttrib('a_vertex');
    gl.enableVertexAttribArray(vertLoc);
    gl.vertexAttribPointer(vertLoc, 2, gl.FLOAT, false, 8, 0);

    // Instance data (per-instance)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    const posLoc = this.program.getAttrib('a_position');
    const dirLoc = this.program.getAttrib('a_dir');
    const speedLoc = this.program.getAttrib('a_speed');
    const stride = 20; // 5 floats x 4 bytes
    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(dirLoc);
    gl.enableVertexAttribArray(speedLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(dirLoc, 2, gl.FLOAT, false, stride, 8);
    gl.vertexAttribPointer(speedLoc, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(posLoc, 1);
    gl.vertexAttribDivisor(dirLoc, 1);
    gl.vertexAttribDivisor(speedLoc, 1);

    gl.bindVertexArray(null);
  }

  uploadQuiver(
    u: Float32Array,
    v: Float32Array,
    obstacle: Float32Array,
    nx: number,
    ny: number,
    step = 8,
  ): void {
    const instances: number[] = [];
    for (let y = Math.floor(step / 2); y < ny; y += step) {
      for (let x = Math.floor(step / 2); x < nx; x += step) {
        const idx = Math.floor(y) * nx + Math.floor(x);
        if (obstacle[idx] > 0.5) continue;
        const ux = u[idx];
        const vy = v[idx];
        const speed = Math.sqrt(ux * ux + vy * vy);
        if (speed < 1e-6) continue;
        // Normalized direction and speed for this instance
        instances.push(
          x + 0.5,
          y + 0.5,
          ux / speed,
          vy / speed,
          speed,
        );
      }
    }

    this.instanceCount = instances.length / 5;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instances), gl.DYNAMIC_DRAW);
  }

  render(
    proj: Float32Array,
    cmap: ColormapTexture,
    nx: number,
    ny: number,
    vmax: number,
    alpha = 0.6,
  ): void {
    if (this.instanceCount === 0) return;
    const gl = this.gl;
    this.program.use();
    this.program.setMat3('u_proj', proj);
    this.program.setFloat('u_arrowLen', 3.0);
    this.program.setFloat('u_vmax', vmax);
    this.program.setVec2('u_gridSize', nx, ny);
    this.program.setFloat('u_alpha', alpha);

    cmap.bind(0);
    this.program.setInt('u_cmapTex', 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  destroy(): void {
    this.program.destroy();
    this.gl.deleteBuffer(this.templateVBO);
    this.gl.deleteBuffer(this.instanceVBO);
    this.gl.deleteVertexArray(this.vao);
  }
}
