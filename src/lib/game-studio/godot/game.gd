extends Node3D

var project_data: Dictionary = {}
var player: CharacterBody3D
var player_speed := 3.0
var game_camera: Camera3D
var status: Label
var touch_controls: HBoxContainer
var touch_exit: Button
var touch_buttons: Array[Button] = []
var loaded_objects := 0
var failure := ""
var assets: Dictionary = {}

func _ready() -> void:
    _setup_input()
    _setup_environment()
    _setup_ui()
    if project_data.is_empty():
        var project_path := ""
        for arg in OS.get_cmdline_user_args():
            if arg.begins_with("--env-project="):
                project_path = arg.trim_prefix("--env-project=")
        if project_path.is_empty() and FileAccess.file_exists("res://project.json"):
            project_path = "res://project.json"
        if project_path.is_empty() or not FileAccess.file_exists(project_path):
            _fail("Choose an enV 3D project to play.")
            return
        var source := FileAccess.get_file_as_string(project_path)
        var parsed = JSON.parse_string(source)
        if not parsed is Dictionary:
            _fail("The project file is malformed.")
            return
        project_data = parsed
    if project_data.get("format") != "env-3d-game" or project_data.get("version") != 1:
        _fail("This project format is unsupported.")
        return
    for asset in project_data.get("assets", []):
        assets[asset.get("id", "")] = asset
    for item in project_data.get("objects", []):
        if not _create_object(item):
            return
    if DisplayServer.is_touchscreen_available():
        status.text = "Use arrows to move" if player else "No player configured"
    else:
        status.text = "Game running · WASD or arrow keys to move" if player else "Game running · no player configured"
    print("ENV_GAME_READY objects=%d" % loaded_objects)

func _fail(message: String) -> void:
    failure = message
    if status: status.text = message
    push_error(message)

func _vector(value: Dictionary) -> Vector3:
    return Vector3(float(value.get("x", 0)), float(value.get("y", 0)), float(value.get("z", 0)))

func _setup_input() -> void:
    var mappings := {"env_forward": [KEY_W, KEY_UP], "env_backward": [KEY_S, KEY_DOWN], "env_left": [KEY_A, KEY_LEFT], "env_right": [KEY_D, KEY_RIGHT]}
    for action in mappings:
        if not InputMap.has_action(action): InputMap.add_action(action)
        for keycode in mappings[action]:
            var event := InputEventKey.new()
            event.physical_keycode = keycode
            InputMap.action_add_event(action, event)

func _setup_environment() -> void:
    var environment := WorldEnvironment.new()
    environment.environment = Environment.new()
    environment.environment.background_mode = Environment.BG_COLOR
    environment.environment.background_color = Color("c2d6e8")
    environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    environment.environment.ambient_light_color = Color.WHITE
    environment.environment.ambient_light_energy = 0.75
    add_child(environment)
    var light := DirectionalLight3D.new()
    light.rotation_degrees = Vector3(-45, -30, 0)
    add_child(light)
    game_camera = Camera3D.new()
    add_child(game_camera)
    game_camera.position = Vector3(0, 6, -8)
    game_camera.look_at(Vector3.ZERO)
    game_camera.current = true

func _setup_ui() -> void:
    var layer := CanvasLayer.new()
    add_child(layer)
    status = Label.new()
    status.position = Vector2(16, 16)
    status.text = "Loading game…"
    layer.add_child(status)
    if not DisplayServer.is_touchscreen_available(): return
    touch_exit = Button.new()
    touch_exit.text = "Exit"
    touch_exit.pressed.connect(func(): get_tree().quit())
    layer.add_child(touch_exit)
    touch_controls = HBoxContainer.new()
    layer.add_child(touch_controls)
    for entry in [["←", "env_left"], ["↑", "env_forward"], ["↓", "env_backward"], ["→", "env_right"]]:
        var button := Button.new()
        button.text = entry[0]
        var action: String = entry[1]
        button.button_down.connect(func(): Input.action_press(action))
        button.button_up.connect(func(): Input.action_release(action))
        touch_controls.add_child(button)
        touch_buttons.append(button)
    get_viewport().size_changed.connect(_layout_touch_controls)
    _layout_touch_controls()
    call_deferred("_layout_touch_controls")

func _layout_touch_controls() -> void:
    if not touch_controls: return
    # Convert a 48 dp touch target into the scaled Godot viewport's coordinates.
    var viewport := get_viewport().get_visible_rect().size
    var screen := Vector2(DisplayServer.window_get_size())
    var screen_width := maxf(screen.x, 1.0)
    var safe := Rect2(Vector2.ZERO, viewport)
    var device_safe := DisplayServer.get_display_safe_area()
    if device_safe.size.x > 0 and device_safe.size.y > 0 and screen.y > 0:
        var scale := viewport / screen
        var clipped := Rect2(Vector2(device_safe.position) * scale, Vector2(device_safe.size) * scale).intersection(safe)
        if clipped.size.x > 0 and clipped.size.y > 0: safe = clipped
    var density := maxf(1.0, float(DisplayServer.screen_get_dpi()) / 160.0)
    var button_size := minf(maxf(64.0, 48.0 * density * viewport.x / screen_width), minf(safe.size.x / 5.0, safe.size.y / 3.0))
    var padding := button_size * 0.25
    var separation := roundi(button_size * 0.08)
    touch_controls.add_theme_constant_override("separation", separation)
    touch_controls.position = Vector2(safe.position.x + padding, safe.end.y - button_size - padding)
    touch_controls.size = Vector2(4 * button_size + 3 * separation, button_size)
    for button in touch_buttons:
        button.custom_minimum_size = Vector2(button_size, button_size)
        button.add_theme_font_size_override("font_size", roundi(button_size * 0.42))
    touch_exit.custom_minimum_size = Vector2(button_size * 1.5, button_size)
    touch_exit.size = touch_exit.custom_minimum_size
    touch_exit.position = Vector2(safe.end.x - touch_exit.size.x - padding, safe.position.y + padding)
    touch_exit.add_theme_font_size_override("font_size", roundi(button_size * 0.32))
    status.position = safe.position + Vector2(padding, padding)
    status.add_theme_font_size_override("font_size", roundi(button_size * 0.28))

func _create_object(item: Dictionary) -> bool:
    var kind: String = item.get("kind", "")
    var root: Node3D
    if item.get("player", false):
        if kind not in ["box", "sphere", "cylinder"]:
            _fail("Only primitive shapes can be a player in this runtime.")
            return false
        player = CharacterBody3D.new()
        player.motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
        player_speed = float(item.get("speed", 3))
        root = player
    else:
        root = Node3D.new()
    root.name = item.get("name", "Object")
    root.position = _vector(item.get("position", {}))
    root.rotation_degrees = _vector(item.get("rotation", {}))
    root.visible = item.get("visible", true)
    add_child(root)
    var size := _vector(item.get("scale", {"x":1, "y":1, "z":1}))
    if kind == "model":
        var asset: Dictionary = assets.get(item.get("assetId", ""), {})
        if asset.is_empty():
            _fail("A model asset is missing.")
            return false
        var encoded: String = asset.get("dataUrl", "")
        if not encoded.begins_with("data:model/gltf-binary;base64,"):
            _fail("A model asset is invalid.")
            return false
        var document := GLTFDocument.new()
        var state := GLTFState.new()
        var result := document.append_from_buffer(Marshalls.base64_to_raw(encoded.get_slice(",", 1)), "", state)
        if result != OK:
            _fail("A GLB model could not be loaded.")
            return false
        var model := document.generate_scene(state)
        if not model:
            _fail("A GLB model has no scene.")
            return false
        root.add_child(model)
        model.scale = size
        if item.get("collider", false): _model_collisions(model, root.visible)
        _play_first_animation(model)
    else:
        var mesh := MeshInstance3D.new()
        var shape: Shape3D
        match kind:
            "box":
                mesh.mesh = BoxMesh.new()
                var box := BoxShape3D.new(); box.size = size; shape = box
            "sphere":
                var sphere_mesh := SphereMesh.new(); sphere_mesh.radius = 0.5; sphere_mesh.height = 1.0; mesh.mesh = sphere_mesh
                var sphere := SphereShape3D.new(); sphere.radius = 0.5 * maxf(size.x, maxf(size.y, size.z)); shape = sphere
            "cylinder":
                var cylinder_mesh := CylinderMesh.new(); cylinder_mesh.top_radius = 0.5; cylinder_mesh.bottom_radius = 0.5; cylinder_mesh.height = 1.0; mesh.mesh = cylinder_mesh
                var cylinder := CylinderShape3D.new(); cylinder.radius = 0.5 * maxf(size.x, size.z); cylinder.height = size.y; shape = cylinder
            "ground":
                var plane := PlaneMesh.new(); plane.size = Vector2(1, 1); mesh.mesh = plane
                var ground := BoxShape3D.new(); ground.size = Vector3(size.x, 0.05, size.z); shape = ground
            "artboard":
                var asset: Dictionary = assets.get(item.get("assetId", ""), {})
                if asset.is_empty():
                    _fail("An Artboard image is missing.")
                    return false
                var quad := QuadMesh.new(); var aspect := float(asset.get("width", 1)) / maxf(1.0, float(asset.get("height", 1))); quad.size = Vector2(aspect, 1); mesh.mesh = quad
                var plane_shape := BoxShape3D.new(); plane_shape.size = Vector3(aspect * size.x, size.y, 0.05); shape = plane_shape
            _:
                _fail("This scene contains an unsupported object.")
                return false
        mesh.scale = size
        var material := StandardMaterial3D.new()
        material.albedo_color = Color.from_string(item.get("color", "#ffffff"), Color.WHITE)
        if kind == "artboard":
            var asset: Dictionary = assets[item.get("assetId", "")]
            var image := Image.new()
            if image.load_png_from_buffer(Marshalls.base64_to_raw(String(asset.get("dataUrl", "")).get_slice(",", 1))) != OK:
                _fail("An Artboard image could not be loaded.")
                return false
            material.albedo_texture = ImageTexture.create_from_image(image)
            material.albedo_color = Color.WHITE
            material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
            material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
            material.cull_mode = BaseMaterial3D.CULL_DISABLED
        mesh.material_override = material
        root.add_child(mesh)
        if item.get("collider", false) or item.get("player", false):
            var body: CollisionObject3D = root if root is CharacterBody3D else StaticBody3D.new()
            if body != root: root.add_child(body)
            var collision := CollisionShape3D.new(); collision.shape = shape
            if kind == "ground": collision.position.y = -0.025
            collision.disabled = not root.visible
            body.add_child(collision)
    loaded_objects += 1
    return true

func _model_collisions(node: Node, enabled: bool) -> void:
    if node is MeshInstance3D: node.create_trimesh_collision()
    if node is CollisionShape3D: node.disabled = not enabled
    for child in node.get_children(): _model_collisions(child, enabled)

func _play_first_animation(node: Node) -> void:
    if node is AnimationPlayer:
        var animation_player := node as AnimationPlayer
        var clips: PackedStringArray = animation_player.get_animation_list()
        if not clips.is_empty(): animation_player.play(clips[0])
    for child in node.get_children(): _play_first_animation(child)

func _physics_process(_delta: float) -> void:
    if not player or not failure.is_empty(): return
    var input := Input.get_vector("env_left", "env_right", "env_backward", "env_forward")
    player.velocity = Vector3(input.x, 0, input.y) * player_speed
    player.move_and_slide()
    game_camera.position = player.global_position + Vector3(0, 6, -8)
    game_camera.look_at(player.global_position)
