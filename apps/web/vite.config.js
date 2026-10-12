import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@supabase")) return "supabase";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react";
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      "/ai": "http://localhost:8787",
      "/auth": "http://localhost:8787",
      "/barcode": "http://localhost:8787",
      "/ebay": "http://localhost:8787",
    },
  },
});
