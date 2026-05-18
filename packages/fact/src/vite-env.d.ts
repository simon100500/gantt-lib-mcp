/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FACT_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  readonly WebApp?: {
    readonly HapticFeedback?: {
      readonly impactOccurred?: (
        impactStyle: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft',
        disableVibrationFallback?: boolean,
      ) => Promise<{ status: 'impactOccured' }>;
    };
    readonly initData?: string;
    readonly initDataUnsafe?: {
      readonly start_param?: unknown;
    };
  };
}
