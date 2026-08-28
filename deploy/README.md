# NuMail Self-Hosting Guide (Nginx + Node)

This project uses TanStack Start, which renders pages on the server (there is no `index.html`). The production build creates a standalone **Node.js** application in `.output/server/index.mjs`.

## What changed for Node deployment

`vite.config.ts` now uses the `node-server` Nitro preset:

```ts
nitro: { preset: "node-server" }
```

This replaces the default Cloudflare Worker output with a Node.js server bundle.

## Build the production app

On your own server (where `LOVABLE_SANDBOX` is not set), run:

```bash
bun install
bun run build
```

The build produces:

```text
.output/server/index.mjs   # Node SSR / API entry point
.output/public/          # Static assets (favicon, robots, built JS/CSS)
.output/nitro.json       # Nitro metadata (preset: node-server)
```

## Start the Node server

```bash
PORT=3000 bun start
# or explicitly:
PORT=3000 node .output/server/index.mjs
```

The app will be available at `http://localhost:3000`.

## Run behind Nginx

1. Copy or adapt `deploy/nginx.conf` to your site config, e.g.:

   ```bash
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/numail
   sudo ln -s /etc/nginx/sites-available/numail /etc/nginx/sites-enabled/numail
   sudo nginx -t
   sudo systemctl reload nginx
   ```

2. Replace `numail.example.com` and the SSL certificate paths with your real domain and certificates.

3. Make sure the `upstream numail_node` port matches the `PORT` you start the Node app on.

## Keep the Node app running with systemd

1. Copy the service file:

   ```bash
   sudo cp deploy/numail.service /etc/systemd/system/numail.service
   ```

2. Update `WorkingDirectory` and `ExecStart` to point to where you deployed the project (e.g. `/var/www/numail`).

3. Enable and start the service:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable numail
   sudo systemctl start numail
   sudo systemctl status numail
   ```

## SSL (Let's Encrypt example)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d numail.example.com
```

Certbot will update `deploy/nginx.conf` automatically.

## Notes

- Inside the Lovable editor the sandbox forces the `cloudflare-module` preset, so `bun run build` there produces a Cloudflare bundle. That is only for Lovable's managed preview/publish; your own server will use the `node-server` preset because `LOVABLE_SANDBOX` is unset.
- No `index.html` is needed: TanStack Start generates the full HTML response for every route on the server.
- Polkadot SDK imports are stubbed during the server build because they are browser-only; they still work normally in the browser.
