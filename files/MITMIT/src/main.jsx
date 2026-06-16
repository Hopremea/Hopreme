import React from "react";
import ReactDOM from "react-dom/client";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  RedirectToSignIn,
  useAuth,
} from "@clerk/clerk-react";
import App from "./App.jsx";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Pont : expose le jeton de session Clerk a App.jsx, qui le joint aux appels
// du relais IA (/api/claude). Le relais le verifie cote serveur.
function ClerkTokenBridge() {
  const { getToken } = useAuth();
  React.useEffect(() => {
    window.__getClerkToken = getToken;
    return () => {
      window.__getClerkToken = null;
    };
  }, [getToken]);
  return null;
}

function Root() {
  // Sans cle Clerk configuree (dev local rapide), l'app s'affiche sans protection.
  // En production, definissez VITE_CLERK_PUBLISHABLE_KEY : l'acces devient prive.
  if (!CLERK_KEY) return <App />;
  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      <SignedIn>
        <ClerkTokenBridge />
        <App />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
