FROM python:3.12-slim

WORKDIR /src/lost-in-transmission
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY game/ ./game/
RUN python -m pygbag --build \
    --ume_block 0 \
    --title "Lost in Transmission" \
    game

COPY server.py operation.py ./

EXPOSE 80
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "80"]
