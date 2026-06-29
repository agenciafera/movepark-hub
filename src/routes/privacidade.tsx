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

export default function PrivacidadePage() {
  return (
    <>
      <Helmet>
        <title>Política de Privacidade | Movepark</title>
        <meta
          name="description"
          content="Saiba como a Movepark coleta, usa e protege seus dados pessoais, em conformidade com a LGPD (Lei 13.709/2018)."
        />
        <meta property="og:title" content="Política de Privacidade | Movepark" />
        <meta property="og:url" content="https://hub.movepark.co/privacidade" />
        <link rel="canonical" href="https://hub.movepark.co/privacidade" />
      </Helmet>

      <div className="mx-auto w-full max-w-[720px] px-4 py-12 desktop:px-8">
        <header className="mb-10 space-y-2">
          <h1 className="text-display-lg text-ink">Política de Privacidade</h1>
          <p className="text-body-sm text-muted">Última atualização: {LAST_UPDATE}</p>
          <p className="text-body-sm text-muted">
            Em conformidade com a Lei Geral de Proteção de Dados — LGPD (Lei 13.709/2018).
          </p>
        </header>

        <div className="space-y-10">
          <Section title="1. Quem somos">
            <p>
              A <strong>Movepark</strong> é a controladora dos dados pessoais coletados nesta
              plataforma, disponível em <strong>hub.movepark.co</strong>. Nosso e-mail de contato
              para questões de privacidade é{" "}
              <a href="mailto:privacidade@movepark.co" className="text-mp-indigo underline underline-offset-2">
                privacidade@movepark.co
              </a>
              .
            </p>
          </Section>

          <Section title="2. Dados que coletamos">
            <p>Coletamos os seguintes dados pessoais:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Cadastro:</strong> nome completo, e-mail, número de celular (WhatsApp).
              </li>
              <li>
                <strong>Reservas:</strong> dados do veículo (placa, modelo), datas de entrada e
                saída, preferências de vaga.
              </li>
              <li>
                <strong>Pagamento:</strong> dados de cobrança (processados pelo gateway de
                pagamento Pagar.me — não armazenamos número de cartão).
              </li>
              <li>
                <strong>Uso da plataforma:</strong> endereço IP, tipo de dispositivo, páginas
                visitadas, buscas realizadas (via cookies e logs do servidor).
              </li>
              <li>
                <strong>Avaliações:</strong> textos e notas enviadas sobre estacionamentos.
              </li>
            </ul>
          </Section>

          <Section title="3. Finalidade do tratamento">
            <p>Usamos seus dados para:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Criar e gerenciar sua conta na plataforma.</li>
              <li>Processar reservas e pagamentos.</li>
              <li>Enviar confirmações, vouchers e notificações de reserva por e-mail ou WhatsApp.</li>
              <li>Oferecer suporte ao cliente e resolver disputas.</li>
              <li>Melhorar a plataforma com base em análise de uso anonimizado.</li>
              <li>Cumprir obrigações legais e regulatórias.</li>
              <li>Enviar comunicações de marketing (somente com seu consentimento explícito).</li>
            </ul>
          </Section>

          <Section title="4. Base legal">
            <p>O tratamento dos seus dados é realizado com base em:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Execução de contrato</strong> — para processar reservas e pagamentos (art.
                7º, V, LGPD).
              </li>
              <li>
                <strong>Obrigação legal</strong> — para cumprimento de exigências fiscais e
                regulatórias (art. 7º, II, LGPD).
              </li>
              <li>
                <strong>Legítimo interesse</strong> — para segurança, prevenção a fraudes e melhoria
                do serviço (art. 7º, IX, LGPD).
              </li>
              <li>
                <strong>Consentimento</strong> — para comunicações de marketing (art. 7º, I, LGPD).
              </li>
            </ul>
          </Section>

          <Section title="5. Compartilhamento de dados">
            <p>
              Seus dados podem ser compartilhados com:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Parceiros operadores:</strong> o estacionamento da sua reserva recebe nome,
                placa do veículo e código de check-in para viabilizar o acesso.
              </li>
              <li>
                <strong>Processadores de pagamento:</strong> Pagar.me, para processar transações
                financeiras.
              </li>
              <li>
                <strong>Infraestrutura:</strong> Supabase (banco de dados) e Cloudflare (CDN e
                segurança), sob acordos de processamento de dados.
              </li>
              <li>
                <strong>Autoridades:</strong> quando exigido por lei ou decisão judicial.
              </li>
            </ul>
            <p>Não vendemos seus dados a terceiros.</p>
          </Section>

          <Section title="6. Retenção de dados">
            <p>
              Mantemos seus dados pelo tempo necessário para prestar o serviço e cumprir obrigações
              legais:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Dados de conta: enquanto a conta estiver ativa, mais 5 anos após encerramento.</li>
              <li>Dados de reservas e pagamentos: 5 anos (exigência fiscal).</li>
              <li>Logs de acesso: 6 meses (Marco Civil da Internet).</li>
            </ul>
          </Section>

          <Section title="7. Seus direitos (LGPD)">
            <p>Como titular de dados, você tem direito a:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Confirmar a existência e acessar seus dados.</li>
              <li>Corrigir dados incompletos, inexatos ou desatualizados.</li>
              <li>Solicitar anonimização, bloqueio ou eliminação de dados desnecessários.</li>
              <li>Portabilidade dos seus dados a outro fornecedor de serviço.</li>
              <li>Revogar consentimentos a qualquer momento.</li>
              <li>Opor-se a tratamentos realizados com base em legítimo interesse.</li>
              <li>Peticionar à Autoridade Nacional de Proteção de Dados (ANPD).</li>
            </ul>
            <p>
              Para exercer seus direitos, envie um e-mail para{" "}
              <a href="mailto:privacidade@movepark.co" className="text-mp-indigo underline underline-offset-2">
                privacidade@movepark.co
              </a>{" "}
              ou acesse as configurações da sua conta.
            </p>
          </Section>

          <Section title="8. Cookies">
            <p>
              Utilizamos cookies técnicos (necessários ao funcionamento) e cookies analíticos
              (para medir o desempenho da plataforma, de forma anonimizada). Não utilizamos cookies
              de rastreamento para publicidade de terceiros.
            </p>
            <p>
              Você pode configurar seu navegador para bloquear cookies, mas isso pode afetar o
              funcionamento de algumas funcionalidades da plataforma.
            </p>
          </Section>

          <Section title="9. Segurança">
            <p>
              Adotamos medidas técnicas e organizacionais para proteger seus dados: criptografia em
              trânsito (TLS), controle de acesso baseado em papéis (RBAC), autenticação segura e
              monitoramento contínuo de incidentes. Em caso de violação de dados que possa causar
              risco relevante, notificaremos a ANPD e os titulares afetados nos prazos legais.
            </p>
          </Section>

          <Section title="10. Contato e DPO">
            <p>
              Para dúvidas sobre privacidade ou para exercer seus direitos, entre em contato com
              nosso Encarregado de Proteção de Dados (DPO):
            </p>
            <p>
              E-mail:{" "}
              <a href="mailto:privacidade@movepark.co" className="text-mp-indigo underline underline-offset-2">
                privacidade@movepark.co
              </a>
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}
