"use client";

import { useEffect, useRef } from "react";

type Three = typeof import("three");
type Mesh = import("three").Mesh;
type Group = import("three").Group;
type ToonParams = Partial<import("three").MeshToonMaterialParameters>;

export type DishKind = "ramen" | "pancakes";

// Theme tokens from globals.css (oklch converted to hex), plus food colours
// picked from the same warm family.
const COLORS = {
  orange: "#e96018",
  glaze: "#fbead6",
  outline: "#261b14",
  // Cream steam disappears on the light theme's near-white background.
  steamDark: "#fff7ec",
  steamLight: "#d8c2a8",
  broth: "#eca851",
  noodle: "#f6dfaa",
  eggWhite: "#fefdfa",
  yolk: "#ffb330",
  chashu: "#b57261",
  chashuFat: "#eedacb",
  scallion: "#7ab953",
  nori: "#2f3b2a",
  wood: "#865634",
  pancake: "#e7a04c",
  pancakeEdge: "#f3c27a",
  syrup: "#b9561a",
  butter: "#ffe08a",
  strawberry: "#e2463b",
  leaf: "#5fa043",
};

// Only wide screens get the dishes, so phones never download three.js.
const MIN_WIDTH_QUERY = "(min-width: 1280px)";

type Kit = {
  THREE: Three;
  toon: (color: string, extra?: ToonParams) => import("three").MeshToonMaterial;
  outline: (mesh: Mesh, thickness?: number) => Mesh;
};

type DishModel = {
  group: Group;
  /** Where steam columns start, in the dish's own coordinates. */
  steam: { columns: [number, number][]; baseY: number; height: number };
  lookAtY: number;
};

export function Dish3D({
  dish,
  spin = 1,
  className,
}: {
  dish: DishKind;
  /** Turn speed and direction; negative spins the other way. */
  spin?: number;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !window.matchMedia(MIN_WIDTH_QUERY).matches) return;

    let cancelled = false;
    let teardown = () => {};
    import("three").then((THREE) => {
      if (!cancelled) teardown = buildScene(THREE, mount, dish, spin);
    });
    return () => {
      cancelled = true;
      teardown();
    };
  }, [dish, spin]);

  return <div ref={mountRef} aria-hidden="true" className={className} />;
}

function buildScene(THREE: Three, mount: HTMLDivElement, dish: DishKind, spin: number) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#fff3e0", "#5a2c15", 1.6));
  const sun = new THREE.DirectionalLight("#ffffff", 2.4);
  sun.position.set(4, 9, 2);
  scene.add(sun);

  // Three flat bands of shading is what gives the cartoon look.
  const gradient = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;

  // Inverted-hull outline: a back-face copy pushed out along its normals.
  const outlineMaterials = new Map<number, import("three").MeshBasicMaterial>();
  const kit: Kit = {
    THREE,
    toon: (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...extra }),
    outline: (mesh, thickness = 0.022) => {
      let material = outlineMaterials.get(thickness);
      if (!material) {
        material = new THREE.MeshBasicMaterial({ color: COLORS.outline, side: THREE.BackSide });
        material.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>\ntransformed += normalize(normal) * ${thickness.toFixed(4)};`,
          );
        };
        outlineMaterials.set(thickness, material);
      }
      mesh.add(new THREE.Mesh(mesh.geometry, material));
      return mesh;
    },
  };

  const model = dish === "ramen" ? buildRamen(kit) : buildPancakes(kit);
  scene.add(model.group);

  // Locked isometric view: orthographic, 45° around and ~35.26° down. Only
  // the dish turns; the camera never moves.
  const VIEW = 3.6;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(10, 10 + model.lookAtY, 10);
  camera.lookAt(0, model.lookAtY, 0);

  // Steam lives outside the dish group so it keeps rising straight up while
  // the dish turns. Unlit, so it stays soft instead of shading grey.
  const steamGeo = new THREE.SphereGeometry(0.16, 16, 12);
  const puffs: { mesh: Mesh; material: import("three").MeshBasicMaterial; x: number; z: number; offset: number }[] = [];
  model.steam.columns.forEach(([x, z], column) => {
    for (let i = 0; i < 3; i++) {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(steamGeo, material);
      scene.add(mesh);
      puffs.push({ mesh, material, x, z, offset: i / 3 + column * 0.17 });
    }
  });

  function updateSteam(seconds: number) {
    for (const puff of puffs) {
      const t = (seconds * 0.28 + puff.offset) % 1;
      puff.mesh.position.set(
        puff.x + Math.sin(t * Math.PI * 2 + puff.offset * 6) * 0.1,
        model.steam.baseY + t * model.steam.height,
        puff.z,
      );
      puff.mesh.scale.setScalar(0.55 + t * 0.9);
      puff.material.opacity = Math.sin(t * Math.PI) * 0.6;
    }
  }

  function render() {
    renderer.render(scene, camera);
  }

  function applyTheme() {
    const dark = document.documentElement.classList.contains("dark");
    for (const puff of puffs) puff.material.color.set(dark ? COLORS.steamDark : COLORS.steamLight);
    if (reduceMotion) render();
  }
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  function resize() {
    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    const aspect = width / height;
    camera.left = (-VIEW * aspect) / 2;
    camera.right = (VIEW * aspect) / 2;
    camera.top = VIEW / 2;
    camera.bottom = -VIEW / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (reduceMotion) render();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  resize();
  updateSteam(0.6);
  applyTheme();

  // Only animate while the hero is on screen and the tab is visible.
  let onScreen = true;
  let elapsed = 0;
  function setRunning() {
    const run = !reduceMotion && onScreen && document.visibilityState === "visible";
    if (run) {
      let last = performance.now();
      renderer.setAnimationLoop((now: number) => {
        const delta = Math.min((now - last) / 1000, 0.1);
        last = now;
        elapsed += delta;
        model.group.rotation.y += delta * 0.45 * spin;
        model.group.position.y = Math.sin(elapsed * 1.4) * 0.04;
        updateSteam(elapsed);
        render();
      });
    } else {
      renderer.setAnimationLoop(null);
    }
  }
  const intersection = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    setRunning();
  });
  intersection.observe(mount);
  document.addEventListener("visibilitychange", setRunning);
  setRunning();

  return () => {
    renderer.setAnimationLoop(null);
    themeObserver.disconnect();
    intersection.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", setRunning);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => m.dispose());
      }
    });
    gradient.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

function buildRamen({ THREE, toon, outline }: Kit): DishModel {
  const group = new THREE.Group();
  const v = (x: number, y: number) => new THREE.Vector2(x, y);

  // Bowl: orange outside, cream glaze inside, cream band below the rim.
  const outer = new THREE.LatheGeometry(
    [v(0, 0), v(0.44, 0), v(0.47, 0.07), v(0.42, 0.12), v(0.62, 0.18), v(0.92, 0.36),
     v(1.1, 0.6), v(1.2, 0.86), v(1.24, 0.94)],
    64,
  );
  const inner = new THREE.LatheGeometry(
    [v(0, 0.24), v(0.5, 0.28), v(0.82, 0.42), v(1.02, 0.62), v(1.12, 0.86), v(1.17, 0.95), v(1.24, 0.94)],
    64,
  );
  group.add(outline(new THREE.Mesh(outer, toon(COLORS.orange, { side: THREE.DoubleSide })), 0.03));
  group.add(new THREE.Mesh(inner, toon(COLORS.glaze, { side: THREE.DoubleSide })));
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.035, 10, 64), toon(COLORS.glaze));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.74;
  group.add(band);

  const BROTH_Y = 0.8;
  const broth = new THREE.Mesh(new THREE.CircleGeometry(1.08, 64), toon(COLORS.broth));
  broth.rotation.x = -Math.PI / 2;
  broth.position.y = BROTH_Y;
  group.add(broth);

  // Noodle loops poking out of the broth.
  const noodleMat = toon(COLORS.noodle);
  [[-0.1, 0.15, 0.4], [0.25, -0.3, 1.6], [-0.45, -0.1, 2.6], [0.05, 0.5, 3.8]].forEach(([x, z, r]) => {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.028, 8, 24, Math.PI), noodleMat);
    loop.position.set(x, BROTH_Y - 0.02, z);
    loop.rotation.y = r;
    group.add(loop);
  });

  // Soft-boiled egg half, cut side up.
  const egg = new THREE.Group();
  const eggWhite = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    toon(COLORS.eggWhite, { side: THREE.DoubleSide }),
  );
  eggWhite.rotation.x = Math.PI;
  eggWhite.scale.set(1, 0.55, 1.3);
  egg.add(outline(eggWhite, 0.02));
  const eggFace = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), toon(COLORS.eggWhite));
  eggFace.rotation.x = -Math.PI / 2;
  eggFace.scale.set(1, 1.3, 1);
  egg.add(eggFace);
  const yolk = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), toon(COLORS.yolk));
  yolk.rotation.x = -Math.PI / 2;
  yolk.position.y = 0.005;
  egg.add(yolk);
  egg.position.set(0.42, BROTH_Y + 0.05, 0.28);
  egg.rotation.set(0.12, 0.6, 0);
  group.add(egg);

  // Two slices of chashu pork with a fatty rim.
  const chashuMat = toon(COLORS.chashu);
  const fatMat = toon(COLORS.chashuFat);
  [[-0.45, 0.25, 0.2], [-0.2, -0.45, -0.25]].forEach(([x, z, tilt]) => {
    const slice = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 28), fatMat), 0.018);
    slice.add(new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.065, 28), chashuMat));
    slice.position.set(x, BROTH_Y + 0.04, z);
    slice.rotation.set(tilt, 0, tilt * 0.6);
    group.add(slice);
  });

  // Nori sheet leaning against the back of the bowl.
  const nori = outline(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.02), toon(COLORS.nori)), 0.015);
  nori.position.set(0.25, BROTH_Y + 0.18, -0.72);
  nori.rotation.set(-0.35, 0.2, 0.05);
  group.add(nori);

  // Scallion rings, spread with the golden angle so they never clump.
  const scallionMat = toon(COLORS.scallion);
  const scallionGeo = new THREE.TorusGeometry(0.045, 0.017, 6, 14);
  for (let i = 0; i < 14; i++) {
    const angle = i * 2.39996;
    const radius = 0.25 + ((i * 37) % 60) / 100;
    const ring = new THREE.Mesh(scallionGeo, scallionMat);
    ring.position.set(Math.cos(angle) * radius, BROTH_Y + 0.01, Math.sin(angle) * radius);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  // Chopsticks resting across the rim.
  const woodMat = toon(COLORS.wood);
  const tipMat = toon(COLORS.orange);
  [[0.32, -0.12], [0.5, -0.04]].forEach(([z, yaw]) => {
    const stick = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.042, 2.8, 12), woodMat), 0.016);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.12, 12), tipMat);
    tip.position.y = -1.15;
    stick.add(tip);
    stick.rotation.set(0, yaw, Math.PI / 2 - 0.08);
    stick.position.set(0.15, 1.02, z);
    group.add(stick);
  });

  group.rotation.y = -0.6;
  return {
    group,
    steam: { columns: [[-0.3, 0.1], [0.05, -0.15], [0.35, 0.05]], baseY: 1.05, height: 1.5 },
    lookAtY: 0.55,
  };
}

function buildPancakes({ THREE, toon, outline }: Kit): DishModel {
  const group = new THREE.Group();
  const v = (x: number, y: number) => new THREE.Vector2(x, y);

  // Plate: cream with an orange rim.
  const plate = new THREE.LatheGeometry(
    [v(0, 0), v(0.7, 0), v(0.78, 0.04), v(0.95, 0.06), v(1.28, 0.16), v(1.34, 0.2), v(1.3, 0.22),
     v(1.0, 0.12), v(0.85, 0.1), v(0, 0.1)],
    64,
  );
  group.add(outline(new THREE.Mesh(plate, toon(COLORS.glaze, { side: THREE.DoubleSide })), 0.028));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.035, 10, 64), toon(COLORS.orange));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.2;
  group.add(rim);

  // Pancakes: a slightly wonky stack, each with soft rounded edges.
  const pancakeProfile = new THREE.LatheGeometry(
    [v(0, 0), v(0.74, 0), v(0.8, 0.02), v(0.83, 0.07), v(0.8, 0.12), v(0.74, 0.14), v(0, 0.14)],
    48,
  );
  const pancakeMat = toon(COLORS.pancake);
  const STACK = 4;
  let top = 0.1;
  for (let i = 0; i < STACK; i++) {
    const cake = outline(new THREE.Mesh(pancakeProfile, pancakeMat), 0.02);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.03, 8, 48), toon(COLORS.pancakeEdge));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.07;
    cake.add(ring);
    cake.position.set(Math.sin(i * 2.1) * 0.05, top, Math.cos(i * 1.7) * 0.05);
    cake.rotation.y = i;
    group.add(cake);
    top += 0.135;
  }

  // Syrup pool on top, with drips running down the sides.
  const syrupMat = toon(COLORS.syrup);
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.68, 0.03, 40), syrupMat);
  pool.position.y = top + 0.015;
  group.add(pool);
  [0.3, 1.5, 2.6, 3.7, 5.0].forEach((angle, i) => {
    const length = 0.12 + (i % 3) * 0.1;
    const drip = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, length, 4, 10), syrupMat);
    drip.position.set(Math.cos(angle) * 0.8, top - length / 2 - 0.02, Math.sin(angle) * 0.8);
    group.add(drip);
  });

  // Pat of butter, slightly melted and off-centre.
  const butter = outline(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), toon(COLORS.butter)), 0.016);
  butter.position.set(0.08, top + 0.08, -0.05);
  butter.rotation.set(0.04, 0.5, -0.03);
  group.add(butter);

  // Strawberries: one on top, two on the plate.
  const berryMat = toon(COLORS.strawberry);
  const leafMat = toon(COLORS.leaf);
  const berry = (x: number, y: number, z: number, tilt: number) => {
    const fruit = outline(new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), berryMat), 0.016);
    fruit.scale.set(1, 1.2, 1);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.06, 6), leafMat);
    leaves.position.y = 0.14;
    leaves.rotation.x = Math.PI;
    fruit.add(leaves);
    fruit.position.set(x, y, z);
    fruit.rotation.z = tilt;
    group.add(fruit);
  };
  berry(-0.25, top + 0.17, 0.2, 0.4);
  berry(0.95, 0.27, 0.45, 1.2);
  berry(0.75, 0.27, 0.8, -1.0);

  group.rotation.y = 0.5;
  return {
    group,
    steam: { columns: [[-0.2, 0.05], [0.2, -0.1]], baseY: top + 0.2, height: 1.2 },
    lookAtY: 0.45,
  };
}
