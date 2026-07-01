# Health Auto Export Server

Self-hosted Apple Health storage and visualization using
[Health Auto Export](https://apps.apple.com/us/app/health-auto-export-json-csv/id1115567069),
Node.js, MongoDB, Docker, and a React dashboard.

Health Auto Export sends HealthKit metrics, sleep stages, workouts, and workout
routes from an iPhone to this server. The server stores the data in MongoDB and
serves the dashboard at `http://localhost:3001/dashboard/`.

## Requirements

- An iPhone with Apple Health data
- [Health Auto Export](https://apps.apple.com/us/app/health-auto-export-json-csv/id1115567069)
  with a **Premium subscription or Premium Lifetime license**. Premium is
  required for automatic background exports to a REST API.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- A computer that the iPhone can reach over the local network or
  [Tailscale](https://tailscale.com/)

The official
[Health Auto Export REST API guide](https://help.healthyapps.dev/en/health-auto-export/automations/rest-api/)
is useful if the app's labels change in a future release.

## How It Works

```text
Apple Health
    |
    | Health Auto Export: two REST API automations
    | 1. Health Metrics   2. Workouts
    v
Node/Express ingestion API
    |
    v
MongoDB persistent volume
    |
    v
React dashboard
```

The two iPhone automations both send JSON to:

```text
POST http://YOUR-COMPUTER-IP:3001/api/data
```

Do not use `localhost` in the iPhone app. On the phone, `localhost` means the
iPhone itself. Use the computer's LAN IP address or another address that is
reachable from the phone.

## 1. Start the Server

Clone the repository and enter its directory:

```bash
git clone https://github.com/ZacharyLeahan/health-auto-export-server.git
cd health-auto-export-server
```

Create the environment file:

```bash
sh ./create-env.sh
```

The generated `.env` contains:

```dotenv
NODE_ENV=production
MONGO_HOST=hae-mongo
MONGO_PORT=27017
MONGO_USERNAME=admin
MONGO_PASSWORD=replace-with-a-secure-password
MONGO_DB=health-auto-export
WRITE_TOKEN=sk-generated-write-token
```

Keep `.env` private. The `WRITE_TOKEN` permits ingestion.

Start MongoDB and the application server:

```bash
docker compose up -d hae-mongo hae-server
```

Check their status and logs:

```bash
docker compose ps
docker compose logs -f hae-server
docker compose logs -f hae-mongo
```

Open the React dashboard:

```text
http://localhost:3001/dashboard/
```

The dashboard opens directly without a login prompt.

### Optional: Access the Dashboard from iPhone with Tailscale

[Tailscale](https://tailscale.com/) is a convenient way to reach the dashboard
from an iPhone without exposing it to the public internet.

1. [Install Tailscale on the Mac](https://tailscale.com/docs/install/mac).
2. [Install Tailscale on the iPhone](https://tailscale.com/docs/install/ios).
3. Sign in to the same tailnet on both devices.
4. Make sure Tailscale is connected and the Docker services are running on the
   Mac.
5. Find the Mac's
   [MagicDNS hostname](https://tailscale.com/docs/features/magicdns) in the
   Tailscale app or admin console.
6. Open the following URL in Safari on the iPhone:

```text
http://YOUR-MAC-TAILSCALE-HOSTNAME:3001/dashboard/
```

The fully qualified hostname also works:

```text
http://YOUR-MAC-NAME.YOUR-TAILNET.ts.net:3001/dashboard/
```

The same hostname can be used for the Health Auto Export endpoint:

```text
http://YOUR-MAC-TAILSCALE-HOSTNAME:3001/api/data
```

Bookmark the dashboard in Safari, or use **Share → Add to Home Screen**. Opening
that icon gives the dashboard an app-like experience on iPhone.

For a private HTTPS URL without `:3001`, use
[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) on the
Mac:

```bash
tailscale serve --bg localhost:3001
```

Tailscale prints the generated URL, which will look like:

```text
https://YOUR-MAC-NAME.YOUR-TAILNET.ts.net/dashboard/
```

With Serve enabled, the automation endpoint is:

```text
https://YOUR-MAC-NAME.YOUR-TAILNET.ts.net/api/data
```

Use Tailscale Serve, not Tailscale Funnel. Serve keeps the dashboard private to
devices authorized on the tailnet; Funnel would make it publicly reachable.

## 2. Configure Health Auto Export on iPhone

Create **two separate REST API automations**:

1. `Health Metrics to MongoDB`
2. `Workouts to MongoDB`

Keeping these separate makes large exports more reliable and lets each data
type use the correct options.

### Settings Shared by Both Automations

Use these settings for both:

| Setting | Value |
| --- | --- |
| Automation Type | `REST API` |
| URL | `http://YOUR-COMPUTER-IP:3001/api/data` |
| HTTP header | Key: `api-key`, Value: the `WRITE_TOKEN` from `.env` |
| Export Format | `JSON` |
| Export Version | `Version 2` |
| Batch Requests | **On** |
| Initial Date Range | `Previous 7 Days` |

Do not add a manual `Content-Type` header; the app sets it for JSON exports.

### Automation 1: Health Metrics

Set:

| Setting | Value |
| --- | --- |
| Data Type | `Health Metrics` |
| Selected Metrics | Select the metrics you want, including Sleep Analysis |
| Summarize Data | **Off** |

Do **not** enable `Summarize Data`. The dashboard needs individual sleep-stage
and timestamped metric records; summarized data can remove the detail needed
for the sleep timeline.

Selecting only metrics that have data in Apple Health reduces export time and
payload size.

### Automation 2: Workouts

Set:

| Setting | Value |
| --- | --- |
| Data Type | `Workouts` |
| Include Route Data | **On** |
| Include Workout Metrics | **On** |
| Time Grouping | `Seconds` |

Use second-level grouping so the heart-rate timeline retains useful detail for
short workouts that last only a few minutes. This creates larger payloads than
minute-level grouping, so Batch Requests should remain enabled.

## 3. Initial Seven-Day Sync

The initial import is a one-time backfill. Perform these steps for **both**
automations:

1. Set Date Range to `Previous 7 Days`.
2. Save/update the automation.
3. Run `Manual Export`.
4. Wait for the export to finish.
5. Open `View Activity Logs` and confirm the REST requests succeeded.
6. Check the React dashboard for health metrics, sleep, and workouts.

Run one continuous `Previous 7 Days` export. Do not replace it with separate
`Today` and `Yesterday` exports. Sleep sessions cross midnight, and splitting
the range can omit part of a night—for example, the stages between bedtime and
midnight.

Imports use upserts, so repeating the seven-day export is safe if a request
fails or a night appears incomplete.

## 4. Switch Both Automations to Since Last Sync

After the one-time seven-day export succeeds, edit **each** automation:

1. Change Date Range from `Previous 7 Days` to `Since Last Sync`.
2. Choose the desired automatic sync cadence; hourly is a practical default.
3. Save/update the automation.
4. Leave `Summarize Data` off for Health Metrics.
5. Leave Batch Requests on for both automations.

`Since Last Sync` sends data from the previous successful run through the
current time. This avoids midnight cuts and avoids repeatedly uploading the
same full day.

For more reliable background runs:

- Enable Background App Refresh for Health Auto Export.
- Disable Low Power Mode when diagnosing missed runs.
- Remember that iOS does not allow apps to read HealthKit while the phone is
  locked, so a scheduled run may occur later than its nominal time.
- Review each automation's Activity Logs when data appears incomplete.

## Docker and MongoDB Operations

### Start, Stop, and Restart

```bash
docker compose up -d hae-mongo hae-server
docker compose restart hae-server
docker compose stop
```

### Rebuild After a Code Update

```bash
git pull
docker compose up -d --build hae-server
```

### MongoDB Storage

MongoDB stores health data in the Docker named volume `mongodb-data`. Normal
container restarts and `docker compose down` preserve this volume.

Do **not** run the following unless you intentionally want to erase all stored
health data:

```bash
docker compose down -v
```

### Open a MongoDB Shell

Replace the example credentials with the values from `.env`:

```bash
docker compose exec hae-mongo mongosh \
  --username admin \
  --password YOUR_MONGO_PASSWORD \
  --authenticationDatabase admin \
  health-auto-export
```

Useful commands inside `mongosh`:

```javascript
show collections
db.sleep_analysis.countDocuments()
db.workouts.countDocuments()
```

### Back Up MongoDB

```bash
docker compose exec hae-mongo mongodump \
  --username admin \
  --password YOUR_MONGO_PASSWORD \
  --authenticationDatabase admin \
  --db health-auto-export \
  --archive=/tmp/health-auto-export.archive

docker compose cp \
  hae-mongo:/tmp/health-auto-export.archive \
  ./health-auto-export.archive
```

Store the archive securely: it contains private health information.

## Troubleshooting

### The iPhone Cannot Reach the Server

- Confirm the phone and computer are on the same local network, or that both
  are connected to the same Tailscale tailnet.
- Use the computer's IP address, not `localhost`.
- Confirm `docker compose ps` shows `hae-server` running.
- Open `http://YOUR-COMPUTER-IP:3001/` from Safari on the iPhone.
- Check firewall rules for TCP port `3001`.

### The App Reports an HTTP Error

- Confirm the header name is exactly `api-key`.
- Confirm its value matches `WRITE_TOKEN` in `.env`.
- Check `docker compose logs -f hae-server`.
- Review the automation's Activity Logs for the response status.

### Exports Time Out

- Keep Batch Requests on.
- Export fewer unused health metrics.
- Keep workout Time Grouping set to `Seconds`; shorten the export date range
  instead of reducing heart-rate detail.
- Run the initial Health Metrics and Workouts backfills separately.

### The Dashboard Has No Data

- Confirm both seven-day manual exports completed successfully.
- Confirm the dashboard's selected date range includes the imported dates.
- Check MongoDB collection counts with `mongosh`.

## Credits

This repository is a fork of
[HealthyApps/health-auto-export-server](https://github.com/HealthyApps/health-auto-export-server).

The React dashboard is adapted from
[meltforce/FreeReps](https://github.com/meltforce/FreeReps), a self-hosted
health-data server and visualization dashboard. This project reuses and adapts
the React dashboard design and components; it does not include FreeReps'
Go/TimescaleDB backend or iOS companion app.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for additional
attribution.

## Contributing

Issues and pull requests are welcome.
