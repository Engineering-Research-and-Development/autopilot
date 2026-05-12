# Node-RED Production Flow - API Reference

All endpoints are served by the Node-RED HTTP-in nodes on `localhost:1880` (default port). Every request and response body is `application/json`. Endpoints marked **internal** are used for inter-flow communication and are not intended for external callers.


## Table of Contents

- [Production Line](#production-line)
  - [GET /status](#get-status)
  - [GET /line](#get-line)
  - [POST /config](#post-config)
  - [POST /robot/speed](#post-robotspeed)
  - [POST /robot/speed/low](#post-robotspeedlow)
  - [POST /robot/speed/high](#post-robotspeedhigh)
  - [POST /load/speed](#post-loadspeed)
  - [POST /reset](#post-reset)
- [Analysis](#analysis)
  - [GET /threshold](#get-threshold)
  - [POST /threshold](#post-threshold)
  - [POST /analysis/package/reset](#post-analysispackagereset)
- [Execute](#execute)
  - [GET /automate](#get-automate)
  - [POST /automate](#post-automate)
  - [GET /suggestions](#get-suggestions)
- [Internal](#internal)
  - [POST /planner](#post-planner)
  - [POST /execute](#post-execute)

---

## Production Line

Endpoints for inspecting and controlling the simulation or physical production line state.


### GET /status

Returns a full snapshot of the current production line state: machine statuses, queue depths, counters, and energy accumulators.

**Request**

```http
GET /status HTTP/1.1
Host: localhost:1880
```

**Response `200 OK`**

```json
{
    "ts": "2026-05-12T09:55:10.601Z",
    "summary": {
        "n_good": 116899,
        "n_scrap": 20551,
        "total": 137450,
        "yield_pct": 85.05
    },
    "rates": {
        "load_speed": 19,
        "load_interval_ms": 3158,
        "robot_speed": 19,
        "robot_interval_ms": 3158,
        "camera_interval_ms": 20000,
        "watch_interval_ms": 20000,
        "labeler_interval_ms": 20000
    },
    "machines": {
        "LoadPackage": {
            "status": "producing",
            "locked": false
        },
        "Robot": {
            "status": "producing",
            "locked": false
        },
        "Camera": {
            "status": "producing",
            "locked": false
        },
        "Smartwatch": {
            "status": "producing",
            "locked": false
        },
        "Labeler": {
            "status": "producing",
            "locked": false
        }
    },
    "queues": {
        "q_load_out": 20,
        "q_robot_out": 13,
        "q_camera_out": 0,
        "q_watch_out": 0
    },
    "pallets": {
        "ready": 10,
        "loaded": 13,
        "max": 8
    },
    "robot_quality_pct": 90.57,
    "config": {
        "load_speed": 19,
        "robot_speed": 19,
        "max_queue_size": 20,
        "max_loadable_pallet": 8,
        "ready_packages": -136983,
        "unlock_threshold": 1,
        "pulsar_url": "http://localhost:8080",
        "pallet_speed": 19
    }
}
```

| Field | Type | Description |
|---|---|---|
| `*_status` | `string` | Machine state: `"producing"`, `"blocked"`, `"starving"`, or `"idle"` |
| `q_*` | `integer` | Current item count in each inter-stage queue |
| `n_good` / `n_scrap` | `integer` | Cumulative good and scrap product counts since last reset |
| `ready_packages` / `ready_pallets` | `integer` | Remaining material stock |
| `total_energy_*_kwh` | `float` | Accumulated energy per machine since last reset |

---

### GET /line

Returns a map of the **latest event log entry** received from each production stage, keyed by Pulsar topic name. The map is built incrementally by the `build_line_status_payload` node, which overwrites each key on every event emitted by the corresponding machine. The result is therefore a per-stage snapshot of the most recent production activity across the entire line, without any historical depth.

This endpoint is served from the dedicated **Status** tab and reads directly from the `line_status` global context variable.

**Request**

```http
GET /line HTTP/1.1
Host: localhost:1880
```

**Response `200 OK`**

```json
{
  "initialized": true,
  "load-pallets": {
    "case_id": "PLT-00031",
    "activity": "Pallet Loading",
    "machine": "PalletLoader",
    "ts_start": "2025-06-01T08:14:02.310Z",
    "ts_end": "2025-06-01T08:14:08.310Z",
    "duration_ms": 6000,
    "attributes": {
      "pallet_speed": 10,
      "machine_status": "producing",
      "ready_pallets": 69,
      "power_kw": 1.21,
      "energy_kwh": 0.00201,
      "total_energy_pallet_kwh": 0.421
    }
  },
  "load-package": {
    "case_id": "PKG-00089",
    "activity": "Package Loading",
    "machine": "PackageLoader",
    "ts_start": "2025-06-01T08:14:09.540Z",
    "ts_end": "2025-06-01T08:14:21.540Z",
    "duration_ms": 12000,
    "attributes": {
      "charger_speed": 5,
      "machine_status": "producing",
      "remaining_packages": 411,
      "power_kw": 1.09,
      "energy_kwh": 0.00363,
      "total_energy_load_kwh": 1.102
    }
  },
  "robot": {
    "case_id": "PKG-00086",
    "activity": "Robot Processing",
    "machine": "Robot",
    "ts_start": "2025-06-01T08:14:05.120Z",
    "ts_end": "2025-06-01T08:14:20.120Z",
    "duration_ms": 15000,
    "attributes": {
      "robot_speed": 4,
      "machine_status": "producing",
      "produced_quality_pct": 95.41,
      "pallet_id": "PLT-00028",
      "ready_packages": 3,
      "ready_pallets": 2,
      "power_kw": 1.38,
      "energy_kwh": 0.00574,
      "total_energy_robot_kwh": 3.847
    }
  },
  "camera": {
    "case_id": "PKG-00083",
    "activity": "Camera Inspection",
    "machine": "Camera",
    "ts_start": "2025-06-01T08:14:01.000Z",
    "ts_end": "2025-06-01T08:14:02.000Z",
    "duration_ms": 1000,
    "attributes": {
      "quality_ok": true
    }
  },
  "smartwatch": {
    "case_id": "PKG-00080",
    "activity": "Smartwatch Verification",
    "machine": "Smartwatch",
    "ts_start": "2025-06-01T08:13:58.000Z",
    "ts_end": "2025-06-01T08:13:59.000Z",
    "duration_ms": 1000,
    "attributes": {
      "quality_ok": true
    }
  },
  "labeler": {
    "case_id": "PKG-00077",
    "activity": "Label Application",
    "machine": "Labeler",
    "ts_start": "2025-06-01T08:13:55.000Z",
    "ts_end": "2025-06-01T08:13:56.000Z",
    "duration_ms": 1000,
    "attributes": {
      "quality_ok": true,
      "outcome": "good"
    }
  },
  "pick-area": {
    "case_id": "PKG-00074",
    "activity": "Pick Area",
    "machine": "GoodArea",
    "ts_start": "2025-06-01T08:13:53.000Z",
    "ts_end": "2025-06-01T08:13:53.000Z",
    "duration_ms": 0,
    "attributes": {
      "n_good": 142,
      "outcome": "good"
    }
  },
  "scrap-area": {
    "case_id": "PKG-00071",
    "activity": "Scrap Area",
    "machine": "ScrapArea",
    "ts_start": "2025-06-01T08:13:40.000Z",
    "ts_end": "2025-06-01T08:13:40.000Z",
    "duration_ms": 0,
    "attributes": {
      "n_scrap": 18,
      "scrap_reason": "camera_quality_fail",
      "outcome": "scrap"
    }
  }
}
```

| Top-level key | Description |
|---|---|
| `initialized` | `true` once the `line_status` global has been written to for the first time |
| `load-pallets` | Latest event from Stage 1.A (Pallet Loader) |
| `load-package` | Latest event from Stage 1.B (Package Loader) |
| `robot` | Latest event from Stage 2 (Robot) |
| `camera` | Latest event from Stage 3 (Camera) |
| `smartwatch` | Latest event from Stage 4 (Smartwatch) |
| `labeler` | Latest event from Stage 5 (Labeler) |
| `pick-area` | Latest event from Stage 6.A (Good Area) |
| `scrap-area` | Latest event from Stage 6.B (Scrap Area) |

Each entry follows the canonical event log schema (`case_id`, `activity`, `machine`, `ts_start`, `ts_end`, `duration_ms`, `attributes`). A key is absent from the response if that stage has not emitted any event since the last Node-RED deploy or reset.

> **Note:** Because each key holds only the single most recent event, `GET /line` is intended for **live status monitoring** (e.g. a dashboard polling at 1–2 Hz), not for auditing or replay. Historical event data is available via InfluxDB queries against the StreamPipes-populated measurements.

---

### POST /config

Updates one or more global configuration parameters. Only fields provided in the request body are updated; omitted fields retain their current values.

**Request**

```http
POST /config HTTP/1.1
Host: localhost:1880
Content-Type: application/json
```

```json
{
  "robot_speed": 6,
  "load_speed": 8,
  "pallet_speed": 12,
  "max_queue_size": 25
}
```

| Field | Type | Constraints | Description |
|---|---|---|---|
| `robot_speed` | `float` | `[1, 20]` | Robot processing speed in items/min |
| `load_speed` | `float` | `[1, 20]` | Package loader speed in items/min |
| `pallet_speed` | `float` | `[1, 20]` | Pallet loader speed in items/min (observable only; not actuated) |
| `max_queue_size` | `integer` | `≥ 1` | Maximum inter-stage queue depth before blocking is triggered |

**Response `200 OK`**

```json
{
  "success": true,
  "updated": {
    "robot_speed": 6,
    "load_speed": 8,
    "pallet_speed": 12,
    "max_queue_size": 25
  }
}
```

---

### POST /robot/speed

Sets the robot speed to an arbitrary value. Speed changes take effect on the next self-timer cycle.

**Request**

```http
POST /robot/speed HTTP/1.1
Host: localhost:1880
Content-Type: application/json
```

```json
{
  "speed": 7
}
```

| Field | Type | Constraints | Description |
|---|---|---|---|
| `speed` | `float` | `[1, 20]` | New robot speed in items/min |

**Response `200 OK`**

```json
{
  "success": true,
  "robot_speed": 7
}
```

**Quality impact:** At speed 7 the sigmoid model yields approximately 96.6 % product quality. Higher values progressively reduce quality toward the 90 % floor at speed 20.

---

### POST /robot/speed/low

Preset shortcut. Sets the robot speed to **2 items/min**, maximising product quality (~98.7 %).

**Request**

```http
POST /robot/speed/low HTTP/1.1
Host: localhost:1880
```

No request body required.

**Response `200 OK`**

```json
{
  "success": true,
  "robot_speed": 2,
  "preset": "low"
}
```

---

### POST /robot/speed/high

Preset shortcut. Sets the robot speed to **18 items/min**, maximising throughput at the cost of quality (~90.4 %).

**Request**

```http
POST /robot/speed/high HTTP/1.1
Host: localhost:1880
```

No request body required.

**Response `200 OK`**

```json
{
  "success": true,
  "robot_speed": 18,
  "preset": "high"
}
```

---

### POST /load/speed

Sets the package loader speed. Controls the rate at which `PKG-XXXXX` items are generated and pushed into `q_load_out`.

**Request**

```http
POST /load/speed HTTP/1.1
Host: localhost:1880
Content-Type: application/json
```

```json
{
  "speed": 10
}
```

| Field | Type | Constraints | Description |
|---|---|---|---|
| `speed` | `float` | `[1, 20]` | New package loader speed in items/min |

**Response `200 OK`**

```json
{
  "success": true,
  "load_speed": 10
}
```

---


### POST /reset

Performs a full production line reset: clears all inter-stage queues, zeroes all counters and energy accumulators, resets all machine status strings to `"idle"`, unlocks all machines, and reinitialises the global configuration to default values. **This is a destructive operation.**

**Request**

```http
POST /reset HTTP/1.1
Host: localhost:1880
```

No request body required.

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Production line reset. All queues cleared, counters zeroed."
}
```

---

## Analysis

Endpoints for managing the quality threshold and resetting analysis state.


### GET /threshold

Returns the current quality threshold used by both the batch and full production quality analysers.

**Request**

```http
GET /threshold HTTP/1.1
Host: localhost:1880
```

**Response `200 OK`**

```json
{
  "threshold": 0.85
}
```

---

### POST /threshold

Updates the quality threshold and immediately re-triggers the ML inference call to refresh `ml_suggested_speed`.

**Request**

```http
POST /threshold HTTP/1.1
Host: localhost:1880
Content-Type: application/json
```

```json
{
  "threshold": 0.92
}
```

| Field | Type | Constraints | Description |
|---|---|---|---|
| `threshold` | `float` | `[0.0, 1.0]` | New quality threshold (fraction of good products required) |

**Response `200 OK`**

```json
{
  "success": true,
  "threshold": 0.92,
  "ml_suggested_speed": 3.8
}
```

**Response `400 Bad Request`** - value out of range

```json
{
  "success": false,
  "error": "Threshold must be a float in [0.0, 1.0]. Received: 1.4"
}
```

---

### POST /analysis/package/reset

Clears all package analysis state: resets the sliding window, zeroes the good and scrap counters, and clears the `package_analysis_initialized` flag so the next production event reinitialises the analyser from scratch.

**Request**

```http
POST /analysis/package/reset HTTP/1.1
Host: localhost:1880
```

No request body required.

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Package analysis state reset."
}
```

---

## Execute

Endpoints for controlling the automation toggle and reading operator-facing suggestions.



### GET /automate

Returns the current state of the automation flag.

**Request**

```http
GET /automate HTTP/1.1
Host: localhost:1880
```

**Response `200 OK`**

```json
{
  "automate": false
}
```

| Field | Type | Description |
|---|---|---|
| `automate` | `boolean` | `true` = closed-loop control active; `false` = suggestions only |

---

### POST /automate

Toggles the automation flag. When switched to `true`, the Execute flow begins forwarding planning decisions directly to the production line speed APIs. When switched to `false`, decisions are held as suggestions readable via `GET /suggestions`.

**Request**

```http
POST /automate HTTP/1.1
Host: localhost:1880
```

No request body required.

**Response `200 OK`**

```json
{
  "success": true,
  "automate": true
}
```

---

### GET /suggestions

Returns a human-readable suggestion string for the operator, derived from the latest planning decision. Only meaningful when automation is **off** (`automate: false`). Identical consecutive suggestions are deduplicated; if no new suggestion has arrived since the last call, the last stored one is returned.

**Request**

```http
GET /suggestions HTTP/1.1
Host: localhost:1880
```

**Response `200 OK` - actionable suggestion**

```json
{
  "suggestion": "Robot: decrease speed to 3.8 (reason: batch scrap rate exceeded threshold)\nPackage Loader: ok"
}
```

**Response `200 OK` - all systems nominal**

```json
{
  "suggestion": "All machines operating within target parameters."
}
```

| Field | Type | Description |
|---|---|---|
| `suggestion` | `string` | Per-machine action lines, newline-separated. Each line follows the pattern `<Machine>: <mode> [to <speed>] [(reason: <reason>)]` |

> **Note:** This endpoint is rate-limited to 20 requests/second at the Node-RED level. Excess requests are dropped.

---

## Internal

These endpoints are used for inter-flow communication within Node-RED. They are documented here for completeness and for integration testing purposes, but external systems should not rely on them directly.

---

### POST /planner

Receives a structured analysis result from the Analysis Flow and feeds it into the conflict resolution pipeline. The HTTP response is returned immediately before resolution completes (non-blocking).

**Request**

```http
POST /planner HTTP/1.1
Host: localhost:1880
Content-Type: application/json
```

```json
{
  "topic": "Batch QC",
  "suggestion": "Reduce robot speed to recover batch quality",
  "flag_decrease_robot": true,
  "flag_increase_robot": false,
  "flag_decrease_load": false,
  "flag_increase_load": false,
  "pass": false,
  "new_robot_speed": 3.8
}
```

| Field | Type | Description |
|---|---|---|
| `topic` | `string` | Analysis source identifier: `"Batch QC"`, `"Production QC"`, or `"Block Analysis"` |
| `suggestion` | `string` | Human-readable description of the detected condition |
| `flag_*` | `boolean` | Directional control flags per machine |
| `pass` | `boolean` | `true` if the analysis condition is within acceptable bounds (no action needed) |
| `new_robot_speed` | `float` | ML-suggested corrective speed, present when `flag_decrease_robot` is `true` |

**Response `200 OK`**

```json
{
  "success": true
}
```

---

### POST /execute

Receives a resolved planning decision from the Planning Flow and applies it - either by posting speed commands to the production line (when `automate: true`) or by storing it for `GET /suggestions` (when `automate: false`). The HTTP response is returned immediately.

**Request**

```http
POST /execute HTTP/1.1
Host: localhost:1880
Content-Type: application/json
```

```json
{
  "status": "not ok",
  "robot": {
    "mode": "decrease",
    "speed": 3.8,
    "reason": "Batch QC: scrap rate 0.19 exceeds threshold 0.15"
  },
  "package_loader": {
    "mode": "ok",
    "speed": null,
    "reason": "Within target parameters"
  },
  "pallet_loader": {
    "mode": "ok",
    "speed": null,
    "reason": "Uncontrollable - upstream supply"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `status` | `string` | `"ok"` or `"not ok"` |
| `*.mode` | `string` | `"increase"`, `"decrease"`, or `"ok"` |
| `*.speed` | `float \| null` | Target speed when mode is `increase` or `decrease`; `null` when `ok` |
| `*.reason` | `string` | Human-readable rationale from the conflict resolver |

**Response `200 OK`**

```json
{
  "success": true
}
```