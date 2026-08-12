import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("development"),
  },
  build: {
    minify: false,
  },
});
