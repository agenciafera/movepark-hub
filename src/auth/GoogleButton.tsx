import * as React from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "./context";

/**
 * Logo oficial do Google em SVG inline (5KB).
 * Substitui por <img> quando tivermos asset CDN.
 */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083L43.595 20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

type Props = {
  /** Texto do botão (default "Continuar com Google"). */
  label?: string;
};

export function GoogleButton({ label = "Continuar com Google" }: Props) {
  const { signInWithGoogle } = useAuth();
  const location = useLocation();
  const [submitting, setSubmitting] = React.useState(false);

  // Preserva `?next=` se presente nessa rota (login/signup)
  const params = new URLSearchParams(location.search);
  const next = params.get("next") ?? undefined;

  async function handleClick() {
    setSubmitting(true);
    try {
      await signInWithGoogle(next);
      // navigate fica a cargo do callback após OAuth
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível continuar com Google";
      toast.error(msg);
      setSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full justify-center gap-2"
      onClick={handleClick}
      disabled={submitting}
    >
      <GoogleLogo />
      {submitting ? "Abrindo…" : label}
    </Button>
  );
}
