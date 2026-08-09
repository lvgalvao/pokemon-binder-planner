import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // As imagens das cartas sao servidas por app/img/[...path] direto do disco,
  // fora de public/ — 881 MB nao entram no bundle.
  outputFileTracingExcludes: { "*": ["./assets/**"] },

  // Os manifests sao lidos com fs em runtime a partir de um caminho montado
  // (path.join), que o tracer nao consegue seguir sozinho. Sem isto o build
  // passa e a producao quebra com "data/manifests nao encontrada".
  outputFileTracingIncludes: { "/**": ["./data/manifests/**"] },
};

export default nextConfig;
