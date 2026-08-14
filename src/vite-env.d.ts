/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** `"on"` liga a conta do consumidor (favoritar, Entrar, atalhos de conta). Ver `src/lib/features.ts`. */
  readonly VITE_CONSUMER_ACCOUNTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
