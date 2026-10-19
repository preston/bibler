export type SortDirection = 'asc' | 'desc';

export interface PageMeta {
  page: number;
  per_page: number;
  total_count: number;
  total_pages: number;
  sort?: string;
  direction?: SortDirection;
  q?: string;
}

export interface PagedQuery {
  q?: string;
  sort?: string;
  direction?: SortDirection;
  page?: number;
  per_page?: number;
  /** Studies index: `owned` (auth) or `public` (catalog). */
  scope?: 'owned' | 'public';
}
