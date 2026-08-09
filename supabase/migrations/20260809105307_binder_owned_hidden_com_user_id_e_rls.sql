-- Estado do usuario: as mesmas tres tabelas do SQLite, agora com dono.
--
-- A separacao que sustenta o app (Card / SlotItem / Ownership) nao muda: aqui so
-- mora Ownership. Card vem do manifest, SlotItem e derivado e nunca persistido.

-- Um fichario por colecao, criado implicitamente ao abrir o set.
-- A crianca nunca ve um "criar fichario".
create table public.binder (
  user_id    uuid     not null references auth.users (id) on delete cascade,
  set_id     text     not null,
  rows       smallint not null default 3,
  columns    smallint not null default 3,
  sort_rule  text     not null default 'number' check (sort_rule in ('number', 'rarity')),
  created_at timestamptz not null default now(),
  primary key (user_id, set_id)
);

-- Presenca da linha = possui aquela POSICAO. card_id guarda a chave de item:
-- "sv7-2" para a versao normal e "sv7-2#holo" para a brilhante. Embutir a
-- variante na chave e o que dispensa migracao quando um set ganha reverse holo.
--
-- Sem FK para binder de proposito: no SQLite ela era barata, aqui obrigaria um
-- round-trip de rede antes de cada marcacao so para garantir uma linha que
-- guarda layout. A PK composta ja serve `where user_id = ? and set_id = ?` e o
-- `group by set_id` da tela inicial.
create table public.owned_card (
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id  text not null,
  card_id text not null,
  primary key (user_id, set_id, card_id)
);

-- Cartas que a crianca nao tem e NAO QUER ter. Somem do fichario, nao contam
-- como faltantes e nao entram no PDF. E diferente de "nao tenho": e "nao quero".
create table public.hidden_card (
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id  text not null,
  card_id text not null,
  primary key (user_id, set_id, card_id)
);

-- ---------------------------------------------------------------- RLS
--
-- `to authenticated` sozinho seria autenticacao sem autorizacao (IDOR): checa o
-- role e nao a linha. O predicado de posse e o que importa.
--
-- `(select auth.uid())` embrulhado no select de proposito: o planner avalia uma
-- vez por consulta em vez de uma vez por linha.
--
-- Nada de `auth.role() = 'authenticated'`: alem de deprecado, ele passa para
-- usuario anonimo — que carrega o mesmo role — e este app e anonimo por padrao.

alter table public.binder      enable row level security;
alter table public.owned_card  enable row level security;
alter table public.hidden_card enable row level security;

create policy "dono le o fichario" on public.binder
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono cria o fichario" on public.binder
  for insert to authenticated with check ((select auth.uid()) = user_id);
-- update precisa de using E with check: so o using deixaria reatribuir user_id
-- para outra pessoa.
create policy "dono altera o fichario" on public.binder
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "dono apaga o fichario" on public.binder
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "dono le o que tem" on public.owned_card
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono marca" on public.owned_card
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono desmarca" on public.owned_card
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "dono le o que escondeu" on public.hidden_card
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono esconde" on public.hidden_card
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono revela" on public.hidden_card
  for delete to authenticated using ((select auth.uid()) = user_id);
