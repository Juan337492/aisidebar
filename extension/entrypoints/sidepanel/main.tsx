import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/components/App";
import "@/assets/styles.css";

// Reuse the root when dev hot-reload re-runs this module.
const container = document.getElementById("root") as HTMLElement & { _root?: ReturnType<typeof createRoot> };
container._root ??= createRoot(container);
container._root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
