import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, ShieldAlert, Wifi } from "lucide-react";
import { ENDPOINT_PRESETS } from "@/lib/numail/types";
import { useNumail } from "@/lib/numail/provider";
import { ConnectionBadge } from "./ConnectionBadge";

export function NetworkSettings({ onSaved }: { onSaved?: () => void }) {
  const { endpoint, setEndpoint, testEndpoint, connError, lastConnectedAt, chainName, palletAvailable, status } =
    useNumail();
  const [value, setValue] = useState(endpoint ?? "ws://localhost:9944");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    const res = await testEndpoint(value.trim());
    setResult(res);
    setTesting(false);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Preset endpoints</Label>
        <div className="flex flex-wrap gap-2">
          {ENDPOINT_PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={value === p.url ? "default" : "outline"}
              onClick={() => {
                setValue(p.url);
                setResult(null);
              }}
            >
              {p.name}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {ENDPOINT_PRESETS.find((p) => p.url === value)?.description ??
            "Custom endpoint — enter any Substrate node WebSocket URL below."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="endpoint">WebSocket endpoint</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="endpoint"
            value={value}
            spellCheck={false}
            onChange={(e) => {
              setValue(e.target.value);
              setResult(null);
            }}
            placeholder="ws://localhost:9944"
            className="text-mono text-sm"
          />
          <Button type="button" variant="secondary" onClick={runTest} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
            Test connection
          </Button>
        </div>
      </div>

      {result && (
        <Alert variant={result.ok ? "default" : "destructive"}>
          <AlertTitle>{result.ok ? "✓ Connected to node" : "✗ Failed to connect"}</AlertTitle>
          <AlertDescription className="break-words">{result.message}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium">Connection status</span>
          <ConnectionBadge />
        </div>
        <dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
          <div className="flex gap-2">
            <dt className="w-36 shrink-0">Active endpoint</dt>
            <dd className="text-mono break-all">{endpoint ?? "not configured"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0">Chain</dt>
            <dd>{chainName ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0">pallet-numail</dt>
            <dd>{palletAvailable ? "detected on node" : "not exposed by this node (local simulation active)"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0">Last connected</dt>
            <dd>{lastConnectedAt ? new Date(lastConnectedAt).toLocaleString() : "never"}</dd>
          </div>
          {connError && status !== "connected" && (
            <div className="flex gap-2">
              <dt className="w-36 shrink-0">Last error</dt>
              <dd className="text-destructive break-words">{connError}</dd>
            </div>
          )}
        </dl>
      </div>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Which endpoint should I use?</AlertTitle>
        <AlertDescription>
          <ul className="mt-1 space-y-1.5 text-xs leading-relaxed">
            <li>
              <strong>ws:// (insecure)</strong> — works only on http:// pages or localhost. Best for local development
              against your own node.
            </li>
            <li>
              <strong>wss:// (secure)</strong> — required on https:// pages such as this preview or a deployed build.
              Your node administrator must terminate TLS.
            </li>
            <li>
              <strong>Public testnet</strong> — no setup needed, but community nodes do not carry the NuMail pallet.
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => setValue(endpoint ?? "ws://localhost:9944")}>
          Reset
        </Button>
        <Button
          onClick={() => {
            setEndpoint(value.trim());
            onSaved?.();
          }}
          disabled={!/^wss?:\/\//.test(value.trim())}
        >
          Save &amp; reconnect
        </Button>
      </div>
    </div>
  );
}
