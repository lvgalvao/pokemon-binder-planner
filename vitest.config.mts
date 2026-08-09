import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // lib/assets.ts exige a URL do Supabase para montar os caminhos das cartas, e
    // o vitest nao le .env.local sozinho. Um valor qualquer basta: os testes
    // conferem o FORMATO da URL, nunca buscam a imagem.
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co" },
  },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
