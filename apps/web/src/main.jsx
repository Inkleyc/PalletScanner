import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.jsx";
import { AppErrorBoundary } from "./app-error-boundary.jsx";
import "./styles.css";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
