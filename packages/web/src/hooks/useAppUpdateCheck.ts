import { useCallback, useEffect, useState } from 'react';

interface VersionPayload {
  buildId?: string;
}

async function fetchLatestBuildId(): Promise<string | null> {
  const response = await fetch(`/version.json?ts=${Date.now()}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json() as VersionPayload;
  return typeof payload.buildId === 'string' && payload.buildId.length > 0 ? payload.buildId : null;
}

export function useAppUpdateCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const checkForUpdate = useCallback(async () => {
    try {
      const latestBuildId = await fetchLatestBuildId();
      if (latestBuildId && latestBuildId !== __APP_BUILD_ID__) {
        setUpdateAvailable(true);
      }
    } catch {
      // Ignore version check failures silently.
    }
  }, []);

  useEffect(() => {
    void checkForUpdate();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdate();
      }
    };

    const handleFocus = () => {
      void checkForUpdate();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkForUpdate]);

  const reloadApp = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    updateAvailable,
    reloadApp,
  };
}
