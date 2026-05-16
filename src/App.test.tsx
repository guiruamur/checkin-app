import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the login route by default redirection target", () => {
    window.history.pushState({}, "", "/login");
    render(<App />);
    expect(screen.getByRole("heading", { name: /entrar/i })).toBeInTheDocument();
  });
});
