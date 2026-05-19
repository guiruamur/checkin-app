import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { vi } from "vitest";
import { routes } from "./App";

vi.mock("./features/workers/api", () => ({
  lookupCompanyBySlug: vi.fn().mockResolvedValue({ ok: false, error: "not_found" }),
  verifyWorkerRegistration: vi.fn().mockResolvedValue({ ok: false, error: "invalid_token" }),
}));

describe("App routing", () => {
  it("renders the login page when navigating to /login", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/login"] });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("heading", { name: /entrar/i })).toBeInTheDocument();
  });

  it("redirects / to /login", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("heading", { name: /entrar/i })).toBeInTheDocument();
  });

  it("resolves /candidato/registro without auth redirect", async () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/candidato/registro?company=x"] });
    render(<RouterProvider router={router} />);
    // No debe redirigir a /login (no hay heading "Entrar").
    expect(screen.queryByRole("heading", { name: /entrar/i })).not.toBeInTheDocument();
    // El mock de lookupCompanyBySlug devuelve not_found → "Empresa no encontrada".
    await waitFor(() => expect(screen.getByText(/empresa no encontrada/i)).toBeInTheDocument());
  });

  it("resolves /candidato/registro-enviado without auth redirect", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/candidato/registro-enviado"] });
    render(<RouterProvider router={router} />);
    expect(screen.queryByRole("heading", { name: /entrar/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /revisa tu correo/i })).toBeInTheDocument();
  });

  it("resolves /candidato/verificar without auth redirect", async () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/candidato/verificar?token=x"] });
    render(<RouterProvider router={router} />);
    expect(screen.queryByRole("heading", { name: /entrar/i })).not.toBeInTheDocument();
    // El mock de verifyWorkerRegistration devuelve invalid_token → "enlace no es válido".
    await waitFor(() => expect(screen.getByText(/enlace no es válido/i)).toBeInTheDocument());
  });
});
