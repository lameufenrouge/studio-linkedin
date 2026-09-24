-- À exécuter une fois dans Supabase > SQL Editor
create table if not exists studio_docs (
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at bigint not null default 0,
  primary key (collection, id)
);
create index if not exists studio_docs_col_updated on studio_docs (collection, updated_at desc);
-- Sécurité : RLS activé sans aucune règle = personne ne peut lire la table
-- depuis le navigateur. Seul le serveur (clé service_role) y a accès.
alter table studio_docs enable row level security;
