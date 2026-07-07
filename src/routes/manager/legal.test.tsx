import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

// Refs estáveis: o mock precisa devolver o MESMO objeto a cada render (senão o useEffect que
// sincroniza o draft dispara toda hora e sobrescreve a edição).
const { docData, versions, publishMutate } = vi.hoisted(() => ({
  docData: {
    slug: "terms",
    title: "Termos de Uso",
    version: 1,
    content: "<p>atual</p>",
    published_at: "2026-07-01T12:00:00Z",
  },
  versions: [{ id: "v1", version: 1, published_at: "2026-07-01T12:00:00Z", published_by: null }],
  publishMutate: vi.fn(),
}));

vi.mock("@/features/legal/api", () => ({
  useLegalDocument: () => ({ data: docData, isLoading: false }),
  useLegalDocumentVersions: () => ({ data: versions, isLoading: false }),
  usePublishLegalDocument: () => ({ mutateAsync: publishMutate, isPending: false }),
}));

// Tiptap não roda bem em happy-dom; mockamos o editor por um textarea que emite onChange.
vi.mock("@/features/legal/RichTextEditor", () => ({
  RichTextEditor: ({ initialContent, onChange }: { initialContent: string; onChange: (h: string) => void }) => (
    <textarea aria-label="editor" defaultValue={initialContent} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ManagerLegal from "./legal";

describe("ManagerLegal", () => {
  beforeEach(() => {
    publishMutate.mockReset();
    publishMutate.mockResolvedValue({ version: 2 });
  });

  it("lista os documentos e a versão atual", () => {
    renderWithProviders(<ManagerLegal />);
    expect(screen.getByText("Documentos legais")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Termos de Uso" })).toBeInTheDocument();
    expect(screen.getByText(/Versão atual: v1/)).toBeInTheDocument();
  });

  it("publica a nova versão com o conteúdo editado", async () => {
    renderWithProviders(<ManagerLegal />);
    fireEvent.change(screen.getByLabelText("editor"), { target: { value: "<p>editado</p>" } });
    fireEvent.click(screen.getByRole("button", { name: /publicar nova versão/i }));
    await waitFor(() => expect(publishMutate).toHaveBeenCalledTimes(1));
    expect(publishMutate).toHaveBeenCalledWith({ slug: "terms", content: "<p>editado</p>" });
  });
});
