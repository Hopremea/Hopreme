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

// Garde-fou : capture toute erreur de rendu et affiche un écran de secours
// (au lieu d'une page blanche), avec rechargement. Les données restent en lieu sûr (localStorage/Supabase).
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { try { console.error("Erreur de rendu :", error, info); } catch (e) {} }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", background: "#fff8ea", color: "#16203a" }}>
        <div style={{ maxWidth: 460, background: "#fff", border: "1px solid #ece3d2", borderRadius: 18, padding: "26px 24px", boxShadow: "0 12px 40px rgba(20,32,58,.14)", textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 19, margin: "0 0 8px" }}>Une erreur inattendue est survenue</h1>
          <p style={{ fontSize: 14, color: "#6b7589", lineHeight: 1.55, margin: "0 0 18px" }}>
            Vos données sont en sécurité (sauvegardées localement et sur le serveur). Rechargez la page pour reprendre.
          </p>
          <button onClick={() => { try { const u = new URL(window.location.href); u.searchParams.set("_v", Date.now().toString(36)); window.location.replace(u.toString()); } catch (e) { window.location.reload(); } }}
            style={{ border: "none", cursor: "pointer", fontWeight: 800, fontSize: 14, color: "#fff", padding: "11px 20px", borderRadius: 12, background: "linear-gradient(135deg,#3F60AA,#2f4c86)", fontFamily: "inherit" }}>
            Recharger l'application
          </button>
        </div>
      </div>
    );
  }
}

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
  if (!CLERK_KEY) return <ErrorBoundary><App /></ErrorBoundary>;
  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      <SignedIn>
        <ClerkTokenBridge />
        <ErrorBoundary><App /></ErrorBoundary>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
