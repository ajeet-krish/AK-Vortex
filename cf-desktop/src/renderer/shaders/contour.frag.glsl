#version 300 es
precision highp float;
precision highp sampler2DArray;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2DArray u_fieldTex;
uniform int u_frameIndex;
uniform float u_min;
uniform float u_max;
uniform vec2 u_gridSize;
uniform int u_cmapType; // 0=jet, 1=coolwarm, 2=rdbu
uniform int u_debugMode; // 0=normal, 1=raw data, 2=normalized t

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

// Analytic RdBu colormap (blue-white-red diverging)
// t=0: blue (negative), t=1: red (positive)
vec3 rdbu(float t) {
    vec3 blue = vec3(0.031, 0.239, 0.557);
    vec3 white = vec3(1.0);
    vec3 red = vec3(0.698, 0.031, 0.149);
    if (t < 0.5) {
        return mix(blue, white, t * 2.0);
    } else {
        return mix(white, red, (t - 0.5) * 2.0);
    }
}

void main() {
    vec2 cellSize = 1.0 / u_gridSize;
    // Flip Y so that v_uv.y=0 (screen bottom) maps to the LAST data row
    // (top of the solver domain, which is stored first in the binary frame).
    // This matches Python's imshow(origin='lower') convention.
    vec2 cell = (floor(vec2(v_uv.x, 1.0 - v_uv.y) * u_gridSize) + 0.5) * cellSize;

    // Sample all channels from the array texture
    // Channel offsets: u=0, v=1, p=2, omega=3, obstacle=4
    // Channel stride: 5 (u, v, p, omega, obstacle) - must match C++ nChannels
    int baseLayer = u_frameIndex * 5;
    float u_val = texture(u_fieldTex, vec3(cell, float(baseLayer + 0))).r;
    float v_val = texture(u_fieldTex, vec3(cell, float(baseLayer + 1))).r;
    float p_val = texture(u_fieldTex, vec3(cell, float(baseLayer + 2))).r;
    float omega_val = texture(u_fieldTex, vec3(cell, float(baseLayer + 3))).r;
    float obs_val = texture(u_fieldTex, vec3(cell, float(baseLayer + 4))).r;

    // Obstacle masking (check before field selection)
    if (obs_val > 0.5) {
        fragColor = vec4(0.12, 0.12, 0.16, 1.0);
        return;
    }

    // Velocity magnitude computed on GPU (replaces CPU loop)
    float velocity = sqrt(u_val * u_val + v_val * v_val);

    // Select field based on u_cmapType
    float val;
    if (u_cmapType == 0) val = velocity;
    else if (u_cmapType == 1) val = p_val;
    else val = omega_val;

    // NaN/Inf guard (replaces CPU sanitization loop)
    if (!isfinite(val)) val = 0.0;

    float range = u_max - u_min;
    float t = clamp((val - u_min) / max(range, 1e-10), 0.0, 1.0);

    // Debug visualization modes
    if (u_debugMode == 1) {
      // Raw data as grayscale (scaled to visible range)
      fragColor = vec4(vec3(clamp(val * 10.0, 0.0, 1.0)), 1.0);
      return;
    }
    if (u_debugMode == 2) {
      // Normalized t as grayscale
      fragColor = vec4(vec3(t), 1.0);
      return;
    }

    vec3 color;
    if (u_cmapType == 0) color = jet(t);
    else if (u_cmapType == 1) color = coolwarm(t);
    else color = rdbu(t);

    fragColor = vec4(color, 1.0);
}
