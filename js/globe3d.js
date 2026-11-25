/**
 * Nagi 3D Realistic Brazil & States Prospecting Globe (Three.js)
 * Renders a photorealistic orbital Earth with procedural bathymetry/landmasses,
 * atmospheric Fresnel shader, all 27 Brazilian states with 3D borders + UF labels,
 * radar sonar sweeps, curved orbital data arcs, and live lead beacons.
 */
import { BRAZIL_STATES, WORLD_OUTLINES } from './brazil-geo.js';

const RADIUS = 5;

const CITY_COORDS = {
  'são paulo': { uf: 'SP', lat: -23.55, lon: -46.63 },
  'sao paulo': { uf: 'SP', lat: -23.55, lon: -46.63 },
  'campinas': { uf: 'SP', lat: -22.9, lon: -47.06 },
  'ribeirão preto': { uf: 'SP', lat: -21.17, lon: -47.81 },
  'santos': { uf: 'SP', lat: -23.96, lon: -46.33 },
  'rio de janeiro': { uf: 'RJ', lat: -22.91, lon: -43.17 },
  'belo horizonte': { uf: 'MG', lat: -19.92, lon: -43.94 },
  'uberlândia': { uf: 'MG', lat: -18.91, lon: -48.27 },
  'curitiba': { uf: 'PR', lat: -25.43, lon: -49.27 },
  'londrina': { uf: 'PR', lat: -23.31, lon: -51.16 },
  'florianópolis': { uf: 'SC', lat: -27.59, lon: -48.55 },
  'florianopolis': { uf: 'SC', lat: -27.59, lon: -48.55 },
  'joinville': { uf: 'SC', lat: -26.3, lon: -48.84 },
  'porto alegre': { uf: 'RS', lat: -30.03, lon: -51.22 },
  'salvador': { uf: 'BA', lat: -12.97, lon: -38.5 },
  'fortaleza': { uf: 'CE', lat: -3.73, lon: -38.52 },
  'recife': { uf: 'PE', lat: -8.05, lon: -34.88 },
  'brasília': { uf: 'DF', lat: -15.79, lon: -47.88 },
  'brasilia': { uf: 'DF', lat: -15.79, lon: -47.88 },
  'goiânia': { uf: 'GO', lat: -16.68, lon: -49.26 },
  'goiania': { uf: 'GO', lat: -16.68, lon: -49.26 },
  'manaus': { uf: 'AM', lat: -3.11, lon: -60.02 },
  'belém': { uf: 'PA', lat: -1.45, lon: -48.5 },
  'vitória': { uf: 'ES', lat: -20.31, lon: -40.31 },
  'cuiabá': { uf: 'MT', lat: -15.6, lon: -56.09 },
  'campo grande': { uf: 'MS', lat: -20.46, lon: -54.62 },
  'natal': { uf: 'RN', lat: -5.79, lon: -35.2 },
  'joão pessoa': { uf: 'PB', lat: -7.11, lon: -34.86 },
  'maceió': { uf: 'AL', lat: -9.66, lon: -35.73 },
  'aracaju': { uf: 'SE', lat: -10.94, lon: -37.07 },
  'são luís': { uf: 'MA', lat: -2.53, lon: -44.3 },
  'teresina': { uf: 'PI', lat: -5.09, lon: -42.8 }
};

function latLonToVec3(lat, lon, r = RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

export class NagiBrazilGlobe3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container || typeof THREE === 'undefined') return;

    this.isScanning = false;
    this.activeUF = 'SP';
    this.targetLat = -15.5;
    this.targetLon = -50.0;
    this.scanProgress = 0;

    // Rotation state (centered initially on Brazil: lat -14.5, lon -51.5)
    const initRx = (-14.5 * Math.PI) / 180;
    const initRy = Math.PI / 2 - ((-51.5 + 180) * Math.PI) / 180;
    this.rot = { x: initRx, y: initRy, targetX: initRx, targetY: initRy };
    this.zoom = { dist: 14.0, targetDist: 14.0 };
    this.isDragging = false;
    this.prevPointer = { x: 0, y: 0 };

    this.stateMeshes = new Map();
    this.ufLabels = [];
    this.pulseRings = [];
    this.leadBeacons = [];
    this.scanArcs = [];
    this.clock = new THREE.Clock();

    this.initScene();
    this.buildEarthSphere();
    this.buildAtmosphere();
    this.buildStarfield();
    this.buildBrazilStates();
    this.buildOrbitalScanner();
    this.buildUFLabelsOverlay();
    this.bindPointer();
    this.focusBrazil(false);
    this.animate();
  }

  initScene() {
    const w = this.container.clientWidth || 700;
    const h = this.container.clientHeight || 420;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    this.camera.position.set(0, 0, this.zoom.dist);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Realistic sunlight + rim lighting
    this.scene.add(new THREE.AmbientLight(0x385980, 1.35));

    const sun = new THREE.DirectionalLight(0xf8fafc, 2.1);
    sun.position.set(12, 8, 14);
    this.scene.add(sun);

    const rimCyan = new THREE.DirectionalLight(0x2dd4bf, 1.15);
    rimCyan.position.set(-14, -4, -10);
    this.scene.add(rimCyan);

    const kintsugiLight = new THREE.PointLight(0xf5b942, 1.3, 30);
    kintsugiLight.position.set(6, 5, 10);
    this.scene.add(kintsugiLight);

    this.globeGroup = new THREE.Group();
    this.globeGroup.position.y = 0.32;
    this.scene.add(this.globeGroup);

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.container || !this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * Renders a sharp 2048x1024 equirectangular Earth texture with bathymetry,
   * continents, Brazil landmass shading, and subtle lat/lon grid.
   */
  createEarthTextures() {
    const W = 2048;
    const H = 1024;

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = W;
    diffCanvas.height = H;
    const ctx = diffCanvas.getContext('2d');

    const specCanvas = document.createElement('canvas');
    specCanvas.width = W;
    specCanvas.height = H;
    const sctx = specCanvas.getContext('2d');

    const emitCanvas = document.createElement('canvas');
    emitCanvas.width = W;
    emitCanvas.height = H;
    const ectx = emitCanvas.getContext('2d');

    // 1. Photorealistic ocean bathymetry gradient
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, H);
    oceanGrad.addColorStop(0, '#071b33');
    oceanGrad.addColorStop(0.25, '#072244');
    oceanGrad.addColorStop(0.5, '#092c54');
    oceanGrad.addColorStop(0.75, '#072244');
    oceanGrad.addColorStop(1, '#061529');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, W, H);

    // Specular: oceans are glossy, land is matte
    sctx.fillStyle = '#99c8e8';
    sctx.fillRect(0, 0, W, H);

    // Emissive: black ocean base
    ectx.fillStyle = '#000000';
    ectx.fillRect(0, 0, W, H);

    // Ocean depth swells & ridges
    for (let i = 0; i < 80; i++) {
      const rx = (Math.sin(i * 19.3) * 0.5 + 0.5) * W;
      const ry = (Math.cos(i * 7.7) * 0.5 + 0.5) * H;
      const rad = 70 + (i % 6) * 45;
      const g = ctx.createRadialGradient(rx, ry, 5, rx, ry, rad);
      g.addColorStop(0, 'rgba(20, 110, 155, 0.20)');
      g.addColorStop(1, 'rgba(7, 29, 58, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(rx, ry, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle lat/lon lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 15) {
      const x = ((lon + 180) / 360) * W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let lat = -75; lat <= 75; lat += 15) {
      const y = ((90 - lat) / 180) * H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const drawRing = (c, ring) => {
      c.beginPath();
      ring.forEach(([lon, lat], idx) => {
        const x = ((lon + 180) / 360) * W;
        const y = ((90 - lat) / 180) * H;
        if (idx === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      });
      c.closePath();
    };

    // World Continents (realistic deep slate-olive terrain + coastal shelf glow)
    WORLD_OUTLINES.forEach((poly) => {
      drawRing(ctx, poly);
      ctx.shadowColor = 'rgba(45, 212, 191, 0.35)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#153240';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      drawRing(sctx, poly);
      sctx.fillStyle = '#10141a';
      sctx.fill();
    });

    // Brazil States (lush Amazon/Cerrado emerald-teal orbital relief)
    BRAZIL_STATES.forEach((st, idx) => {
      st.polys.forEach((poly) => {
        drawRing(ctx, poly);
        ctx.shadowColor = 'rgba(45, 212, 191, 0.45)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = idx % 3 === 0 ? '#184b49' : idx % 3 === 1 ? '#1c5652' : '#144144';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(94, 234, 212, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        drawRing(sctx, poly);
        sctx.fillStyle = '#0e171c';
        sctx.fill();
      });

      // Warm city-light glow around each state hub
      const [clon, clat] = st.center;
      const cx = ((clon + 180) / 360) * W;
      const cy = ((90 - clat) / 180) * H;
      const cg = ectx.createRadialGradient(cx, cy, 1, cx, cy, 16);
      cg.addColorStop(0, 'rgba(253, 224, 71, 0.92)');
      cg.addColorStop(0.35, 'rgba(245, 158, 11, 0.45)');
      cg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ectx.fillStyle = cg;
      ectx.beginPath();
      ectx.arc(cx, cy, 16, 0, Math.PI * 2);
      ectx.fill();
    });

    // Extra coastal megalopolis cluster lights (SP, RJ, Salvador, Recife, Fortaleza, POA)
    Object.values(CITY_COORDS).forEach((c) => {
      const cx = ((c.lon + 180) / 360) * W;
      const cy = ((90 - c.lat) / 180) * H;
      const cg = ectx.createRadialGradient(cx, cy, 1, cx, cy, 12);
      cg.addColorStop(0, 'rgba(255, 240, 170, 0.95)');
      cg.addColorStop(0.5, 'rgba(245, 185, 66, 0.35)');
      cg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ectx.fillStyle = cg;
      ectx.beginPath();
      ectx.arc(cx, cy, 12, 0, Math.PI * 2);
      ectx.fill();
    });

    const map = new THREE.CanvasTexture(diffCanvas);
    const specularMap = new THREE.CanvasTexture(specCanvas);
    const emissiveMap = new THREE.CanvasTexture(emitCanvas);
    map.anisotropy = 4;
    return { map, specularMap, emissiveMap };
  }

  createCloudsTexture() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 1024, 512);

    for (let i = 0; i < 110; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 512;
      const rx = 25 + Math.random() * 75;
      const ry = 8 + Math.random() * 20;
      const g = ctx.createRadialGradient(x, y, 2, x, y, rx);
      g.addColorStop(0, 'rgba(226, 242, 255, 0.14)');
      g.addColorStop(1, 'rgba(226, 242, 255, 0)');
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((Math.random() - 0.5) * 0.5);
      ctx.scale(1, ry / rx);
      ctx.translate(-x, -y);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return new THREE.CanvasTexture(c);
  }

  buildEarthSphere() {
    const { map, specularMap, emissiveMap } = this.createEarthTextures();
    const geo = new THREE.SphereGeometry(RADIUS, 72, 72);
    const mat = new THREE.MeshPhongMaterial({
      map,
      specularMap,
      specular: new THREE.Color(0x7dd3fc),
      shininess: 34,
      emissiveMap,
      emissive: new THREE.Color(0xfbbf24),
      emissiveIntensity: 0.72
    });
    this.earthMesh = new THREE.Mesh(geo, mat);
    this.globeGroup.add(this.earthMesh);

    // Translucent drifting cloud layer
    const cloudGeo = new THREE.SphereGeometry(RADIUS * 1.015, 64, 64);
    const cloudMat = new THREE.MeshPhongMaterial({
      map: this.createCloudsTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    this.cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    this.globeGroup.add(this.cloudMesh);
  }

  buildAtmosphere() {
    const atmoGeo = new THREE.SphereGeometry(RADIUS * 1.085, 64, 64);
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.66 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
          gl_FragColor = vec4(0.22, 0.78, 0.96, 1.0) * intensity * 1.35;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });
    this.scene.add(new THREE.Mesh(atmoGeo, atmoMat));
  }

  buildStarfield() {
    const count = 450;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 18 + Math.random() * 25;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xe2ecf5, size: 0.09, transparent: true, opacity: 0.6 });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  buildBrazilStates() {
    this.statesGroup = new THREE.Group();
    this.globeGroup.add(this.statesGroup);

    BRAZIL_STATES.forEach((st) => {
      const group = new THREE.Group();
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x2dd4bf,
        transparent: true,
        opacity: 0.72
      });

      st.polys.forEach((poly) => {
        const pts = poly.map(([lon, lat]) => latLonToVec3(lat, lon, RADIUS + 0.022));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geo, lineMat);
        group.add(line);
      });

      // Capital / center glowing node
      const [clon, clat] = st.center;
      const centerVec = latLonToVec3(clat, clon, RADIUS + 0.035);
      const dotGeo = new THREE.SphereGeometry(0.038, 10, 10);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xf5b942 });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(centerVec);
      group.add(dot);

      this.statesGroup.add(group);
      this.stateMeshes.set(st.uf, { group, lineMat, dotMat, centerVec, state: st });
    });
  }

  buildOrbitalScanner() {
    // Equatorial orbital scan ring
    const ringGeo = new THREE.TorusGeometry(RADIUS * 1.18, 0.015, 8, 128);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35
    });
    this.orbitalRing = new THREE.Mesh(ringGeo, ringMat);
    this.orbitalRing.rotation.x = Math.PI * 0.42;
    this.scene.add(this.orbitalRing);

    // Secondary Kintsugi satellite ring
    const ring2Geo = new THREE.TorusGeometry(RADIUS * 1.26, 0.01, 8, 128);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0xf5b942,
      transparent: true,
      opacity: 0.22
    });
    this.orbitalRing2 = new THREE.Mesh(ring2Geo, ring2Mat);
    this.orbitalRing2.rotation.x = -Math.PI * 0.35;
    this.orbitalRing2.rotation.y = Math.PI * 0.2;
    this.scene.add(this.orbitalRing2);
  }

  buildUFLabelsOverlay() {
    const labelLayer = document.getElementById('globe-uf-labels');
    if (!labelLayer) return;
    labelLayer.innerHTML = '';

    BRAZIL_STATES.forEach((st) => {
      const el = document.createElement('span');
      el.textContent = st.uf;
      el.className =
        'absolute -translate-x-1/2 -translate-y-1/2 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded pointer-events-none transition-colors duration-200 text-teal-200/85 bg-slate-950/55 border border-teal-400/20';
      labelLayer.appendChild(el);

      const [clon, clat] = st.center;
      this.ufLabels.push({
        uf: st.uf,
        el,
        localPos: latLonToVec3(clat, clon, RADIUS + 0.08)
      });
    });
  }

  bindPointer() {
    const dom = this.renderer.domElement;
    dom.style.cursor = 'grab';

    const onDown = (x, y) => {
      this.isDragging = true;
      this.prevPointer = { x, y };
      dom.style.cursor = 'grabbing';
    };
    const onMove = (x, y) => {
      if (!this.isDragging) return;
      const dx = x - this.prevPointer.x;
      const dy = y - this.prevPointer.y;
      this.rot.targetY += dx * 0.007;
      this.rot.targetX = THREE.MathUtils.clamp(this.rot.targetX + dy * 0.007, -1.1, 1.1);
      this.prevPointer = { x, y };
    };
    const onUp = () => {
      this.isDragging = false;
      dom.style.cursor = 'grab';
    };

    dom.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onUp);

    dom.addEventListener('touchstart', (e) => {
      if (e.touches[0]) onDown(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchend', onUp);
  }

  resolveCityAndUF(cityText = '') {
    const lower = cityText.toLowerCase();
    for (const [key, info] of Object.entries(CITY_COORDS)) {
      if (lower.includes(key)) return info;
    }
    // Check explicit UF suffix like ", SP" or " MG"
    const ufMatch = cityText.toUpperCase().match(/\b([A-Z]{2})\b/);
    if (ufMatch) {
      const found = BRAZIL_STATES.find((s) => s.uf === ufMatch[1]);
      if (found) return { uf: found.uf, lat: found.center[1], lon: found.center[0] };
    }
    return { uf: 'SP', lat: -15.5, lon: -50.0 };
  }

  /**
   * Smoothly rotates globe to face (lat, lon) in front of the camera.
   */
  focusCoordinates(lat, lon, dist = 12.8) {
    // Convert lat/lon to target Euler rotations on globeGroup (order 'XYZ': Ry first, then Rx)
    const theta = (lon + 180) * (Math.PI / 180);
    this.rot.targetY = Math.PI / 2 - theta;
    this.rot.targetX = (lat * Math.PI) / 180;
    this.zoom.targetDist = dist;
  }

  focusBrazil(zoomIn = true) {
    this.focusCoordinates(-14.5, -51.5, zoomIn ? 12.4 : 13.8);
  }

  highlightState(uf) {
    this.activeUF = uf;
    this.stateMeshes.forEach((entry, key) => {
      if (key === uf) {
        entry.lineMat.color.setHex(0xf5b942); // Kintsugi Gold
        entry.lineMat.opacity = 1.0;
        entry.dotMat.color.setHex(0xe11d48); // Vermilion Beacon
      } else {
        entry.lineMat.color.setHex(0x2dd4bf);
        entry.lineMat.opacity = this.isScanning ? 0.45 : 0.72;
        entry.dotMat.color.setHex(0xf5b942);
      }
    });
  }

  clearEffects() {
    this.pulseRings.forEach((m) => this.globeGroup.remove(m));
    this.pulseRings = [];
    this.leadBeacons.forEach((m) => this.globeGroup.remove(m));
    this.leadBeacons = [];
    this.scanArcs.forEach((m) => this.globeGroup.remove(m));
    this.scanArcs = [];
  }

  spawnRadarRing(lat, lon, color = 0x2dd4bf) {
    const pos = latLonToVec3(lat, lon, RADIUS + 0.04);
    const geo = new THREE.RingGeometry(0.06, 0.11, 32);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().multiplyScalar(2));
    mesh.userData = { age: 0, maxAge: 1.6 };
    this.globeGroup.add(mesh);
    this.pulseRings.push(mesh);
  }

  spawnDataArc(lat1, lon1, lat2, lon2) {
    const p1 = latLonToVec3(lat1, lon1, RADIUS + 0.03);
    const p2 = latLonToVec3(lat2, lon2, RADIUS + 0.03);
    const mid = p1.clone().add(p2).multiplyScalar(0.5);
    const dist = p1.distanceTo(p2);
    mid.normalize().multiplyScalar(RADIUS + 0.35 + dist * 0.25);

    const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
    const pts = curve.getPoints(36);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: 0xf5b942,
      transparent: true,
      opacity: 0.85
    });
    const line = new THREE.Line(geo, mat);
    line.userData = { age: 0, maxAge: 2.2 };
    this.globeGroup.add(line);
    this.scanArcs.push(line);
  }

  spawnLeadBeacon(lat, lon) {
    const jitterLat = lat + (Math.random() - 0.5) * 1.4;
    const jitterLon = lon + (Math.random() - 0.5) * 1.4;
    const base = latLonToVec3(jitterLat, jitterLon, RADIUS + 0.03);
    const top = latLonToVec3(jitterLat, jitterLon, RADIUS + 0.35 + Math.random() * 0.22);

    const geo = new THREE.BufferGeometry().setFromPoints([base, top]);
    const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 });
    const pin = new THREE.Line(geo, mat);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xf5b942 })
    );
    head.position.copy(top);
    pin.add(head);

    this.globeGroup.add(pin);
    this.leadBeacons.push(pin);
  }

  /**
   * Runs the full cinematic Brazilian states radar scan animation during prospecting!
   */
  async runProspectingScan(niche, city, onStep) {
    if (!this.globeGroup) return;
    this.isScanning = true;
    this.clearEffects();

    const target = this.resolveCityAndUF(city);
    this.targetLat = target.lat;
    this.targetLon = target.lon;
    this.focusCoordinates(target.lat, target.lon, 11.4);

    const hudStatus = document.getElementById('globe-hud-status');
    const hudCoords = document.getElementById('globe-hud-coords');
    const hudProgress = document.getElementById('globe-hud-progress');
    const scannerBox = document.getElementById('globe-scan-badge');
    scannerBox?.classList.remove('hidden');

    // Cycle through major Brazilian states before locking on target
    const scanOrder = ['AM', 'PA', 'BA', 'MG', 'RJ', 'PR', 'RS', 'DF', target.uf];
    for (let i = 0; i < scanOrder.length; i++) {
      const uf = scanOrder[i];
      const stObj = BRAZIL_STATES.find((s) => s.uf === uf);
      if (!stObj) continue;

      this.highlightState(uf);
      const [slon, slat] = stObj.center;
      this.spawnRadarRing(slat, slon, uf === target.uf ? 0xf5b942 : 0x2dd4bf);
      this.spawnDataArc(slat, slon, target.lat, target.lon);

      if (hudStatus) hudStatus.textContent = `Varrendo ${stObj.name} (${uf}) — "${niche}"`;
      if (hudCoords) hudCoords.textContent = `${target.lat.toFixed(2)}° S, ${target.lon.toFixed(2)}° W`;
      if (hudProgress) hudProgress.style.width = `${Math.round(((i + 1) / scanOrder.length) * 85)}%`;

      if (onStep) onStep(stObj);
      await new Promise((r) => setTimeout(r, 230));
    }

    // Lock on target state & fire lead beacons
    this.highlightState(target.uf);
    this.spawnRadarRing(target.lat, target.lon, 0xe11d48);
    for (let b = 0; b < 6; b++) {
      this.spawnLeadBeacon(target.lat, target.lon);
    }

    if (hudStatus) hudStatus.textContent = `Alvo travado: ${city} (${target.uf}) • Extraindo leads...`;
    if (hudProgress) hudProgress.style.width = '100%';

    setTimeout(() => {
      this.isScanning = false;
      this.zoom.targetDist = 12.8;
      if (hudStatus) hudStatus.textContent = `Alvo ${target.uf} concluído • Satélite Treg pronto`;
      scannerBox?.classList.add('hidden');
    }, 1400);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // Smooth camera & globe interpolation
    if (!this.isDragging && !this.isScanning) {
      // Very gentle alive breathing sway around Brazil
      this.rot.targetY += Math.sin(t * 0.35) * 0.00025;
    }

    this.rot.x += (this.rot.targetX - this.rot.x) * 0.07;
    this.rot.y += (this.rot.targetY - this.rot.y) * 0.07;
    this.zoom.dist += (this.zoom.targetDist - this.zoom.dist) * 0.07;

    this.globeGroup.rotation.x = this.rot.x;
    this.globeGroup.rotation.y = this.rot.y;
    this.camera.position.z = this.zoom.dist;

    if (this.cloudMesh) {
      this.cloudMesh.rotation.y += dt * 0.015;
    }
    if (this.orbitalRing) {
      this.orbitalRing.rotation.z += dt * (this.isScanning ? 1.8 : 0.28);
      this.orbitalRing2.rotation.z -= dt * (this.isScanning ? 1.2 : 0.18);
    }
    if (this.stars) {
      this.stars.rotation.y += dt * 0.02;
    }

    // Periodic radar ping while scanning
    if (this.isScanning && Math.random() < 0.08) {
      this.spawnRadarRing(this.targetLat, this.targetLon, 0x38bdf8);
    }

    // Update expanding pulse rings
    for (let i = this.pulseRings.length - 1; i >= 0; i--) {
      const ring = this.pulseRings[i];
      ring.userData.age += dt;
      const p = ring.userData.age / ring.userData.maxAge;
      const scale = 1 + p * 8.5;
      ring.scale.set(scale, scale, 1);
      ring.material.opacity = Math.max(0, 0.9 * (1 - p));
      if (p >= 1) {
        this.globeGroup.remove(ring);
        this.pulseRings.splice(i, 1);
      }
    }

    // Update fading arcs
    for (let i = this.scanArcs.length - 1; i >= 0; i--) {
      const arc = this.scanArcs[i];
      arc.userData.age += dt;
      const p = arc.userData.age / arc.userData.maxAge;
      arc.material.opacity = Math.max(0, 0.85 * (1 - p));
      if (p >= 1) {
        this.globeGroup.remove(arc);
        this.scanArcs.splice(i, 1);
      }
    }

    // Project 27 Brazilian State UF labels onto 2D overlay
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w && h) {
      this.globeGroup.updateMatrixWorld();
      const camPos = this.camera.position;

      this.ufLabels.forEach((lbl) => {
        const worldPos = lbl.localPos.clone().applyMatrix4(this.globeGroup.matrixWorld);
        const normal = worldPos.clone().normalize();
        const toCam = camPos.clone().sub(worldPos).normalize();
        const facing = normal.dot(toCam);

        if (facing > 0.16) {
          const proj = worldPos.project(this.camera);
          const x = (proj.x * 0.5 + 0.5) * w;
          const y = (-proj.y * 0.5 + 0.5) * h;
          lbl.el.style.left = `${x}px`;
          lbl.el.style.top = `${y}px`;
          lbl.el.style.opacity = Math.min(1, facing * 1.8).toFixed(2);
          lbl.el.style.display = 'block';

          if (lbl.uf === this.activeUF) {
            lbl.el.className =
              'absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-extrabold tracking-wider px-1.5 py-0.5 rounded pointer-events-none text-amber-200 bg-rose-600/80 border border-amber-300 shadow-lg';
          } else {
            lbl.el.className =
              'absolute -translate-x-1/2 -translate-y-1/2 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded pointer-events-none text-teal-200/85 bg-slate-950/55 border border-teal-400/20';
          }
        } else {
          lbl.el.style.display = 'none';
        }
      });
    }

    this.renderer.render(this.scene, this.camera);
  }
}
