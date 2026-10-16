export type UserRole = 'ADMIN' | 'CLIENTE' | 'DEPOSITANTE';

export interface AuthUser {
  id_user: number;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}
