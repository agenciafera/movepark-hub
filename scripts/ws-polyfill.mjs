// Polyfill WebSocket for Node.js < 22 (used during vite-react-ssg SSG build)
import { default as WS } from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WS;
}
