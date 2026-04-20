# ESPOTADASH Server

Dashboard server for registering and monitoring ESP8266/ESP32 devices, managing OTA firmware updates, and interacting with device EEPROM and LittleFS file systems.

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
