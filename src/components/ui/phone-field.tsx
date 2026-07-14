import * as React from "react";
import PhoneInputBase, { type Value } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { cn } from "@/lib/utils";
import { storedPhoneToE164 } from "@/lib/identifiers";

type Props = {
  id?: string;
  /** Valor em E.164 (ex: +5511999999999). null/undefined enquanto vazio. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  className?: string;
  defaultCountry?: "BR" | "PT" | "US" | "AR" | "UY" | "PY" | "CL";
  /** Encaminhados ao input nativo para associar erro/estado a leitores de tela. */
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function PhoneField({
  id,
  value,
  onChange,
  placeholder = "Digite seu número",
  disabled,
  autoFocus,
  required,
  className,
  defaultCountry = "BR",
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}: Props) {
  // Blindagem: um telefone recuperado do banco/sessão pode chegar SEM o "+" (o Supabase guarda
  // `auth.users.phone` assim). Sem o "+", o país (bandeira) não é reconhecido. Garante o E.164
  // canônico (regra única em storedPhoneToE164) e corrige o estado do pai uma vez, para o submit
  // enviar já com o "+". Durante a digitação o valor já vem em E.164, então isto é no-op.
  const display = React.useMemo(() => storedPhoneToE164(value) ?? undefined, [value]);
  React.useEffect(() => {
    if (value && display && display !== value) onChange(display);
  }, [value, display, onChange]);

  return (
    <PhoneInputBase
      id={id}
      international
      defaultCountry={defaultCountry}
      value={display as Value | undefined}
      onChange={(v) => onChange((v as string | undefined) ?? undefined)}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      required={required}
      className={cn("mp-phone-field", className)}
      countryCallingCodeEditable={false}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedby}
    />
  );
}
