// @ts-nocheck
// This file is packaged unchanged in exported games and runs inside the isolated play frame.
(async function () {
  const status = document.getElementById("status");
  const announce = (type, message) => {
    status.textContent = message;
    if (window.parent !== window)
      window.parent.postMessage({ source: "env-game-runtime", type, message }, "*");
  };
  try {
    const project = JSON.parse(document.getElementById("project-data").textContent);
    const B = window.BABYLON;
    if (!B || !B.Engine.isSupported()) throw new Error("WebGL is not available on this device.");
    const canvas = document.getElementById("game");
    const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true });
    const scene = new B.Scene(engine);
    scene.clearColor = new B.Color4(0.76, 0.84, 0.91, 1);
    scene.collisionsEnabled = true;
    const camera = new B.ArcRotateCamera(
      "camera",
      -Math.PI / 2,
      1.05,
      8,
      new B.Vector3(0, 0.5, 0),
      scene,
    );
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 35;
    camera.attachControl(canvas, true);
    new B.HemisphericLight("sky", new B.Vector3(0, 1, 0), scene).intensity = 0.85;
    const sun = new B.DirectionalLight("sun", new B.Vector3(-1, -2, -1), scene);
    sun.intensity = 0.6;
    let player = null,
      speed = 3;
    const assets = new Map(project.assets.map((a) => [a.id, a]));
    function setTransform(node, object) {
      node.position.set(object.position.x, object.position.y, object.position.z);
      node.rotation.set(
        B.Tools.ToRadians(object.rotation.x),
        B.Tools.ToRadians(object.rotation.y),
        B.Tools.ToRadians(object.rotation.z),
      );
      node.scaling.set(object.scale.x, object.scale.y, object.scale.z);
      node.setEnabled(object.visible);
    }
    function blobFor(dataUrl) {
      const parts = dataUrl.split(",");
      const binary = atob(parts[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }));
    }
    for (const object of project.objects) {
      let node;
      if (object.kind === "model") {
        const asset = assets.get(object.assetId);
        if (!asset) throw new Error("Missing model: " + object.name);
        const url = blobFor(asset.dataUrl);
        try {
          const loaded = await B.SceneLoader.ImportMeshAsync("", "", url, scene, undefined, ".glb");
          node = new B.TransformNode(object.name, scene);
          loaded.meshes
            .filter((mesh) => !mesh.parent)
            .forEach((mesh) => {
              mesh.parent = node;
            });
          loaded.transformNodes
            .filter((item) => !item.parent)
            .forEach((item) => {
              item.parent = node;
            });
          loaded.meshes.forEach((mesh) => {
            mesh.checkCollisions = object.collider;
          });
        } finally {
          URL.revokeObjectURL(url);
        }
      } else {
        if (object.kind === "box") node = B.MeshBuilder.CreateBox(object.name, { size: 1 }, scene);
        else if (object.kind === "sphere")
          node = B.MeshBuilder.CreateSphere(object.name, { diameter: 1, segments: 24 }, scene);
        else if (object.kind === "cylinder")
          node = B.MeshBuilder.CreateCylinder(object.name, { height: 1, diameter: 1 }, scene);
        else if (object.kind === "ground")
          node = B.MeshBuilder.CreateGround(object.name, { width: 1, height: 1 }, scene);
        else if (object.kind === "artboard") {
          const asset = assets.get(object.assetId);
          if (!asset) throw new Error("Missing Artboard image: " + object.name);
          node = B.MeshBuilder.CreatePlane(
            object.name,
            {
              width: (asset.width || 1) / (asset.height || 1),
              height: 1,
              sideOrientation: B.Mesh.DOUBLESIDE,
            },
            scene,
          );
        } else throw new Error("Unsupported object: " + object.kind);
        const material = new B.StandardMaterial(object.name + " material", scene);
        material.diffuseColor = B.Color3.FromHexString(object.color);
        material.specularColor = new B.Color3(0.12, 0.12, 0.12);
        if (object.kind === "artboard") {
          material.diffuseTexture = new B.Texture(assets.get(object.assetId).dataUrl, scene);
          material.diffuseTexture.hasAlpha = true;
          material.useAlphaFromDiffuseTexture = true;
          material.emissiveColor = B.Color3.White();
        }
        node.material = material;
        node.checkCollisions = object.collider && !object.player;
      }
      setTransform(node, object);
      if (object.player && node instanceof B.AbstractMesh) {
        player = node;
        speed = object.speed;
        player.ellipsoid = new B.Vector3(
          Math.max(0.15, object.scale.x * 0.45),
          Math.max(0.15, object.scale.y * 0.45),
          Math.max(0.15, object.scale.z * 0.45),
        );
      }
    }
    if (player) camera.setTarget(player.position.clone());
    const keys = new Set();
    let paused = false;
    function key(event, down) {
      const value = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(value)) {
        event.preventDefault();
        if (down) keys.add(value);
        else keys.delete(value);
      }
    }
    window.addEventListener("keydown", (event) => key(event, true));
    window.addEventListener("keyup", (event) => key(event, false));
    window.addEventListener("blur", () => keys.clear());
    document.querySelectorAll("[data-key]").forEach((button) => {
      const code = button.dataset.key;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        keys.add(code);
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) =>
        button.addEventListener(type, () => keys.delete(code)),
      );
    });
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent || event.data?.source !== "env-game-editor") return;
      if (event.data.action === "pause") {
        paused = Boolean(event.data.paused);
        scene.animationsEnabled = !paused;
        announce("status", paused ? "Paused" : "Running");
      }
    });
    engine.runRenderLoop(() => {
      if (!paused && player) {
        const x =
          Number(keys.has("d") || keys.has("arrowright")) -
          Number(keys.has("a") || keys.has("arrowleft"));
        const z =
          Number(keys.has("w") || keys.has("arrowup")) -
          Number(keys.has("s") || keys.has("arrowdown"));
        if (x || z) {
          const delta = Math.min(engine.getDeltaTime() / 1000, 0.05) * speed;
          const direction = new B.Vector3(x, 0, z).normalize().scale(delta);
          player.moveWithCollisions(direction);
        }
        camera.target.copyFrom(player.position);
      }
      scene.render();
    });
    window.addEventListener("resize", () => engine.resize());
    window.addEventListener("beforeunload", () => {
      scene.dispose();
      engine.dispose();
    });
    announce(
      "ready",
      player
        ? "Game running · WASD or arrow keys to move"
        : "Game running · add a player to enable movement",
    );
  } catch (error) {
    announce(
      "error",
      "Game could not start: " + (error instanceof Error ? error.message : "Unknown error"),
    );
  }
})();
