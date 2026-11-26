import React, { useEffect, useRef } from "react";
import {
  SILK_MESH_PALETTES,
  type GrainMeshId,
} from "@/lib/accountBackgrounds";
import { cn } from "@/lib/utils";

interface SilkFlowCanvasProps {
  /** Active palette ID ("1" .. "12") matching the onboarding silk palettes */
  paletteId: GrainMeshId;
  /** Pause animation loop when covered (e.g., locked or onboarding preview open) */
  paused?: boolean;
  className?: string;
}

const VERTEX_SHADER_SRC = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/**
 * Exact Act III post-Netflix 21st.dev "Silk" autonomous 4-octave liquid-silk
 * domain-warping shader, adapted to fill arbitrary card / badge dimensions
 * without horizontal crowding.
 */
const FRAGMENT_SHADER_SRC = `
precision highp float;

uniform vec2 uCssSize;
uniform float uDpr;
uniform float uTime;

uniform vec3 uAvA;
uniform vec3 uAvB;
uniform vec3 uAvL;
uniform vec3 uAvP;
uniform vec2 uP1;
uniform vec2 uP2;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
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

vec3 silkPalette(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float x = clamp(t, 0.0, 1.0) * 3.0;
  if (x < 1.0) {
    return mix(c0, c1, smoothstep(0.0, 1.0, x));
  } else if (x < 2.0) {
    return mix(c1, c2, smoothstep(0.0, 1.0, x - 1.0));
  }
  return mix(c2, c3, smoothstep(0.0, 1.0, x - 2.0));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x / uDpr, uCssSize.y - gl_FragCoord.y / uDpr);

  // Preserve full-screen silk fold proportions across both square badges and wide horizontal cards
  float minDim = min(uCssSize.x, uCssSize.y);
  float maxDim = max(uCssSize.x, uCssSize.y);
  float normDim = max(max(minDim, maxDim * 0.58), 1.0);
  vec2 sp = (vec2(p.x, uCssSize.y - p.y) - 0.5 * uCssSize) / normDim;

  // 21st.dev exact "silk" domain-warping recipe (u_scale = 1.26, u_intensity = 0.50)
  sp *= 1.26;
  vec2 q = sp * 1.6;
  float silkTime = uTime * 0.42;
  float seed = (uP1.x + uP2.y) * 1.7 + 1.0;
  float amp = 0.675;

  for (int iter = 1; iter <= 4; iter++) {
    float fi = float(iter);
    q.x += (amp / fi) * cos(fi * 2.4 * q.y + silkTime * 0.8 + seed);
    q.y += (amp / fi) * cos(fi * 1.7 * q.x + silkTime * 0.6);
  }

  float silkWave = 0.5 + 0.5 * sin(q.x + q.y);
  vec3 meshSrgb = silkPalette(silkWave, uAvB, uAvA, uAvL, uAvP);

  meshSrgb = clamp((meshSrgb - 0.5) * 0.98 + 0.5, 0.0, 1.0);
  float grain = (hash21(gl_FragCoord.xy + vec2(17.0, 31.0) + fract(uTime * 0.05)) - 0.5) * 0.030;
  meshSrgb = blendOverlay(meshSrgb, 0.5 + grain);

  float dither = (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(meshSrgb + dither, 0.0, 1.0), 1.0);
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

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
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

export const SilkFlowCanvas: React.FC<SilkFlowCanvasProps> = ({
  paletteId,
  paused = false,
  className,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteIdRef = useRef<GrainMeshId>(paletteId);
  const pausedRef = useRef<boolean>(paused);
  const wakeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    paletteIdRef.current = paletteId;
    wakeRef.current?.();
  }, [paletteId]);

  useEffect(() => {
    pausedRef.current = paused;
    wakeRef.current?.();
  }, [paused]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const gl = (canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: "low-power",
    }) ||
      canvas.getContext("experimental-webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
      })) as WebGLRenderingContext | null;

    const program = gl ? createProgram(gl) : null;
    if (!gl || !program) {
      // Keep the CSS `[data-av]` backdrop visible as a graceful zero-black fallback
      canvas.style.display = "none";
      return;
    }

    gl.useProgram(program);
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      uCssSize: gl.getUniformLocation(program, "uCssSize"),
      uDpr: gl.getUniformLocation(program, "uDpr"),
      uTime: gl.getUniformLocation(program, "uTime"),
      uAvA: gl.getUniformLocation(program, "uAvA"),
      uAvB: gl.getUniformLocation(program, "uAvB"),
      uAvL: gl.getUniformLocation(program, "uAvL"),
      uAvP: gl.getUniformLocation(program, "uAvP"),
      uP1: gl.getUniformLocation(program, "uP1"),
      uP2: gl.getUniformLocation(program, "uP2"),
    };

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const initSpec =
      SILK_MESH_PALETTES[paletteIdRef.current] || SILK_MESH_PALETTES["1"];
    const curAvA = [...initSpec.a];
    const curAvB = [...initSpec.b];
    const curAvL = [...initSpec.l];
    const curAvP = [...initSpec.p];
    const curP1 = [...initSpec.p1];
    const curP2 = [...initSpec.p2];

    const startTime = performance.now();
    let rafId = 0;
    let destroyed = false;

    const drawFrame = (nowMs: number, snapPalette: boolean) => {
      if (width <= 0 || height <= 0) return;

      const targetSpec =
        SILK_MESH_PALETTES[paletteIdRef.current] || SILK_MESH_PALETTES["1"];
      const cLerp = snapPalette ? 1 : 0.09;
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

      const t = reducedMotion ? 3.5 : (nowMs - startTime) / 1000;

      gl.useProgram(program);
      gl.uniform2f(uniforms.uCssSize, width, height);
      gl.uniform1f(uniforms.uDpr, dpr);
      gl.uniform1f(uniforms.uTime, t);
      gl.uniform3f(uniforms.uAvA, curAvA[0], curAvA[1], curAvA[2]);
      gl.uniform3f(uniforms.uAvB, curAvB[0], curAvB[1], curAvB[2]);
      gl.uniform3f(uniforms.uAvL, curAvL[0], curAvL[1], curAvL[2]);
      gl.uniform3f(uniforms.uAvP, curAvP[0], curAvP[1], curAvP[2]);
      gl.uniform2f(uniforms.uP1, curP1[0], curP1[1]);
      gl.uniform2f(uniforms.uP2, curP2[0], curP2[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const shouldLoop = () =>
      !destroyed &&
      !reducedMotion &&
      !pausedRef.current &&
      !document.hidden &&
      width > 0 &&
      height > 0;

    const tick = (nowMs: number) => {
      rafId = 0;
      if (destroyed) return;
      drawFrame(nowMs, false);
      if (shouldLoop()) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const wake = () => {
      if (destroyed) return;
      if (reducedMotion) {
        drawFrame(performance.now(), true);
        return;
      }
      if (shouldLoop() && !rafId) {
        rafId = window.requestAnimationFrame(tick);
      } else if (!shouldLoop() && rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    wakeRef.current = wake;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const nextW = Math.round(rect.width);
      const nextH = Math.round(rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (nextW <= 0 || nextH <= 0) {
        width = 0;
        height = 0;
        return;
      }

      const pxW = Math.max(1, Math.floor(nextW * dpr));
      const pxH = Math.max(1, Math.floor(nextH * dpr));
      if (nextW !== width || nextH !== height || canvas.width !== pxW || canvas.height !== pxH) {
        width = nextW;
        height = nextH;
        canvas.width = pxW;
        canvas.height = pxH;
        gl.viewport(0, 0, pxW, pxH);
        drawFrame(performance.now(), reducedMotion);
      }
      wake();
    };

    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const onVisibilityChange = () => wake();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      destroyed = true;
      wakeRef.current = null;
      if (rafId) window.cancelAnimationFrame(rafId);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (quadBuf) gl.deleteBuffer(quadBuf);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      data-av={paletteId}
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
};
