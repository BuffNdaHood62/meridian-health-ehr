import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { StartupBlocked } from "./components/StartupBlocked";
import { runtimeProblems } from "./env";
import { isSupabaseConfigured } from "./lib/supabase";

// ============================================================================
// Startup gate (Phase 1: fail closed).
// A production build with no backend must not mount the clinical UI — otherwise a
// mis-configured deploy looks like a working EHR full of invented patients.
// ============================================================================
const problems = runtimeProblems(isSupabaseConfigured);
const root = createRoot(document.getElementById("root")!);

if (problems.length > 0) {
  root.render(<StartupBlocked problems={problems} />);
} else {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}
