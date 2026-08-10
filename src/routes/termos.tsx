import { LegalDocumentPage } from "@/features/legal/LegalDocumentPage";

export default function TermosPage() {
  return (
    <LegalDocumentPage
      slug="terms"
      title="Termos de Uso"
      description="Leia os Termos de Uso da plataforma Movepark. Entenda seus direitos e obrigações ao usar nosso serviço de reserva de estacionamento."
      intro="O que você pode esperar da Movepark e o que a gente espera de você ao reservar uma vaga por aqui."
      canonicalPath="/termos"
      related={["privacidade", "cancelamento"]}
    />
  );
}
