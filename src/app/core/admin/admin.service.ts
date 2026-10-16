import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Locker } from '../lockers/lockers.service';

const API = 'http://localhost:4000/api';

export type AdminRole = 'ADMIN' | 'USER';

export interface ManagedUser {
  id_user: number;
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
}

export interface ManagedUserDetail extends ManagedUser {
  assignments: Array<{ locker: Pick<Locker, 'id_locker' | 'code' | 'name' | 'location' | 'isActive'> }>;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  listLockers(): Observable<{ lockers: Locker[] }> {
    return this.http.get<{ lockers: Locker[] }>(`${API}/lockers`);
  }

  listUsers(): Observable<{ users: ManagedUser[] }> {
    return this.http.get<{ users: ManagedUser[] }>(`${API}/users`);
  }

  createUser(input: { name: string; email: string; password: string; role: AdminRole }): Observable<{ user: ManagedUser }> {
    return this.http.post<{ user: ManagedUser }>(`${API}/users`, input);
  }

  updateUser(id: number, input: Partial<Pick<ManagedUser, 'name' | 'email' | 'role' | 'isActive'>>): Observable<{ user: ManagedUser }> {
    return this.http.patch<{ user: ManagedUser }>(`${API}/users/${id}`, input);
  }

  getUser(id: number): Observable<{ user: ManagedUserDetail }> {
    return this.http.get<{ user: ManagedUserDetail }>(`${API}/users/${id}`);
  }

  setUserLockers(id: number, lockerIds: number[]): Observable<{ user: ManagedUserDetail }> {
    return this.http.put<{ user: ManagedUserDetail }>(`${API}/users/${id}/lockers`, { lockerIds });
  }

  createLocker(input: { code: string; name: string; location: string | null }): Observable<{ locker: Locker }> {
    return this.http.post<{ locker: Locker }>(`${API}/lockers`, input);
  }

  updateLocker(id: number, input: Partial<Pick<Locker, 'code' | 'name' | 'location' | 'isActive'>>): Observable<{ locker: Locker }> {
    return this.http.patch<{ locker: Locker }>(`${API}/lockers/${id}`, input);
  }
}
