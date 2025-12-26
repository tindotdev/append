import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "./main.css";
import { router } from "./router";
import { useAuth } from "./components/AuthProvider";
import { AppProvider } from "./providers";

function InnerApp() {
  const auth = useAuth();
  return (
    <RouterProvider
      router={router}
      context={{
        auth,
      }}
    />
  );
}

function App() {
  return (
    <AppProvider>
      <InnerApp />
    </AppProvider>
  );
}

const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
