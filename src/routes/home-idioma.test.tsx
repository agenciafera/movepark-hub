import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { RouterProvider, createMemoryRouter } from "react-router-dom";

import HomeIdiomaPage, { type DestinoNaHome, type HomeIdiomaData } from "@/routes/home-idioma";

function destino(over: Partial<DestinoNaHome> & { id: string }): DestinoNaHome {
  return {
    rotulo: "Guarulhos Airport",
    slug: "guarulhos-airport",
    cidade: "Guarulhos",
    estado: "SP",
    popular: true,
    ...over,
  };
}

const DESTINOS = [
  destino({ id: "d1" }),
  destino({ id: "d2", rotulo: "Viracopos Airport", slug: "viracopos-airport", cidade: "Campinas" }),
  destino({
    id: "d3",
    rotulo: "Recife Airport",
    slug: "recife-airport",
    cidade: "Recife",
    estado: "PE",
    popular: false,
  }),
];

function setup(over: Partial<HomeIdiomaData> = {}) {
  const locale = over.locale ?? "en";
  const rota = `/${locale}`;
  const router = createMemoryRouter(
    [
      {
        path: rota,
        element: <HomeIdiomaPage />,
        loader: () => ({
          locale,
          destinos: over.destinos ?? DESTINOS,
          clientes: over.clientes ?? 300000,
          temBlog: over.temBlog ?? true,
        }),
      },
    ],
    { initialEntries: [rota] },
  );
  return render(
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>,
  );
}

describe("home de idioma traduzido", () => {
  it("cada aeroporto leva à página DAQUELE idioma, com o segmento traduzido", async () => {
    setup();
    const link = await screen.findByRole("link", { name: /Viracopos Airport/ });
    // O defeito que isto tranca: cair no `/estacionamentos/<slug-pt>` português, que é
    // o primeiro clique da página e o que mandaria o visitante de volta ao idioma fonte.
    expect(link).toHaveAttribute("href", "/en/airport-parking/viracopos-airport");
  });

  it("em espanhol o segmento é o espanhol, não o inglês", async () => {
    setup({ locale: "es", destinos: [destino({ id: "d1", slug: "aeropuerto-guarulhos" })] });
    const link = await screen.findByRole("link", { name: /Guarulhos Airport/ });
    expect(link).toHaveAttribute("href", "/es/estacionamiento-aeropuerto/aeropuerto-guarulhos");
  });

  it("separa os mais buscados dos demais", async () => {
    setup();
    expect(await screen.findByText("Most searched")).toBeInTheDocument();
    expect(screen.getByText("Other destinations")).toBeInTheDocument();
  });

  it("declara onde o idioma termina, em vez de deixar o leitor descobrir no checkout", async () => {
    setup();
    expect(await screen.findByText(/final booking steps are in Portuguese/i)).toBeInTheDocument();
  });

  it("sem post traduzido o bloco do blog não aparece, e o da FAQ continua", async () => {
    setup({ temBlog: false });
    expect(await screen.findByRole("link", { name: "See the questions" })).toHaveAttribute(
      "href",
      "/en/faq",
    );
    expect(screen.queryByRole("link", { name: "Read the guides" })).toBeNull();
  });

  it("com post traduzido o blog aponta para o índice daquele idioma", async () => {
    setup({ locale: "es" });
    expect(await screen.findByRole("link", { name: "Leer las guías" })).toHaveAttribute(
      "href",
      "/es/blog",
    );
  });

  it("prova social zerada não vira `+0 clientes`", async () => {
    setup({ clientes: 0 });
    await screen.findByRole("link", { name: /Viracopos Airport/ });
    expect(screen.queryByText(/travellers have booked/i)).toBeNull();
  });
});
