import { useRef, useEffect } from 'react';
import { sampleColormap } from '../utils/colormap';

interface ColorScaleBarProps {
    min: number;
    max: number;
    cmap: string;
    width?: number;
    height?: number;
}

export default function ColorScaleBar({
    min,
    max,
    cmap,
    width = 24,
    height = 200,
}: ColorScaleBarProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw gradient bar (top = max, bottom = min)
        for (let py = 0; py < height; py++) {
            const t = 1 - py / (height - 1); // t=1 at top, t=0 at bottom
            const [r, g, b] = sampleColormap(cmap, t);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(0, py, width, 1);
        }

        // Border
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, width, height);
    }, [min, max, cmap, width, height]);

    const formatVal = (val: number) => {
        if (Math.abs(val) < 0.001 && val !== 0) return val.toExponential(1);
        if (Math.abs(val) >= 1000) return val.toExponential(1);
        return val.toFixed(3);
    };

    return (
        <div className="color-scale-bar">
            <span className="scale-label scale-max">{formatVal(max)}</span>
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{ display: 'block' }}
            />
            <span className="scale-label scale-min">{formatVal(min)}</span>
        </div>
    );
}
