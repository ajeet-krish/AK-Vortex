import { ShaderProgram } from '../ShaderProgram';
import type { ColormapTexture } from '../ColormapTexture';
import vertSrc from '../shaders/colorbar.vert.glsl';
import fragSrc from '../shaders/colorbar.frag.glsl';

export class ColorBarPass {
  private gl: WebGL2RenderingContext;
  private program: ShaderProgram;
  private vao: WebGLVertexArrayObject;
  private quadVBO: WebGLBuffer;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = new ShaderProgram(gl, vertSrc, fragSrc);
    this.quadVBO = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(null);
  }

  render(
    cmap: ColormapTexture,
    canvasWidth: number,
    canvasHeight: number,
    _min: number,
    _max: number,
  ): void {
    const gl = this.gl;

    // Color bar region: right side, 20px wide, 60% height, vertically centered
    const barW = 20;
    const barH = canvasHeight * 0.6;
    const barX = canvasWidth - 40;
    const barY = (canvasHeight - barH) / 2;

    // Convert pixel coords to clip space [-1, 1]
    const x0 = (barX / canvasWidth) * 2 - 1;
    const y0 = 1 - (barY / canvasHeight) * 2;
    const x1 = ((barX + barW) / canvasWidth) * 2 - 1;
    const y1 = 1 - ((barY + barH) / canvasHeight) * 2;

    const quadData = new Float32Array([
      x0, y0,  0, 0,
      x1, y0,  1, 0,
      x0, y1,  0, 1,
      x1, y1,  1, 1,
    ]);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.DYNAMIC_DRAW);

    const posLoc = this.program.getAttrib('a_position');
    const uvLoc = this.program.getAttrib('a_uv');
    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

    this.program.use();
    cmap.bind(0);
    this.program.setInt('u_cmapTex', 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);

    // Tick labels are rendered by the React ColorScaleBar component overlay
  }

  destroy(): void {
    this.program.destroy();
    this.gl.deleteBuffer(this.quadVBO);
    this.gl.deleteVertexArray(this.vao);
  }
}
