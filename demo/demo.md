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
   git clone https://github.com/emiliocimino/autopilot.git
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

[INSERT IMAGE]

   - Click the **hamburger menu** (☰) in the top-right corner
   - Select **"Import"**
   - Choose **"select a file to import"**
   - Navigate to and select `nodered_example.json`
   - Click **"Import"**
   - Confirm the import by clicking **"Import"** again

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
Load Package + Load Pallet
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

[INSERT UI IMAGE]

The Node-RED flow simulates a smart industrial packaging line where packages and pallets move through multiple sequential processing stages connected by queues. The simulation starts with package and pallet loaders that periodically generate new items based on configurable production speeds while tracking energy consumption and machine status. A robot stage combines packages and pallets into packaged products, with production speed directly affecting product quality through a probabilistic quality model. The produced items then pass through three consecutive inspection stages - camera inspection, smartwatch inspection, and label verification - each capable of rejecting defective products and routing them to a scrap area. Successfully validated products are sent to the good area. During the process, the system continuously manages queue capacities, detects blocking and starvation conditions, automatically unlocks stalled machines, logs detailed event data for each operation, and maintains production KPIs such as good products, scrap count, energy usage, pallet utilization, and machine states, effectively behaving as a discrete-event digital twin of a real packaging production line.

---

#### Industrial Simulation Characteristics

The flow simulates realistic production phenomena:

| Feature             | Description                     |
| ------------------- | ------------------------------- |
| Blocking            | Downstream congestion           |
| Starvation          | Missing input materials         |
| Queueing            | Buffered production             |
| Energy consumption  | Dynamic machine power usage     |
| Quality degradation | Speed/quality tradeoff          |
| Scrap generation    | Multi-stage inspection failures |
| Timed operations    | Realistic machine cadence       |

---

#### Event Log Structure

Each production stage generates structured event logs used to trace product lifecycle, machine behavior, and production KPIs throughout the simulation. Every event contains identifiers, timestamps, execution duration, machine information, and stage-specific attributes such as quality checks, queue sizes, energy consumption, or processing speed. This structure enables process mining, monitoring, analytics, and digital twin synchronization across the entire simulated production line.

Event log structure example is described below:
```json
{
  "case_id": "...",
  "activity": "...",
  "machine": "...",
  "ts_start": "...",
  "ts_end": "...",
  "duration_ms": "...",
  "attributes": {"...": "..."} 
}
```
Attributes are "extension" of the Event Log structure and depends on the machinery details.

#### Stage 1.A: Pallet

The pallet loader continuously generates empty pallets required by the robot processing stage. Pallets are produced at configurable speeds and stored in an output queue until consumed by downstream operations. Pallet refiller is controlled by **upstream production** and hence cannot be controlled via UI

Important features:

* Uncontrollable pallet generation behavior
* Queue-based buffering
* Blocking detection when queues are full
* Energy consumption tracking
* Event Log production

#### Stage 1.B: Package

The package loader generates empty packages that will later be filled and processed by the robot. The production cadence depends on configurable machine speed parameters.

Important features:

* Dynamic package generation timing
* Queue-based package buffering
* Configurable production speed
* Blocking management
* Energy consumption calculation
* Event Log production

#### Stage 2: Robot

The robot consumes both packages and pallets to produce packaged products. Its operating speed directly affects the resulting product quality through a probabilistic quality model.

Important features:

* Simultaneous consumption of packages and pallets
* Product assembly simulation
* Quality degradation at higher speeds
* Queue synchronization
* Starvation and blocking detection
* Energy usage monitoring
* Production quality calculation
* Event Log production

#### Stage 3: Camera

The camera stage performs the first automated quality inspection on products generated by the robot. Products failing inspection are immediately routed to the scrap area.

Important features:

* Probabilistic quality validation
* Automatic scrap routing
* Queue consumption and forwarding
* Event Log production

#### Stage 4: Smartwatch

The smartwatch stage performs a second quality verification after the camera inspection. Only products passing this stage continue to the final labeling phase.

Important features:

* Probabilistic quality validation
* Automatic scrap routing
* Queue consumption and forwarding
* Event Log production

#### Stage 5: Labeler

The labeler applies and verifies the final product label before determining whether the product is classified as good or scrap.

Important features:

* Probabilistic quality validation
* Automatic scrap routing
* Queue consumption and forwarding
* Event Log production

#### Stage 6.A: Good

The good area stores products that successfully pass all production and inspection stages.

Important features:

* Final storage for accepted products
* Good product counting
* Complete product trace preservation
* Final production event generation
* KPI tracking

#### Stage 6.B: Bad

The scrap area collects all rejected products generated by inspection or verification failures throughout the production line.

Important features:

* Scrap product collection
* Scrap reason tracking
* Rejection statistics
* Failure traceability
* Final scrap event generation
* Production quality monitoring

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

