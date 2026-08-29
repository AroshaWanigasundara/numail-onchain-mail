import { Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useNumail } from "@/lib/numail/provider";

const dot: Record<string, string> = {
  connected: "bg-success",
  connecting: "bg-warning animate-pulse",
  disconnected: "bg-destructive",
  error: "bg-destructive",
  idle: "bg-muted-foreground",
};

const label: Record<string, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  disconnected: "Disconnected",
  error: "Connection error",
  idle: "Not configured",
};

export function ConnectionBadge() {
  const { status, endpoint, connError, chainName, lastConnectedAt, reconnect, palletAvailable, onChain } = useNumail();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Blockchain connection: ${label[status]}`}
          className="inline-flex max-w-[220px] items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          {status === "connecting" ? (
            <Loader2 className="h-3 w-3 animate-spin text-warning" />
          ) : (
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot[status]}`} />
          )}
          <span className="truncate">
            {label[status]}
            {endpoint ? ` · ${endpoint.replace(/^wss?:\/\//, "")}` : ""}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 text-sm">
        <div>
          <p className="font-semibold">{label[status]}</p>
          <p className="text-mono mt-1 text-xs break-all text-muted-foreground">{endpoint ?? "No endpoint configured"}</p>
        </div>
        <dl className="space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>Chain</dt>
            <dd className="text-right">{chainName ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>pallet-numail</dt>
            <dd className="text-right">{palletAvailable ? "available" : "simulated locally"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Write mode</dt>
            <dd className="text-right">{onChain ? "signed extrinsics" : "local simulation"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Last connected</dt>
            <dd className="text-right">{lastConnectedAt ? new Date(lastConnectedAt).toLocaleTimeString() : "never"}</dd>
          </div>
        </dl>
        {connError && status !== "connected" && (
          <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{connError}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1" onClick={reconnect} disabled={!endpoint}>
            Reconnect
          </Button>
          <Button size="sm" variant="outline" className="flex-1" asChild>
            <Link to="/settings">Network settings</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
