export function readLaunchToken(): string | null {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const directToken = normalizeTokenValue(searchParams.get('token')) ?? normalizeTokenValue(hashParams.get('token'));
  if (directToken) {
    return directToken;
  }

  const maxBridgeToken = normalizeTokenValue(window.WebApp?.initDataUnsafe?.start_param);
  if (maxBridgeToken) {
    return maxBridgeToken;
  }

  const maxInitDataToken = readTokenFromMaxInitData(window.WebApp?.initData);
  if (maxInitDataToken) {
    return maxInitDataToken;
  }

  const maxWebAppDataToken = readTokenFromMaxInitData(hashParams.get('WebAppData') ?? undefined);
  if (maxWebAppDataToken) {
    return maxWebAppDataToken;
  }

  const maxStartParam = normalizeTokenValue(searchParams.get('startapp')) ?? normalizeTokenValue(hashParams.get('startapp'));
  if (maxStartParam) {
    return maxStartParam;
  }

  const maxWebAppStartParam = normalizeTokenValue(searchParams.get('WebAppStartParam')) ?? normalizeTokenValue(hashParams.get('WebAppStartParam'));
  if (maxWebAppStartParam) {
    return maxWebAppStartParam;
  }

  return null;
}

function normalizeTokenValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const token = value.trim();
    return token || null;
  }

  return null;
}

function readTokenFromMaxInitData(initData: string | undefined): string | null {
  if (!initData) {
    return null;
  }

  const params = new URLSearchParams(initData);
  return normalizeTokenValue(params.get('start_param'));
}

export function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
