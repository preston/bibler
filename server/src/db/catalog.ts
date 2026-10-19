// Author: Preston Lee

import type { Client } from 'pg';

// Migration bookkeeping is deliberately outside the application schema contract.
const tables = `n.nspname = 'public' AND c.relname NOT IN ('_prisma_migrations', 'schema_migrations', 'ar_internal_metadata')`;

export async function readCatalog(client: Client): Promise<Record<string, unknown[]>> {
  const queries: Record<string, string> = {
    relations: `SELECT c.relname AS name, c.relkind AS kind, c.relrowsecurity AS row_security,
      c.relforcerowsecurity AS force_row_security FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE ${tables} AND c.relkind IN ('r','p','v','m','S','f') ORDER BY c.relname`,
    columns: `SELECT c.relname AS table_name, a.attname AS name,
      format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS not_null,
      pg_get_expr(d.adbin,d.adrelid) AS default_value, a.attidentity AS identity, a.attgenerated AS generated,
      cn.nspname || '.' || col.collname AS collation
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      LEFT JOIN pg_collation col ON col.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=col.collnamespace
      WHERE ${tables} AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
      ORDER BY c.relname,a.attname`,
    constraints: `SELECT c.relname AS table_name, k.conname AS name, k.contype AS type,
      pg_get_constraintdef(k.oid) AS definition, k.convalidated AS validated
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE ${tables} ORDER BY c.relname,k.conname`,
    indexes: `SELECT c.relname AS table_name, i.relname AS name, pg_get_indexdef(x.indexrelid) AS definition,
      x.indisvalid AS valid, x.indisready AS ready FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid
      JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE ${tables} ORDER BY c.relname,i.relname`,
    triggers: `SELECT c.relname AS table_name, t.tgname AS name, pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE ${tables} AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
    policies: `SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies
      WHERE schemaname='public' ORDER BY tablename,policyname`,
    types: `SELECT t.typname AS name, e.enumlabel AS label, e.enumsortorder AS position FROM pg_enum e
      JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder`
  };
  const result: Record<string, unknown[]> = {};
  for (const [name, query] of Object.entries(queries)) result[name] = (await client.query(query)).rows;
  return result;
}

export function catalogDifference(expected: Record<string, unknown[]>, actual: Record<string, unknown[]>): string[] {
  return Object.keys(expected).filter(key => JSON.stringify(expected[key]) !== JSON.stringify(actual[key]));
}
