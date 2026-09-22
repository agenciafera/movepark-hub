import { LegalDocumentPage } from "@/features/legal/LegalDocumentPage";

export default function PrivacidadePage() {
  return (
    <LegalDocumentPage
      slug="privacy"
      title="Política de Privacidade"
      description="Política de Privacidade da Movepark: como coletamos, usamos e protegemos os seus dados pessoais, conforme a LGPD (Lei 13.709/2018). Leia antes de reservar."
      intro="Quais dados a gente guarda, por que guarda e o que você pode pedir a qualquer momento."
      canonicalPath="/privacidade"
      related={["termos", "cancelamento"]}
    />
  );
}
