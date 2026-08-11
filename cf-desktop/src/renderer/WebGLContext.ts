export interface GLContext {
  gl: WebGL2RenderingContext;
  maxTextureSize: number;
}

export function createGLContext(canvas: HTMLCanvasElement): GLContext {
  console.log('[WebGL] Creating context...');

  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  }) as WebGL2RenderingContext;

  if (!gl) {
    console.error('[WebGL] WebGL 2.0 not available');
    throw new Error('WebGL 2.0 not supported');
  }

  console.log('[WebGL] Context created successfully');
  console.log('[WebGL] Renderer:', gl.getParameter(gl.RENDERER));
  console.log('[WebGL] Version:', gl.getParameter(gl.VERSION));

  // Enable float textures
  const ext = gl.getExtension('EXT_color_buffer_float');
  if (!ext) {
    console.warn('[WebGL] EXT_color_buffer_float not available, float render targets may not work');
  }

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  return {
    gl,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
}
