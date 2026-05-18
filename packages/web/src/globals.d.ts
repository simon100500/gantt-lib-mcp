declare const __APP_BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_LANDING_SITE_URL?: string;
  readonly VITE_FACT_APP_URL?: string;
  readonly VITE_FACT_MAX_BOT_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
