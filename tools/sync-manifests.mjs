/**
 * Copia os manifests de assets/ para data/manifests/.
 *
 * assets/ tem 881 MB e fica fora do git; os 25 manifests somam 1 MB e ficam
 * dentro. Sao a unica parte do dado externo que o app precisa ter em maos no
 * servidor — o resto sao imagens, que vao para o Storage.
 *
 * Rodar depois de repovoar assets/ (ver .llm/spec-download-assets.md §11):
 *   node tools/sync-manifests.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const ASSETS = path.join(process.cwd(), "assets");
const DESTINO = path.join(process.cwd(), "data", "manifests");

if (!existsSync(ASSETS)) {
  console.error(`assets/ nao encontrada em ${ASSETS}. Veja .llm/spec-download-assets.md §11.`);
  process.exit(1);
}

mkdirSync(DESTINO, { recursive: true });

let n = 0;
for (const entry of readdirSync(ASSETS, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const origem = path.join(ASSETS, entry.name, "manifest.json");
  if (!existsSync(origem)) continue;
  const m = JSON.parse(readFileSync(origem, "utf8"));
  // Grava pelo setId do proprio manifest, nao pelo nome da pasta: e o setId
  // que o app usa como chave em todo lugar.
  writeFileSync(path.join(DESTINO, `${m.setId}.json`), JSON.stringify(m), "utf8");
  n++;
}

console.log(`${n} manifests em data/manifests/`);
