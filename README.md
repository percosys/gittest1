# KVM Dashboard

A CCTV-style monitoring dashboard for JetKVM and PiKVM devices. View all your KVM streams in a single browser tab with a responsive grid layout.

## Features

- **PiKVM support** — Proxied snapshot polling with server-side authentication (credentials never exposed to the browser)
- **JetKVM support** — Embedded device UI via iframe with full WebRTC video
- **Responsive grid** — Auto-fit layout with manual column override (1–4 columns)
- **Fullscreen mode** — Click to expand any device to fullscreen, ESC to exit
- **Direct access** — Open any device's native UI in a new tab from the dashboard
- **Docker-ready** — Single container deployment, ideal for Unraid

## Quick Start

### Docker Compose (recommended)

1. Edit `config.yaml` with your device IPs and credentials
2. Run:

```bash
docker compose up -d
```

3. Open `http://<your-unraid-ip>:3000`

### Docker CLI

```bash
docker build -t kvm-dashboard .
docker run -d \
  --name kvm-dashboard \
  -p 3000:3000 \
  -v /path/to/your/config.yaml:/app/config.yaml:ro \
  --restart unless-stopped \
  kvm-dashboard
```

### Unraid

1. Build the image or use Docker Compose via the Unraid terminal
2. In the Unraid Docker UI, add a container with:
   - **Repository:** `kvm-dashboard` (local build)
   - **Port:** `3000` → `3000`
   - **Path:** `/mnt/user/appdata/kvm-dashboard/config.yaml` → `/app/config.yaml`
3. Place your `config.yaml` in `/mnt/user/appdata/kvm-dashboard/`

## Configuration

Edit `config.yaml` to define your devices:

```yaml
server:
  port: 3000

snapshotInterval: 2000  # ms between PiKVM snapshot refreshes

devices:
  - name: "PiKVM - Host 1"
    type: pikvm
    host: "https://192.168.1.100"
    username: admin
    password: admin

  - name: "JetKVM - Rack 1"
    type: jetkvm
    host: "http://192.168.1.101"
```

### Device types

| Type | Stream method | Auth |
|------|--------------|------|
| `pikvm` | Server-proxied JPEG snapshots via `/api/streamer/snapshot` | `X-KVMD-User` / `X-KVMD-Passwd` headers (server-side) |
| `jetkvm` | Iframe embedding of the device web UI (WebRTC) | Handled in-browser if the device has a password set |

### PiKVM with KVM switch

If your PiKVM controls multiple hosts via a KVM switch, add one entry per host pointing to the same PiKVM IP. All entries will show the same live feed (the currently selected input). Switching inputs is done through the PiKVM UI directly.

## Development

```bash
npm install
npm run dev    # starts with --watch for auto-reload
```
