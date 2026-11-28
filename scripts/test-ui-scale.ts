import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { emit, TauriEvent } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { applyUiZoom, watchAutoUiScale } from "../src/lib/uiScale";

const webview = Object.assign(new EventTarget(), {
  crypto: globalThis.crypto,
  setTimeout,
  clearTimeout,
  devicePixelRatio: 1.5,
  innerWidth: 1400,
  screen: { width: 1707 },
});
Object.defineProperty(globalThis, "window", { value: webview });
Object.defineProperty(globalThis, "navigator", { value: { platform: "Win32" } });

let scaleFactor = 1.5;
let size = { width: 2100, height: 1320 };
let monitorSize = { width: 2560, height: 1440 };
let nativeReads = 0;
const applied: number[] = [];

mockWindows("main");
mockIPC((command, args) => {
  switch (command) {
    case "plugin:window|scale_factor":
      nativeReads++;
      return scaleFactor;
    case "plugin:window|inner_size":
      return size;
    case "plugin:window|current_monitor": {
      const position = { x: 0, y: 0 };
      return { scaleFactor, size: monitorSize, position, workArea: { position, size: monitorSize } };
    }
    case "plugin:webview|set_webview_zoom": {
      const zoom = (args as { value: number }).value;
      applied.push(zoom);
      webview.devicePixelRatio = scaleFactor * zoom;
      webview.innerWidth = Math.round(size.width / webview.devicePixelRatio);
      webview.dispatchEvent(new Event("resize"));
      return;
    }
    default:
      throw new Error(`Unexpected Tauri command ${command}`);
  }
}, { shouldMockEvents: true });

const stop = watchAutoUiScale((scale) => void applyUiZoom(scale));
await delay(0);
assert.deepEqual(applied, [1.08]);
assert.ok(webview.devicePixelRatio > 1.6, "Page zoom crosses the old DPI threshold");
assert.equal(nativeReads, 1, "WebView resize must not trigger another DPI read");

size = { width: 1680, height: 1320 };
await emit(TauriEvent.WINDOW_RESIZED, size);
await delay(180);
assert.deepEqual(applied, [1.08, 1.05], "Native window resize must still limit zoom on narrow windows");

scaleFactor = 1.25;
size = { width: 1750, height: 1100 };
monitorSize = { width: 2560, height: 1600 };
await emit(TauriEvent.WINDOW_MOVED, { x: 2000, y: 0 });
await emit(TauriEvent.WINDOW_SCALE_FACTOR_CHANGED, { scaleFactor, size });
await delay(180);
assert.deepEqual(applied, [1.08, 1.05, 1.15], "Moving to a 125% display must update zoom once");
assert.equal(nativeReads, 3);

stop?.();
await delay(0);
await emit(TauriEvent.WINDOW_RESIZED, size);
await delay(180);
assert.equal(nativeReads, 3, "Disposing the watcher must stop native updates");

console.log("UI scale regression checks passed");
