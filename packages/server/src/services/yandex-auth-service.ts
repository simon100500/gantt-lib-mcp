export interface NormalizedYandexProfile {
  id: string;
  defaultEmail: string;
  emails: string[];
  displayName: string | null;
}

type RawYandexProfile = {
  id?: string | number | null;
  default_email?: string | null;
  emails?: unknown;
  display_name?: string | null;
  real_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  login?: string | null;
};

export class YandexAuthError extends Error {
  constructor(
    public readonly code:
      | 'missing_token'
      | 'invalid_token'
      | 'profile_without_email'
      | 'upstream_failure',
    message: string,
  ) {
    super(message);
    this.name = 'YandexAuthError';
  }
}

export class YandexAuthService {
  private readonly profileUrl = 'https://login.yandex.ru/info';

  async getProfile(accessToken: string): Promise<NormalizedYandexProfile> {
    const token = accessToken.trim();
    if (!token) {
      throw new YandexAuthError('missing_token', 'Yandex access token is required');
    }

    let response: Response;
    try {
      response = await fetch(this.profileUrl, {
        method: 'GET',
        headers: {
          Authorization: `OAuth ${token}`,
          Accept: 'application/json',
        },
      });
    } catch {
      throw new YandexAuthError('upstream_failure', 'Failed to reach Yandex auth');
    }

    if (response.status === 401) {
      throw new YandexAuthError('invalid_token', 'Invalid Yandex access token');
    }

    if (!response.ok) {
      throw new YandexAuthError('upstream_failure', 'Yandex auth request failed');
    }

    let profile: RawYandexProfile;
    try {
      profile = (await response.json()) as RawYandexProfile;
    } catch {
      throw new YandexAuthError('upstream_failure', 'Invalid Yandex profile payload');
    }

    return normalizeYandexProfile(profile);
  }
}

function normalizeYandexProfile(profile: RawYandexProfile): NormalizedYandexProfile {
  const emails = normalizeEmails(profile);
  const defaultEmail = pickCanonicalEmail(profile.default_email, emails);

  if (!defaultEmail) {
    throw new YandexAuthError('profile_without_email', 'Yandex account has no email');
  }

  const normalizedId = String(profile.id ?? '').trim();
  if (!normalizedId) {
    throw new YandexAuthError('upstream_failure', 'Yandex profile is missing id');
  }

  return {
    id: normalizedId,
    defaultEmail,
    emails,
    displayName: normalizeDisplayName(profile),
  };
}

function normalizeEmails(profile: RawYandexProfile): string[] {
  if (!Array.isArray(profile.emails)) {
    return [];
  }

  return profile.emails
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

function pickCanonicalEmail(defaultEmail: string | null | undefined, emails: string[]): string | null {
  const preferred = typeof defaultEmail === 'string' ? defaultEmail.trim().toLowerCase() : '';
  if (preferred) {
    return preferred;
  }

  return emails[0] ?? null;
}

function normalizeDisplayName(profile: RawYandexProfile): string | null {
  const candidates = [
    profile.display_name,
    profile.real_name,
    [profile.first_name, profile.last_name].filter(Boolean).join(' '),
    profile.login,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}
