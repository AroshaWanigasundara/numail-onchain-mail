import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/numail/SettingsPage";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "NuMail Settings — Network, Policy & Blocklist" },
      {
        name: "description",
        content:
          "Configure your Substrate WebSocket endpoint, mailbox acceptance policy, folders and blocked senders for the NuMail on-chain email client.",
      },
      { property: "og:title", content: "NuMail Settings — Network, Policy & Blocklist" },
      {
        property: "og:description",
        content: "Endpoint presets, connection diagnostics, mailbox policy and blocklist management for NuMail.",
      },
    ],
  }),
  component: SettingsPage,
});
