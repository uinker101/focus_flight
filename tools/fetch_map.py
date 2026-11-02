"""Download the offline map once. Daily use needs no internet.

Usage:
    python3 tools/fetch_map.py           # download whatever is missing; run again to resume
    python3 tools/fetch_map.py --sizes   # only print how big each zoom level is

Writes to app/assets/map/ (not in git):
- base.mbtiles     Protomaps basemap, latest daily build (© OpenStreetMap contributors, ODbL)
- terrain.mbtiles  Mapterhorn elevation, Terrarium-encoded WebP (© Mapterhorn and its sources)
- lights.mbtiles   NASA Black Marble 2016 city lights via NASA GIBS (public domain)
- fonts/           Noto Sans glyphs for Latin-script labels (OFL); Chinese uses the system font

The two global archives are huge (Protomaps ~140 GB); only the low zoom levels are read,
with HTTP range requests, so nothing else is downloaded. Uses only the Python standard library.
"""
import argparse
import datetime as dt
import gzip
import json
import sqlite3
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app/assets/map"
UA = {"User-Agent": "focus-flight-map-fetch/1.0"}

BASE_MAXZOOM = 8
TERRAIN_MAXZOOM = 6
LIGHTS_MAXZOOM = 5
TERRAIN_URL = "https://download.mapterhorn.com/planet.pmtiles"
LIGHTS_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png"
FONTS_URL = "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts/{font}/{range}.pbf"
FONTS = ["Noto Sans Regular", "Noto Sans Medium"]
# Latin, Greek, Cyrillic and punctuation; CJK is drawn with the system font.
FONT_RANGES = [0, 256, 512, 768, 1024, 7680, 7936, 8192, 8448]

TILE_TYPES = {1: "pbf", 2: "png", 3: "jpg", 4: "webp"}


def fetch(url, start=None, length=None, tries=5):
    headers = dict(UA)
    if start is not None:
        headers["Range"] = f"bytes={start}-{start + length - 1}"
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as r:
                data = r.read()
            if start is not None and len(data) != length:
                raise OSError(f"short read {len(data)} of {length}")
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404 or attempt == tries - 1:
                raise
        except OSError:
            if attempt == tries - 1:
                raise
        time.sleep(2 ** attempt)


# --- PMTiles v3 reading -----------------------------------------------------------------------

HEADER = struct.Struct("<7sB11Q6B4iB2i")
HEADER_KEYS = ("magic version root_off root_len meta_off meta_len leaf_off leaf_len data_off data_len "
               "addressed entries contents clustered icomp tcomp ttype minzoom maxzoom "
               "min_lon min_lat max_lon max_lat center_zoom center_lon center_lat").split()


def read_header(url):
    h = dict(zip(HEADER_KEYS, HEADER.unpack(fetch(url, 0, HEADER.size))))
    if h["magic"] != b"PMTiles" or h["version"] != 3:
        raise ValueError(f"{url} is not a PMTiles v3 archive")
    return h


def unzip(data, compression):
    return gzip.decompress(data) if compression == 2 else data


def parse_directory(buf):
    pos = 0

    def varint():
        nonlocal pos
        shift = value = 0
        while True:
            b = buf[pos]
            pos += 1
            value |= (b & 0x7F) << shift
            if b < 0x80:
                return value
            shift += 7

    n = varint()
    ids, last = [], 0
    for _ in range(n):
        last += varint()
        ids.append(last)
    runs = [varint() for _ in range(n)]
    lengths = [varint() for _ in range(n)]
    offsets = []
    for i in range(n):
        v = varint()
        offsets.append(offsets[i - 1] + lengths[i - 1] if v == 0 and i > 0 else v - 1)
    return list(zip(ids, runs, lengths, offsets))


def zoom_start(z):
    return (4 ** z - 1) // 3


def tile_zxy(tile_id):
    z = 0
    while zoom_start(z + 1) <= tile_id:
        z += 1
    t = tile_id - zoom_start(z)
    x = y = 0
    s = 1
    while s < (1 << z):
        rx = 1 & (t // 2)
        ry = 1 & (t ^ rx)
        if ry == 0:
            if rx == 1:
                x, y = s - 1 - x, s - 1 - y
            x, y = y, x
        x += s * rx
        y += s * ry
        t //= 4
        s *= 2
    return z, x, y


def tile_entries(url, h, maxzoom):
    """(first tile id, run length, data length, data offset) for every tile up to maxzoom."""
    limit = zoom_start(maxzoom + 1)

    def walk(offset, length):
        for tile_id, run, size, off in parse_directory(unzip(fetch(url, offset, length), h["icomp"])):
            if tile_id >= limit:
                return
            if run == 0:
                yield from walk(h["leaf_off"] + off, size)
            else:
                yield tile_id, min(run, limit - tile_id), size, off

    yield from walk(h["root_off"], h["root_len"])


def latest_protomaps():
    today = dt.datetime.now(dt.timezone.utc).date()
    for back in range(14):
        url = f"https://build.protomaps.com/{(today - dt.timedelta(days=back)):%Y%m%d}.pmtiles"
        try:
            read_header(url)
            return url
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
    raise SystemExit("找不到最近两周的 Protomaps 构建，请稍后再试")


def report_sizes(name, url, maxzoom):
    h = read_header(url)
    print(f"{name}: {url}")
    per_zoom = {}
    seen = set()
    for tile_id, run, size, off in tile_entries(url, h, maxzoom):
        z = tile_zxy(tile_id)[0]
        count, total = per_zoom.get(z, (0, 0))
        per_zoom[z] = (count + run, total + (0 if off in seen else size))
        seen.add(off)
    running = 0
    for z in sorted(per_zoom):
        count, total = per_zoom[z]
        running += total
        print(f"  z{z:<2} {count:>7} tiles  {total / 1e6:8.1f} MB   up to here {running / 1e6:8.1f} MB")


# --- MBTiles writing ----------------------------------------------------------------------------

def open_part(path):
    db = sqlite3.connect(path)
    db.executescript("""
        CREATE TABLE IF NOT EXISTS metadata (name TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB,
            PRIMARY KEY (zoom_level, tile_column, tile_row));
    """)
    return db


def meta_get(db, name):
    row = db.execute("SELECT value FROM metadata WHERE name = ?", (name,)).fetchone()
    return row and row[0]


def put_tile(db, z, x, y, data):
    db.execute("INSERT OR REPLACE INTO tiles VALUES (?, ?, ?, ?)", (z, x, (1 << z) - 1 - y, data))


def finish(db, part, final, meta):
    db.executemany("INSERT OR REPLACE INTO metadata VALUES (?, ?)", [(k, str(v)) for k, v in meta.items()])
    db.commit()
    db.close()
    part.replace(final)
    print(f"  完成：{final.relative_to(ROOT)} ({final.stat().st_size / 1e6:.0f} MB)")


def download_pmtiles(name, maxzoom, url=None):
    final = OUT / f"{name}.mbtiles"
    if final.exists():
        print(f"{name}: 已存在，跳过")
        return
    url = url or latest_protomaps()
    part = OUT / f"{name}.mbtiles.part"
    db = open_part(part)
    if meta_get(db, "source_url") not in (None, url):
        try:
            read_header(meta_get(db, "source_url"))
            url = meta_get(db, "source_url")  # finish the build that was started
        except urllib.error.HTTPError:
            db.close()
            part.unlink()
            db = open_part(part)
    db.execute("INSERT OR REPLACE INTO metadata VALUES ('source_url', ?)", (url,))
    db.commit()

    h = read_header(url)
    print(f"{name}: {url}，读取目录…")
    by_offset = {}
    for tile_id, run, size, off in tile_entries(url, h, maxzoom):
        by_offset.setdefault((off, size), []).extend(range(tile_id, tile_id + run))
    # Neighbouring tiles are fetched together, up to 16 MB per request.
    chunks, cur = [], None
    for off, size in sorted(by_offset):
        if cur and off - cur[1] < 65536 and off + size - cur[0] <= 16 << 20:
            cur[1] = max(cur[1], off + size)
            cur[2].append((off, size))
        else:
            cur = [off, off + size, [(off, size)]]
            chunks.append(cur)
    done = int(meta_get(db, "done_offset") or -1)
    total = sum(c[1] - c[0] for c in chunks)
    got = sum(c[1] - c[0] for c in chunks if c[1] <= done)
    started = time.time()
    for start, end, parts in chunks:
        if end <= done:
            continue
        data = fetch(url, h["data_off"] + start, end - start)
        for off, size in parts:
            tile = data[off - start:off - start + size]
            for tile_id in by_offset[(off, size)]:
                put_tile(db, *tile_zxy(tile_id), tile)
        db.execute("INSERT OR REPLACE INTO metadata VALUES ('done_offset', ?)", (str(end),))
        db.commit()
        got += end - start
        rate = got / max(1, time.time() - started)
        print(f"\r  {got / 1e6:7.1f} / {total / 1e6:.1f} MB  {rate / 1e6:5.1f} MB/s", end="", flush=True)
    print()
    meta = unzip(fetch(url, h["meta_off"], h["meta_len"]), h["icomp"])
    m = json.loads(meta) if meta else {}
    finish(db, part, final, {
        "name": name, "format": TILE_TYPES[h["ttype"]], "minzoom": 0, "maxzoom": maxzoom,
        "attribution": m.get("attribution", ""), "version": m.get("version", ""),
        "json": json.dumps({"vector_layers": m.get("vector_layers", [])}, ensure_ascii=False),
        "compression": "gzip" if h["tcomp"] == 2 else "none",
    })


def download_lights(maxzoom):
    final = OUT / "lights.mbtiles"
    if final.exists():
        print("lights: 已存在，跳过")
        return
    part = OUT / "lights.mbtiles.part"
    db = open_part(part)
    have = {(z, x, (1 << z) - 1 - row) for z, x, row in db.execute("SELECT zoom_level, tile_column, tile_row FROM tiles")}
    todo = [(z, x, y) for z in range(maxzoom + 1) for x in range(1 << z) for y in range(1 << z) if (z, x, y) not in have]
    print(f"lights: NASA Black Marble，还需 {len(todo)} 块")
    with ThreadPoolExecutor(8) as pool:
        for i, (zxy, data) in enumerate(pool.map(lambda t: (t, fetch(LIGHTS_URL.format(z=t[0], x=t[1], y=t[2]))), todo)):
            put_tile(db, *zxy, data)
            if i % 200 == 0:
                db.commit()
                print(f"\r  {len(have) + i + 1} / {len(have) + len(todo)}", end="", flush=True)
    print()
    finish(db, part, final, {"name": "lights", "format": "png", "minzoom": 0, "maxzoom": maxzoom,
                             "attribution": "NASA Black Marble"})


def download_fonts():
    for font in FONTS:
        folder = OUT / "fonts" / font
        folder.mkdir(parents=True, exist_ok=True)
        for start in FONT_RANGES:
            path = folder / f"{start}-{start + 255}.pbf"
            if not path.exists():
                url = FONTS_URL.format(font=urllib.parse.quote(font), range=f"{start}-{start + 255}")
                path.write_bytes(fetch(url))
    print("fonts: 完成")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--sizes", action="store_true", help="only print the size of each zoom level")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.sizes:
        report_sizes("base", latest_protomaps(), 10)
        report_sizes("terrain", TERRAIN_URL, 9)
        return
    download_fonts()
    download_pmtiles("base", BASE_MAXZOOM)
    download_pmtiles("terrain", TERRAIN_MAXZOOM, TERRAIN_URL)
    download_lights(LIGHTS_MAXZOOM)
    print("地图数据已就绪，之后不需要联网。")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\n已中断，重新运行会接着下载。")
