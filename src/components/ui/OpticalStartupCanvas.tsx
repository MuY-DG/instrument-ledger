import React, { useEffect, useRef } from "react";

interface OpticalStartupCanvasProps {
  /** "intro" plays the full from-nothing VFX choreography; "welcome" | "setup" settles gently; "complete" triggers an emerald optical ripple */
  phase: "intro" | "welcome" | "setup" | "complete";
  /** Monotonic counter to replay the opening VFX if ever needed */
  playKey?: number;
}

interface RibbonSpec {
  baseAngle: number;
  spinDir: number;
  turns: number;
  hue: string;
  rgb: [number, number, number];
  delay: number;
  duration: number;
  width: number;
}

interface DustSpec {
  angle: number;
  distFactor: number;
  size: number;
  speed: number;
  rgb: [number, number, number];
  burstAngle: number;
  burstSpeed: number;
  phase: number;
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

function easeInOutQuart(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2;
}

/**
 * 60fps HiDPI Light-Mode Optical VFX Engine
 *
 * Starts from pure serene porcelain emptiness (t = 0) and choreographs:
 * 1. Center optical ignition & 4-point diffraction star flare (0.18s -> 1.45s)
 * 2. Six translucent prism silk ribbons spiraling inward to the focal point (0.30s -> 1.50s)
 * 3. Fine prism dust particles converging & blooming gently on convergence (0.35s -> 2.85s)
 * 4. Three chromatic caustic light ripples sweeping outward, briefly illuminating a micro-dot field (1.30s -> 2.90s)
 * 5. Diagonal 45° glass specular light sweep across the viewport (1.55s -> 2.45s)
 * 6. Dissolves into pure whisper-soft daylight stillness, then halts rAF to keep idle CPU at 0%.
 */
export const OpticalStartupCanvas: React.FC<OpticalStartupCanvasProps> = ({
  phase,
  playKey = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    // Pre-generate deterministic luminous ribbons (light-mode daylight prism palette)
    const ribbons: RibbonSpec[] = [
      {
        baseAngle: -Math.PI * 0.85,
        spinDir: 1,
        turns: 1.15,
        hue: "indigo",
        rgb: [99, 102, 241],
        delay: 0.28,
        duration: 1.15,
        width: 2.1,
      },
      {
        baseAngle: Math.PI * 0.15,
        spinDir: 1,
        turns: 1.15,
        hue: "sky",
        rgb: [14, 165, 233],
        delay: 0.34,
        duration: 1.12,
        width: 1.9,
      },
      {
        baseAngle: -Math.PI * 0.35,
        spinDir: -1,
        turns: 1.05,
        hue: "violet",
        rgb: [139, 92, 246],
        delay: 0.4,
        duration: 1.08,
        width: 1.6,
      },
      {
        baseAngle: Math.PI * 0.65,
        spinDir: -1,
        turns: 1.05,
        hue: "cyan",
        rgb: [56, 189, 248],
        delay: 0.44,
        duration: 1.06,
        width: 1.7,
      },
      {
        baseAngle: Math.PI * 0.92,
        spinDir: 1,
        turns: 0.9,
        hue: "slate",
        rgb: [100, 116, 139],
        delay: 0.38,
        duration: 1.1,
        width: 1.2,
      },
      {
        baseAngle: -Math.PI * 0.08,
        spinDir: -1,
        turns: 0.9,
        hue: "indigo-soft",
        rgb: [129, 140, 248],
        delay: 0.48,
        duration: 1.02,
        width: 1.3,
      },
    ];

    // Pre-generate 68 fine prism dust particles
    const palette: Array<[number, number, number]> = [
      [99, 102, 241],
      [56, 189, 248],
      [139, 92, 246],
      [148, 163, 184],
      [79, 70, 229],
    ];
    const dusts: DustSpec[] = Array.from({ length: 68 }, (_, i) => {
      const golden = i * 2.3999632297;
      const frac = (i + 0.5) / 68;
      return {
        angle: golden,
        distFactor: 0.24 + frac * 0.58,
        size: 1.1 + (i % 4) * 0.55,
        speed: 0.78 + (i % 5) * 0.1,
        rgb: palette[i % palette.length],
        burstAngle: golden + (i % 2 === 0 ? 0.45 : -0.45),
        burstSpeed: 0.26 + ((i * 17) % 10) * 0.055,
        phase: (i * 0.618) % 1,
      };
    });

    const startMs = performance.now();
    let rafId = 0;
    let running = true;

    const renderFrame = (nowMs: number) => {
      if (!running || phaseRef.current === "complete") return;
      const t = (nowMs - startMs) / 1000;
      const currentPhase = phaseRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.5;
      const maxDim = Math.hypot(width, height);
      const minDim = Math.min(width, height);

      // ------------------------------------------------------------------
      // 1. Ambient Daylight Prism Caustic Wash (gently blooms from 0.16s)
      // ------------------------------------------------------------------
      const washIn = easeOutCubic((t - 0.16) / 1.1);
      const washSettle =
        currentPhase === "setup" ? 0.52 : currentPhase === "welcome" ? 0.68 : 1.0;
      const driftX = Math.sin(t * 0.45) * 26;
      const driftY = Math.cos(t * 0.35) * 18;

      if (washIn > 0.001) {
        // Primary pearl-indigo daylight bloom
        const r1 = minDim * (0.42 + washIn * 0.28);
        const g1 = ctx.createRadialGradient(
          cx + driftX,
          cy - 24 + driftY,
          0,
          cx + driftX,
          cy - 24 + driftY,
          r1
        );
        g1.addColorStop(0, `rgba(129, 140, 248, ${0.13 * washIn * washSettle})`);
        g1.addColorStop(0.42, `rgba(186, 230, 253, ${0.09 * washIn * washSettle})`);
        g1.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = g1;
        ctx.fillRect(0, 0, width, height);

        // Secondary warm champagne-sky counter-wash
        const r2 = minDim * 0.5;
        const g2 = ctx.createRadialGradient(
          cx - driftX * 1.2 + minDim * 0.14,
          cy + 40 - driftY,
          0,
          cx - driftX * 1.2 + minDim * 0.14,
          cy + 40 - driftY,
          r2
        );
        g2.addColorStop(0, `rgba(224, 231, 255, ${0.14 * washIn * washSettle})`);
        g2.addColorStop(0.55, `rgba(254, 243, 199, ${0.06 * washIn * washSettle})`);
        g2.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, width, height);
      }

      // Skip opening burst layers if user clicked Skip straight into welcome/setup
      const introActive = t < 3.45 && currentPhase !== "setup";

      if (introActive) {
        // ------------------------------------------------------------------
        // 2. Optical Seed Ignition & 4-Point Diffraction Flare (0.16s -> 1.65s)
        // ------------------------------------------------------------------
        if (t >= 0.16 && t <= 1.75) {
          const rise = easeOutCubic((t - 0.16) / 0.42);
          const peakPulse =
            t >= 1.24 ? Math.exp(-Math.pow((t - 1.35) / 0.16, 2)) * 0.85 : 0;
          const fadeOut = 1 - easeOutCubic((t - 1.38) / 0.36);
          const alpha = clamp01(rise * fadeOut + peakPulse * fadeOut);

          if (alpha > 0.004) {
            // Soft core bloom
            const coreR = 14 + rise * 28 + peakPulse * 46;
            const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
            cg.addColorStop(0, `rgba(255, 255, 255, ${0.95 * alpha})`);
            cg.addColorStop(0.35, `rgba(99, 102, 241, ${0.38 * alpha})`);
            cg.addColorStop(0.7, `rgba(56, 189, 248, ${0.14 * alpha})`);
            cg.addColorStop(1, "rgba(255, 255, 255, 0)");
            ctx.fillStyle = cg;
            ctx.beginPath();
            ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
            ctx.fill();

            // Horizontal & vertical razor-sharp optical lens diffraction spikes
            const spikeLenX = (36 + rise * 78 + peakPulse * 95) * alpha;
            const spikeLenY = (24 + rise * 52 + peakPulse * 64) * alpha;

            const drawSpike = (dx: number, dy: number, thickness: number) => {
              const lg = ctx.createLinearGradient(
                cx - dx,
                cy - dy,
                cx + dx,
                cy + dy
              );
              lg.addColorStop(0, "rgba(99, 102, 241, 0)");
              lg.addColorStop(0.35, `rgba(99, 102, 241, ${0.26 * alpha})`);
              lg.addColorStop(0.5, `rgba(255, 255, 255, ${0.95 * alpha})`);
              lg.addColorStop(0.65, `rgba(14, 165, 233, ${0.26 * alpha})`);
              lg.addColorStop(1, "rgba(14, 165, 233, 0)");
              ctx.strokeStyle = lg;
              ctx.lineWidth = thickness;
              ctx.lineCap = "round";
              ctx.beginPath();
              ctx.moveTo(cx - dx, cy - dy);
              ctx.lineTo(cx + dx, cy + dy);
              ctx.stroke();
            };

            drawSpike(spikeLenX, 0, 1.4);
            drawSpike(0, spikeLenY, 1.2);
          }
        }

        // ------------------------------------------------------------------
        // 3. Six Translucent Luminous Silk Ribbons Spiraling Inward (0.28s -> 1.65s)
        // ------------------------------------------------------------------
        const maxOrbitR = minDim * 0.44;
        for (const r of ribbons) {
          const local = (t - r.delay) / r.duration;
          if (local <= 0 || local >= 1.15) continue;

          const head = easeInOutQuart(clamp01(local));
          const tail = easeInOutQuart(clamp01(local - 0.34));
          const envAlpha =
            clamp01(local / 0.16) * (1 - clamp01((local - 0.88) / 0.25));
          if (envAlpha <= 0.004 || head <= tail) continue;

          const steps = 26;
          const [cr, cg, cb] = r.rgb;
          for (let s = 0; s < steps; s++) {
            const f0 = tail + ((head - tail) * s) / steps;
            const f1 = tail + ((head - tail) * (s + 1)) / steps;
            const segAlpha = Math.pow(s / steps, 1.6) * envAlpha * 0.46;

            const rad0 = maxOrbitR * Math.pow(1 - f0, 1.35);
            const ang0 = r.baseAngle + r.spinDir * f0 * Math.PI * 2 * r.turns;
            const x0 = cx + Math.cos(ang0) * rad0;
            const y0 = cy + Math.sin(ang0) * rad0 * 0.86;

            const rad1 = maxOrbitR * Math.pow(1 - f1, 1.35);
            const ang1 = r.baseAngle + r.spinDir * f1 * Math.PI * 2 * r.turns;
            const x1 = cx + Math.cos(ang1) * rad1;
            const y1 = cy + Math.sin(ang1) * rad1 * 0.86;

            ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${segAlpha})`;
            ctx.lineWidth = r.width * (0.45 + 0.75 * (s / steps));
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
          }

          // Bright leading bead on each light ribbon
          const headRad = maxOrbitR * Math.pow(1 - head, 1.35);
          const headAng = r.baseAngle + r.spinDir * head * Math.PI * 2 * r.turns;
          const hx = cx + Math.cos(headAng) * headRad;
          const hy = cy + Math.sin(headAng) * headRad * 0.86;

          const beadGlow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 9);
          beadGlow.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.72 * envAlpha})`);
          beadGlow.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
          ctx.fillStyle = beadGlow;
          ctx.beginPath();
          ctx.arc(hx, hy, 9, 0, Math.PI * 2);
          ctx.fill();
        }

        // ------------------------------------------------------------------
        // 4. Chromatic Caustic Ripples + Ephemeral Micro-Dot Scan Field (1.30s -> 2.95s)
        // ------------------------------------------------------------------
        const rippleStarts = [1.3, 1.46, 1.66];
        const rippleColors: Array<[number, number, number]> = [
          [79, 70, 229],
          [14, 165, 233],
          [148, 163, 184],
        ];
        let primaryWaveR = -1;
        let primaryWaveAlpha = 0;

        rippleStarts.forEach((rStart, idx) => {
          const dur = 1.25 + idx * 0.14;
          const u = (t - rStart) / dur;
          if (u <= 0 || u >= 1) return;

          const eased = easeOutQuart(u);
          const radius = 20 + eased * maxDim * 0.54;
          const alpha = (1 - u) * (1 - u) * (idx === 0 ? 0.36 : 0.22);

          if (idx === 0) {
            primaryWaveR = radius;
            primaryWaveAlpha = 1 - u;
          }

          const [cr, cg, cb] = rippleColors[idx];
          // Outer soft halo stroke
          ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.45})`;
          ctx.lineWidth = idx === 0 ? 7 * (1 - u * 0.6) : 3.5;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();

          // Inner razor hairline caustic edge
          ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
          ctx.lineWidth = idx === 0 ? 1.3 : 1;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();
        });

        // Ephemeral precision dot matrix briefly illuminated ONLY where the primary optical ripple passes!
        if (primaryWaveR > 0 && primaryWaveAlpha > 0.02) {
          const spacing = 36;
          const bandWidth = 86;
          const cols = Math.ceil(width / spacing);
          const rows = Math.ceil(height / spacing);
          const offsetX = (width - cols * spacing) * 0.5;
          const offsetY = (height - rows * spacing) * 0.5;

          for (let gy = 0; gy <= rows; gy++) {
            const py = offsetY + gy * spacing;
            const dy = py - cy;
            for (let gx = 0; gx <= cols; gx++) {
              const px = offsetX + gx * spacing;
              const dist = Math.hypot(px - cx, dy);
              const delta = Math.abs(dist - primaryWaveR);
              if (delta < bandWidth) {
                const waveIntensity =
                  Math.cos((delta / bandWidth) * Math.PI * 0.5) *
                  primaryWaveAlpha;
                if (waveIntensity > 0.03) {
                  ctx.fillStyle = `rgba(79, 70, 229, ${waveIntensity * 0.24})`;
                  ctx.beginPath();
                  ctx.arc(px, py, 1.15 + waveIntensity * 0.65, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
            }
          }
        }

        // ------------------------------------------------------------------
        // 5. Fine Prism Dust Particles (Inward convergence -> gentle crystalline drift)
        // ------------------------------------------------------------------
        if (t >= 0.3 && t <= 3.1) {
          const convergeEnd = 1.36;
          for (const d of dusts) {
            const [cr, cg, cb] = d.rgb;
            if (t < convergeEnd) {
              const u = clamp01((t - 0.3) / (convergeEnd - 0.3));
              const e = easeInOutQuart(u);
              const dist = maxDim * 0.45 * d.distFactor * (1 - e * 0.94);
              const ang = d.angle + e * 1.45 * d.speed;
              const px = cx + Math.cos(ang) * dist;
              const py = cy + Math.sin(ang) * dist * 0.88;
              const alpha = clamp01(u / 0.25) * 0.45;
              ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
              ctx.beginPath();
              ctx.arc(px, py, d.size * (0.7 + 0.4 * e), 0, Math.PI * 2);
              ctx.fill();
            } else {
              const u = clamp01((t - convergeEnd) / 1.65);
              const e = easeOutCubic(u);
              const dist = 32 + e * minDim * 0.44 * d.burstSpeed * 2.1;
              const ang = d.burstAngle + e * 0.35;
              const px = cx + Math.cos(ang) * dist;
              const py = cy + Math.sin(ang) * dist * 0.9;
              const alpha = (1 - u) * (1 - u) * 0.42;
              if (alpha > 0.01) {
                ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
                ctx.beginPath();
                ctx.arc(px, py, d.size * (1 - u * 0.35), 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }

        // ------------------------------------------------------------------
        // 6. 45° Diagonal Glass Specular Light Sweep (1.52s -> 2.48s)
        // ------------------------------------------------------------------
        if (t >= 1.52 && t <= 2.55) {
          const u = clamp01((t - 1.52) / 0.98);
          const e = easeInOutQuart(u);
          const sweepX = -width * 0.35 + e * width * 1.7;
          const alpha = Math.sin(u * Math.PI) * 0.45;

          ctx.save();
          ctx.translate(sweepX, height * 0.5);
          ctx.rotate(-0.42);
          const sg = ctx.createLinearGradient(-150, 0, 150, 0);
          sg.addColorStop(0, "rgba(255, 255, 255, 0)");
          sg.addColorStop(0.35, `rgba(255, 255, 255, ${alpha * 0.65})`);
          sg.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
          sg.addColorStop(0.65, `rgba(224, 231, 255, ${alpha * 0.55})`);
          sg.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = sg;
          ctx.fillRect(-150, -maxDim, 300, maxDim * 2);
          ctx.restore();
        }
      }

      // Keep running smoothly during VFX and gently settle; pause rAF when fully idle to save CPU
      if (t < 4.2) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      running = false;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [playKey]);

  // Wake one-shot ripple animation when phase transitions to "complete"
  useEffect(() => {
    if (phase !== "complete") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const start = performance.now();
    let raf = 0;
    const drawCompleteWave = (now: number) => {
      const ct = (now - start) / 1000;
      if (ct > 1.15) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.5;
      const maxDim = Math.hypot(width, height);
      const u = clamp01(ct / 1.05);
      const e = easeOutQuart(u);

      // Soft emerald-pearl ambient glow
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, height) * 0.45);
      bg.addColorStop(0, `rgba(16, 185, 129, ${0.09 * (1 - u * 0.5)})`);
      bg.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const rad = 24 + e * maxDim * 0.45;
      const alpha = (1 - u) * (1 - u) * 0.34;
      ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();

      raf = window.requestAnimationFrame(drawCompleteWave);
    };
    raf = window.requestAnimationFrame(drawCompleteWave);
    return () => window.cancelAnimationFrame(raf);
  }, [phase]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    />
  );
};
