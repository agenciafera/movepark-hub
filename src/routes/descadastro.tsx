import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

/**
 * Descadastro da lista de marketing, aberto pelo link do rodapé do e-mail.
 *
 * Página pública e sem login: quem clica está no cliente de e-mail. Pedir senha para sair de uma
 * lista é o tipo de atrito que vira denúncia de spam, que é bem pior do que perder o contato.
 *
 * Um clique resolve. O botão de voltar atrás existe porque o link também é clicado sem querer.
 */
export default function DescadastroPage() {
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [estado, setEstado] = React.useState<"confirmar" | "enviando" | "pronto" | "erro">(
    "confirmar",
  );

  async function descadastrar() {
    setEstado("enviando");
    try {
      const { error } = await supabase.functions.invoke("marketing-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      setEstado("pronto");
    } catch {
      setEstado("erro");
    }
  }

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      {estado === "pronto" ? (
        <>
          <CheckCircle className="size-12 text-emerald-600" weight="fill" />
          <h1 className="text-2xl font-semibold text-ink">Pronto, você saiu da lista</h1>
          <p className="text-muted">
            Não mandamos mais novidades nem ofertas. Os e-mails da sua reserva continuam chegando,
            porque eles fazem parte do serviço.
          </p>
          <Button variant="outline" asChild>
            <a href="/">Voltar para a Movepark</a>
          </Button>
        </>
      ) : estado === "erro" ? (
        <>
          <h1 className="text-2xl font-semibold text-ink">Não deu para concluir</h1>
          <p className="text-muted">
            Tente de novo em instantes. Se continuar assim, responda o e-mail que a gente resolve
            do nosso lado.
          </p>
          <Button onClick={descadastrar}>Tentar de novo</Button>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-ink">Quer parar de receber nossos e-mails?</h1>
          <p className="text-muted">
            Você deixa de receber novidades e ofertas. As mensagens sobre as suas reservas
            continuam.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={descadastrar} disabled={!token || estado === "enviando"}>
              {estado === "enviando" ? "Saindo..." : "Sim, quero sair"}
            </Button>
            <Button variant="ghost" asChild>
              <a href="/">Cliquei sem querer</a>
            </Button>
          </div>
          {!token && (
            <p className="text-sm text-muted">
              Este link está incompleto. Abra o link direto do rodapé do e-mail.
            </p>
          )}
        </>
      )}
    </main>
  );
}
