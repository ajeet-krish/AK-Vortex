#version 300 es
in vec2 a_position;
in float a_speed;
uniform mat3 u_proj;
out float v_speed;
void main() {
    v_speed = a_speed;
    vec3 pos = u_proj * vec3(a_position, 1.0);
    gl_Position = vec4(pos.xy, 0.0, 1.0);
}
