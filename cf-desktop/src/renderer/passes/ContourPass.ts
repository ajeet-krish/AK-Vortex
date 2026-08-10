import { ShaderProgram } from '../ShaderProgram';
import type { ColormapTexture } from '../ColormapTexture';
import vertSrc from '../shaders/contour.vert.glsl';
import fragSrc from '../shaders/contour.frag.glsl';

export class ContourPass {
  private gl: WebGL2RenderingContext;
  private program: ShaderProgram;
  private vao: WebGLVertexArrayObject;
  private fieldTexture: WebGLTexture;
  private quadVBO: WebGLBuffer;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = new ShaderProgram(gl, vertSrc, fragSrc);
    this.fieldTexture = gl.createTexture()!;
    this.quadVBO = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;

    // Fullscreen quad: positions + UVs
    const quadData = new Float32Array([
      -1, -1,  0, 0,
       1, -1,  1, 0,
      -1,  1,  0, 1,
       1,  1,  1, 1,
    ]);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);

    const posLoc = this.program.getAttrib('a_position');
    const uvLoc = this.program.getAttrib('a_uv');
    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
  }

  uploadField(data: Float32Array, nx: number, ny: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, nx, ny, 0, gl.RED, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  render(
    proj: Float32Array,
    cmap: ColormapTexture,
    min: number,
    max: number,
    nx: number,
    ny: number,
  ): void {
    const gl = this.gl;
    this.program.use();
    this.program.setMat3('u_proj', proj);
    this.program.setFloat('u_min', min);
    this.program.setFloat('u_max', max);
    this.program.setVec2('u_gridSize', nx, ny);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    this.program.setInt('u_fieldTex', 0);

    cmap.bind(1);
    this.program.setInt('u_cmapTex', 1);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  destroy(): void {
    this.program.destroy();
    this.gl.deleteTexture(this.fieldTexture);
    this.gl.deleteBuffer(this.quadVBO);
    this.gl.deleteVertexArray(this.vao);
  }
}
