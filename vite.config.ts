import { defineConfig } from "vitest/config";

// Göreli `base`, derlenen dosyaların GitHub Pages alt yolunda (/SAGGCAD/) da çalışmasını sağlar.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", sourcemap: true },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
