import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LAYOUTS, layoutKey, type Layout, type SortRule } from "./types";

/**
 * SQLite embutido no Node 22 (`node:sqlite`) — sem dependencia, sem codegen,
 * sem compilacao nativa. Sao duas tabelas e meia duzia de consultas; um ORM
 * seria mais peca movel que problema resolvido.
 */

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "binder.db");

let db: DatabaseSync | null = null;

function connect(): DatabaseSync {
  if (db) return db;
  mkdirSync(DB_DIR, { recursive: true });
  const conn = new DatabaseSync(DB_PATH);
  conn.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Um fichario por colecao, criado implicitamente ao abrir o set.
    -- A crianca nunca ve um "criar fichario".
    CREATE TABLE IF NOT EXISTS binder (
      set_id     TEXT PRIMARY KEY,
      rows       INTEGER NOT NULL DEFAULT 3,
      columns    INTEGER NOT NULL DEFAULT 3,
      sort_rule  TEXT    NOT NULL DEFAULT 'number',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Presenca da linha = possui aquela POSICAO. card_id guarda a chave de item:
    -- "sv7-2" para a versao normal e "sv7-2#holo" para a brilhante. Embutir a
    -- variante na chave e o que fez os dados antigos continuarem validos sem
    -- migracao: tudo que existia ja era, por definicao, a versao normal.
    CREATE TABLE IF NOT EXISTS owned_card (
      set_id  TEXT NOT NULL,
      card_id TEXT NOT NULL,
      PRIMARY KEY (set_id, card_id),
      FOREIGN KEY (set_id) REFERENCES binder(set_id) ON DELETE CASCADE
    );

    -- Cartas que a crianca nao tem e NAO QUER ter. Somem do fichario, nao contam
    -- como faltantes e nao entram no PDF. E diferente de "nao tenho": e "nao quero".
    CREATE TABLE IF NOT EXISTS hidden_card (
      set_id  TEXT NOT NULL,
      card_id TEXT NOT NULL,
      PRIMARY KEY (set_id, card_id),
      FOREIGN KEY (set_id) REFERENCES binder(set_id) ON DELETE CASCADE
    );
  `);
  db = conn;
  return conn;
}

export type BinderState = { setId: string } & Layout & { sortRule: SortRule };

/** Le o fichario, criando-o na primeira visita com os padroes. */
export function getBinder(setId: string): BinderState {
  const conn = connect();
  conn
    .prepare("INSERT OR IGNORE INTO binder (set_id) VALUES (?)")
    .run(setId);
  const row = conn
    .prepare("SELECT set_id, rows, columns, sort_rule FROM binder WHERE set_id = ?")
    .get(setId) as { set_id: string; rows: number; columns: number; sort_rule: string };

  // Registros gravados antes da correcao de orientacao podem trazer uma combinacao
  // que nao existe mais (ex.: 3 colunas x 4 linhas). Cai no formato padrao em vez
  // de renderizar um fichario que nenhum botao consegue selecionar.
  const conhecido = LAYOUTS[layoutKey(row.columns, row.rows)] ?? LAYOUTS["3x3"];

  return {
    setId: row.set_id,
    rows: conhecido.rows,
    columns: conhecido.columns,
    sortRule: row.sort_rule === "rarity" ? "rarity" : "number",
  };
}

export function updateBinder(
  setId: string,
  patch: Partial<Layout & { sortRule: SortRule }>,
): void {
  const conn = connect();
  getBinder(setId);
  if (patch.rows !== undefined && patch.columns !== undefined) {
    conn
      .prepare("UPDATE binder SET rows = ?, columns = ? WHERE set_id = ?")
      .run(patch.rows, patch.columns, setId);
  }
  if (patch.sortRule !== undefined) {
    conn.prepare("UPDATE binder SET sort_rule = ? WHERE set_id = ?").run(patch.sortRule, setId);
  }
}

export function getOwnedIds(setId: string): Set<string> {
  const conn = connect();
  getBinder(setId);
  const rows = conn
    .prepare("SELECT card_id FROM owned_card WHERE set_id = ?")
    .all(setId) as { card_id: string }[];
  return new Set(rows.map((r) => r.card_id));
}

/** Marca ou desmarca varias cartas de uma vez — usado pelo "tenho todas desta pagina". */
export function setOwned(setId: string, cardIds: readonly string[], owned: boolean): void {
  const conn = connect();
  getBinder(setId);
  const stmt = owned
    ? conn.prepare("INSERT OR IGNORE INTO owned_card (set_id, card_id) VALUES (?, ?)")
    : conn.prepare("DELETE FROM owned_card WHERE set_id = ? AND card_id = ?");
  conn.exec("BEGIN");
  try {
    for (const id of cardIds) stmt.run(setId, id);
    conn.exec("COMMIT");
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

export function getHiddenIds(setId: string): Set<string> {
  const conn = connect();
  getBinder(setId);
  const rows = conn
    .prepare("SELECT card_id FROM hidden_card WHERE set_id = ?")
    .all(setId) as { card_id: string }[];
  return new Set(rows.map((r) => r.card_id));
}

/**
 * Esconde ou revela cartas. Esconder tambem apaga a posse: "nao tenho e nao quero"
 * — assim, se a carta voltar a aparecer um dia, nao volta marcada por engano.
 */
export function setHidden(setId: string, cardIds: readonly string[], hidden: boolean): void {
  const conn = connect();
  getBinder(setId);
  const stmt = hidden
    ? conn.prepare("INSERT OR IGNORE INTO hidden_card (set_id, card_id) VALUES (?, ?)")
    : conn.prepare("DELETE FROM hidden_card WHERE set_id = ? AND card_id = ?");
  const apagaPosse = conn.prepare("DELETE FROM owned_card WHERE set_id = ? AND card_id = ?");
  conn.exec("BEGIN");
  try {
    for (const id of cardIds) {
      stmt.run(setId, id);
      if (hidden) apagaPosse.run(setId, id);
    }
    conn.exec("COMMIT");
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

/** Quantas cartas o usuario tem em cada colecao — para a tela inicial. */
export function ownedCountBySet(): Map<string, number> {
  const conn = connect();
  const rows = conn
    .prepare("SELECT set_id, COUNT(*) AS n FROM owned_card GROUP BY set_id")
    .all() as { set_id: string; n: number }[];
  return new Map(rows.map((r) => [r.set_id, r.n]));
}
