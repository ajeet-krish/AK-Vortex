// WebGL context health monitoring and diagnostic utilities.
// Tracks context loss, extension availability, and GL errors.

export interface GLHealthReport {
  contextLost: boolean;
  extensions: { colorBufferFloat: boolean; floatTextureLinear: boolean };
  maxTextureSize: number;
  renderer: string;
  version: string;
  errors: string[];
}

export class GLDiagnostics {
  private gl: WebGL2RenderingContext;
  private contextLost = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /**
   * Query full GL state: extensions, limits, renderer info.
   */
  checkHealth(): GLHealthReport {
    const gl = this.gl;

    const colorBufferFloat =
      gl.getExtension("EXT_color_buffer_float") !== null;
    const floatTextureLinear =
      gl.getExtension("OES_texture_float_linear") !== null;

    return {
      contextLost: this.contextLost,
      extensions: { colorBufferFloat, floatTextureLinear },
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      renderer: gl.getParameter(gl.RENDERER) as string,
      version: gl.getParameter(gl.VERSION) as string,
      errors: [],
    };
  }

  /**
   * Log a full health report to the console.
   */
  logHealth(): void {
    const report = this.checkHealth();
    console.log("[GLDiagnostics] WebGL Health Report:");
    console.log(`  Renderer: ${report.renderer}`);
    console.log(`  Version: ${report.version}`);
    console.log(`  Max texture size: ${report.maxTextureSize}`);
    console.log(`  EXT_color_buffer_float: ${report.extensions.colorBufferFloat}`);
    console.log(`  OES_texture_float_linear: ${report.extensions.floatTextureLinear}`);
    console.log(`  Context lost: ${report.contextLost}`);
    if (report.errors.length > 0) {
      for (const e of report.errors) {
        console.error(`[GLDiagnostics] ${e}`);
      }
    }
  }

  /**
   * Register webglcontextlost/restored event listeners on the canvas.
   */
  startContextLossMonitor(): void {
    const canvas = this.gl.canvas as HTMLCanvasElement;

    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.contextLost = true;
      console.error("[GLDiagnostics] WebGL context LOST");
    });

    canvas.addEventListener("webglcontextrestored", () => {
      this.contextLost = false;
      console.log("[GLDiagnostics] WebGL context restored");
    });
  }

  /**
   * Check for pending GL errors and log them.
   * Returns true if no error (clean), false if an error was found.
   */
  checkGLError(label: string): boolean {
    const gl = this.gl;
    const err = gl.getError();
    if (err === gl.NO_ERROR) {
      return true;
    }

    const hex = `0x${err.toString(16)}`;
    let name = "UNKNOWN";
    if (err === gl.INVALID_ENUM) name = "INVALID_ENUM";
    else if (err === gl.INVALID_VALUE) name = "INVALID_VALUE";
    else if (err === gl.INVALID_OPERATION) name = "INVALID_OPERATION";
    else if (err === gl.OUT_OF_MEMORY) name = "OUT_OF_MEMORY";
    else if (err === gl.INVALID_FRAMEBUFFER_OPERATION) name = "INVALID_FRAMEBUFFER_OPERATION";

    console.error(`[GLDiagnostics] GL error at '${label}': ${name} (${hex})`);
    return false;
  }
}
