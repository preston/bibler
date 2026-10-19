import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BiblerService } from './bibler.service';
import { PageMeta, PagedQuery } from '../models/pagination';
import { SessionRole } from '../models/session';
import { pagedQueryToParams } from './paged-query-params';

export interface RolePayload {
  name: string;
  default?: boolean;
  administrator?: boolean;
  bibles?: boolean;
  access?: boolean;
  curation?: boolean;
}

export interface AdminUserSummary {
  id: number;
  username: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  roles: SessionRole[];
}

@Injectable({ providedIn: 'root' })
export class RbacAdminService {
  private http = inject(HttpClient);
  private bibler = inject(BiblerService);

  private base(): string {
    return `${this.bibler.getUrl()}/system`;
  }

  listRoles(): Observable<{ roles: SessionRole[] }> {
    return this.http.get<{ roles: SessionRole[] }>(`${this.base()}/roles.json`);
  }

  createRole(role: RolePayload): Observable<{ role: SessionRole }> {
    return this.http.post<{ role: SessionRole }>(`${this.base()}/roles.json`, {
      role: {
        name: role.name,
        is_default: role.default ?? false,
        administrator: role.administrator ?? false,
        bibles: role.bibles ?? false,
        access: role.access ?? false,
        curation: role.curation ?? false
      }
    });
  }

  updateRole(id: number, role: Partial<RolePayload>): Observable<{ role: SessionRole }> {
    const body: Record<string, unknown> = { role: {} };
    const r = body['role'] as Record<string, unknown>;
    if (role.name !== undefined) r['name'] = role.name;
    if (role.default !== undefined) r['is_default'] = role.default;
    if (role.administrator !== undefined) r['administrator'] = role.administrator;
    if (role.bibles !== undefined) r['bibles'] = role.bibles;
    if (role.access !== undefined) r['access'] = role.access;
    if (role.curation !== undefined) r['curation'] = role.curation;
    return this.http.patch<{ role: SessionRole }>(`${this.base()}/roles/${id}.json`, body);
  }

  deleteRole(id: number): Observable<unknown> {
    return this.http.delete(`${this.base()}/roles/${id}.json`);
  }

  listUsers(query?: PagedQuery): Observable<{ users: AdminUserSummary[]; meta?: PageMeta }> {
    return this.http.get<{ users: AdminUserSummary[]; meta?: PageMeta }>(`${this.base()}/users.json`, {
      params: pagedQueryToParams(query)
    });
  }

  getUser(id: number): Observable<{ user: AdminUserDetail }> {
    return this.http.get<{ user: AdminUserDetail }>(`${this.base()}/users/${id}.json`);
  }

  createUser(payload: {
    username: string;
    email: string;
    name: string;
    password: string;
    password_confirmation: string;
    role_ids?: number[];
  }): Observable<{ user: AdminUserDetail }> {
    const body: Record<string, unknown> = {
      user: {
        username: payload.username,
        email: payload.email,
        name: payload.name,
        password: payload.password,
        password_confirmation: payload.password_confirmation
      }
    };
    if (payload.role_ids?.length) body['role_ids'] = payload.role_ids;
    return this.http.post<{ user: AdminUserDetail }>(`${this.base()}/users.json`, body);
  }

  updateUser(
    id: number,
    payload: { email?: string; name?: string; password?: string; password_confirmation?: string; role_ids?: number[] }
  ): Observable<{ user: AdminUserDetail }> {
    const body: Record<string, unknown> = {};
    if (payload.email !== undefined || payload.name !== undefined || payload.password) {
      body['user'] = {};
      const u = body['user'] as Record<string, unknown>;
      if (payload.email !== undefined) u['email'] = payload.email;
      if (payload.name !== undefined) u['name'] = payload.name;
      if (payload.password) {
        u['password'] = payload.password;
        u['password_confirmation'] = payload.password_confirmation ?? payload.password;
      }
    }
    if (payload.role_ids) body['role_ids'] = payload.role_ids;
    return this.http.patch<{ user: AdminUserDetail }>(`${this.base()}/users/${id}.json`, body);
  }

}
