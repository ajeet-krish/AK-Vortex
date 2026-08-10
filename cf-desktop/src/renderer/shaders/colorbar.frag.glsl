#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_cmapTex;
void main() {
    fragColor = texture(u_cmapTex, vec2(v_uv.x, 0.5));
}
