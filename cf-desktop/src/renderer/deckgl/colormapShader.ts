/**
 * GLSL snippet for analytic colormaps (jet, coolwarm, RdBu).
 * Embedded into custom deck.gl layer fragment shaders via template literal.
 *
 * Colormaps match the existing custom WebGL renderer (contour.frag.glsl)
 * and the Python postprocess.py convention.
 */

export const colormapFragmentShader = `
// Analytic jet colormap: blue -> cyan -> green -> yellow -> red
vec3 jet(float t) {
    return clamp(vec3(
        1.5 - abs(4.0 * t - 3.0),
        1.5 - abs(4.0 * t - 2.0),
        1.5 - abs(4.0 * t - 1.0)
    ), 0.0, 1.0);
}

// Analytic coolwarm colormap
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
`;
