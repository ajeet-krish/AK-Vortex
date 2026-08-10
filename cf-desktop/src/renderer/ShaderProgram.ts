export class ShaderProgram {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniformCache: Map<string, WebGLUniformLocation> = new Map();
  private attribCache: Map<string, number> = new Map();

  constructor(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string) {
    this.gl = gl;
    this.program = this.compile(vertSrc, fragSrc);
  }

  private compile(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const vert = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vert, vertSrc);
    gl.compileShader(vert);
    if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(vert);
      gl.deleteShader(vert);
      throw new Error(`Vertex shader compile error: ${info}`);
    }

    const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(frag, fragSrc);
    gl.compileShader(frag);
    if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(frag);
      gl.deleteShader(frag);
      gl.deleteShader(vert);
      throw new Error(`Fragment shader compile error: ${info}`);
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      gl.deleteShader(frag);
      gl.deleteShader(vert);
      throw new Error(`Shader link error: ${info}`);
    }

    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return program;
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  getUniform(name: string): WebGLUniformLocation {
    let loc = this.uniformCache.get(name);
    if (loc === undefined) {
      const raw = this.gl.getUniformLocation(this.program, name);
      if (raw === null) throw new Error(`Uniform '${name}' not found`);
      loc = raw;
      this.uniformCache.set(name, loc);
    }
    return loc;
  }

  getAttrib(name: string): number {
    let loc = this.attribCache.get(name);
    if (loc === undefined) {
      loc = this.gl.getAttribLocation(this.program, name);
      if (loc === -1) throw new Error(`Attribute '${name}' not found`);
      this.attribCache.set(name, loc);
    }
    return loc;
  }

  setFloat(name: string, value: number): void {
    this.gl.uniform1f(this.getUniform(name), value);
  }

  setInt(name: string, value: number): void {
    this.gl.uniform1i(this.getUniform(name), value);
  }

  setVec2(name: string, x: number, y: number): void {
    this.gl.uniform2f(this.getUniform(name), x, y);
  }

  setVec4(name: string, x: number, y: number, z: number, w: number): void {
    this.gl.uniform4f(this.getUniform(name), x, y, z, w);
  }

  setMat3(name: string, value: Float32Array): void {
    this.gl.uniformMatrix3fv(this.getUniform(name), false, value);
  }

  destroy(): void {
    this.gl.deleteProgram(this.program);
  }
}
