import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // As imagens das cartas sao servidas por app/img/[...path] direto do disco,
  // fora de public/ — 830 MB nao entram no bundle.
  outputFileTracingExcludes: { "*": ["./assets/**"] },
};

export default nextConfig;
