import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { BRAZILIAN_STATES } from "@/lib/brazilian-states";

type Props = {
  /** Código da UF selecionada (ex: "SP"). String vazia = nenhuma seleção. */
  value: string;
  onValueChange: (uf: string) => void;
  id?: string;
  "aria-describedby"?: string;
  /** Texto exibido quando nada está selecionado. */
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

/**
 * Select reutilizável de unidade federativa brasileira. O valor armazenado é o
 * código de 2 letras (UF); a lista exibe o nome completo. O gatilho mostra a UF
 * (compacto) para caber em colunas estreitas de endereço.
 *
 * Use no lugar de inputs de texto aberto para o campo "estado"/"UF".
 */
export function StateSelect({
  value,
  onValueChange,
  id,
  "aria-describedby": ariaDescribedby,
  placeholder = "UF",
  required,
  disabled,
}: Props) {
  return (
    <Select value={value} onValueChange={onValueChange} required={required} disabled={disabled}>
      <SelectTrigger id={id} aria-describedby={ariaDescribedby} aria-label="Estado">
        {value ? value : <span className="text-muted">{placeholder}</span>}
      </SelectTrigger>
      <SelectContent>
        {BRAZILIAN_STATES.map((s) => (
          <SelectItem key={s.uf} value={s.uf}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
