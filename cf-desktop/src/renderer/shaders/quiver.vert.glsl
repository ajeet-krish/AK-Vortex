#version 300 es
// Arrow template vertex (per-vertex)
layout(location = 0) in vec2 a_vertex;
// Per-instance data
layout(location = 1) in vec2 a_position;
layout(location = 2) in vec2 a_dir;
layout(location = 3) in float a_speed;

uniform mat3 u_proj;
uniform float u_arrowLen;
uniform float u_vmax;
uniform vec2 u_gridSize;
out float v_speed;

void main() {
    // Rotate arrow to align with velocity direction
    float c = a_dir.x;
    float s = a_dir.y;
    mat2 rot = mat2(c, -s, s, c);
    float len = min(u_arrowLen, a_speed * u_arrowLen / max(u_vmax, 1e-6));
    vec2 scaled = a_vertex * vec2(len, len * 0.3);
    vec2 rotated = rot * scaled;
    // Transform grid coords to clip space via projection
    vec3 pos = u_proj * vec3(a_position + rotated, 1.0);
    gl_Position = vec4(pos.xy, 0.0, 1.0);
    v_speed = clamp(a_speed / max(u_vmax, 1e-6), 0.0, 1.0);
}
