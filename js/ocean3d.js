/**
 * Nagi 3D Photorealistic Ocean Shader Engine (Three.js + Custom GLSL)
 * Renders realistic rolling Gerstner-inspired waves with Fresnel sky reflections,
 * bioluminescent subsurface scattering, moonlit specular highlights, foam crests,
 * a luminous Japanese moon halo, and soft bokeh light embers.
 */

export class NagiOcean3D {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas || typeof THREE === 'undefined') return;

    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.surge = 0;
    this.clock = new THREE.Clock();

    this.initScene();
    this.initRealisticWater();
    this.initMoonBackdrop();
    this.initBokehEmbers();
    this.bindEvents();
    this.animate();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x030711, 0.016);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 220);
    this.camera.position.set(0, 5.8, 22);
    this.camera.lookAt(0, 0.6, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(0x030711, 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  initRealisticWater() {
    const geo = new THREE.PlaneGeometry(140, 90, 160, 110);
    geo.rotateX(-Math.PI / 2);

    this.waterUniforms = {
      uTime: { value: 0 },
      uSurge: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uSunDir: { value: new THREE.Vector3(0.35, 0.32, -0.88).normalize() },
      uDeepColor: { value: new THREE.Color(0x030a18) },
      uMidColor: { value: new THREE.Color(0x082742) },
      uSubsurfaceColor: { value: new THREE.Color(0x14b8a6) },
      uSkyColor: { value: new THREE.Color(0x1e3a5f) },
      uFoamColor: { value: new THREE.Color(0xeef6ff) }
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

        // Smooth multi-directional ocean wave height
        float waveHeight(vec2 p, float t, float amp) {
          float h = 0.0;
          h += sin(p.x * 0.16 + t * 1.15) * 0.85;
          h += sin(p.y * 0.21 - t * 0.92 + p.x * 0.07) * 0.68;
          h += sin((p.x * 0.28 + p.y * 0.24) + t * 1.55) * 0.36;
          h += cos((p.x * 0.45 - p.y * 0.38) - t * 2.10) * 0.16;
          // Sharper Hokusai-style swells
          float swell = sin(p.x * 0.11 - p.y * 0.09 + t * 0.72);
          h += pow(max(0.0, swell), 2.5) * 1.15;

          // Interactive mouse ripple
          float d = length(p - uMouse * vec2(22.0, 14.0));
          h += sin(d * 0.55 - t * 3.8) * exp(-d * 0.07) * 0.55;

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

          vec3 tangentX = normalize(vec3(eps, hx - h, 0.0));
          vec3 tangentZ = normalize(vec3(0.0, hz - h, eps));
          vNormal = normalize(cross(tangentZ, tangentX));

          vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
          vWorldPos = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uDeepColor;
        uniform vec3 uMidColor;
        uniform vec3 uSubsurfaceColor;
        uniform vec3 uSkyColor;
        uniform vec3 uFoamColor;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vElevation;

        void main() {
          vec3 N = normalize(vNormal);
          vec3 V = normalize(cameraPosition - vWorldPos);

          // Fresnel reflection factor
          float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          fresnel = clamp(fresnel * 0.85 + 0.06, 0.0, 1.0);

          // Subsurface scattering in translucent wave crests
          float heightFactor = clamp((vElevation + 1.5) / 3.4, 0.0, 1.0);
          vec3 waterBase = mix(uDeepColor, uMidColor, heightFactor);
          float sss = pow(max(0.0, dot(V, -uSunDir + N * 0.45)), 3.0) * heightFactor;
          waterBase += uSubsurfaceColor * sss * 0.52;

          // Sky reflection + realistic moon/sun specular sparkle
          vec3 R = reflect(-V, N);
          vec3 skyRefl = mix(uSkyColor * 0.55, vec3(0.28, 0.65, 0.92), clamp(R.y * 0.8 + 0.2, 0.0, 1.0));
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), 140.0);
          float broadSpec = pow(max(dot(N, H), 0.0), 22.0) * 0.22;

          // Delicate seafoam along highest crests
          float foam = smoothstep(1.38, 2.25, vElevation);

          vec3 col = mix(waterBase, skyRefl, fresnel * 0.72);
          col += vec3(0.95, 0.88, 0.75) * spec * 1.45;
          col += vec3(0.22, 0.75, 0.88) * broadSpec;
          col = mix(col, uFoamColor, foam * 0.42);

          // Atmospheric distance fog fade into dark horizon
          float dist = length(cameraPosition - vWorldPos);
          float fogFactor = 1.0 - exp(-pow(dist * 0.022, 2.0));
          col = mix(col, vec3(0.012, 0.027, 0.067), clamp(fogFactor, 0.0, 1.0));

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.position.y = -2.0;
    this.scene.add(this.waterMesh);
  }

  initMoonBackdrop() {
    // Soft glowing Kyoto full-moon sphere + atmospheric halo on the horizon
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(256, 256, 20, 256, 256, 250);
    g.addColorStop(0, 'rgba(255, 244, 224, 0.95)');
    g.addColorStop(0.24, 'rgba(245, 185, 66, 0.45)');
    g.addColorStop(0.55, 'rgba(56, 189, 248, 0.14)');
    g.addColorStop(1, 'rgba(3, 7, 17, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.moonSprite = new THREE.Sprite(spriteMat);
    this.moonSprite.position.set(16, 11, -46);
    this.moonSprite.scale.set(28, 28, 1);
    this.scene.add(this.moonSprite);
  }

  createSoftParticleTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  initBokehEmbers() {
    const count = 180;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    this.seeds = new Float32Array(count);

    const cGold = new THREE.Color(0xf5b942);
    const cTeal = new THREE.Color(0x2dd4bf);
    const cMist = new THREE.Color(0xbae6fd);

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 68;
      pos[i * 3 + 1] = Math.random() * 12 - 0.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 44 - 6;
      this.seeds[i] = Math.random() * Math.PI * 2;

      const pick = Math.random();
      const c = pick > 0.72 ? cGold : pick > 0.35 ? cTeal : cMist;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.45,
      map: this.createSoftParticleTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
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

    this.camera.position.x = this.mouse.x * 1.8;
    this.camera.position.y = 5.8 - this.mouse.y * 0.75;
    this.camera.lookAt(0, 0.5, 0);

    if (this.waterUniforms) {
      this.waterUniforms.uTime.value = t;
      this.waterUniforms.uSurge.value = this.surge;
      this.waterUniforms.uMouse.value.set(this.mouse.x, this.mouse.y);
    }

    if (this.particles) {
      const pPos = this.particles.geometry.attributes.position;
      for (let i = 0; i < pPos.count; i++) {
        const s = this.seeds[i];
        let py = pPos.getY(i) + 0.008 + Math.sin(t * 0.8 + s) * 0.006;
        let px = pPos.getX(i) + Math.cos(t * 0.35 + s) * 0.01;
        if (py > 12) py = -0.5;
        pPos.setXY(i, px, py);
      }
      pPos.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
