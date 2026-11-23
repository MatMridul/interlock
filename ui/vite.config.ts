/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: `npm run dev` on 5173 proxies API calls to the FastAPI server on 127.0.0.1:8000.
// Production: FastAPI serves ui/dist from the same origin, so the UI uses relative URLs.
const api = "http://127.0.0.1:8000";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    fs: { allow: [".."] }, // tests read policy/ and docs/reports/ as the single source
    proxy: { "/policy": api, "/session": api, "/config": api },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
  },
});
