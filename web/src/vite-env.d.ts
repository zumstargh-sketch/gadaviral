/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional API origin override (e.g. staging). Unset in production builds. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
