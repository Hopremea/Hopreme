import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Découpe les dépendances en chunks stables : combinées aux en-têtes « immutable »,
// les visites suivantes ne retéléchargent pas React/recharts quand seul le code applicatif change.
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-") || id.includes("/d3/")) return "charts";
            if (id.includes("xlsx")) return "xlsx";
            if (id.includes("leaflet")) return "leaflet"; // chargé à la demande (onglet Carte)
            return "vendor";
          }
        },
      },
    },
  },
});
