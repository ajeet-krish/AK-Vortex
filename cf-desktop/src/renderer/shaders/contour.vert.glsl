#version 300 es
in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;
uniform mat3 u_proj;
void main() {
    v_uv = a_uv;
    vec3 pos = u_proj * vec3(a_position, 1.0);
    gl_Position = vec4(pos.xy, 0.0, 1.0);
}
