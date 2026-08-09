# Spec: Download & Organização de Assets Pokémon TCG

**Status**: implementado e validado em produção (25 sets, ~4.6k cartas, ~880 MB em disco)
**Origem**: extraído do projeto `PokeTCG` / feature `001-pokemon-booster-opener`
**Alvo**: qualquer projeto novo que precise de imagens de cartas Pokémon TCG organizadas por raridade
**Runtime**: Python 3.11+ (`requests` + `Pillow`)
**Fonte de dados**: [pokemontcg.io API v2](https://api.pokemontcg.io/v2) — gratuita, API key opcional (aumenta rate limit)

---

## 1. Objetivo

Popular um diretório `assets/` com as imagens de cartas de um ou mais sets do Pokémon TCG,
organizadas em **7 buckets de raridade**, e gerar um `manifest.json` por set que serve como
**single source of truth** para o cliente (web, mobile, backend — indiferente).

O utilitário é um **script standalone idempotente**: rodar N vezes produz o mesmo estado em
disco, sem re-baixar nada já presente.

### Não-objetivos

- Não instala como pacote Python — é script standalone com `if __name__ == '__main__'`.
- Não otimiza imagens além da conversão para JPG.
- Não conhece nem depende do cliente que consome os assets.
- Não deleta arquivos (exceto sobrescrever o mesmo JPG sob `--force`).

---

## 2. Layout em disco (contrato de saída)

```
assets/
├── <setId>/                       # ex.: sv3pt5, sv7, me4, base1, pgo
│   ├── 01_comum/                  # <cardId>.jpg
│   ├── 02_incomum/
│   ├── 03_raras/
│   ├── 04_duplo_raras/
│   ├── 05_arte_secreta/
│   ├── 06_duplo_arte_secreta/
│   ├── 07_legendaria/
│   ├── capa.png                   # arte do pacote (488x896) — ver §7
│   └── manifest.json              # catálogo do set — ver §5
└── <outroSetId>/
    └── ...
```

**Invariantes:**

- Os nomes dos 7 buckets são **fixos e literais** (whitelist). O script cria **apenas** esses
  diretórios sob `assets/<setId>/` e nunca outros.
- Nome do arquivo de imagem == `<card.id>` da API (ex.: `sv7-2.jpg`), garantindo unicidade global.
- Um `manifest.json` **por set** (não um global). Um índice global de sets, se necessário,
  é responsabilidade do cliente (ver §8).

---

## 3. CLI

```bash
python tools/download_cards.py [OPTIONS]
```

| Flag | Default | Descrição |
|------|---------|-----------|
| `--set-id <id>` | `sv3pt5` | Identificador do set na pokemontcg.io. |
| `--latest <N>` | — | Baixa os N sets mais recentes (`orderBy=-releaseDate`). **Sobrepõe** `--set-id`. |
| `--assets-dir <path>` | `./assets` | Raiz onde criar `<setId>/` com as 7 subpastas e o manifest. |
| `--api-key <key>` | env `POKEMONTCG_API_KEY` | Opcional. Aumenta o rate limit. |
| `--retries <n>` | `3` | Tentativas por imagem antes de marcar como falha. |
| `--retry-backoff <s>` | `1.0` | Backoff exponencial inicial: espera `backoff * 2^tentativa`. |
| `--quality <0..100>` | `85` | Qualidade JPG. |
| `--force` | `false` | Re-baixa mesmo se o destino já existir (override de idempotência). |
| `--dry-run` | `false` | Lista o que seria feito; não baixa imagens nem escreve JPGs (o manifest **é** escrito). |
| `--verbose` | `false` | Log em nível DEBUG por carta. |

### Exemplos

```bash
python tools/download_cards.py --set-id sv3pt5            # set 151
python tools/download_cards.py --latest 5                 # 5 sets mais recentes
python tools/download_cards.py --set-id sv7 --force       # re-baixa tudo do sv7
POKEMONTCG_API_KEY=xxx python tools/download_cards.py --latest 10
```

### Exit codes

| Code | Significado |
|------|-------------|
| `0` | Tudo OK, nenhuma falha persistente. |
| `2` | Falhas parciais — algumas cartas em `failed[]`, manifest gerado, resto baixado. CI pode tratar como warning. Também é o código do argparse para erro de uso. |
| `3` | Falha total — não conseguiu listar nenhuma carta da API (rede/auth/set inexistente). Manifest não é gerado. |
| `130` | Interrompido por SIGINT (Ctrl-C). |

Com `--latest N`, o código de saída é o **pior** entre os sets processados.

---

## 4. Mapeamento de raridades (NON-NEGOTIABLE)

A API retorna `card.rarity` como string livre. O script mapeia para os 7 buckets locais.
Comparação **case-insensitive** após `.strip().lower()`.

| Raridade-fonte (lower) | Bucket local |
|---|---|
| `common` | `01_comum` |
| `uncommon` | `02_incomum` |
| `rare`, `rare holo` | `03_raras` |
| `double rare`, `rare ultra`, `ultra rare`, `rare holo ex`, `rare holo gx`, `rare holo v`, `rare holo vmax`, `rare holo vstar`, `radiant rare`, `shiny rare` | `04_duplo_raras` |
| `illustration rare` | `05_arte_secreta` |
| `special illustration rare`, `shiny ultra rare`, `rare rainbow`, `rare secret` | `06_duplo_arte_secreta` |
| `hyper rare`, `ace spec rare`, `black white rare`, `mega_attack_rare`, `mega hyper rare` | `07_legendaria` |

### Regras de fallback

1. **Energia básica sem raridade**: se `rarity` é vazio/ausente **E** `supertype == "Energy"`
   **E** `"basic"` está em `subtypes` → bucket `01_comum`. (Sets modernos omitem raridade de
   energias básicas; sem essa regra elas somem do catálogo.)
2. **Qualquer outra raridade não mapeada** → a carta **não é baixada**, e entra no array
   `unmapped[]` do manifest com `{id, name, rarityRaw}`. Nunca falha silenciosamente.

> **Manutenção**: a Pokémon Company introduz raridades novas a cada geração de sets.
> O array `unmapped[]` do manifest é o mecanismo de detecção — se ele vier não-vazio após
> um download, adicione a raridade nova à tabela e rode de novo.

---

## 5. Manifest (`assets/<setId>/manifest.json`)

### Exemplo real (sv7 — Stellar Crown)

```json
{
  "setId": "sv7",
  "setName": "Stellar Crown",
  "generatedAt": "2026-05-26T01:02:12Z",
  "downloaderVersion": "0.1.0",
  "totalSet": 175,
  "cards": [
    {
      "id": "sv7-2",
      "name": "Ledyba",
      "rarityRaw": "Common",
      "bucket": "01_comum",
      "collectionNumber": 2,
      "imagePath": "sv7/01_comum/sv7-2.jpg"
    }
  ],
  "totalsByBucket": {
    "01_comum": 71, "02_incomum": 39, "03_raras": 15, "04_duplo_raras": 25,
    "05_arte_secreta": 13, "06_duplo_arte_secreta": 6, "07_legendaria": 6
  },
  "unmapped": []
}
```

### Campos

| Campo | Tipo | Regra |
|---|---|---|
| `setId` | string | ID do set na fonte. |
| `setName` | string | Nome humano, vindo de `cards[0].set.name`; fallback para `setId`. |
| `generatedAt` | string | ISO 8601 UTC com sufixo `Z`, precisão de segundos. |
| `downloaderVersion` | string | Semver do script (`DOWNLOADER_VERSION`). Permite invalidar cache no cliente. |
| `totalSet` | integer | Quantidade de cartas **no manifest** (baixadas + skipped), não o total da fonte. |
| `cards[]` | array | Ordenado por `(bucket, collectionNumber)`. Só cartas presentes em disco. |
| `totalsByBucket` | object | Todos os 7 buckets sempre presentes, mesmo com valor `0`. Pré-computado para o cliente não varrer `cards[]`. |
| `unmapped[]` | array | `{id, name, rarityRaw}` das raridades não reconhecidas. |

### `cards[].*`

| Campo | Regra |
|---|---|
| `id` | Chave de identidade estável (a mesma da fonte). Usada para dedupe/coleção. |
| `name` | Nome da carta. |
| `rarityRaw` | Raridade **original** da fonte, preservada para debug e exibição. |
| `bucket` | Um dos 7 literais. |
| `collectionNumber` | `int(re.sub(r"[^0-9]", "", card.number) or "0")` — números como `"TG05"` ou `"H12"` viram `5` / `12`; falha vira `0`. |
| `imagePath` | **Relativo à raiz de `assets/`**: `<setId>/<bucket>/<cardId>.jpg`. Não inclui o prefixo `assets/`. |

> ⚠️ **Decisão de caminho**: `imagePath` é relativo à raiz servida de assets, não ao repositório.
> Isso permite que o bundler sirva `assets/` como diretório público e o cliente use
> `imagePath` diretamente como URL, sem reescrita. Se o seu projeto novo servir assets sob
> outro prefixo, ajuste **apenas** na camada de resolução de URL do cliente — não no manifest.

### JSON Schema

Um `manifest.schema.json` (draft 2020-12) deve acompanhar o script para validação em teste.
Restrições essenciais:

- `additionalProperties: false` no topo e em `Card`.
- `required`: `setId`, `setName`, `generatedAt`, `downloaderVersion`, `totalSet`, `cards`, `totalsByBucket`.
- `bucket`: `enum` com os 7 literais.
- `downloaderVersion`: `pattern` `^\d+\.\d+\.\d+([.-].+)?$`.
- `imagePath`: `pattern` `^[A-Za-z0-9_\-]+/(01_comum|02_incomum|03_raras|04_duplo_raras|05_arte_secreta|06_duplo_arte_secreta|07_legendaria)/.+\.jpg$`.
- `totalsByBucket`: os 7 buckets em `required`, `additionalProperties: false`.
- `collectionNumber`: `integer, minimum: 0` (0 é legítimo — ver regra de parsing acima).

---

## 6. Comportamento de execução

### Fluxo por set

1. `ensure_buckets()` — cria `assets/<setId>/` + as 7 subpastas (`mkdir -p`). Nada além disso.
2. `list_set_cards()` — `GET /v2/cards?q=set.id:<setId>&page=N&pageSize=250`, paginando até
   `len(batch) < pageSize` ou `len(cards) >= totalCount`. Timeout de 30 s por request.
3. Para cada carta: valida id → mapeia bucket → checa existência → baixa → converte → registra.
4. `write_manifest()` — escreve `manifest.json` (atômico).
5. `print_report()` — relatório em stdout.

### Segurança de path (obrigatório)

O `card.id` vem de fonte externa e é usado para montar caminho de arquivo. Validar com:

```python
CARD_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_\-]*$")
def is_safe_card_id(card_id): return bool(CARD_ID_PATTERN.match(card_id)) and ".." not in card_id
```

IDs reprovados vão para `failed[]` com motivo `"unsafe card id"` — sem escrita em disco.
Isso bloqueia `../`, separadores de path e nomes absolutos.

### Idempotência

- Se `<dest>.jpg` existe e não há `--force`: **zero requests HTTP de imagem**; a carta entra em
  `skipped[]` e **ainda assim** vai para o manifest (o manifest reflete o disco, não a sessão).
- A existência do arquivo é prova suficiente — não faz `HEAD` de verificação.
- O manifest é sempre regenerado; seu conteúdo é estável byte-a-byte se nada mudou na fonte,
  **exceto** `generatedAt`.

### Retry

`download_image()` tenta até `--retries` vezes; entre tentativas espera `backoff * 2**attempt`
(1 s, 2 s, 4 s por padrão). Esgotadas as tentativas, levanta `RuntimeError` e a carta entra em
`failed[]` — o processamento **continua** para as demais cartas.

### Conversão de imagem

`card.images.large` (fallback `card.images.small`) → JPG:

- Se o modo é `RGBA`/`LA`/`P`-com-transparência: cria fundo **branco** e compõe via máscara alfa.
- Caso contrário: `.convert("RGB")`.
- Salva com `quality=--quality, optimize=True`.

### Escrita atômica

Toda escrita (JPG e manifest) usa `write → <path>.tmp` seguido de `os.replace(tmp, path)`.
Interrupção no meio nunca deixa arquivo truncado no caminho final.

### Relatório em stdout

```
[pkmn-cards] === sv7 "Stellar Crown" (175 cards) ===
[pkmn-cards] downloaded=5  skipped=170  failed=2  unmapped=1
[pkmn-cards] manifest:    /abs/path/assets/sv7/manifest.json
[pkmn-cards] failed:
  - sv7-122 (Failed to download ... after 3 attempts: HTTP 503)
[pkmn-cards] unmapped:
  - sv7-208 "??? card" (rarity='Promo')
```

Logging: `WARNING` por padrão, `DEBUG` com `--verbose`. Erros em stderr, relatório em stdout.

---

## 7. Capas dos pacotes (`capa.png`)

A API **não** fornece arte de embalagem de booster. Duas opções:

1. **Curada** — colocar manualmente `assets/<setId>/capa.png` com a arte real do pacote.
2. **Placeholder gerado** — `tools/make_placeholder_covers.py` varre `assets/*/manifest.json` e,
   para cada set **sem** `capa.png`, gera um PNG **488×896** com:
   - gradiente vertical cujas cores derivam deterministicamente de `sha1(setId)`;
   - listras diagonais translúcidas;
   - `setName` centralizado com quebra automática de linha + sombra;
   - `setId` em maiúsculas abaixo;
   - selo "CAPA TEMPORÁRIA" no rodapé;
   - borda branca de 6 px.

   **Idempotente**: nunca sobrescreve capa existente. Fonte: tenta Arial do sistema
   (`/System/Library/Fonts/Supplemental/Arial Bold.ttf` etc.), cai para `ImageFont.load_default()`.

Executar sempre **depois** do download (depende do `manifest.json` para ler `setName`).

---

## 8. Consumo pelo cliente

### Servir os assets

No projeto original (Vite): `publicDir: '../assets'` com `root: 'src'` — assim `assets/sv7/...`
vira `/sv7/...` na URL e o `imagePath` do manifest funciona **as-is** como caminho relativo.
Em Next.js, o equivalente é colocar/symlinkar `assets/` sob `public/`.

### Carregar um catálogo

```ts
const catalog = await loadCatalog(`./${setId}/manifest.json`);
```

Validações que o cliente **deve** fazer ao construir o catálogo a partir do manifest:

- `id` presente e não-vazio;
- `bucket` pertence aos 7 literais;
- `collectionNumber` inteiro ≥ 0;
- `imagePath` contém `/<bucket>/` (coerência bucket ↔ caminho).

### Índice de sets

Não existe manifest global. O cliente mantém uma lista literal de `setId`s (no projeto original,
`SET_IDS` em `src/main.ts`, em ordem de exibição) e carrega os manifests em paralelo com
`Promise.all`. **Ao adicionar um set novo, o passo obrigatório é registrar o id nessa lista** —
o download sozinho não o torna visível.

> Alternativa recomendada para o projeto novo: gerar um `assets/sets.json` (array de
> `{setId, setName, totalSet, releaseDate}`) num passo final do downloader, eliminando a lista
> hardcoded. Não existe no projeto original.

---

## 9. Testes (`tests_python/`)

| Arquivo | Cobre |
|---|---|
| `test_rarity_mapping.py` | Tabela exaustiva de raridades reais (fixture com JSON congelado da API). Cada raridade-fonte mapeia para exatamente um bucket; os 7 buckets são atingidos. |
| `test_idempotency.py` | Roda duas vezes contra fixtures; asserta **zero** requests HTTP de imagem na segunda execução. |
| `test_retry.py` | Via `responses`: 2 falhas + 1 sucesso → carta baixada, backoff respeitado. |
| `test_manifest_schema.py` | Valida o manifest gerado contra `manifest.schema.json` via `jsonschema`. |
| `test_safety.py` | Tenta path injection via `card.id`; confirma recusa e ausência de escrita fora de `assets/`. |

Nenhum teste faz rede real — tudo via fixtures/`responses`.

---

## 10. Dependências

`tools/requirements.txt`:

```
requests>=2.31,<3
Pillow>=10.0,<12
jsonschema>=4.20,<5
pytest>=7.4,<9
responses>=0.24,<1
```

`pyproject.toml` (opcional, para lint/test):

```toml
[project]
requires-python = ">=3.11"

[tool.pytest.ini_options]
testpaths = ["tests_python"]
python_files = ["test_*.py"]

[tool.ruff]
target-version = "py311"
line-length = 100
[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "UP"]
ignore = ["E501"]
```

---

## 11. Como reaproveitar no projeto novo

### Opção A — copiar os assets já baixados (recomendado)

Os 25 sets já estão baixados e organizados (~880 MB). Evita ~4.6k requests à API.

```bash
# do projeto novo, na raiz:
cp -R /Users/lucianogalvao/Projetos/Pokemon/PokeTCG/assets ./assets
cp -R /Users/lucianogalvao/Projetos/Pokemon/PokeTCG/tools ./tools
cp -R /Users/lucianogalvao/Projetos/Pokemon/PokeTCG/tests_python ./tests_python
```

**Atenção ao Git**: 880 MB de JPGs. Decida antes do primeiro commit:
`.gitignore` + storage externo (S3/R2), ou Git LFS. Não commite binários soltos.

### Opção B — baixar do zero

```bash
pip install -r tools/requirements.txt
python tools/download_cards.py --latest 25       # ou --set-id por set
python tools/make_placeholder_covers.py
```

Com API key (recomendado para volume): `export POKEMONTCG_API_KEY=<sua-chave>`.

### Sets já disponíveis

| setId | Cartas | | setId | Cartas |
|---|---|---|---|---|
| `base1` | 102 | | `sv3pt5` (151) | 207 |
| `base2` | 64 | | `sv4` | 266 |
| `base3` | 62 | | `sv4pt5` | 245 |
| `pgo` | 88 | | `sv5` | 218 |
| `sv1` | 258 | | `sv6` | 226 |
| `sv2` | 279 | | `sv6pt5` | 99 |
| `sv3` | 230 | | `sv7` | 175 |
| `sv8` | 252 | | `me1` | 188 |
| `sv8pt5` | 180 | | `me2` | 130 |
| `sv9` | 190 | | `me2pt5` | 295 |
| `sv10` | 244 | | `me3` | 124 |
| `rsv10pt5` | 173 | | `me4` | 122 |
| `zsv10pt5` | 172 | | | |

Total: **4.615 JPGs**, 25 sets, todos com `capa.png` e `manifest.json`.

---

## 12. Checklist de aceite

- [ ] `python tools/download_cards.py --set-id <novo> --dry-run` lista cartas sem tocar disco.
- [ ] Execução real cria exatamente 7 subpastas + `manifest.json` sob `assets/<setId>/`.
- [ ] Segunda execução sem `--force`: `downloaded=0`, `skipped=N`, zero HTTP de imagem.
- [ ] `manifest.json` valida contra `manifest.schema.json`.
- [ ] `unmapped[]` vazio (ou raridades novas conscientemente aceitas).
- [ ] `sum(totalsByBucket.values()) == len(cards) == totalSet`.
- [ ] Todo `imagePath` do manifest corresponde a um arquivo existente em disco.
- [ ] Nenhum arquivo criado fora de `--assets-dir`.
- [ ] `capa.png` presente para todo set com manifest.
- [ ] `pytest` verde nos 5 arquivos de teste.
