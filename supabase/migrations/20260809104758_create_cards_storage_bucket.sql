-- Bucket publico com a arte das cartas.
--
-- Publico porque a arte nao e segredo e URL assinada custaria um round-trip por
-- imagem numa tela que mostra 18 de uma vez. Publico tambem faz o CDN do Supabase
-- servir direto, sem passar pela API.
--
-- Sem nenhuma policy de escrita: quem sobe e o tools/upload-assets.mjs com a
-- secret key, que ignora RLS. Assim nem anon nem authenticated conseguem gravar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cards',
  'cards',
  true,
  5242880,                                  -- 5 MB: a maior carta tem ~250 KB
  array['image/webp', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
