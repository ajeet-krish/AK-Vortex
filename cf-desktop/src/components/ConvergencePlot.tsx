import { useRef, useEffect } from 'react';

interface ConvergencePlotProps {
  residuals: number[];
  threshold: number;
  width?: number;
  height?: number;
}

export default function ConvergencePlot({
  residuals,
  threshold,
  width = 220,
  height = 120,
}: ConvergencePlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#2d2d30';
    ctx.fillRect(0, 0, width, height);

    if (residuals.length < 2) {
      ctx.fillStyle = '#858585';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for data...', width / 2, height / 2);
      return;
    }

    const padding = { top: 10, right: 10, bottom: 20, left: 40 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const validResiduals = residuals.filter((r) => r > 0 && isFinite(r));
    if (validResiduals.length < 2) return;

    const logMin = Math.floor(Math.log10(Math.min(...validResiduals)));
    const logMax = Math.ceil(Math.log10(Math.max(...validResiduals)));
    const logRange = logMax - logMin || 1;

    const xScale = plotW / (validResiduals.length - 1);
    const yScale = plotH / logRange;

    ctx.strokeStyle = '#3c3c3c';
    ctx.lineWidth = 0.5;
    for (let d = logMin; d <= logMax; d++) {
      const y = padding.top + plotH - (d - logMin) * yScale;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotW, y);
      ctx.stroke();

      ctx.fillStyle = '#858585';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`1e${d}`, padding.left - 4, y + 3);
    }

    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < validResiduals.length; i++) {
      const x = padding.left + i * xScale;
      const logVal = Math.log10(validResiduals[i]);
      const y = padding.top + plotH - (logVal - logMin) * yScale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (threshold > 0 && isFinite(threshold)) {
      const logThreshold = Math.log10(threshold);
      const y = padding.top + plotH - (logThreshold - logMin) * yScale;
      ctx.strokeStyle = '#f44336';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f44336';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`1e${logThreshold.toFixed(0)}`, padding.left + plotW + 2, y + 3);
    }

    ctx.fillStyle = '#858585';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Iteration', padding.left + plotW / 2, height - 2);
  }, [residuals, threshold, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${height}px`, display: 'block' }}
    />
  );
}
