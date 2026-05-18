export function readLaunchToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const directToken = params.get('token')?.trim();
  if (directToken) {
    return directToken;
  }

  const maxBridgeToken = window.WebApp?.initDataUnsafe?.start_param?.trim();
  if (maxBridgeToken) {
    return maxBridgeToken;
  }

  const maxStartParam = params.get('startapp')?.trim();
  if (maxStartParam) {
    return maxStartParam;
  }

  return null;
}

export function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
