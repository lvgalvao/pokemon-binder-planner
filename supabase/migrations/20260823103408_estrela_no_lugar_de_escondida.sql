-- "Nao tenho e NAO QUERO" virou "QUERO MUITO".
--
-- A tabela e a mesma forma — (user_id, set_id, card_id), presenca da linha e a
-- marca — mas o significado inverte: escondida sumia do fichario e do PDF;
-- estrela fica, conta como faltante e ganha PDF proprio.
--
-- Renomear em vez de criar e dropar porque a tabela estava com ZERO linhas em
-- producao (o esconder nunca foi usado): nao ha dado para migrar, e renomear
-- preserva RLS, PK e grants sem uma janela em que a tabela nao existe.
alter table public.hidden_card rename to starred_card;

alter policy "dono le o que escondeu" on public.starred_card rename to "dono le as estrelas";
alter policy "dono esconde"           on public.starred_card rename to "dono poe estrela";
alter policy "dono revela"            on public.starred_card rename to "dono tira estrela";

-- A limpeza de anonimos referenciava hidden_card pelo nome. A clausula que nao
-- pode ser afrouxada continua a mesma: so apaga quem tem ZERO cartas marcadas —
-- e uma estrela e marcacao do usuario tanto quanto a posse.
create or replace function private.limpa_anonimos_sem_cartas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removidos integer;
begin
  with alvo as (
    delete from auth.users u
     where u.is_anonymous
       and u.created_at < now() - interval '7 days'
       and not exists (select 1 from public.owned_card   o where o.user_id = u.id)
       and not exists (select 1 from public.starred_card s where s.user_id = u.id)
    returning 1
  )
  select count(*) into removidos from alvo;

  return removidos;
end;
$$;

revoke execute on function private.limpa_anonimos_sem_cartas() from public, anon, authenticated;
