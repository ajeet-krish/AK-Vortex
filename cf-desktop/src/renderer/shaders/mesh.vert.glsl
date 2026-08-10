#version 300 es
in vec2 a_position;
uniform mat3 u_proj;
uniform float u_opacity;
out float v_opacity;
void main() {
    v_opacity = u_opacity;
    vec3 pos = u_proj * vec3(a_position, 1.0);
    gl_Position = vec4(pos.xy, 0.0, 1.0);
}
