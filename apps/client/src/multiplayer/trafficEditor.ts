import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Client, type Room } from '@colyseus/sdk';
import { buildLaneGraph, validateTrafficNetwork, INTERP_DELAY_MS, zurichWorld, type WorldState } from '@race/shared';
import initialNetwork from '../../../../packages/shared/src/traffic-network.json';
import { addTrafficStroke, removeTrafficRoads } from './trafficEditing.ts';
import { TrafficRoadSurface } from './trafficRoadSurface.ts';
import type { TrafficPoint } from '@race/shared';
import { TrafficRenderer } from './traffic.ts';
import './trafficEditor.css';
import { randomUuid } from './randomUuid.ts';

/** Surface snapping is authoring-only; simulation consumes the independent JSON graph. */
export class TrafficEditor {
  active = false;
  private network = validateTrafficNetwork(initialNetwork);
  private speedLimit = this.network.roads[0]?.speed ?? 8;
  private selectedRoads = new Set<string>();
  private undoStroke?: typeof this.network;
  private undoDeletion?: typeof this.network;
  private roadLines?: THREE.LineSegments;
  private selected = '';
  private room?: Room<object, WorldState>;
  private ownsRoom = false;
  private connecting = false;
  private exportUrl?: string;
  private lastCommandTime = 0;
  private commandTimers = new Set<ReturnType<typeof setTimeout>>();
  private dead = false;
  private group = new THREE.Group();
  private surface?: TrafficRoadSurface;
  private stroke: TrafficPoint[] = [];
  private rawStroke: TrafficPoint[] = [];
  private strokeStopped = false;
  private preview?: THREE.Line;
  private panel = document.createElement('section');
  private controls: OrbitControls;
  private ray = new THREE.Raycaster();
  private abort = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private dirty = false;
  private sent = '';
  private clockOffset?: number;
  private latest = '';
  private latestSettings = '';
  private drag?: { x: number; y: number };
  private renderer?: TrafficRenderer;
  private unsubscribers: (() => void)[] = [];
  private cameraPose?: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  private mode!: HTMLSelectElement;
  private nodes!: HTMLSelectElement;
  private roads!: HTMLSelectElement;
  private status!: HTMLElement;
  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private canvas: HTMLCanvasElement,
    private map: THREE.Object3D, private inspection = false) {
    this.controls = new OrbitControls(camera, canvas); this.controls.enabled = false;
    this.controls.enableDamping = true; this.controls.minDistance = 5; this.controls.maxDistance = 2500;
    this.panel.className = 'traffic-editor';
    this.panel.innerHTML = `<button data-action="toggle">Traffic editor · F8</button>
      <div class="traffic-editor-body" hidden>
      <strong>Traffic network</strong><button data-action="focus">Focus roads</button><p data-field="simulation">Connect a room to simulate live.</p>
      ${inspection ? '<div><input data-field="room" placeholder="Room code (optional)" aria-label="Room code"><button data-action="connect">Create / join test room</button><button data-action="disconnect">Disconnect simulation</button></div>' : ''}
      <p data-field="status">Draw along a street. Lines snap to asphalt centers and heights. Right drag pans; wheel zooms.</p>
      <label>Click action <select data-field="mode"><option value="draw">Draw roads (drag)</option><option value="select">Select / orbit</option><option value="add">Add node</option><option value="move">Move selected</option><option value="connect">Connect selected → clicked</option><option value="delete">Delete node</option><option value="roadSelect">Select roads (click to toggle)</option></select></label>
      <button data-action="draw">Draw roads</button><button data-action="undoDraw">Undo last stroke</button>
      <small>Drag along streets, then release. Endpoints join nearby roads; new ends spawn/despawn cars. Cross existing roads to make intersections.</small>
      <label>Node <select data-field="nodes"></select></label>
      <div><label><input type="checkbox" data-field="spawn"> Spawn</label> <label><input type="checkbox" data-field="despawn"> Despawn</label></div>
      <fieldset><legend>Batch road removal</legend><button data-action="roadSelect">Select roads by clicking</button><p data-field="selection">0 roads selected</p><button data-action="deleteSelected">Delete selected roads</button><button data-action="clearSelection">Clear selection</button><button data-action="undoDelete">Undo deletion</button><small>Selected roads are orange. Click several roads, then delete them together.</small></fieldset>
      <label>Road <select data-field="roads"></select></label>
      <div><label><input type="checkbox" data-field="oneWay"> One-way (from → to)</label></div>
      <label>Lanes per direction <input type="number" min="1" max="4" value="1" data-field="lanes"></label>
      <label>Lane distance from center (m) <input type="number" min="1.6" max="12" step="0.25" value="1.6" data-field="laneOffset"></label>
      <button data-action="curbs">Move lanes toward curbs</button><button data-action="deleteRoad">Delete road</button>
      <label>Target cars <input type="number" min="0" max="60" value="60" data-field="density"></label>
      <label>Spawn interval (s) <input type="number" min="0.25" max="60" step="0.25" value="2" data-field="interval"></label>
      <label>All roads speed limit (km/h) <input type="number" min="3.6" max="90" step="0.1" value="28.8" data-field="speed"></label>
      <small>3.6–90 km/h for every road, including new roads. Changes apply live. Rush hour doubles this speed; free corners keep full speed; cars yield to traffic.</small>
      <button data-action="settings">Apply traffic settings</button><button data-action="rush">Rush hour · 2× speed</button><button data-action="normal">Normal speed</button><button data-action="start">Start round</button>
      <div><button data-action="save">Save JSON</button><button data-action="copy">Copy JSON</button><button data-action="load">Load JSON</button><input type="file" accept=".json,application/json" data-field="file" hidden></div>
      <textarea data-field="export" aria-label="Traffic network JSON" rows="6" readonly hidden></textarea>
      <small>Edits reset cars immediately. Dead ends despawn. Put spawns behind corners/buildings. Export JSON to keep your work.</small>
      </div>`;
    document.body.append(this.panel); scene.add(this.group); this.group.visible = false;
    this.mode = this.field('mode'); this.nodes = this.field('nodes'); this.roads = this.field('roads'); this.status = this.field('status');
    const signal = this.abort.signal;
    this.panel.addEventListener('click', e => {
      const action = (e.target as HTMLElement).dataset.action;
      if (action) void this.action(action).catch(error => this.message(String(error)));
    }, { signal });
    this.panel.addEventListener('change', e => this.change((e.target as HTMLElement).dataset.field ?? ''), { signal });
    canvas.addEventListener('pointerdown', e => {
      if (!this.active || e.button !== 0) return;
      this.drag = { x: e.clientX, y: e.clientY };
      if (this.mode.value === 'draw' && this.editable()) {
        this.surface ??= TrafficRoadSurface.forMap(this.map);
        this.stroke = []; this.rawStroke = []; this.strokeStopped = false; this.sampleStroke(e); canvas.setPointerCapture(e.pointerId);
      }
    }, { signal });
    canvas.addEventListener('pointermove', e => {
      if (this.drag && this.mode.value === 'draw' && (e.buttons & 1)) this.sampleStroke(e);
    }, { signal });
    canvas.addEventListener('pointerup', e => {
      const down = this.drag; this.drag = undefined;
      if (!this.active || e.button !== 0 || !down) return;
      if (this.mode.value === 'draw') {
        this.sampleStroke(e);
        try {
          if (!this.editable()) return;
          const network = addTrafficStroke(this.network, this.stroke, () => randomUuid().slice(0,8));
          this.undoStroke = structuredClone(this.network); this.network = this.surface!.placeLanes(network); this.publish();
          this.message(this.room ? 'Road drawn. Live traffic updates automatically.' : 'Road drawn. Reconnect the simulation to see cars.');
        } catch (error) { this.message(String(error)); }
        finally { this.clearStroke(); }
      } else if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) this.click(e);
    }, { signal });
    canvas.addEventListener('pointercancel', () => { this.drag = undefined; this.clearStroke(); }, { signal });
    window.addEventListener('keydown', e => { if (e.code === 'F8') { e.preventDefault(); this.toggle(); } }, { signal });
    this.mode.addEventListener('change', () => this.setControls(), { signal });
    if (inspection) {
      try { const draft = sessionStorage.getItem('traffic-editor-draft'); if (draft) { this.network = validateTrafficNetwork(JSON.parse(draft)); this.dirty = true; } } catch { /* Cached drafts are optional. */ }
    }
    this.speedLimit = this.network.roads[0]?.speed ?? 8;
    this.refresh();
    if (inspection) {
      this.renderer = new TrafficRenderer(scene, this.surface = TrafficRoadSurface.forMap(map)); this.toggle();
      void this.action('connect').catch(error => { if (!this.dead) this.message(`Could not start live simulation: ${String(error)}. Click Create / join test room to retry.`); });
    }
  }
  private field<T extends HTMLElement>(name: string): T { return this.panel.querySelector(`[data-field="${name}"]`)! as T; }
  private message(text: string) { this.status.textContent = text; }
  private setControls() {
    this.controls.mouseButtons.LEFT = this.mode.value === 'select' ? THREE.MOUSE.ROTATE : null;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  }
  private toggle() {
    this.active = !this.active;
    this.panel.querySelector<HTMLElement>('.traffic-editor-body')!.hidden = !this.active;
    this.canvas.closest<HTMLElement>('.map-viewer')?.toggleAttribute('data-traffic-editing', this.active);
    this.group.visible = this.active; if (!this.active) this.clearStroke(); this.controls.enabled = this.active; this.setControls();
    if (this.active) {
      if (document.pointerLockElement) void document.exitPointerLock();
      if (!this.inspection) {
        this.cameraPose = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() };
        const forward = this.camera.getWorldDirection(new THREE.Vector3());
        this.controls.target.copy(this.camera.position).addScaledVector(forward, 30);
        this.camera.position.y += 25;
      }
      this.focusRoads();
    } else if (this.cameraPose) {
      this.camera.position.copy(this.cameraPose.position); this.camera.quaternion.copy(this.cameraPose.quaternion); this.cameraPose = undefined;
    }
  }
  private focusRoads() {
    const bounds = new THREE.Box3();
    for (const node of this.network.nodes) bounds.expandByPoint(new THREE.Vector3(node.x, node.y, node.z));
    // Include HB in the editor overview; east stays right, toward ETH.
    bounds.expandByPoint(new THREE.Vector3(-287, 10, -66));
    if (!this.network.nodes.length) bounds.expandByPoint(new THREE.Vector3(zurichWorld.spawn.x, zurichWorld.spawn.y, zurichWorld.spawn.z));
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const extent = Math.max(100, size.x * 0.65, size.z * 0.7);
    this.controls.target.copy(center); this.camera.position.copy(center).add(new THREE.Vector3(0, extent * 1.2, extent));
    this.camera.lookAt(center); this.camera.updateMatrixWorld();
  }
  bind(room: Room<object, WorldState>) {
    if (this.room === room) return;
    this.room = room;
    this.unsubscribers.push(room.onMessage<{ ok: boolean; message: string }>('trafficResult', result => {
      this.message(result.message);
      if (!result.ok) { this.dirty = false; this.sent = ''; this.latest = ''; this.patch(room.state); }
    }));
    this.patch(room.state);
  }
  patch(state: WorldState) {
    if (state.serverTime && this.clockOffset === undefined) this.clockOffset = state.serverTime - Date.now();
    this.renderer?.patch(state);
    this.field<HTMLElement>('simulation').textContent = `${state.trafficCars?.size ?? 0} cars · target ${state.trafficDensity ?? 20} · ${state.trafficSpeedMultiplier ?? 1}× speed · ${state.phase === 'Lobby' && state.devMode ? 'Live lobby simulation' : state.phase}`;
    const json = state.trafficNetwork;
    if (this.sent && json === this.sent) {
      if (JSON.stringify(validateTrafficNetwork(this.network)) === this.sent) this.dirty = false;
      this.sent = '';
    }
    if (json && json !== this.latest && !this.dirty) {
      this.latest = json; this.network = validateTrafficNetwork(JSON.parse(json));
      this.speedLimit = this.network.roads[0]?.speed ?? this.speedLimit; this.refresh();
      if (this.inspection) { try { sessionStorage.setItem('traffic-editor-draft', JSON.stringify(this.network)); } catch { /* Export remains available. */ } }
    }
    const settings = `${state.trafficDensity}:${state.trafficSpawnInterval}:${state.trafficSpeedMultiplier}`;
    if (this.room && settings !== this.latestSettings) {
      this.latestSettings = settings;
      this.field<HTMLInputElement>('density').value = String(state.trafficDensity ?? 60);
      this.field<HTMLInputElement>('interval').value = String(state.trafficSpawnInterval ?? 2);
    }
  }
  private editable() {
    if (!this.room) return true;
    if (this.room.state.devMode && this.room.state.hostId === this.room.sessionId) return true;
    this.message('Only the development room host can edit. Create a test room to author traffic.'); return false;
  }
  private publish() {
    this.network.roads = this.network.roads.map(road => ({ ...road, speed: this.speedLimit }));
    this.dirty = true; this.refresh();
    if (this.inspection) { try { sessionStorage.setItem('traffic-editor-draft',JSON.stringify(this.network)); } catch { /* Export remains available when storage is disabled. */ } }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.room || this.dead) return;
      try {
        const network = validateTrafficNetwork(this.network);
        this.sent = JSON.stringify(network);
        this.sendCommand({ network });
      } catch (error) { this.message(String(error)); }
    }, 200);
  }
  private sendCommand(command: unknown) {
    const room = this.room;
    if (!room || this.dead) return;
    const now = Date.now(), delay = Math.max(0, this.lastCommandTime + 130 - now);
    this.lastCommandTime = now + delay;
    if (!delay) { room.send('trafficEdit', command); return; }
    const timer = setTimeout(() => {
      this.commandTimers.delete(timer);
      if (!this.dead && this.room === room) room.send('trafficEdit', command);
    }, delay);
    this.commandTimers.add(timer);
  }
  private refresh() {
    this.clearGraph();
    const graph = buildLaneGraph(this.network), coords: number[] = [], arrows: number[] = [];
    for (const path of graph.paths.values()) {
      for (let i = 1; i < path.points.length; i++) for (const p of [path.points[i - 1], path.points[i]]) coords.push(p.x, p.y + 0.25, p.z);
      if (!path.turn) {
        const a = path.points[0], b = path.points[1], x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, y = (a.y + b.y) / 2 + 0.4;
        const len = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
        for (const sign of [-1, 1]) arrows.push(x + dx * 2, y, z + dz * 2, x - dx - dz * sign, y, z - dz + dx * sign);
      }
    }
    for (const [points, color] of [[coords, '#ffd85a'], [arrows, '#ffffff']] as const) {
      const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), new THREE.LineBasicMaterial({ color, depthTest: false }));
      lines.renderOrder = 10; this.group.add(lines);
    }
    const roadCoords: number[] = [], roadColors: number[] = [], roadIds: string[] = [];
    for (const road of this.network.roads) {
      const color = new THREE.Color(this.selectedRoads.has(road.id) ? '#ff773b' : '#53c9e3');
      for (const id of [road.from, road.to]) { const p = this.network.nodes.find(n=>n.id===id)!; roadCoords.push(p.x,p.y+0.5,p.z); roadColors.push(color.r,color.g,color.b); }
      roadIds.push(road.id);
    }
    this.roadLines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(roadCoords,3)).setAttribute('color',new THREE.Float32BufferAttribute(roadColors,3)),new THREE.LineBasicMaterial({vertexColors:true,depthTest:false}));
    this.roadLines.userData.roadIds = roadIds; this.roadLines.renderOrder = 12; this.group.add(this.roadLines);
    this.field<HTMLElement>('selection').textContent = `${this.selectedRoads.size} roads selected`;
    const markers = new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial({depthTest:false}),this.network.nodes.length);
    const matrix = new THREE.Matrix4();
    this.network.nodes.forEach((node,i)=>{
      matrix.makeTranslation(node.x,node.y+0.7,node.z); markers.setMatrixAt(i,matrix);
      markers.setColorAt(i,new THREE.Color(node.id===this.selected?'#ffffff':node.spawn?'#42eb86':node.despawn?'#ff6767':'#52bfff'));
    });
    markers.userData.nodeIds=this.network.nodes.map(n=>n.id); markers.renderOrder=11; this.group.add(markers);
    this.nodes.replaceChildren(new Option('Select node', ''), ...this.network.nodes.map(n => new Option(n.id, n.id)));
    this.nodes.value = this.selected;
    const selectedRoad = this.roads.value;
    this.roads.replaceChildren(new Option('Select road', ''), ...this.network.roads.map(r => new Option(`${r.id}: ${r.from} → ${r.to}`, r.id)));
    this.roads.value = selectedRoad; this.updateFields();
  }
  private updateFields() {
    const node = this.network.nodes.find(n => n.id === this.selected), road = this.network.roads.find(r => r.id === this.roads.value);
    this.field<HTMLInputElement>('spawn').checked = !!node?.spawn; this.field<HTMLInputElement>('despawn').checked = !!node?.despawn;
    this.field<HTMLInputElement>('oneWay').checked = !!road?.oneWay;
    this.field<HTMLInputElement>('lanes').value = String(road?.lanes ?? 1);
    this.field<HTMLInputElement>('speed').value = String(Number((this.speedLimit * 3.6).toFixed(1)));
    this.field<HTMLInputElement>('laneOffset').value = String(road?.laneOffset ?? this.network.laneWidth / 2);
    this.field<HTMLInputElement>('laneOffset').min = String(road?.oneWay ? -12 : this.network.laneWidth / 2);
    for (const field of ['oneWay', 'lanes', 'laneOffset']) this.field<HTMLInputElement>(field).disabled = !road;
    for (const field of ['spawn', 'despawn']) this.field<HTMLInputElement>(field).disabled = !node;
  }
  private change(field: string) {
    if (field === 'nodes') { this.selected = this.nodes.value; this.refresh(); return; }
    if (field === 'roads') { this.updateFields(); return; }
    if (field === 'file') { void this.load(); return; }
    if (field === 'speed') {
      void this.action('settings').catch(error => this.message(String(error)));
      return;
    }
    if (!['spawn', 'despawn', 'oneWay', 'lanes', 'laneOffset'].includes(field) || !this.editable()) return;
    const node = this.network.nodes.find(n => n.id === this.selected), road = this.network.roads.find(r => r.id === this.roads.value);
    if ((field === 'spawn' || field === 'despawn') ? !node : !road) return;
    if (node && (field === 'spawn' || field === 'despawn')) node[field] = this.field<HTMLInputElement>(field).checked;
    if (road) {
      if (field === 'oneWay') {
        road.oneWay = this.field<HTMLInputElement>(field).checked;
        if (!road.oneWay) road.laneOffset = Math.max(this.network.laneWidth / 2, road.laneOffset ?? 0);
      }
      if (field === 'lanes') road.lanes = Math.max(1, Math.min(4, Math.round(Number(this.field<HTMLInputElement>(field).value))));
      if (field === 'laneOffset') road.laneOffset = Math.max(road.oneWay ? -12 : this.network.laneWidth / 2, Math.min(12, Number(this.field<HTMLInputElement>(field).value)));
    }
    this.publish();
  }
  private click(e: PointerEvent) {
    const mode = this.field<HTMLSelectElement>('mode').value;
    const rect = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), this.camera);
    const marker = this.ray.intersectObjects(this.group.children).find(hit => hit.object.userData.nodeIds && hit.instanceId !== undefined);
    const id: string | undefined = marker?.object.userData.nodeIds?.[marker.instanceId ?? 0];
    if (mode === 'roadSelect' && this.roadLines) {
      this.ray.params.Line.threshold = 2;
      const hit = this.ray.intersectObject(this.roadLines)[0];
      const roadId: string | undefined = hit && this.roadLines.userData.roadIds[Math.floor((hit.index ?? 0)/2)];
      if (roadId) { if (this.selectedRoads.has(roadId)) this.selectedRoads.delete(roadId); else this.selectedRoads.add(roadId); this.refresh(); }
      return;
    }
    if (mode === 'select') { if (id) { this.selected = id; this.refresh(); } return; }
    if (!this.editable()) return;
    if (mode === 'delete' && id) {
      this.network.nodes = this.network.nodes.filter(n => n.id !== id); this.network.roads = this.network.roads.filter(r => r.from !== id && r.to !== id);
      if (this.selected === id) this.selected = ''; this.publish(); return;
    }
    if (mode === 'connect' && id) {
      if (!this.selected) { this.selected = id; this.refresh(); return; }
      if (id !== this.selected && !this.network.roads.some(r => (r.from === id && r.to === this.selected) || (r.to === id && r.from === this.selected))) {
        const a = this.network.nodes.find(n => n.id === this.selected)!, b = this.network.nodes.find(n => n.id === id)!;
        if (Math.hypot(b.x - a.x, b.z - a.z) < 15) { this.message('Roads need at least 15 metres between nodes.'); return; }
        this.network.roads.push({ id: `road-${randomUuid().slice(0, 8)}`, from: this.selected, to: id, lanes: 1, speed: 8 });
        this.selected = id; this.publish();
      }
      return;
    }
    const point = this.ray.intersectObject(this.map, true)[0]?.point;
    if (!point) return;
    if (mode === 'add') {
      this.selected = `node-${randomUuid().slice(0, 8)}`;
      this.network.nodes.push({ id: this.selected, x: point.x, y: point.y, z: point.z }); this.publish();
    } else if (mode === 'move') {
      const node = this.network.nodes.find(n => n.id === this.selected);
      if (node) {
        const connected = this.network.roads.filter(r => r.from === node.id || r.to === node.id);
        if (connected.some(r => { const other = this.network.nodes.find(n => n.id === (r.from === node.id ? r.to : r.from))!; return Math.hypot(other.x - point.x, other.z - point.z) < 15; })) {
          this.message('Move would make a road shorter than 15 metres.'); return;
        }
        Object.assign(node, { x: point.x, y: point.y, z: point.z }); this.publish();
      }
    }
  }
  private async action(action: string) {
    if (action === 'toggle') { this.toggle(); return; }
    if (action === 'focus') { this.focusRoads(); return; }
    if (action === 'draw') { this.mode.value = 'draw'; this.setControls(); return; }
    if (action === 'undoDraw') { if (this.undoStroke && this.editable()) { this.network = this.undoStroke; this.undoStroke = undefined; this.selectedRoads.clear(); this.publish(); } return; }
    if (action === 'roadSelect') { this.mode.value = 'roadSelect'; this.setControls(); return; }
    if (action === 'clearSelection') { this.selectedRoads.clear(); this.refresh(); return; }
    if (action === 'deleteSelected') { if (this.editable()) this.deleteRoads(this.selectedRoads); return; }
    if (action === 'undoDelete') { if (this.undoDeletion && this.editable()) { this.network = this.undoDeletion; this.undoDeletion = undefined; this.selectedRoads.clear(); this.publish(); } return; }
    if (action === 'disconnect' && this.inspection) { this.disconnectSimulation(); return; }
    if (action === 'connect') {
      if (this.room) { this.message(`Connected to ${this.room.roomId}.`); return; }
      if (this.connecting) return;
      this.connecting = true;
      try {
      const url = import.meta.env.VITE_COLYSEUS_URL || `ws://${location.hostname}:2567`, client = new Client(url);
      const code = this.field<HTMLInputElement>('room').value.trim().toUpperCase();
      this.message('Connecting…');
      const room = code ? await client.joinById<WorldState>(code, { name: 'Traffic editor' }) : await client.create<WorldState>('race', { name: 'Traffic editor', code: `TR-${randomUuid().slice(0, 6).toUpperCase()}`, devMode: true, skipIntro: true });
      room.reconnection.enabled = false;
      if (!room.state.trafficNetwork) await new Promise<void>((resolve,reject) => {
        const complete = () => { if (!room.state.trafficNetwork) return; clearTimeout(timeout); room.onStateChange.remove(complete); resolve(); };
        const timeout = setTimeout(() => { room.onStateChange.remove(complete); void room.leave(); reject(new Error('Initial room state timed out. Try connecting again.')); },5000);
        room.onStateChange(complete); complete();
      });
      if (this.dead) { await room.leave(); return; }
      this.ownsRoom = true;
      const draft = this.network, hadDraft = this.dirty;
      this.dirty = false; this.bind(room);
      const onState = (state: WorldState) => this.patch(state);
      const onLeave = () => { if (this.room === room && !this.dead) this.disconnectSimulation(false); };
      room.onStateChange(onState); room.onLeave(onLeave);
      this.unsubscribers.push(() => room.onStateChange.remove(onState), () => room.onLeave.remove(onLeave));
      if (hadDraft && this.editable()) {
        this.network = validateTrafficNetwork(draft);
        this.speedLimit = this.network.roads[0]?.speed ?? this.speedLimit;
        if (JSON.stringify(this.network) !== room.state.trafficNetwork) this.publish();
        else { this.dirty = false; this.refresh(); }
      }
      this.field<HTMLInputElement>('room').value = room.roomId;
      this.message(`Room ${room.roomId}. Join this code in another tab to test multiplayer.`);
      } finally { this.connecting = false; }
      return;
    }
    if (action === 'save') {
      const data = validateTrafficNetwork(this.network);
      if (this.exportUrl) URL.revokeObjectURL(this.exportUrl);
      this.exportUrl = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = this.exportUrl; a.download = 'traffic-network.json';
      document.body.append(a); a.click(); a.remove();
      this.message('Exported traffic-network.json. Use Copy JSON if your browser does not save the download.'); return;
    }
    if (action === 'copy') {
      const output = this.field<HTMLTextAreaElement>('export');
      output.value = JSON.stringify(validateTrafficNetwork(this.network), null, 2); output.hidden = false; output.focus(); output.select();
      try { await navigator.clipboard.writeText(output.value); this.message('Traffic JSON copied. The text below can also be saved as traffic-network.json.'); }
      catch { this.message('Select and copy the JSON below, then save it as traffic-network.json.'); }
      return;
    }
    if (action === 'load') { this.field<HTMLInputElement>('file').click(); return; }
    if (!this.editable()) return;
    if (action === 'curbs') { this.surface ??= TrafficRoadSurface.forMap(this.map); this.undoStroke = structuredClone(this.network); this.network = this.surface.placeLanes(this.network); this.publish(); this.message('Lanes moved toward the asphalt edges, including one-way roads.'); return; }
    if (action === 'deleteRoad') this.deleteRoads(new Set([this.roads.value]));
    if (action === 'settings' || action === 'rush' || action === 'normal') {
      const requested = Number(this.field<HTMLInputElement>('speed').value);
      if (!Number.isFinite(requested) || requested <= 0) { this.message('Enter a speed limit from 3.6 to 90 km/h.'); return; }
      const speedLimit = Math.max(1, Math.min(25, requested / 3.6));
      this.field<HTMLInputElement>('speed').value = String(Number((speedLimit * 3.6).toFixed(1)));
      this.speedLimit = speedLimit;
      this.network.roads = this.network.roads.map(road => ({ ...road, speed: speedLimit }));
      if (this.inspection) { try { sessionStorage.setItem('traffic-editor-draft', JSON.stringify(this.network)); } catch { /* Export remains available. */ } }
      if (!this.room) { this.publish(); this.message('Speed limit saved for all roads. Connect a test room to simulate.'); return; }
      this.sendCommand({ settings: { density: Number(this.field<HTMLInputElement>('density').value), spawnInterval: Number(this.field<HTMLInputElement>('interval').value), speedLimit, speedMultiplier: action === 'rush' ? 2 : action === 'normal' ? 1 : this.room.state.trafficSpeedMultiplier ?? 1 } });
    }
    if (action === 'start') this.room?.send('ready', true);
  }
  private disconnectSimulation(leave = true) {
    const room = this.room, owned = this.ownsRoom;
    this.room = undefined; this.ownsRoom = false;
    for (const off of this.unsubscribers) off(); this.unsubscribers = [];
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    for (const timer of this.commandTimers) clearTimeout(timer); this.commandTimers.clear();
    this.lastCommandTime = 0; this.sent = ''; this.latest = ''; this.latestSettings = ''; this.clockOffset = undefined;
    this.dirty = true; this.renderer?.clear();
    this.field<HTMLInputElement>('room').value = '';
    this.field<HTMLElement>('simulation').textContent = 'Simulation disconnected. Reconnect to see cars.';
    this.message('Your road draft is kept. Click Create / join test room to reconnect, or enter another room code first.');
    if (leave && owned) void room?.leave().catch(() => {});
  }
  private deleteRoads(ids: ReadonlySet<string>) {
    if (!ids.size) return;
    this.undoDeletion = structuredClone(this.network);
    const before = this.network.roads.length;
    this.network = removeTrafficRoads(this.network,ids); this.selectedRoads.clear(); this.selected = ''; this.publish();
    this.message(`Removed ${before-this.network.roads.length} roads. Undo deletion restores the previous network.`);
  }
  private async load() {
    const input = this.field<HTMLInputElement>('file'), file = input.files?.[0]; input.value = '';
    if (!file || !this.editable()) return;
    try {
      if (file.size > 250000) throw new Error('Network file must be under 250 KB.');
      const network = validateTrafficNetwork(JSON.parse(await file.text()));
      if (this.dead) return;
      this.network = network; this.speedLimit = network.roads[0]?.speed ?? this.speedLimit;
      this.selectedRoads.clear(); this.selected = ''; this.publish(); this.message('Loaded JSON.');
    } catch (error) { this.message(String(error)); }
  }
  update() {
    if (this.active) this.controls.update();
    if (this.room && this.renderer) this.renderer.render(Date.now() + (this.clockOffset ?? 0) - INTERP_DELAY_MS);
  }
  private sampleStroke(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),this.camera);
    const hit=this.ray.intersectObject(this.map,true)[0];
    if(!hit || !this.surface) return;
    if(this.strokeStopped) return;
    const p=hit.point, previous=this.rawStroke.at(-1);
    const distance=previous ? Math.hypot(p.x-previous.x,p.z-previous.z) : 0;
    if(previous && distance<1.5) return;
    if(distance>200) {this.strokeStopped=true;this.message('Stroke stopped at a large jump. Release and draw the next street.');return;}
    const tangent=previous ? {x:p.x-previous.x,z:p.z-previous.z} : undefined;
    const count=Math.max(1,Math.ceil(distance/2));
    for(let i=1;i<=count;i++) {
      const raw=previous ? {x:previous.x+(p.x-previous.x)*i/count,y:previous.y+(p.y-previous.y)*i/count,z:previous.z+(p.z-previous.z)*i/count} : p;
      const snapped=this.surface.snap(raw,tangent);
      if(!snapped) {
        this.strokeStopped=true; this.message('Stroke stopped off the street. Release and draw the next street separately.'); break;
      }
      if(this.stroke.length===1 && previous) this.stroke[0]=this.surface.snap(previous,tangent) ?? this.stroke[0];
      this.stroke.push(snapped);this.rawStroke.push({x:raw.x,y:raw.y,z:raw.z});
    }
    if(!this.preview) {
      this.preview=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#42eb86',depthTest:false}));
      this.preview.renderOrder=20; this.scene.add(this.preview);
    }
    this.preview.geometry.dispose();
    this.preview.geometry=new THREE.BufferGeometry().setFromPoints(this.stroke.map(p=>new THREE.Vector3(p.x,p.y+0.15,p.z)));
  }
  private clearStroke() {
    this.stroke=[];this.rawStroke=[];this.strokeStopped=false;
    if(this.preview) {this.scene.remove(this.preview);this.preview.geometry.dispose();(this.preview.material as THREE.Material).dispose();this.preview=undefined;}
  }
  private clearGraph() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); if (child instanceof THREE.InstancedMesh) child.dispose(); }
    }
  }
  dispose() {
    this.dead = true; this.abort.abort(); if (this.exportUrl) URL.revokeObjectURL(this.exportUrl);
    for (const timer of this.commandTimers) clearTimeout(timer); this.commandTimers.clear();
    this.canvas.closest<HTMLElement>('.map-viewer')?.removeAttribute('data-traffic-editing'); if (this.timer) clearTimeout(this.timer);
    for (const off of this.unsubscribers) off();
    if (this.ownsRoom) void this.room?.leave().catch(() => {});
    this.controls.dispose(); this.clearGraph(); this.clearStroke(); this.scene.remove(this.group); this.panel.remove(); this.renderer?.dispose();
  }
}
