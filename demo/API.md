# Node-RED Production Flow - API Reference

All endpoints are served by the Node-RED HTTP-in nodes on `localhost:1880` (default port). Every request and response body is `application/json`. Endpoints marked **internal** are used for inter-flow communication and are not intended for external callers.


## Table of Contents

- [Production Line](#production-line)
  - [GET /status](#get-status)
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
  "robot_status": "producing",
  "load_status": "producing",
  "pallet_status": "blocked",
  "camera_status": "producing",
  "smartwatch_status": "producing",
  "labeler_status": "producing",
  "q_load_out": 3,
  "q_pallet_out": 20,
  "q_robot_out": 7,
  "q_camera_out": 2,
  "q_watch_out": 1,
  "n_good": 142,
  "n_scrap": 18,
  "ready_packages": 340,
  "ready_pallets": 12,
  "robot_speed": 4,
  "load_speed": 5,
  "pallet_speed": 10,
  "total_energy_robot_kwh": 12.47,
  "total_energy_load_kwh": 3.22,
  "total_energy_pallet_kwh": 1.89
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