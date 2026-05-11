declare const __APP_BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_LANDING_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
