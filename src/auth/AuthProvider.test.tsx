import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  if (!user) return <div>anonymous</div>;
  return <div>user: {user.email}</div>;
}

describe("AuthProvider", () => {
  it("starts in loading state then resolves to anonymous when no session", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByText("loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("anonymous")).toBeInTheDocument());
  });
});
