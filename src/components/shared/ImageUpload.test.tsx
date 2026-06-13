import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImageUploadField, ImageGalleryField } from "./ImageUpload";

function pngFile(name = "a.png"): File {
  const f = new File(["x"], name, { type: "image/png" });
  Object.defineProperty(f, "size", { value: 1024 });
  return f;
}

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("ImageUploadField", () => {
  it("envia o arquivo selecionado e propaga a URL retornada", async () => {
    const onUpload = vi.fn().mockResolvedValue("https://cdn/hero-x.png");
    const onChange = vi.fn();
    const { container } = render(
      <ImageUploadField value={null} onChange={onChange} onUpload={onUpload} />,
    );
    fireEvent.change(fileInput(container), { target: { files: [pngFile()] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith("https://cdn/hero-x.png");
  });

  it("permite colar uma URL manualmente", () => {
    const onChange = vi.fn();
    render(<ImageUploadField value={null} onChange={onChange} onUpload={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("URL da imagem"), {
      target: { value: "https://x/y.jpg" },
    });
    expect(onChange).toHaveBeenCalledWith("https://x/y.jpg");
  });

  it("mostra preview e remove quando há valor", () => {
    const onChange = vi.fn();
    render(<ImageUploadField value="https://x/y.jpg" onChange={onChange} onUpload={vi.fn()} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://x/y.jpg");
    fireEvent.click(screen.getByRole("button", { name: /Remover/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("não mostra campo de URL quando desabilitado (mostra a dica)", () => {
    render(
      <ImageUploadField
        value={null}
        onChange={vi.fn()}
        onUpload={vi.fn()}
        disabled
        disabledHint="Preencha o Code antes"
      />,
    );
    expect(screen.queryByLabelText("URL da imagem")).not.toBeInTheDocument();
    expect(screen.getByText("Preencha o Code antes")).toBeInTheDocument();
  });
});

describe("ImageGalleryField", () => {
  it("anexa as URLs enviadas à lista existente", async () => {
    const onUpload = vi.fn().mockResolvedValueOnce("u2").mockResolvedValueOnce("u3");
    const onChange = vi.fn();
    const { container } = render(
      <ImageGalleryField values={["u1"]} onChange={onChange} onUpload={onUpload} />,
    );
    fireEvent.change(fileInput(container), { target: { files: [pngFile("b.png"), pngFile("c.png")] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    expect(onChange).toHaveBeenCalledWith(["u1", "u2", "u3"]);
  });

  it("remove uma foto da lista", () => {
    const onChange = vi.fn();
    render(<ImageGalleryField values={["u1", "u2"]} onChange={onChange} onUpload={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Remover foto/i })[0]);
    expect(onChange).toHaveBeenCalledWith(["u2"]);
  });
});
