import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  User,
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  RefreshTokenRequest,
  UpdateProfileRequest,
  AuthState,
} from '../models/auth.models';
import { SessionInfo } from '../models/session.models';

const AUTH_STORAGE_KEY = 'estimagator-auth';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  private readonly state = signal<AuthState>({
    user: null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    isLoading: false,
    error: null,
  });

  readonly user = computed(() => this.state().user);
  readonly isAuthenticated = computed(() => !!this.state().accessToken);
  readonly isLoading = computed(() => this.state().isLoading);
  readonly error = computed(() => this.state().error);
  readonly accessToken = computed(() => this.state().accessToken);

  constructor() {
    this.loadFromStorage();
  }

  async register(request: RegisterRequest): Promise<User> {
    this.state.update((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/register`, request)
      );
      this.handleAuthSuccess(response);
      return response.user;
    } catch (err) {
      const error = this.extractErrorMessage(err);
      this.state.update((s) => ({ ...s, isLoading: false, error }));
      throw new Error(error);
    }
  }

  async login(request: LoginRequest): Promise<User> {
    this.state.update((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/login`, request)
      );
      this.handleAuthSuccess(response);
      return response.user;
    } catch (err) {
      const error = this.extractErrorMessage(err);
      this.state.update((s) => ({ ...s, isLoading: false, error }));
      throw new Error(error);
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.apiUrl}/api/auth/logout`, {}));
    } catch {
      // Ignore errors on logout
    }

    this.clearAuth();
  }

  async refreshToken(): Promise<boolean> {
    const currentRefreshToken = this.state().refreshToken;
    if (!currentRefreshToken) {
      return false;
    }

    try {
      const request: RefreshTokenRequest = { refreshToken: currentRefreshToken };
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/refresh`, request)
      );
      this.handleAuthSuccess(response);
      return true;
    } catch {
      this.clearAuth();
      return false;
    }
  }

  async getCurrentUser(): Promise<User | null> {
    if (!this.isAuthenticated()) {
      return null;
    }

    try {
      const user = await firstValueFrom(
        this.http.get<User>(`${this.apiUrl}/api/auth/me`)
      );
      this.state.update((s) => ({ ...s, user }));
      return user;
    } catch {
      return null;
    }
  }

  async updateProfile(request: UpdateProfileRequest): Promise<User> {
    const response = await firstValueFrom(
      this.http.put<User>(`${this.apiUrl}/api/user/profile`, request)
    );
    this.state.update((s) => ({ ...s, user: response }));
    this.saveToStorage();
    return response;
  }

  async getMySessions(): Promise<SessionInfo[]> {
    return firstValueFrom(
      this.http.get<SessionInfo[]>(`${this.apiUrl}/api/sessions/my-sessions`)
    );
  }

  clearError(): void {
    this.state.update((s) => ({ ...s, error: null }));
  }

  private handleAuthSuccess(response: AuthResponse): void {
    this.state.set({
      user: response.user,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresAt: new Date(response.expiresAt),
      isLoading: false,
      error: null,
    });
    this.saveToStorage();
  }

  private clearAuth(): void {
    this.state.set({
      user: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      isLoading: false,
      error: null,
    });
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  private saveToStorage(): void {
    const { user, accessToken, refreshToken, expiresAt } = this.state();
    if (accessToken) {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ user, accessToken, refreshToken, expiresAt })
      );
    }
  }

  private loadFromStorage(): void {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return;

    try {
      const { user, accessToken, refreshToken, expiresAt } = JSON.parse(stored);
      const expiry = new Date(expiresAt);

      if (expiry > new Date()) {
        this.state.update((s) => ({
          ...s,
          user,
          accessToken,
          refreshToken,
          expiresAt: expiry,
        }));
      } else {
        // Token expired, try to refresh
        this.refreshToken();
      }
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  private extractErrorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      return err.error?.message || err.message || 'An error occurred';
    }
    return 'An error occurred';
  }
}
