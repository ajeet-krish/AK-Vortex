import { ShaderProgram } from '../ShaderProgram';
import type { ColormapTexture } from '../ColormapTexture';
import { sampleField } from '../../utils/streamline';
import type { Point } from '../../utils/streamline';
import vertSrc from '../shaders/streamline.vert.glsl';
import fragSrc from '../shaders/streamline.frag.glsl';

export class StreamlinePass {
  private gl: WebGL2RenderingContext;
  private program: ShaderProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private vertexCount = 0;
  private lineOffsets: number[] = [];
  private lineCounts: number[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = new ShaderProgram(gl, vertSrc, fragSrc);
    this.vbo = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    const posLoc = this.program.getAttrib('a_position');
    const speedLoc = this.program.getAttrib('a_speed');
    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(speedLoc);
    // Stride: 3 floats (x, y, speed)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 12, 0);
    gl.vertexAttribPointer(speedLoc, 1, gl.FLOAT, false, 12, 8);
    gl.bindVertexArray(null);
  }

  uploadStreamlines(
    lines: Point[][],
    speed: Float32Array,
    nx: number,
    ny: number,
    vmax: number,
  ): void {
    // Pack lines into flat array: [x, y, speed, x, y, speed, ...]
    const vertices: number[] = [];
    this.lineOffsets = [];
    this.lineCounts = [];
    let offset = 0;

    for (const line of lines) {
      this.lineOffsets.push(offset);
      let count = 0;
      for (const p of line) {
        // Sample speed magnitude at streamline position via bilinear interpolation
        const s = sampleField(speed, nx, ny, p.x, p.y);
        vertices.push(p.x, p.y, Math.min(s / Math.max(vmax, 1e-6), 1.0));
        count++;
        offset++;
      }
      this.lineCounts.push(count);
    }

    this.vertexCount = vertices.length / 3;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
  }

  render(proj: Float32Array, cmap: ColormapTexture, alpha = 0.7): void {
    if (this.vertexCount === 0) return;
    const gl = this.gl;
    this.program.use();
    this.program.setMat3('u_proj', proj);
    this.program.setFloat('u_alpha', alpha);

    cmap.bind(0);
    this.program.setInt('u_cmapTex', 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.lineWidth(1.5);
    gl.bindVertexArray(this.vao);

    // Draw each streamline as a separate GL_LINE_STRIP
    for (let i = 0; i < this.lineCounts.length; i++) {
      if (this.lineCounts[i] > 1) {
        gl.drawArrays(gl.LINE_STRIP, this.lineOffsets[i], this.lineCounts[i]);
      }
    }

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  destroy(): void {
    this.program.destroy();
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteVertexArray(this.vao);
  }
}
