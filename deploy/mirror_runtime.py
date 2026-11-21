"""Copy the Pygbag runtime into a web build so players download it from our server.

Usage: python deploy/mirror_runtime.py game/build/web
"""

import gzip
import json
from pathlib import Path
import re
import sys
from urllib.request import urlopen


CDN = "https://pygame-web.github.io/cdn/"
LOCAL_CDN = "/cdn/"
# Already-compressed files gain nothing from gzip
SKIP_GZIP = {".whl", ".png"}


def download(path, web):
    target = web / "cdn" / path
    target.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(CDN + path) as response:
        target.write_bytes(response.read())
    print(f"mirrored {path} ({target.stat().st_size} bytes)")
    return target


def main():
    web = Path(sys.argv[1])
    page = web / "index.html"
    html = page.read_text()

    version = re.search(re.escape(CDN) + r"(\d+\.\d+\.\d+)/", html).group(1)
    python = "cp" + re.search(r'PYBUILD : "(\d+)\.(\d+)"', html).expand(r"\1\2")

    files = [
        f"{version}/pythons.js",
        f"{version}/empty.html",
        f"{version}/cpythonrc.py",
        f"{version}/cpython{python[2:]}/main.js",
        f"{version}/cpython{python[2:]}/main.data",
        f"{version}/cpython{python[2:]}/main.wasm",
        "vtx.js",
        "vt/xterm.js",
        "vt/xterm.css",
        "vt/xterm-addon-image.js",
    ]
    mirrored = [download(path, web) for path in files]

    # The package index tells the runtime where to fetch wheels from
    index_path = f"index-{version}-{python}.json"
    index_file = download(index_path, web)
    index = json.loads(index_file.read_text())
    wheel = index["pygame"].replace("<abi>", python).replace("<api>", "wasm32_bi_emscripten")
    mirrored.append(download(wheel, web))
    index["-CDN-"] = LOCAL_CDN
    index_file.write_text(json.dumps(index, indent=4))
    mirrored.append(index_file)

    page.write_text(html.replace(CDN, LOCAL_CDN))

    for path in mirrored:
        if path.suffix not in SKIP_GZIP:
            path.with_name(path.name + ".gz").write_bytes(gzip.compress(path.read_bytes(), 9))


if __name__ == "__main__":
    main()
