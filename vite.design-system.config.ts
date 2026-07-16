import { defineConfig } from "vite";

// Servidor estático só para folhear o design system em docs/design-system/project.
// Nada a ver com o build do app: use `.claude/launch.json` › design-system.
export default defineConfig({
  root: "docs/design-system/project",
  server: { open: false },
});
