import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: { signInWithPassword: vi.fn() },
  },
}));

import Login from "./login";

describe("Login page", () => {
  it("renders email and password fields", () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
  });

  it("shows validation errors on empty submit", async () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));
    const errors = await screen.findAllByText(/obligatorio/i);
    expect(errors.length).toBeGreaterThan(0);
  });
});
