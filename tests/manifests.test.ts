import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { listSets, getManifest, ASSETS_DIR } from "@/lib/manifests";
import { BUCKETS } from "@/lib/types";

const sets = listSets();

describe("assets locais", () => {
  it("carrega os 25 sets", () => expect(sets).toHaveLength(25));

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

  it("todo bucket e um dos 7 literais", () => {
    for (const s of sets) {
      for (const c of getManifest(s.setId)!.cards) {
        expect(BUCKETS).toContain(c.bucket);
      }
    }
  });

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

  it("ordena as familias das mais novas para as mais antigas, e numericamente dentro delas", () => {
    const ids = sets.map((s) => s.setId);
    expect(ids.indexOf("me4")).toBeLessThan(ids.indexOf("base1"));
    expect(ids.indexOf("sv10")).toBeLessThan(ids.indexOf("sv1"));
    expect(ids.indexOf("sv2")).toBeLessThan(ids.indexOf("sv1"));
  });
});

describe("getManifest", () => {
  it("devolve null para set inexistente em vez de explodir", () => {
    expect(getManifest("nao-existe")).toBeNull();
  });
});
