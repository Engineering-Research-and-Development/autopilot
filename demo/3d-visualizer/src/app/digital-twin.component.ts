import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  ChangeDetectionStrategy,
  Inject,
  PLATFORM_ID,
  inject,
  effect,
  signal,
  input,
  Output,
  EventEmitter
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ConveyorItem, NodeRedService } from './nodered.service';

export interface PackageOverlay { id: number; x: number; y: number; type: string; state: string; externalId: string; showLabel: boolean; }
export interface RobotTooltipOverlay { id: 'assembly' | 'package_loader' | 'pallet_loader' | 'camera_1' | 'camera_2' | 'labeler'; x: number; y: number; }
export interface DigitalTwinStreamEvent { type: 'info' | 'error' | 'suggestion' | 'speed' | 'package'; source: 'digital-twin'; title: string; message: string; ts: string; payload?: any; }
type PackageType = 'box' | 'pallet' | 'assembled';
type PackageState = 'ok' | 'fail' | 'pending';
interface Package3D { mesh: THREE.Object3D; id: number; externalId: string; state: PackageState; type: PackageType; stage: string; targetX: number; targetY: number; targetZ: number; lastSeen: number; robotStartMs?: number; robotDoneMs?: number; }

@Component({
  selector: 'app-digital-twin',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="twin-container relative" #rendererContainer>
      @for (o of packageOverlays(); track o.id) {
        <div class="absolute transform -translate-x-1/2 -translate-y-full flex flex-col items-center gap-0.5 z-10" [class.pointer-events-none]="o.showLabel" [class.pointer-events-auto]="!o.showLabel" [style.left.px]="o.x" [style.top.px]="o.y" [attr.title]="o.externalId">
          @if (o.showLabel) {
            <div class="bg-slate-900/80 backdrop-blur shadow border border-slate-700/80 rounded px-1.5 py-0.5 flex items-center gap-1.5">
              <span class="text-[9px] font-mono text-slate-300 font-bold uppercase tracking-wide">{{ o.externalId }}</span>
              @if (o.state === 'fail') { <span class="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]"></span> }
              @else if (o.state === 'ok') { <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]"></span> }
              @else { <span class="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.5)]"></span> }
            </div>
            <div class="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[4px] border-t-slate-700"></div>
          } @else {
            <div class="w-2.5 h-2.5 rounded-full bg-slate-400/70 border border-slate-100/40 shadow-[0_0_6px_rgba(148,163,184,0.65)] cursor-help" [attr.title]="o.externalId"></div>
          }
        </div>
      }

      @if (showTooltips()) {
        @for (rt of robotTooltips(); track rt.id) {
          <div class="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-full flex flex-col items-center gap-0.5 z-20 group" [style.left.px]="rt.x" [style.top.px]="rt.y">
            <div class="backdrop-blur shadow-lg rounded-md px-1.5 py-0.5 flex items-center gap-1 cursor-pointer transition-colors border"
                 [class.bg-indigo-900\/80]="rt.id === 'assembly'" [class.border-indigo-500\/50]="rt.id === 'assembly'"
                 [class.bg-blue-900\/80]="rt.id === 'package_loader'" [class.border-blue-500\/50]="rt.id === 'package_loader'"
                 [class.bg-emerald-900\/80]="rt.id === 'pallet_loader'" [class.border-emerald-500\/50]="rt.id === 'pallet_loader'"
                 [class.bg-orange-900\/80]="rt.id === 'camera_1'" [class.border-orange-500\/50]="rt.id === 'camera_1'"
                 [class.bg-cyan-900\/80]="rt.id === 'camera_2'" [class.border-cyan-500\/50]="rt.id === 'camera_2'"
                 [class.bg-purple-900\/80]="rt.id === 'labeler'" [class.border-purple-500\/50]="rt.id === 'labeler'">
              <span class="text-[10px] font-medium text-slate-100">
                @if (rt.id === 'assembly') { Assembly Robot }
                @if (rt.id === 'package_loader') { Box Loader }
                @if (rt.id === 'pallet_loader') { Pallet Loader }
                @if (rt.id === 'camera_1') { Camera Inspection }
                @if (rt.id === 'camera_2') { Smartwatch Inspection }
                @if (rt.id === 'labeler') { Apply & Verify Labeler }
              </span>
            </div>
            <div class="absolute top-full mt-2 w-52 bg-slate-900/95 backdrop-blur border border-slate-700/80 rounded-lg p-3 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
              @if (rt.id === 'assembly') { <h4 class="text-[11px] font-bold text-slate-200 mb-2 border-b border-slate-700/50 pb-1">COMAU NJ-220</h4><div class="flex justify-between text-[10px] mb-1"><span class="text-slate-400">Status</span><span class="font-mono text-slate-100">{{ nodeRedService.telemetry().machineStatus || 'Idle' }}</span></div><div class="flex justify-between text-[10px]"><span class="text-slate-400">Active Part</span><span class="font-mono text-indigo-300">{{ nodeRedService.telemetry().caseId || '---' }}</span></div> }
              @if (rt.id === 'package_loader') { <h4 class="text-[11px] font-bold text-slate-200 mb-2 border-b border-slate-700/50 pb-1">KUKA KR-40 Box</h4><div class="flex justify-between text-[10px] mb-1"><span class="text-slate-400">Status</span><span class="font-mono text-slate-100">{{ nodeRedService.lineState().packageLoader.status || 'Idle' }}</span></div><div class="flex justify-between text-[10px]"><span class="text-slate-400">Active Box</span><span class="font-mono text-blue-300">{{ nodeRedService.lineState().packageLoader.caseId || '---' }}</span></div> }
              @if (rt.id === 'pallet_loader') { <h4 class="text-[11px] font-bold text-slate-200 mb-2 border-b border-slate-700/50 pb-1">KUKA KR-40 Pallet</h4><div class="flex justify-between text-[10px] mb-1"><span class="text-slate-400">Status</span><span class="font-mono text-slate-100">{{ nodeRedService.lineState().palletLoader.status || 'Idle' }}</span></div><div class="flex justify-between text-[10px]"><span class="text-slate-400">Active Pallet</span><span class="font-mono text-emerald-300">{{ nodeRedService.lineState().palletLoader.caseId || '---' }}</span></div> }
              @if (rt.id === 'camera_1') { <h4 class="text-[11px] font-bold text-slate-200 mb-2 border-b border-slate-700/50 pb-1">Inspection Station 1</h4><div class="flex justify-between text-[10px]"><span class="text-slate-400">Case</span><span class="font-mono text-orange-300">{{ nodeRedService.lineState().camera.caseId || '---' }}</span></div> }
              @if (rt.id === 'camera_2') { <h4 class="text-[11px] font-bold text-slate-200 mb-2 border-b border-slate-700/50 pb-1">Inspection Station 2</h4><div class="flex justify-between text-[10px]"><span class="text-slate-400">Case</span><span class="font-mono text-cyan-300">{{ nodeRedService.lineState().smartwatch.caseId || '---' }}</span></div> }
              @if (rt.id === 'labeler') { <h4 class="text-[11px] font-bold text-slate-200 mb-2 border-b border-slate-700/50 pb-1">Labeling Station</h4><div class="flex justify-between text-[10px]"><span class="text-slate-400">Case</span><span class="font-mono text-purple-300">{{ nodeRedService.lineState().labeler.caseId || '---' }}</span></div> }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`.twin-container { width: 100%; height: 100%; display:block; overflow:hidden; }`]
})
export class DigitalTwinComponent implements OnInit, OnDestroy {
  @ViewChild('rendererContainer', { static: true }) rendererContainer!: ElementRef<HTMLDivElement>;
  @Output() streamEvent = new EventEmitter<DigitalTwinStreamEvent>();

  public nodeRedService = inject(NodeRedService);
  public packageOverlays = signal<PackageOverlay[]>([]);
  public robotTooltips = signal<RobotTooltipOverlay[]>([]);
  public robotStyle = input<'industrial' | 'modern' | 'stealth'>('industrial');
  public showTooltips = input<boolean>(true);

  private scene!: THREE.Scene; private camera!: THREE.PerspectiveCamera; private renderer!: THREE.WebGLRenderer; private controls!: OrbitControls; private animationFrameId: number | null = null;
  private packages: Package3D[] = []; private packageCounter = 0; private lastFrameTime = 0;
  private lastSpeedSnapshot: { assembler?: number; boxLoader?: number; palletLoader?: number } | null = null;
  private robotArm?: THREE.Group; private robotJoint?: THREE.Mesh; private mainRobotGroup?: THREE.Group; private comauRobotHighlightMat?: THREE.MeshStandardMaterial;
  private packageLoaderArm?: THREE.Group; private packageLoaderJoint?: THREE.Mesh; private packageLoaderMat?: THREE.MeshStandardMaterial; private palletLoaderArm?: THREE.Group; private palletLoaderJoint?: THREE.Mesh; private palletLoaderMat?: THREE.MeshStandardMaterial;
  private loaderPhase = 0; private palletPhase = 0; private robotPhase = 0; private lastAssemblyCaseId: string | null = null; private robotPickStartedAt = 0; private readonly PICK_MOTION_MS = 1100;
  // ASSEMBLER visual-only: ciclo avviato SOLO quando il backend dichiara stage === 'robot_processing'.
  private readonly ASSEMBLER_PACKAGE_ANGLE = -Math.PI;
  private readonly ASSEMBLER_PALLET_ANGLE = -Math.PI / 2;
  private readonly ASSEMBLER_OUTPUT_ANGLE = Math.PI / 2;
  private readonly ASSEMBLER_VISUAL_CYCLE_MS = 820;
  private readonly ASSEMBLER_VISUAL_HOLD_MS = 60;
  private readonly ASSEMBLER_MIN_PROGRESS = 0.04;
  private readonly ASSEMBLED_QUEUE_SPACING = 2.25;
  // Patch anti-ghost: prima erano 120000ms, troppo lungo per pacchi orfani visuali.
  private readonly ASSEMBLED_STALE_TIMEOUT_MS = 15000;
  private readonly CAMERA_VISUAL_HANDOFF_MS = 2800;
  // Quanto resta visibile, rosso, il package scartato sulla camera che lo ha respinto.
  private readonly REJECT_VISUAL_HOLD_MS = 3500;
  // Tempo massimo in cui un box può restare davanti all'assemblatore in attesa dell'assembled corrispondente.
  private readonly FRONTEND_ASSEMBLER_WAIT_MS = 6000;
  private cameraVisualHoldSince = new Map<string, number>();
  private assemblerVisualStartedAt = 0;
  private assemblerVisualActive = false;
  private assemblerVisualCaseId: string | null = null;
  private assemblerHeldSuffixes = new Set<string>();
  private assemblerReleasedSuffixes = new Set<string>();
  private failedPackageSuffixes = new Set<string>();
  private failedPackageStopX = new Map<string, number>();
  private failedPackageHoldSince = new Map<string, number>();
  private removedFailedPackageSuffixes = new Set<string>();
  private pendingAssembledOutput = new Map<string, ConveyorItem>();
  private cam1Light!: THREE.SpotLight; private cam2Light!: THREE.SpotLight; private cam3Light!: THREE.SpotLight;
  private readonly X_SOURCE = -50; private readonly X_ASSEMBLER = -4; private readonly X_ASSEMBLED_START = 1; private readonly X_CAMERA_1 = 28; private readonly X_CAMERA_2 = 38; private readonly X_LABELER = 48; private readonly X_EXIT = 78; private readonly X_LOADER_BASE = -53; private readonly SPACING = 1.9;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) {
      effect(() => { const style = this.robotStyle(); if (this.mainRobotGroup && this.scene) { this.scene.remove(this.mainRobotGroup); this.createComauRobot(-4, 0, 0, style); } });
      effect(() => this.reconcile(this.nodeRedService.conveyorSnapshot()));
    }
  }

  ngOnInit(): void { if (isPlatformBrowser(this.platformId)) { this.initThree(); this.createEnvironment(); this.animate(); const ro = new ResizeObserver(() => this.onWindowResize()); ro.observe(this.rendererContainer.nativeElement); } }
  ngOnDestroy(): void { if (!isPlatformBrowser(this.platformId)) return; if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId); if (this.renderer) this.renderer.dispose(); }

  private initThree(): void {
    const c = this.rendererContainer.nativeElement; this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x1a1a1a);
    this.camera = new THREE.PerspectiveCamera(45, c.clientWidth / c.clientHeight, 0.1, 1000); this.camera.position.set(-45, 25, 35);
    this.renderer = new THREE.WebGLRenderer({ antialias: true }); this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.renderer.setSize(c.clientWidth, c.clientHeight, false); this.renderer.domElement.style.width='100%'; this.renderer.domElement.style.height='100%'; this.renderer.domElement.style.display='block'; this.renderer.shadowMap.enabled = true; c.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = true; this.controls.dampingFactor = 0.05; this.controls.target.set(-20, 0, 0);
    this.scene.add(new THREE.GridHelper(120, 120, 0x333333, 0x222222)); this.scene.add(new THREE.AmbientLight(0xffffff, 0.4)); const d = new THREE.DirectionalLight(0xffffff, 0.8); d.position.set(10, 20, 10); d.castShadow = true; this.scene.add(d);
  }

  private createEnvironment(): void {
    const sourceMat = new THREE.MeshStandardMaterial({ color: 0x1f2f4f, roughness: .8, metalness: .1 }); const feedMat = new THREE.MeshStandardMaterial({ color: 0x1f4f2f, roughness: .8, metalness: .1 }); const outputMat = new THREE.MeshStandardMaterial({ color: 0x3f2f1f, roughness: .8, metalness: .1 });
    [this.addBelt(28,1.8,-64,-2,sourceMat), this.addBelt(28,1.8,-64,2,sourceMat), this.addBelt(48,1.8,-26,-2,feedMat), this.addBelt(48,1.8,-26,2,feedMat), this.addBelt(84,2.5,36,0,outputMat)].forEach(b => { const e = new THREE.LineSegments(new THREE.EdgesGeometry(b.geometry as THREE.BufferGeometry), new THREE.LineBasicMaterial({ color: 0x777777 })); e.position.copy(b.position); this.scene.add(e); });
    const sm = new THREE.MeshStandardMaterial({ color: 0x555555 }); for (let i=-70;i<=78;i+=6) { this.addSupport(i,1.4,sm); this.addSupport(i,-1.4,sm); }
    const scrap = new THREE.Mesh(new THREE.BoxGeometry(30,.5,2.5), new THREE.MeshStandardMaterial({ color: 0x221111 })); scrap.position.set(5,-3,3); this.scene.add(scrap);
    this.createComauRobot(-4,0,0,this.robotStyle()); this.createLoaderRobot(this.X_LOADER_BASE,-4.2,0x2266ff,'package'); this.createLoaderRobot(this.X_LOADER_BASE,4.2,0x44cc44,'pallet'); this.createCameraStation(this.X_CAMERA_1,1); this.createCameraStation(this.X_CAMERA_2,2); this.createCameraStation(this.X_LABELER,3);
  }
  private addBelt(l:number,w:number,x:number,z:number,m:THREE.Material) { const b = new THREE.Mesh(new THREE.BoxGeometry(l,.5,w),m); b.position.set(x,0,z); b.receiveShadow=true; this.scene.add(b); return b; }
  private addSupport(x:number,z:number,m:THREE.Material) { const s = new THREE.Mesh(new THREE.BoxGeometry(.2,2,.2),m); s.position.set(x,-1.25,z); this.scene.add(s); }

  private createComauRobot(x:number,y:number,z:number,style:'industrial'|'modern'|'stealth'='industrial') { let primary=0xdddddd, highlight=0xcc1111, joint=0x333333; if (style==='modern') { primary=0xffffff; highlight=0x00d8ff; joint=0xaaaaaa; } if (style==='stealth') { primary=0x1a1a1a; highlight=0xffa500; joint=0x0f0f0f; } const pm = new THREE.MeshStandardMaterial({ color: primary, roughness:.5, metalness:.5 }); const hm = new THREE.MeshStandardMaterial({ color: highlight, roughness:.4, metalness:.8 }); const jm = new THREE.MeshStandardMaterial({ color: joint, roughness:.8, metalness:.2 }); this.comauRobotHighlightMat=hm; const g = new THREE.Group(); g.position.set(x,y+.2,z); this.scene.add(g); this.mainRobotGroup=g; const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.6,.4,32),jm); g.add(base); this.robotArm=new THREE.Group(); this.robotArm.position.set(0,.4,0); g.add(this.robotArm); const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.3,1.6,32),hm); ped.position.set(0,.8,0); this.robotArm.add(ped); const sh = new THREE.Mesh(new THREE.BoxGeometry(.8,2,.8),pm); sh.position.set(0,1.8,0); this.robotArm.add(sh); this.robotJoint = new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,1.2,32),jm); this.robotJoint.rotation.x=Math.PI/2; this.robotJoint.position.set(0,2.8,0); this.robotArm.add(this.robotJoint); const up = new THREE.Mesh(new THREE.CylinderGeometry(.4,.5,3,16),pm); up.position.set(0,1.5,0); this.robotJoint.add(up); const end = new THREE.Mesh(new THREE.BoxGeometry(.7,.35,.7),jm); end.position.set(0,3.25,0); this.robotJoint.add(end); this.robotArm.rotation.y = this.ASSEMBLER_PACKAGE_ANGLE; this.robotJoint.rotation.x = Math.PI/2; }
  private createLoaderRobot(x:number,z:number,color:number,type:'package'|'pallet') { const lm = new THREE.MeshStandardMaterial({ color, roughness:.5, metalness:.4 }); const jm = new THREE.MeshStandardMaterial({ color:0x333333, roughness:.8, metalness:.2 }); const g = new THREE.Group(); g.position.set(x,.4,z); this.scene.add(g); const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.5,.8,24),lm); g.add(base); const arm = new THREE.Group(); arm.position.set(0,.5,0); g.add(arm); const lower = new THREE.Mesh(new THREE.BoxGeometry(.8,3,.6),lm); lower.position.set(0,1.5,0); arm.add(lower); const joint = new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.8,16),jm); joint.rotation.x=Math.PI/2; joint.position.set(0,3,0); arm.add(joint); const upper = new THREE.Mesh(new THREE.BoxGeometry(.6,3,.5),lm); upper.position.set(0,1.5,0); joint.add(upper); const grip = new THREE.Mesh(new THREE.BoxGeometry(1,.5,.8),jm); grip.position.set(0,3,0); joint.add(grip); if (type==='package') { this.packageLoaderMat=lm; this.packageLoaderArm=arm; this.packageLoaderJoint=joint; } else { this.palletLoaderMat=lm; this.palletLoaderArm=arm; this.palletLoaderJoint=joint; } }
  private createCameraStation(x:number,id:number) { const g=new THREE.Group(); const mat=new THREE.MeshStandardMaterial({ color:id===1?0xcc5500:id===2?0x0055cc:0x228822 }); const p=new THREE.Mesh(new THREE.BoxGeometry(.4,6,.4),mat); p.position.set(0,3,-2); g.add(p); const a=new THREE.Mesh(new THREE.BoxGeometry(.3,.3,2.5),mat); a.position.set(0,5.85,-.9); g.add(a); const h=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.6),new THREE.MeshStandardMaterial({ color:0x111111 })); h.position.set(0,5.5,0); g.add(h); g.position.set(x,0,0); this.scene.add(g); const l=new THREE.SpotLight(id===1?0xffaa00:id===2?0x00aaff:0x55ff55,0); l.position.set(x,5.4,0); l.target.position.set(x,.5,0); this.scene.add(l); this.scene.add(l.target); if (id===1) this.cam1Light=l; else if (id===2) this.cam2Light=l; else this.cam3Light=l; }

  private toNumber(v: unknown): number | undefined { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
  private detectSpeedChanges(snapshot: { boxFeed: ConveyorItem[]; palletFeed: ConveyorItem[]; assembledOutput: ConveyorItem[] }): void {
    const lineState: any = this.nodeRedService.lineState?.() || {};
    const telemetry: any = this.nodeRedService.telemetry?.() || {};
    const cfg = lineState.config || telemetry.config || {};
    const assemblerSpeed = this.toNumber(cfg.robot_speed) ?? this.toNumber(lineState.robot?.robotSpeed) ?? this.toNumber(lineState.robot?.robot_speed) ?? this.toNumber(lineState.robot?.attributes?.robot_speed) ?? this.toNumber(telemetry.robotSpeed) ?? this.toNumber(telemetry.robot_speed) ?? this.toNumber((snapshot.assembledOutput?.[0] as any)?.robotSpeed) ?? this.toNumber((snapshot.assembledOutput?.[0] as any)?.robot_speed) ?? this.toNumber((snapshot.assembledOutput?.[0] as any)?.attributes?.robot_speed);
    const boxLoaderSpeed = this.toNumber(cfg.load_speed) ?? this.toNumber(lineState.packageLoader?.chargerSpeed) ?? this.toNumber(lineState.packageLoader?.charger_speed) ?? this.toNumber(lineState.packageLoader?.attributes?.charger_speed) ?? this.toNumber(telemetry.loadSpeed) ?? this.toNumber(telemetry.load_speed) ?? this.toNumber((snapshot.boxFeed?.[0] as any)?.chargerSpeed) ?? this.toNumber((snapshot.boxFeed?.[0] as any)?.charger_speed) ?? this.toNumber((snapshot.boxFeed?.[0] as any)?.attributes?.charger_speed);
    const palletLoaderSpeed = this.toNumber(cfg.pallet_speed) ?? this.toNumber(lineState.palletLoader?.palletSpeed) ?? this.toNumber(lineState.palletLoader?.pallet_speed) ?? this.toNumber(lineState.palletLoader?.attributes?.pallet_speed) ?? this.toNumber(telemetry.palletSpeed) ?? this.toNumber(telemetry.pallet_speed) ?? this.toNumber((snapshot.palletFeed?.[0] as any)?.palletSpeed) ?? this.toNumber((snapshot.palletFeed?.[0] as any)?.pallet_speed) ?? this.toNumber((snapshot.palletFeed?.[0] as any)?.attributes?.pallet_speed);
    const current = { assembler: assemblerSpeed, boxLoader: boxLoaderSpeed, palletLoader: palletLoaderSpeed };
    if (!this.lastSpeedSnapshot) { this.lastSpeedSnapshot = current; return; }
    this.emitSpeedChange('Assembler', this.lastSpeedSnapshot.assembler, current.assembler);
    this.emitSpeedChange('Box Loader', this.lastSpeedSnapshot.boxLoader, current.boxLoader);
    this.emitSpeedChange('Pallet Loader', this.lastSpeedSnapshot.palletLoader, current.palletLoader);
    this.lastSpeedSnapshot = current;
  }
  private emitSpeedChange(machine: string, oldSpeed?: number, newSpeed?: number): void {
    if (oldSpeed == null || newSpeed == null || oldSpeed === newSpeed) return;
    const direction: 'up' | 'down' | 'same' = newSpeed > oldSpeed ? 'up' : newSpeed < oldSpeed ? 'down' : 'same';
    const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '→';
    const event: DigitalTwinStreamEvent = { type: 'speed', source: 'digital-twin', title: `${machine} speed changed`, message: `${machine}: ${arrow} ${oldSpeed} → ${newSpeed}`, ts: new Date().toISOString(), payload: { machine, oldSpeed, newSpeed, direction } };
    this.streamEvent.emit(event);
    if (isPlatformBrowser(this.platformId)) window.dispatchEvent(new CustomEvent('digital-twin-stream-event', { detail: event }));
  }

  private idSuffix(id: string | null | undefined): string | null { const m = (id || '').match(/^[A-Z]+-(\d+)$/); return m ? m[1] : null; }
  private findBoxLikeBySuffix(id: string): Package3D | undefined { const suffix = this.idSuffix(id); if (!suffix) return undefined; return this.packages.find(p => p.type === 'box' && this.idSuffix(p.externalId) === suffix && (/^BOX-/.test(p.externalId) || /^PKG-/.test(p.externalId) || /^PCK-/.test(p.externalId) || p.stage === 'frontend_box_to_pkg' || p.stage === 'frontend_waiting_assembler_output')); }
  private shouldDelayAssembledOutput(item: ConveyorItem): boolean { const suffix = this.idSuffix(item.caseId); if (!suffix) return false; const assemblerArrivalX = this.X_ASSEMBLER - 3.0; const upstreamPkg = this.findBoxLikeBySuffix(item.caseId); if (!upstreamPkg) return false; return upstreamPkg.mesh.position.x < assemblerArrivalX; }
  private safeAssembledOutput(snapshot:{assembledOutput:ConveyorItem[]}): ConveyorItem[] { const safe: ConveyorItem[] = []; for (const item of snapshot.assembledOutput) { const suffix = this.idSuffix(item.caseId); if (suffix && this.shouldDelayAssembledOutput(item)) { this.pendingAssembledOutput.set(suffix, item); continue; } if (suffix) this.pendingAssembledOutput.delete(suffix); safe.push(item); } for (const [suffix, item] of [...this.pendingAssembledOutput.entries()]) { if (!this.shouldDelayAssembledOutput(item)) { safe.push(item); this.pendingAssembledOutput.delete(suffix); } } return safe; }

  private reconcile(snapshot:{boxFeed:ConveyorItem[]; palletFeed:ConveyorItem[]; assembledOutput:ConveyorItem[]}) {
    if (!this.scene) return;
    const now=performance.now();
    this.detectSpeedChanges(snapshot);
    const ids=new Set<string>();
    const safeAssembledOutput = this.safeAssembledOutput(snapshot);
    const assembledSuffixes = new Set(safeAssembledOutput.map(i => this.idSuffix(i.caseId)).filter((x): x is string => !!x));
    [...snapshot.boxFeed.map(i=>[i,'box'] as const), ...snapshot.palletFeed.map(i=>[i,'pallet'] as const), ...safeAssembledOutput.map(i=>[i,'assembled'] as const)].forEach(([item,type]) => this.upsert(item,type,ids,now));
    this.syncVisualQualityState(safeAssembledOutput);
    this.applyAssembledQueueTargets(safeAssembledOutput, now);
    for (const p of [...this.packages]) {
      if (ids.has(p.externalId)) continue;

      if (p.type === 'box' && (p.stage === 'frontend_box_to_pkg' || p.stage === 'frontend_waiting_assembler_output' || /^PKG-/.test(p.externalId) || /^PCK-/.test(p.externalId))) {
        const suffix = this.idSuffix(p.externalId);
        if (suffix && !assembledSuffixes.has(suffix) && now - p.lastSeen < this.FRONTEND_ASSEMBLER_WAIT_MS) {
          p.stage='frontend_waiting_assembler_output';
          p.targetX=this.X_ASSEMBLER-2.6;
          p.targetY=.75;
          p.targetZ=-2;
          // Non aggiornare lastSeen qui: altrimenti i box fantasma davanti all'assembler non scadono mai.
          ids.add(p.externalId);
          continue;
        }
      }

      if (p.type === 'box' && /^BOX-/.test(p.externalId)) {
        const suffix = this.idSuffix(p.externalId);
        if (suffix) {
          const pkgId = `PKG-${suffix}`;
          const already = this.findBoxLikeBySuffix(pkgId);
          if (already && already !== p) {
            this.removePackage(p);
            ids.add(pkgId);
            continue;
          }
          p.externalId = pkgId;
          p.stage='frontend_box_to_pkg';
          p.targetX=this.X_ASSEMBLER-2.6;
          p.targetY=.75;
          p.targetZ=-2;
          p.lastSeen=now;
          ids.add(pkgId);
          continue;
        }
      }

      const TIMEOUT = 1800;

      if (!ids.has(p.externalId)) {

        // ✅ FIX 1: pallet e box → continua verso assembler (già fatto)
        if (p.type === 'pallet' || p.type === 'box') {
          const assemblerPickupX = this.X_ASSEMBLER - 2.6;

          if (p.targetX < assemblerPickupX) {
            p.targetX = assemblerPickupX;
          }
        }

        // ✅ FIX 2: assembled → coda verso camera
        if (p.type === 'assembled') {

          // Se non è più nello snapshot backend, rimane nella coda visuale/handoff.
          p.targetY = 0;
          p.targetZ = 0;
        }

        const timeout = p.type === 'assembled' ? this.ASSEMBLED_STALE_TIMEOUT_MS : TIMEOUT;
        if (now - p.lastSeen > timeout) {
          this.removePackage(p);
        }
      }
    }
    this.enforceAssembledQueueSpacing();
    this.applyKnownQualityToVisiblePackages(now);
    this.cleanupRejectedPackages(now);
  }
  private upsert(item:ConveyorItem,type:PackageType,ids:Set<string>,now:number) {
    const id=item.caseId;
    if (!id) return;
    ids.add(id);

    const suffix = this.idSuffix(id);
    if (type === 'assembled' && suffix && this.removedFailedPackageSuffixes.has(suffix)) return;

    this.maybeStartAssemblerVisualCycle(item, type, now);

    const t=this.targetFor(item,type);
    let p=this.findByExternalId(id);
    if (!p && type === 'box' && /^(PKG|PCK)-/.test(id)) {
      const oldBoxOrPromoted = this.findBoxLikeBySuffix(id);
      if (oldBoxOrPromoted) {
        oldBoxOrPromoted.externalId = id;
        oldBoxOrPromoted.stage = 'frontend_box_to_pkg';
        p = oldBoxOrPromoted;
      }
    }
    if (!p || p.type!==type) {
      if (p) this.removePackage(p);
      if (type === 'box' && /^(PKG|PCK)-/.test(id)) p=this.createPackage(type,id,this.X_SOURCE,.75,-2);
      else p=this.createPackage(type,id,t.x,t.y,t.z);
      this.packages.push(p);
    }

    p.stage = item.stage || p.stage;
    p.targetX=t.x;
    p.targetY=t.y;
    p.targetZ=t.z;
    p.state=this.stateFor(item);

    // Patch anti-rosso sul Box Loader: fail memorizzato/applicato solo per package assemblati.
    if (type === 'assembled' && suffix && p.state === 'fail') {
      this.failedPackageSuffixes.add(suffix);
      this.failedPackageStopX.set(suffix, this.rejectStopXForItem(item));
    }
    if (type === 'assembled' && suffix && this.failedPackageSuffixes.has(suffix)) p.state = 'fail';
    if (type !== 'assembled' && p.state === 'fail') p.state = 'pending';

    const robotStartMs = Date.parse(item.tsRobotStart || '');
    const robotDoneMs = Date.parse(item.tsRobotDone || '');
    p.robotStartMs = Number.isFinite(robotStartMs) ? robotStartMs : undefined;
    p.robotDoneMs = Number.isFinite(robotDoneMs) ? robotDoneMs : undefined;

    if (type === 'assembled') {
      const held = !!suffix && this.assemblerHeldSuffixes.has(suffix) && !this.assemblerReleasedSuffixes.has(suffix);
      p.mesh.visible = !held;
      if (!held && suffix && this.assemblerReleasedSuffixes.has(suffix)) {
        p.mesh.position.x = Math.max(p.mesh.position.x, this.X_ASSEMBLED_START);
        p.mesh.position.y = 0;
        p.mesh.position.z = 0;
      }
    } else if (p.mesh.visible === false && !this.isAssemblerInputBeingConsumed(p)) {
      p.mesh.visible = true;
    }

    if (type === 'assembled' && p.state === 'fail') this.holdFailedPackageAtRejectStation(p, now);

    p.lastSeen=now;
    this.applyMaterial(p);
    this.flashStation(item,p);
  }
  private targetFor(item: ConveyorItem, type: PackageType) {
    const idx = Math.max(0, Number(item.index || 0));
    const assemblerPickupX = this.X_ASSEMBLER - 2.6;
    const boxLoaderPickupX = this.X_LOADER_BASE - 2.2;
    if (item.stage === 'loader_processing' && type === 'box') return { x: this.progressX(item.tsCreated, item.tsLoadDone, -70, boxLoaderPickupX, 0), y: .75, z: -2 };
    if (item.stage === 'loader_processing' && type === 'pallet') return { x: this.progressX(item.tsCreated, item.tsLoadDone, -70, this.X_SOURCE, 0), y: .35, z: 2 };
    if (type === 'box') return { x: this.progressX(item.tsCreated, item.tsLoadDone, this.X_SOURCE, assemblerPickupX, idx), y: .75, z: -2 };
    if (type === 'pallet') return { x: this.progressX(item.tsCreated, item.tsLoadDone, this.X_SOURCE, assemblerPickupX, idx), y: .35, z: 2 };
    if (item.stage === 'robot_processing') {
      if (type === 'assembled') {
        if (this.shouldHoldAssembledAtAssembler(item)) return { x: this.X_ASSEMBLER, y: 0, z: 0 };
        return { x: this.assembledToCameraQueueX(item, idx), y: 0, z: 0 };
      }
      return { x: this.X_ASSEMBLER, y: 0, z: 0 };
    }
    if (type === 'assembled' && this.shouldHoldAssembledAtAssembler(item)) {
      return { x: this.X_ASSEMBLER, y: 0, z: 0 };
    }
    if (item.stage === 'camera_inspection') return { x: this.X_CAMERA_1, y: 0, z: 0 };
    if (item.stage === 'camera_to_smartwatch') return { x: this.progressX(item.tsCameraDone, null, this.X_CAMERA_1, this.X_CAMERA_2, idx), y: 0, z: 0 };
    if (item.stage === 'smartwatch_inspection') return { x: this.X_CAMERA_2, y: 0, z: 0 };
    if (item.stage === 'smartwatch_to_labeler') return { x: this.progressX(item.tsWatchDone, null, this.X_CAMERA_2, this.X_LABELER, idx), y: 0, z: 0 };
    if (item.stage === 'labeler_inspection') return { x: this.X_LABELER, y: 0, z: 0 };
    return { x: this.assembledToCameraQueueX(item, idx), y: 0, z: 0 };
  }
  private assembledToCameraQueueX(item: ConveyorItem, idx: number): number {
    const laneStart = this.X_ASSEMBLED_START;
    const laneEnd = this.X_CAMERA_1 - 0.45;

    /*
    * Coda fisica davanti alla camera:
    * - idx 0 = più vicino alla camera
    * - idx 1,2,3... = dietro
    * Quando il backend consuma q_robot_out, gli indici scalano
    * e i pacchi avanzano automaticamente.
    */
    const spacing = this.ASSEMBLED_QUEUE_SPACING;

    const x = laneEnd - idx * spacing;

    return Math.max(this.X_ASSEMBLER + 1.0, Math.min(laneEnd, x));
  }
  private stageRank(stage: string): number {
    const rank: Record<string, number> = {
      robot_processing: 30,
      assembler_to_camera: 40,
      camera_inspection: 50,
      frontend_waiting_camera_handoff: 50,
      camera_to_smartwatch: 60,
      frontend_camera_to_smartwatch_fallback: 60,
      smartwatch_inspection: 70,
      smartwatch_to_labeler: 80,
      frontend_smartwatch_to_labeler_fallback: 80,
      labeler_inspection: 90,
      frontend_reject_hold: 999
    };
    return rank[stage] ?? 0;
  }

  private hasReached(stage: string, minRank: number): boolean { return this.stageRank(stage || '') >= minRank; }

  private isBackendFail(item: ConveyorItem): boolean {
    const stage = item.stage || '';
    if (item.scrapReason || item.outcome === 'scrap') return true;
    if (item.cameraQualityOk === false && this.hasReached(stage, 50)) return true;
    if (item.watchQualityOk === false && this.hasReached(stage, 70)) return true;
    if (item.labelQualityOk === false && this.hasReached(stage, 90)) return true;
    return false;
  }

  private rejectStopXForItem(item: ConveyorItem): number {
    const stage = item.stage || '';
    if (item.labelQualityOk === false || this.hasReached(stage, 90)) return this.X_LABELER;
    if (item.watchQualityOk === false || this.hasReached(stage, 70)) return this.X_CAMERA_2;
    return this.X_CAMERA_1;
  }

  private syncVisualQualityState(items: ConveyorItem[]): void {
    for (const item of items) {
      const suffix = this.idSuffix(item.caseId);
      if (suffix && this.isBackendFail(item)) {
        this.failedPackageSuffixes.add(suffix);
        this.failedPackageStopX.set(suffix, this.rejectStopXForItem(item));
      }
    }

    const scrap: any = this.nodeRedService.scrapArea?.() || {};
    const scrapSuffix = this.idSuffix(scrap.caseId);
    if (scrapSuffix) {
      this.failedPackageSuffixes.add(scrapSuffix);
      if (!this.failedPackageStopX.has(scrapSuffix)) this.failedPackageStopX.set(scrapSuffix, this.X_CAMERA_1);
    }

    const lineState: any = this.nodeRedService.lineState?.() || {};
    const stations = [
      { st: lineState.camera, x: this.X_CAMERA_1 },
      { st: lineState.smartwatch, x: this.X_CAMERA_2 },
      { st: lineState.labeler, x: this.X_LABELER }
    ];
    for (const { st, x } of stations) {
      const suffix = this.idSuffix(st?.caseId);
      if (suffix && st?.ok === false) {
        this.failedPackageSuffixes.add(suffix);
        this.failedPackageStopX.set(suffix, x);
      }
    }

    this.applyKnownQualityToVisiblePackages();
  }

  private applyKnownQualityToVisiblePackages(now = performance.now()): void {
    for (const p of this.packages) {
      // Patch anti-rosso sul Box Loader: non applicare mai fail a box/pallet.
      if (p.type !== 'assembled') continue;
      const suffix = this.idSuffix(p.externalId);
      if (suffix && this.failedPackageSuffixes.has(suffix)) {
        p.state = 'fail';
        this.holdFailedPackageAtRejectStation(p, now);
        this.applyMaterial(p);
      }
    }
  }

  private holdFailedPackageAtRejectStation(p: Package3D, now = performance.now()): void {
    if (p.type !== 'assembled') return;
    const suffix = this.idSuffix(p.externalId);
    const stopX = suffix ? (this.failedPackageStopX.get(suffix) ?? this.X_CAMERA_1) : this.X_CAMERA_1;
    p.stage = 'frontend_reject_hold';
    p.targetX = stopX;
    p.targetY = 0;
    p.targetZ = 0;
    if (suffix && !this.failedPackageHoldSince.has(suffix)) this.failedPackageHoldSince.set(suffix, now);
  }

  private cleanupRejectedPackages(now: number): void {
    for (const p of [...this.packages]) {
      if (p.type !== 'assembled' || p.state !== 'fail') continue;
      const suffix = this.idSuffix(p.externalId);
      if (!suffix) continue;
      const since = this.failedPackageHoldSince.get(suffix);
      if (since != null && now - since >= this.REJECT_VISUAL_HOLD_MS) {
        this.removedFailedPackageSuffixes.add(suffix);
        this.failedPackageSuffixes.delete(suffix);
        this.failedPackageStopX.delete(suffix);
        this.failedPackageHoldSince.delete(suffix);
        this.removePackage(p);
      }
    }
  }

  private isAfterCamera1Stage(stage: string): boolean {
    return stage === 'camera_to_smartwatch' ||
           stage === 'frontend_camera_to_smartwatch_fallback' ||
           stage === 'smartwatch_inspection' ||
           stage === 'smartwatch_to_labeler' ||
           stage === 'frontend_smartwatch_to_labeler_fallback' ||
           stage === 'labeler_inspection' ||
           stage === 'frontend_reject_hold';
  }

  private applyAssembledQueueTargets(items: ConveyorItem[], now: number): void {
    const laneStart = this.X_ASSEMBLER + 1.0;
    const laneEnd = this.X_CAMERA_1 - 0.45;
    const backendStage = new Map<string, string>();

    for (const item of items) {
      if (item.caseId) backendStage.set(item.caseId, item.stage || '');
    }

    for (const p of this.packages) {
      if (p.type !== 'assembled' || p.mesh.visible === false) continue;

      const suffix = this.idSuffix(p.externalId);
      if (suffix && this.failedPackageSuffixes.has(suffix)) {
        p.state = 'fail';
        this.holdFailedPackageAtRejectStation(p, now);
        p.lastSeen = now;
        continue;
      }

      const backend = backendStage.get(p.externalId) || '';
      const stage = backend || p.stage || '';

      if (stage === 'frontend_camera_to_smartwatch_fallback' || stage === 'smartwatch_inspection') {
        const atSecondCamera = p.mesh.position.x >= this.X_CAMERA_2 - 0.35 || p.targetX >= this.X_CAMERA_2 - 0.35;
        const key = p.externalId + ':watch';
        if (!atSecondCamera) {
          this.cameraVisualHoldSince.delete(key);
        } else {
          if (!this.cameraVisualHoldSince.has(key)) this.cameraVisualHoldSince.set(key, now);
          const heldFor = now - (this.cameraVisualHoldSince.get(key) || now);
          if (heldFor >= this.CAMERA_VISUAL_HANDOFF_MS) {
            p.stage = 'frontend_smartwatch_to_labeler_fallback';
            p.targetX = this.X_LABELER;
            p.targetY = 0;
            p.targetZ = 0;
            p.lastSeen = now;
            this.cameraVisualHoldSince.delete(key);
          } else {
            p.targetX = this.X_CAMERA_2;
            p.targetY = 0;
            p.targetZ = 0;
            p.lastSeen = now;
          }
        }
        continue;
      }

      if (this.isAfterCamera1Stage(stage)) {
        this.cameraVisualHoldSince.delete(p.externalId);
        continue;
      }

      const atCameraZone = p.mesh.position.x >= laneEnd - 0.35 || p.targetX >= laneEnd - 0.35;
      if (!atCameraZone) {
        this.cameraVisualHoldSince.delete(p.externalId);
        continue;
      }

      if (backend === 'camera_inspection' || !backend || stage === 'frontend_waiting_camera_handoff') {
        if (!this.cameraVisualHoldSince.has(p.externalId)) this.cameraVisualHoldSince.set(p.externalId, now);
        const heldFor = now - (this.cameraVisualHoldSince.get(p.externalId) || now);

        if (heldFor >= this.CAMERA_VISUAL_HANDOFF_MS) {
          p.stage = 'frontend_camera_to_smartwatch_fallback';
          p.targetX = this.X_CAMERA_2;
          p.targetY = 0;
          p.targetZ = 0;
          p.lastSeen = now;
          this.cameraVisualHoldSince.delete(p.externalId);
          continue;
        }

        p.stage = backend === 'camera_inspection' ? 'camera_inspection' : 'frontend_waiting_camera_handoff';
        p.targetX = backend === 'camera_inspection' ? this.X_CAMERA_1 : laneEnd;
        p.targetY = 0;
        p.targetZ = 0;
        p.lastSeen = now;
      }
    }

    const lane = this.packages
      .filter(p => p.type === 'assembled')
      .filter(p => p.mesh.visible !== false)
      .filter(p => p.state !== 'fail')
      .filter(p => {
        const suffix = this.idSuffix(p.externalId);
        return !(suffix && this.assemblerHeldSuffixes.has(suffix));
      })
      .filter(p => !this.isAfterCamera1Stage(backendStage.get(p.externalId) || p.stage || ''))
      .filter(p => Math.abs(p.mesh.position.z) <= 1.4 || Math.abs(p.targetZ) <= 1.4)
      .filter(p => p.mesh.position.x >= laneStart - 2 && p.mesh.position.x <= this.X_CAMERA_1 + 2)
      .sort((a, b) => b.mesh.position.x - a.mesh.position.x);

    lane.forEach((p, visualIdx) => {
      const stage = backendStage.get(p.externalId) || p.stage || '';
      const atCamera = stage === 'camera_inspection' || stage === 'frontend_waiting_camera_handoff';
      const slot = atCamera
        ? (stage === 'camera_inspection' ? this.X_CAMERA_1 : laneEnd)
        : Math.max(laneStart, Math.min(laneEnd, laneEnd - visualIdx * this.ASSEMBLED_QUEUE_SPACING));

      p.targetX = slot;
      p.targetY = 0;
      p.targetZ = 0;
      p.lastSeen = Math.max(p.lastSeen, now - 250);
    });
  }

  private enforceAssembledQueueSpacing(): void {
    const laneStart = this.X_ASSEMBLER + 1.0;
    const laneEnd = this.X_CAMERA_1;

    const lane = this.packages
      .filter(p => p.type === 'assembled')
      .filter(p => p.mesh.visible !== false)
      .filter(p => p.state !== 'fail')
      .filter(p => !this.isAfterCamera1Stage(p.stage || ''))
      .filter(p => Math.abs(p.mesh.position.z) <= 1.4 || Math.abs(p.targetZ) <= 1.4)
      .filter(p => p.mesh.position.x >= laneStart - 2 && p.mesh.position.x <= laneEnd + 2)
      .sort((a, b) => b.mesh.position.x - a.mesh.position.x);

    let nextAllowedX = laneEnd;
    for (const p of lane) {
      const clampedTarget = Math.max(laneStart, Math.min(p.targetX, nextAllowedX));
      if (p.targetX > clampedTarget) p.targetX = clampedTarget;
      p.targetY = 0;
      p.targetZ = 0;
      nextAllowedX = Math.min(p.mesh.position.x, clampedTarget) - this.ASSEMBLED_QUEUE_SPACING;
    }
  }

  private progressX(start?:string|null,end?:string|null,min=this.X_SOURCE,max=this.X_ASSEMBLER,idx=0) { const now=Date.now(); const s=Date.parse(start||''); let e=Date.parse(end||''); if (!Number.isFinite(s)) return max-idx*this.SPACING; if (!Number.isFinite(e)) e=s+6000; const p=Math.min(1,Math.max(0,(now-s)/(e-s))); return min+(max-min)*p-idx*this.SPACING; }
  private stateFor(item:ConveyorItem):PackageState { const stage=item.stage||''; if (this.isBackendFail(item)) return 'fail'; if (item.outcome==='good') return 'ok'; if (item.labelQualityOk===true && this.hasReached(stage,90)) return 'ok'; if (item.watchQualityOk===true && this.hasReached(stage,70)) return 'ok'; if (item.cameraQualityOk===true && this.hasReached(stage,50)) return 'ok'; return 'pending'; }
  private flashStation(item:ConveyorItem,p:Package3D) { const ok=p.state!=='fail'; const light=item.stage==='camera_inspection'?this.cam1Light:item.stage==='smartwatch_inspection'?this.cam2Light:item.stage==='labeler_inspection'?this.cam3Light:null; if (light && light.intensity<1) { light.color.setHex(ok?0x00ff00:0xff0000); light.intensity=80; new TWEEN.Tween(light).to({intensity:0},500).start(); } }
  private createPackage(type:PackageType,id:string,x:number,y:number,z:number):Package3D { let mesh:THREE.Object3D; if (type==='assembled') { const g=new THREE.Group(); const p=this.createPalletMesh(); p.position.set(0,.35,0); g.add(p); const b=this.createBoxMesh(); b.position.set(0,.95,0); g.add(b); mesh=g; } else mesh=type==='box'?this.createBoxMesh():this.createPalletMesh(); mesh.position.set(x,y,z); this.scene.add(mesh); return { mesh,id:++this.packageCounter,externalId:id,state:'pending',type,stage:'',targetX:x,targetY:y,targetZ:z,lastSeen:performance.now() }; }
  private createBoxMesh(){ const b=new THREE.Mesh(new THREE.BoxGeometry(1.2,1,1.2),new THREE.MeshStandardMaterial({color:0xc19a6b})); b.castShadow=true; return b; }
  private createPalletMesh(){ const p=new THREE.Mesh(new THREE.BoxGeometry(1.6,.2,1.6),new THREE.MeshStandardMaterial({color:0x8b5a2b})); p.castShadow=true; return p; }

  private animate = (time = performance.now()) => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    TWEEN.update(time);
    this.controls.update();
    this.lastFrameTime = time;
    this.animateRobots(time);
    for (const p of this.packages) { p.mesh.position.x += (p.targetX - p.mesh.position.x) * .18; p.mesh.position.y += (p.targetY - p.mesh.position.y) * .18; p.mesh.position.z += (p.targetZ - p.mesh.position.z) * .18; }
    this.updateOverlaysAndTooltips();
    this.renderer.render(this.scene, this.camera);
  };

  private animateRobots(time: number) {
    const packageProgress = this.lanePickupProgress('box', -2, this.X_LOADER_BASE, 5.5);
    const palletProgress = this.lanePickupProgress('pallet', 2, this.X_LOADER_BASE, 5.5);

    if (this.packageLoaderArm && this.packageLoaderJoint && this.packageLoaderMat) { this.applyArm(this.packageLoaderArm, this.packageLoaderJoint, packageProgress); this.packageLoaderMat.emissive.setHex(packageProgress > 0 ? 0x0033ff : 0); }
    if (this.palletLoaderArm && this.palletLoaderJoint && this.palletLoaderMat) { this.applyArm(this.palletLoaderArm, this.palletLoaderJoint, palletProgress); this.palletLoaderMat.emissive.setHex(palletProgress > 0 ? 0x00aa00 : 0); }

    if (this.robotArm && this.robotJoint && this.comauRobotHighlightMat) {
      const p = this.assemblerVisualProgress(time);
      const targetArmY = this.assemblerArmAngle(p);
      const targetJointX = Math.PI / 2 + Math.sin(p * Math.PI) * 0.6;
      this.robotArm.rotation.y = targetArmY;
      this.robotJoint.rotation.x += (targetJointX - this.robotJoint.rotation.x) * 0.4;
      this.comauRobotHighlightMat.emissive.setHex(this.assemblerVisualActive ? 0x330000 : 0);
    }
  }

  private maybeStartAssemblerVisualCycle(item: ConveyorItem, type: PackageType, now: number): void {
    if (type !== 'assembled') return;
    const suffix = this.idSuffix(item.caseId);
    if (!suffix || this.assemblerReleasedSuffixes.has(suffix)) return;
    const isRobotEvent = item.stage === 'robot_processing';
    if (!isRobotEvent) return;
    if (this.assemblerVisualActive && this.idSuffix(this.assemblerVisualCaseId) === suffix) return;
    if (!this.assemblerVisualActive && this.lastAssemblyCaseId === item.caseId) return;
    this.assemblerVisualActive = true;
    this.assemblerVisualStartedAt = now;
    this.assemblerVisualCaseId = item.caseId;
    this.lastAssemblyCaseId = item.caseId;
    this.assemblerHeldSuffixes.add(suffix);
    this.hideAssemblerInputs(item);
    if (this.robotArm) this.robotArm.rotation.y = this.ASSEMBLER_PACKAGE_ANGLE;
    if (this.robotJoint) this.robotJoint.rotation.x = Math.PI / 2;
  }

  private shouldHoldAssembledAtAssembler(item: ConveyorItem): boolean {
    const suffix = this.idSuffix(item.caseId);
    if (!suffix) return false;
    if (this.assemblerReleasedSuffixes.has(suffix)) return false;
    if (this.assemblerHeldSuffixes.has(suffix)) return true;
    return item.stage === 'robot_processing';
  }

  private hideAssemblerInputs(item: ConveyorItem): void {
    const suffix = this.idSuffix(item.caseId);
    if (!suffix) return;
    let hidPackage = false;
    let hidPallet = false;
    for (const p of this.packages) {
      const ps = this.idSuffix(p.externalId);
      if (!ps) continue;
      const samePackage = p.type === 'box' && ps === suffix;
      const samePallet = p.type === 'pallet' && (ps === suffix || (!!item.palletId && p.externalId === item.palletId));
      if (samePackage) { p.mesh.visible = false; hidPackage = true; }
      if (samePallet) { p.mesh.visible = false; hidPallet = true; }
    }
    if (!hidPackage) this.hideNearestAssemblerInput('box', -2);
    if (!hidPallet) this.hideNearestAssemblerInput('pallet', 2);
  }

  private hideNearestAssemblerInput(type: PackageType, laneZ: number): void {
    const assemblerPickupX = this.X_ASSEMBLER - 2.6;
    const nearest = this.packages
      .filter(p => p.type === type && p.mesh.visible !== false)
      .filter(p => Math.abs(p.mesh.position.z - laneZ) <= 1.2)
      .filter(p => Math.abs(p.mesh.position.x - assemblerPickupX) <= 2.2)
      .sort((a, b) => Math.abs(a.mesh.position.x - assemblerPickupX) - Math.abs(b.mesh.position.x - assemblerPickupX))[0];
    if (nearest) nearest.mesh.visible = false;
  }

  private isAssemblerInputBeingConsumed(p: Package3D): boolean { if (!p || p.mesh.visible !== false) return false; if (!this.assemblerVisualActive) return false; return p.type === 'box' || p.type === 'pallet'; }
  private assemblerVisualProgress(time: number): number { if (!this.assemblerVisualActive) return 0; const elapsed = time - this.assemblerVisualStartedAt; if (elapsed <= this.ASSEMBLER_VISUAL_CYCLE_MS) return Math.min(1, Math.max(this.ASSEMBLER_MIN_PROGRESS, elapsed / this.ASSEMBLER_VISUAL_CYCLE_MS)); if (elapsed <= this.ASSEMBLER_VISUAL_CYCLE_MS + this.ASSEMBLER_VISUAL_HOLD_MS) return 1; const suffix = this.idSuffix(this.assemblerVisualCaseId); if (suffix) { this.assemblerHeldSuffixes.delete(suffix); this.assemblerReleasedSuffixes.add(suffix); this.releaseAssembledOutput(suffix); } this.assemblerVisualActive = false; this.assemblerVisualCaseId = null; return 1; }
  private releaseAssembledOutput(suffix: string): void { for (const p of this.packages) { if (p.type !== 'assembled' || this.idSuffix(p.externalId) !== suffix) continue; p.mesh.visible = true; p.mesh.position.x = this.X_ASSEMBLED_START; p.mesh.position.y = 0; p.mesh.position.z = 0; p.targetX = Math.max(p.targetX, this.X_ASSEMBLED_START); p.targetY = 0; p.targetZ = 0; } }
  private assemblerArmAngle(progress: number): number { const p = Math.min(1, Math.max(0, progress)); if (p <= 0.5) { const t = p / 0.5; return this.ASSEMBLER_PACKAGE_ANGLE + (this.ASSEMBLER_PALLET_ANGLE - this.ASSEMBLER_PACKAGE_ANGLE) * t; } const t = (p - 0.5) / 0.5; return this.ASSEMBLER_PALLET_ANGLE + (this.ASSEMBLER_OUTPUT_ANGLE - this.ASSEMBLER_PALLET_ANGLE) * t; }
  private lanePickupProgress(type: PackageType, laneZ: number, loaderX: number, window: number): number { let best = 0; for (const p of this.packages) { if (p.type !== type) continue; if (Math.abs(p.mesh.position.z - laneZ) > .9) continue; const dx = Math.abs(p.mesh.position.x - loaderX); if (dx > window) continue; const normalized = 1 - dx / window; best = Math.max(best, Math.sin(normalized * Math.PI)); } return best; }
  private timedPickProgress(startedAt: number, time: number): number { if (!startedAt) return 0; const elapsed = time - startedAt; if (elapsed < 0 || elapsed > this.PICK_MOTION_MS) return 0; return Math.min(1, Math.max(0, elapsed / this.PICK_MOTION_MS)); }
  private applyArm(a: THREE.Group, j: THREE.Mesh, p: number) { const wave = Math.sin(p * Math.PI); a.rotation.y = wave * Math.PI / 2; j.rotation.x = Math.PI / 2 + wave * .35; }

  private isActive(s:string|null|undefined){const v=(s||'').toLowerCase(); return v.includes('producing')||v.includes('running')||v.includes('busy')||v.includes('active');}
  private updateOverlaysAndTooltips(): void {
    const container = this.rendererContainer.nativeElement; const canvas = this.renderer.domElement; const containerRect = container.getBoundingClientRect(); const canvasRect = canvas.getBoundingClientRect(); const width = canvasRect.width || container.clientWidth; const height = canvasRect.height || container.clientHeight; const offsetX = canvasRect.left - containerRect.left; const offsetY = canvasRect.top - containerRect.top;
    const overlays: Array<PackageOverlay & { worldX: number; worldZ: number; packageType: PackageType }> = [];
    for (const p of this.packages) { if (p.mesh.visible === false) continue; const ps = this.idSuffix(p.externalId); if (p.type === 'assembled' && ps && this.assemblerHeldSuffixes.has(ps)) continue; const pos = new THREE.Vector3(); p.mesh.getWorldPosition(pos); const worldX = pos.x; const worldZ = pos.z; pos.y += p.type === 'assembled' ? 2 : 1.2; pos.project(this.camera); if (pos.z < 1) { const x = offsetX + (pos.x * .5 + .5) * width; const y = offsetY + (-(pos.y * .5 - .5) * height); if (x >= -80 && x <= containerRect.width + 80 && y >= -80 && y <= containerRect.height + 80) overlays.push({ id: p.id, x, y, type: p.type, state: p.state, externalId: p.externalId, showLabel: true, worldX, worldZ, packageType: p.type }); } }
    this.applyFeedLabelPolicy(overlays); this.packageOverlays.set(overlays.map(({ worldX, worldZ, packageType, ...overlay }) => overlay));
    const screen = (x: number, y: number, z: number): { x: number; y: number } | null => { const p = new THREE.Vector3(x, y, z); p.project(this.camera); if (p.z > 1) return null; return { x: offsetX + (p.x * .5 + .5) * width, y: offsetY + (-(p.y * .5 - .5) * height) }; };
    const tips: RobotTooltipOverlay[] = []; const add = (id: RobotTooltipOverlay['id'], x: number, y: number, z: number) => { const p = screen(x, y, z); if (p) tips.push({ id, ...p }); };
    add('assembly', -4, 5.2, 0);
    add('package_loader', this.X_LOADER_BASE, 3.8, -4.2);
    add('pallet_loader', this.X_LOADER_BASE, 3.8, 4.2);
    add('camera_1', this.X_CAMERA_1 - 5.0, 7.8, 0);
    add('camera_2', this.X_CAMERA_2 - 4.7, 7.9, 0);
    add('labeler', this.X_LABELER, 8.2, 0);
    this.robotTooltips.set(tips);
  }

  private applyFeedLabelPolicy(overlays: Array<PackageOverlay & { worldX: number; worldZ: number; packageType: PackageType }>): void {
    const isOnFeed = (o: PackageOverlay & { worldX: number; worldZ: number; packageType: PackageType }) => (o.packageType === 'box' || o.packageType === 'pallet') && o.worldX >= this.X_SOURCE - 4 && o.worldX <= this.X_ASSEMBLER - 1.2 && (Math.abs(o.worldZ + 2) < .9 || Math.abs(o.worldZ - 2) < .9);
    const isOnAssemblerToCamera = (o: PackageOverlay & { worldX: number; worldZ: number; packageType: PackageType }) => o.packageType === 'assembled' && o.worldX >= this.X_ASSEMBLED_START - 1.5 && o.worldX <= this.X_CAMERA_1 + 0.8 && Math.abs(o.worldZ) < 1.2;
    const firstBox = overlays.filter(o => isOnFeed(o) && o.packageType === 'box').sort((a, b) => Math.abs(a.worldX - this.X_SOURCE) - Math.abs(b.worldX - this.X_SOURCE))[0];
    const firstPallet = overlays.filter(o => isOnFeed(o) && o.packageType === 'pallet').sort((a, b) => Math.abs(a.worldX - this.X_SOURCE) - Math.abs(b.worldX - this.X_SOURCE))[0];
    const assembledClosestToCamera = overlays.filter(o => isOnAssemblerToCamera(o)).sort((a, b) => Math.abs(a.worldX - this.X_CAMERA_1) - Math.abs(b.worldX - this.X_CAMERA_1))[0];
    const visibleIds = new Set<number>([firstBox?.id, firstPallet?.id, assembledClosestToCamera?.id].filter((id): id is number => id != null));
    for (const overlay of overlays) if (isOnFeed(overlay) || isOnAssemblerToCamera(overlay)) overlay.showLabel = visibleIds.has(overlay.id);
  }
  private findByExternalId(id:string|null){return id?this.packages.find(p=>p.externalId===id):undefined;} private removePackage(p:Package3D){this.scene.remove(p.mesh); this.packages=this.packages.filter(x=>x!==p);} private applyMaterial(p:Package3D){p.mesh.traverse((ch:any)=>{if(!ch.isMesh||!ch.material)return; const m=ch.material as THREE.MeshStandardMaterial; if(p.state==='fail'){m.color.setHex(0xffaaaa);m.emissive.setHex(0xaa0000);} else if(p.state==='ok'){m.color.setHex(0xaaffaa);m.emissive.setHex(0x001100);} else {m.emissive.setHex(0);}});}
  private onWindowResize(){ const c=this.rendererContainer.nativeElement; const r=c.getBoundingClientRect(); const w=r.width||c.clientWidth; const h=r.height||c.clientHeight; this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w,h,false); this.renderer.domElement.style.width='100%'; this.renderer.domElement.style.height='100%'; }
  public zoomIn(){this.camera.position.lerp(this.controls.target,.2);this.controls.update();} public zoomOut(){this.camera.position.lerp(this.controls.target,-.2);this.controls.update();} public pan(dx:number,dz:number){const v=new THREE.Vector3(dx,0,dz); v.applyQuaternion(this.camera.quaternion); v.y=0; if(v.lengthSq()===0)return; v.normalize().multiplyScalar(Math.max(Math.abs(dx),Math.abs(dz))); this.camera.position.add(v); this.controls.target.add(v); this.controls.update();} public resetLineScene(){ if(!this.scene) return; for(const p of [...this.packages]) this.scene.remove(p.mesh); this.packages=[]; this.packageCounter=0; this.pendingAssembledOutput.clear(); this.lastSpeedSnapshot=null; this.lastAssemblyCaseId=null; this.robotPickStartedAt=0; this.assemblerVisualStartedAt=0; this.assemblerVisualActive=false; this.assemblerVisualCaseId=null; this.assemblerHeldSuffixes.clear(); this.assemblerReleasedSuffixes.clear(); this.cameraVisualHoldSince.clear(); this.failedPackageSuffixes.clear(); this.failedPackageStopX.clear(); this.failedPackageHoldSince.clear(); this.removedFailedPackageSuffixes.clear(); if (this.robotArm) this.robotArm.rotation.y=this.ASSEMBLER_PACKAGE_ANGLE; if (this.robotJoint) this.robotJoint.rotation.x=Math.PI/2; this.packageOverlays.set([]); } public resetView(){this.camera.position.set(-45,25,35); this.controls.target.set(-20,0,0); this.controls.update();} public toggleWireframe(){let next:boolean|null=null; this.scene.traverse(ch=>{if(ch instanceof THREE.Mesh&&ch.material){const mats=Array.isArray(ch.material)?ch.material:[ch.material]; for(const mm of mats){const m=mm as THREE.MeshStandardMaterial; if('wireframe' in m){if(next===null)next=!m.wireframe; m.wireframe=next;}}}});}
}
