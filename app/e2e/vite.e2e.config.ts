import { mergeConfig } from "vite";

import base from "../vite.config";

/** The app's own config, on ports of its own, so the end-to-end run never touches a dev server. */
export default mergeConfig(base, {
  server: {
    port: 5199,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:8799" } },
  },
});
