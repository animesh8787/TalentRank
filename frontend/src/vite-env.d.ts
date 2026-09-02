/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the deployed backend, e.g. https://talentrank-api.onrender.com.
   *  Leave unset in local dev — Vite's proxy handles /api. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
