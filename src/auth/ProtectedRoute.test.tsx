import { vi } from "vitest";

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./AuthProvider";
import { ProtectedRoute } from "./ProtectedRoute";

describe("ProtectedRoute", () => {
  it("redirects to /login when user is not authenticated", async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route path="/login" element={<div>login page</div>} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <div>admin page</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
  });
});
