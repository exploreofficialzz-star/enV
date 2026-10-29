extends SceneTree
func _initialize() -> void:
    call_deferred("run_test")
func run_test() -> void:
    var data = JSON.parse_string(FileAccess.get_file_as_string(OS.get_environment("ENV_GAME_FIXTURE")))
    var player_data: Dictionary = {}
    for item in data.objects:
        if item.get("player", false): player_data = item
    if player_data.is_empty():
        printerr("The test project has no player."); quit(1); return
    var initial: Dictionary = player_data.position
    data.objects.append({"id":"test-wall","name":"Wall","kind":"box","position":{"x":initial.x + 2.75,"y":initial.y,"z":initial.z},"rotation":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1},"color":"#ffbbaa","visible":true,"locked":false,"collider":true,"player":false,"speed":3})
    var game = load("res://game.gd").new()
    game.project_data = data
    root.add_child(game)
    await process_frame
    if not game.failure.is_empty() or game.loaded_objects != data.objects.size() or not game.player:
        printerr("Runtime failed: ", game.failure, " objects: ", game.loaded_objects)
        quit(1); return
    var start: float = game.player.position.x
    Input.action_press("env_right")
    for i in 120: await physics_frame
    Input.action_release("env_right")
    var end: float = game.player.position.x
    if end <= start + 0.1 or end > start + 1.9:
        printerr("Movement/collision failed: ", start, " -> ", end)
        quit(1); return
    print("GODOT_RUNTIME_PASS objects=", game.loaded_objects, " start=", start, " blocked=", end)
    game.queue_free()
    await process_frame
    quit(0)
