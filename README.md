# Health Auto Export

## Overview

![Health Dashboard](docs/images/hae-grafana-health-metrics.png)

This project provides a web interface for viewing Apple Health data via Grafana and a React dashboard, backed by a Node.js server and MongoDB.

## React Dashboard

In addition to Grafana, this fork includes a React dashboard adapted from [FreeReps](https://github.com/meltforce/FreeReps).

- URL: http://localhost:3001/dashboard/
- Login: `admin` / your `READ_TOKEN` from `.env`
- Pages: overview, sleep, workouts, metrics, correlations, trends

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for attribution.

This project aims to be as beginner-friendly as possible, so if you're just getting started with programming, or consider yourself a "non-technical" person, this is a safe space! Of course, this also serves as a great base for the more seasoned developers to build on.

## Requirements

In order to use this project, you will need:

1. The [Health Auto Export](https://apple.co/3iqbU2d) app for iPhone
2. [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed on your computer

## Setup Guide

### Step 1: Computer Setup

1. Download and install Docker Desktop for your platform [here](https://www.docker.com/products/docker-desktop/)
2. Clone or download this repository to your desired location on your computer
3. Open a terminal/command prompt in the project folder
4. Run `sh ./create-env.sh` to create the `.env` file, or create the file manually with the following variables:
   - `NODE_ENV`: `production`
   - `MONGO_HOST`: `hae-mongo`
   - `MONGO_USERNAME`: `admin`
   - `MONGO_PASSWORD`: `mypassword` (set a secure password)
   - `MONGO_DB`: `health-auto-export`
   - `READ_TOKEN`: generated read token
   - `WRITE_TOKEN`: generated write token
   - `DASHBOARD_USERNAME`: dashboard login username (default `admin`)
   - `DASHBOARD_PASSWORD`: dashboard login password (defaults to `READ_TOKEN`)
5. You may need to uncomment [the line](https://github.com/HealthyApps/health-auto-export-server/blob/4163bb5e8aa8d2cdac2a9971c164c0fa46604866/docker-compose.yaml#L24) `user: "0:0"` in `docker-compose.yaml` when running Ubuntu.
6. Run `docker compose up -d` in your terminal.
7. Open the React dashboard at http://localhost:3001/dashboard/ (login with `admin` and your `READ_TOKEN`)
8. Open Grafana in your browser at http://localhost:3000
9. Login with the default credentials: `admin / admin`
10. Determine [your computer's local IP address](https://geekflare.com/consumer-tech/find-ip-address-of-windows-linux-mac-and-website/) and note it down
11. Configure the Health Auto Export app to send data to http://your-computer-ip:3001/api/data as outlined in **Step 3**

### Step 2: Grafana Setup

1. Configure the Grafana data source by selecting `Administration` in the left sidebar, then search for `Infinity`
2. Select and install `Infinity` plugin. After installation, select `Add new data source`
3. Give the data source a name, for example `Health Auto Export`
4. In the `URL, Headers & Params` section, set the `Base URL` to `http://host.docker.internal:3001`
   - Add a header with Key: `api-key` and Value: `sk-xxx` (value of `READ_TOKEN` in `.env`)
5. Select `Save & test` to complete the data source setup
6. This data source can now be used to create dashboards using the synced data

### Step 3: iPhone Setup

1. Install and open the [Health Auto Export](https://apple.co/3iqbU2d) app on your iPhone
2. Navigate to the `Automations` tab
3. Create a new automation
4. Configure the automation with the following settings:
   - Automation Type: `REST API`
   - URL: `http://your-computer-ip:3001/api/data`
   - Headers: `api-key` `sk-xxx` (write token in `.env`)
   - Data Type: create one `Health Metrics` automation and one `Workouts` automation
   - Export Format: `JSON`
   - Export Version: `Version 2`
   - Workouts: enable `Include Route Data` and `Include Workout Metrics`; set workout metric time grouping to `Minutes`
   - Batch Requests: `Enabled` 🟢
   - Initial load: run a one-time `Previous 7 Days` export
   - Ongoing sync: change the period to `Since Last Sync` and schedule it hourly
5. Tap `Update` in the top navigation bar to save the automation
6. Use `Manual Export` to select a date range and manually trigger a data export to your computer

### Step 4: Viewing Data

1. Open Grafana in your browser at http://localhost:3000
2. Create a new dashboard or import a pre-configured dashboard as described in **Step 5**

### Step 5: Import Dashboards (Optional)

If you are unfamiliar with Grafana, you can import pre-configured dashboards to get started quickly.

1. Navigate to the `Dashboards` tab
2. Select `New` and then `Import`
3. Upload the dashboard JSON file from the `dashboard-examples` folder, or copy the JSON into the `Import via dashboard JSON model` text area
4. You can find a full list of metrics available in [`MetricName.ts`](https://github.com/HealthyApps/health-auto-export-server/blob/4163bb5e8aa8d2cdac2a9971c164c0fa46604866/server/src/models/MetricName.ts#L1). These can be used in the datasource URL in order to fetch each metric from the database.

# Troubleshooting

If you encounter issues:

1. You can use [ChatGPT](https://chatgpt.com/) or [Claude](https://claude.ai/) to help you troubleshoot or fix specific errors
2. Ensure Docker is running
3. If you're still stuck, feel free to reach out using the support options below.

## Support

If you need assistance:

- Open an issue on GitHub
- Join the [Discord server](https://discord.gg/PY7urEVDnj)
- Contact [support](https://healthyapps.dev/contact)

## Contributing

Your contributions are welcome! Whether it's a bug fix, a new feature, a documentation update, or sharing your dashboards, we appreciate your help.

If you'd like to contribute to this project, create a pull request with your changes.
