import type { ShaderProgram } from './ShaderProgram';

/**
 * Manages a WebGL2 TEXTURE_2D_ARRAY that holds all simulation frames
 * pre-uploaded on the GPU. Frame selection is done via a uniform index,
 * eliminating per-frame texImage2D uploads (the main bottleneck at ~8.3MB/frame).
 *
 * Texture layout: layers = [frame0_u, frame0_v, frame0_p, frame0_omega, frame0_obs,
 *                           frame1_u, frame1_v, ...]
 */
export class FrameCache {
  private gl: WebGL2RenderingContext;
  private texture: WebGLTexture | null = null;
  private _frameCount = 0;
  private _nx = 0;
  private _ny = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /**
   * Upload all frames as a single TEXTURE_2D_ARRAY.
   *
   * @param layers - Interleaved Float32Array: [u0, v0, p0, omega0, obs0, u1, ...]
   * @param nx - Grid width
   * @param ny - Grid height
   * @param nFrames - Number of frames
   * @param nChannels - Channels per frame (5)
   */
  uploadAll(
    layers: Float32Array,
    nx: number,
    ny: number,
    nFrames: number,
    nChannels: number,
  ): void {
    const gl = this.gl;

    // Validate GPU resource limits before upload
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);

    if (nx > maxTextureSize || ny > maxTextureSize) {
      throw new Error(`Texture dimensions ${nx}x${ny} exceed MAX_TEXTURE_SIZE ${maxTextureSize}`);
    }

    const totalLayers = nFrames * nChannels;
    if (totalLayers > maxLayers) {
      throw new Error(`Total layers ${totalLayers} exceed MAX_ARRAY_TEXTURE_LAYERS ${maxLayers}`);
    }

    // Estimate GPU memory usage
    const memMB = (nx * ny * totalLayers * 4) / (1024 * 1024);
    if (memMB > 2048) {
      throw new Error(`GPU memory estimate ${memMB.toFixed(0)} MB exceeds 2 GB limit`);
    }

    // Clean up previous texture if re-uploading
    if (this.texture) {
      gl.deleteTexture(this.texture);
    }

    this.texture = gl.createTexture();
    this._nx = nx;
    this._ny = ny;
    this._frameCount = nFrames;

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);

    // Disable UNPACK_FLIP_Y for array textures to avoid per-layer flipping issues.
    // The fragment shader handles Y-flip consistently via (1.0 - v_uv.y).
    const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.R32F,
      nx,
      ny,
      totalLayers,
      0,
      gl.RED,
      gl.FLOAT,
      layers,
    );

    // Restore previous flip state (ObstaclePass and ColormapTexture rely on it)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip);

    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const uploadMemMB = (layers.byteLength / (1024 * 1024)).toFixed(1);
    console.log(
      `[FrameCache] Uploaded ${nFrames} frames (${nx}x${ny}x${totalLayers} layers, ${uploadMemMB} MB)`
    );

    // Check for GL errors after texture upload and invalidate state on failure
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
      console.error(
        `[FrameCache] GL error after texImage3D: 0x${err.toString(16)}`
      );
      gl.deleteTexture(this.texture);
      this.texture = null;
      this._frameCount = 0;
      throw new Error(`GPU texture upload failed: GL error 0x${err.toString(16)}`);
    }
  }

  /** Bind the array texture to the given texture unit. */
  bind(unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
  }

  /** Set the frame index uniform on the contour shader program. */
  setFrame(program: ShaderProgram, frameIndex: number): void {
    program.setInt('u_frameIndex', frameIndex);
  }

  /** Returns true if frames have been uploaded and the texture is ready. */
  isReady(): boolean {
    return this.texture !== null && this._frameCount > 0;
  }

  get frameCount(): number {
    return this._frameCount;
  }

  get nx(): number {
    return this._nx;
  }

  get ny(): number {
    return this._ny;
  }

  destroy(): void {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
      this.texture = null;
    }
    this._frameCount = 0;
  }
}
