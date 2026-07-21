import * as React from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { getStoredTheme, setStoredTheme, type Theme } from "@/lib/theme";
import { useAuth } from "@/auth/context";
import {
  useProfile,
  useUpdateProfile,
  type Preferences,
} from "@/features/profile/api";

export default function PreferencesPage() {
  const { session } = useAuth();
  const profileQ = useProfile(session?.userId);
  const update = useUpdateProfile();

  const [language, setLanguage] = React.useState<string>("pt-BR");
  const [currency, setCurrency] = React.useState<string>("BRL");
  const [emailConfirmation, setEmailConfirmation] = React.useState(true);
  const [emailReminder, setEmailReminder] = React.useState(true);
  const [emailOffers, setEmailOffers] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  /**
   * O tema mora no localStorage, não no perfil, então vale na hora e fica fora do
   * "Salvar" desta página (que grava idioma, moeda e notificações no servidor).
   * SSR-safe igual ao ThemeToggle: começa em "light", que é o HTML pré-renderizado,
   * e sincroniza depois de montar.
   */
  const [theme, setTheme] = React.useState<Theme>("light");
  React.useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  function handleThemeChange(dark: boolean) {
    const next: Theme = dark ? "dark" : "light";
    setTheme(next);
    setStoredTheme(next);
  }

  React.useEffect(() => {
    if (!profileQ.data) return;
    const p = profileQ.data.preferences;
    setLanguage(p.language ?? "pt-BR");
    setCurrency(p.currency ?? "BRL");
    setEmailConfirmation(p.notifications?.email_confirmation ?? true);
    setEmailReminder(p.notifications?.email_reminder ?? true);
    setEmailOffers(p.notifications?.email_offers ?? false);
    setDirty(false);
  }, [profileQ.data]);

  function dirtyOn<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  async function handleSave() {
    if (!session) return;
    try {
      const next: Preferences = {
        ...(profileQ.data?.preferences ?? {}),
        language: language as Preferences["language"],
        currency: currency as Preferences["currency"],
        notifications: {
          email_confirmation: emailConfirmation,
          email_reminder: emailReminder,
          email_offers: emailOffers,
        },
      };
      await update.mutateAsync({ id: session.userId, preferences: next });
      toast.success("Preferências salvas");
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  function handleExport() {
    toast.info("Em breve: você poderá baixar seus dados em formato JSON.");
  }

  if (profileQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Preferências"
        description="Personalize como o app se comporta pra você."
      />

      <section className="space-y-4">
        <h2 className="text-title-md text-ink">Idioma e moeda</h2>
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pref-lang">Idioma</Label>
            <Select value={language} onValueChange={dirtyOn(setLanguage)}>
              <SelectTrigger id="pref-lang">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                <SelectItem value="pt-PT">Português (Portugal)</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pref-currency">Moeda</Label>
            <Select value={currency} onValueChange={dirtyOn(setCurrency)}>
              <SelectTrigger id="pref-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BRL">Real (R$)</SelectItem>
                <SelectItem value="EUR">Euro (€)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-title-md text-ink">Aparência</h2>
        <div className="rounded-md border border-hairline bg-canvas p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-body-md text-ink">Tema escuro</div>
              <div className="text-body-sm text-muted">
                Fundo grafite, mais confortável à noite. Vale já, sem precisar salvar.
              </div>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={handleThemeChange}
              aria-label="Tema escuro"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-title-md text-ink">Notificações por e-mail</h2>
        <div className="space-y-3 rounded-md border border-hairline bg-canvas p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-body-md text-ink">Confirmação de reserva</div>
              <div className="text-body-sm text-muted">
                Recibo e voucher logo após confirmar o pagamento.
              </div>
            </div>
            <Switch
              checked={emailConfirmation}
              onCheckedChange={dirtyOn(setEmailConfirmation)}
            />
          </div>
          <div className="h-px bg-hairline" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-body-md text-ink">Lembrete pré-check-in</div>
              <div className="text-body-sm text-muted">
                Aviso 24h antes com instruções e endereço.
              </div>
            </div>
            <Switch
              checked={emailReminder}
              onCheckedChange={dirtyOn(setEmailReminder)}
            />
          </div>
          <div className="h-px bg-hairline" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-body-md text-ink">Ofertas e promoções</div>
              <div className="text-body-sm text-muted">
                Cupons, novidades e descontos eventuais.
              </div>
            </div>
            <Switch
              checked={emailOffers}
              onCheckedChange={dirtyOn(setEmailOffers)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-title-md text-ink">Seus dados (LGPD)</h2>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-hairline bg-canvas p-4">
          <div>
            <div className="text-body-md text-ink">Baixar meus dados</div>
            <div className="text-body-sm text-muted">
              Exporta perfil, reservas e cartões em JSON.
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Solicitar
          </Button>
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!dirty || update.isPending}>
          {update.isPending ? "Salvando…" : "Salvar preferências"}
        </Button>
      </div>
    </div>
  );
}
