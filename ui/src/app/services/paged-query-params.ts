import { PagedQuery } from '../models/pagination';

export function pagedQueryToParams(query?: PagedQuery): Record<string, string> {
  const out: Record<string, string> = {};
  if (!query) return out;
  if (query.q) out['q'] = query.q;
  if (query.sort) out['sort'] = query.sort;
  if (query.direction) out['direction'] = query.direction;
  if (query.page) out['page'] = String(query.page);
  if (query.per_page) out['per_page'] = String(query.per_page);
  if (query.scope) out['scope'] = query.scope;
  return out;
}
