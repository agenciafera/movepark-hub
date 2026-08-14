import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-contact-message`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type ContatoPayload = {
  name: string;
  email: string;
  message: string;
  /** De onde a pessoa escreveu, para triagem. */
  page_url?: string | null;
  /** Honeypot: só robô preenche. Ver validate.ts da Edge. */
  hp_field?: string | null;
};

export type ContatoResult = { ok: boolean; id?: string };

async function enviarContato(payload: ContatoPayload): Promise<ContatoResult> {
  // Função pública: o gateway aceita o bearer anon, mesmo padrão do submit-partner-lead.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  /* Quando o próprio `fetch` falha (rede caída, CORS, função fora do ar) ele
     lança um TypeError cru, e "Failed to fetch" ia parar na tela do visitante.
     Aqui vira a mesma frase dos outros erros de infraestrutura. */
  let res: Response;
  try {
    res = await fetch(FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${session?.access_token ?? ANON}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Não foi possível enviar agora. Tente de novo em instantes.");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    /* A Edge devolve mensagem pronta para a tela nos casos de validação. O texto
       genérico cobre o que ela não previu (rede caída, 502 do gateway). */
    throw new Error(body.error ?? "Não foi possível enviar agora. Tente de novo em instantes.");
  }
  return body as ContatoResult;
}

export function useEnviarContato() {
  return useMutation({ mutationFn: enviarContato });
}
