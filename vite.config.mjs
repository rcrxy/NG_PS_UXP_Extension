import { cpSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
    },
    plugins: [
        react(),
        {
            name: "copy-uxp-assets",
            closeBundle() {
                const outDir = resolve("dist");

                mkdirSync(outDir, { recursive: true });
                copyFileSync(resolve("src/manifest.json"), resolve(outDir, "manifest.json"));
                cpSync(resolve("src/asset"), resolve(outDir, "asset"), { recursive: true });
            },
        },
    ],
    build: {
        target: "es2020",
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: false,
        minify: false,
        lib: {
            entry: "src/main.jsx",
            formats: ["cjs"],
            fileName: () => "main.js",
        },
        rollupOptions: {
            external: ["uxp", "photoshop"],
            output: {
                exports: "named",
                codeSplitting: false,
            },
        },
    },
});
