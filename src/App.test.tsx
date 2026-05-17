import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routes } from "./App";

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
});
