import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OnboardingSetup } from "./components/OnboardingSetup";
import "./index.css";

const isDevOnboardingPreview =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("onboarding") === "1";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isDevOnboardingPreview ? (
      <OnboardingSetup
        defaultDocTitle="监视与测量管理台账"
        defaultDocCode="JSSK-MPR-170"
        onCompleted={() => {}}
      />
    ) : (
      <App />
    )}
  </React.StrictMode>
);
