# ESPOTADASH Server

ESPOTADASH is a Node.js/Express server that acts as a central hub for managing a fleet of ESP8266 and ESP32 devices over Wi-Fi. It provides a web dashboard (served as static files) and a REST + WebSocket API that covers the full device lifecycle: registration, health monitoring, remote commands, OTA firmware updates, EEPROM data management, and LittleFS file system access.

To use this server, you need program your ESP with this library https://github.com/neorob85/ESPOTADASH_library

## Features

### Device registration and inventory

Devices self-register by calling `POST /api/register` on startup, sending their metadata (chip ID, MAC address, hostname, IP, HTTP port, CPU frequency, flash and sketch sizes). The server persists this information in `config/devices.json` and keeps the device list in memory for fast access.

### Real-time health monitoring

The server periodically pings every registered device at a configurable interval (`PING_INTERVAL_MS`, default 60 s). Each ping hits the device's `/ping` endpoint and collects uptime, free heap, and RSSI. A device is marked offline after a configurable grace period (`OFFLINE_GRACE_MS`, default 3 min) without a successful response. The ping cycle can also be triggered manually via `POST /api/refresh`.

### Real-time WebSocket updates

A WebSocket server runs on the same port as the HTTP API. On connection the client receives a full snapshot of all devices and groups. Every state change (registration, ping result, device removal, group modification) is broadcast to all connected clients in real time, allowing the dashboard UI to stay up to date without polling.

### Device groups

Devices can be organized into named groups with an optional description. Groups are created, updated, and deleted through the REST API (`/api/groups`) and persisted in `config/groups.json`. Groups are also used to associate firmware images with a set of devices.

### Firmware management (OTA)

Firmware images (`.bin` files up to 16 MB) are managed in two steps:

1. **Create a metadata entry** (`POST /api/firmware`) specifying version, target platform (`esp8266` or `esp32`), description, date, and optional group/device associations.
2. **Upload the binary** (`PUT /api/firmware/:id/file`), stored in the `firmware/` directory under a unique filename.

Metadata is persisted in `config/firmware.json`. Existing entries can be updated or deleted (which also removes the binary from disk).

### OTA flash (server-side proxy)

`POST /api/firmware/:fwId/flash/:deviceId` reads the stored `.bin` file and forwards it to the target device's `/update` endpoint as a `multipart/form-data` request. The server acts as a proxy, so the browser never needs a direct route to the device. The operation has a 120 s timeout.

### Direct OTA upload proxy

`POST /api/devices/:id/firmware` pipes the raw request body (multipart firmware) directly to the device's `/update` endpoint, allowing the browser to upload a firmware file to a device through the server without storing it first.

### Remote commands

`POST /api/devices/:id/command` sends a JSON command to the device's `/cmd` endpoint and returns the device response. Typical commands include `reboot`, `toggle_led`, `heap_report`, and `print_eeprom`, but the mechanism is open-ended.

### EEPROM management

The server proxies full read/write access to the device's EEPROM:

- `GET /api/devices/:id/eeprom` — read the current EEPROM content from the device.
- `POST /api/devices/:id/eeprom` — write a JSON payload to the device's EEPROM.
- `POST /api/devices/:id/eeprom/format` — format (erase) the device EEPROM.
- `GET|POST /api/devices/:id/eeprom-map` — read and write a field map stored server-side that defines the layout of the EEPROM (field names, addresses, types, lengths). The map is persisted alongside the device record in `config/devices.json`.

### LittleFS file system proxy

The server exposes a full file system interface for each device's LittleFS partition:

- `GET /api/devices/:id/fs/info` — partition total/used space.
- `GET /api/devices/:id/fs/list?path=<dir>` — list files and directories under a path.
- `GET /api/devices/:id/fs/download?path=<file>` — stream a file from the device to the browser.
- `POST /api/devices/:id/fs/upload?path=<dir>` — upload a file to the device (pipes the multipart body through).
- `DELETE /api/devices/:id/fs/delete?path=<file>` — delete a file from the device.
- `POST /api/devices/:id/fs/mkdir?path=<dir>` — create a directory on the device.

### Static web dashboard

The `public/` directory is served as static content. The single-page dashboard (HTML + CSS + JavaScript) connects to the WebSocket endpoint and uses the REST API to display device status, manage groups, handle firmware uploads, and interact with EEPROM and LittleFS.

## Requirements

- [Docker](https://docs.docker.com/get-docker/) 24+
- [Docker Compose](https://docs.docker.com/compose/) v2 (included with Docker Desktop)

## Build the Docker image

```bash
docker build -t espotadash:1.0.0 -t espotadash:latest .
```

The tag `espotadash:1.0.0` pins the version; `espotadash:latest` always points to the most recent build.

## Run from the command line

```bash
docker run -d \
  --name espotadash \
  -p 3000:3000 \
  -v "$(pwd)/config:/app/config" \
  -v "$(pwd)/firmware:/app/firmware" \
  espotadash:1.0.0
```

Open the dashboard at <http://localhost:3000>.

### Stop / remove the container

```bash
docker stop espotadash
docker rm espotadash
```

## Run with Docker Compose

```bash
docker compose up -d
```

Stop:

```bash
docker compose down
```

Rebuild after code changes:

```bash
docker compose build && docker compose up -d
```

## Bind mounts

| Host path   | Container path  | Purpose                                              |
|-------------|-----------------|------------------------------------------------------|
| `./config/` | `/app/config/`  | Persistent device registry, groups and firmware metadata (`devices.json`, `groups.json`, `firmware.json`) |
| `./firmware/` | `/app/firmware/` | Uploaded firmware binaries (`.bin` files)          |

> Both directories are created automatically by the server if they do not exist. Mount them to keep data across container restarts and upgrades.

## Environment variables

| Variable            | Default   | Description                                        |
|---------------------|-----------|----------------------------------------------------|
| `PORT`              | `3000`    | HTTP/WebSocket port                                |
| `PING_INTERVAL_MS`  | `60000`   | How often devices are pinged (ms)                  |
| `PING_TIMEOUT_MS`   | `4000`    | Ping request timeout (ms)                          |
| `OFFLINE_GRACE_MS`  | `180000`  | Grace period before a device is marked offline (ms)|

Override any variable on the command line:

```bash
docker run -d \
  --name espotadash \
  -p 8080:8080 \
  -e PORT=8080 \
  -e PING_INTERVAL_MS=30000 \
  -v "$(pwd)/config:/app/config" \
  -v "$(pwd)/firmware:/app/firmware" \
  espotadash:1.0.0
```

Or in `docker-compose.yml` under the `environment` key.

## Versioning

Image tags follow **SemVer** (`MAJOR.MINOR.PATCH`). Always build with both a version tag and `latest`:

```bash
docker build -t espotadash:1.0.0 -t espotadash:latest .
```

When upgrading, update the image tag in `docker-compose.yml` and rebuild.
