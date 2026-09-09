-- A estrela deixa de ser um balaio so e passa a morar numa LISTA.
--
-- Ate aqui "quero muito" era uma marca global: uma crianca com 66 estrelas tinha
-- 66 cartas numa pilha unica, e a folha impressa saia toda de uma vez. Mas o
-- desejo dela ja vinha separado na cabeca ("as do aniversario", "as que eu troco
-- com o primo") e nao tinha onde existir — sobrava imprimir tudo e riscar a mao.
--
-- Guarda so o NOME e a ordem de criacao. As cartas continuam em `starred_card`,
-- com a mesma chave de sempre: a lista e um rotulo por cima da estrela, nao uma
-- copia dela.
create table public.wishlist (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  nome       text        not null check (length(trim(nome)) between 1 and 40),
  created_at timestamptz not null default now(),
  -- Alvo da chave composta la embaixo. Sem isto o Postgres recusa a FK, e e ela
  -- que impede uma estrela de apontar para a lista de OUTRA pessoa.
  unique (id, user_id)
);

-- A tela inicial lista as listas do usuario a cada visita, na ordem de criacao —
-- que e a ordem em que elas aparecem no seletor.
create index wishlist_user_idx on public.wishlist (user_id, created_at);

-- ---------------------------------------------------------------- a coluna
--
-- Nasce anulavel para o backfill caber na mesma transacao, e fecha em not null
-- no fim: uma estrela sem lista nao teria onde aparecer na tela.
alter table public.starred_card add column wishlist_id uuid;

-- Quem ja tinha estrelas ganha a lista com o nome que a tela ja usava. Uma por
-- usuario, e todas as estrelas dele vao para ela: ninguem perde uma carta nem
-- precisa reencontrar as suas.
insert into public.wishlist (user_id, nome)
select distinct user_id, 'As que eu mais quero' from public.starred_card;

update public.starred_card s
   set wishlist_id = w.id
  from public.wishlist w
 where w.user_id = s.user_id;

alter table public.starred_card alter column wishlist_id set not null;

-- A chave e COMPOSTA de proposito: `(wishlist_id, user_id)` contra
-- `(id, user_id)` da lista. So `wishlist_id` deixaria gravar uma estrela minha
-- dentro da lista de outra pessoa — invisivel para os dois, porque cada um le
-- filtrando pelo proprio `user_id`, e mesmo assim uma linha na casa alheia.
alter table public.starred_card
  add constraint starred_card_wishlist_fk
  foreign key (wishlist_id, user_id)
  references public.wishlist (id, user_id)
  on delete cascade;

-- FK sem indice faz o `on delete cascade` varrer a tabela inteira a cada lista
-- apagada. E tambem o indice de "as estrelas desta lista", que e a consulta da
-- tela inicial.
create index starred_card_wishlist_idx on public.starred_card (wishlist_id);

-- ---------------------------------------------------------------- RLS
--
-- Mesmo desenho das outras tabelas: predicado de posse, `to authenticated` nunca
-- sozinho, e `(select auth.uid())` embrulhado para o planner avaliar uma vez por
-- consulta em vez de uma por linha.
alter table public.wishlist enable row level security;

create policy "dono le as listas" on public.wishlist
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono cria lista" on public.wishlist
  for insert to authenticated with check ((select auth.uid()) = user_id);
-- using E with check: so o using deixaria reatribuir user_id para outra pessoa.
create policy "dono renomeia a lista" on public.wishlist
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "dono apaga a lista" on public.wishlist
  for delete to authenticated using ((select auth.uid()) = user_id);

-- `starred_card` nunca teve update: a estrela so nascia e morria. Mudar uma
-- carta de lista e um update, e sem esta policy o gesto falharia em silencio —
-- o PostgREST devolve 0 linhas afetadas, nao erro.
create policy "dono muda a estrela de lista" on public.starred_card
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
