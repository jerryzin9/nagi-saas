/**
 * Nagi 3D — "The Great Wave off Kanagawa" (神奈川沖浪裏) WebGL Engine
 * Sculpted 3D curling Hokusai Great Wave with Prussian-blue ribbons,
 * clawing ivory foam tendrils, 3D sea-spray pearls, rolling GLSL ocean swells,
 * and distant snow-capped 3D Mount Fuji on a warm Washi horizon.
 */

export class NagiOcean3D {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas || typeof THREE === 'undefined') return;

    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.surge = 0;
    this.clock = new THREE.Clock();

    this.initScene();
    this.initSkyHorizon();
    this.initMountFuji();
    this.initRealisticWater();
    this.initGreatWaveSculpture();
    this.initSprayPearls();
    this.bindEvents();
    this.animate();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x061021, 0.0135);

    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 240);
    this.camera.position.set(0, 4.2, 23);
    this.camera.lookAt(0, 0.8, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(0x050d1c, 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Classic Kanagawa lighting: Prussian shadows + warm Washi golden-ivory highlights
    this.scene.add(new THREE.AmbientLight(0x284b7a, 1.35));

    const sun = new THREE.DirectionalLight(0xfef3c7, 1.9);
    sun.position.set(16, 14, 10);
    this.scene.add(sun);

    const prussianRim = new THREE.DirectionalLight(0x38bdf8, 1.4);
    prussianRim.position.set(-18, 8, -8);
    this.scene.add(prussianRim);
  }

  initSkyHorizon() {
    // Warm Washi-parchment & amber dawn gradient glow behind Mount Fuji
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(256, 256, 18, 256, 256, 250);
    g.addColorStop(0, 'rgba(254, 243, 199, 0.72)');
    g.addColorStop(0.28, 'rgba(245, 185, 66, 0.34)');
    g.addColorStop(0.6, 'rgba(56, 189, 248, 0.12)');
    g.addColorStop(1, 'rgba(5, 13, 28, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);

    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.horizonGlow = new THREE.Sprite(mat);
    this.horizonGlow.position.set(11, 5.5, -48);
    this.horizonGlow.scale.set(42, 32, 1);
    this.scene.add(this.horizonGlow);
  }

  initMountFuji() {
    // Distant iconic Mount Fuji with snowy peak shader
    const geo = new THREE.CylinderGeometry(1.05, 13.5, 8.8, 64, 18, true);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const angle = Math.atan2(z, x);
      const hNorm = (y + 4.4) / 8.8;
      // Subtle volcanic ridges & concave Fuji slope
      const concave = Math.pow(1 - hNorm, 1.35);
      const ridge = 1 + Math.sin(angle * 7) * 0.045 * (1 - hNorm);
      const scale = (0.14 + concave * 0.92) * ridge;
      const rOrig = Math.hypot(x, z);
      if (rOrig > 0.001) {
        const targetR = scale * 13.5;
        pos.setX(i, (x / rOrig) * targetR);
        pos.setZ(i, (z / rOrig) * targetR);
      }
    }
    geo.computeVertexNormals();

    const fujiMat = new THREE.ShaderMaterial({
      uniforms: {
        uBaseColor: { value: new THREE.Color(0x0c1d36) },
        uMidColor: { value: new THREE.Color(0x163863) },
        uSnowColor: { value: new THREE.Color(0xf7f0e2) }
      },
      vertexShader: `
        varying float vHeight;
        varying vec3 vNormal;
        varying float vAngle;
        void main() {
          vHeight = (position.y + 4.4) / 8.8;
          vNormal = normalize(normalMatrix * normal);
          vAngle = atan(position.z, position.x);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uBaseColor;
        uniform vec3 uMidColor;
        uniform vec3 uSnowColor;
        varying float vHeight;
        varying vec3 vNormal;
        varying float vAngle;
        void main() {
          vec3 body = mix(uBaseColor, uMidColor, smoothstep(0.0, 0.72, vHeight));
          // Irregular Hokusai snow-line fingers
          float snowLine = 0.64 + sin(vAngle * 9.0) * 0.055 + cos(vAngle * 5.0) * 0.035;
          float snowMask = smoothstep(snowLine - 0.03, snowLine + 0.04, vHeight);
          vec3 col = mix(body, uSnowColor, snowMask);
          float rim = pow(1.0 - abs(vNormal.z), 2.2) * 0.25;
          col += vec3(0.95, 0.82, 0.58) * rim;
          gl_FragColor = vec4(col, 0.92);
        }
      `,
      transparent: true
    });

    this.fuji = new THREE.Mesh(geo, fujiMat);
    this.fuji.position.set(11.5, 0.4, -44);
    this.scene.add(this.fuji);
  }

  initRealisticWater() {
    const geo = new THREE.PlaneGeometry(150, 95, 160, 110);
    geo.rotateX(-Math.PI / 2);

    this.waterUniforms = {
      uTime: { value: 0 },
      uSurge: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uSunDir: { value: new THREE.Vector3(0.32, 0.28, -0.9).normalize() },
      uDeepColor: { value: new THREE.Color(0x051329) },
      uMidColor: { value: new THREE.Color(0x113a6e) },
      uCrestColor: { value: new THREE.Color(0x1e609e) },
      uFoamColor: { value: new THREE.Color(0xf6efe0) }
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      vertexShader: `
        uniform float uTime;
        uniform float uSurge;
        uniform vec2 uMouse;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vElevation;

        float waveHeight(vec2 p, float t, float amp) {
          float h = 0.0;
          h += sin(p.x * 0.16 + t * 1.15) * 0.95;
          h += sin(p.y * 0.21 - t * 0.92 + p.x * 0.08) * 0.72;
          h += sin((p.x * 0.28 + p.y * 0.22) + t * 1.55) * 0.38;
          // Sharper Ukiyo-e Prussian swells
          float swell = sin(p.x * 0.12 - p.y * 0.09 + t * 0.75);
          h += pow(max(0.0, swell), 2.4) * 1.35;

          float d = length(p - uMouse * vec2(22.0, 14.0));
          h += sin(d * 0.52 - t * 3.6) * exp(-d * 0.07) * 0.55;
          return h * amp;
        }

        void main() {
          vec3 pos = position;
          float amp = 1.0 + uSurge * 0.65;
          float eps = 0.25;
          float h = waveHeight(pos.xz, uTime, amp);
          float hx = waveHeight(pos.xz + vec2(eps, 0.0), uTime, amp);
          float hz = waveHeight(pos.xz + vec2(0.0, eps), uTime, amp);
          pos.y += h;
          vElevation = h;

          vec3 tx = normalize(vec3(eps, hx - h, 0.0));
          vec3 tz = normalize(vec3(0.0, hz - h, eps));
          vNormal = normalize(cross(tz, tx));

          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uDeepColor;
        uniform vec3 uMidColor;
        uniform vec3 uCrestColor;
        uniform vec3 uFoamColor;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vElevation;

        void main() {
          vec3 N = normalize(vNormal);
          vec3 V = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.6);
          fresnel = clamp(fresnel * 0.8 + 0.08, 0.0, 1.0);

          float hNorm = clamp((vElevation + 1.6) / 3.6, 0.0, 1.0);
          vec3 water = mix(uDeepColor, uMidColor, smoothstep(0.0, 0.6, hNorm));
          water = mix(water, uCrestColor, smoothstep(0.55, 1.0, hNorm));

          // Hokusai woodblock-inspired contour bands subtle shimmer
          float band = sin(vElevation * 8.0) * 0.04;
          water += vec3(0.06, 0.16, 0.30) * band;

          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), 110.0);
          vec3 skyRefl = vec3(0.18, 0.42, 0.68);
          vec3 col = mix(water, skyRefl, fresnel * 0.55);
          col += vec3(0.98, 0.90, 0.72) * spec * 1.1;

          // Warm Washi ivory seafoam on steep crests
          float foam = smoothstep(1.35, 2.3, vElevation);
          col = mix(col, uFoamColor, foam * 0.62);

          float dist = length(cameraPosition - vWorldPos);
          float fog = 1.0 - exp(-pow(dist * 0.02, 2.0));
          col = mix(col, vec3(0.02, 0.05, 0.11), clamp(fog, 0.0, 1.0));

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.position.y = -2.4;
    this.scene.add(this.waterMesh);
  }

  /**
   * Sculpts the iconic 3D curling Great Wave of Kanagawa on the left-foreground
   * with layered Prussian-blue body arcs and clawing ivory seafoam tendrils.
   */
  initGreatWaveSculpture() {
    this.waveSculpture = new THREE.Group();
    this.waveTendrils = [];

    const prussianDark = new THREE.MeshStandardMaterial({
      color: 0x0b254a,
      roughness: 0.32,
      metalness: 0.25
    });
    const prussianMid = new THREE.MeshStandardMaterial({
      color: 0x164785,
      roughness: 0.28,
      metalness: 0.28
    });
    const prussianBright = new THREE.MeshStandardMaterial({
      color: 0x2467b3,
      roughness: 0.24,
      metalness: 0.22
    });
    const foamMat = new THREE.MeshStandardMaterial({
      color: 0xf7f0e2,
      emissive: 0x3b3222,
      emissiveIntensity: 0.25,
      roughness: 0.42,
      metalness: 0.08
    });

    // Helper to build a tapered 3D curved wave ribbon/tube
    const buildTaperedCurve = (points, radiusStart, radiusEnd, material, tubularSegs = 48) => {
      const curve = new THREE.CatmullRomCurve3(points);
      const geo = new THREE.TubeGeometry(curve, tubularSegs, 1, 14, false);
      const pos = geo.attributes.position;
      const radialSegs = 14;

      for (let i = 0; i <= tubularSegs; i++) {
        const t = i / tubularSegs;
        const center = curve.getPointAt(t);
        const r = THREE.MathUtils.lerp(radiusStart, radiusEnd, Math.pow(t, 0.85));
        for (let j = 0; j <= radialSegs; j++) {
          const idx = i * (radialSegs + 1) + j;
          const vx = pos.getX(idx) - center.x;
          const vy = pos.getY(idx) - center.y;
          const vz = pos.getZ(idx) - center.z;
          pos.setXYZ(idx, center.x + vx * r, center.y + vy * r, center.z + vz * r);
        }
      }
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, material);
    };

    // 1. Massive Main Great Wave Body Sweeps (Prussian blue layers)
    const waveRibs = [
      {
        pts: [
          new THREE.Vector3(-23, -3.5, -7),
          new THREE.Vector3(-16, -0.5, -5.5),
          new THREE.Vector3(-11.5, 4.2, -4.0),
          new THREE.Vector3(-6.2, 6.9, -2.5),
          new THREE.Vector3(-2.6, 5.4, -1.6)
        ],
        r0: 3.1,
        r1: 0.85,
        mat: prussianDark
      },
      {
        pts: [
          new THREE.Vector3(-21, -3.2, -4.2),
          new THREE.Vector3(-14.5, 0.2, -3.0),
          new THREE.Vector3(-9.8, 4.8, -1.8),
          new THREE.Vector3(-5.0, 6.6, -1.0),
          new THREE.Vector3(-2.0, 4.9, -0.4)
        ],
        r0: 2.6,
        r1: 0.72,
        mat: prussianMid
      },
      {
        pts: [
          new THREE.Vector3(-18.5, -3.0, -1.6),
          new THREE.Vector3(-12.5, 0.5, -0.8),
          new THREE.Vector3(-8.2, 4.6, 0.0),
          new THREE.Vector3(-4.2, 5.8, 0.6),
          new THREE.Vector3(-1.5, 4.1, 1.0)
        ],
        r0: 2.1,
        r1: 0.55,
        mat: prussianBright
      }
    ];

    waveRibs.forEach((w) => {
      this.waveSculpture.add(buildTaperedCurve(w.pts, w.r0, w.r1, w.mat, 54));
    });

    // 2. Iconic Hokusai Clawing Seafoam Tendrils arching off the crest
    const clawCount = 14;
    for (let i = 0; i < clawCount; i++) {
      const zOff = -4.2 + (i / (clawCount - 1)) * 5.8;
      const archLift = Math.sin((i / clawCount) * Math.PI) * 1.4;
      const reachX = -1.2 + Math.sin(i * 1.7) * 1.5;
      const dropY = 3.1 + Math.cos(i * 1.3) * 1.1;

      const pts = [
        new THREE.Vector3(-8.5 + (i % 3) * 0.7, 5.0 + archLift * 0.4, zOff),
        new THREE.Vector3(-4.6, 6.8 + archLift, zOff * 0.85),
        new THREE.Vector3(reachX - 0.6, dropY + 1.5, zOff * 0.75),
        new THREE.Vector3(reachX + 0.6, dropY - 0.4, zOff * 0.68)
      ];
      const claw = buildTaperedCurve(pts, 0.52, 0.04, foamMat, 28);
      claw.userData = { baseRotZ: 0, phase: i * 0.55 };
      this.waveSculpture.add(claw);
      this.waveTendrils.push(claw);
    }

    // 3. Secondary Smaller Foreground Kanagawa Swell (classic Hokusai left-front wave)
    const frontWave = buildTaperedCurve(
      [
        new THREE.Vector3(-17, -3.5, 4.5),
        new THREE.Vector3(-12.5, -0.4, 4.8),
        new THREE.Vector3(-8.8, 2.2, 5.0),
        new THREE.Vector3(-5.6, 1.7, 5.1)
      ],
      1.7,
      0.35,
      prussianMid,
      36
    );
    this.waveSculpture.add(frontWave);

    for (let j = 0; j < 6; j++) {
      const zOff = 3.9 + j * 0.45;
      const claw = buildTaperedCurve(
        [
          new THREE.Vector3(-9.5, 1.9, zOff),
          new THREE.Vector3(-6.8, 2.6 + (j % 2) * 0.4, zOff),
          new THREE.Vector3(-4.9, 1.3, zOff)
        ],
        0.28,
        0.03,
        foamMat,
        20
      );
      claw.userData = { phase: j * 0.8 + 1.2 };
      this.waveSculpture.add(claw);
      this.waveTendrils.push(claw);
    }

    // Position the Great Wave dramatically on the left framing the UI
    this.waveSculpture.position.set(-2.5, -0.4, -3.0);
    this.scene.add(this.waveSculpture);
  }

  initSprayPearls() {
    // 3D glistening sea-spray pearls & golden embers bursting from the Great Wave
    const count = 240;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    this.spraySeeds = new Float32Array(count);

    const cFoam = new THREE.Color(0xfaf4e6);
    const cGold = new THREE.Color(0xf5b942);
    const cCyan = new THREE.Color(0x7dd3fc);

    for (let i = 0; i < count; i++) {
      const isBurst = i < 140;
      if (isBurst) {
        pos[i * 3] = -8 + Math.random() * 14;
        pos[i * 3 + 1] = 1.0 + Math.random() * 7.5;
        pos[i * 3 + 2] = -6 + Math.random() * 10;
      } else {
        pos[i * 3] = (Math.random() - 0.5) * 60;
        pos[i * 3 + 1] = Math.random() * 11;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 38 - 6;
      }
      this.spraySeeds[i] = Math.random() * Math.PI * 2;

      const pick = Math.random();
      const c = pick > 0.78 ? cGold : pick > 0.48 ? cFoam : cCyan;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    // Soft spherical pearl texture
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);

    const mat = new THREE.PointsMaterial({
      size: 0.36,
      map: new THREE.CanvasTexture(c),
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.sprayPearls = new THREE.Points(geo, mat);
    this.scene.add(this.sprayPearls);
  }

  triggerSurge(intensity = 1.5) {
    this.surge = Math.min(2.2, this.surge + intensity);
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
    this.surge *= 0.965;

    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.04;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.04;

    this.camera.position.x = this.mouse.x * 2.1;
    this.camera.position.y = 4.2 - this.mouse.y * 0.85;
    this.camera.lookAt(0, 0.8, 0);

    if (this.waterUniforms) {
      this.waterUniforms.uTime.value = t;
      this.waterUniforms.uSurge.value = this.surge;
      this.waterUniforms.uMouse.value.set(this.mouse.x, this.mouse.y);
    }

    // Living monumental motion on the 3D Great Wave of Kanagawa
    if (this.waveSculpture) {
      this.waveSculpture.position.y = -0.4 + Math.sin(t * 0.95) * 0.42 + this.surge * 0.45;
      this.waveSculpture.rotation.z = Math.sin(t * 0.7) * 0.035 - this.surge * 0.03;
      this.waveSculpture.rotation.y = Math.cos(t * 0.45) * 0.03;

      this.waveTendrils.forEach((claw) => {
        const ph = claw.userData.phase || 0;
        claw.rotation.z = Math.sin(t * 1.8 + ph) * 0.045;
        claw.position.y = Math.sin(t * 1.5 + ph) * 0.12;
      });
    }

    if (this.sprayPearls) {
      const pPos = this.sprayPearls.geometry.attributes.position;
      for (let i = 0; i < pPos.count; i++) {
        const s = this.spraySeeds[i];
        let px = pPos.getX(i) + Math.cos(t * 0.5 + s) * 0.012;
        let py = pPos.getY(i) + Math.sin(t * 1.1 + s) * 0.012 + this.surge * 0.018;
        if (py > 10.5) py = 0.5;
        pPos.setXY(i, px, py);
      }
      pPos.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
