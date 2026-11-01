# Production Deployment & Reverse Proxy Keep-Alive Configuration

When deploying the SAP Application in production behind reverse proxies such as **Nginx** or **IIS with Application Request Routing (ARR)**, keep-alive connection pooling must be aligned with the backend Node.js HTTP server.

---

## 1. Root Cause Background: The Keep-Alive Race Condition

Node.js `http.Server` has default timeout settings:
- `keepAliveTimeout`: **5000 ms (5 seconds)**
- `headersTimeout`: **60000 ms (60 seconds)**

When a client or proxy maintains idle keep-alive connections, Node.js terminates the idle connection after 5 seconds by destroying the socket on the backend. If an upstream reverse proxy (or dev server proxy) attempts to reuse this cached connection after 5 seconds of inactivity, it encounters `ECONNRESET` or `socket hang up`. The proxy then returns an unformatted `500 Internal Server Error` (often with `Content-Type: text/plain`) instead of the application's JSON error response.

To eliminate this issue across all deployment topologies:
1. **Node.js Backend**: `server.keepAliveTimeout` is configured to **65 seconds** (`65000 ms`) and `server.headersTimeout` to **66 seconds** (`66000 ms`), ensuring the backend socket lifespan exceeds reverse proxy idle timeouts.
2. **Reverse Proxies (Nginx / IIS ARR)**: Upstream keep-alive settings must be properly configured so the proxy either refreshes connections before the backend closes them, or disables stale connection reuse.

---

## 2. Nginx Deployment Configuration

In Nginx, persistent HTTP connections to upstream backends require explicit HTTP/1.1 enablement and clearing the `Connection` header.

### Configuration Snippet

```nginx
upstream backend_nodes {
    # Specify the Node.js backend cluster or single instance via IPv4 loopback
    server 127.0.0.1:5000;

    # Maintain an active pool of keepalive connections to upstream servers
    keepalive 64;

    # Ensure Nginx closes idle upstream connections before the Node backend does (Node is 65s)
    keepalive_timeout 60s;
}

server {
    listen 80;
    server_name sap-app.corp.internal;

    # Frontend static assets
    location / {
        root /var/www/sap-frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API Proxy to Node.js Backend
    location /api/ {
        proxy_pass http://backend_nodes;

        # 1. Enable HTTP/1.1 for upstream connections (default is HTTP/1.0, which disables keepalive)
        proxy_http_version 1.1;

        # 2. Clear the Connection header so Nginx maintains persistent upstream keepalive
        proxy_set_header Connection "";

        # 3. Standard proxy forwarding headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 4. Proxy timeouts (must be less than or equal to backend keepAliveTimeout of 65s)
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # 5. Prevent 502/504 errors on upstream retries
        proxy_next_upstream error timeout invalid_header http_502 http_503 http_504;
        proxy_next_upstream_tries 2;
    }
}
```

### Key Nginx Directives Explained:
- `proxy_http_version 1.1;`: Nginx defaults to HTTP/1.0 for upstream requests. HTTP/1.1 is strictly required to enable keep-alive connection pooling to Node.js.
- `proxy_set_header Connection "";`: Clears the incoming `Connection: close` or hop-by-hop headers, allowing persistent socket reuse.
- `keepalive 64;`: Configures the maximum number of idle keepalive connections in the pool per worker.
- `keepalive_timeout 60s;`: Sets the idle timeout for pooled upstream connections. Kept below Node's 65-second `keepAliveTimeout` so Nginx gracefully closes idle sockets before Node resets them.

---

## 3. IIS / Application Request Routing (ARR) Configuration

In Windows Server environments running Internet Information Services (IIS) with Application Request Routing (ARR), ARR pools connections to server farms by default. If ARR holds a pooled connection longer than Node's keepAliveTimeout, ARR sends incoming requests over a stale socket, producing HTTP 502.3 (`ECONNRESET`) errors.

### Solution A: Disable Keep-Alive Connection Reuse in ARR (Recommended)

1. Open **IIS Manager** (`inetmgr`).
2. Navigate to **Server Farms** -> select your backend server farm (or ARR Proxy settings at server level).
3. In the feature pane, double-click **Proxy**.
4. Locate the **Time-out (seconds)** and connection pooling options:
   - **Option 1 (Disable Reuse)**: Uncheck **Enable keep-alive** under Proxy settings. This ensures each proxied request to Node uses a fresh connection, completely eliminating stale socket races.
   - **Option 2 (Lower Timeout)**: If keep-alive is required for high throughput, set **Time-out (seconds)** to `30` seconds (or any value strictly below Node's 65 seconds, e.g. 30–50s).

### Solution B: Configuration via `applicationHost.config` / `web.config`

Apply the proxy configuration via IIS configuration or command line (`appcmd`):

```xml
<!-- In applicationHost.config under system.webServer/proxy -->
<system.webServer>
    <proxy enabled="true" 
           keepAliveTimeout="00:00:30" 
           responseBufferLimitMB="0" 
           reverseRewriteHeaders="true">
        <!-- Set keepAliveTimeout below Node's 65s (e.g., 30s) -->
        <cache enable="false" />
    </proxy>
</system.webServer>
```

Or execute via Administrator PowerShell / Command Prompt:
```powershell
# Set ARR proxy keepAliveTimeout to 30 seconds
& "$env:SystemRoot\system32\inetsrv\appcmd.exe" set config -section:system.webServer/proxy /keepAliveTimeout:"00:00:30" /commit:apphost

# Or disable keep-alive connection pooling to upstream servers
& "$env:SystemRoot\system32\inetsrv\appcmd.exe" set config -section:system.webServer/proxy /enableKeepAlive:False /commit:apphost
```

---

## 4. Vite Dev Server / Local Preview Configuration

For local development and preview servers, Vite's `http-proxy` is configured in `frontend/vite.config.js`:
- Target: `http://127.0.0.1:5000` (explicit IPv4 to prevent IPv6 `::1` lookup mismatch).
- Agent: `new http.Agent({ keepAlive: false })` to prevent pooling stale connections.
- Error Handler: Custom `proxy.on('error')` returning structured JSON error payloads with status 500 (`{ error: "Can't reach the sign-in service. Please try again." }`) instead of unformatted `text/plain`.
