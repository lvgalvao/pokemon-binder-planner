import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Os manifests sao lidos com fs em runtime a partir de um caminho montado
  // (path.join), que o tracer nao consegue seguir sozinho. Sem isto o build
  // passa e a producao quebra com "data/manifests nao encontrada".
  outputFileTracingIncludes: { "/**": ["./data/manifests/**"] },

  // As cartas ja saem do Storage no tamanho e no formato certos (ver
  // tools/upload-assets.mjs), entao nao ha o que otimizar. Ligar o otimizador
  // aqui so gastaria cota: 4.589 cartas estourariam sozinhas, e o ganho seria
  // zero sobre um WebP de 400w que ja e o tamanho de exibicao.
  images: { unoptimized: true },
};

export default nextConfig;
