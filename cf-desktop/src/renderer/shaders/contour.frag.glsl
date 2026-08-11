#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_fieldTex;
uniform float u_min;
uniform float u_max;
uniform vec2 u_gridSize;
uniform int u_cmapType; // 0=jet, 1=coolwarm, 2=rdbu

// Analytic jet colormap: blue -> cyan -> green -> yellow -> red
vec3 jet(float t) {
    return clamp(vec3(
        1.5 - abs(4.0 * t - 3.0),
        1.5 - abs(4.0 * t - 2.0),
        1.5 - abs(4.0 * t - 1.0)
    ), 0.0, 1.0);
}

// Analytic coolwarm colormap: cool blue -> neutral white -> warm red
vec3 coolwarm(float t) {
    vec3 cool = vec3(0.231, 0.298, 0.753);
    vec3 warm = vec3(0.706, 0.016, 0.150);
    vec3 white = vec3(1.0);
    if (t < 0.5) {
        return mix(cool, white, t * 2.0);
    } else {
        return mix(white, warm, (t - 0.5) * 2.0);
    }
}

// Analytic RdBu colormap (red-white-blue diverging)
vec3 rdbu(float t) {
    vec3 red = vec3(0.698, 0.031, 0.149);
    vec3 white = vec3(1.0);
    vec3 blue = vec3(0.031, 0.239, 0.557);
    if (t < 0.5) {
        return mix(red, white, t * 2.0);
    } else {
        return mix(white, blue, (t - 0.5) * 2.0);
    }
}

void main() {
    vec2 cellSize = 1.0 / u_gridSize;
    // Flip Y to match projection matrix (Y-flip in Viewport.getProjectionMatrix)
    vec2 cell = (floor(vec2(v_uv.x, 1.0 - v_uv.y) * u_gridSize) + 0.5) * cellSize;
    float val = texture(u_fieldTex, cell).r;
    float range = u_max - u_min;
    float t = clamp((val - u_min) / max(range, 1e-10), 0.0, 1.0);

    vec3 color;
    if (u_cmapType == 0) color = jet(t);
    else if (u_cmapType == 1) color = coolwarm(t);
    else color = rdbu(t);

    fragColor = vec4(color, 1.0);
}
