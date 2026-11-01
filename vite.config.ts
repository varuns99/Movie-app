import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

export default defineConfig({
  base: "/Movie-app/",
  plugins: [react()],
  // The version shown on the Profile page comes straight from package.json.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
