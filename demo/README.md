# AutoPilot Demo Guide

## Overview of the MAPE-K Loop

The AutoPilot system implements a **MAPE-K (Monitor, Analyze, Plan, Execute, Knowledge)** control loop for autonomous 
Industrial IoT operations. This architecture enables continuous, intelligent decision-making 
across complex manufacturing environments.

The idea behind of the quick-demo is to show how even a simplified packaging line exhibits 
complexities that require autonomous orchestration. In this case, the packaging line is 
composed of a robot palletizer, a camera inspection system, and a smartwatch inspection system. 
The human operator have to understand the trade-off between higher production throughput and 
lower quality, as well as the need to balance the production with the available resources to avoid system
blocking or starving conditions that causes production downtime and high energy costs.

The use case is built to showcase the following Autopilot Capabilities:
- Orchestration
- Integration with external ML systems
- Integrated Rule-Based analysis
- HITL (Human-in-the-Loop) and Automation


### **Quick Demo: Simulation + Analysis + Plan + Execute Flow**

The demo showcases a complete smart factory scenario where:
1. **Production Line Simulation** generates realistic packaging line data
2. **Analysis Flow** analyzes data for quality control and bottlenecks in the production line
3. **Planning** determines optimal operational strategies
4. **Execute** coordinates autonomous equipment and logistics systems

---

## Running the Demo with Docker Compose

### **Prerequisites**
- Docker and Docker Compose installed
- Node-RED compatible browser (Chrome, Firefox, Safari)

### **Setup Instructions**

1. **Clone the repository and navigate to the demo directory:**
   ```bash
   git clone https://github.com/Engineering-Research-and-Development/autopilot.git
   cd autopilot/demo
   ```

2. **Start the services with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

   This will launch:
   - **Node-RED** on port `1880` (UI and flow editor)
   - **Speed Prediction Service** on port `8010` (ML microservice)

3. **Access Node-RED:**
   - Open your browser and navigate to: `http://localhost:1880`
   - You'll see the Node-RED flow editor interface

4. **Import the Demo Flow:**

   - Click the **hamburger menu** (☰) in the top-right corner
   - Select **"Import"**
   - Choose **"select a file to import"**
   - Navigate to and select `nodered_example.json`
   - Click **"Import"**
   - Confirm the import by clicking **"Import"** again

Follow this [GUIDE](https://nodered.org/docs/user-guide/editor/workspace/import-export#importing-flows) for more details.

5. **Access the Dashboard UI:**
   - Navigate directly to: `http://localhost:1880/autopilot/ui`
   - This opens the AutoPilot Smart Factory Dashboard

### **Service Architecture**

```
┌─────────────────┐    ┌──────────────────┐
│   Node-RED      │    │  Speed Prediction│
│   (Port 1880)   │◄──►│  Service (8010)  │
│                 │    │                  │
│ • Flow Editor   │    │ • ML Inference   │
│ • Dashboard UI  │    │ • REST API       │
│ • MAPE-K Logic  │    │                  │
└─────────────────┘    └──────────────────┘
         │                       │
         └───────────────────────┘
                Docker Network
```

---

## Demo Details

### General Structure

The flow is divided into several Node-RED tabs:

| Tab               | Purpose                                   |
| ----------------- | ----------------------------------------- |
| `Production Line` | Main simulation of the packaging line     |
| `Analysis Flow`   | Intended for analytics or post-processing |
| `Planning`        | Planning and orchestration logic          |
| `Execute`         | Execution-related automation              |
| `Status`          | Monitoring and status tracking            |

The system also includes:

* A configuration section (do not edit for quick start)
* A dashboard UI configuration
* Apache Pulsar messaging configuration
* Multiple timers and watchdogs

### **Production Line Simulation**

The core of the flow simulates a manufacturing pipeline.

The stages are:

```text
Load Package / Load Pallet
    ↓
Robot Processing
    ↓
Camera Inspection
    ↓
Smartwatch Inspection
    ↓
Labeler
    ↓
Good Area / Scrap Area
```

The Node-RED flow simulates a smart industrial packaging line where packages and pallets move through multiple sequential processing stages connected by queues. The simulation starts with package and pallet loaders that periodically generate new items based on configurable production speeds while tracking energy consumption and machine status. A robot stage combines packages and pallets into packaged products, with production speed directly affecting product quality through a probabilistic quality model. The produced items then pass through three consecutive inspection stages - camera inspection, smartwatch inspection, and label verification - each capable of rejecting defective products and routing them to a scrap area. Successfully validated products are sent to the good area. During the process, the system continuously manages queue capacities, detects blocking and starvation conditions, automatically unlocks stalled machines, logs detailed event data for each operation, and maintains production KPIs such as good products, scrap count, energy usage, pallet utilization, and machine states, effectively behaving as a discrete-event digital twin of a real packaging production line.


<img width="2487" height="1373" alt="image" src="https://github.com/user-attachments/assets/eeb48860-3c5b-45ff-996d-071e07266e63" />

---


#### Industrial Simulation Characteristics

The flow simulates realistic production phenomena:

| Feature             | Description                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| Blocking            | Downstream congestion locks a machine when its output queue reaches `max_queue_size` |
| Starvation          | Robot halts when either the package or pallet input queue is empty          |
| Queueing            | Five inter-stage queues buffer production between machines                  |
| Energy consumption  | Each machine computes power and energy per cycle using an exponential model |
| Quality degradation | Robot quality follows a sigmoid function: higher speed lowers quality       |
| Scrap generation    | Any of three probabilistic inspection stages can route a product to scrap   |
| Timed operations    | Each machine self-schedules via a configurable speed parameter (items/min)  |

---

#### Event Log Structure

Each production stage generates structured event logs used to trace product lifecycle, machine behavior, and production KPIs throughout the simulation. Every event contains identifiers, timestamps, execution duration, machine information, and stage-specific attributes such as quality checks, queue sizes, energy consumption, or processing speed. This structure enables process mining, monitoring, analytics, and digital twin synchronization across the entire simulated production line.

All events are published to an Apache Pulsar broker through a shared pipeline: each machine emits a message carrying `msg.eventLog` and `msg.topic`, which are picked up by a central link-in node (`Pulsar IN`), formatted by `📤 Format & Route Pulsar Payload` into a versioned envelope (`schema_version: "1.0"`), and then routed by a topic-switch node to eight dedicated Pulsar producers (`persistent://public/default/<topic>`).

Event log structure example:
```json
{
  "case_id": "PKG-00042",
  "activity": "Robot Processing",
  "machine": "Robot",
  "ts_start": "2025-01-01T10:00:00.000Z",
  "ts_end": "2025-01-01T10:00:15.000Z",
  "duration_ms": 15000,
  "attributes": {
    "robot_speed": 4,
    "machine_status": "producing",
    "produced_quality_pct": 96.12,
    "power_kw": 1.42,
    "energy_kwh": 0.00591,
    "total_energy_robot_kwh": 0.847
  }
}
```

The `attributes` object is an extension of the event log structure and varies by stage: loaders include speed, remaining stock, and energy; the robot adds quality percentage, pallet ID, and queue depths; inspection stages record the binary `quality_ok` outcome; terminal areas record cumulative counts and scrap reasons.

---

#### Global Initialization & Watchdog

On deploy, an inject node (`▶ Init on Deploy`) fires once after a 0.5 s delay and triggers `🔧 Global Config & Init`. This function, guarded by an `initialized` flag, sets up all shared state in one pass: five inter-stage queues (`q_load_out`, `q_pallet_out`, `q_robot_out`, `q_camera_out`, `q_watch_out`), six machine status strings (all `"idle"`), six boolean locks (all `false`), starvation and block timestamps, production counters (`package_counter`, `pallet_counter`, `n_good`, `n_scrap`), and the global configuration object with default speeds (`load_speed: 5`, `pallet_speed: 10`, `robot_speed: 4`), `max_queue_size: 20`, and `ready_packages: 500`.

A separate `⏱ Watchdog (3s)` inject runs every 3 seconds and feeds `🔓 Auto-Unlock Watchdog`, which checks each locked machine's output queue against `max_queue_size`. Any machine whose queue has drained below the threshold is automatically unlocked and its block timestamp cleared, preventing indefinite deadlocks without operator intervention.



#### Stage 1.A: Pallet

The pallet loader continuously generates empty pallets required by the robot processing stage. A self-timer function (`⏱ Pallet Self-Timer`) reads `pallet_speed` from the global config on every cycle and computes the interval as `60 000 / pallet_speed` ms, then awaits it before firing. This means speed changes posted via API take effect on the next cycle boundary without redeploying. The timer loop is maintained through a link out/in pair (`pallet_timeout` → `pallet_timein`).

The core logic node (`🪤 Load Pallets Logic`) runs on every timer tick and proceeds through the following checks in order: if `lock_loadpallet` is already set, it emits a blocked event and returns; if `q_pallet_out` has reached `max_queue_size`, it sets the lock and emits a blocked event; if `ready_pallets` is zero or below, it emits a starving event. When all checks pass, it creates a new pallet record with a sequential ID (`PLT-XXXXX`), appends it to `q_pallet_out`, and emits a producing event. Energy per cycle is calculated with an exponential power model (1.0 kW at speed 1, scaling to 3.0 kW at speed 20) and accumulated in `energy_pallet_kwh`. The pallet refiller is controlled by upstream logistics and **cannot be adjusted via the UI or APIs**; only its status is observable.

Event log topic: `load-pallets`. Key attributes: `pallet_speed`, `ready_pallets`, `machine_status`, `power_kw`, `energy_kwh`, `total_energy_pallet_kwh`.



#### Stage 1.B: Package

The package loader generates empty packages that will later be combined with pallets by the robot. It follows the same self-timer pattern as the pallet loader: `⏱ Load Self-Timer` reads `load_speed` from config, waits `60 000 / load_speed` ms, triggers `📦 Load Package Logic`, then re-loops via the `package_timeout` / `package_timein` link pair.

The logic node applies the same blocking and starvation guards as Stage 1.A. When producing, it creates a package record with a sequential ID (`PKG-XXXXX`), records `ts_created` and `ts_load_done`, and appends it to `q_load_out`. The global `ready_packages` counter is decremented on each successful cycle and is refillable via `POST /packages/refill`. Energy follows the same exponential model as the pallet loader (1.0–3.0 kW range). The load speed is configurable at runtime via `POST /load/speed` with values between 1 and 20.

Event log topic: `load-package`. Key attributes: `remaining_packages`, `charger_speed`, `machine_status`, `power_kw`, `energy_kwh`, `total_energy_load_kwh`.



#### Stage 2: Robot

The robot is the central assembly stage. It consumes one package from `q_load_out` and one pallet from `q_pallet_out` simultaneously to produce a packaged product. Its self-timer (`⏱ Robot Self-Timer`) reads `robot_speed` and loops via `robot_timeout` / `robot_timein`.

The logic node (`🤖 Robot Logic`) first checks the output lock and queue ceiling, then checks for starvation — it distinguishes three starvation reasons: `no_packages`, `no_pallets`, and `no_packages_no_pallets`. When both inputs are available, it pops one item from each queue, computes a quality percentage using a sigmoid model, and pushes the enriched package to `q_robot_out`.

The quality model is: `quality = 0.90 + (0.99 − 0.90) / (1 + exp(0.3 × (speed − 10)))`. This yields approximately 98.7 % at speed 1, 94.5 % at the midpoint of speed 10, and 90.3 % at speed 20 — making robot speed the primary quality lever across the entire production line. Energy range is wider than the loaders: 1.0 kW at speed 1 scaling to 10.0 kW at speed 20. Speed presets are available via `POST /robot/speed/low` (speed 2, high quality) and `POST /robot/speed/high` (speed 18, low quality), in addition to `POST /robot/speed` for arbitrary values.

Event log topic: `robot`. Key attributes: `robot_speed`, `machine_status`, `produced_quality_pct`, `pallet_id`, `ready_pallets`, `ready_packages`, `prepared_packages`, `power_kw`, `energy_kwh`, `total_energy_robot_kwh`.



#### Stage 3: Camera

The camera performs the first automated quality inspection. It is triggered by a fixed 5-second ticker (rather than a self-timer) and processes one item per tick from `q_robot_out`. Processing duration is fixed at 1 000 ms, with a 1 000 ms propagation delay added after `ts_robot_done` to model physical transit time.

The quality gate is probabilistic: `Math.random() < (pkg.robot_quality_pct / 100)`. A product whose robot quality is 96 % therefore has a 96 % chance of passing. Products that fail are routed immediately to the Scrap Area with `scrap_reason: "camera_quality_fail"` and `loaded_pallets` is decremented. Products that pass are appended to `q_camera_out` for Stage 4. The node has three outputs: passing event, scrap event, and status.

Event log topic: `camera`. Key attributes: `quality_ok`.


#### Stage 4: Smartwatch

The smartwatch performs a second, independent quality verification on products that passed the camera. It operates on the same 5-second ticker and fixed 1 000 ms processing duration, with a 1 000 ms delay after `ts_camera_done`. It consumes from `q_camera_out` and applies the identical probabilistic quality gate, using the same `robot_quality_pct` value stamped by Stage 2.

Products failing here are routed to the Scrap Area with `scrap_reason: "smartwatch_quality_fail"` and `loaded_pallets` is decremented. Passing products are pushed to `q_watch_out`. Because both Camera and Smartwatch use the same quality probability, a product with quality 90 % has only a `0.90 × 0.90 = 81 %` chance of clearing both stages, amplifying the effect of robot speed on effective yield.

Event log topic: `smartwatch`. Key attributes: `quality_ok`.


#### Stage 5: Labeler

The labeler applies and verifies the final product label. It operates on a 5-second ticker, fixed 1 000 ms processing duration, and a 1 000 ms delay after `ts_watch_done`. It consumes from `q_watch_out` and applies the same probabilistic quality gate.

Regardless of outcome, `loaded_pallets` is decremented here (freeing the pallet slot), which does not happen at earlier scrap points for the labeler path. Products that pass have `outcome: "good"` set and `n_good` incremented; they are forwarded to Stage 6.A. Products that fail have `outcome: "scrap"` and `scrap_reason: "label_verify_fail"` set and `n_scrap` incremented; they are routed to Stage 6.B. The node has four outputs: event log, good product, scrap product, and status.

Event log topic: `labeler`. Key attributes: `quality_ok`, `outcome`.


#### Stage 6.A: Good

The Good Area (`✅ Good Area`) is the terminal stage for accepted products. It calculates a final timestamp 1 000 ms after `ts_label_done`, emits a zero-duration event log entry (`activity: "Pick Area"`, `machine: "GoodArea"`), and records the current `n_good` count. The full package object — carrying every timestamp, quality flag, speed value, and energy figure accumulated across all previous stages — is preserved in the `full_package` field of the status message, enabling complete end-to-end product traceability.

Event log topic: `pick-area`. Key attributes: `n_good`, `outcome: "good"`.



#### Stage 6.B: Scrap

The Scrap Area (`🗑️ Scrap Area`) collects rejected products from any of the three inspection stages. Because a product may be rejected at Camera (no `ts_watch_done` or `ts_label_done`), Smartwatch (no `ts_label_done`), or Labeler, the function determines the correct base timestamp by checking `ts_label_done` → `ts_watch_done` → `ts_camera_done` in order. A 1 000 ms propagation delay is added, and a zero-duration event is emitted (`activity: "Scrap Area"`, `machine: "ScrapArea"`). The `scrap_reason` field preserves the specific failure point (`camera_quality_fail`, `smartwatch_quality_fail`, or `label_verify_fail`), supporting failure traceability and root-cause analysis across the multi-stage inspection pipeline.

Event log topic: `scrap-area`. Key attributes: `n_scrap`, `scrap_reason`, `outcome: "scrap"`.

---


### Analysis Flow

The **Analysis Flow** is responsible for monitoring production quality and machine 
behaviour, then forwarding structured suggestions to the Planning stage.

#### Quality Threshold API

Two HTTP endpoints expose threshold management: `GET /threshold` 
returns the current global threshold value; `POST /threshold` 
validates the incoming value (must be in `[0.0, 1.0]`), writes it to the global store,
and re-triggers the ML speed inference to keep `ml_suggested_speed` in sync.


**Use of the Knowledge**:

The ML-based service is built to challenge the ML-service, meaning that the speed-quality
function is "observed" by sampling the production, rather than using the robot itself.
For this reason, the Analysis Flow produces the ML dataset used to train the speed-prediction service.
Packages arriving from both Good and Scrap Area links are sampled and properties such
`package_id`, `robot_speed`, and a binary `is_good` flag are extracted.
A CSV encoder writes each record to `/data/ml_dataframe.csv` in append mode. 
A manual inject + file-in combination allows the dataset to be read back for inspection.


#### Quality Analysis — Batch and Full Production

Two link-in nodes receive finished packages from both the Good Area and the Scrap Area
of the Production Line flow. Each package is simultaneously fed to two analysis
functions that run in parallel:

`count good/scrap batch` maintains a sliding window of the last
`n_package_to_evaluate` packages. Once the window is full it computes the good
ratio over the window; if below threshold it emits a suggestion payload
with `reduce_speed: true` and a human-readable message referencing
`ml_suggested_speed`. The result is formatted by `format_result` and passed on.

`count good/scrap full` accumulates totals since the last reset.
After 100 packages it computes the global good ratio;
below threshold it emits a similar suggestion payload.
Both paths converge at `format_result`, which normalises the output 
into a unified shape 
(`suggestion`, `flag_decrease_robot`, `pass`, `topic`, `new_robot_speed`). 
A rate-limiting delay node (1 msg/s, drop excess) then forwards the 
result to `post /planner`.

#### Block / Starvation Trend Analysis

A link-in node receives real-time status messages from three machines: 
Robot, LoadPackage, and LoadPallets (from the Production Line status links).
These statuses are stored in flow-scope variables. 
The main logic function `Block_Trend_Analysis_v2` evaluates up to 16 distinct
cases across the combinations of `robot_status` (starving / blocked / producing),
`pack_status`, and `pallet_status`, and computes recommended speed changes
with flags (`flag_increase_robot`, `flag_decrease_robot`, `flag_increase_load`,
`flag_decrease_load`) and numerical targets. 
A rate-limiting delay node (1 msg/s, drop) guards the output, 
which is sent to `post /planner`.


---

### Planning Flow

The **Planning Flow**  aggregates multiple concurrent analysis 
signals into a single, conflict-resolved decision, then forwards it to the Execute flow.

#### HTTP Entry Point and Acknowledgement

The `POST /planner` endpoint is the single entry point for all 
analysis outputs. On receiving a request, the node immediately 
branches in two: `answer http` replies with `{"success": true}` 
to the caller without waiting, while the main processing chain 
continues asynchronously. This prevents the Analysis flow from blocking 
while planning resolves conflicts.

#### Conflict Map Assembly

`prepare_conflict_map` stores every incoming 
analysis payload in a context-scoped map keyed by `msg.payload.topic` 
(e.g. `"Batch QC"`, `"Block Analysis"`, `"Production QC"`). The entire map 
is serialised to JSON and passed downstream, ensuring the resolver always sees 
the latest state of every analysis dimension simultaneously.

#### Rule-Based Conflict Resolution

`resolve_conflict` implements a deterministic priority-ordered resolver 
**(priority: Production QC → Batch QC → Block Analysis)**. 
For each section in priority order, if `pass === true` the section is skipped entirely.
For failing sections, each controllable machine (`robot`, `package_loader`) 
is assigned an `increase` or `decrease` decision based on the corresponding flags; 
the `pallet_loader` is always assigned `mode: "ok"` since it is not controllable. 
Higher-priority decisions are never overwritten by lower-priority ones. 
Processing stops as soon as any controllable machine receives an actionable 
(`increase` / `decrease`) decision. The resolved output is an object with 
`status` (`"ok"` or `"not ok"`) and per-machine entries containing `mode`, 
`speed`, and `reason`.


#### Forwarding to Execute

The output of `resolve_conflict` is posted to `POST /execute` on the local Node-RED instance.

---

### Execute Flow

The **Execute Flow** (is the actuation layer. It receives planning decisions, manages the automation toggle, 
and either applies speed changes automatically or exposes suggestions for human operators.


#### Automation Toggle API

`GET /automate` returns the current value of the global `automate` flag. `POST /automate` toggles it 
(true → false or false → true) and responds with the new state.

#### Execution Entry Point

`POST /execute` is the main entry point. On arrival the HTTP response is sent immediately. 
The payload then enters `suggest`, which compares the new suggestion against the last stored one 
(`flow.last_suggestion`); if identical it silently returns null (deduplication). 
New suggestions are stored in `flow.last_suggestion` and forwarded.

#### Routing

A delay node (1 msg/s, drop) throttles suggestion processing to avoid information flow.
Each message is then split into two branches:

- `automate` checks whether automation is enabled; if not it returns null. If enabled, it calls `convertToAction`, 
which iterates over the machine entries and extracts `{topic, payload: {speed}}` action objects for all 
machines with mode `increase` or `decrease`. The resulting array is passed to a `split` node, which emits one message
per action. 
- `adjust` restructures each split item so that `msg.payload` is the speed object and `msg.topic` 
is the machine name. A switch node routes by topic: `robot` → `POST /robot/speed`; `package_loader` → `POST /load/speed`. 
Both HTTP requests target the Production Line interaction APIs, completing the closed-loop control.

