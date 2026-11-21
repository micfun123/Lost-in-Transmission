import asyncio
import math
from pathlib import Path
import sys

import pygame


TITLE = "Lost in Transmission"
WINDOW_SIZE = (1280, 720)
PLAYER_SIZE = 64
PLAYER_SPEED = 300.0
CAMERA_SPEED = 5.0
STICK_DEAD_ZONE = 0.2
BACKGROUND_COLOR = (77, 77, 77)
WALL_COLOR = (89, 102, 128)
WALL = pygame.FRect(236, -64, 128, 128)
PLAYER_IMAGE = Path(__file__).with_name("assets") / "art" / "player.png"


def movement_direction(keys, joystick):
    left = keys[pygame.K_a] or keys[pygame.K_LEFT]
    right = keys[pygame.K_d] or keys[pygame.K_RIGHT]
    up = keys[pygame.K_w] or keys[pygame.K_UP]
    down = keys[pygame.K_s] or keys[pygame.K_DOWN]

    stick = pygame.Vector2()
    if joystick is not None and joystick.get_numaxes() >= 2:
        stick.update(joystick.get_axis(0), joystick.get_axis(1))

    direction = pygame.Vector2(
        max(right, stick.x) - max(left, -stick.x),
        max(down, stick.y) - max(up, -stick.y),
    )
    strength = direction.length()
    if strength <= STICK_DEAD_ZONE:
        return pygame.Vector2()

    scaled_strength = (min(strength, 1.0) - STICK_DEAD_ZONE) / (1.0 - STICK_DEAD_ZONE)
    return direction * (scaled_strength / strength)


def move_player(player, motion, wall):
    player.x += motion.x
    if player.colliderect(wall):
        if motion.x > 0:
            player.right = wall.left
        elif motion.x < 0:
            player.left = wall.right

    player.y += motion.y
    if player.colliderect(wall):
        if motion.y > 0:
            player.bottom = wall.top
        elif motion.y < 0:
            player.top = wall.bottom


async def main():
    in_browser = sys.platform == "emscripten"
    pygame.display.init()
    pygame.joystick.init()
    screen = pygame.display.set_mode(WINDOW_SIZE, 0 if in_browser else pygame.RESIZABLE)
    pygame.display.set_caption(TITLE)
    image = pygame.image.load(PLAYER_IMAGE).convert_alpha()
    sprite = pygame.transform.smoothscale(image, (PLAYER_SIZE, PLAYER_SIZE))

    player = sprite.get_frect(center=(0, 0))
    camera = pygame.Vector2(player.center)
    joysticks = {}
    clock = pygame.time.Clock()

    running = True
    while running:
        # Cap the timestep after a pause so the player cannot skip through the wall.
        elapsed = min(clock.tick(0 if in_browser else 60) / 1000, 0.05)
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN and event.key == pygame.K_r:
                player.center = (0, 0)
                camera.update(player.center)
            elif event.type == pygame.JOYDEVICEADDED:
                joystick = pygame.joystick.Joystick(event.device_index)
                joysticks[joystick.get_instance_id()] = joystick
            elif event.type == pygame.JOYDEVICEREMOVED:
                joysticks.pop(event.instance_id, None)

        active_joystick = next(iter(joysticks.values()), None)
        direction = movement_direction(pygame.key.get_pressed(), active_joystick)
        move_player(player, direction * PLAYER_SPEED * elapsed, WALL)

        camera = camera.lerp(player.center, 1 - math.exp(-CAMERA_SPEED * elapsed))
        offset = pygame.Vector2(screen.get_rect().center) - camera
        screen.fill(BACKGROUND_COLOR)
        pygame.draw.rect(screen, WALL_COLOR, WALL.move(round(offset.x), round(offset.y)))
        sprite_position = pygame.Vector2(player.topleft) + offset
        screen.blit(sprite, (round(sprite_position.x), round(sprite_position.y)))
        pygame.display.flip()
        await asyncio.sleep(0)

    pygame.quit()


if __name__ == "__main__":
    asyncio.run(main())
