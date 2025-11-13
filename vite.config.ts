import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import { defineConfig } from "vite";

//import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "post-build",
      closeBundle() {
        try {
          const source = resolve(__dirname, "dist/src/sidebar/index.html");
          const dest = resolve(__dirname, "dist/sidebar.html");
          const srcDir = resolve(__dirname, "dist/src");
          let html = readFileSync(source, "utf-8");

          html = html.replace(/src="\/assets\//g, 'src="./assets/');
          html = html.replace(/href="\/assets\//g, 'href="./assets/');

          writeFileSync(dest, html);
          rmSync(srcDir, { recursive: true, force: true });

          console.log(
            "Moved sidebar.html to dist root and cleaned up src directory"
          );
        } catch (e) {
          console.error("Failed to move sidebar.html:", e);
        }
      },
    },
  ],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidebar: resolve(__dirname, "src/sidebar/index.html"),
        background: resolve(__dirname, "src/background/background.ts"),
        content: resolve(__dirname, "src/content/content.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background" || chunkInfo.name === "content") {
            return "[name].js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
});
