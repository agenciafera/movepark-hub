import * as React from "react";
import { toast } from "sonner";
import { InstagramLogo } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSettings, useUpdateAppSettings } from "@/features/settings/api";
import { useSocialPosts } from "@/features/social/api";
import { SocialPostDetail } from "@/features/social/SocialPostDetail";
import {
  ABAS,
  abaDoStatus,
  formatarQuando,
  mensagemDoErro,
  ROTULO_STATUS,
  type SocialAba,
  TOM_STATUS,
} from "@/features/social/social.logic";
import type { SocialPost } from "@/types/domain";

const VAZIO: Record<SocialAba, string> = {
  "para-aprovar": "Quando chegar um post novo, ele aparece aqui para você conferir.",
  agendados: "Nenhum post aprovado esperando a hora de sair.",
  publicados: "Nenhum post publicado pela plataforma ainda.",
  falhas: "Nenhuma publicação falhou.",
};

/**
 * Fila de publicação do Instagram (E3.6). O post chega pronto da skill, alguém confere e aprova
 * aqui, e a Edge `social-dispatch` publica na hora marcada quando a publicação automática está
 * ligada. Spec: docs/specs/instagram-fila-de-publicacao.md
 */
export default function ManagerSocial() {
  const { data, isLoading } = useSocialPosts();
  const settings = useAppSettings();
  const updateSettings = useUpdateAppSettings();
  const [aba, setAba] = React.useState<SocialAba>("para-aprovar");
  const [abertoId, setAbertoId] = React.useState<string | null>(null);

  const ligada = settings.data?.social_dispatch_enabled === "true";

  const porAba = React.useMemo(() => {
    const grupos: Record<SocialAba, SocialPost[]> = {
      "para-aprovar": [],
      agendados: [],
      publicados: [],
      falhas: [],
    };
    for (const p of data ?? []) {
      const a = abaDoStatus(p.status);
      if (a) grupos[a].push(p);
    }
    grupos.publicados.reverse();
    return grupos;
  }, [data]);

  const aberto = (data ?? []).find((p) => p.id === abertoId) ?? null;

  async function alternar(valor: boolean) {
    const pergunta = valor
      ? "Ligar a publicação automática? Os posts aprovados passam a sair sozinhos na hora marcada."
      : "Desligar a publicação automática? Nada sai até você ligar de novo.";
    if (!window.confirm(pergunta)) return;
    try {
      await updateSettings.mutateAsync({ social_dispatch_enabled: valor ? "true" : "false" });
      toast.success(valor ? "Publicação automática ligada" : "Publicação automática desligada");
    } catch (e) {
      toast.error(mensagemDoErro(e, "Não deu para salvar. Tente de novo."));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instagram"
        description="Aprove os posts que chegaram e acompanhe o que vai sair."
        actions={
          <div className="flex items-center gap-3 text-sm">
            <Switch
              checked={ligada}
              onCheckedChange={alternar}
              aria-label="Publicação automática"
              disabled={settings.isLoading || updateSettings.isPending}
            />
            <span>
              {ligada ? "Publicação automática ligada" : "Publicação automática desligada"}
            </span>
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Tabs value={aba} onValueChange={(v) => setAba(v as SocialAba)}>
          <TabsList>
            {ABAS.map((a) => (
              <TabsTrigger key={a.id} value={a.id}>
                {a.rotulo} ({porAba[a.id].length})
              </TabsTrigger>
            ))}
          </TabsList>
          {ABAS.map((a) => (
            <TabsContent key={a.id} value={a.id} className="mt-4">
              {porAba[a.id].length === 0 ? (
                <EmptyState
                  icon={<InstagramLogo />}
                  title="Nada por aqui"
                  description={VAZIO[a.id]}
                />
              ) : (
                <ul className="divide-y divide-hairline rounded-md border border-hairline">
                  {porAba[a.id].map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setAbertoId(p.id)}
                        className="flex w-full items-center gap-4 p-3 text-left hover:bg-surface-soft"
                      >
                        <img
                          src={p.slides[0]?.url}
                          alt=""
                          className="size-16 shrink-0 rounded object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{p.caption.split("\n")[0]}</p>
                          <p className="text-sm text-muted">
                            {formatarQuando(p.scheduled_at)} · {p.slides.length}{" "}
                            {p.slides.length > 1 ? "slides" : "imagem"}
                          </p>
                        </div>
                        <Badge tone={TOM_STATUS[p.status]}>{ROTULO_STATUS[p.status]}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <SocialPostDetail post={aberto} onClose={() => setAbertoId(null)} />
    </div>
  );
}
