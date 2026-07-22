/**
 * The far architectural wall. A large, near-black vertical volume standing deep
 * behind the stage — the thing that turns a flat black void into an
 * architectural room. It is NOT emissive: it's dark architecture that CATCHES a
 * faint light spilling from the recessed slots, plus faint large-scale ribs so
 * it reads as built structure. toneMapped so it lives in the same exposure as
 * everything else.
 *
 * CRUCIAL: it carries manual view-depth fog. A custom ShaderMaterial gets no
 * automatic scene fog, so without this the distant wall renders full-bright and
 * reads as a photographer's softbox. The fog makes it recede into the
 * background exactly like every fogged surface — that aerial perspective is the
 * depth cue and the softbox killer.
 */
export const WALL_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vFogDepth;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mv.z; // view-space distance in front of the camera
    gl_Position = projectionMatrix * mv;
  }
`;

export const WALL_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying float vFogDepth;
  uniform vec2 uSize;   // world width/height of the wall
  uniform vec3 uBase;   // near-black wall albedo
  uniform vec3 uBleed;  // cool white light spilling from the slots
  uniform vec3 uSlots;  // three slot x-positions (world, wall-centred)
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  void main() {
    vec2 wp = (vUv - 0.5) * uSize; // offset from wall centre, world units

    vec3 col = uBase;

    // Faint large-scale vertical ribs — architectural cadence, barely there.
    float rib = 0.5 + 0.5 * cos(wp.x * 0.7);
    col += vec3(0.008) * smoothstep(0.5, 1.0, rib);

    // TIGHT per-slot bleed so the three read as discrete recessed light-jambs,
    // never one merged softbox glow.
    float bleed = 0.0;
    bleed += exp(-pow(wp.x - uSlots.x, 2.0) * 0.9);
    bleed += exp(-pow(wp.x - uSlots.y, 2.0) * 0.9);
    bleed += exp(-pow(wp.x - uSlots.z, 2.0) * 0.9);
    bleed = clamp(bleed, 0.0, 1.6);

    // Anchor the faint spill LOW (toward the slots' mid-height / floor), not the
    // middle of the wall — light pools down the jambs, it doesn't float.
    float vfall = exp(-pow(wp.y + 1.3, 2.0) * 0.06);

    col += uBleed * bleed * vfall * 0.07;

    // View-depth fog: recede into the background like everything else.
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;
