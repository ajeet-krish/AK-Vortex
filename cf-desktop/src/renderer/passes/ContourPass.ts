import { ShaderProgram } from '../ShaderProgram';
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

    // Check for GL errors after texture upload
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
      console.error(
        `[ContourPass] GL error after texImage2D: 0x${err.toString(16)} for ${nx}x${ny} texture`
      );
    }

    // Log data range for diagnostics
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (Number.isFinite(data[i])) {
        if (data[i] < min) min = data[i];
        if (data[i] > max) max = data[i];
      }
    }
    console.log(
      `[ContourPass] Uploaded ${nx}x${ny} texture, data range: [${min.toFixed(6)}, ${max.toFixed(6)}]`
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  render(
    _proj: Float32Array,
    _cmapType: number,
    min: number,
    max: number,
    nx: number,
    ny: number,
    debugMode = 0,
  ): void {
    const gl = this.gl;
    this.program.use();
    this.program.setFloat('u_min', min);
    this.program.setFloat('u_max', max);
    this.program.setVec2('u_gridSize', nx, ny);
    this.program.setInt('u_cmapType', _cmapType);
    this.program.setInt('u_debugMode', debugMode);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    this.program.setInt('u_fieldTex', 0);

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
