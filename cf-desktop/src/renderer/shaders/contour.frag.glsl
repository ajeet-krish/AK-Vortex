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
    vec2 cell = (floor(v_uv * u_gridSize) + 0.5) * cellSize;
    float val = texture(u_fieldTex, cell).r;
    float range = u_max - u_min;
    float t = clamp((val - u_min) / max(range, 1e-10), 0.0, 1.0);
    fragColor = texture(u_cmapTex, vec2(t, 0.5));
}
