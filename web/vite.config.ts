import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API runs separately (pnpm dev or pnpm demo in server/) and Vite passes /v1 to
// it: on port 3000, or at API_URL.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        strictPort: true,
        proxy: { "/v1": process.env.API_URL || "http://localhost:3000" },
    },
});
