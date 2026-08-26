import { createFileRoute } from "@tanstack/react-router";
import { MailboxPage } from "@/components/numail/MailboxPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NuMail — On-Chain Email on Polkadot" },
      {
        name: "description",
        content:
          "NuMail is an on-chain email client for the Polkadot NuMail pallet: encrypted subjects, folders, threads, postage policies and blocklists.",
      },
      { property: "og:title", content: "NuMail — On-Chain Email on Polkadot" },
      {
        property: "og:description",
        content:
          "Send and receive verifiable on-chain correspondence with folders, threads, acceptance policies and real-time chain events.",
      },
    ],
  }),
  component: MailboxPage,
});
