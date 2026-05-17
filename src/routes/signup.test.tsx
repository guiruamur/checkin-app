import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

vi.mock("../lib/api/signup-admin", () => ({
  signupAdminAndLogin: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
    },
  },
}));

import Signup from "./signup";

describe("Signup page", () => {
  it("renders all required fields and validates them", async () => {
    render(<MemoryRouter><Signup /></MemoryRouter>);
    expect(screen.getByLabelText(/nombre de tu empresa/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tu nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));
    const errors = await screen.findAllByText(/obligatorio/i);
    expect(errors.length).toBeGreaterThan(0);
  });
});
