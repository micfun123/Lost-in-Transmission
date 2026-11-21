extends Node
## Global game state, available from any script as `Game`.
## e.g. `Game.score += 1` or `Game.change_scene("res://scenes/levels/level_2.tscn")`

signal score_changed(new_score: int)

var score: int = 0:
	set(value):
		score = value
		score_changed.emit(score)


func change_scene(path: String) -> void:
	get_tree().change_scene_to_file(path)


func restart() -> void:
	score = 0
	get_tree().reload_current_scene()


func _unhandled_input(event: InputEvent) -> void:
	# Quick restart while testing. Remove before submitting if you don't want it.
	if event.is_action_pressed("restart"):
		restart()
