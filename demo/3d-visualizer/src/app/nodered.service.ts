import { Injectable, signal, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface CameraData { cameraId: string; packageId: string; status: string; }
export interface PickAreaState { caseId: string | null; nGood: number; }
export interface ScrapAreaState { caseId: string | null; nScrap: number; scrapReason: string | null; }

export interface Telemetry {
  speed: number;
  power: number;
  machineStatus: string;
  qualityPct?: number | null;
  caseId?: string | null;
}

export interface NodeRedEvent {
  timestamp: string;
  type: 'INFO' | 'OK' | 'ERROR' | 'DEBUG' | 'SUGGESTION';
  message: string;
}

export interface StationState { caseId: string | null; ok: boolean | null; }
export interface LoaderState { caseId: string | null; status: string | null; speed: number | null; readyCount: number | null; power: number | null; }

export interface LineState {
  camera: StationState;
  smartwatch: StationState;
  labeler: StationState;
  packageLoader: LoaderState;
  palletLoader: LoaderState;
  maxQueueSize: number | null;
}

export interface LineAnalysis {
  currentRobotSpeed: number;
  currentQualityPct: number | null;
  suggestedRobotSpeed: number | null;
  status: 'OK' | 'WARN' | 'ERROR';
  message: string;
}

export interface ConveyorItem {
  caseId: string;
  packageId?: string | null;
  palletId?: string | null;
  type: 'box' | 'pallet' | 'assembled';
  queue: string;
  stage: string;
  index: number;
  tsCreated?: string | null;
  tsLoadDone?: string | null;
  tsRobotStart?: string | null;
  tsRobotDone?: string | null;
  tsCameraStart?: string | null;
  tsCameraDone?: string | null;
  tsWatchStart?: string | null;
  tsWatchDone?: string | null;
  tsLabelStart?: string | null;
  tsLabelDone?: string | null;
  chargerSpeed?: number | null;
  palletSpeed?: number | null;
  machineStatus?: string | null;
  robotQualityPct?: number | null;
  cameraQualityOk?: boolean | null;
  watchQualityOk?: boolean | null;
  labelQualityOk?: boolean | null;
  outcome?: string | null;
  scrapReason?: string | null;
  source?: 'queue' | 'event' | 'line_status' | string;
}

export interface ConveyorSnapshot {
  boxFeed: ConveyorItem[];
  palletFeed: ConveyorItem[];
  assembledOutput: ConveyorItem[];
  ts?: string | null;
  maxQueueSize?: number | null;
}

export interface ConfigPayload {
  robot_speed?: number;
  load_speed?: number;
  pallet_speed?: number;
  max_queue_size?: number;
}

interface SpeedResponse {
  success: boolean;
  robot_speed?: number;
  load_speed?: number;
  pallet_speed?: number;
  automate?: boolean;
}
interface ResetResponse {
  success: boolean;
  message?: string;
  ts?: string;
}

@Injectable({ providedIn: 'root' })
export class NodeRedService {
    //private baseUrl = 'http://localhost:1880';
  private baseUrl = 'https://nodered.sicuro.duckdns.org';

  public telemetry = signal<Telemetry>({ speed: 5, power: 0, machineStatus: 'Unknown', qualityPct: null, caseId: null });
  public events = signal<NodeRedEvent[]>([]);
  public cameraLogs = signal<CameraData[]>([]);
  public pickArea = signal<PickAreaState>({ caseId: null, nGood: 0 });
  public scrapArea = signal<ScrapAreaState>({ caseId: null, nScrap: 0, scrapReason: null });
  public conveyorSnapshot = signal<ConveyorSnapshot>({ boxFeed: [], palletFeed: [], assembledOutput: [], ts: null, maxQueueSize: null });

  public lineState = signal<LineState>({
    camera: { caseId: null, ok: null },
    smartwatch: { caseId: null, ok: null },
    labeler: { caseId: null, ok: null },
    packageLoader: { caseId: null, status: null, speed: 5, readyCount: null, power: null },
    palletLoader: { caseId: null, status: null, speed: 5, readyCount: null, power: null },
    maxQueueSize: null
  });

  public analysis = signal<LineAnalysis>({ currentRobotSpeed: 0, currentQualityPct: null, suggestedRobotSpeed: null, status: 'OK', message: 'Awaiting line status...' });
  public qualityThreshold = signal<number>(0.85);
  public isAutopilotEnabled = signal<boolean>(false);
  public simulationBlocked = signal<boolean>(false);

  private lastCam1Id: string | null = null;
  private lastCam2Id: string | null = null;
  private lastCam3Id: string | null = null;
  private lastScrapId: string | null = null;
  private lastPickId: string | null = null;
  private lastAutomateState: boolean | null = null;
  private outcomeHistory: boolean[] = [];
  private readonly maxHistorySize = 40;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) {
      this.setRobotSpeed(5);
      this.setPackageLoaderSpeed(5);
      this.setPalletLoaderSpeed(5);
      setInterval(() => this.pollLine(), 500);
      setInterval(() => this.pollSuggestions(), 1000);
      setInterval(() => this.pollAutomate(), 2000);
      setInterval(() => this.pollThreshold(), 2000);
    }
  }

  private async pollLine(): Promise<void> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/line`, 3000);
      if (!res.ok) return;
      const data = await res.json();
      this.updateConveyorSnapshot(data);
      this.updateTelemetryAndPanels(data);
    } catch (e) {
      console.error('Error polling line status:', e);
    }
  }

  private updateConveyorSnapshot(data: any): void {
    const c = data?.conveyors || {};
    const boxFeed = this.cleanItems(c.boxFeed, 'box');
    const palletFeed = this.cleanItems(c.palletFeed, 'pallet');
    const assembledOutput = this.mergeByCaseId(this.cleanItems(c.assembledOutput, 'assembled'));

    this.conveyorSnapshot.set({
      boxFeed,
      palletFeed,
      assembledOutput,
      ts: data?.snapshot?.ts || null,
      maxQueueSize: data?.snapshot?.maxQueueSize ?? data?.config?.max_queue_size ?? null
    });
  }

  private cleanItems(items: unknown, fallbackType: 'box' | 'pallet' | 'assembled'): ConveyorItem[] {
    if (!Array.isArray(items)) return [];
    return items
      .map((raw, index) => this.toConveyorItem(raw, fallbackType, index))
      .filter((x): x is ConveyorItem => x !== null);
  }

  private toConveyorItem(raw: any, fallbackType: 'box' | 'pallet' | 'assembled', index: number): ConveyorItem | null {
    const caseId = raw?.caseId || raw?.case_id || raw?.packageId || raw?.package_id || raw?.palletId || raw?.pallet_id;
    if (!caseId) return null;
    const stage = raw?.stage || raw?.state || raw?.currentStage || raw?.phase || '';
    const parsedIndex = Number(raw?.index ?? raw?.queueIndex ?? raw?.queue_position ?? raw?.queuePos ?? raw?.position ?? raw?.idx ?? index);
    return {
      caseId,
      packageId: raw.packageId || raw.package_id || raw.caseId || raw.case_id || null,
      palletId: raw.palletId || raw.pallet_id || null,
      type: raw.type || fallbackType,
      queue: raw.queue || '',
      stage,
      index: Number.isFinite(parsedIndex) ? parsedIndex : index,
      tsCreated: raw.tsCreated || raw.ts_created || null,
      tsLoadDone: raw.tsLoadDone || raw.ts_load_done || null,
      tsRobotStart: raw.tsRobotStart || raw.ts_robot_start || null,
      tsRobotDone: raw.tsRobotDone || raw.ts_robot_done || null,
      tsCameraStart: raw.tsCameraStart || raw.ts_camera_start || null,
      tsCameraDone: raw.tsCameraDone || raw.ts_camera_done || null,
      tsWatchStart: raw.tsWatchStart || raw.ts_watch_start || null,
      tsWatchDone: raw.tsWatchDone || raw.ts_watch_done || null,
      tsLabelStart: raw.tsLabelStart || raw.ts_label_start || null,
      tsLabelDone: raw.tsLabelDone || raw.ts_label_done || null,
      chargerSpeed: raw.chargerSpeed ?? raw.charger_speed ?? null,
      palletSpeed: raw.palletSpeed ?? raw.pallet_speed ?? null,
      machineStatus: raw.machineStatus ?? raw.machine_status ?? null,
      robotQualityPct: raw.robotQualityPct ?? raw.robot_quality_pct ?? null,
      cameraQualityOk: raw.cameraQualityOk ?? raw.camera_quality_ok ?? null,
      watchQualityOk: raw.watchQualityOk ?? raw.watch_quality_ok ?? null,
      labelQualityOk: raw.labelQualityOk ?? raw.label_quality_ok ?? null,
      outcome: raw.outcome || null,
      scrapReason: raw.scrapReason || raw.scrap_reason || null,
      source: raw.source || 'queue'
    };
  }

  private mergeByCaseId(items: ConveyorItem[]): ConveyorItem[] {
    const priority: Record<string, number> = {
      loader_processing: 10,
      loader_to_assembler: 20,
      robot_processing: 30,
      assembler_to_camera: 40,
      camera_inspection: 50,
      camera_to_smartwatch: 60,
      smartwatch_inspection: 70,
      smartwatch_to_labeler: 80,
      labeler_inspection: 90
    };
    const map = new Map<string, ConveyorItem>();
    for (const item of items) {
      const old = map.get(item.caseId);
      if (!old || (priority[item.stage] ?? 0) >= (priority[old.stage] ?? 0)) {
        map.set(item.caseId, item);
      }
    }
    return [...map.values()];
  }

  private updateTelemetryAndPanels(data: any): void {
    const robot = data['robot'];
    if (robot?.attributes) {
      this.telemetry.update((t: Telemetry) => ({
        ...t,
        speed: this.num(robot.attributes.robot_speed, t.speed),
        power: this.num(robot.attributes.power_kw, t.power),
        machineStatus: robot.attributes.machine_status || t.machineStatus,
        qualityPct: robot.attributes.produced_quality_pct != null ? parseFloat(robot.attributes.produced_quality_pct) : t.qualityPct ?? null,
        caseId: robot.case_id || t.caseId || null
      }));
    }

    const newLineState: LineState = { ...this.lineState() };
    this.setStation(data['camera'], 'camera', '1', newLineState);
    this.setStation(data['smartwatch'], 'smartwatch', '2', newLineState);
    this.setStation(data['labeler'], 'labeler', '3', newLineState);

    const loader = data['load-package'];
    if (loader) {
      newLineState.packageLoader = {
        caseId: loader.case_id || null,
        status: loader.attributes?.machine_status || null,
        speed: this.num(loader.attributes?.charger_speed, this.lineState().packageLoader.speed),
        readyCount: loader.attributes?.remaining_packages != null ? parseInt(loader.attributes.remaining_packages, 10) : null,
        power: loader.attributes?.power_kw != null ? parseFloat(loader.attributes.power_kw) : null
      };
    }

    const pallet = data['load-pallets'];
    if (pallet) {
      newLineState.palletLoader = {
        caseId: pallet.case_id || null,
        status: pallet.attributes?.machine_status || null,
        speed: this.num(pallet.attributes?.pallet_speed, this.lineState().palletLoader.speed),
        readyCount: pallet.attributes?.ready_pallets != null ? parseInt(pallet.attributes.ready_pallets, 10) : null,
        power: pallet.attributes?.power_kw != null ? parseFloat(pallet.attributes.power_kw) : null
      };
    }

    newLineState.maxQueueSize = data?.snapshot?.maxQueueSize ?? data?.config?.max_queue_size ?? newLineState.maxQueueSize;
    this.lineState.set(newLineState);

    const pick = data['pick-area'];
    const scrap = data['scrap-area'];
    if (pick) this.pickArea.set({ caseId: pick.case_id || null, nGood: this.num(pick.attributes?.n_good, 0) });
    if (scrap) this.scrapArea.set({ caseId: scrap.case_id || null, nScrap: this.num(scrap.attributes?.n_scrap, 0), scrapReason: scrap.attributes?.scrap_reason || null });

    this.analysis.set(this.computeLineAnalysis(robot, newLineState, scrap, pick));

    if (scrap?.case_id && scrap.activity === 'Scrap Area' && scrap.case_id !== this.lastScrapId) {
      this.lastScrapId = scrap.case_id;
      this.addToHistory(false);
      this.addEvent({ timestamp: this.now(), type: 'ERROR', message: `Package ${scrap.case_id} scrapped. Reason: ${scrap.attributes?.scrap_reason || 'Unknown'}` });
    }

    if (pick?.case_id && pick.activity === 'Pick Area' && pick.case_id !== this.lastPickId) {
      this.lastPickId = pick.case_id;
      this.addToHistory(true);
      this.addEvent({ timestamp: this.now(), type: 'OK', message: `Package ${pick.case_id} successfully cleared all checks and approved.` });
    }
  }

  private setStation(src: any, field: 'camera' | 'smartwatch' | 'labeler', camId: string, state: LineState): void {
    if (!src?.case_id) return;
    const ok = this.normalizeOk(src.attributes?.quality_ok);
    state[field] = { caseId: src.case_id, ok };
    const last = camId === '1' ? this.lastCam1Id : camId === '2' ? this.lastCam2Id : this.lastCam3Id;
    if (src.case_id !== last) {
      if (camId === '1') this.lastCam1Id = src.case_id;
      if (camId === '2') this.lastCam2Id = src.case_id;
      if (camId === '3') this.lastCam3Id = src.case_id;
      this.addCameraLog(camId, src.case_id, ok === false ? 'FAIL' : 'OK');
    }
  }

  private normalizeOk(value: unknown): boolean | null {
    if (value === true || value === 'true' || value === 1 || value === '1' || value === 'OK' || value === 'ok') return true;
    if (value === false || value === 'false' || value === 0 || value === '0' || value === 'FAIL' || value === 'fail') return false;
    return null;
  }

  private computeLineAnalysis(robot: any, lineState: LineState, scrap: any, pick: any): LineAnalysis {
    const currentRobotSpeed = this.num(robot?.attributes?.robot_speed, this.telemetry().speed);
    let currentQualityPct = robot?.attributes?.produced_quality_pct != null ? parseFloat(robot.attributes.produced_quality_pct) : (this.telemetry().qualityPct ?? 100);
    let recentScrapCount = 0;
    if (this.outcomeHistory.length > 0) {
      const goods = this.outcomeHistory.filter(Boolean).length;
      recentScrapCount = this.outcomeHistory.length - goods;
      currentQualityPct = (goods / this.outcomeHistory.length) * 100;
    }
    const thresholdPct = this.qualityThreshold() * 100;
    const failedInspection = lineState.camera.ok === false || lineState.smartwatch.ok === false || lineState.labeler.ok === false;
    let suggestedRobotSpeed: number | null = currentRobotSpeed;
    let status: LineAnalysis['status'] = 'OK';
    let message = 'Line operating within normal parameters.';
    if (recentScrapCount > 0 || failedInspection || currentQualityPct < thresholdPct) {
      status = recentScrapCount > 3 ? 'ERROR' : 'WARN';
      suggestedRobotSpeed = Math.max(2, currentRobotSpeed - 2);
      message = `Quality Estimate ${currentQualityPct.toFixed(1)}%. Suggested speed: ${suggestedRobotSpeed}.`;
    }
    return { currentRobotSpeed, currentQualityPct, suggestedRobotSpeed, status, message };
  }

  private async pollThreshold(): Promise<void> {
    try {
      const r = await this.fetchWithTimeout(`${this.baseUrl}/threshold`, 2500);
      if (!r.ok) return;
      const d = await r.json();
      if (d?.threshold != null) this.qualityThreshold.set(Number(d.threshold));
    } catch {}
  }

  private async pollAutomate(): Promise<void> {
    try {
      const r = await this.fetchWithTimeout(`${this.baseUrl}/automate`, 2500);
      if (!r.ok) return;
      const d = await r.json();
      const val = typeof d === 'object' ? d.automate : d;
      if (val == null) return;
      const on = val === true || val === 1 || val === 'true' || val === '1' || val === 'on';
      if (this.lastAutomateState !== null && this.lastAutomateState !== on) {
        this.addEvent({ timestamp: this.now(), type: 'INFO', message: `Autopilot State synced from server: ${on ? 'ENABLED' : 'DISABLED'}` });
      }
      this.lastAutomateState = on;
      this.isAutopilotEnabled.set(on);
    } catch {}
  }

  private async pollSuggestions(): Promise<void> {
    try {
      const r = await this.fetchWithTimeout(`${this.baseUrl}/suggestions`, 2500);
      if (!r.ok) return;
      const d = await r.json();
      const msgs: string[] = Array.isArray(d) ? d : (d.suggestion ? [d.suggestion] : [d.message || JSON.stringify(d)]);
      msgs.forEach((msg: string) => this.addEvent({ timestamp: this.now(), type: 'SUGGESTION', message: msg }));
    } catch {}
  }

  private async fetchWithTimeout(url: string, ms: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async postJson<T>(url: string, body?: unknown): Promise<T | null> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body != null ? JSON.stringify(body) : undefined
      });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  public async setRobotSpeed(speed: number): Promise<void> {
    const value = this.clamp(speed, 1, 20);
    const response = await this.postJson<SpeedResponse>(`${this.baseUrl}/robot/speed`, { speed: value });
    if (response?.success) this.telemetry.update((t: Telemetry) => ({ ...t, speed: response.robot_speed ?? value }));
  }

  public async setRobotSpeedLow(): Promise<void> {
    const response = await this.postJson<SpeedResponse>(`${this.baseUrl}/robot/speed/low`);
    if (response?.success && response.robot_speed != null) this.telemetry.update((t: Telemetry) => ({ ...t, speed: response.robot_speed! }));
  }

  public async setRobotSpeedHigh(): Promise<void> {
    const response = await this.postJson<SpeedResponse>(`${this.baseUrl}/robot/speed/high`);
    if (response?.success && response.robot_speed != null) this.telemetry.update((t: Telemetry) => ({ ...t, speed: response.robot_speed! }));
  }

  public async setPackageLoaderSpeed(speed: number): Promise<void> {
    const value = this.clamp(speed, 1, 20);
    const response = await this.postJson<SpeedResponse>(`${this.baseUrl}/load/speed`, { speed: value });
    if (response?.success) this.lineState.update((s: LineState) => ({ ...s, packageLoader: { ...s.packageLoader, speed: response.load_speed ?? value } }));
  }

  public async setPalletLoaderSpeed(speed: number): Promise<void> {
    const value = this.clamp(speed, 1, 20);
    const response = await this.postJson<SpeedResponse>(`${this.baseUrl}/pallet/speed`, { speed: value });
    if (response?.success) this.lineState.update((s: LineState) => ({ ...s, palletLoader: { ...s.palletLoader, speed: response.pallet_speed ?? value } }));
  }

  public async toggleAutopilot(): Promise<void> {
    const response = await this.postJson<SpeedResponse>(`${this.baseUrl}/automate`, {});
    if (response?.success) this.isAutopilotEnabled.set(!!response.automate);
  }

  public async setQualityThreshold(value: number): Promise<void> {
    const threshold = this.clamp(value, 0, 1);
    const response = await this.postJson<any>(`${this.baseUrl}/threshold`, { threshold });
    if (response?.success) this.qualityThreshold.set(threshold);
  }

  public async resetLine(): Promise<boolean> {
    const response = await this.postJson<ResetResponse>(`${this.baseUrl}/reset`, {});
    if (!response?.success) {
      this.addEvent({ timestamp: this.now(), type: 'ERROR', message: 'Line reset failed.' });
      return false;
    }

    const currentTelemetry = this.telemetry();
    const currentState = this.lineState();

    this.telemetry.set({
      speed: currentTelemetry.speed ?? 5,
      power: 0,
      machineStatus: 'idle',
      qualityPct: null,
      caseId: null
    });
    this.cameraLogs.set([]);
    this.pickArea.set({ caseId: null, nGood: 0 });
    this.scrapArea.set({ caseId: null, nScrap: 0, scrapReason: null });
    this.conveyorSnapshot.set({ boxFeed: [], palletFeed: [], assembledOutput: [], ts: response.ts ?? null, maxQueueSize: currentState.maxQueueSize });
    this.lineState.set({
      camera: { caseId: null, ok: null },
      smartwatch: { caseId: null, ok: null },
      labeler: { caseId: null, ok: null },
      packageLoader: { caseId: null, status: 'idle', speed: currentState.packageLoader.speed ?? 5, readyCount: null, power: 0 },
      palletLoader: { caseId: null, status: 'idle', speed: currentState.palletLoader.speed ?? 5, readyCount: 10, power: 0 },
      maxQueueSize: currentState.maxQueueSize
    });
    this.analysis.set({ currentRobotSpeed: currentTelemetry.speed ?? 0, currentQualityPct: null, suggestedRobotSpeed: null, status: 'OK', message: 'Line reset completed.' });

    this.lastCam1Id = null;
    this.lastCam2Id = null;
    this.lastCam3Id = null;
    this.lastScrapId = null;
    this.lastPickId = null;
    this.outcomeHistory = [];

    this.addEvent({ timestamp: this.now(), type: 'INFO', message: `[RESET] ${response.message ?? 'Full reset completed.'}` });
    return true;
  }

  public async updateConfig(config: ConfigPayload): Promise<void> {
    await this.postJson<any>(`${this.baseUrl}/config`, config);
  }

  public reportOverflowScrap(packageId?: string): void {
    if (packageId) this.addCameraLog('Overflow', packageId, 'FAIL');
    this.addToHistory(false);
  }

  private addToHistory(isGood: boolean): void {
    this.outcomeHistory.push(isGood);
    if (this.outcomeHistory.length > this.maxHistorySize) this.outcomeHistory.shift();
  }

  private addCameraLog(cameraId: string, packageId: string, status: string): void {
    this.cameraLogs.update((logs: CameraData[]) => [{ cameraId, packageId, status }, ...logs].slice(0, 50));
  }

  public addEvent(event: NodeRedEvent): void {
    this.events.update((events: NodeRedEvent[]) => [event, ...events].slice(0, 50));
  }

  private now(): string {
    return new Date().toLocaleTimeString('en-GB', { hour12: false });
  }

  private num(value: unknown, fallback: any): any {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }
}
