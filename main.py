import asyncio

import pygame

WIDTH, HEIGHT = 1280, 720
FPS = 60


async def main():
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("Lost in Transmission")
    clock = pygame.time.Clock()

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

        screen.fill((0, 0, 0))
        pygame.display.flip()
        clock.tick(FPS)

        # Required by pygbag: yields control to the browser each frame
        await asyncio.sleep(0)

    pygame.quit()


asyncio.run(main())
