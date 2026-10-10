import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { AuthResponse } from '../models/auth.models';

const user = {
  id: 'owner',
  email: 'owner@example.test',
  displayName: 'Owner',
  createdAt: '',
  emailVerified: true,
  role: 'User',
};

describe('AuthService reconnect credentials', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('restores expired saved credentials and shares one refresh with transport reconnect', async () => {
    localStorage.setItem(
      'estimagator-auth',
      JSON.stringify({
        user,
        accessToken: 'expired',
        refreshToken: 'saved-refresh',
        expiresAt: '2020-01-01T00:00:00Z',
      }),
    );
    const response = new Subject<AuthResponse>();
    const http = { post: vi.fn().mockReturnValue(response) };
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: http }] });
    const auth = TestBed.inject(AuthService);
    const first = auth.getValidAccessToken();
    const second = auth.getValidAccessToken();
    await Promise.resolve(); // also runs the deferred startup refresh
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post.mock.calls[0][1]).toEqual({ refreshToken: 'saved-refresh' });
    response.next({
      user,
      accessToken: 'fresh',
      refreshToken: 'rotated',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(await first).toBe('fresh');
    expect(await second).toBe('fresh');
    expect(await auth.getValidAccessToken()).toBe('fresh');
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('connects guests without attempting account refresh', async () => {
    const http = { post: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: http }] });
    expect(await TestBed.inject(AuthService).getValidAccessToken()).toBe('');
    expect(http.post).not.toHaveBeenCalled();
  });
});
