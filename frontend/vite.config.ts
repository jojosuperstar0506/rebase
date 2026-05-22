import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Dev: route /api/* to the Express backend (port 3000).
      // CI endpoints, the new onboarding wizard, and all v2 auth routes
      // live in backend/server.js. Production routes /api/* through the
      // Vercel rewrites in vercel.json which proxy to ECS_URL (also Express).
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
