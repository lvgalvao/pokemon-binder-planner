create extension if not exists pg_cron;

-- Schema fora da API. Nada aqui deve ser alcancavel por PostgREST.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

/**
 * Apaga contas anonimas que nunca guardaram nada.
 *
 * O Supabase nao limpa anonimos sozinho, e num app publico cada visita que
 * marca uma carta deixa um usuario para tras. Sem isso, auth.users so cresce.
 *
 * A regra tem uma clausula que nao pode ser afrouxada: so apaga quem tem ZERO
 * cartas em owned_card E em hidden_card. Um anonimo COM cartas e uma crianca
 * com um fichario montado, que so nao vinculou e-mail — apagar por idade seria
 * o pior bug possivel deste app. Ele fica para sempre; o aviso "guardado so
 * neste aparelho" no rodape e o que existe para essa pessoa.
 *
 * Sete dias porque a conta nasce na primeira marcacao: quem tem conta e nao tem
 * carta ou desmarcou tudo, ou foi um robo que passou pelo POST.
 *
 * SECURITY DEFINER porque precisa mexer em auth.users, e vive em `private` para
 * nao virar endpoint publico — o Postgres da EXECUTE a PUBLIC por padrao.
 */
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
       and not exists (select 1 from public.owned_card o  where o.user_id = u.id)
       and not exists (select 1 from public.hidden_card h where h.user_id = u.id)
    returning 1
  )
  select count(*) into removidos from alvo;

  return removidos;
end;
$$;

revoke execute on function private.limpa_anonimos_sem_cartas() from public, anon, authenticated;

-- Todo dia as 4h UTC, quando ninguem esta montando fichario.
select cron.schedule(
  'limpa-anonimos-sem-cartas',
  '0 4 * * *',
  $$select private.limpa_anonimos_sem_cartas()$$
);
