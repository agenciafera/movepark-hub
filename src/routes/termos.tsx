import * as React from "react";
import { Helmet } from "react-helmet-async";

const LAST_UPDATE = "1º de junho de 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-title-sm text-ink">{title}</h2>
      <div className="space-y-2 text-body-sm text-muted">{children}</div>
    </section>
  );
}

export default function TermosPage() {
  return (
    <>
      <Helmet>
        <title>Termos de Uso | Movepark</title>
        <meta
          name="description"
          content="Leia os Termos de Uso da plataforma Movepark. Entenda seus direitos e obrigações ao usar nosso serviço de reserva de estacionamento."
        />
        <meta property="og:title" content="Termos de Uso | Movepark" />
        <meta property="og:url" content="https://hub.movepark.co/termos" />
        <link rel="canonical" href="https://hub.movepark.co/termos" />
      </Helmet>

      <div className="mx-auto w-full max-w-[720px] px-4 py-12 desktop:px-8">
        <header className="mb-10 space-y-2">
          <h1 className="text-display-lg text-ink">Termos de Uso</h1>
          <p className="text-body-sm text-muted">Última atualização: {LAST_UPDATE}</p>
        </header>

        <div className="space-y-10">
          <Section title="1. Aceitação dos termos">
            <p>
              Ao acessar ou usar a plataforma Movepark — disponível em{" "}
              <strong>hub.movepark.co</strong> e demais superfícies da marca — você concorda com
              estes Termos de Uso. Se não concordar com algum item, não utilize o serviço.
            </p>
            <p>
              A Movepark pode atualizar estes termos a qualquer momento. Alterações relevantes serão
              comunicadas por e-mail ou notificação na plataforma. O uso continuado após a
              notificação implica aceite das alterações.
            </p>
          </Section>

          <Section title="2. O serviço">
            <p>
              A Movepark é um marketplace que intermedia a reserva de vagas de estacionamento entre
              viajantes (clientes) e operadores de estacionamento parceiros (parceiros). A Movepark
              não é proprietária dos estacionamentos listados na plataforma.
            </p>
            <p>
              O serviço inclui: busca e comparação de vagas, reserva antecipada com preço fixo,
              pagamento online (PIX e cartão de crédito), voucher digital para check-in, e suporte
              ao cliente.
            </p>
          </Section>

          <Section title="3. Conta de usuário">
            <p>
              Para realizar reservas, você precisa criar uma conta com um endereço de e-mail válido
              ou número de celular (WhatsApp). Você é responsável por manter a confidencialidade das
              suas credenciais de acesso.
            </p>
            <p>
              É proibido criar contas com dados falsos, de terceiros ou de forma automatizada. A
              Movepark pode suspender ou encerrar contas que violem estes termos.
            </p>
          </Section>

          <Section title="4. Reservas e pagamentos">
            <p>
              Ao confirmar uma reserva, você celebra um contrato com o parceiro operador do
              estacionamento, com a Movepark atuando como intermediadora. O preço exibido é fixo e
              inclui todos os encargos aplicáveis, salvo indicação contrária.
            </p>
            <p>
              O pagamento é processado no momento da reserva. Você receberá um voucher digital por
              e-mail com o código de check-in. Apresente o voucher na entrada do estacionamento.
            </p>
            <p>
              A Movepark retém uma comissão sobre cada reserva realizada pela plataforma. O repasse
              ao parceiro é feito conforme os termos acordados entre as partes.
            </p>
          </Section>

          <Section title="5. Cancelamentos e reembolsos">
            <p>
              As regras de cancelamento e reembolso estão descritas em detalhes na{" "}
              <a href="/cancelamento" className="text-mp-indigo underline underline-offset-2">
                Política de Cancelamento
              </a>
              . Em resumo: cancelamentos realizados com antecedência mínima de 48 horas antes do
              início da reserva têm direito a reembolso integral.
            </p>
            <p>
              Cancelamentos realizados após o início do período reservado não geram reembolso, salvo
              em casos de força maior devidamente comprovados.
            </p>
          </Section>

          <Section title="6. Condutas proibidas">
            <p>É proibido ao usuário:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Fazer reservas com intenção de não comparecer sem cancelar previamente.</li>
              <li>Revender ou transferir reservas sem autorização da Movepark.</li>
              <li>Usar a plataforma para fins ilegais ou fraudulentos.</li>
              <li>Tentar acessar áreas restritas do sistema ou dados de outros usuários.</li>
              <li>Publicar avaliações falsas ou difamatórias sobre parceiros.</li>
            </ul>
          </Section>

          <Section title="7. Responsabilidades">
            <p>
              A Movepark não se responsabiliza por danos decorrentes de: falhas no estacionamento
              parceiro, furtos ou danos a veículos nas dependências do parceiro, ou uso indevido das
              credenciais do usuário.
            </p>
            <p>
              Os parceiros operadores são integralmente responsáveis pela operação, segurança e
              condições do estacionamento. A Movepark atua apenas como intermediadora.
            </p>
          </Section>

          <Section title="8. Propriedade intelectual">
            <p>
              Todo o conteúdo da plataforma — marca, textos, imagens, código, design — é
              propriedade da Movepark ou de seus licenciadores. É proibida a reprodução ou uso sem
              autorização prévia por escrito.
            </p>
          </Section>

          <Section title="9. Privacidade">
            <p>
              O tratamento dos seus dados pessoais é descrito na{" "}
              <a href="/privacidade" className="text-mp-indigo underline underline-offset-2">
                Política de Privacidade
              </a>
              , em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).
            </p>
          </Section>

          <Section title="10. Lei aplicável e foro">
            <p>
              Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o
              foro da Comarca de São Paulo/SP para dirimir quaisquer disputas decorrentes deste
              instrumento, com renúncia a qualquer outro, por mais privilegiado que seja.
            </p>
          </Section>

          <Section title="11. Contato">
            <p>
              Dúvidas sobre estes termos?{" "}
              <a href="/contato" className="text-mp-indigo underline underline-offset-2">
                Entre em contato
              </a>{" "}
              com nossa equipe.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}
