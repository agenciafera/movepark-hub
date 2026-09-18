import * as React from "react";
import { Plus, Ticket, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  usePlatformCoupons,
  useSetPlatformCouponActive,
  useUpsertPlatformCoupon,
  type PlatformCouponRow,
} from "@/features/customer-coupons/api";
import {
  AUDIENCE_HINTS,
  AUDIENCE_LABELS,
  buildPlatformCouponArgs,
  EMPTY_PLATFORM_COUPON_FORM,
  platformCouponToForm,
  usageLabel,
  validatePlatformCouponForm,
  type CouponAudience,
  type PlatformCouponFormValues,
} from "@/features/customer-coupons/platformCoupons.logic";
import { formatBRL, formatDate } from "@/lib/format";

const AUDIENCIAS: CouponAudience[] = [
  "code_only",
  "public",
  "first_purchase",
  "second_purchase",
  "winback",
];

/** Campo numérico que aceita vazio como null, para "sem limite" não virar zero. */
function NumeroOpcional({
  id,
  label,
  value,
  onChange,
  hint,
  step,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
      {hint ? <p className="text-caption-sm text-muted">{hint}</p> : null}
    </div>
  );
}

function CampanhaDialog({
  aberta,
  editando,
  onClose,
}: {
  aberta: boolean;
  editando: PlatformCouponRow | null;
  onClose: () => void;
}) {
  const salvar = useUpsertPlatformCoupon();
  const [form, setForm] = React.useState<PlatformCouponFormValues>(EMPTY_PLATFORM_COUPON_FORM);

  React.useEffect(() => {
    if (!aberta) return;
    setForm(editando ? platformCouponToForm(editando) : EMPTY_PLATFORM_COUPON_FORM);
  }, [aberta, editando]);

  function set<K extends keyof PlatformCouponFormValues>(
    k: K,
    v: PlatformCouponFormValues[K],
  ) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    const erro = validatePlatformCouponForm(form);
    if (erro) {
      toast.error(erro);
      return;
    }
    try {
      await salvar.mutateAsync(buildPlatformCouponArgs(editando?.id ?? null, form));
      toast.success("Campanha salva");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a campanha");
    }
  }

  const ehPercentual = form.discount_type === "percent";

  return (
    <Dialog open={aberta} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar campanha" : "Nova campanha"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submeter} className="space-y-5">
          <div className="grid gap-4 tablet:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="BEMVINDO30"
                className="uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">Título na carteira</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Primeira reserva"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="terms">Condições</Label>
            <Textarea
              id="terms"
              rows={2}
              value={form.terms}
              onChange={(e) => set("terms", e.target.value)}
              placeholder="Vale na sua primeira reserva. 30% de desconto, até R$ 40."
            />
            <p className="text-caption-sm text-muted">
              O cliente lê esta frase no cartão do cupom. Quem decide a elegibilidade são as regras
              abaixo, não este texto.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Nota interna</Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Ativação: primeira reserva paga."
            />
          </div>

          <div className="grid gap-4 tablet:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="discount_type">Tipo</Label>
              <Select
                value={form.discount_type}
                onValueChange={(v) => {
                  set("discount_type", v as "percent" | "fixed");
                  if (v === "fixed") set("max_discount_amount", null);
                }}
              >
                <SelectTrigger id="discount_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentual</SelectItem>
                  <SelectItem value="fixed">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumeroOpcional
              id="discount_value"
              label={ehPercentual ? "Percentual" : "Valor em reais"}
              value={form.discount_value}
              onChange={(v) => set("discount_value", v)}
              step="0.01"
            />
            {ehPercentual ? (
              <NumeroOpcional
                id="max_discount_amount"
                label="Teto em reais"
                value={form.max_discount_amount}
                onChange={(v) => set("max_discount_amount", v)}
                hint="Obrigatório."
                step="0.01"
              />
            ) : null}
          </div>

          <div className="grid gap-4 tablet:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="audience">Quem recebe</Label>
              <Select
                value={form.audience}
                onValueChange={(v) => {
                  set("audience", v as CouponAudience);
                  if (v !== "winback") set("audience_inactive_days", null);
                }}
              >
                <SelectTrigger id="audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCIAS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {AUDIENCE_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption-sm text-muted">{AUDIENCE_HINTS[form.audience]}</p>
            </div>
            {form.audience === "winback" ? (
              <NumeroOpcional
                id="audience_inactive_days"
                label="Dias sem reservar"
                value={form.audience_inactive_days}
                onChange={(v) => set("audience_inactive_days", v)}
              />
            ) : null}
          </div>

          <div className="grid gap-4 tablet:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="valid_from">Válido de</Label>
              <Input
                id="valid_from"
                type="date"
                value={form.valid_from}
                onChange={(e) => set("valid_from", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valid_until">Válido até</Label>
              <Input
                id="valid_until"
                type="date"
                value={form.valid_until}
                onChange={(e) => set("valid_until", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 tablet:grid-cols-2">
            <NumeroOpcional
              id="max_uses"
              label="Limite de usos"
              value={form.max_uses}
              onChange={(v) => set("max_uses", v)}
              hint="Vazio: sem limite."
            />
            <NumeroOpcional
              id="per_user_limit"
              label="Limite por cliente"
              value={form.per_user_limit}
              onChange={(v) => set("per_user_limit", v)}
              hint="Vazio: sem limite."
            />
            <NumeroOpcional
              id="min_amount"
              label="Valor mínimo da reserva"
              value={form.min_amount}
              onChange={(v) => set("min_amount", v)}
              step="0.01"
            />
            <NumeroOpcional
              id="min_days"
              label="Diárias mínimas"
              value={form.min_days}
              onChange={(v) => set("min_days", v)}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-hairline p-3">
            <Label htmlFor="is_active">Campanha ativa</Label>
            <Switch
              id="is_active"
              checked={form.is_active}
              onCheckedChange={(c) => set("is_active", c)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar campanha"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Campanhas de cupom da Movepark.
 *
 * Separada de `/operator/coupons` de propósito: lá o parceiro cria promoção da própria empresa e
 * banca o desconto; aqui a Movepark cria cupom que vale na rede inteira e o desconto sai da nossa
 * comissão. Misturar as duas numa tela só faria o gestor pausar a campanha errada.
 */
export default function ManagerMarketingCupons() {
  const cupons = usePlatformCoupons();
  const toggle = useSetPlatformCouponActive();
  const [aberta, setAberta] = React.useState(false);
  const [editando, setEditando] = React.useState<PlatformCouponRow | null>(null);

  function abrir(c: PlatformCouponRow | null) {
    setEditando(c);
    setAberta(true);
  }

  async function alternar(c: PlatformCouponRow) {
    try {
      await toggle.mutateAsync({ id: c.id, is_active: !c.is_active });
      toast.success(c.is_active ? "Campanha pausada" : "Campanha no ar");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível mudar a campanha");
    }
  }

  const lista = cupons.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cupons da Movepark"
        description="Campanhas que valem em toda a rede, sem depender do parceiro."
        actions={
          <Button onClick={() => abrir(null)}>
            <Plus className="h-4 w-4" />
            Nova campanha
          </Button>
        }
      />

      <div className="flex items-start gap-2 rounded-md border border-hairline bg-surface-soft p-3">
        <Warning className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <p className="text-body-sm text-ink">
          Quem banca é a Movepark. O parceiro recebe o mesmo repasse que receberia sem o cupom, e o
          desconto sai da comissão. Por isso todo percentual precisa de teto: sem ele, uma estadia
          longa consome a comissão inteira e a cobrança falha.
        </p>
      </div>

      {cupons.isError ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-error bg-badge-cancelled-bg p-4">
          <p className="text-body-sm text-error">Não conseguimos carregar as campanhas agora.</p>
          <Button variant="secondary" size="sm" onClick={() => cupons.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : cupons.isLoading ? (
        <Skeleton className="h-64 w-full rounded-md" />
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-10 w-10" />}
          title="Nenhuma campanha ainda"
          description="Crie a primeira e ela aparece na carteira de quem se encaixa na audiência."
          action={<Button onClick={() => abrir(null)}>Nova campanha</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Desconto</TableHead>
                <TableHead>Quem recebe</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="font-mono text-body-sm text-ink">{c.code}</p>
                    {c.title ? <p className="text-caption-sm text-muted">{c.title}</p> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.discount_type === "percent"
                      ? `${Number(c.discount_value)}%`
                      : formatBRL(Number(c.discount_value))}
                    {c.max_discount_amount != null ? (
                      <span className="text-caption-sm text-muted">
                        {" "}
                        até {formatBRL(Number(c.max_discount_amount))}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {AUDIENCE_LABELS[c.audience as CouponAudience] ?? c.audience}
                    {c.audience_inactive_days != null ? (
                      <span className="text-caption-sm text-muted">
                        {" "}
                        ({c.audience_inactive_days}d)
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-caption-sm text-muted">
                    {c.valid_until ? `até ${formatDate(c.valid_until)}` : "sem prazo"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-caption-sm text-muted">
                    {usageLabel(c.times_used, c.max_uses)}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={c.is_active}
                      onCheckedChange={() => alternar(c)}
                      disabled={toggle.isPending}
                      aria-label={c.is_active ? "Pausar campanha" : "Ativar campanha"}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => abrir(c)}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CampanhaDialog aberta={aberta} editando={editando} onClose={() => setAberta(false)} />
    </div>
  );
}
