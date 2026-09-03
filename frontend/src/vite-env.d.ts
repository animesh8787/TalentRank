/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the deployed backend, e.g. https://talentrank-api.onrender.com.
   *  Leave unset in local dev — Vite's proxy handles /api. */
  readonly VITE_API_URL?: string

  /** Firebase web app config — from Firebase console > Project settings >
   *  General > Your apps. These are public, safe to embed in the bundle;
   *  the private service-account key is a backend-only secret, never here. */
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
