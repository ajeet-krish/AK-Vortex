import { ShaderProgram } from '../ShaderProgram';
import vertSrc from '../shaders/contour.vert.glsl';
import fragSrc from '../shaders/contour.frag.glsl';

/**
 * Renders the flow field contour using a TEXTURE_2D_ARRAY managed by FrameCache.
 * The array texture is bound externally before render() is called.
 * Per-frame texImage2D uploads are eliminated -- frame selection is a uniform index.
 */
export class ContourPass {
  private gl: WebGL2RenderingContext;
  private program: ShaderProgram;
  private vao: WebGLVertexArrayObject;
  private quadVBO: WebGLBuffer;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = new ShaderProgram(gl, vertSrc, fragSrc);
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

  /**
   * Render the contour. The array texture must be bound to TEXTURE0 by the caller
   * (FrameCache.bind(0)) before calling this method.
   */
  render(
    _proj: Float32Array,
    _cmapType: number,
    min: number,
    max: number,
    nx: number,
    ny: number,
    debugMode: number,
    frameIndex: number,
  ): void {
    const gl = this.gl;
    this.program.use();
    this.program.setFloat('u_min', min);
    this.program.setFloat('u_max', max);
    this.program.setVec2('u_gridSize', nx, ny);
    this.program.setInt('u_cmapType', _cmapType);
    this.program.setInt('u_frameIndex', frameIndex);
    this.program.setInt('u_debugMode', debugMode);

    // Texture is bound externally by FrameCache before render
    this.program.setInt('u_fieldTex', 0);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  destroy(): void {
    this.program.destroy();
    this.gl.deleteBuffer(this.quadVBO);
    this.gl.deleteVertexArray(this.vao);
  }
}
