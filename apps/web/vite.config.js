import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/ai": "http://localhost:8787",
      "/auth": "http://localhost:8787",
      "/barcode": "http://localhost:8787",
      "/ebay": "http://localhost:8787",
    },
  },
});
