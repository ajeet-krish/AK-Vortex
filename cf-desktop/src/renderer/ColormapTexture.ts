export type ColormapName = 'jet' | 'coolwarm' | 'rdbu' | 'viridis';

function generateJet(n: number): Uint8Array {
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const idx = i * 4;
    // Jet colormap: blue -> cyan -> green -> yellow -> red
    if (t < 0.25) {
      data[idx] = 0;
      data[idx + 1] = Math.round(255 * (t / 0.25));
      data[idx + 2] = 255;
    } else if (t < 0.5) {
      data[idx] = 0;
      data[idx + 1] = 255;
      data[idx + 2] = Math.round(255 * (1 - (t - 0.25) / 0.25));
    } else if (t < 0.75) {
      data[idx] = Math.round(255 * ((t - 0.5) / 0.25));
      data[idx + 1] = 255;
      data[idx + 2] = 0;
    } else {
      data[idx] = 255;
      data[idx + 1] = Math.round(255 * (1 - (t - 0.75) / 0.25));
      data[idx + 2] = 0;
    }
    data[idx + 3] = 255;
  }
  return data;
}

function generateCoolwarm(n: number): Uint8Array {
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const idx = i * 4;
    // Cool (blue) -> neutral (white) -> warm (red)
    if (t < 0.5) {
      const s = t / 0.5;
      data[idx] = Math.round(59 + (255 - 59) * s);
      data[idx + 1] = Math.round(76 + (255 - 76) * s);
      data[idx + 2] = Math.round(192 + (255 - 192) * s);
    } else {
      const s = (t - 0.5) / 0.5;
      data[idx] = 255;
      data[idx + 1] = Math.round(255 * (1 - 0.7 * s));
      data[idx + 2] = Math.round(255 * (1 - 0.85 * s));
    }
    data[idx + 3] = 255;
  }
  return data;
}

function generateRdBu(n: number): Uint8Array {
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const idx = i * 4;
    // Red -> White -> Blue (diverging)
    if (t < 0.5) {
      const s = t / 0.5;
      data[idx] = Math.round(180 - 180 * s + 255 * s);
      data[idx + 1] = Math.round(4 + 251 * s);
      data[idx + 2] = Math.round(38 + 217 * s);
    } else {
      const s = (t - 0.5) / 0.5;
      data[idx] = Math.round(255 * (1 - 0.8 * s));
      data[idx + 1] = Math.round(255 * (1 - 0.55 * s));
      data[idx + 2] = 255;
    }
    data[idx + 3] = 255;
  }
  return data;
}

function generateViridis(n: number): Uint8Array {
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const idx = i * 4;
    // Viridis approximation: purple -> blue -> teal -> green -> yellow
    if (t < 0.25) {
      const s = t / 0.25;
      data[idx] = Math.round(68 + (13 - 68) * s);
      data[idx + 1] = Math.round(1 + (55 - 1) * s);
      data[idx + 2] = Math.round(84 + (142 - 84) * s);
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      data[idx] = Math.round(13 + (42 - 13) * s);
      data[idx + 1] = Math.round(55 + (130 - 55) * s);
      data[idx + 2] = Math.round(142 + (140 - 142) * s);
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      data[idx] = Math.round(42 + (180 - 42) * s);
      data[idx + 1] = Math.round(130 + (200 - 130) * s);
      data[idx + 2] = Math.round(140 + (60 - 140) * s);
    } else {
      const s = (t - 0.75) / 0.25;
      data[idx] = Math.round(180 + (253 - 180) * s);
      data[idx + 1] = Math.round(200 + (231 - 200) * s);
      data[idx + 2] = Math.round(60 + (37 - 60) * s);
    }
    data[idx + 3] = 255;
  }
  return data;
}

export class ColormapTexture {
  private gl: WebGL2RenderingContext;
  private texture: WebGLTexture;
  private currentColormap: ColormapName = 'jet';

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.texture = gl.createTexture()!;
    this.upload('jet');
  }

  upload(name: ColormapName): void {
    if (name === this.currentColormap && this.texture) return;
    this.currentColormap = name;

    const n = 256;
    let data: Uint8Array;
    switch (name) {
      case 'coolwarm': data = generateCoolwarm(n); break;
      case 'rdbu': data = generateRdBu(n); break;
      case 'viridis': data = generateViridis(n); break;
      default: data = generateJet(n); break;
    }

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  bind(unit: number): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
  }

  destroy(): void {
    this.gl.deleteTexture(this.texture);
  }
}
