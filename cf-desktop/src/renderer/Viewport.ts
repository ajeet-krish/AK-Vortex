export interface ViewportState {
  centerX: number;
  centerY: number;
  zoom: number;
}

export class Viewport {
  private canvas: HTMLCanvasElement;
  private gridWidth: number;
  private gridHeight: number;
  private state: ViewportState;
  private isDragging = false;
  private lastMouse = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement, gridWidth: number, gridHeight: number) {
    this.canvas = canvas;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.state = { centerX: gridWidth / 2, centerY: gridHeight / 2, zoom: 1.0 };
    this.attachListeners();
  }

  getState(): ViewportState { return { ...this.state }; }
  setState(s: ViewportState) { this.state = { ...s }; }
  reset() { this.state = { centerX: this.gridWidth / 2, centerY: this.gridHeight / 2, zoom: 1.0 }; }

  getProjectionMatrix(): Float32Array {
    const { centerX, centerY, zoom } = this.state;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const halfW = (cw / 2) / zoom;
    const halfH = (ch / 2) / zoom;
    const left = centerX - halfW;
    const right = centerX + halfW;
    // Y-up: bottom of viewport = lower grid y, top = higher grid y
    const bottom = centerY - halfH;
    const top = centerY + halfH;

    // Orthographic projection (3x3 for 2D)
    return new Float32Array([
      2.0 / (right - left), 0, 0,
      0, 2.0 / (top - bottom), 0,
      -(right + left) / (right - left), -(top + bottom) / (top - bottom), 1,
    ]);
  }

  canvasToGrid(cx: number, cy: number): { gx: number; gy: number } {
    const { centerX, centerY, zoom } = this.state;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    return {
      gx: centerX + (cx - cw / 2) / zoom,
      // Y-up: canvas top (cy=0) maps to higher grid y (top of simulation)
      gy: centerY - (cy - ch / 2) / zoom,
    };
  }

  gridToCanvas(gx: number, gy: number): { cx: number; cy: number } {
    const { centerX, centerY, zoom } = this.state;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    return {
      cx: (gx - centerX) * zoom + cw / 2,
      // Y-up: higher grid y maps to above center (lower canvas y)
      cy: -(gy - centerY) * zoom + ch / 2,
    };
  }

  private attachListeners(): void {
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('mouseleave', this.handleMouseUp);
  }

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    this.state.zoom = Math.max(0.1, Math.min(100, this.state.zoom * factor));
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {  // left click
      this.isDragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.state.centerX -= dx / this.state.zoom;
    this.state.centerY -= dy / this.state.zoom;
    this.lastMouse = { x: e.clientX, y: e.clientY };
  };

  private handleMouseUp = () => {
    this.isDragging = false;
  };

  destroy(): void {
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('mouseleave', this.handleMouseUp);
  }
}
