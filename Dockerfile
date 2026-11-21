# Build the web version with pygbag
FROM python:3.12-slim AS build

RUN pip install --no-cache-dir pygbag

WORKDIR /src/lost-in-transmission
COPY main.py ./
COPY assets ./assets

RUN python -m pygbag --build \
    --app_name lost-in-transmission \
    --title "Lost in Transmission" \
    .

# Serve the static build with nginx
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/lost-in-transmission/build/web /usr/share/nginx/html

EXPOSE 80
