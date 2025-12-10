import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminUser,
  AdminUserDetail,
  UpdateUserRequest,
  AdminSession,
  AdminSessionDetail,
  PagedResult,
} from '../models/admin.models';

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/admin`;

  // User Management
  async getUsers(
    page = 1,
    pageSize = 20,
    search?: string
  ): Promise<PagedResult<AdminUser>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (search) {
      params = params.set('search', search);
    }

    return firstValueFrom(
      this.http.get<PagedResult<AdminUser>>(`${this.apiUrl}/users`, { params })
    );
  }

  async getUser(id: string): Promise<AdminUserDetail> {
    return firstValueFrom(
      this.http.get<AdminUserDetail>(`${this.apiUrl}/users/${id}`)
    );
  }

  async updateUser(id: string, request: UpdateUserRequest): Promise<AdminUser> {
    return firstValueFrom(
      this.http.put<AdminUser>(`${this.apiUrl}/users/${id}`, request)
    );
  }

  async deleteUser(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/users/${id}`));
  }

  async resendVerification(id: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.apiUrl}/users/${id}/resend-verification`, {})
    );
  }

  // Session Management
  async getSessions(
    page = 1,
    pageSize = 20,
    search?: string,
    isActive?: boolean
  ): Promise<PagedResult<AdminSession>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (search) {
      params = params.set('search', search);
    }
    if (isActive !== undefined) {
      params = params.set('isActive', isActive.toString());
    }

    return firstValueFrom(
      this.http.get<PagedResult<AdminSession>>(`${this.apiUrl}/sessions`, {
        params,
      })
    );
  }

  async getSession(id: string): Promise<AdminSessionDetail> {
    return firstValueFrom(
      this.http.get<AdminSessionDetail>(`${this.apiUrl}/sessions/${id}`)
    );
  }

  async deleteSession(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/sessions/${id}`));
  }
}
