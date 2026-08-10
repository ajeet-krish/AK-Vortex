#version 300 es
precision highp float;
in float v_speed;
out vec4 fragColor;
uniform sampler2D u_cmapTex;
uniform float u_alpha;
void main() {
    vec4 color = texture(u_cmapTex, vec2(v_speed, 0.5));
    fragColor = vec4(color.rgb, u_alpha);
}
