import { sha256 } from './sha256';
self.onmessage = ({ data }: MessageEvent<Uint8Array>) => {
  self.postMessage(sha256(data));
};
