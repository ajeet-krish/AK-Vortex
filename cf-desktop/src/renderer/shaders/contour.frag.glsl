#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_fieldTex;
uniform sampler2D u_cmapTex;
uniform float u_min;
uniform float u_max;
uniform vec2 u_gridSize;
void main() {
    vec2 cellSize = 1.0 / u_gridSize;
    // Flip Y to match projection matrix (Y-flip in Viewport.getProjectionMatrix)
    // UV y=0 is screen bottom (y=0 in field), but texture row 0 is at bottom
    // The projection maps grid y=0 to screen top, so we need to flip UV y
    vec2 cell = (floor(vec2(v_uv.x, 1.0 - v_uv.y) * u_gridSize) + 0.5) * cellSize;
    float val = texture(u_fieldTex, cell).r;
    float range = u_max - u_min;
    float t = clamp((val - u_min) / max(range, 1e-10), 0.0, 1.0);
    fragColor = texture(u_cmapTex, vec2(t, 0.5));
}
