import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AccountMobileMenu } from "@/components/shared/AccountSidebar";
import { useAuth } from "@/auth/context";

/**
 * `/account` raiz:
 * - desktop: redireciona pra `/account/profile`
 * - mobile: mostra lista de cards (cada um vai pra uma sub-rota)
 */
export default function AccountIndex() {
  const navigate = useNavigate();
  const { session } = useAuth();

  useEffect(() => {
    const isDesktop = window.matchMedia("(min-width: 1128px)").matches;
    if (isDesktop) navigate("/account/profile", { replace: true });
  }, [navigate]);

  return (
    <div className="space-y-6">
      <div className="space-y-1 desktop:hidden">
        <p className="text-body-md text-muted">
          Olá, <span className="text-ink">{session?.fullName ?? session?.email}</span>.
        </p>
      </div>
      <AccountMobileMenu />
    </div>
  );
}
