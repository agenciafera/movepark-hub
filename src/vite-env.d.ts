/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** `"on"` liga a conta do consumidor (favoritar, Entrar, atalhos de conta). Ver `src/lib/features.ts`. */
  readonly VITE_CONSUMER_ACCOUNTS?: string;
  /** `"on"` liga o Movepark Clube (cashback) e o Indique e ganhe na conta. Ver `src/lib/features.ts`. */
  readonly VITE_GROWTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
