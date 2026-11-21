extends CharacterBody2D
## Top-down player movement. Tweak `speed` in the Inspector while the game runs.

@export var speed: float = 300.0


func _physics_process(_delta: float) -> void:
	# get_vector reads the four actions defined in Project > Project Settings > Input Map.
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	velocity = direction * speed
	move_and_slide()
