import { ShaderProgram } from '../ShaderProgram';
import vertSrc from '../shaders/mesh.vert.glsl';
import fragSrc from '../shaders/mesh.frag.glsl';

export class MeshPass {
  private gl: WebGL2RenderingContext;
  private program: ShaderProgram;
  private vao: WebGLVertexArrayObject;
  private lineVBO: WebGLBuffer;
  private lineCount = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = new ShaderProgram(gl, vertSrc, fragSrc);
    this.lineVBO = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVBO);
    const posLoc = this.program.getAttrib('a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
  }

  updateGrid(nx: number, ny: number, zoom: number): void {
    // Adaptive density: show more cells when zoomed in
    const step = Math.max(1, Math.floor(8 / zoom));
    const lines: number[] = [];

    // Vertical lines
    for (let x = 0; x <= nx; x += step) {
      lines.push(x, 0, x, ny);
    }
    // Horizontal lines
    for (let y = 0; y <= ny; y += step) {
      lines.push(0, y, nx, y);
    }

    this.lineCount = lines.length / 2;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
  }

  render(proj: Float32Array, zoom: number): void {
    if (this.lineCount === 0) return;
    const gl = this.gl;
    this.program.use();
    this.program.setMat3('u_proj', proj);
    this.program.setFloat('u_opacity', Math.min(1.0, 0.3 + zoom * 0.1));

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.LINES, 0, this.lineCount);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  destroy(): void {
    this.program.destroy();
    this.gl.deleteBuffer(this.lineVBO);
    this.gl.deleteVertexArray(this.vao);
  }
}
