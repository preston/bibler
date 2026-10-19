export type SortDirection = 'asc' | 'desc';

export interface PageMeta {
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
  sort?: string;
  direction?: SortDirection;
  q?: string;
}

export interface PagedQuery {
  q?: string;
  sort?: string;
  direction?: SortDirection;
  page?: number;
  perPage?: number;
  /** Studies index: `owned` (auth) or `public` (catalog). */
  scope?: 'owned' | 'public';
}
