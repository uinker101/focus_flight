"""Compact Natural Earth GeoJSON into the small map files the app loads offline.

Usage: python3 -I tools/build_map.py <ne_50m_land.geojson> <ne_50m_admin_0_boundary_lines_land.geojson> <ne_50m_populated_places.geojson>

Writes app/assets/map/world.json: { land: [[lon,lat,...]], borders: [[...]], places: [[name_zh, name_en, lon, lat, scalerank, pop_thousands]] }
Natural Earth data is public domain.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def rings(geom):
    if geom["type"] == "Polygon":
        return geom["coordinates"]
    if geom["type"] == "MultiPolygon":
        return [r for poly in geom["coordinates"] for r in poly]
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def flat(ring):
    out = []
    for lon, lat, *_ in ring:
        out += [round(lon, 2), round(lat, 2)]
    return out


def main():
    land_path, borders_path, places_path = sys.argv[1:4]
    land = [flat(r) for f in json.load(open(land_path))["features"] for r in rings(f["geometry"])]
    borders = [flat(r) for f in json.load(open(borders_path))["features"] for r in rings(f["geometry"])]
    places = []
    for f in json.load(open(places_path))["features"]:
        p = f["properties"]
        name_zh = p.get("NAME_ZH") or p.get("name_zh") or ""
        places.append([name_zh, p.get("NAME_EN") or p["NAME"], round(p["LONGITUDE"], 3), round(p["LATITUDE"], 3), p["SCALERANK"], int(p["POP_MAX"] // 1000)])
    places.sort(key=lambda x: (x[4], -x[5]))
    out = {"source": "Natural Earth 1:50m (public domain)", "land": land, "borders": borders, "places": places}
    path = ROOT / "app/assets/map/world.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"land rings={len(land)} border lines={len(borders)} places={len(places)} size={path.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
