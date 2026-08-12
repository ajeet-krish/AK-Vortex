#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_obsTex;
uniform vec2 u_gridSize;
void main() {
    vec2 cellSize = 1.0 / u_gridSize;
    // Y-up convention: v_uv.y=0 maps to sim y=0 (bottom of domain).
    // Consistent with contour.frag.glsl -- no projection matrix flip
    // because the vertex shader outputs clip-space positions directly.
    vec2 cell = (floor(v_uv * u_gridSize) + 0.5) * cellSize;
    float obs = texture(u_obsTex, cell).r;
    if (obs < 0.5) discard;
    float obsL = texture(u_obsTex, cell + vec2(-cellSize.x, 0.0)).r;
    float obsR = texture(u_obsTex, cell + vec2( cellSize.x, 0.0)).r;
    float obsD = texture(u_obsTex, cell + vec2(0.0, -cellSize.y)).r;
    float obsU = texture(u_obsTex, cell + vec2(0.0,  cellSize.y)).r;
    bool isBoundary = (obsL < 0.5 || obsR < 0.5 || obsD < 0.5 || obsU < 0.5);
    fragColor = isBoundary ? vec4(0.3, 0.8, 1.0, 0.8) : vec4(0.15, 0.16, 0.2, 0.9);
}
