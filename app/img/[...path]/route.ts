import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { ASSETS_DIR } from "@/lib/manifests";
import { BUCKETS } from "@/lib/types";

/**
 * Serve as imagens direto de assets/, que fica fora de public/ — 830 MB nao entram
 * no bundle. O nome do arquivo vem, na origem, de dado externo (o `card.id` da API),
 * entao o caminho e validado contra uma whitelist antes de tocar o disco.
 * Mesma regra anti-path-injection da spec de assets §6.
 */
const CARD_IMAGE = new RegExp(`^[A-Za-z0-9_-]+/(${BUCKETS.join("|")})/[A-Za-z0-9_-]+\\.jpg$`);
const COVER = /^[A-Za-z0-9_-]+\/capa\.png$/;
const CARD_BACK = /^card-back\.jpg$/;

function isAllowed(rel: string): boolean {
  if (rel.includes("..") || rel.includes("\\") || path.isAbsolute(rel)) return false;
  return CARD_IMAGE.test(rel) || COVER.test(rel) || CARD_BACK.test(rel);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const rel = segments.join("/");

  if (!isAllowed(rel)) {
    return new Response("Not found", { status: 404 });
  }

  const file = path.join(ASSETS_DIR, rel);
  // Cinto e suspensorio: mesmo aprovado pela regex, o caminho resolvido tem de
  // continuar dentro de assets/.
  if (!file.startsWith(ASSETS_DIR + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  let size: number;
  try {
    const stat = statSync(file);
    if (!stat.isFile()) return new Response("Not found", { status: 404 });
    size = stat.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": rel.endsWith(".png") ? "image/png" : "image/jpeg",
      "Content-Length": String(size),
      // O conteudo de um arquivo de carta nunca muda.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
