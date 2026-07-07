import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DigitalTwinComponent, DigitalTwinStreamEvent } from './digital-twin.component';
import { NodeRedService } from './nodered.service';
import { DecimalPipe } from '@angular/common';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [DigitalTwinComponent, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class App {
  @ViewChild(DigitalTwinComponent) private digitalTwin?: DigitalTwinComponent;
  private nodeRedService = inject(NodeRedService);

  public cameraLogs = this.nodeRedService.cameraLogs;
  public telemetry = this.nodeRedService.telemetry;
  public lineState = this.nodeRedService.lineState;
  public events = this.nodeRedService.events;
  public analysis = this.nodeRedService.analysis;
  public pickArea = this.nodeRedService.pickArea;
  public scrapArea = this.nodeRedService.scrapArea;
  public qualityThreshold = this.nodeRedService.qualityThreshold;
  public isAutopilotEnabled = this.nodeRedService.isAutopilotEnabled;

  public currentPage = signal<'dashboard' | 'marketplace'>('dashboard');
  public robotStyle = signal<'industrial' | 'modern' | 'stealth'>('industrial');
  public showTooltips = signal<boolean>(true);
  public currentTime = signal<string>(new Date().toLocaleTimeString('en-GB', { hour12: false }));

  public desiredSpeed = 5;
  public desiredPackageSpeed = 5;
  public desiredPalletSpeed = 5;
  public desiredThreshold = 0.85;

  private lastSyncedSpeed = 0;
  private lastSyncedPackageSpeed = 0;
  private lastSyncedPalletSpeed = 0;
  private lastSyncedThreshold = -1;

  public async resetLine(): Promise<void> {
    const ok = await this.nodeRedService.resetLine();
    if (!ok) return;
    this.digitalTwin?.resetLineScene();

    this.desiredSpeed = this.telemetry().speed || 5;
    this.desiredPackageSpeed = this.lineState().packageLoader.speed || 5;
    this.desiredPalletSpeed = this.lineState().palletLoader.speed || 5;

    this.lastEventAssemblerSpeed = null;
    this.lastEventBoxLoaderSpeed = null;
    this.lastEventPalletLoaderSpeed = null;
  }

  public partsPerHour = computed(() => Math.round(Math.max(0, Number(this.telemetry().speed ?? 0)) * 60));
  public cycleTimeSeconds = computed(() => {
    const speed = Math.max(0, Number(this.telemetry().speed ?? 0));
    return speed <= 0 ? 0 : Math.round((60 / speed) * 10) / 10;
  });
  public oeePercentage = computed(() => {
    const speed = Math.max(0, Number(this.telemetry().speed ?? 0));
    const availability = this.isProducing(this.telemetry().machineStatus) ? 1 : 0.75;
    const performance = Math.min(1, speed / 20);
    const nGood = Math.max(0, Number(this.nodeRedService.pickArea().nGood ?? 0));
    const nScrap = Math.max(0, Number(this.nodeRedService.scrapArea().nScrap ?? 0));
    const total = nGood + nScrap;
    const qualityPct = total > 0 ? (nGood / total) * 100 : 100;    
    const quality = Math.max(0, Math.min(1, qualityPct / 100));
    return Math.round(availability * performance * quality * 100);
  });
  private emitSpeedEventIfChanged(
    machine: string,
    previous: number | null,
    current: number,
    updatePrevious: (value: number) => void
  ): void {
    if (!Number.isFinite(current) || current <= 0) return;

    if (previous === null) {
      updatePrevious(current);
      return;
    }

    if (previous === current) return;

    const direction = current > previous ? '▲' : '▼';

    this.nodeRedService.addEvent({
      timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      type: 'INFO',
      message: `[SPEED] ${machine}: ${direction} ${previous} → ${current} items/min`
    });

    updatePrevious(current);
  }

  constructor() {
    effect(() => {
      const currentTelemetry = this.telemetry();
      const currentState = this.lineState();
      const currentThreshold = this.qualityThreshold();

      if (currentTelemetry.speed > 0 && currentTelemetry.speed !== this.lastSyncedSpeed) {
        this.desiredSpeed = currentTelemetry.speed;
        this.lastSyncedSpeed = currentTelemetry.speed;
      }
      if (currentState.packageLoader.speed && currentState.packageLoader.speed !== this.lastSyncedPackageSpeed) {
        this.desiredPackageSpeed = currentState.packageLoader.speed;
        this.lastSyncedPackageSpeed = currentState.packageLoader.speed;
      }
      if (currentState.palletLoader.speed && currentState.palletLoader.speed !== this.lastSyncedPalletSpeed) {
        this.desiredPalletSpeed = currentState.palletLoader.speed;
        this.lastSyncedPalletSpeed = currentState.palletLoader.speed;
      }
      if (currentThreshold !== this.lastSyncedThreshold) {
        this.desiredThreshold = currentThreshold;
        this.lastSyncedThreshold = currentThreshold;
      }
    }, { allowSignalWrites: true });

    effect(() => {
      const telemetry = this.telemetry();
      const state = this.lineState();

      const assemblerSpeed = Number(telemetry.speed ?? 0);
      const boxLoaderSpeed = Number(state.packageLoader.speed ?? 0);
      const palletLoaderSpeed = Number(state.palletLoader.speed ?? 0);

      this.emitSpeedEventIfChanged(
        'Assembler',
        this.lastEventAssemblerSpeed,
        assemblerSpeed,
        value => this.lastEventAssemblerSpeed = value
      );

      this.emitSpeedEventIfChanged(
        'Box Loader',
        this.lastEventBoxLoaderSpeed,
        boxLoaderSpeed,
        value => this.lastEventBoxLoaderSpeed = value
      );

      this.emitSpeedEventIfChanged(
        'Pallet Loader',
        this.lastEventPalletLoaderSpeed,
        palletLoaderSpeed,
        value => this.lastEventPalletLoaderSpeed = value
      );
    }, { allowSignalWrites: true });

    setInterval(() => this.currentTime.set(new Date().toLocaleTimeString('en-GB', { hour12: false })), 1000);
  }

  public setDesiredSpeed(event: Event) { this.desiredSpeed = this.clamp(Number((event.target as HTMLInputElement).value), 1, 20); }
  public setDesiredPackageSpeed(event: Event) { this.desiredPackageSpeed = this.clamp(Number((event.target as HTMLInputElement).value), 1, 20); }
  public setDesiredPalletSpeed(event: Event) { this.desiredPalletSpeed = this.clamp(Number((event.target as HTMLInputElement).value), 1, 20); }
  public setDesiredThreshold(event: Event) { this.desiredThreshold = this.clamp(Number((event.target as HTMLInputElement).value), 0, 1); }

  public applySpeed() { this.nodeRedService.setRobotSpeed(this.desiredSpeed); }
  public applyPackageSpeed() { this.nodeRedService.setPackageLoaderSpeed(this.desiredPackageSpeed); }
  public applyPalletSpeed() { this.nodeRedService.setPalletLoaderSpeed(this.desiredPalletSpeed); }
  public applyThreshold() { this.nodeRedService.setQualityThreshold(this.desiredThreshold); }
  public setSpeedLow() { this.nodeRedService.setRobotSpeedLow(); }
  public setSpeedHigh() { this.nodeRedService.setRobotSpeedHigh(); }
  public toggleAutopilot() { this.nodeRedService.toggleAutopilot(); }
  public toggleTooltips() { this.showTooltips.update(v => !v); }
  public onRobotStyleChange(event: Event) { this.robotStyle.set((event.target as HTMLSelectElement).value as 'industrial' | 'modern' | 'stealth'); }

  public zoomIn() { this.digitalTwin?.zoomIn(); }
  public zoomOut() { this.digitalTwin?.zoomOut(); }
  public resetView() { this.digitalTwin?.resetView(); }
  public toggleWireframe() { this.digitalTwin?.toggleWireframe(); }
  public panUp() { this.digitalTwin?.pan(0, -1.5); }
  public panDown() { this.digitalTwin?.pan(0, 1.5); }
  public panLeft() { this.digitalTwin?.pan(-1.5, 0); }
  public panRight() { this.digitalTwin?.pan(1.5, 0); }

  private lastEventAssemblerSpeed: number | null = null;
  private lastEventBoxLoaderSpeed: number | null = null;
  private lastEventPalletLoaderSpeed: number | null = null;

  public onDigitalTwinStreamEvent(event: DigitalTwinStreamEvent): void {
    const timestamp = new Date(event.ts || Date.now()).toLocaleTimeString('en-GB', { hour12: false });

    const eventType: 'INFO' | 'OK' | 'ERROR' | 'DEBUG' | 'SUGGESTION' =
      event.type === 'error'
        ? 'ERROR'
        : event.type === 'suggestion'
          ? 'SUGGESTION'
          : 'INFO';

    const prefix =
      event.type === 'speed'
        ? '[SPEED] '
        : event.type === 'package'
          ? '[PACKAGE] '
          : '';

    const message =
      prefix + (event.message || event.title || JSON.stringify(event.payload ?? event));

    this.nodeRedService.addEvent({
      timestamp,
      type: eventType,
      message
    });
  }

  public onAssetImported(event: unknown) {
    this.nodeRedService.addEvent({ timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }), type: 'INFO', message: `Asset import requested: ${JSON.stringify(event)}` });
  }

  private clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }
  private isProducing(status: string | null | undefined): boolean {
    const s = (status || '').toLowerCase();
    return s.includes('producing') || s.includes('running') || s.includes('busy') || s.includes('active');
  }
}
