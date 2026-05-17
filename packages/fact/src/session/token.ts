export function readLaunchToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const directToken = params.get('token')?.trim();
  if (directToken) {
    return directToken;
  }

  const maxStartParam = params.get('startapp')?.trim();
  return maxStartParam || null;
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
