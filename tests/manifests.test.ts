import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { listSets, getManifest, MANIFESTS_DIR, ASSETS_DIR } from "@/lib/manifests";
import { BUCKETS } from "@/lib/types";

const sets = listSets();

describe("manifests versionados", () => {
  it("carrega os 27 sets", () => expect(sets).toHaveLength(27));

  it("todo manifest esta em data/manifests/<setId>.json", () => {
    for (const s of sets) {
      expect(existsSync(path.join(MANIFESTS_DIR, `${s.setId}.json`)), s.setId).toBe(true);
    }
  });

  it("todo manifest tem totalSet coerente com a lista de cartas", () => {
    for (const s of sets) {
      const m = getManifest(s.setId)!;
      expect(m.cards.length, s.setId).toBe(m.totalSet);
    }
  });

  it("nenhuma carta ficou de fora do download (unmapped vazio)", () => {
    for (const s of sets) {
      expect(getManifest(s.setId)!.unmapped, s.setId).toHaveLength(0);
    }
  });

  it("todo bucket e um dos literais conhecidos", () => {
    for (const s of sets) {
      for (const c of getManifest(s.setId)!.cards) {
        expect(BUCKETS).toContain(c.bucket);
      }
    }
  });

  it("as promos estao todas no bucket promo e so elas", () => {
    for (const s of sets) {
      for (const c of getManifest(s.setId)!.cards) {
        expect(c.bucket === "08_promo", `${c.id} (${c.rarityRaw})`).toBe(
          c.rarityRaw.toLowerCase() === "promo",
        );
      }
    }
  });

  it("ordena as familias das mais novas para as mais antigas, e numericamente dentro delas", () => {
    const ids = sets.map((s) => s.setId);
    expect(ids.indexOf("me5")).toBeLessThan(ids.indexOf("me1"));
    expect(ids.indexOf("me4")).toBeLessThan(ids.indexOf("base1"));
    expect(ids.indexOf("sv10")).toBeLessThan(ids.indexOf("sv1"));
    expect(ids.indexOf("sv2")).toBeLessThan(ids.indexOf("sv1"));
  });

  it("as promos fecham a familia: depois de me1, antes da familia seguinte", () => {
    const ids = sets.map((s) => s.setId);
    expect(ids.indexOf("me1")).toBeLessThan(ids.indexOf("mep"));
    expect(ids.indexOf("mep")).toBeLessThan(ids.indexOf("zsv10pt5"));
  });
});

/**
 * assets/ nao esta no repositorio e nao existe no CI nem no deploy. Estas checagens
 * so fazem sentido na maquina de quem acabou de rodar o downloader — e la elas sao
 * exatamente o que pega um manifest apontando para uma imagem que nao veio.
 */
describe.skipIf(!existsSync(ASSETS_DIR))("assets em disco", () => {
  it("toda capa.png existe em disco", () => {
    for (const s of sets) {
      expect(existsSync(path.join(ASSETS_DIR, s.coverPath)), s.setId).toBe(true);
    }
  });

  it("o verso da carta existe (usado nos bolsos vazios)", () => {
    expect(existsSync(path.join(ASSETS_DIR, "card-back.jpg"))).toBe(true);
  });

  it("todo imagePath aponta para um arquivo que existe", () => {
    const faltando: string[] = [];
    for (const s of sets) {
      for (const c of getManifest(s.setId)!.cards) {
        if (!existsSync(path.join(ASSETS_DIR, c.imagePath))) faltando.push(c.imagePath);
      }
    }
    expect(faltando).toEqual([]);
  });
});

describe("getManifest", () => {
  it("devolve null para set inexistente em vez de explodir", () => {
    expect(getManifest("nao-existe")).toBeNull();
  });
});
