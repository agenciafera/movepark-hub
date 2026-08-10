import { LegalDocumentPage } from "@/features/legal/LegalDocumentPage";

export default function PrivacidadePage() {
  return (
    <LegalDocumentPage
      slug="privacy"
      title="Política de Privacidade"
      description="Saiba como a Movepark coleta, usa e protege seus dados pessoais, em conformidade com a LGPD (Lei 13.709/2018)."
      intro="Quais dados a gente guarda, por que guarda e o que você pode pedir a qualquer momento."
      canonicalPath="/privacidade"
      related={["termos", "cancelamento"]}
    />
  );
}
