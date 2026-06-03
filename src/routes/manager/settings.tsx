import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAppSettings, useUpdateAppSettings } from "@/features/settings/api";

function PartnerEmailSettings() {
  const { data, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const [from, setFrom] = React.useState("");
  const [inbox, setInbox] = React.useState("");
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (data && !ready) {
      setFrom(data.partner_email_from ?? "");
      setInbox(data.partner_leads_inbox ?? "");
      setReady(true);
    }
  }, [data, ready]);

  async function save() {
    try {
      await update.mutateAsync({ partner_email_from: from.trim(), partner_leads_inbox: inbox.trim() });
      toast.success("Configurações de e-mail salvas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-mails de parceiros</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">Remetente (De:)</Label>
          <Input
            id="from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="MovePark Hub <hub@movepark.co>"
            disabled={isLoading}
          />
          <span className="text-caption text-muted">
            Deve ser um endereço/domínio verificado no provedor de e-mail (SES).
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inbox">Caixa interna para novos leads</Label>
          <Input
            id="inbox"
            value={inbox}
            onChange={(e) => setInbox(e.target.value)}
            placeholder="(vazio = não envia alerta interno)"
            disabled={isLoading}
          />
          <span className="text-caption text-muted">
            Recebe um aviso a cada novo cadastro de estacionamento. Deixe vazio para desativar.
          </span>
        </div>
        <div>
          <Button onClick={save} disabled={update.isPending || isLoading}>
            {update.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ManagerSettings() {
  const [twoFactor, setTwoFactor] = React.useState(false);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configurações" description="Ajustes globais da plataforma." />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="partners">Parceiros</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="security">Segurança</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Plataforma</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="platform-name">Nome</Label>
                <Input id="platform-name" defaultValue="Move Park Hub" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="support">E-mail de suporte</Label>
                <Input id="support" type="email" defaultValue="suporte@movepark.com" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="partners">
          <PartnerEmailSettings />
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Templates de e-mail</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Confirmação de reserva</Label>
                <Textarea defaultValue="Olá {{nome}}, sua reserva {{codigo}} foi confirmada." />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Cancelamento</Label>
                <Textarea defaultValue="Sua reserva {{codigo}} foi cancelada." />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Segurança</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-title-md">2FA obrigatório</div>
                  <div className="text-body-sm text-muted">
                    Exige autenticação em dois fatores para todos os hub_admin.
                  </div>
                </div>
                <Switch checked={twoFactor} onCheckedChange={setTwoFactor} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
