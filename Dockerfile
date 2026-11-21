# Build the browser client with pygbag
FROM python:3.12-slim AS build

WORKDIR /src
COPY requirements.txt ./
RUN pip install --no-cache-dir $(grep -E '^pygbag' requirements.txt)

COPY game ./game
RUN python -m pygbag --build --ume_block 0 --title "Lost in Transmission" game

# Run the multiplayer server, which also serves the client
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir $(grep -E '^aiohttp' requirements.txt)

COPY server.py operation.py ./
COPY game/radio.py ./game/
COPY --from=build /src/game/build/web ./game/build/web

EXPOSE 8000
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8000"]
