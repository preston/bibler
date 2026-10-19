import type { SessionRole } from "./session.js";

export interface RolePayload {
  name: string;
  default?: boolean;
  administrator?: boolean;
  bibles?: boolean;
  access?: boolean;
  curation?: boolean;
}

export interface AdminUserSummary {
  id: string;
  username: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  roles: SessionRole[];
}
