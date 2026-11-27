// Datas de marketing: feriados nacionais e férias escolares, calculados, sem lista para manter.
// Os móveis saem da Páscoa (Carnaval, Sexta-feira Santa e Corpus Christi). As férias são data
// aproximada, porque o calendário escolar muda de estado para estado.
// A janela de envio vai de 7 a 3 dias antes, porque o cliente reserva em cima da hora (53% até
// 2 dias antes, medido em 26/11/2026). Spec: docs/specs/assistente-marketing-proativo.md § 4.

export type DataDoCalendario = {
  nome: string;
  /** AAAA-MM-DD */
  data: string;
  tipo: "feriado" | "ferias";
  aproximada: boolean;
  janela_de: string;
  janela_ate: string;
  /** Em quantos dias a janela abre. Zero é hoje, negativo é que já abriu. */
  abre_em_dias: number;
};

type Data = Omit<DataDoCalendario, "janela_de" | "janela_ate" | "abre_em_dias">;

const DIA = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (ano: number, mes: number, dia: number) => Date.UTC(ano, mes - 1, dia);

/** Domingo de Páscoa (algoritmo de Meeus, Jones e Butcher). */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(utc(ano, mes, dia));
}

function datasDoAno(ano: number): Data[] {
  const p = Date.parse(pascoa(ano));
  const fixo = (mes: number, dia: number, nome: string): Data => ({
    nome,
    data: iso(utc(ano, mes, dia)),
    tipo: "feriado",
    aproximada: false,
  });
  const movel = (dias: number, nome: string): Data => ({
    nome,
    data: iso(p + dias * DIA),
    tipo: "feriado",
    aproximada: false,
  });
  const ferias = (mes: number, dia: number, nome: string): Data => ({
    nome,
    data: iso(utc(ano, mes, dia)),
    tipo: "ferias",
    aproximada: true,
  });
  return [
    fixo(1, 1, "Ano Novo"),
    movel(-47, "Carnaval"),
    movel(-2, "Sexta-feira Santa"),
    fixo(4, 21, "Tiradentes"),
    fixo(5, 1, "Dia do Trabalho"),
    movel(60, "Corpus Christi"),
    ferias(7, 1, "Férias de julho"),
    fixo(9, 7, "Independência"),
    fixo(10, 12, "Nossa Senhora Aparecida"),
    fixo(11, 2, "Finados"),
    fixo(11, 15, "Proclamação da República"),
    fixo(11, 20, "Consciência Negra"),
    ferias(12, 15, "Férias de fim de ano"),
    fixo(12, 25, "Natal"),
  ];
}

/** Hoje em Brasília, como AAAA-MM-DD. */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** As datas de `hoje` até `dias` à frente (de 1 a 366), em ordem, cada uma com a janela de envio. */
export function calendario(hoje: string, dias = 90): DataDoCalendario[] {
  const h = Date.parse(hoje);
  const limite = h + Math.max(1, Math.min(dias, 366)) * DIA;
  const ano = new Date(h).getUTCFullYear();
  return [...datasDoAno(ano), ...datasDoAno(ano + 1)]
    .filter((x) => Date.parse(x.data) >= h && Date.parse(x.data) <= limite)
    .map((x) => {
      const t = Date.parse(x.data);
      return {
        ...x,
        janela_de: iso(t - 7 * DIA),
        janela_ate: iso(t - 3 * DIA),
        abre_em_dias: Math.round((t - 7 * DIA - h) / DIA),
      };
    })
    .sort((a, b) => a.data.localeCompare(b.data));
}
