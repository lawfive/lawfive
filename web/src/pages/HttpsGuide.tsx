import { useState } from "react";
import { useHttps } from "../components/HttpsNotice.tsx";
import { Field, Icon, PageHead } from "../components/ui.tsx";

// ADM-6: the ways to put a self-hosted server behind HTTPS, with what to copy for each. LawFive
// itself speaks plain HTTP on port 3000; something in front of it holds the certificate. The
// Compose files merge with compose.yaml by being called compose.override.yaml beside it.

interface Step {
    text: string;
    file?: string;
    code?: string;
}

interface Method {
    id: string;
    name: string;
    best: string;
    trade?: string;
    /** It gives its own address rather than using the domain. */
    ownAddress?: boolean;
    env?: string;
    steps: (domain: string) => Step[];
}

const methods: Method[] = [
    {
        id: "caddy",
        name: "Caddy",
        best: "The simplest with your own domain. It gets and renews the certificate itself.",
        trade: "Ports 80 and 443 must reach this machine, and nothing else may be using them.",
        steps: (domain) => [
            { text: `Point ${domain} at this machine's public address in your domain's DNS, and forward ports 80 and 443 to it if it's behind a router.` },
            {
                text: "Add Caddy beside the server, in a new file next to compose.yaml:",
                file: "compose.override.yaml",
                code: `services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    command: caddy reverse-proxy --from ${domain} --to server:3000
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - caddy-data:/data

volumes:
  caddy-data:`,
            },
        ],
    },
    {
        id: "traefik",
        name: "Traefik",
        best: "If this machine already runs Traefik for other services.",
        trade: "The network, entry point and certificate resolver below must use the names in your Traefik setup.",
        steps: (domain) => [
            { text: `Point ${domain} at your Traefik machine in your domain's DNS.` },
            {
                text: "Give the server Traefik's labels and network, in a new file next to compose.yaml:",
                file: "compose.override.yaml",
                code: `services:
  server:
    labels:
      - traefik.enable=true
      - traefik.http.routers.lawfive.rule=Host(\`${domain}\`)
      - traefik.http.routers.lawfive.entrypoints=websecure
      - traefik.http.routers.lawfive.tls.certresolver=letsencrypt
      - traefik.http.services.lawfive.loadbalancer.server.port=3000
    networks:
      - default
      - traefik

networks:
  traefik:
    external: true`,
            },
            {
                // APP-23: a 503 says "try again"; Traefik's 404 for a route it has dropped looks like the server's.
                text: "Optional: while the server restarts after an update, Traefik has no route to it and answers 404. To have it answer 503 (try again) instead, add this file to the folder Traefik's file provider reads. It's used only while the server's own route is gone.",
                file: "lawfive-restarting.yml",
                code: `http:
  routers:
    lawfive-restarting:
      rule: "Host(\`${domain}\`)"
      priority: 1
      entryPoints: [websecure]
      tls: {}
      service: lawfive-restarting
  services:
    lawfive-restarting:
      loadBalancer:
        servers: []`,
            },
        ],
    },
    {
        id: "nginx",
        name: "nginx and Certbot",
        best: "If nginx already runs on this machine, outside Docker.",
        trade: "Certbot's certificate renews itself once it's installed, but nginx and Certbot are yours to keep updated.",
        steps: (domain) => [
            { text: `Point ${domain} at this machine's public address in your domain's DNS, and forward ports 80 and 443 to it if it's behind a router.` },
            {
                text: "Add a site to nginx. The size limit allows restoring a large export, and turning buffering off lets one download as it's made.",
                file: `/etc/nginx/conf.d/${domain}.conf`,
                code: `server {
    listen 80;
    server_name ${domain};
    client_max_body_size 2g;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}`,
            },
            { text: "Get the certificate; Certbot adds it to that site:", code: `sudo certbot --nginx -d ${domain}` },
        ],
    },
    {
        id: "cloudflare",
        name: "Cloudflare Tunnel",
        best: "For a server at home: no open ports, and it works behind any router.",
        trade: "The domain has to be on Cloudflare, Cloudflare can see the traffic, and its free plan limits an upload to 100 MB, so a larger export can't be restored through it.",
        env: "TRUSTED_IP_HEADER=CF-Connecting-IP\nCLOUDFLARE_TUNNEL_TOKEN=the-token-from-cloudflare\n",
        steps: (domain) => [
            { text: `In Cloudflare's Zero Trust dashboard, make a tunnel under Networks, and copy its token. Add a public hostname of ${domain} with the service http://server:3000.` },
            {
                text: "Run the tunnel beside the server, in a new file next to compose.yaml:",
                file: "compose.override.yaml",
                code: `services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel run
    environment:
      TUNNEL_TOKEN: \${CLOUDFLARE_TUNNEL_TOKEN}`,
            },
        ],
    },
    {
        id: "tailscale",
        name: "Tailscale Funnel",
        best: "With no domain of your own: you get a free address ending in .ts.net.",
        trade: "Funnel has to be allowed in your tailnet's settings, and the address has Tailscale's name in it.",
        ownAddress: true,
        steps: () => [
            { text: "Install Tailscale on this machine and sign in, then share the server. It prints your address:", code: "tailscale funnel --bg 3000" },
        ],
    },
];

function Snippet({ file, code }: { file?: string; code: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="guide-snippet">
            {file && <small className="muted"><code>{file}</code></small>}
            <div className="guide-code">
                <pre className="setup-command"><code>{code}</code></pre>
                {/* There's no clipboard on a plain http page, except on localhost. */}
                {navigator.clipboard && (
                    <button type="button" className={`icon-btn${copied ? " copied" : ""}`} aria-label="Copy" title="Copy"
                        onClick={() => { void navigator.clipboard.writeText(code).then(() => setCopied(true)); }}>
                        <Icon name={copied ? "check" : "copy"} size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}

export function HttpsGuide() {
    const https = useHttps();
    const [chosen, setChosen] = useState("caddy");
    const fromAddress = https ? new URL(https.address).hostname : "";
    const [domain, setDomain] = useState(/^(localhost|[\d.]+)$/.test(fromAddress) || !fromAddress ? "" : fromAddress);
    const name = domain.trim() || "lawfive.example.com";
    const method = methods.find((m) => m.id === chosen)!;
    const address = method.ownAddress ? "https://your-machine.your-tailnet.ts.net" : `https://${name}`;
    const steps = method.steps(name);
    return (
        <>
            <PageHead back={{ to: "/settings/server", label: "Server" }} title="Set up HTTPS"
                sub="LawFive speaks plain HTTP. Something in front of it holds the certificate, and these are the usual ways." />
            <div className="stack">
                {https && (
                    <div className={`card https-status ${https.secure ? "ok" : "warn"}`}>
                        <Icon name={https.secure ? "check" : "info"} size={20} />
                        <div>
                            <strong>{https.secure ? "This server is on HTTPS." : "This server isn't on HTTPS yet."}</strong>
                            <p className="muted">
                                Its address is <code>{https.address}</code>.{" "}
                                {https.secure
                                    ? "Garmin watches and the phone apps can use it."
                                    : https.addressOnly
                                        ? "You reached it over HTTPS, so the last step below is what's left."
                                        : "It needs a valid certificate for Garmin watches and the store versions of the phone apps: a self-signed one isn't enough."}
                            </p>
                        </div>
                    </div>
                )}
                <div className="card form-section">
                    <h2>Choose how</h2>
                    <div className="scheme-list">
                        {methods.map((m) => (
                            <label key={m.id} className={`scheme${chosen === m.id ? " on" : ""}`}>
                                <input type="radio" name="https-method" checked={chosen === m.id} onChange={() => setChosen(m.id)} />
                                <span><strong>{m.name}</strong><small>{m.best}</small></span>
                            </label>
                        ))}
                    </div>
                    {!method.ownAddress && (
                        <div className="fields" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
                            <Field label="Your domain" info="Fills it in below. A subdomain is fine.">
                                <input className="input setting-input" value={domain} placeholder="lawfive.example.com" autoComplete="off" spellCheck={false}
                                    onChange={(e) => setDomain(e.target.value.toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9.-]/g, ""))} />
                            </Field>
                        </div>
                    )}
                </div>
                <div className="card form-section">
                    <h2>{method.name}</h2>
                    {method.trade && <p className="muted" style={{ marginTop: -6 }}>{method.trade}</p>}
                    <ol className="guide-steps">
                        {steps.map((step) => (
                            <li key={step.text}>
                                <p>{step.text}</p>
                                {step.code && <Snippet file={step.file} code={step.code} />}
                            </li>
                        ))}
                        <li>
                            <p>Tell LawFive its new address, keep port 3000 to this machine, and believe the proxy about who's visiting, in <code>.env</code> next to compose.yaml:</p>
                            <Snippet file=".env" code={`PUBLIC_URL=${address}\nPORT=127.0.0.1:3000\nTRUSTED_PROXIES=private\n${method.env ?? ""}`.trim()} />
                        </li>
                        <li>
                            <p>Start it all again:</p>
                            <Snippet code="docker compose up -d" />
                        </li>
                        <li>
                            <p>Open <code>{address}</code> and sign in again. This page says when it's right. Phones and watches linked to the old address need signing in or linking again.</p>
                        </li>
                    </ol>
                </div>
            </div>
        </>
    );
}
