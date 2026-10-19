import type { PagedQuery } from 'bibler-core';

export function pagedQueryToParams(query?: PagedQuery): Record<string, string> {
  const out: Record<string, string> = {};
  if (!query) return out;
  if (query.q) out['q'] = query.q;
  if (query.sort) out['sort'] = query.sort;
  if (query.direction) out['direction'] = query.direction;
  if (query.page) out['page'] = String(query.page);
  if (query.perPage) out['perPage'] = String(query.perPage);
  if (query.scope) out['scope'] = query.scope;
  return out;
}
