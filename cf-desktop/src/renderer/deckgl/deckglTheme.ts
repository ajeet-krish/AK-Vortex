/**
 * deck.gl theme constants matching the CFD Jet dark theme.
 * Values are linear RGBA tuples (0-1 range) for GLSL compatibility.
 */
export const DECKGL_THEME = {
  /** Dark background matching the WebGL renderer clear color (0.08, 0.09, 0.12). */
  background: [0.08, 0.09, 0.12, 1.0] as [number, number, number, number],

  /** Semi-transparent obstacle fill (dark gray). */
  obstacleColor: [0.12, 0.12, 0.16, 0.8] as [number, number, number, number],

  /** Cyan obstacle border (matches the project's cyan accent). */
  obstacleBorderColor: [0.0, 1.0, 1.0, 0.6] as [number, number, number, number],
};
