import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        changeOrigin: true,
        /**
         * Forward a dropped upstream socket to the browser as a dropped socket.
         *
         * The mock service ends some streams by destroying the connection, with
         * no closing frame. Left alone the proxy swallows that: it ends the
         * response cleanly, so `fetch` resolves as if the turn finished and a
         * dead stream becomes indistinguishable from a quiet one. Destroying the
         * client response keeps the distinction the transcript has to draw.
         */
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes, _req, res) => {
            const drop = () => res.socket?.destroy();
            proxyRes.on("aborted", drop);
            proxyRes.on("error", drop);
          });
        },
        target: "http://localhost:8787",
      },
    },
  },
});
