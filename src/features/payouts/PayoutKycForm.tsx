import * as React from "react";
import {
  useForm,
  useController,
  FormProvider,
  useFormContext,
  type Control,
  type Path,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fetchCep } from "@/lib/cep";
import { fetchCnpj } from "@/lib/cnpj";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { PhoneField } from "@/components/ui/phone-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StateSelect } from "@/components/shared/StateSelect";
import { BankSelect } from "@/components/shared/BankSelect";
import { cepMask, cnpjMask, cpfMask, dateMask, onlyDigits } from "@/lib/masks";
import { cn } from "@/lib/utils";
import { CORPORATION_TYPES, payoutKycSchema, type PayoutKycForm as KycValues } from "./kyc";

type Mask = (v: string) => string;

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {error && <span className="text-caption text-error">{error}</span>}
    </div>
  );
}

function TextField({
  control,
  name,
  label,
  placeholder,
  mask,
  type,
}: {
  control: Control<KycValues>;
  name: Path<KycValues>;
  label: string;
  placeholder?: string;
  mask?: Mask;
  type?: string;
}) {
  const { field, fieldState } = useController({ control, name });
  return (
    <Field label={label} error={fieldState.error?.message}>
      <Input
        type={type}
        placeholder={placeholder}
        value={(field.value as string) ?? ""}
        onBlur={field.onBlur}
        onChange={(e) => field.onChange(mask ? mask(e.target.value) : e.target.value)}
      />
    </Field>
  );
}

function PhoneFormField({
  control,
  name,
  label,
}: {
  control: Control<KycValues>;
  name: Path<KycValues>;
  label: string;
}) {
  const { field, fieldState } = useController({ control, name });
  return (
    <Field label={label} error={fieldState.error?.message}>
      <PhoneField
        value={(field.value as string) || undefined}
        onChange={(v) => field.onChange(v ?? "")}
        aria-invalid={!!fieldState.error}
      />
    </Field>
  );
}

function MoneyField({
  control,
  name,
  label,
}: {
  control: Control<KycValues>;
  name: Path<KycValues>;
  label: string;
}) {
  const { field, fieldState } = useController({ control, name });
  return (
    <Field label={label} error={fieldState.error?.message}>
      <CurrencyInput value={field.value as number | null} onChange={(v) => field.onChange(v)} />
    </Field>
  );
}

function StateField({ control, name, label }: { control: Control<KycValues>; name: Path<KycValues>; label: string }) {
  const { field, fieldState } = useController({ control, name });
  return (
    <Field label={label} error={fieldState.error?.message}>
      <StateSelect value={(field.value as string) ?? ""} onValueChange={field.onChange} />
    </Field>
  );
}

function CorporationTypeField({ control }: { control: Control<KycValues> }) {
  const { field, fieldState } = useController({ control, name: "company.corporation_type" });
  return (
    <Field label="Tipo de empresa" error={fieldState.error?.message}>
      <Select value={field.value} onValueChange={field.onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          {CORPORATION_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function BankCodeField({ control }: { control: Control<KycValues> }) {
  const { field, fieldState } = useController({ control, name: "bank.bank_code" });
  return (
    <Field label="Banco" error={fieldState.error?.message}>
      <BankSelect
        value={(field.value as string) ?? ""}
        onChange={(code) => field.onChange(code)}
        invalid={!!fieldState.error}
      />
    </Field>
  );
}

function AccountTypeField({ control }: { control: Control<KycValues> }) {
  const { field, fieldState } = useController({ control, name: "bank.account_type" });
  return (
    <Field label="Tipo de conta" error={fieldState.error?.message}>
      <Select value={field.value} onValueChange={field.onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="checking">Conta corrente</SelectItem>
          <SelectItem value="savings">Conta poupança</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-body-md font-medium text-ink">{title}</h3>
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">{children}</div>
    </div>
  );
}

type AddrPrefix = "company.address" | "representative.address";

/**
 * Campo de CEP que autopreenche rua/bairro/cidade/UF (ViaCEP) assim que o CEP fica completo.
 * Usa o setValue do form (FormProvider) para setar os campos irmãos do mesmo endereço.
 */
function CepField({
  control,
  prefix,
  className,
}: {
  control: Control<KycValues>;
  prefix: AddrPrefix;
  className?: string;
}) {
  const name = `${prefix}.zip_code` as Path<KycValues>;
  const { field, fieldState } = useController({ control, name });
  const { setValue } = useFormContext<KycValues>();
  const [loading, setLoading] = React.useState(false);

  async function autofill(value: string) {
    setLoading(true);
    const addr = await fetchCep(value);
    if (addr) {
      const opts = { shouldValidate: true, shouldDirty: true } as const;
      setValue(`${prefix}.street` as Path<KycValues>, addr.street, opts);
      setValue(`${prefix}.neighborhood` as Path<KycValues>, addr.neighborhood, opts);
      setValue(`${prefix}.city` as Path<KycValues>, addr.city, opts);
      setValue(`${prefix}.state` as Path<KycValues>, addr.state, opts);
    }
    setLoading(false);
  }

  return (
    <Field
      label={loading ? "CEP (buscando endereço…)" : "CEP"}
      error={fieldState.error?.message}
      className={className}
    >
      <Input
        placeholder="00000-000"
        value={(field.value as string) ?? ""}
        onBlur={field.onBlur}
        onChange={(e) => {
          const masked = cepMask(e.target.value);
          field.onChange(masked);
          if (onlyDigits(masked).length === 8) void autofill(masked);
        }}
      />
    </Field>
  );
}

function AddressFields({ control, prefix }: { control: Control<KycValues>; prefix: AddrPrefix }) {
  return (
    <>
      {/* CEP ocupa a linha toda (é o gatilho do autopreenchimento); Rua e Número na mesma linha. */}
      <CepField control={control} prefix={prefix} className="tablet:col-span-2" />
      <TextField control={control} name={`${prefix}.street` as Path<KycValues>} label="Rua" />
      <TextField control={control} name={`${prefix}.street_number` as Path<KycValues>} label="Número" />
      <TextField control={control} name={`${prefix}.complement` as Path<KycValues>} label="Complemento" />
      <TextField control={control} name={`${prefix}.neighborhood` as Path<KycValues>} label="Bairro" />
      <TextField control={control} name={`${prefix}.city` as Path<KycValues>} label="Cidade" />
      <StateField control={control} name={`${prefix}.state` as Path<KycValues>} label="Estado (UF)" />
      <TextField control={control} name={`${prefix}.reference_point` as Path<KycValues>} label="Ponto de referência" />
    </>
  );
}

function RepDeclaration({ control }: { control: Control<KycValues> }) {
  const { field, fieldState } = useController({
    control,
    name: "representative.self_declared_legal_representative",
  });
  return (
    <div className="flex flex-col gap-1.5 tablet:col-span-2">
      <label className="flex items-start gap-2">
        <Checkbox checked={field.value as boolean} onCheckedChange={(c) => field.onChange(c === true)} />
        <span className="text-body-sm text-ink">
          Declaro que sou o representante legal da empresa e que as informações são verdadeiras.
        </span>
      </label>
      {fieldState.error?.message && (
        <span className="text-caption text-error">{fieldState.error.message}</span>
      )}
    </div>
  );
}

/**
 * Campo de CNPJ que autopreenche razão social, nome fantasia e data de fundação (BrasilAPI/Receita)
 * assim que o CNPJ fica completo. Não sobrescreve campo com valor vazio (empresa sem nome fantasia
 * não apaga o que o dono digitou). Mesmo padrão do CepField.
 */
function CnpjField({ control }: { control: Control<KycValues> }) {
  const { field, fieldState } = useController({ control, name: "company.document" });
  const { setValue } = useFormContext<KycValues>();
  const [loading, setLoading] = React.useState(false);

  async function autofill(value: string) {
    setLoading(true);
    const data = await fetchCnpj(value);
    if (data) {
      const opts = { shouldValidate: true, shouldDirty: true } as const;
      if (data.legalName) setValue("company.legal_name", data.legalName, opts);
      if (data.tradeName) setValue("company.trade_name", data.tradeName, opts);
      if (data.foundingDate) setValue("company.founding_date", data.foundingDate, opts);
    }
    setLoading(false);
  }

  return (
    <Field label={loading ? "CNPJ (buscando dados…)" : "CNPJ"} error={fieldState.error?.message}>
      <Input
        placeholder="00.000.000/0000-00"
        value={(field.value as string) ?? ""}
        onBlur={field.onBlur}
        onChange={(e) => {
          const masked = cnpjMask(e.target.value);
          field.onChange(masked);
          if (onlyDigits(masked).length === 14) void autofill(masked);
        }}
      />
    </Field>
  );
}

// Seções do KYC, exportadas para o PayoutKycWizard (operador, em etapas) reusar o mesmo layout.
export function KycCompanySection({ control }: { control: Control<KycValues> }) {
  return (
    <Section title="Dados da empresa">
      <CnpjField control={control} />
      <TextField control={control} name="company.legal_name" label="Razão social" />
      <TextField control={control} name="company.trade_name" label="Nome fantasia (opcional)" />
      <CorporationTypeField control={control} />
      <TextField control={control} name="company.email" label="E-mail da empresa" type="email" />
      <PhoneFormField control={control} name="company.phone" label="Telefone" />
      <MoneyField control={control} name="company.annual_revenue" label="Faturamento anual" />
      <TextField control={control} name="company.founding_date" label="Data de fundação" mask={dateMask} placeholder="DD/MM/AAAA" />
    </Section>
  );
}

export function KycCompanyAddressSection({ control }: { control: Control<KycValues> }) {
  return (
    <Section title="Endereço da empresa">
      <AddressFields control={control} prefix="company.address" />
    </Section>
  );
}

export function KycRepresentativeSection({ control }: { control: Control<KycValues> }) {
  return (
    <Section title="Representante legal">
      <TextField control={control} name="representative.name" label="Nome completo" />
      <TextField control={control} name="representative.document" label="CPF" mask={cpfMask} placeholder="000.000.000-00" />
      <TextField control={control} name="representative.email" label="E-mail" type="email" />
      <PhoneFormField control={control} name="representative.phone" label="Telefone" />
      <TextField control={control} name="representative.birthdate" label="Data de nascimento" mask={dateMask} placeholder="DD/MM/AAAA" />
      <MoneyField control={control} name="representative.monthly_income" label="Renda mensal" />
      <TextField control={control} name="representative.professional_occupation" label="Ocupação profissional" />
      <TextField control={control} name="representative.mother_name" label="Nome da mãe (opcional)" />
      <RepDeclaration control={control} />
    </Section>
  );
}

const ADDRESS_KEYS = [
  "zip_code",
  "street",
  "street_number",
  "complement",
  "neighborhood",
  "city",
  "state",
  "reference_point",
] as const;

/**
 * Endereço do representante com atalho "mesmo endereço da empresa" (evita redigitar os 8 campos —
 * caso comum: o dono é o representante e usa o endereço da empresa). Quando ligado, espelha o
 * endereço da empresa e esconde os campos.
 */
export function KycRepAddressSection({ control }: { control: Control<KycValues> }) {
  const { watch, setValue } = useFormContext<KycValues>();
  const [same, setSame] = React.useState(false);
  const companyAddress = watch("company.address");

  React.useEffect(() => {
    if (!same) return;
    for (const k of ADDRESS_KEYS) {
      setValue(`representative.address.${k}` as Path<KycValues>, companyAddress?.[k] ?? "", {
        shouldValidate: true,
      });
    }
  }, [same, companyAddress, setValue]);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-body-md font-medium text-ink">Endereço do representante</h3>
      <label className="flex items-center gap-2 text-body-sm text-ink">
        <Checkbox checked={same} onCheckedChange={(c) => setSame(c === true)} />
        Mesmo endereço da empresa
      </label>
      {!same && (
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <AddressFields control={control} prefix="representative.address" />
        </div>
      )}
    </div>
  );
}

export function KycBankSection({ control }: { control: Control<KycValues> }) {
  return (
    <Section title="Conta bancária para repasse">
      <BankCodeField control={control} />
      <TextField control={control} name="bank.branch_number" label="Agência" />
      <TextField control={control} name="bank.account_number" label="Conta" />
      <TextField control={control} name="bank.account_check_digit" label="Dígito da conta" />
      <AccountTypeField control={control} />
      <TextField control={control} name="bank.holder_name" label="Titular da conta (máx. 30 caracteres)" />
    </Section>
  );
}

export type PayoutKycFormProps = {
  defaultValues: KycValues;
  onSubmit: (values: KycValues) => Promise<void> | void;
  submitting?: boolean;
  submitLabel?: string;
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
};

/**
 * Formulário de KYC do recebedor (PJ), conforme o Pagar.me exige. Reutilizado pelo passo
 * "Recebimento" do wizard (operador) e pelo Manager (hub_admin). Validação via Zod (kyc.ts).
 */
export function PayoutKycForm({
  defaultValues,
  onSubmit,
  submitting,
  submitLabel = "Salvar",
  onBack,
  onSkip,
  skipLabel = "Pular por enquanto",
}: PayoutKycFormProps) {
  const methods = useForm<KycValues>({
    resolver: zodResolver(payoutKycSchema),
    defaultValues,
    mode: "onBlur",
  });
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const busy = submitting || isSubmitting;

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((v) => onSubmit(v))} className="flex flex-col gap-7">
        <KycCompanySection control={control} />
        <KycCompanyAddressSection control={control} />
        <KycRepresentativeSection control={control} />
        <KycRepAddressSection control={control} />
        <KycBankSection control={control} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-5">
        <div className="flex gap-2">
          {onBack && (
            <Button type="button" variant="secondary" onClick={onBack} disabled={busy}>
              Voltar
            </Button>
          )}
          {onSkip && (
            <Button type="button" variant="ghost" onClick={onSkip} disabled={busy}>
              {skipLabel}
            </Button>
          )}
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando…" : submitLabel}
        </Button>
      </div>
      </form>
    </FormProvider>
  );
}
