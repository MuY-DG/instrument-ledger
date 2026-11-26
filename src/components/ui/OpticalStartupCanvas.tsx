import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export type OnboardingPhase = "intro" | "welcome" | "setup" | "complete";

export interface OpticalStartupHandle {
  /** Replay the central vertical light-slit ignition & outward prism bar rush */
  replay: () => void;
  /** Trigger a soft horizontal harmonic light ripple across the vertical bars */
  flash: (normX?: number, normY?: number) => void;
}

export interface OpticalStartupCanvasProps {
  /** Lifecycle phase of the onboarding flow */
  phase: OnboardingPhase;
  /** Optional counter to force a fresh opening sequence */
  playKey?: number;
  /** Foreground stage revealed via center-outward horizontal curtain mask in sync with parting bars */
  revealTargetRef?: React.RefObject<HTMLElement | null>;
}

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

function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Custom perspective acceleration curve for Netflix "Spectra"-style ribbon expansion:
 * begins poised at the center slit, accelerates briskly past the periphery, and settles silkily.
 */
function easePrismZoom(t: number): number {
  const x = clamp01(t);
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 1 - Math.pow(1 - x, 3.4);
}

const VERTEX_SHADER_SRC = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/**
 * Pure WebGL Fragment Shader — Netflix "Spectra" Vertical Slit-Split × React Bits Pro `Gradient Bars`
 *
 * Palette: Ultra-low-saturation Micro-Prism Pearl
 * - Dominant (~85%): Warm Alabaster / Pearl White (#F6F4F1) & Brushed Silver-Grey on Velvet Obsidian (#09090B)
 * - Micro-Prism Dispersion (~15%): Whisper-light Warm Champagne (#F6E8D5) & Misty Dusk Lavender (#E5DDF4)
 * - Zero dot-matrix, zero HUD overlays, zero cyan/blue or heavy saturated colors.
 */
const FRAGMENT_SHADER_SRC = `
precision highp float;

uniform vec2 uCssSize;
uniform float uDpr;
uniform float uTime;
uniform float uSlitIgnite;    // 0..1 vertical ignition of central optical filament
uniform float uSlitFade;      // 1..0 dissolve of central filament as bars part
uniform float uZoom;          // 0.03..1.0 outward perspective expansion into Gradient Bars
uniform float uRushEnv;       // 0..1 bell envelope of opening Netflix spectral silk rush
uniform float uSettleEnv;     // 0..1 settled Gradient Bars wave presence
uniform vec2 uStageMix;       // x: setupDim [0..1], y: completeGlow [0..1]
uniform vec2 uPointer;        // smoothed normalized pointer [0..1]
uniform vec3 uRipple;         // x: center normX, y: age sec, z: strength [0..1]

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

void main() {
  vec2 p = vec2(gl_FragCoord.x / uDpr, gl_FragCoord.y / uDpr);
  vec2 uv = p / max(uCssSize, vec2(1.0));

  // Signed & mirrored horizontal coordinate: 0 at center, 1 at left/right viewport edges
  float sx = (uv.x - 0.5) * 2.0;
  float ax = abs(sx);
  float sideSeed = sx >= 0.0 ? 17.0 : 53.0;

  float setupDim = uStageMix.x;
  float completeGlow = uStageMix.y;

  // =========================================================================
  // PALETTE: Velvet Obsidian + Pearl Alabaster + Whisper Champagne & Lavender
  // =========================================================================
  vec3 bgCol = vec3(0.035, 0.035, 0.041);          // #09090b neutral velvet dark
  vec3 pearlWhite = vec3(0.968, 0.957, 0.942);     // #F7F4F0 warm gallery pearl
  vec3 silverMid = vec3(0.585, 0.576, 0.592);      // brushed silver-grey
  vec3 champagneMist = vec3(0.965, 0.902, 0.820);  // ultra-soft champagne sheen
  vec3 lavenderMist = vec3(0.886, 0.855, 0.952);   // ultra-soft iris/lavender mist
  vec3 roseWhisper = vec3(0.952, 0.882, 0.896);    // faint rose-pearl refraction

  vec3 col = bgCol;

  // =========================================================================
  // 1. CENTRAL VERTICAL OPTICAL FILAMENT (t = 0.08s -> 1.45s)
  //    Ignites vertically from center like Neon Reveal, then splits apart
  // =========================================================================
  if (uSlitIgnite > 0.002 && uSlitFade > 0.002) {
    float halfH = 0.44 * uSlitIgnite;
    float dySlit = max(abs(uv.y - 0.5) - halfH, 0.0);
    float dxPx = abs(p.x - uCssSize.x * 0.5);
    float dyPx = dySlit * uCssSize.y;
    float dSlit = length(vec2(dxPx, dyPx));

    float vertTaper = smoothstep(0.49, 0.12, abs(uv.y - 0.5));
    float slitCore = exp(-pow(dSlit / 1.6, 2.0)) * vertTaper;
    float slitHalo = exp(-dSlit / 14.0) * 0.52 * vertTaper;
    float slitAtmos = exp(-dSlit / 68.0) * 0.22 * vertTaper;

    // Subtle chromatic dispersion across left/right edges of the central slit
    vec3 slitTint = mix(champagneMist, lavenderMist, smoothstep(-18.0, 18.0, p.x - uCssSize.x * 0.5));
    vec3 slitHaloCol = mix(pearlWhite, slitTint, 0.35);

    col += slitHaloCol * ((slitHalo + slitAtmos) * uSlitFade);
    col += pearlWhite * (slitCore * uSlitFade * 0.95);
  }

  // =========================================================================
  // 2. PERSPECTIVE PRISM COORDINATE MAPPING (Netflix Zoom -> Gradient Bars)
  //    As uZoom expands 0.035 -> 1.0, central compressed bars rush outward
  //    and lock seamlessly into 18 symmetrical mirrored vertical columns.
  // =========================================================================
  float zoom = max(uZoom, 0.025);
  float srcX = ax / zoom;
  // Soft outer horizon fade while prism is still expanding inside viewport
  float expandBound = 1.0 - smoothstep(0.92, 1.18, srcX);

  // Bar tiling: 9 mirrored columns per side -> 18 symmetrical columns across screen
  float barCount = 9.0;
  float scaledBar = srcX * barCount;
  float barIdx = floor(min(scaledBar, barCount - 0.001));
  float barFract = fract(scaledBar);
  float normBar = barIdx / barCount;

  // Architectural column profile: crisp column edge step + subtle faceted glass taper
  float seamMask = smoothstep(0.0, 0.028, barFract) * smoothstep(1.0, 0.972, barFract);
  float glassFlute = 0.74 + 0.26 * (1.0 - barFract * 0.75);
  // Crisp optical rim highlight along the inner bar edge facing center
  float innerRim = exp(-barFract / 0.075) * 0.42;

  // =========================================================================
  // 3. GRADIENT BARS TRAVELING WAVE DYNAMICS
  //    Ease-In vertical luminance waves create deep velvet troughs & luminous
  //    pearl crests staggered across neighboring columns (React Bits Gradient Bars)
  // =========================================================================
  float invWave = sin(uTime * 0.18);
  float ptrShift = (uPointer.x - 0.5) * (sx >= 0.0 ? 0.95 : -0.95) + (uPointer.y - 0.5) * 0.48;
  float oddAlt = mod(barIdx, 2.0) * 0.52;

  float waveArg = (1.0 - uv.y) * 2.45
    - uTime * (0.34 * invWave + 0.14)
    + normBar * 4.1
    + oddAlt
    + ptrShift;

  float rawWave = 0.5 + 0.5 * sin(waveArg);
  // Ease-In power curves: deep dark troughs + sculptural luminous wave crests
  float gradBody = pow(max(rawWave, 0.0001), 2.15);
  float gradCrest = pow(max(rawWave, 0.0001), 6.2);
  float barWave = gradBody * 0.56 + gradCrest * 0.44;

  // Soft vertical stage vignette so columns emerge smoothly from velvet top/bottom
  float vertVignette = smoothstep(0.0, 0.18, uv.y) * smoothstep(1.0, 0.82, uv.y);
  vertVignette = mix(0.22, 1.0, vertVignette);

  // Gentle center calm zone so foreground emblem, title & setup card stay ultra-legible
  float centerCalm = mix(
    0.72 + 0.28 * smoothstep(0.05, 0.48, ax),
    0.42 + 0.58 * smoothstep(0.16, 0.65, ax),
    setupDim
  );

  // Interactive click ripple & completion uplift wave
  float rippleBoost = 0.0;
  if (uRipple.z > 0.004) {
    float rDist = abs(uv.x - uRipple.x);
    float rFront = uRipple.y * 0.85;
    rippleBoost = exp(-pow((rDist - rFront) / 0.085, 2.0)) * uRipple.z * 0.36;
  }

  float completeSweep = completeGlow * (0.45 + 0.55 * sin(uv.y * 3.14159 - uTime * 1.4)) * 0.18;

  // Micro-prism dispersion tint per bar (whisper-light champagne <-> pearl <-> misty lavender)
  float prismWave = sin(normBar * 4.4 + (sx >= 0.0 ? 0.38 : -0.38) - uTime * 0.12);
  vec3 prismTint = prismWave >= 0.0
    ? mix(pearlWhite, champagneMist, prismWave * 0.9)
    : mix(pearlWhite, lavenderMist, (-prismWave) * 0.9);
  prismTint = mix(prismTint, roseWhisper, gradCrest * 0.25);

  // Keep saturation airy & refined: pearl-alabaster core with subtle champagne/lavender kiss
  float tintAmount = clamp(0.26 + innerRim * 0.42 + uRushEnv * 0.28, 0.0, 0.58);
  vec3 barColor = mix(mix(silverMid, pearlWhite, gradCrest * 0.8 + 0.2), prismTint, tintAmount);

  // Sculptural Gradient Bars luminance (~0.36 peak crest in welcome, ~0.21 in setup)
  float baseLum = (barWave * 0.35 + innerRim * gradBody * 0.14 + rippleBoost + completeSweep)
    * seamMask
    * glassFlute
    * vertVignette
    * centerCalm
    * expandBound
    * uSettleEnv
    * mix(1.0, 0.58, setupDim);

  col += barColor * baseLum;

  // =========================================================================
  // 4. NETFLIX "SPECTRA" FINE SILK RIBBON RUSH (Opening 0.36s -> 2.30s only)
  //    Dozens of gossamer vertical light threads fanning past left & right
  // =========================================================================
  if (uRushEnv > 0.003 && expandBound > 0.001) {
    float fineScale = srcX * 27.0;
    float fineIdx = floor(fineScale);
    float fineFract = fract(fineScale);

    float hA = hash11(fineIdx + sideSeed);
    float hB = hash11(fineIdx * 1.73 + sideSeed + 9.2);

    // Crisp vertical silk filament profile
    float filament = smoothstep(0.0, 0.12, fineFract) * smoothstep(1.0, 0.88, fineFract);
    float coreThread = exp(-pow((fineFract - 0.5) / 0.15, 2.0));

    // Vertical light-streak window gliding along each ribbon
    float streakCenter = 0.5 + (hB - 0.5) * 0.36 + sin(uTime * 1.5 + hA * 6.28) * 0.08;
    float streakLen = 0.24 + hA * 0.34;
    float vertStreak = exp(-pow((uv.y - streakCenter) / streakLen, 2.0));

    // Outer ribbons gleam brighter as they fly past the camera periphery
    float peripheryGain = 0.38 + 0.62 * smoothstep(0.03, 0.58, ax);
    float ribbonEnergy = (filament * 0.36 + coreThread * 0.64)
      * (0.38 + 0.62 * hA)
      * vertStreak
      * peripheryGain
      * expandBound
      * uRushEnv;

    // Delicate alternating champagne / pearl / misty-lavender silk threads
    vec3 threadTint = hB < 0.36
      ? champagneMist
      : (hB < 0.72 ? lavenderMist : roseWhisper);
    vec3 threadCol = mix(pearlWhite, threadTint, 0.42);

    col += threadCol * (ribbonEnergy * 0.86);
  }

  // Soft overhead ambient pearl veil so the upper stage breathes gently
  float topVeil = exp(-pow((1.0 - uv.y) / 0.42, 2.0))
    * exp(-pow(sx / 1.15, 2.0))
    * 0.032
    * (uSettleEnv + uRushEnv * 0.8)
    * mix(1.0, 0.6, setupDim);
  col += mix(champagneMist, lavenderMist, uv.x) * topVeil;

  // Filmic anti-banding dither (essential for ultra-subtle low-saturation dark gradients)
  float dither = (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  col = clamp(col + dither, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
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
  { phase, playKey = 0, revealTargetRef },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<OnboardingPhase>(phase);

  const seqStartRef = useRef<number>(0);
  const skipSnapRef = useRef<boolean>(false);
  const rippleRef = useRef<{
    normX: number;
    startSec: number;
    active: boolean;
  }>({ normX: 0.5, startSec: -99, active: false });

  const pointerRef = useRef<{
    normX: number;
    normY: number;
    smoothX: number;
    smoothY: number;
  }>({
    normX: 0.5,
    normY: 0.5,
    smoothX: 0.5,
    smoothY: 0.5,
  });

  useEffect(() => {
    const prev = phaseRef.current;
    phaseRef.current = phase;

    if (prev === "intro" && (phase === "welcome" || phase === "setup")) {
      const elapsed = (performance.now() - seqStartRef.current) / 1000;
      if (elapsed < 1.9) {
        skipSnapRef.current = true;
      }
    }

    if (phase === "complete" && prev !== "complete") {
      const elapsed = (performance.now() - seqStartRef.current) / 1000;
      rippleRef.current = {
        normX: 0.5,
        startSec: elapsed,
        active: true,
      };
    }
  }, [phase]);

  const replay = useCallback(() => {
    seqStartRef.current = performance.now();
    skipSnapRef.current = false;
    rippleRef.current.active = false;
  }, []);

  const flash = useCallback((normX = 0.5) => {
    const elapsed = (performance.now() - seqStartRef.current) / 1000;
    rippleRef.current = {
      normX: clamp01(normX),
      startSec: elapsed,
      active: true,
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      replay,
      flash,
    }),
    [replay, flash]
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
      uSlitIgnite: WebGLUniformLocation | null;
      uSlitFade: WebGLUniformLocation | null;
      uZoom: WebGLUniformLocation | null;
      uRushEnv: WebGLUniformLocation | null;
      uSettleEnv: WebGLUniformLocation | null;
      uStageMix: WebGLUniformLocation | null;
      uPointer: WebGLUniformLocation | null;
      uRipple: WebGLUniformLocation | null;
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
        uSlitIgnite: gl.getUniformLocation(program, "uSlitIgnite"),
        uSlitFade: gl.getUniformLocation(program, "uSlitFade"),
        uZoom: gl.getUniformLocation(program, "uZoom"),
        uRushEnv: gl.getUniformLocation(program, "uRushEnv"),
        uSettleEnv: gl.getUniformLocation(program, "uSettleEnv"),
        uStageMix: gl.getUniformLocation(program, "uStageMix"),
        uPointer: gl.getUniformLocation(program, "uPointer"),
        uRipple: gl.getUniformLocation(program, "uRipple"),
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

    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current.normX = clamp01(e.clientX / Math.max(1, width));
      pointerRef.current.normY = clamp01(e.clientY / Math.max(1, height));
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    seqStartRef.current = performance.now();
    skipSnapRef.current = false;

    let smoothSetupDim = phaseRef.current === "setup" ? 1 : 0;
    let smoothCompleteGlow = phaseRef.current === "complete" ? 1 : 0;
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

      smoothSetupDim +=
        ((curPhase === "setup" ? 1 : 0) - smoothSetupDim) * 0.07;
      smoothCompleteGlow +=
        ((curPhase === "complete" ? 1 : 0) - smoothCompleteGlow) * 0.075;

      const ptr = pointerRef.current;
      ptr.smoothX += (ptr.normX - ptr.smoothX) * 0.06;
      ptr.smoothY += (ptr.normY - ptr.smoothY) * 0.06;

      // Choreography envelopes:
      // 1) Central vertical slit ignites (0.06s -> 0.50s) & dissolves as ribbons part (0.56s -> 1.42s)
      const slitIgnite = snapped ? 1 : easeOutCubic((t - 0.06) / 0.44);
      const slitFade = snapped ? 0 : 1 - easeInOutCubic((t - 0.56) / 0.86);

      // 2) Netflix "Spectra" outward perspective zoom (0.36s -> 2.15s) -> locks at 1.0
      const zoomProgress = snapped ? 1 : easePrismZoom((t - 0.36) / 1.78);
      const zoom = 0.032 + 0.968 * zoomProgress;

      // 3) Fine spectral silk rush bell-curve (rises 0.36s -> 0.92s, exhales smoothly -> 2.35s)
      const rushIn = easeOutCubic((t - 0.36) / 0.52);
      const rushOut = 1 - easeInOutCubic((t - 1.05) / 1.32);
      const rushEnv = snapped ? 0 : clamp01(rushIn * rushOut);

      // 4) Settled Gradient Bars presence
      const settleEnv = snapped ? 1 : easeOutQuart((t - 0.52) / 1.65);

      // 5) Synchronized horizontal center-outward curtain reveal on foreground UI
      const targetEl = revealTargetRef?.current;
      if (targetEl) {
        if (snapped || curPhase === "setup" || curPhase === "complete" || t > 2.25) {
          clearForegroundMask();
        } else {
          maskCleared = false;
          const openProg = easeOutQuart((t - 0.62) / 1.48);
          const innerHalf = openProg * 64;
          const outerHalf = innerHalf + 20;
          const lOut = Math.max(0, 50 - outerHalf).toFixed(1);
          const lIn = Math.max(0, 50 - innerHalf).toFixed(1);
          const rIn = Math.min(100, 50 + innerHalf).toFixed(1);
          const rOut = Math.min(100, 50 + outerHalf).toFixed(1);
          const maskCss = `linear-gradient(to right, rgba(0,0,0,0) ${lOut}%, rgba(0,0,0,1) ${lIn}%, rgba(0,0,0,1) ${rIn}%, rgba(0,0,0,0) ${rOut}%)`;
          targetEl.style.maskImage = maskCss;
          targetEl.style.webkitMaskImage = maskCss;
        }
      }

      // Click / completion horizontal wave ripple
      let rippleAge = 0;
      let rippleStrength = 0;
      if (rippleRef.current.active) {
        rippleAge = Math.max(0, t - rippleRef.current.startSec);
        if (rippleAge < 1.5) {
          rippleStrength = Math.pow(1 - rippleAge / 1.5, 1.7);
        } else {
          rippleRef.current.active = false;
        }
      }

      if (gl && program && uniforms) {
        gl.useProgram(program);
        gl.uniform2f(uniforms.uCssSize, width, height);
        gl.uniform1f(uniforms.uDpr, dpr);
        gl.uniform1f(uniforms.uTime, reducedMotion ? 3.2 : t);
        gl.uniform1f(uniforms.uSlitIgnite, slitIgnite);
        gl.uniform1f(uniforms.uSlitFade, slitFade);
        gl.uniform1f(uniforms.uZoom, zoom);
        gl.uniform1f(uniforms.uRushEnv, rushEnv);
        gl.uniform1f(uniforms.uSettleEnv, settleEnv);
        gl.uniform2f(uniforms.uStageMix, smoothSetupDim, smoothCompleteGlow);
        gl.uniform2f(uniforms.uPointer, ptr.smoothX, ptr.smoothY);
        gl.uniform3f(
          uniforms.uRipple,
          rippleRef.current.normX,
          rippleAge,
          rippleStrength
        );
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else if (fallbackCtx) {
        fallbackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fallbackCtx.fillStyle = "#09090b";
        fallbackCtx.fillRect(0, 0, width, height);

        const totalBars = 18;
        const barW = width / totalBars;
        for (let i = 0; i < totalBars; i++) {
          const mirrorIdx = i < 9 ? 8 - i : i - 9;
          const wave =
            0.5 + 0.5 * Math.sin(t * 0.35 + (mirrorIdx / 9) * 3.8);
          const alpha =
            (0.04 + Math.pow(wave, 1.8) * 0.12) *
            settleEnv *
            (1 - smoothSetupDim * 0.45);
          const g = fallbackCtx.createLinearGradient(0, 0, 0, height);
          const tint =
            mirrorIdx % 2 === 0 ? "246, 232, 213" : "229, 221, 244";
          g.addColorStop(0, "rgba(9, 9, 11, 0)");
          g.addColorStop(0.5, `rgba(${tint}, ${alpha})`);
          g.addColorStop(1, "rgba(9, 9, 11, 0)");
          fallbackCtx.fillStyle = g;
          fallbackCtx.fillRect(i * barW + 1, 0, Math.max(1, barW - 2), height);
        }
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
      window.removeEventListener("pointermove", onPointerMove);
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
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#09090b]"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
});
