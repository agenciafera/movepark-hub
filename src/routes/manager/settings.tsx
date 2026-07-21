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
import {
  DEFAULT_INSTALLMENT_POLICY,
  parseInstallmentPolicy,
  type InstallmentAbsorb,
} from "@/lib/installments";
import {
  clampGraceMinutes,
  clampHoldMinutes,
  clampMaxMinutes,
  parseGraceMinutes,
  parseHoldMinutes,
  parseMaxMinutes,
} from "@/lib/bookingHold";

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
            placeholder="Movepark Hub <hub@movepark.co>"
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

function PaymentsSettings() {
  const { data, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const [recipientId, setRecipientId] = React.useState("");
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (data && !ready) {
      setRecipientId(data.pagarme_movepark_recipient_id ?? "");
      setReady(true);
    }
  }, [data, ready]);

  async function save() {
    try {
      await update.mutateAsync({ pagarme_movepark_recipient_id: recipientId.trim() });
      toast.success("Configuração de pagamento salva");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Split de pagamento (Pagar.me)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="movepark-recipient">Recebedor master da Movepark</Label>
          <Input
            id="movepark-recipient"
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            placeholder="rp_xxxxxxxxxxxxxxxx"
            disabled={isLoading}
          />
          <span className="text-caption text-muted">
            ID do recebedor da Movepark no Pagar.me que recebe a comissão (take_rate) no split. Use o
            de staging agora e troque pelo de produção quando for ao ar.
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

function InstallmentPolicySettings() {
  const { data, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const [form, setForm] = React.useState(DEFAULT_INSTALLMENT_POLICY);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (data && !ready) {
      setForm(parseInstallmentPolicy(data.card_installment_policy));
      setReady(true);
    }
  }, [data, ready]);

  function num(v: string, fallback: number) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  async function save() {
    // normaliza/clampa antes de salvar (mesma regra do servidor)
    const policy = parseInstallmentPolicy(form);
    try {
      await update.mutateAsync({ card_installment_policy: JSON.stringify(policy) });
      toast.success("Política de parcelamento salva");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parcelamento no cartão</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="card-enabled">Aceitar cartão parcelado</Label>
          <Switch
            id="card-enabled"
            checked={form.enabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="max-inst">Máximo de parcelas</Label>
            <Input
              id="max-inst"
              type="number"
              min={1}
              max={24}
              value={form.maxInstallments}
              onChange={(e) => setForm((f) => ({ ...f, maxInstallments: num(e.target.value, f.maxInstallments) }))}
              disabled={isLoading}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="free-inst">Parcelas sem juros (até)</Label>
            <Input
              id="free-inst"
              type="number"
              min={1}
              value={form.interestFreeUpTo}
              onChange={(e) => setForm((f) => ({ ...f, interestFreeUpTo: num(e.target.value, f.interestFreeUpTo) }))}
              disabled={isLoading}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interest">Juros ao mês (%)</Label>
            <Input
              id="interest"
              type="number"
              min={0}
              step="0.01"
              value={form.monthlyInterestPct}
              onChange={(e) => setForm((f) => ({ ...f, monthlyInterestPct: num(e.target.value, f.monthlyInterestPct) }))}
              disabled={isLoading}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="min-inst">Parcela mínima (R$)</Label>
            <Input
              id="min-inst"
              type="number"
              min={0}
              step="0.01"
              value={(form.minInstallmentCents / 100).toFixed(2)}
              onChange={(e) =>
                setForm((f) => ({ ...f, minInstallmentCents: Math.round(num(e.target.value, f.minInstallmentCents / 100) * 100) }))
              }
              disabled={isLoading}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="absorb">Quem paga o juros</Label>
          <select
            id="absorb"
            className="h-10 rounded-md border border-hairline bg-canvas px-3 text-body-sm"
            value={form.absorb}
            onChange={(e) => setForm((f) => ({ ...f, absorb: e.target.value as InstallmentAbsorb }))}
            disabled={isLoading}
          >
            <option value="customer">Cliente (juros no preço)</option>
            <option value="movepark">Movepark absorve (preço fixo)</option>
            <option value="partner">Parceiro absorve (preço fixo)</option>
          </select>
          <span className="text-caption text-muted">
            "Cliente" embute o juros nas parcelas acima da faixa sem juros. "Absorve" mantém o preço
            fixo ao cliente.
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

export function BookingHoldSettings() {
  const { data, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const [hold, setHold] = React.useState(String(parseHoldMinutes(undefined)));
  const [grace, setGrace] = React.useState(String(parseGraceMinutes(undefined)));
  const [maxHold, setMaxHold] = React.useState(String(parseMaxMinutes(undefined)));
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (data && !ready) {
      setHold(String(parseHoldMinutes(data.booking_hold_minutes)));
      setGrace(String(parseGraceMinutes(data.booking_hold_grace_minutes)));
      setMaxHold(String(parseMaxMinutes(data.booking_hold_max_minutes)));
      setReady(true);
    }
  }, [data, ready]);

  async function save() {
    // clampa antes de salvar (mesma faixa do servidor)
    const holdMinutes = clampHoldMinutes(hold);
    const graceMinutes = clampGraceMinutes(grace);
    const maxMinutes = clampMaxMinutes(maxHold);
    setHold(String(holdMinutes));
    setGrace(String(graceMinutes));
    setMaxHold(String(maxMinutes));
    try {
      await update.mutateAsync({
        booking_hold_minutes: String(holdMinutes),
        booking_hold_grace_minutes: String(graceMinutes),
        booking_hold_max_minutes: String(maxMinutes),
      });
      toast.success("Janela de expiração salva");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Janela de expiração da reserva</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hold-minutes">Hold da reserva (min)</Label>
            <Input
              id="hold-minutes"
              type="number"
              min={5}
              max={1440}
              value={hold}
              onChange={(e) => setHold(e.target.value)}
              disabled={isLoading}
            />
            <span className="text-caption text-muted">
              Tempo que a vaga fica reservada aguardando pagamento. O QR PIX vale exatamente essa
              janela, e ela é renovada quando o cliente inicia o pagamento.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grace-minutes">Folga do cancelamento (min)</Label>
            <Input
              id="grace-minutes"
              type="number"
              min={0}
              max={60}
              value={grace}
              onChange={(e) => setGrace(e.target.value)}
              disabled={isLoading}
            />
            <span className="text-caption text-muted">
              Margem extra antes do cron cancelar uma reserva não paga, cobrindo atraso de webhook.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="max-minutes">Renovação máxima (min)</Label>
            <Input
              id="max-minutes"
              type="number"
              min={10}
              max={1440}
              value={maxHold}
              onChange={(e) => setMaxHold(e.target.value)}
              disabled={isLoading}
            />
            <span className="text-caption text-muted">
              Teto total do hold desde a criação. Depois disso, o modal "Ainda está aí?" para de
              renovar e a vaga é liberada. Precisa ser maior que o hold.
            </span>
          </div>
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
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
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
                <Input id="platform-name" defaultValue="Movepark Hub" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="support">E-mail de suporte</Label>
                <Input id="support" type="email" defaultValue="suporte@movepark.co" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="partners">
          <PartnerEmailSettings />
        </TabsContent>

        <TabsContent value="payments" className="flex flex-col gap-6">
          <PaymentsSettings />
          <BookingHoldSettings />
          <InstallmentPolicySettings />
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Templates de e-mail</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-confirm">Confirmação de reserva</Label>
                <Textarea
                  id="tpl-confirm"
                  defaultValue="Olá {{nome}}, sua reserva {{codigo}} foi confirmada."
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-cancel">Cancelamento</Label>
                <Textarea id="tpl-cancel" defaultValue="Sua reserva {{codigo}} foi cancelada." />
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
