import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BiblerService } from './bibler.service';
import { PageMeta, PagedQuery } from '../models/pagination';
import { SessionRole } from '../models/session';
import { pagedQueryToParams } from './paged-query-params';

export type { RolePayload, AdminUserSummary, AdminUserDetail } from "bibler-core";
import type { RolePayload, AdminUserSummary, AdminUserDetail } from "bibler-core";

@Injectable({ providedIn: 'root' })
export class RbacAdminService {
  private http = inject(HttpClient);
  private bibler = inject(BiblerService);

  private base(): string {
    return `${this.bibler.getUrl()}/system`;
  }

  listRoles(): Observable<{ roles: SessionRole[] }> {
    return this.http.get<{ roles: SessionRole[] }>(`${this.base()}/roles`);
  }

  createRole(role: RolePayload): Observable<{ role: SessionRole }> {
    return this.http.post<{ role: SessionRole }>(`${this.base()}/roles`, {
      role: {
        name: role.name,
        isDefault: role.default ?? false,
        administrator: role.administrator ?? false,
        bibles: role.bibles ?? false,
        access: role.access ?? false,
        curation: role.curation ?? false
      }
    });
  }

  updateRole(id: string, role: Partial<RolePayload>): Observable<{ role: SessionRole }> {
    const body: Record<string, unknown> = { role: {} };
    const r = body['role'] as Record<string, unknown>;
    if (role.name !== undefined) r['name'] = role.name;
    if (role.default !== undefined) r['isDefault'] = role.default;
    if (role.administrator !== undefined) r['administrator'] = role.administrator;
    if (role.bibles !== undefined) r['bibles'] = role.bibles;
    if (role.access !== undefined) r['access'] = role.access;
    if (role.curation !== undefined) r['curation'] = role.curation;
    return this.http.patch<{ role: SessionRole }>(`${this.base()}/roles/${id}`, body);
  }

  deleteRole(id: string): Observable<unknown> {
    return this.http.delete(`${this.base()}/roles/${id}`);
  }

  listUsers(query?: PagedQuery): Observable<{ users: AdminUserSummary[]; meta?: PageMeta }> {
    return this.http.get<{ users: AdminUserSummary[]; meta?: PageMeta }>(`${this.base()}/users`, {
      params: pagedQueryToParams(query)
    });
  }

  getUser(id: string): Observable<{ user: AdminUserDetail }> {
    return this.http.get<{ user: AdminUserDetail }>(`${this.base()}/users/${id}`);
  }

  createUser(payload: {
    username: string;
    email: string;
    name: string;
    password: string;
    passwordConfirmation: string;
    roleIds?: string[];
  }): Observable<{ user: AdminUserDetail }> {
    const body: Record<string, unknown> = {
      user: {
        username: payload.username,
        email: payload.email,
        name: payload.name,
        password: payload.password,
        passwordConfirmation: payload.passwordConfirmation
      }
    };
    if (payload.roleIds?.length) body['roleIds'] = payload.roleIds;
    return this.http.post<{ user: AdminUserDetail }>(`${this.base()}/users`, body);
  }

  updateUser(
    id: string,
    payload: { email?: string; name?: string; password?: string; passwordConfirmation?: string; roleIds?: string[] }
  ): Observable<{ user: AdminUserDetail }> {
    const body: Record<string, unknown> = {};
    if (payload.email !== undefined || payload.name !== undefined || payload.password) {
      body['user'] = {};
      const u = body['user'] as Record<string, unknown>;
      if (payload.email !== undefined) u['email'] = payload.email;
      if (payload.name !== undefined) u['name'] = payload.name;
      if (payload.password) {
        u['password'] = payload.password;
        u['passwordConfirmation'] = payload.passwordConfirmation ?? payload.password;
      }
    }
    if (payload.roleIds) body['roleIds'] = payload.roleIds;
    return this.http.patch<{ user: AdminUserDetail }>(`${this.base()}/users/${id}`, body);
  }

}
