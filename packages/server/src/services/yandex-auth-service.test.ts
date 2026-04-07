import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { YandexAuthError, YandexAuthService } from './yandex-auth-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('YandexAuthService', () => {
  it('normalizes a Yandex profile and prefers default_email', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          id: 'ya-user-1',
          default_email: ' Primary@Example.com ',
          emails: ['secondary@example.com'],
          real_name: 'Alice Example',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const service = new YandexAuthService();
    const profile = await service.getProfile('oauth-token');

    assert.deepEqual(profile, {
      id: 'ya-user-1',
      defaultEmail: 'primary@example.com',
      emails: ['secondary@example.com'],
      displayName: 'Alice Example',
    });
  });

  it('rejects missing access tokens before calling Yandex', async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return new Response('{}', { status: 200 });
    };

    const service = new YandexAuthService();

    await assert.rejects(
      service.getProfile('   '),
      (error: unknown) =>
        error instanceof YandexAuthError &&
        error.code === 'missing_token' &&
        error.message === 'Yandex access token is required',
    );
    assert.equal(called, false);
  });

  it('maps unauthorized Yandex responses to invalid_token', async () => {
    globalThis.fetch = async () => new Response('Unauthorized', { status: 401 });

    const service = new YandexAuthService();

    await assert.rejects(
      service.getProfile('oauth-token'),
      (error: unknown) =>
        error instanceof YandexAuthError &&
        error.code === 'invalid_token' &&
        error.message === 'Invalid Yandex access token',
    );
  });

  it('rejects profiles without a usable email', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ id: 'ya-user-2', emails: ['  '] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const service = new YandexAuthService();

    await assert.rejects(
      service.getProfile('oauth-token'),
      (error: unknown) =>
        error instanceof YandexAuthError &&
        error.code === 'profile_without_email' &&
        error.message === 'Yandex account has no email',
    );
  });

  it('maps fetch failures to upstream_failure', async () => {
    globalThis.fetch = async () => {
      throw new Error('network down');
    };

    const service = new YandexAuthService();

    await assert.rejects(
      service.getProfile('oauth-token'),
      (error: unknown) =>
        error instanceof YandexAuthError &&
        error.code === 'upstream_failure' &&
        error.message === 'Failed to reach Yandex auth',
    );
  });
});
