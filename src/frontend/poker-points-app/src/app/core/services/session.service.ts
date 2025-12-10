import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateSessionRequest,
  CreateSessionResponse,
  SessionInfo,
  GameState,
  DeckType,
  SessionHistoryResponse,
} from '../models/session.models';

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/sessions`;

  async createSession(deckType: DeckType = 'fibonacci', name?: string): Promise<CreateSessionResponse> {
    const request: CreateSessionRequest = { deckType, name };
    return firstValueFrom(this.http.post<CreateSessionResponse>(this.apiUrl, request));
  }

  async getSession(code: string): Promise<SessionInfo | null> {
    try {
      return await firstValueFrom(this.http.get<SessionInfo>(`${this.apiUrl}/${code}`));
    } catch {
      return null;
    }
  }

  async getSessionState(code: string): Promise<GameState | null> {
    try {
      return await firstValueFrom(this.http.get<GameState>(`${this.apiUrl}/${code}/state`));
    } catch {
      return null;
    }
  }

  async sessionExists(code: string): Promise<boolean> {
    const session = await this.getSession(code);
    return session !== null && session.isActive;
  }

  async checkSessionStatus(code: string): Promise<'active' | 'inactive' | 'not_found'> {
    const session = await this.getSession(code);
    if (session === null) return 'not_found';
    return session.isActive ? 'active' : 'inactive';
  }

  async deactivateSession(code: string): Promise<boolean> {
    try {
      await firstValueFrom(this.http.post(`${this.apiUrl}/${code}/deactivate`, {}));
      return true;
    } catch {
      return false;
    }
  }

  async getSessionHistory(code: string): Promise<SessionHistoryResponse | null> {
    try {
      return await firstValueFrom(
        this.http.get<SessionHistoryResponse>(`${this.apiUrl}/${code}/history`)
      );
    } catch {
      return null;
    }
  }
}
