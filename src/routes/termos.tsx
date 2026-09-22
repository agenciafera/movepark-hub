import { LegalDocumentPage } from "@/features/legal/LegalDocumentPage";

export default function TermosPage() {
  return (
    <LegalDocumentPage
      slug="terms"
      title="Termos de Uso"
      description="Termos de Uso da Movepark, a plataforma de reserva de estacionamento de aeroporto: seus direitos e as suas obrigações. Leia antes de reservar."
      intro="O que você pode esperar da Movepark e o que a gente espera de você ao reservar uma vaga por aqui."
      canonicalPath="/termos"
      related={["privacidade", "cancelamento"]}
    />
  );
}
