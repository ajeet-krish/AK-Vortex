export interface GLContext {
  gl: WebGL2RenderingContext;
  maxTextureSize: number;
}

export function createGLContext(canvas: HTMLCanvasElement): GLContext {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
  }) as WebGL2RenderingContext;

  if (!gl) {
    throw new Error('WebGL 2.0 not supported');
  }

  // Enable float textures
  const ext = gl.getExtension('EXT_color_buffer_float');
  if (!ext) {
    console.warn('EXT_color_buffer_float not available, float render targets may not work');
  }

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  return {
    gl,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
}
