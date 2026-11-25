/**
 * Nagi 3D Ocean Engine (Three.js)
 * Renders an interactive Japanese Ukiyo-e / Hokusai-inspired 3D wave surface,
 * bioluminescent foam particles, and golden kintsugi embers.
 */

export class NagiOcean3D {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas || typeof THREE === 'undefined') return;

    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.surge = 0; // Boosted temporarily when prospecting or generating
    this.clock = new THREE.Clock();

    this.initScene();
    this.initWaves();
    this.initParticles();
    this.initMoonHalo();
    this.bindEvents();
    this.animate();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x040914, 0.018);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    this.camera.position.set(0, 7.5, 22);
    this.camera.lookAt(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lighting
    const ambient = new THREE.AmbientLight(0x1e3a5f, 1.2);
    this.scene.add(ambient);

    const moonLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    moonLight.position.set(-10, 18, -12);
    this.scene.add(moonLight);

    const kintsugiLight = new THREE.PointLight(0xf5b942, 2.2, 60);
    kintsugiLight.position.set(14, 8, 8);
    this.scene.add(kintsugiLight);

    const vermilionGlow = new THREE.PointLight(0xe11d48, 1.4, 50);
    vermilionGlow.position.set(-16, 6, -6);
    this.scene.add(vermilionGlow);
  }

  initWaves() {
    // High-resolution ocean mesh
    const width = 95;
    const depth = 65;
    const segW = 110;
    const segD = 75;

    this.waveGeo = new THREE.PlaneGeometry(width, depth, segW, segD);
    this.waveGeo.rotateX(-Math.PI / 2);

    const count = this.waveGeo.attributes.position.count;
    this.basePositions = new Float32Array(this.waveGeo.attributes.position.array);
    this.colors = new Float32Array(count * 3);
    this.waveGeo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    // Solid metallic-indigo sea surface
    const seaMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.28,
      metalness: 0.65,
      flatShading: false
    });
    this.seaMesh = new THREE.Mesh(this.waveGeo, seaMat);
    this.seaMesh.position.y = -2.2;
    this.scene.add(this.seaMesh);

    // Delicate Ukiyo-e crest wireframe overlay
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.14
    });
    this.wireMesh = new THREE.Mesh(this.waveGeo, wireMat);
    this.wireMesh.position.y = -2.17;
    this.scene.add(this.wireMesh);
  }

  initParticles() {
    // Ocean spray & golden lantern/kintsugi embers
    const count = 420;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.particleSeeds = new Float32Array(count);

    const cTeal = new THREE.Color(0x2dd4bf);
    const cFoam = new THREE.Color(0xf4efe6);
    const cGold = new THREE.Color(0xf5b942);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 75;
      positions[i * 3 + 1] = Math.random() * 14 - 1.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
      this.particleSeeds[i] = Math.random() * Math.PI * 2;

      const pick = Math.random();
      const col = pick > 0.78 ? cGold : pick > 0.4 ? cTeal : cFoam;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  initMoonHalo() {
    // Minimalist crimson/gold Japanese Enso / rising moon ring in the distance
    const ringGeo = new THREE.TorusGeometry(9.5, 0.08, 16, 120);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe11d48,
      transparent: true,
      opacity: 0.28
    });
    this.ensoRing = new THREE.Mesh(ringGeo, ringMat);
    this.ensoRing.position.set(12, 9, -28);
    this.scene.add(this.ensoRing);

    const innerGeo = new THREE.RingGeometry(8.9, 9.2, 96);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xf5b942,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide
    });
    this.ensoInner = new THREE.Mesh(innerGeo, innerMat);
    this.ensoInner.position.set(12, 9, -28.2);
    this.scene.add(this.ensoInner);
  }

  triggerSurge(intensity = 1.6) {
    this.surge = Math.min(2.5, this.surge + intensity);
  }

  bindEvents() {
    window.addEventListener('mousemove', (e) => {
      this.mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      this.mouse.targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    window.addEventListener('resize', () => {
      if (!this.renderer || !this.camera) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const t = this.clock.getElapsedTime();
    this.surge *= 0.965; // Smoothly decay wave surge

    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.04;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.04;

    // Gentle camera parallax
    this.camera.position.x = this.mouse.x * 2.4;
    this.camera.position.y = 7.5 - this.mouse.y * 1.1;
    this.camera.lookAt(0, 0.8, 0);

    // Update ocean vertices with layered Japanese wave swells
    const pos = this.waveGeo.attributes.position;
    const col = this.waveGeo.attributes.color;
    const ampBoost = 1 + this.surge * 0.85;

    for (let i = 0; i < pos.count; i++) {
      const bx = this.basePositions[i * 3];
      const bz = this.basePositions[i * 3 + 2];

      // Multi-directional Hokusai-style wave interference
      const w1 = Math.sin(bx * 0.18 + t * 1.15) * 1.15;
      const w2 = Math.cos(bz * 0.22 - t * 0.9 + bx * 0.08) * 0.85;
      const w3 = Math.sin((bx + bz) * 0.32 + t * 1.65) * 0.45;
      const crest = Math.pow(Math.max(0, Math.sin(bx * 0.14 - bz * 0.12 + t * 0.8)), 3) * 1.6;

      // Mouse ripple interaction
      const distMouse = Math.hypot(bx - this.mouse.x * 18, bz - this.mouse.y * 12);
      const ripple = Math.sin(distMouse * 0.45 - t * 3.5) * Math.exp(-distMouse * 0.08) * 0.9;

      const y = (w1 + w2 + w3 + crest + ripple) * ampBoost;
      pos.setY(i, y);

      // Color gradient from deep Prussian blue (#061224) to bioluminescent cyan (#2dd4bf) & foam (#f4efe6)
      const hNorm = THREE.MathUtils.clamp((y + 2.2) / 4.8, 0, 1);
      const r = 0.02 + hNorm * 0.22 + (hNorm > 0.78 ? (hNorm - 0.78) * 2.8 : 0);
      const g = 0.07 + hNorm * 0.62 + (hNorm > 0.78 ? (hNorm - 0.78) * 1.1 : 0);
      const b = 0.18 + hNorm * 0.68;

      col.setXYZ(i, Math.min(r, 0.96), Math.min(g, 0.95), Math.min(b, 0.98));
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.waveGeo.computeVertexNormals();

    // Animate particles
    const pPos = this.particles.geometry.attributes.position;
    for (let i = 0; i < pPos.count; i++) {
      const seed = this.particleSeeds[i];
      let py = pPos.getY(i);
      let px = pPos.getX(i);

      py += Math.sin(t * 0.9 + seed) * 0.012 + this.surge * 0.02;
      px += Math.cos(t * 0.4 + seed) * 0.015;

      if (py > 13) py = -1;
      if (px > 38) px = -38;
      if (px < -38) px = 38;

      pPos.setXY(i, px, py);
    }
    pPos.needsUpdate = true;

    // Slow Enso rotation
    if (this.ensoRing) {
      this.ensoRing.rotation.z = t * 0.06;
      this.ensoRing.rotation.y = Math.sin(t * 0.2) * 0.12;
      this.ensoInner.rotation.z = -t * 0.04;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
