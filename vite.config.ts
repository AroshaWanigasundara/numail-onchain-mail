// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/**
 * The Polkadot SDK is browser-only here: it is loaded through dynamic imports
 * that never execute during SSR. Several @polkadot packages do not publish
 * `workerd` export conditions, which breaks the Cloudflare Worker build, so we
 * replace them with an inert stub in every non-client environment.
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

export default defineConfig({
  plugins: [stubPolkadotOnServer()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
