# 3D Digital Twin Simulator UI

This folder contains the graphical interface for the **3D Digital Twin simulator** of a packaging / production line.  
The UI is designed to visualize the real-time state of the line, monitor quality checks, interact with the simulator controls, and switch between a 3D Digital Twin view and a 2D line-monitor view.

## Overview

The simulator interface is built as an Angular standalone UI and includes:

- a **3D Digital Twin dashboard** based on an embedded `app-digital-twin` component;
- a **2D simulator view** embedded inside the dashboard through an iframe;
- an **Asset Marketplace** page;
- a **fullscreen Event Log** page;
- real-time KPI cards for line performance;
- control panels for robot speed, loader speed, quality threshold, robot profile, and line reset;
- event streams and camera / quality-monitoring logs.

The interface is intended to work together with a backend service, such as Node-RED, that provides telemetry, line status, quality events, suggestions, and control endpoints.

---

## Main UI Areas

### 1. Left Sidebar Navigation

The left sidebar provides the main navigation between the available UI sections.

| Icon | Section | Description |
|---|---|---|
| Dashboard icon | **Digital Twin Dashboard** | Opens the main 3D / 2D simulator dashboard. |
| Gear icon | **Asset Marketplace** | Opens the marketplace section used for importing or managing assets. |
| List icon | **Event Log Fullscreen** | Opens a fullscreen event log view with all runtime events. |

The active section is highlighted using a blue / indigo visual state.

---

### 2. Top Navigation Bar

The top bar displays contextual information about the current view and the simulated line.

It includes:

- current page title;
- Autopilot status;
- Autopilot toggle;
- 3D / 2D view switch;
- location information;
- asset identifier;
- current date and time.

The title changes depending on the selected navigation page:

- `Digital Twin Dashboard`
- `Asset Marketplace`
- `Event Log Fullscreen`

---

## Dashboard View

The dashboard is the core view of the simulator. It contains the 3D Digital Twin viewport, KPI overlays, control panels, monitoring panels, and the bottom event stream.

### 3D / 2D Switch

The dashboard includes a **View 3D / 2D** switch.

- **3D mode** shows the interactive 3D Digital Twin scene.
- **2D mode** shows the embedded 2D packaging line monitor.

The switch is implemented directly in the Angular template using a template reference variable, without requiring additional TypeScript state.

---

## 3D Digital Twin View

The 3D viewport is rendered through the Angular component:

```html
<app-digital-twin
  [robotStyle]="robotStyle()"
  [showTooltips]="showTooltips()"
  (streamEvent)="onDigitalTwinStreamEvent($event)">
</app-digital-twin>
```

The 3D view is used to visualize the production line and interact with the simulated scene.

### 3D View Controls

The dashboard includes viewport controls for:

- pan up;
- pan down;
- pan left;
- pan right;
- zoom in;
- zoom out;
- reset view;
- toggle wireframe;
- show / hide tooltips;
- reset line.

These controls call methods exposed by the root Angular component, which delegates 3D-specific operations to the `DigitalTwinComponent` through `@ViewChild`.

---

## KPI Cards

The upper-left dashboard overlay displays real-time KPI cards.

### OEE

Displays the current Overall Equipment Effectiveness percentage.

The value is calculated from:

- machine availability;
- line speed performance;
- quality ratio between good and scrapped items.

### Parts per Hour

Displays the estimated production throughput based on the current robot speed.

### Cycle Time

Displays the calculated cycle time in seconds.

### Power

Displays the current power consumption in kW.

If telemetry power is unavailable, a fallback value is shown.

---

## Right-Side Monitoring and Control Panels

The right side of the dashboard contains operational panels for line monitoring and control.

### Pick Area

Shows information about the last good package and the total number of good items.

### Scrap Area

Shows information about the last scrapped package, the total number of scrapped items, and the scrap reason.

### Packaging Line Monitor

Displays camera / inspection logs in a compact table.

Logged stations include:

- Verification Camera;
- Smartwatch Inspection;
- Labeler;
- Overflow.

Each log row includes:

- station name;
- package ID;
- inspection status.

### Loaders

Shows the status of upstream loading devices:

- Box Loader;
- Pallet Loader.

The Box Loader panel also includes a speed slider and an Apply button, disabled when Autopilot is enabled.

### Assembly Robot

Displays robot-related telemetry and controls:

- machine status;
- current robot speed;
- suggested robot speed;
- power consumption;
- quality estimate;
- analysis message;
- manual robot speed control.

### Quality Threshold

Allows the operator to adjust the quality threshold used by the simulation logic.

### Robot Profile

Allows switching the 3D robot style between:

- `industrial` — Industrial Heavy, red visual style;
- `modern` — Modern Sleek, white / cyan style;
- `stealth` — Stealth Precision, dark / amber style.

---

## Bottom Event Stream

The bottom section of the dashboard displays a compact event stream.

Each event contains:

- timestamp;
- event type;
- message.

Supported event types include:

- `INFO`
- `OK`
- `ERROR`
- `DEBUG`
- `SUGGESTION`

Event types are color-coded to improve readability.

---

## Event Log Fullscreen

The third sidebar icon opens the fullscreen Event Log view.

This page is designed for a larger, more readable view of all runtime events generated by the simulator and backend integration.

The fullscreen log includes:

- timestamp column;
- type column;
- message column;
- total event count;
- close button to return to the dashboard.

The view is activated by setting:

```ts
currentPage.set('eventlog')
```

For this reason, the root component must allow `eventlog` as a valid page value:

```ts
public currentPage = signal<'dashboard' | 'marketplace' | 'eventlog'>('dashboard');
```

---

## Asset Marketplace

The Asset Marketplace page is rendered through:

```html
<app-marketplace
  class="w-full h-full"
  (importRequest)="onAssetImported($event)">
</app-marketplace>
```

The root Angular component must import the marketplace component when using Angular standalone components.

Example:

```ts
imports: [DigitalTwinComponent, MarketplaceComponent, DecimalPipe]
```

---

## Autopilot Mode

The UI includes an Autopilot toggle in the top bar.

When Autopilot is enabled:

- manual speed controls are disabled;
- line decisions are expected to be driven by backend logic;
- the UI reflects the Autopilot state visually.

The UI uses the `isAutopilotEnabled()` signal from the Node-RED service.

---

## Backend Integration

The frontend is designed to consume data from a service layer, typically connected to Node-RED.

Main data sources include:

- telemetry;
- line state;
- camera logs;
- event stream;
- analysis / suggestions;
- pick area statistics;
- scrap area statistics;
- quality threshold;
- Autopilot state.

The Angular root component exposes these values from the injected service:

```ts
public cameraLogs = this.nodeRedService.cameraLogs;
public telemetry = this.nodeRedService.telemetry;
public lineState = this.nodeRedService.lineState;
public events = this.nodeRedService.events;
public analysis = this.nodeRedService.analysis;
public pickArea = this.nodeRedService.pickArea;
public scrapArea = this.nodeRedService.scrapArea;
public qualityThreshold = this.nodeRedService.qualityThreshold;
public isAutopilotEnabled = this.nodeRedService.isAutopilotEnabled;
```

---

## Expected Project Structure

A typical Angular source structure is:

```text
src/
└── app/
    ├── app.html
    ├── app.ts
    ├── app.css
    ├── digital-twin.component.ts
    ├── marketplace.component.ts
    └── nodered.service.ts
```

---

## Required Angular Component Setup

The root component should include the required standalone imports.

Example:

```ts
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [DigitalTwinComponent, MarketplaceComponent, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class App {
  public currentPage = signal<'dashboard' | 'marketplace' | 'eventlog'>('dashboard');
}
```

---

## Running the UI

Install dependencies:

```bash
npm install
```

Run the Angular development server:

```bash
ng serve
```

Then open the local Angular development URL shown by the CLI, typically:

```text
http://localhost:4200
```

---

## Notes for GitHub

Before committing this UI to GitHub, make sure that:

- `app.html` includes the latest dashboard, 2D switch, marketplace, and fullscreen event log sections;
- `app.ts` includes `eventlog` in the `currentPage` signal type;
- `MarketplaceComponent` is imported if `<app-marketplace>` is used;
- backend URLs and credentials are not hardcoded in committed files unless intended;
- environment-specific settings are moved to Angular environment files or runtime configuration.

---

## Suggested Commit Message

```bash
git add demo/3d-visualizer/src/app/app.html demo/3d-visualizer/src/app/app.ts README.md
git commit -m "Add 3D Digital Twin UI documentation and event log view"
```

---

## License

Add the project license here, or refer to the main repository license if this simulator is part of a larger project.
