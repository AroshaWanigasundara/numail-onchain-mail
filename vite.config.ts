import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

/**
 * The Polkadot SDK is browser-only here: it is loaded through dynamic imports
 * that never execute during SSR. Several @polkadot packages do not publish
 * `workerd` export conditions, so we replace them with an inert stub in every
 * non-client environment.
 */
const stubPolkadotOnServer = (): Plugin => {
  const VIRTUAL = "\0polkadot-server-stub";
  return {
    name: "stub-polkadot-on-server",
    enforce: "pre",
    resolveId(source, _importer, options) {
      const isClient = this.environment?.name === "client";
      const ssr = (options as { ssr?: boolean } | undefined)?.ssr ?? !isClient;
      if (!ssr || isClient) return null;
      if (source.startsWith("@polkadot/")) return VIRTUAL;
      return null;
    },
    load(id) {
      if (id !== VIRTUAL) return null;
      return `
const unavailable = () => { throw new Error("Polkadot SDK is only available in the browser"); };
export const ApiPromise = { create: unavailable };
export class WsProvider { connect() { return unavailable(); } }
export const web3Enable = async () => [];
export const web3Accounts = async () => [];
export default {};
`;
    },
  };
};

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    // Build a Node.js server (behind nginx); only needed for `vite build`.
    ...(command === "build" ? [nitro({ preset: "node-server" })] : []),
    viteReact(),
    stubPolkadotOnServer(),
  ],
  css: { transformer: "lightningcss" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
    ignoreOutdatedRequests: true,
  },
  server: { host: "::", port: 8080 },
}));
