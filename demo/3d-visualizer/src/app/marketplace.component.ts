import { Component, ChangeDetectionStrategy, ViewChild, ElementRef, OnInit, OnDestroy, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface AssetProperty {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  value: string | number | boolean;
  options?: string[];
  unit?: string;
}

export interface AssetItem {
  id: string;
  name: string;
  description: string;
  type: string;
  thumbnail?: string;
  properties: AssetProperty[];
 // modelFn: () => THREE.Object3D;
  modelFn: (props?: AssetProperty[]) => THREE.Object3D;  // opzionale (future ready) 
   updateFn?: (obj: THREE.Object3D, props: AssetProperty[]) => void;  
   animateFn?: (obj: THREE.Object3D, delta: number) => void;
}

@Component({
  selector: 'app-marketplace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="flex h-full w-full bg-[#0c0d10] overflow-hidden">
      <!-- Asset List (Left Side) -->
      <div class="w-80 border-r border-slate-800 bg-[#111318] flex flex-col h-full overflow-y-auto shrink-0">
        <header class="p-4 border-b border-slate-800">
          <h2 class="text-sm font-bold text-slate-100 uppercase tracking-widest">Asset Hub</h2>
          <p class="text-[10px] text-slate-400 mt-1">Select an asset to preview</p>
        </header>
        <div class="p-4 flex flex-col gap-3">
          @for (asset of assets; track asset.id) {
            <div (click)="selectAsset(asset)" 
                 class="cursor-pointer border rounded-lg p-3 transition-colors text-left"
                 [class.bg-indigo-900/30]="selectedAsset()?.id === asset.id"
                 [class.border-indigo-500/50]="selectedAsset()?.id === asset.id"
                 [class.bg-slate-800/50]="selectedAsset()?.id !== asset.id"
                 [class.border-slate-700]="selectedAsset()?.id !== asset.id"
                 [class.hover:bg-slate-800]="selectedAsset()?.id !== asset.id">
              <div class="text-[10px] uppercase font-bold tracking-wider mb-1"
                   [class.text-indigo-400]="selectedAsset()?.id === asset.id"
                   [class.text-slate-400]="selectedAsset()?.id !== asset.id">
                {{ asset.type }}
              </div>
              <h3 class="text-xs font-bold text-slate-200 mb-1">{{ asset.name }}</h3>
              <p class="text-[10px] text-slate-500 leading-snug">{{ asset.description }}</p>
            </div>
          }
        </div>
      </div>
      
      <!-- Preview Area (Center) -->
      <div class="flex-1 flex flex-col relative h-full">
        <!-- Canvas -->
        <div #rendererContainer class="absolute inset-0"></div>
        
        <!-- Controls Overlay -->
        <div class="absolute bottom-4 left-4 pointer-events-none">
           @if (selectedAsset()) {
             <div class="bg-black/60 backdrop-blur border border-white/10 p-4 rounded-lg max-w-sm">
               <h2 class="text-lg font-bold text-white mb-1">{{ selectedAsset()?.name }}</h2>
               <div class="text-[10px] uppercase text-indigo-400 font-bold mb-2 tracking-widest">{{ selectedAsset()?.type }}</div>
               <p class="text-xs text-slate-300 leading-relaxed">{{ selectedAsset()?.description }}</p>
             </div>
           } @else {
             <div class="bg-black/60 backdrop-blur border border-white/10 p-4 rounded text-slate-300 text-sm">
               No asset selected
             </div>
           }
        </div>
        
        <div class="absolute bottom-4 right-4 text-[10px] text-slate-500 font-mono">
          Drag to rotate • Scroll to zoom
        </div>
      </div>

      <!-- Properties Panel (Right Side) -->
      <div class="w-80 border-l border-slate-800 bg-[#111318] flex flex-col h-full overflow-y-auto shrink-0">
        <header class="p-4 border-b border-slate-800">
          <h2 class="text-sm font-bold text-slate-100 uppercase tracking-widest">Configuration</h2>
          <p class="text-[10px] text-slate-400 mt-1">Personalize asset properties</p>
        </header>
        
        @if (selectedAsset()) {
          <div class="p-4 flex-1 flex flex-col gap-5">
            @for (prop of selectedAsset()?.properties; track prop.name) {
              <div class="space-y-1">
                <label class="text-[10px] uppercase font-bold tracking-wider text-slate-400">{{ prop.name }}</label>
                @if (prop.type === 'number') {
                  <div class="flex items-center gap-2">
                    <input type="number" [value]="prop.value" class="w-full bg-[#0c0d10] border border-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 outline-none focus:border-indigo-500 hover:border-slate-500 transition-colors">
                    @if (prop.unit) {
                      <span class="text-xs text-slate-500 font-medium">{{ prop.unit }}</span>
                    }
                  </div>
                } @else if (prop.type === 'enum') {
                  <select class="w-full bg-[#0c0d10] border border-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 outline-none focus:border-indigo-500 hover:border-slate-500 transition-colors appearance-none">
                    @for (opt of prop.options; track opt) {
                      <option [value]="opt" [selected]="opt === prop.value">{{ opt }}</option>
                    }
                  </select>
                } @else if (prop.type === 'boolean') {
                  <label class="flex items-center gap-2 cursor-pointer mt-1">
                    <input type="checkbox" [checked]="prop.value" class="accent-indigo-500 w-4 h-4 rounded bg-[#0c0d10] border-slate-700">
                    <span class="text-sm text-slate-300">Enabled</span>
                  </label>
                } @else {
                  <input type="text" [value]="prop.value" class="w-full bg-[#0c0d10] border border-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 outline-none focus:border-indigo-500 hover:border-slate-500 transition-colors">
                }
              </div>
            }
          </div>
          
          <div class="p-4 border-t border-slate-800 mt-auto shrink-0 bg-[#0c0d10]/50">
            <button (click)="onImportClick()" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold uppercase py-3 rounded transition-colors shadow-lg shadow-indigo-900/50 flex items-center justify-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              Import to Scene
            </button>
          </div>
        } @else {
          <div class="p-4 flex-1 flex items-center justify-center text-slate-500 text-sm text-center">
            Select an asset to configure its properties
          </div>
        }
      </div>
    </div>
  `
})
export class MarketplaceComponent implements OnInit, OnDestroy {
  @ViewChild('rendererContainer', { static: true })
  rendererContainer!: ElementRef<HTMLDivElement>;

  public importRequest = output<AssetItem>();

  public assets: AssetItem[] = [
    {
      id: 'robot-loader',
      name: 'Box Loader Module',
      description: 'Automated 2-axis loader for picking and placing incoming packages onto the main conveyor belt.',
      type: 'Assembly Robot',
      properties: [
        { name: 'Max Payload', type: 'number', value: 15, unit: 'kg' },
        { name: 'Operating Speed', type: 'number', value: 3.5, unit: 'm/s' },
        { name: 'Gripper Type', type: 'enum', value: 'Vacuum', options: ['Vacuum', 'Mechanical', 'Magnetic'] },
        { name: 'Safety Laser Scanner', type: 'boolean', value: true }
      ],
      modelFn: () => this.createBoxLoader()
    },
    {
      id: 'assembly-robot',
      name: 'Delta Assembly Robot',
      description: 'High-speed delta robot for precision assembly and picking operations on moving lines.',
      type: 'Robotics',
      properties: [
        { name: 'Workspace Diameter', type: 'number', value: 1200, unit: 'mm' },
        { name: 'Cycle Time', type: 'number', value: 0.3, unit: 's' },
        { name: 'Visual Tracking', type: 'boolean', value: true },
        { name: 'Kinematics Model', type: 'enum', value: 'Standard Delta', options: ['Standard Delta', 'Rotational TCP'] }
      ],
      modelFn: () => this.createDeltaRobot()
    },
    {
      id: 'line-roller',
      name: 'Heavy Duty Line Roller',
      description: 'Motorized roller conveyor segment designed for heavy pallets and continuous 24/7 operation.',
      type: 'Conveyor',
      properties: [
        { name: 'Length', type: 'number', value: 4, unit: 'm' },
        { name: 'Roller Material', type: 'enum', value: 'Steel', options: ['Steel', 'Rubber Coated', 'Polyurethane'] },
        { name: 'Motor Power', type: 'number', value: 0.75, unit: 'kW' },
        { name: 'Variable Frequency Drive', type: 'boolean', value: true }
      ],
      modelFn: () => this.createLineRoller()
    },
    {
      id: 'camera-station',
      name: 'Vision QA Station',
      description: 'Mountable camera array for high-speed automated visual inspection and defect detection.',
      type: 'Sensor',
      properties: [
        { name: 'Resolution', type: 'enum', value: '4K (8MP)', options: ['1080p (2MP)', '4K (8MP)', '12MP High Res'] },
        { name: 'Frame Rate', type: 'number', value: 120, unit: 'fps' },
        { name: 'Infrared Illumination', type: 'boolean', value: false },
        { name: 'AI Processing Unit', type: 'boolean', value: true }
      ],
      modelFn: () => this.createCameraStation()
    },
    {
      id: 'comau-robot',
      name: 'Comau Flexible Assembler',
      description: 'Heavy duty articulated robot arm for main assembly and complex manipulation.',
      type: 'Assembly Robot',
      properties: [
        { name: 'Reach', type: 'number', value: 2.2, unit: 'm' },
        { name: 'Max Payload', type: 'number', value: 50, unit: 'kg' },
        { name: 'Degrees of Freedom', type: 'number', value: 6, unit: 'DoF' },
        { name: 'Style', type: 'enum', value: 'Industrial', options: ['Industrial', 'Modern', 'Stealth'] }
      ],
      modelFn: () => this.createComauRobot()
    },
   
{
  id: 'agv-robot',
  name: 'Autonomous Mobile Robot (AMR)',
  description: 'Self-navigating mobile robot for internal logistics and pallet transport.',
  type: 'Logistics',
  properties: [
    {
      name: 'Navigation Type',
      type: 'enum',
      value: 'SLAM',
      options: ['SLAM', 'QR Code', 'Magnetic Tape']
    },
    {
      name: 'Max Speed',
      type: 'number',
      value: 1.5,
      unit: 'm/s'
    },
    {
      name: 'Payload Capacity',
      type: 'number',
      value: 300,
      unit: 'kg'
    },
    {
      name: 'Battery Level',
      type: 'number',
      value: 80,
      unit: '%'
    },
    {
      name: 'Obstacle Detection',
      type: 'boolean',
      value: true
    },
    {
      name: 'Charging Mode',
      type: 'enum',
      value: 'Auto Dock',
      options: ['Manual', 'Auto Dock']
    }

  ],
  modelFn: (props) => this.createAGV(props),
   animateFn: (obj, delta) => this.animateAGV(obj, delta, this.selectedAsset()?.properties || [])
},
{
  id: 'lidar-sensor',
  name: '3D LIDAR Scanner',
  description: 'High-frequency laser scanner for mapping, obstacle detection, and navigation.',
  type: 'Sensor',
  properties: [
    { name: 'Range', type: 'number', value: 30, unit: 'm' },
    { name: 'Field of View', type: 'number', value: 270, unit: 'deg' },
    { name: 'Resolution', type: 'enum', value: 'High', options: ['Low', 'Medium', 'High'] },
    { name: 'Real-time Processing', type: 'boolean', value: true }
  ],
  modelFn: (props) => this.createLidarSensor(props)
},
{
  id: 'digital-node',
  name: 'Digital Twin Node',
  description: 'Logical representation of a connected device with real-time data streaming.',
  type: 'Digital',
  properties: [
    { name: 'Status', type: 'enum', value: 'Online', options: ['Online', 'Offline', 'Error'] },
    { name: 'Latency', type: 'number', value: 20, unit: 'ms' },
    { name: 'Data Throughput', type: 'number', value: 120, unit: 'msg/s' },
    { name: 'AI Enabled', type: 'boolean', value: true }
  ],
  modelFn: (props) => this.createDigitalNode(props)
}


  ];

  public selectedAsset = signal<AssetItem | null>(null);

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private currentObject: THREE.Object3D | null = null;
  private animationFrameId: number | null = null;

  ngOnInit() {
    this.initThreeJs();
    this.selectAsset(this.assets[0]);
    this.lastTime = performance.now();
  }

  ngOnDestroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.renderer.dispose();
  }

  private initThreeJs() {
    const container = this.rendererContainer.nativeElement;
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0d10);
    // this.scene.fog = new THREE.Fog(0x0c0d10, 10, 50);

    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(-8, 6, 8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xb0c4de, 0.4);
    fillLight.position.set(-10, 10, -10);
    this.scene.add(fillLight);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(20, 20, 0x333333, 0x222222);
    this.scene.add(gridHelper);

    // Floor plane to receive shadows
    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.5 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    window.addEventListener('resize', this.onWindowResize.bind(this));

    this.animate();
  }

  public selectAsset(asset: AssetItem) {
    this.selectedAsset.set(asset);
    
    if (this.currentObject) {
      this.scene.remove(this.currentObject);
    }
    
    //FRA this.currentObject = asset.modelFn();
    this.currentObject = asset.modelFn(asset.properties);
    this.scene.add(this.currentObject);
    
    // reset controls
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(-8, 6, 8);
    this.controls.update();
  }

  public onImportClick() {
    const asset = this.selectedAsset();
    if (asset) {
      this.importRequest.emit(asset);
    }
  }

  private lastTime = 0;
  private animate() {
      this.animationFrameId = requestAnimationFrame(() => this.animate());

        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;  
        this.lastTime = now;

        this.controls.update();

        if (this.currentObject) {
          this.currentObject.rotation.y += 0.5 * delta;

          const asset = this.selectedAsset();

          if (asset?.animateFn) {
            asset.animateFn(this.currentObject, delta); 
          }
        }

        this.renderer.render(this.scene, this.camera);

  }

  private onWindowResize() {
    const container = this.rendererContainer.nativeElement;
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  // --- Model Generators ---

  private createBoxLoader(): THREE.Object3D {
    const group = new THREE.Group();
    const materialBase = new THREE.MeshStandardMaterial({ color: 0x4f5d75, roughness: 0.5 });
    const materialActuator = new THREE.MeshStandardMaterial({ color: 0xbac1b8, roughness: 0.2, metalness: 0.8 });
    
    const baseGeo = new THREE.BoxGeometry(2, 0.5, 2);
    const base = new THREE.Mesh(baseGeo, materialBase);
    base.position.y = 0.25;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const pillarGeo = new THREE.BoxGeometry(0.5, 4, 0.5);
    const pillar = new THREE.Mesh(pillarGeo, materialBase);
    pillar.position.set(-0.5, 2.5, 0);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);

    const armGeo = new THREE.BoxGeometry(2.5, 0.4, 0.4);
    const arm = new THREE.Mesh(armGeo, materialActuator);
    arm.position.set(0.5, 4, 0);
    arm.castShadow = true;
    arm.receiveShadow = true;
    group.add(arm);

    const gripperGeo = new THREE.CylinderGeometry(0.1, 0.1, 1);
    const gripper = new THREE.Mesh(gripperGeo, materialActuator);
    gripper.position.set(1.5, 3.5, 0);
    gripper.castShadow = true;
    group.add(gripper);

    return group;
  }

  private createDeltaRobot(): THREE.Object3D {
    const group = new THREE.Group();
    const materialWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const materialDark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
    
    // Top mount
    const mountGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.5, 32);
    const mount = new THREE.Mesh(mountGeo, materialDark);
    mount.position.y = 5;
    mount.castShadow = true;
    group.add(mount);

    // Three arms
    for (let i = 0; i < 3; i++) {
        const angle = (Math.PI * 2 / 3) * i;
        const armPivotGeo = new THREE.CylinderGeometry(0.2, 0.2, 2);
        armPivotGeo.rotateX(Math.PI/4);
        const arm = new THREE.Mesh(armPivotGeo, materialWhite);
        arm.position.set(Math.cos(angle)*1, 4, Math.sin(angle)*1);
        arm.lookAt(0, 2, 0); // pointing inward
        arm.castShadow = true;
        group.add(arm);
    }
    
    // Tool center point
    const tcpGeo = new THREE.CylinderGeometry(0.5, 0.3, 0.5, 16);
    const tcp = new THREE.Mesh(tcpGeo, materialDark);
    tcp.position.y = 2.5;
    tcp.castShadow = true;
    group.add(tcp);

    return group;
  }

  private createLineRoller(): THREE.Object3D {
    const group = new THREE.Group();
    const materialFrame = new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.6 });
    const materialRoller = new THREE.MeshStandardMaterial({ color: 0x718093, roughness: 0.3, metalness: 0.5 });
    
    // Side frames
    const frameGeo = new THREE.BoxGeometry(4, 0.5, 0.2);
    const leftFrame = new THREE.Mesh(frameGeo, materialFrame);
    leftFrame.position.set(0, 1, -1);
    leftFrame.castShadow = true;
    leftFrame.receiveShadow = true;
    group.add(leftFrame);

    const rightFrame = new THREE.Mesh(frameGeo, materialFrame);
    rightFrame.position.set(0, 1, 1);
    rightFrame.castShadow = true;
    rightFrame.receiveShadow = true;
    group.add(rightFrame);
    
    // Legs
    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 1);
    for(let x of [-1.5, 1.5]) {
       for (let z of [-1, 1]) {
           const leg = new THREE.Mesh(legGeo, materialFrame);
           leg.position.set(x, 0.5, z);
           leg.castShadow = true;
           group.add(leg);
       }
    }

    // Rollers
    const rollerGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.8, 16);
    rollerGeo.rotateX(Math.PI / 2);
    
    for (let x = -1.8; x <= 1.8; x += 0.4) {
        const roller = new THREE.Mesh(rollerGeo, materialRoller);
        roller.position.set(x, 1.1, 0);
        roller.castShadow = true;
        roller.receiveShadow = true;
        group.add(roller);
    }

    return group;
  }

private createAGV(props?: AssetProperty[]): THREE.Object3D {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x00a8ff, emissive: 0x002244 });

  // Base
  const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 1.2), bodyMat);
  base.position.y = 0.25;
  base.castShadow = true;
  group.add(base);

  // Top unit
  const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 0.6), accentMat);
  top.position.y = 0.75;
  group.add(top);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.2, 16);
  wheelGeo.rotateZ(Math.PI / 2);

  for (let x of [-0.8, 0.8]) {
    for (let z of [-0.5, 0.5]) {
      const wheel = new THREE.Mesh(wheelGeo, bodyMat);
      wheel.position.set(x, 0.2, z);
      group.add(wheel);
    }
  }

  // Lidar dome
  const lidar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.25, 0.2),
    accentMat
  );
  lidar.position.y = 1;
  group.add(lidar);

  return group;
}
private animateAGV(obj: THREE.Object3D, delta: number, props: AssetProperty[]) {
  const speedProp = props.find(p => p.name === 'Max Speed');
  const batteryProp = props.find(p => p.name === 'Battery Level');

 
const navProp = props.find(p => p.name === 'Navigation Type');
const navType = navProp?.value;

  const speed = (speedProp?.value as number || 0) * 0.5; // scaling visivo
  const battery = (batteryProp?.value as number || 0);

  //  movimento base lungo X
  obj.position.x += speed * delta;



let effectiveSpeed = speed;

if (battery < 20) {
  effectiveSpeed *= 0.3;
}

obj.position.x += effectiveSpeed * delta;


  if (navType === 'SLAM') {
    obj.position.z = Math.sin(Date.now() * 0.001) * 2;
  }

  if (navType === 'QR Code') {
    const step = Math.floor(Date.now() / 1000) % 4;
    obj.position.z = step;
  }

  if (navType === 'Magnetic Tape') {
    obj.position.z = 0;
  }


  //  loop posizione (tipo linea infinita)
  if (obj.position.x > 5) {
    obj.position.x = -5;
  }

  //  rotazione ruote (se presenti)
  obj.traverse(child => {
    if (child instanceof THREE.Mesh && child.geometry.type === 'CylinderGeometry') {
      child.rotation.x -= speed * 2;
    }
  });

 

  // ✅ lampeggio "low battery"
  if (battery < 15) {
   
    obj.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;

        const mats = Array.isArray(child.material) ? child.material : [child.material];

        mats.forEach(m => {
          if (m instanceof THREE.MeshStandardMaterial) {
            m.emissive.setHex(0x330000);
          }
        });
      });

    }
}

private createLidarSensor(props?: AssetProperty[]): THREE.Object3D {
  const group = new THREE.Group();

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const laserMat = new THREE.MeshStandardMaterial({
    color: 0x00ffcc,
    emissive: 0x004444
  });

  // Base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2), baseMat);
  base.castShadow = true;
  group.add(base);

  // Rotating head
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3), laserMat);
  head.position.y = 0.25;
  group.add(head);

  // Beam visualization
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(3, 1, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      opacity: 0.15,
      transparent: true
    })
  );

  beam.rotation.x = Math.PI / 2;
  beam.position.y = 0.4;
  group.add(beam);

  return group;
}

private createDigitalNode(props?: AssetProperty[]): THREE.Object3D {
  const group = new THREE.Group();

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x6c5ce7,
    emissive: 0x1a0dab,
    metalness: 0.8
  });

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00d2ff,
    wireframe: true
  });

  // Core sphere
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 32), coreMat);
  group.add(core);

  // Orbit rings
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1 + i * 0.3, 0.02, 16, 100),
      ringMat
    );
    ring.rotation.x = Math.random() * Math.PI;
    ring.rotation.y = Math.random() * Math.PI;
    group.add(ring);
  }

  return group;
}



  private createCameraStation(): THREE.Object3D {
      const group = new THREE.Group();
      const materialMount = new THREE.MeshStandardMaterial({ color: 0xe1b12c, roughness: 0.4 }); // yellowish
      const materialDevice = new THREE.MeshStandardMaterial({ color: 0x192a56, roughness: 0.2 });
      const materialLens = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.05, metalness: 0.9 });
      
      // Stand
      const standGeo = new THREE.CylinderGeometry(0.1, 0.1, 3);
      const stand = new THREE.Mesh(standGeo, materialMount);
      stand.position.y = 1.5;
      stand.castShadow = true;
      group.add(stand);
      
      // Base
      const baseGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.1);
      const base = new THREE.Mesh(baseGeo, materialMount);
      base.position.y = 0.05;
      base.castShadow = true;
      group.add(base);

      // Camera body
      const camGeo = new THREE.BoxGeometry(0.6, 0.4, 0.8);
      const cam = new THREE.Mesh(camGeo, materialDevice);
      cam.position.set(0, 3, 0.2);
      cam.rotation.x = Math.PI / 6; // pointing down
      cam.castShadow = true;
      group.add(cam);

      // Lens
      const lensGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.2);
      lensGeo.rotateX(Math.PI/2);
      const lens = new THREE.Mesh(lensGeo, materialLens);
      lens.position.set(0, 3 - 0.1, 0.6);
      lens.rotation.x = Math.PI / 6;
      group.add(lens);

      return group;
  }

  private createComauRobot(): THREE.Object3D {
    const style = 'industrial';
    
    let primaryColor = 0xdddddd;
    let highlightColor = 0xcc1111; // Red for industrial
    let jointColor = 0x333333;

    const primaryMat = new THREE.MeshStandardMaterial({ color: primaryColor, roughness: 0.5, metalness: 0.5 }); 
    const highlightMat = new THREE.MeshStandardMaterial({ color: highlightColor, roughness: 0.4, metalness: 0.8 }); 
    const jointMat = new THREE.MeshStandardMaterial({ color: jointColor, roughness: 0.8, metalness: 0.2 });
    
    const robotGroup = new THREE.Group();

    // Base Plate
    const baseGeo = new THREE.CylinderGeometry(1.4, 1.6, 0.4, 32);
    const basePlate = new THREE.Mesh(baseGeo, jointMat);
    basePlate.castShadow = true;
    basePlate.receiveShadow = true;
    robotGroup.add(basePlate);

    const robotArm = new THREE.Group();
    robotArm.position.set(0, 0.4, 0);
    robotGroup.add(robotArm);

    // Pedestal
    const pedGeo = new THREE.CylinderGeometry(1.1, 1.3, 1.6, 32);
    const pedestal = new THREE.Mesh(pedGeo, highlightMat);
    pedestal.position.set(0, 0.8, 0);
    pedestal.castShadow = true;
    robotArm.add(pedestal);

    // Shoulder Link
    const shoulderGeo = new THREE.BoxGeometry(0.8, 2.0, 0.8);
    const shoulderLink = new THREE.Mesh(shoulderGeo, primaryMat);
    shoulderLink.position.set(0, 1.8, 0);
    shoulderLink.castShadow = true;
    robotArm.add(shoulderLink);
    
    // Joint
    const jointGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.2, 32);
    jointGeo.rotateX(Math.PI / 2);
    const joint = new THREE.Mesh(jointGeo, jointMat);
    joint.position.set(0, 2.8, 0);
    joint.castShadow = true;
    robotArm.add(joint);

    // Upper Arm Link
    const upperArmGeo = new THREE.BoxGeometry(0.6, 2.2, 0.6);
    const upperArm = new THREE.Mesh(upperArmGeo, primaryMat);
    upperArm.position.set(0, 3.8, 0);
    upperArm.castShadow = true;
    robotArm.add(upperArm);

    // Elbow Joint
    const elbowGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 32);
    elbowGeo.rotateX(Math.PI / 2);
    const elbow = new THREE.Mesh(elbowGeo, jointMat);
    elbow.position.set(0, 4.8, 0);
    elbow.castShadow = true;
    robotArm.add(elbow);

    // Forearm Link
    const forearmGeo = new THREE.CylinderGeometry(0.4, 0.4, 2.0, 32);
    const forearm = new THREE.Mesh(forearmGeo, highlightMat);
    forearm.rotation.x = Math.PI / 2;
    forearm.position.set(0, 4.8, 1.0);
    forearm.castShadow = true;
    robotArm.add(forearm);

    // Tool Base
    const toolBaseGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.4, 32);
    toolBaseGeo.rotateX(Math.PI / 2);
    const toolBase = new THREE.Mesh(toolBaseGeo, jointMat);
    toolBase.position.set(0, 4.8, 2.2);
    toolBase.castShadow = true;
    robotArm.add(toolBase);

    return robotGroup;
  }
}
