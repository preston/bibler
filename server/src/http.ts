import type { ErrorRequestHandler, Request } from 'express';
import type { PageMeta } from 'bibler-core';

export class ApiError extends Error {
  status: number;
  errors?: string[];
  constructor(status: number, message: string, errors?: string[]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export function notFound(label: string): never {
  throw new ApiError(404, `${label} not found.`);
}

export function validation(errors: string[]): void {
  if (errors.length) throw new ApiError(422, errors[0]!, errors);
}

export function body(req: Request, key?: string, required = true): Record<string, unknown> {
  const value: unknown = key ? req.body?.[key] : req.body;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (required) throw new ApiError(400, key ? `${key} is required.` : 'A JSON object is required.');
    return {};
  }
  return value as Record<string, unknown>;
}

export function select(input: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}

export const string = (value: unknown): string => typeof value === 'string' ? value : '';
export const present = (value: unknown): boolean => typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;
export const truthy = (value: unknown): boolean => [true, 1, '1', 'true', 'yes', 'on'].includes(value as string | number | boolean);
export function param(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
export function pagination(req: Request, sortable: readonly string[], defaultSort: string) {
  const page = Math.max(1, Number.parseInt(string(req.query.page), 10) || 1);
  const requestedPerPage = Number.parseInt(string(req.query.perPage), 10);
  const perPage = Math.min(100, requestedPerPage > 0 ? requestedPerPage : 25);
  const sort = sortable.includes(string(req.query.sort)) ? string(req.query.sort) : defaultSort;
  const direction: 'asc' | 'desc' = string(req.query.direction).toLowerCase() === 'asc' ? 'asc' : 'desc';
  const q = string(req.query.q).trim();
  return { page, perPage, sort, direction, q, skip: (page - 1) * perPage };
}
export function meta(p: ReturnType<typeof pagination>, totalCount: number): PageMeta {
  return { page: p.page, perPage: p.perPage, totalCount, totalPages: Math.ceil(totalCount / p.perPage), sort: p.sort, direction: p.direction, q: p.q };
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (res.headersSent) { res.end(); return; }
  if (error instanceof ApiError) {
    res.status(error.status).json(error.errors ? { errors: error.errors } : { error: error.message });
    return;
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = error.code;
    if (code === 'P2025') { res.status(404).json({ error: 'Resource not found.' }); return; }
    if (code === 'P2002') { res.status(422).json({ errors: ['The value has already been taken.'] }); return; }
    if (code === 'P2003' || code === 'P2000' || code === 'P2004' || code === 'P2011' || code === 'P2023') {
      res.status(422).json({ errors: ['The record contains an invalid value or reference.'] }); return;
    }
  }
  if (error && typeof error === 'object' && 'name' in error && error.name === 'PrismaClientValidationError') {
    res.status(422).json({ errors: ['The record contains an invalid value or reference.'] }); return;
  }
  if (error instanceof SyntaxError && 'body' in error) { res.status(400).json({ error: 'Invalid JSON.' }); return; }
  if (error && typeof error === 'object' && 'status' in error && error.status === 413) {
    res.status(413).json({ error: 'Request body is too large.' }); return;
  }
  console.error(error);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
};
