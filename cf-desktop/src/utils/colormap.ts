// Colormap utilities for CFD visualization.
// Jet (rainbow) for velocity/pressure, RdBu (diverging) for vorticity.

export type RGB = [number, number, number];

/**
 * Jet colormap: blue -> cyan -> green -> yellow -> red.
 * Input t clamped to [0, 1].
 */
export function jetColormap(t: number): RGB {
    t = Math.max(0, Math.min(1, t));
    let r: number, g: number, b: number;

    if (t < 0.125) {
        r = 0;
        g = 0;
        b = 0.5 + t * 4;
    } else if (t < 0.375) {
        r = 0;
        g = (t - 0.125) * 4;
        b = 1;
    } else if (t < 0.625) {
        r = (t - 0.375) * 4;
        g = 1;
        b = 1 - (t - 0.375) * 4;
    } else if (t < 0.875) {
        r = 1;
        g = 1 - (t - 0.625) * 4;
        b = 0;
    } else {
        r = 1 - (t - 0.875) * 4;
        g = 0;
        b = 0;
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * RdBu diverging colormap: blue -> white -> red.
 * Designed for signed fields like vorticity where 0 = white.
 * Input t clamped to [0, 1]; t=0 is blue (negative), t=0.5 is white (zero), t=1 is red (positive).
 */
export function rdbuColormap(t: number): RGB {
    t = Math.max(0, Math.min(1, t));
    let r: number, g: number, b: number;

    if (t < 0.5) {
        // Blue to white
        const s = t / 0.5;
        r = 0.3 + s * 0.7;
        g = 0.3 + s * 0.7;
        b = 1;
    } else {
        // White to red
        const s = (t - 0.5) / 0.5;
        r = 1;
        g = 1 - s * 0.7;
        b = 1 - s * 0.7;
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Sample a named colormap at normalized position t in [0, 1].
 */
export function sampleColormap(cmap: string, t: number): RGB {
    switch (cmap) {
        case 'rdbu':
            return rdbuColormap(t);
        case 'jet':
        default:
            return jetColormap(t);
    }
}
