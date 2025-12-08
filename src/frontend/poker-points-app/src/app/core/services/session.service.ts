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
} from '../models/session.models';

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/api/sessions`;

  async createSession(deckType: DeckType = 'fibonacci'): Promise<CreateSessionResponse> {
    const request: CreateSessionRequest = { deckType };
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
}
