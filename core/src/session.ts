export interface SessionUser {
  id: string;
  username: string;
  email: string;
  name: string;
}

export interface SessionPermissions {
  administrator: boolean;
  bibles: boolean;
  access: boolean;
  curation: boolean;
}

export interface SessionRole {
  id: string;
  name: string;
  default: boolean;
  administrator: boolean;
  bibles: boolean;
  access: boolean;
  curation: boolean;
}

export interface SessionResponse {
  token: string;
  user: SessionUser;
  roles: SessionRole[];
  permissions: SessionPermissions;
}
