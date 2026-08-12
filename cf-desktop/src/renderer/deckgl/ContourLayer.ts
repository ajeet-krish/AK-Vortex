/**
 * Custom deck.gl layer for CFD contour rendering.
 *
 * Renders a TEXTURE_2D_ARRAY (managed by FrameCache) with analytic colormaps
 * computed on the GPU. This replaces the custom WebGL ContourPass with a
 * deck.gl-compatible layer that can coexist with future QuiverArrowLayer and
 * ObstacleOverlayLayer layers.
 *
 * Uses raw WebGL2 calls via the deprecated `context.gl` path because our
 * FrameCache manages raw WebGLTexture handles (not luma.gl Texture wrappers).
 * This is the pragmatic bridge during the deck.gl migration -- later phases
 * can migrate to luma.gl's Device/Texture abstraction.
 */
import { Layer, type LayerContext, type UpdateParameters } from '@deck.gl/core';
import { colormapFragmentShader } from './colormapShader';

/* -------------------------------------------------------------- */
/*  Shaders                                                       */
/* -------------------------------------------------------------- */

const CONTOUR_VERTEX_SHADER = `#version 300 es
in vec2 positions;
in vec2 texCoords;
out vec2 v_texCoords;
void main() {
  v_texCoords = texCoords;
  gl_Position = vec4(positions, 0.0, 1.0);
}`;

const CONTOUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2DArray;

in vec2 v_texCoords;
out vec4 fragColor;

uniform sampler2DArray u_texture;
uniform int u_frameIndex;
uniform float u_min;
uniform float u_max;
uniform vec2 u_gridSize;
uniform int u_cmapType;
uniform int u_nChannels;

${colormapFragmentShader}

void main() {
  vec2 cellSize = 1.0 / u_gridSize;
  vec2 cell = (floor(v_texCoords * u_gridSize) + 0.5) * cellSize;

  // Sample channels from texture array
  int baseLayer = u_frameIndex * u_nChannels;
  float u_val = texture(u_texture, vec3(cell, float(baseLayer + 0))).r;
  float v_val = texture(u_texture, vec3(cell, float(baseLayer + 1))).r;
  float p_val = texture(u_texture, vec3(cell, float(baseLayer + 2))).r;
  float omega_val = texture(u_texture, vec3(cell, float(baseLayer + 3))).r;
  float obs_val = texture(u_texture, vec3(cell, float(baseLayer + 4))).r;

  // Velocity magnitude on GPU
  float velocity = sqrt(u_val * u_val + v_val * v_val);

  // Select field
  float val;
  if (u_cmapType == 0) val = velocity;
  else if (u_cmapType == 1) val = p_val;
  else val = omega_val;

  // NaN guard
  if (!isfinite(val)) val = 0.0;

  // Obstacle masking
  if (obs_val > 0.5) {
    fragColor = vec4(0.12, 0.12, 0.16, 1.0);
    return;
  }

  float range = u_max - u_min;
  float t = clamp((val - u_min) / max(range, 1e-10), 0.0, 1.0);

  vec3 color;
  if (u_cmapType == 0) color = jet(t);
  else if (u_cmapType == 1) color = coolwarm(t);
  else color = rdbu(t);

  fragColor = vec4(color, 1.0);
}`;

/* -------------------------------------------------------------- */
/*  Shader compilation helpers                                    */
/* -------------------------------------------------------------- */

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`ContourLayer shader compile error: ${info}`);
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vert: WebGLShader,
  frag: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`ContourLayer link error: ${info}`);
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

/* -------------------------------------------------------------- */
/*  Props                                                         */
/* -------------------------------------------------------------- */

export interface ContourLayerProps {
  /** TEXTURE_2D_ARRAY from FrameCache.uploadAll(). */
  texture: WebGLTexture | null;
  /** Active frame index within the array texture. */
  frameIndex: number;
  /** Colormap selector: 0=jet, 1=coolwarm, 2=rdbu. */
  cmapType: number;
  /** [min, max] value range for colormap normalization. */
  valueRange: [number, number];
  /** Grid dimensions [nx, ny] for texel computation. */
  gridSize: [number, number];
  /** Channels per frame (typically 5: u, v, p, omega, obstacle). */
  nChannels: number;
  /** World-space bounds [minX, minY, maxX, maxY]. */
  bounds: [number, number, number, number];
}

/* -------------------------------------------------------------- */
/*  Internal GPU state                                            */
/* -------------------------------------------------------------- */

interface GLState {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  uniformCache: Map<string, WebGLUniformLocation>;
}

/* -------------------------------------------------------------- */
/*  Layer                                                         */
/* -------------------------------------------------------------- */

export class ContourLayer extends Layer<ContourLayerProps> {
  static layerName = 'ContourLayer';

  private glState: GLState | null = null;

  initializeState(context: LayerContext): void {
    // Use the deprecated context.gl path -- our FrameCache manages raw WebGLTextures
    const gl = context.gl;

    // Compile and link shader program
    const vert = compileShader(gl, gl.VERTEX_SHADER, CONTOUR_VERTEX_SHADER);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, CONTOUR_FRAGMENT_SHADER);
    const program = linkProgram(gl, vert, frag);

    // Fullscreen quad: positions [x,y] + texCoords [u,v]
    const quadData = new Float32Array([
      -1, -1,  0, 0,
       1, -1,  1, 0,
      -1,  1,  0, 1,
       1,  1,  1, 1,
    ]);

    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'positions');
    const texLoc = gl.getAttribLocation(program, 'texCoords');

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);

    const glSt: GLState = {
      program,
      vao,
      vbo,
      uniformCache: new Map(),
    };
    this.setState({ glState: glSt });
    this.glState = glSt;
  }

  updateState(params: UpdateParameters<ContourLayer>): void {
    // Uniforms are set per-frame in draw() since they change frequently
    void params;
  }

  draw(): void {
    const glState = this.glState;
    if (!glState) return;

    const gl = (this.context as LayerContext).gl;
    const { texture, frameIndex, cmapType, valueRange, gridSize, nChannels } =
      this.props;

    if (!texture) return;

    gl.useProgram(glState.program);

    // Bind the TEXTURE_2D_ARRAY to texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);

    // Cache uniform locations
    const loc = (name: string): WebGLUniformLocation => {
      let cached = glState.uniformCache.get(name);
      if (cached === undefined) {
        cached = gl.getUniformLocation(glState.program, name)!;
        glState.uniformCache.set(name, cached);
      }
      return cached;
    };

    // Set uniforms
    gl.uniform1i(loc('u_texture'), 0);
    gl.uniform1i(loc('u_frameIndex'), frameIndex);
    gl.uniform1f(loc('u_min'), valueRange[0]);
    gl.uniform1f(loc('u_max'), valueRange[1]);
    gl.uniform2f(loc('u_gridSize'), gridSize[0], gridSize[1]);
    gl.uniform1i(loc('u_cmapType'), cmapType);
    gl.uniform1i(loc('u_nChannels'), nChannels);

    // Draw fullscreen quad
    gl.bindVertexArray(glState.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  getModels(): [] {
    // No luma.gl models -- we use raw WebGL2
    return [];
  }

  finalizeState(): void {
    const glState = this.glState;
    if (!glState) return;

    const gl = (this.context as LayerContext).gl;
    gl.deleteProgram(glState.program);
    gl.deleteVertexArray(glState.vao);
    gl.deleteBuffer(glState.vbo);
    this.glState = null;
  }
}
