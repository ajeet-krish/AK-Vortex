import { ShaderProgram } from '../ShaderProgram';
import vertSrc from '../shaders/contour.vert.glsl';
import fragSrc from '../shaders/obstacle.frag.glsl';

export class ObstaclePass {
  private gl: WebGL2RenderingContext;
  private program: ShaderProgram;
  private vao: WebGLVertexArrayObject;
  private obsTexture: WebGLTexture;
  private quadVBO: WebGLBuffer;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = new ShaderProgram(gl, vertSrc, fragSrc);
    this.obsTexture = gl.createTexture()!;
    this.quadVBO = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;

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

  uploadObstacle(data: Float32Array, nx: number, ny: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.obsTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, nx, ny, 0, gl.RED, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  render(_proj: Float32Array, nx: number, ny: number): void {
    const gl = this.gl;
    this.program.use();
    this.program.setVec2('u_gridSize', nx, ny);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.obsTexture);
    this.program.setInt('u_obsTex', 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  destroy(): void {
    this.program.destroy();
    this.gl.deleteTexture(this.obsTexture);
    this.gl.deleteBuffer(this.quadVBO);
    this.gl.deleteVertexArray(this.vao);
  }
}
