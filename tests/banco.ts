// Sobe um Postgres em memória (PGlite), imita o mínimo do Supabase (schema
// auth, papéis anon/authenticated) e aplica as migrações reais do projeto.
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRACOES = join(__dirname, '..', 'supabase', 'migrations')

const SUPABASE_FALSO = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id), name text
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert on storage.objects to authenticated;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

export type Banco = Awaited<ReturnType<typeof criarBanco>>

export async function criarBanco() {
  const pg = new PGlite()
  await pg.exec(SUPABASE_FALSO)
  for (const arquivo of readdirSync(MIGRACOES).sort()) {
    await pg.exec(readFileSync(join(MIGRACOES, arquivo), 'utf8'))
  }

  // Executa como superusuário (equivale ao SQL Editor do Supabase).
  async function admin<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await pg.query<T>(sql, params)).rows
  }

  // Executa como um usuário logado no app (ou anônimo, se uid for null).
  async function como<T = any>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
    await pg.exec(`set role ${uid ? 'authenticated' : 'anon'}; set request.jwt.claim.sub = '${uid ?? ''}';`)
    try {
      return (await pg.query<T>(sql, params)).rows
    } finally {
      await pg.exec(`reset role; set request.jwt.claim.sub = '';`)
    }
  }

  async function criarUsuario(email: string, papel: string | null, nome = email.split('@')[0]) {
    const [{ id }] = await admin<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('nome', $2::text)) returning id`,
      [email, nome],
    )
    if (papel) await admin(`update public.perfis set papel = $2::public.papel_usuario, ativo = true where id = $1`, [id, papel])
    return id
  }

  return { pg, admin, como, criarUsuario }
}

export const uuid = (): string => crypto.randomUUID()
