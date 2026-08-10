#version 300 es
precision highp float;
in float v_opacity;
out vec4 fragColor;
uniform vec4 u_gridColor;
void main() {
    fragColor = vec4(u_gridColor.rgb, u_gridColor.a * v_opacity);
}
