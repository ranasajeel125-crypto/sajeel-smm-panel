import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./theme.css";

const queryClient = new QueryClient();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("missing root element");
}

class StartupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Keep the panel usable even when the browser hits a startup error.
  }

  override render() {
    if (this.state.failed) {
      return <div className="fatal"><h2>Panel could not open</h2><p>Reload the page to try again.</p><button className="btn btn-primary dark-button" onClick={() => window.location.reload()}>Reload page</button></div>;
    }
    return this.props.children;
  }
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <StartupBoundary><App /></StartupBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
