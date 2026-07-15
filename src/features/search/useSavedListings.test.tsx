import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { server } from "@/test/msw/server";
import { migratePendingSaves, useSavedListings } from "./useSavedListings";
import { SavedListingsSync } from "./SavedListingsSync";

// URL estubada em src/test/setup.ts (VITE_SUPABASE_URL).
const SUPABASE_URL = "http://localhost:54321";
const LS_KEY = "mp:saved";

function Harness() {
  const { toggle, isSaved } = useSavedListings();
  const loc = useLocation();
  return (
    <div>
      <span data-testid="loc">{loc.pathname + loc.search}</span>
      <span data-testid="saved">{isSaved("lpt-1") ? "sim" : "nao"}</span>
      <button onClick={() => toggle("lpt-1")}>fav</button>
    </div>
  );
}

describe("useSavedListings — favoritar exige login", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("anônimo que favorita é levado ao /login (next = página atual) e a intenção fica guardada", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />, { route: "/p/op/loc/car" });

    // Coração vazio: anônimo não tem favorito salvo.
    expect(screen.getByTestId("saved")).toHaveTextContent("nao");

    await user.click(screen.getByRole("button", { name: "fav" }));

    await waitFor(() => expect(screen.getByTestId("loc").textContent).toContain("/login"));
    expect(screen.getByTestId("loc").textContent).toContain(
      `next=${encodeURIComponent("/p/op/loc/car")}`,
    );
    // A intenção fica no localStorage pra ser migrada no login.
    expect(JSON.parse(localStorage.getItem(LS_KEY) ?? "[]")).toContain("lpt-1");
  });

  it("logado grava o favorito em profile_saved (sem passar pelo login)", async () => {
    const user = userEvent.setup();
    let inserted: unknown = null;
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/profile_saved`, () => HttpResponse.json([])),
      http.post(`${SUPABASE_URL}/rest/v1/profile_saved`, async ({ request }) => {
        inserted = await request.json();
        return HttpResponse.json([], { status: 201 });
      }),
    );

    renderWithProviders(<Harness />, {
      auth: mockAuth({ session: mockSession("customer", { userId: "u1" }) }),
    });

    await user.click(screen.getByRole("button", { name: "fav" }));

    await waitFor(() =>
      expect(inserted).toMatchObject({ profile_id: "u1", location_parking_type_id: "lpt-1" }),
    );
    expect(screen.getByTestId("loc").textContent).not.toContain("/login");
  });
});

describe("migratePendingSaves", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("faz upsert idempotente das pendências e limpa o localStorage", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(["a", "b"]));
    let body: unknown = null;
    let prefer: string | null = null;
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/profile_saved`, async ({ request }) => {
        body = await request.json();
        prefer = request.headers.get("Prefer");
        return HttpResponse.json([], { status: 201 });
      }),
    );

    const n = await migratePendingSaves("u1");

    expect(n).toBe(2);
    expect(body).toEqual([
      { profile_id: "u1", location_parking_type_id: "a" },
      { profile_id: "u1", location_parking_type_id: "b" },
    ]);
    expect(prefer).toContain("resolution=ignore-duplicates");
    expect(localStorage.getItem(LS_KEY)).toBeNull();
  });

  it("sem pendências não chama o banco e retorna 0", async () => {
    const n = await migratePendingSaves("u1");
    expect(n).toBe(0);
  });

  it("em erro do banco não limpa o localStorage (não perde a intenção)", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(["z"]));
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/profile_saved`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    await expect(migratePendingSaves("u1")).rejects.toBeTruthy();
    expect(JSON.parse(localStorage.getItem(LS_KEY) ?? "[]")).toContain("z");
  });
});

describe("SavedListingsSync", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("migra as pendências ao montar já com sessão", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(["x"]));
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/profile_saved`, () =>
        HttpResponse.json([], { status: 201 }),
      ),
    );

    renderWithProviders(<SavedListingsSync />, {
      auth: mockAuth({ session: mockSession("customer", { userId: "u9" }) }),
    });

    await waitFor(() => expect(localStorage.getItem(LS_KEY)).toBeNull());
  });
});
