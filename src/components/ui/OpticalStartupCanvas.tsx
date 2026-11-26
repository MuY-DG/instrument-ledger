import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { GrainMeshId } from "@/lib/accountBackgrounds";

export type OnboardingPhase = "intro" | "welcome" | "setup" | "complete";

export interface OpticalStartupHandle {
  /** Replay the full 1:1 Netflix ribbon draw -> 3D Spectra fly-through -> Silk reveal */
  replay: () => void;
}

export interface OpticalStartupCanvasProps {
  /** Lifecycle phase of the onboarding flow */
  phase: OnboardingPhase;
  /** Active grainy-mesh palette ID ("1" .. "12"), defaults to "1" (霓虹粉紫) */
  paletteId?: GrainMeshId;
  /** Optional counter to force a fresh opening sequence */
  playKey?: number;
  /** Optional foreground element revealed as the Spectra ribbons part past the camera */
  revealTargetRef?: React.RefObject<HTMLElement | null>;
}

interface MeshPaletteSpec {
  l: [number, number, number];
  a: [number, number, number];
  b: [number, number, number];
  p: [number, number, number];
  p1: [number, number];
  p2: [number, number];
  p3: [number, number];
}

function hexToNormRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Exact 1:1 definitions of all 12 `[data-av]` grainy-mesh palettes from `src/index.css`
 */
const MESH_PALETTES: Record<GrainMeshId, MeshPaletteSpec> = {
  "1": {
    l: hexToNormRgb("#ff8fd0"),
    a: hexToNormRgb("#ff3fa6"),
    b: hexToNormRgb("#6a35ff"),
    p: hexToNormRgb("#ffd3ec"),
    p1: [0.12, 0.1],
    p2: [0.92, 0.08],
    p3: [0.88, 0.96],
  },
  "2": {
    l: hexToNormRgb("#7fe3ff"),
    a: hexToNormRgb("#2b8cff"),
    b: hexToNormRgb("#5a35ff"),
    p: hexToNormRgb("#cdf3ff"),
    p1: [1.029, 0.656],
    p2: [0.346, 1.074],
    p3: [-0.059, 0.292],
  },
  "3": {
    l: hexToNormRgb("#d6ff5a"),
    a: hexToNormRgb("#22d39a"),
    b: hexToNormRgb("#0a8a8f"),
    p: hexToNormRgb("#efffb0"),
    p1: [0.656, -0.029],
    p2: [1.074, 0.654],
    p3: [0.292, 1.059],
  },
  "4": {
    l: hexToNormRgb("#ffb866"),
    a: hexToNormRgb("#ff4a5e"),
    b: hexToNormRgb("#c31f86"),
    p: hexToNormRgb("#ffe0b8"),
    p1: [0.344, 1.029],
    p2: [-0.074, 0.346],
    p3: [0.708, -0.059],
  },
  "5": {
    l: hexToNormRgb("#fff27a"),
    a: hexToNormRgb("#ffa51f"),
    b: hexToNormRgb("#ff4a2e"),
    p: hexToNormRgb("#fff3bf"),
    p1: [-0.036, 0.629],
    p2: [0.346, -0.074],
    p3: [1.088, 0.401],
  },
  "6": {
    l: hexToNormRgb("#7dffea"),
    a: hexToNormRgb("#1fa8ff"),
    b: hexToNormRgb("#3a3cff"),
    p: hexToNormRgb("#c9fff5"),
    p1: [0.9, 0.12],
    p2: [0.92, 0.92],
    p3: [0.04, 0.88],
  },
  "7": {
    l: hexToNormRgb("#ffd3f1"),
    a: hexToNormRgb("#c07bff"),
    b: hexToNormRgb("#ff4f9a"),
    p: hexToNormRgb("#f0dcff"),
    p1: [0.629, 1.036],
    p2: [-0.074, 0.654],
    p3: [0.401, -0.088],
  },
  "8": {
    l: hexToNormRgb("#c2ffd6"),
    a: hexToNormRgb("#2fe08a"),
    b: hexToNormRgb("#0a9a6a"),
    p: hexToNormRgb("#e2ffec"),
    p1: [0.371, -0.036],
    p2: [1.074, 0.346],
    p3: [0.599, 1.088],
  },
  "9": {
    l: hexToNormRgb("#ffe3b5"),
    a: hexToNormRgb("#ff8a6a"),
    b: hexToNormRgb("#ff3f86"),
    p: hexToNormRgb("#ffe6d8"),
    p1: [0.1, 0.88],
    p2: [0.08, 0.08],
    p3: [0.96, 0.12],
  },
  "10": {
    l: hexToNormRgb("#bfa0ff"),
    a: hexToNormRgb("#5a3cff"),
    b: hexToNormRgb("#1a1ab0"),
    p: hexToNormRgb("#e0d2ff"),
    p1: [1.036, 0.371],
    p2: [0.654, 1.074],
    p3: [-0.088, 0.599],
  },
  "11": {
    l: hexToNormRgb("#f6ff86"),
    a: hexToNormRgb("#8ae83a"),
    b: hexToNormRgb("#1fb86a"),
    p: hexToNormRgb("#fbffc8"),
    p1: [-0.029, 0.344],
    p2: [0.654, -0.074],
    p3: [1.059, 0.708],
  },
  "12": {
    l: hexToNormRgb("#ffa3cd"),
    a: hexToNormRgb("#e03cff"),
    b: hexToNormRgb("#6a2cff"),
    p: hexToNormRgb("#ffd2ea"),
    p1: [0.88, 0.9],
    p2: [0.08, 0.92],
    p3: [0.12, 0.04],
  },
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(t: number): number {
  const x = 1 - clamp01(t);
  return 1 - x * x * x;
}

function easeOutQuart(t: number): number {
  const x = 1 - clamp01(t);
  return 1 - x * x * x * x;
}

function easeInCubic(t: number): number {
  const x = clamp01(t);
  return x * x * x;
}

function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

const VERTEX_SHADER_SRC = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/**
 * 1:1 Netflix Intro (Act I Folded Crimson Ribbon + Act II 3D Spectra Fly-Through)
 * -> Unveiling a Pure, Seamless `[data-av]` Fluid-Flowing Mesh Background (Zero Vertical Bars!)
 *
 * - Exact sRGB fidelity to `src/index.css` `[data-av="1".."12"]` (`--av-a`, `--av-b`, `--av-p`, `--av-l`
 *   at `--p1`, `--p2`, `--p3` + subtle `overlay` noise grain) — no ACES darkening or stripe clutter!
 * - Interactive 8-node viscous fluid wake trail (`uTrail[8]`): sliding the mouse advects, swirls,
 *   and billows the liquid silk color field in real time.
 */
const FRAGMENT_SHADER_SRC = `
precision highp float;

uniform vec2 uCssSize;
uniform float uDpr;
uniform float uTime;

// Act I & II: 1:1 Netflix Intro uniforms
uniform vec3 uRibbonDraw;      // x: left pillar, y: center fold, z: right pillar
uniform vec2 uRibbonCam;       // x: zoom [1..16], y: alpha [1..0]
uniform vec3 uSpectra;         // x: warpProgress [0..1], y: energy [0..1], z: centerPart [0..1]
uniform float uMeshReveal;     // 0..1 center-outward reveal of fluid mesh as Spectra parts
uniform float uCompleteSurge;  // 0..1 forward surge on setup completion

// Act III: Exact [data-av] sRGB palette uniforms
uniform vec3 uAvA;
uniform vec3 uAvB;
uniform vec3 uAvL;
uniform vec3 uAvP;
uniform vec2 uP1;
uniform vec2 uP2;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 acesFilm(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float overlayChannel(float base, float blend) {
  return base < 0.5
    ? (2.0 * base * blend)
    : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend));
}

vec3 blendOverlay(vec3 base, float gray) {
  return vec3(
    overlayChannel(base.r, gray),
    overlayChannel(base.g, gray),
    overlayChannel(base.b, gray)
  );
}

/**
 * 21st.dev "Silk" 4-stop smoothstep palette interpolation
 * Maps [0..1] silk fold wave across [c0 (deep fold) -> c1 (primary) -> c2 (luminous) -> c3 (satin crest)]
 */
vec3 silkPalette(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float x = clamp(t, 0.0, 1.0) * 3.0;
  if (x < 1.0) {
    return mix(c0, c1, smoothstep(0.0, 1.0, x));
  } else if (x < 2.0) {
    return mix(c1, c2, smoothstep(0.0, 1.0, x - 1.0));
  }
  return mix(c2, c3, smoothstep(0.0, 1.0, x - 2.0));
}

vec3 netflixSpectrum(float hA, float hB) {
  if (hA < 0.28) {
    return mix(vec3(2.45, 0.035, 0.065), vec3(3.10, 0.09, 0.11), hB);
  } else if (hA < 0.44) {
    return mix(vec3(1.15, 0.012, 0.032), vec3(1.95, 0.03, 0.06), hB);
  } else if (hA < 0.62) {
    return mix(vec3(2.35, 0.28, 0.02), vec3(2.45, 0.88, 0.12), hB);
  } else if (hA < 0.78) {
    return mix(vec3(1.85, 0.04, 0.52), vec3(0.72, 0.06, 1.75), hB);
  } else if (hA < 0.91) {
    return mix(vec3(0.04, 0.32, 1.95), vec3(0.06, 1.35, 1.75), hB);
  }
  return mix(vec3(2.85, 1.95, 1.55), vec3(3.20, 0.35, 0.22), hB);
}

void main() {
  // Top-down CSS pixel coordinates matching CSS percentages 1:1
  vec2 p = vec2(gl_FragCoord.x / uDpr, uCssSize.y - gl_FragCoord.y / uDpr);
  vec2 uv = p / max(uCssSize, vec2(1.0));
  vec2 center = uCssSize * 0.5;

  float sx = (uv.x - 0.5) * 2.0;
  float ax = abs(sx);
  float sideSeed = sx >= 0.0 ? 23.0 : 71.0;

  // =========================================================================
  // 1. 21ST.DEV "SILK" AUTONOMOUS 4-OCTAVE LIQUID-SILK FLOW SHADER
  // =========================================================================
  vec3 meshSrgb = vec3(0.0);
  if (uMeshReveal > 0.001) {
    // Aspect-corrected centered coordinates matching 21st.dev's shader engine (zero mouse distortion)
    float minDim = max(min(uCssSize.x, uCssSize.y), 1.0);
    vec2 sp = (vec2(p.x, uCssSize.y - p.y) - 0.5 * uCssSize) / minDim;

    // 21st.dev exact "silk" domain-warping recipe (u_scale = 1.26, u_intensity = 0.50, calm autonomous flow)
    sp *= 1.26;
    vec2 q = sp * 1.6;
    float silkTime = uTime * 0.42;
    float seed = (uP1.x + uP2.y) * 1.7 + 1.0;
    float amp = 0.25 + 0.50 * 0.85; // 0.675

    for (int iter = 1; iter <= 4; iter++) {
      float fi = float(iter);
      q.x += (amp / fi) * cos(fi * 2.4 * q.y + silkTime * 0.8 + seed);
      q.y += (amp / fi) * cos(fi * 1.7 * q.x + silkTime * 0.6);
    }

    float silkWave = 0.5 + 0.5 * sin(q.x + q.y);

    // Map silk fold wave across the 4 [data-av] palette stops:
    // uAvB (deep fold) -> uAvA (vivid primary) -> uAvL (soft luminous) -> uAvP (satin highlight crest)
    meshSrgb = silkPalette(silkWave, uAvB, uAvA, uAvL, uAvP);

    // Subtle 21st.dev contrast polish & Dave Hoskins fine film grain
    meshSrgb = clamp((meshSrgb - 0.5) * 0.98 + 0.5, 0.0, 1.0);
    float grain = (hash21(gl_FragCoord.xy + vec2(17.0, 31.0) + fract(uTime * 0.05)) - 0.5) * 0.030;
    meshSrgb = blendOverlay(meshSrgb, 0.5 + grain);
  }

  // =========================================================================
  // 2. 1:1 NETFLIX OPENING (Act I Ribbon + Act II Spectra Fly-Through)
  // =========================================================================
  vec3 hdr = vec3(0.0);

  float ribAlpha = uRibbonCam.y;
  if (ribAlpha > 0.002 && uRibbonDraw.x > 0.001) {
    float ribZoom = uRibbonCam.x;
    float baseH = min(uCssSize.y * 0.30, 200.0);
    float baseW = baseH * 0.58;
    vec2 rp = (p - center) / (vec2(baseW, baseH) * 0.5 * ribZoom);

    float archBottom = 1.0 - 0.045 * (1.0 - rp.x * rp.x);
    float aaX = 2.2 / max(baseW * 0.5 * ribZoom, 1.0);
    float aaY = 2.2 / max(baseH * 0.5 * ribZoom, 1.0);

    float inVertBounds = smoothstep(-1.0 - aaY, -1.0 + aaY, rp.y)
      * (1.0 - smoothstep(archBottom - aaY, archBottom + aaY, rp.y));

    float diagCenter = rp.y * 0.78;
    float dDiag = abs(rp.x - diagCenter);
    float diagHalfW = 0.225;

    float top1 = mix(1.0, -1.0, uRibbonDraw.x);
    float maskL = smoothstep(-1.0 - aaX, -1.0 + aaX, rp.x)
      * (1.0 - smoothstep(-0.56 - aaX, -0.56 + aaX, rp.x))
      * smoothstep(top1 - aaY, top1 + aaY, rp.y)
      * inVertBounds;

    float top3 = mix(1.0, -1.0, uRibbonDraw.z);
    float maskR = smoothstep(0.56 - aaX, 0.56 + aaX, rp.x)
      * (1.0 - smoothstep(1.0 - aaX, 1.0 + aaX, rp.x))
      * smoothstep(top3 - aaY, top3 + aaY, rp.y)
      * inVertBounds;

    float bot2 = mix(-1.0, 1.02, uRibbonDraw.y);
    float maskD = (1.0 - smoothstep(diagHalfW - aaX, diagHalfW + aaX, dDiag))
      * (1.0 - smoothstep(bot2 - aaY * 1.5, bot2 + aaY * 1.5, rp.y))
      * inVertBounds;

    float creaseShadow = mix(
      1.0,
      0.18 + 0.82 * smoothstep(diagHalfW, diagHalfW + 0.42, dDiag),
      clamp(uRibbonDraw.y * 1.3, 0.0, 1.0)
    );

    vec3 pillarCrimson = vec3(0.92, 0.015, 0.032) * creaseShadow * (0.85 + 0.15 * (1.0 - abs(rp.y)));
    vec3 foldScarlet = vec3(2.25, 0.042, 0.068) * (0.92 + 0.18 * (1.0 - dDiag / max(diagHalfW, 0.01)));

    vec3 ribCol = pillarCrimson * clamp(maskL + maskR, 0.0, 1.0);
    ribCol = mix(ribCol, foldScarlet, maskD);

    float dCenterNorm = length((p - center) / max(baseH * ribZoom, 1.0));
    float stageGlow = exp(-dCenterNorm * 2.1) * 0.28 * uRibbonDraw.x;

    hdr += (ribCol + vec3(1.6, 0.03, 0.05) * stageGlow) * ribAlpha;
  }

  float specEnergy = max(uSpectra.y, uCompleteSurge * 0.85);
  if (specEnergy > 0.002) {
    float warpProg = uCompleteSurge > 0.01 ? (0.25 + uCompleteSurge * 0.65) : uSpectra.x;
    float warpZoom = 0.036 * exp(warpProg * 4.25);
    float srcX = ax / max(warpZoom, 0.001);

    float outerFront = 1.0 - smoothstep(1.15, 1.65, srcX);
    float partRadius = uCompleteSurge > 0.01 ? 0.0 : (uSpectra.z * 1.32);
    float centerPartMask = smoothstep(partRadius - 0.22, partRadius + 0.18, ax);

    float dyCenter = abs(uv.y - 0.5) * 2.0;

    float macroScale = srcX * 14.0;
    float macroIdx = floor(macroScale);
    float macroFract = fract(macroScale);
    float mHa = hash11(macroIdx + sideSeed);
    float mHb = hash11(macroIdx * 2.17 + sideSeed + 5.1);
    float macroShape = sin(macroFract * 3.14159265);
    float macroVert = exp(-pow(dyCenter / (0.52 + 0.48 * mHb), 2.2));
    vec3 macroCol = netflixSpectrum(mHa, mHb);

    float midScale = srcX * 42.0;
    float midIdx = floor(midScale);
    float midFract = fract(midScale);
    float bHa = hash11(midIdx * 1.31 + sideSeed + 13.7);
    float bHb = hash11(midIdx * 2.93 + sideSeed + 29.4);
    float barEdge = smoothstep(0.0, 0.07, midFract) * smoothstep(1.0, 0.93, midFract);
    float barVert = exp(-pow(abs(uv.y - 0.5 - (bHa - 0.5) * 0.16) * 2.0 / (0.34 + 0.66 * bHb), 2.6));
    vec3 midCol = netflixSpectrum(bHa, bHb) * (0.45 + 0.95 * step(0.28, bHb));

    float fineScale = srcX * 96.0;
    float fineIdx = floor(fineScale);
    float fineFract = fract(fineScale);
    float fHa = hash11(fineIdx * 1.91 + sideSeed + 47.3);
    float fHb = hash11(fineIdx * 3.13 + sideSeed + 83.9);
    float threadCore = exp(-pow((fineFract - 0.5) / 0.16, 2.0)) * step(0.45, fHb);
    float threadVert = exp(-pow(dyCenter / (0.25 + 0.72 * fHa), 3.0));
    vec3 fineCol = netflixSpectrum(fHa, fHb) * 1.35;

    float periphGain = 0.55 + 0.85 * smoothstep(0.02, 0.75, ax);
    float windowMask = outerFront * centerPartMask * periphGain * specEnergy;

    hdr += (macroCol * macroShape * macroVert * 0.52
          + midCol * barEdge * barVert * 0.78
          + fineCol * threadCore * threadVert * 0.85) * windowMask;

    float flarePeak = exp(-pow((warpProg - 0.36) / 0.18, 2.0)) * specEnergy;
    float anamorphic = exp(-dyCenter / 0.055) * exp(-ax / 0.85) * flarePeak;
    hdr += vec3(2.4, 0.24, 0.18) * anamorphic * 0.65;
  }

  vec3 netflixSrgb = pow(max(acesFilm(hdr), vec3(0.0)), vec3(1.0 / 2.2));

  // =========================================================================
  // 3. COMPOSITE: Parting Spectra Curtains Unveil Pure [data-av] Fluid Mesh
  // =========================================================================
  float revealMask = 0.0;
  if (uMeshReveal >= 0.999) {
    revealMask = 1.0;
  } else if (uMeshReveal > 0.001) {
    float front = uMeshReveal * 1.45 - 0.16;
    revealMask = 1.0 - smoothstep(front - 0.20, front + 0.20, ax);
  }

  vec3 stageBase = mix(vec3(0.0), meshSrgb, revealMask);
  // Screen-composite blazing Netflix ribbons over the unveiling mesh so mesh colors NEVER darken!
  vec3 finalCol = 1.0 - (1.0 - stageBase) * (1.0 - netflixSrgb);

  float dither = (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(finalCol + dither, 0.0, 1.0), 1.0);
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createShaderProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const prog = gl.createProgram();
  if (!prog) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

export const OpticalStartupCanvas = forwardRef<
  OpticalStartupHandle,
  OpticalStartupCanvasProps
>(function OpticalStartupCanvas(
  { phase, paletteId = "1", playKey = 0, revealTargetRef },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<OnboardingPhase>(phase);
  const paletteIdRef = useRef<GrainMeshId>(paletteId);

  useEffect(() => {
    paletteIdRef.current = paletteId;
  }, [paletteId]);

  const seqStartRef = useRef<number>(0);
  const skipSnapRef = useRef<boolean>(false);
  const completeStartRef = useRef<number>(-99);

  useEffect(() => {
    const prev = phaseRef.current;
    phaseRef.current = phase;

    if (prev === "intro" && (phase === "welcome" || phase === "setup")) {
      const elapsed = (performance.now() - seqStartRef.current) / 1000;
      if (elapsed < 2.2) {
        skipSnapRef.current = true;
      }
    }

    if (phase === "complete" && prev !== "complete") {
      const elapsed = (performance.now() - seqStartRef.current) / 1000;
      completeStartRef.current = elapsed;
    }
  }, [phase]);

  const replay = useCallback(() => {
    seqStartRef.current = performance.now();
    skipSnapRef.current = false;
    completeStartRef.current = -99;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      replay,
    }),
    [replay]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const gl = (canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    }) ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;

    const program = gl ? createShaderProgram(gl) : null;
    const fallbackCtx = !program ? canvas.getContext("2d") : null;

    let quadBuf: WebGLBuffer | null = null;
    let uniforms: {
      uCssSize: WebGLUniformLocation | null;
      uDpr: WebGLUniformLocation | null;
      uTime: WebGLUniformLocation | null;
      uRibbonDraw: WebGLUniformLocation | null;
      uRibbonCam: WebGLUniformLocation | null;
      uSpectra: WebGLUniformLocation | null;
      uMeshReveal: WebGLUniformLocation | null;
      uCompleteSurge: WebGLUniformLocation | null;
      uAvA: WebGLUniformLocation | null;
      uAvB: WebGLUniformLocation | null;
      uAvL: WebGLUniformLocation | null;
      uAvP: WebGLUniformLocation | null;
      uP1: WebGLUniformLocation | null;
      uP2: WebGLUniformLocation | null;
    } | null = null;

    if (gl && program) {
      gl.useProgram(program);
      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );
      const aPos = gl.getAttribLocation(program, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      uniforms = {
        uCssSize: gl.getUniformLocation(program, "uCssSize"),
        uDpr: gl.getUniformLocation(program, "uDpr"),
        uTime: gl.getUniformLocation(program, "uTime"),
        uRibbonDraw: gl.getUniformLocation(program, "uRibbonDraw"),
        uRibbonCam: gl.getUniformLocation(program, "uRibbonCam"),
        uSpectra: gl.getUniformLocation(program, "uSpectra"),
        uMeshReveal: gl.getUniformLocation(program, "uMeshReveal"),
        uCompleteSurge: gl.getUniformLocation(program, "uCompleteSurge"),
        uAvA: gl.getUniformLocation(program, "uAvA"),
        uAvB: gl.getUniformLocation(program, "uAvB"),
        uAvL: gl.getUniformLocation(program, "uAvL"),
        uAvP: gl.getUniformLocation(program, "uAvP"),
        uP1: gl.getUniformLocation(program, "uP1"),
        uP2: gl.getUniformLocation(program, "uP2"),
      };
    }

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pxW = Math.floor(width * dpr);
      const pxH = Math.floor(height * dpr);
      canvas.width = pxW;
      canvas.height = pxH;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (gl && program) {
        gl.viewport(0, 0, pxW, pxH);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    seqStartRef.current = performance.now();
    skipSnapRef.current = false;

    // Live-interpolated palette state for silky cross-palette morphing
    const initSpec = MESH_PALETTES[paletteIdRef.current] || MESH_PALETTES["1"];
    const curAvA = [...initSpec.a];
    const curAvB = [...initSpec.b];
    const curAvL = [...initSpec.l];
    const curAvP = [...initSpec.p];
    const curP1 = [...initSpec.p1];
    const curP2 = [...initSpec.p2];

    let maskCleared = false;
    let rafId = 0;
    let running = true;

    const clearForegroundMask = () => {
      const el = revealTargetRef?.current;
      if (el && !maskCleared) {
        el.style.maskImage = "";
        el.style.webkitMaskImage = "";
        maskCleared = true;
      }
    };

    const render = (nowMs: number) => {
      if (!running) return;

      const t = (nowMs - seqStartRef.current) / 1000;
      const curPhase = phaseRef.current;
      const snapped = skipSnapRef.current || reducedMotion;

      // Smoothly interpolate active [data-av] palette colors & seed coordinates
      const targetSpec =
        MESH_PALETTES[paletteIdRef.current] || MESH_PALETTES["1"];
      const cLerp = 0.09;
      for (let k = 0; k < 3; k++) {
        curAvA[k] += (targetSpec.a[k] - curAvA[k]) * cLerp;
        curAvB[k] += (targetSpec.b[k] - curAvB[k]) * cLerp;
        curAvL[k] += (targetSpec.l[k] - curAvL[k]) * cLerp;
        curAvP[k] += (targetSpec.p[k] - curAvP[k]) * cLerp;
      }
      for (let k = 0; k < 2; k++) {
        curP1[k] += (targetSpec.p1[k] - curP1[k]) * cLerp;
        curP2[k] += (targetSpec.p2[k] - curP2[k]) * cLerp;
      }

      // 1:1 Netflix Intro envelopes -> unveiling autonomous silk background
      const draw1 = snapped ? 1 : easeOutCubic((t - 0.08) / 0.24);
      const draw2 = snapped ? 1 : easeInOutCubic((t - 0.26) / 0.28);
      const draw3 = snapped ? 1 : easeOutCubic((t - 0.48) / 0.24);

      const camPush = snapped ? 1 : easeInCubic((t - 0.68) / 0.46);
      const ribbonZoom = 1 + camPush * 15;
      const ribbonAlpha = snapped ? 0 : 1 - easeInOutCubic((t - 0.78) / 0.34);

      const spectraWarp = snapped ? 1 : clamp01((t - 0.74) / 1.9);
      const specIn = easeOutCubic((t - 0.74) / 0.26);
      const specOut = 1 - easeInOutCubic((t - 1.75) / 0.92);
      const spectraEnergy = snapped ? 0 : clamp01(specIn * specOut);
      const centerPart = snapped ? 1 : easeInOutCubic((t - 1.38) / 1.12);

      const meshReveal = snapped ? 1 : easeInOutCubic((t - 1.36) / 1.16);

      let completeSurge = 0;
      if (curPhase === "complete" && completeStartRef.current >= 0) {
        const ct = Math.max(0, t - completeStartRef.current);
        completeSurge = Math.sin(clamp01(ct / 1.2) * Math.PI);
      }

      // Synchronized foreground aperture reveal
      const targetEl = revealTargetRef?.current;
      if (targetEl) {
        if (
          snapped ||
          curPhase === "setup" ||
          curPhase === "complete" ||
          t > 2.62
        ) {
          clearForegroundMask();
        } else {
          maskCleared = false;
          const openProg = easeOutQuart((t - 1.48) / 1.05);
          const innerHalf = openProg * 64;
          const outerHalf = innerHalf + 18;
          const lOut = Math.max(0, 50 - outerHalf).toFixed(1);
          const lIn = Math.max(0, 50 - innerHalf).toFixed(1);
          const rIn = Math.min(100, 50 + innerHalf).toFixed(1);
          const rOut = Math.min(100, 50 + outerHalf).toFixed(1);
          const maskCss = `linear-gradient(to right, rgba(0,0,0,0) ${lOut}%, rgba(0,0,0,1) ${lIn}%, rgba(0,0,0,1) ${rIn}%, rgba(0,0,0,0) ${rOut}%)`;
          targetEl.style.maskImage = maskCss;
          targetEl.style.webkitMaskImage = maskCss;
        }
      }

      if (gl && program && uniforms) {
        gl.useProgram(program);
        gl.uniform2f(uniforms.uCssSize, width, height);
        gl.uniform1f(uniforms.uDpr, dpr);
        gl.uniform1f(uniforms.uTime, reducedMotion ? 3.5 : t);
        gl.uniform3f(uniforms.uRibbonDraw, draw1, draw2, draw3);
        gl.uniform2f(uniforms.uRibbonCam, ribbonZoom, ribbonAlpha);
        gl.uniform3f(
          uniforms.uSpectra,
          spectraWarp,
          spectraEnergy,
          centerPart
        );
        gl.uniform1f(uniforms.uMeshReveal, meshReveal);
        gl.uniform1f(uniforms.uCompleteSurge, completeSurge);
        gl.uniform3f(uniforms.uAvA, curAvA[0], curAvA[1], curAvA[2]);
        gl.uniform3f(uniforms.uAvB, curAvB[0], curAvB[1], curAvB[2]);
        gl.uniform3f(uniforms.uAvL, curAvL[0], curAvL[1], curAvL[2]);
        gl.uniform3f(uniforms.uAvP, curAvP[0], curAvP[1], curAvP[2]);
        gl.uniform2f(uniforms.uP1, curP1[0], curP1[1]);
        gl.uniform2f(uniforms.uP2, curP2[0], curP2[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else if (fallbackCtx) {
        fallbackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fallbackCtx.fillStyle = `rgb(${Math.round(
          curAvA[0] * 255
        )}, ${Math.round(curAvA[1] * 255)}, ${Math.round(curAvA[2] * 255)})`;
        fallbackCtx.fillRect(0, 0, width, height);
      }

      if (!reducedMotion || t < 0.2) {
        rafId = window.requestAnimationFrame(render);
      }
    };

    rafId = window.requestAnimationFrame(render);

    return () => {
      running = false;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      clearForegroundMask();
      if (gl) {
        if (quadBuf) gl.deleteBuffer(quadBuf);
        if (program) gl.deleteProgram(program);
      }
    };
  }, [playKey, revealTargetRef]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
});
