import { describe, it, expect } from "vitest";
import { listSets, getManifest } from "@/lib/manifests";
import { webUrl, printUrl, coverUrl, CARD_BACK_URL } from "@/lib/assets";

const sets = listSets();
const todasAsCartas = sets.flatMap((s) => getManifest(s.setId)!.cards);

describe("URLs do Storage", () => {
  /**
   * setIdDe() corta o primeiro segmento de imagePath e o usa como setId. Se um
   * manifest futuro trouxer a pasta com nome diferente do setId, TODA carta
   * daquele set vira 404 — e o app so mostraria versos. Melhor quebrar aqui.
   */
  it("a pasta em imagePath e sempre igual ao setId", () => {
    const divergentes: string[] = [];
    for (const s of sets) {
      for (const c of getManifest(s.setId)!.cards) {
        const pasta = c.imagePath.slice(0, c.imagePath.indexOf("/"));
        if (pasta !== s.setId) divergentes.push(`${c.id}: ${pasta} != ${s.setId}`);
      }
    }
    expect(divergentes).toEqual([]);
  });

  it("monta o caminho que tools/upload-assets.mjs escreve", () => {
    const c = getManifest("sv7")!.cards.find((x) => x.id === "sv7-2")!;
    expect(webUrl(c)).toBe(
      "https://exemplo.supabase.co/storage/v1/object/public/cards/web/sv7/sv7-2.webp",
    );
    expect(printUrl(c)).toBe(
      "https://exemplo.supabase.co/storage/v1/object/public/cards/print/sv7/sv7-2.jpg",
    );
    expect(coverUrl("sv7")).toBe(
      "https://exemplo.supabase.co/storage/v1/object/public/cards/capa/sv7.webp",
    );
    expect(CARD_BACK_URL).toBe(
      "https://exemplo.supabase.co/storage/v1/object/public/cards/web/card-back.webp",
    );
  });

  /**
   * O nome do objeto no Storage vem do card.id cru. Um id com barra ou espaco
   * geraria um caminho que o upload escreveu de um jeito e o app pede de outro.
   */
  it("nenhum card.id tem caractere que mude o caminho", () => {
    const suspeitos = todasAsCartas
      .map((c) => c.id)
      .filter((id) => !/^[A-Za-z0-9_-]+$/.test(id));
    expect(suspeitos).toEqual([]);
  });

  it("as 4.589 cartas geram URLs unicas", () => {
    const urls = new Set(todasAsCartas.map(webUrl));
    expect(urls.size).toBe(todasAsCartas.length);
  });
});
