import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

// Always ship the exact PDF.js offline resources (cmaps, standard_fonts, wasm, iccs)
// matching the installed pdfjs-dist version so Chinese engineering drawings never depend on a CDN.
const pdfRoot = path.resolve(__dirname, "node_modules/pdfjs-dist");
const pdfPkg = JSON.parse(readFileSync(path.resolve(pdfRoot, "package.json"), "utf8")) as {
  version: string;
};
const pdfResourcePath = `pdfjs/${pdfPkg.version}`;

function preparePdfResources() {
  const dest = path.resolve(__dirname, "public", pdfResourcePath);
  const stampFile = path.resolve(dest, ".ready");
  if (existsSync(stampFile)) return;
  mkdirSync(dest, { recursive: true });
  for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
    const srcFolder = path.resolve(pdfRoot, folder);
    if (existsSync(srcFolder)) {
      cpSync(srcFolder, path.resolve(dest, folder), { recursive: true });
    }
  }
  const licenseSrc = path.resolve(pdfRoot, "LICENSE");
  if (existsSync(licenseSrc)) {
    cpSync(licenseSrc, path.resolve(dest, "LICENSE"));
  }
  writeFileSync(stampFile, `${pdfPkg.version}\n`, "utf8");
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-pdf-resources",
      buildStart: preparePdfResources,
    },
  ],
  define: {
    __PDF_RESOURCE_PATH__: JSON.stringify(pdfResourcePath),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  worker: {
    format: "es",
  },
  // Pre-bundle lazily imported and Web Worker dependencies upfront so the first
  // PDF/image export never triggers Vite runtime dep discovery & full-page reload.
  optimizeDeps: {
    include: [
      "pdf-lib",
      "fflate",
      "jszip",
      "pdfjs-dist/legacy/build/pdf.mjs",
    ],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/*.pdf",
        "**/*.zip",
        "**/*.xlsx",
      ],
    },
  },
  build: {
    target: ["es2022", "chrome105", "safari15"],
    chunkSizeWarningLimit: 1100,
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/pdfjs-dist")) return "vendor-pdfjs";
          if (id.includes("node_modules/exceljs")) return "vendor-exceljs";
          if (id.includes("node_modules/motion")) return "vendor-motion";
          return undefined;
        },
      },
    },
  },
});
