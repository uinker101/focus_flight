"""Extract route blocks from the China Airlines timetable PDF into a flat CSV.

Usage: python3 -I tools/extract_ci_timetable.py <CI-timetable.pdf> <out.csv> [<review.txt>]

Every row keeps the raw strings from the PDF. Blocks whose columns cannot be
lined up are written to the review file instead of being guessed.
"""
import csv
import re
import sys

import pypdf

DURATION_RE = re.compile(r"\d+h(?:\d+m)?(?:\s*~\s*\d+h(?:\d+m)?)?\s*$")
EN_NAME_RE = re.compile(r"[A-Z][A-Z ,]*[A-Z]")
FLIGHT_RE = re.compile(r"^(?P<mkt_al>CI|AE) ?(?P<mkt_no>\d{2,4})(?: \((?P<op_al>[A-Z0-9]{2}) ?(?P<op_no>\d{1,4})\))?$")
DAYS_RE = re.compile(r"^[1-7 ]*[1-7][1-7 ]*$")
TIMES_RE = re.compile(r"^(?P<dep>\d\d:\d\d)-(?P<arr>\d\d:\d\d)(?:\+(?P<off>\d))?$")
AIRCRAFT_RE = re.compile(r"^[0-9A-Z]{3}(?:/[0-9A-Z]{3})*$")
DATE = r"\d{2}[A-Z][a-z]{2}\d{2}"
PERIOD_RE = re.compile(rf"^(?:-|{DATE}-{DATE}|{DATE}(?: / {DATE})*)$")
SINGLE_ROW_RE = re.compile(
    r"^(?P<flt>(?:CI|AE) ?\d{2,4}(?: \([A-Z0-9]{2} ?\d{1,4}\))?)\s+(?P<days>[1-7][1-7 ]*?)\s+"
    r"(?P<times>\d\d:\d\d-\d\d:\d\d(?:\+\d)?)\s+(?P<ac>[0-9A-Z/]+)\s+(?P<period>.+?)\s*$"
)

FIELDS = [
    "page", "origin_name", "destination_name", "header_raw", "flight_raw",
    "marketing_flight", "operating_airline", "operating_flight_number",
    "days_of_week", "departure_local", "arrival_local", "arrival_day_offset",
    "aircraft_raw", "period_raw",
]


def parse_header(line):
    m = DURATION_RE.search(line)
    if not m:
        return None
    names = EN_NAME_RE.findall(line[: m.start()].replace("-->", " "))
    names = [n.strip() for n in names if len(n.strip()) >= 3]
    if len(names) != 2:
        return None
    return names[0], names[1]


def days_digits(raw):
    return "".join(sorted(set(ch for ch in raw if ch in "1234567")))


def make_row(page, header, header_raw, flt, days, times, ac, period):
    fm = FLIGHT_RE.match(flt)
    tm = TIMES_RE.match(times)
    mkt = f"{fm['mkt_al']}{int(fm['mkt_no'])}"
    if fm["op_al"]:
        op_al, op_no = fm["op_al"], f"{fm['op_al']}{int(fm['op_no'])}"
    else:
        op_al, op_no = fm["mkt_al"], mkt
    return {
        "page": page,
        "origin_name": header[0],
        "destination_name": header[1],
        "header_raw": header_raw,
        "flight_raw": flt,
        "marketing_flight": mkt if fm["op_al"] else "",
        "operating_airline": op_al,
        "operating_flight_number": op_no,
        "days_of_week": days_digits(days),
        "departure_local": tm["dep"],
        "arrival_local": tm["arr"],
        "arrival_day_offset": tm["off"] or "0",
        "aircraft_raw": ac,
        "period_raw": period,
    }


def parse_block(page, header, header_raw, lines):
    """Return (rows, problem) for the lines that follow one route header."""
    rows = []
    i = 0
    # Single-line rows: "CI 705 12  4  67 08:05-11:10 32Q -"
    while i < len(lines):
        m = SINGLE_ROW_RE.match(lines[i].strip())
        if not m or not FLIGHT_RE.match(m["flt"]) or not PERIOD_RE.match(m["period"]):
            break
        rows.append(make_row(page, header, header_raw, m["flt"], m["days"], m["times"], m["ac"], m["period"]))
        i += 1
    if rows:
        return rows, None
    # Column layout: N flight lines, then N days, N times, N aircraft, N periods.
    flights = []
    while i < len(lines) and FLIGHT_RE.match(lines[i].strip()):
        flights.append(lines[i].strip())
        i += 1
    n = len(flights)
    if n == 0:
        return [], "no flight lines"
    cols = []
    for name, regex in (("days", DAYS_RE), ("times", TIMES_RE), ("aircraft", AIRCRAFT_RE), ("period", PERIOD_RE)):
        chunk = [ln.strip() if name != "days" else ln for ln in lines[i : i + n]]
        if len(chunk) < n or not all(regex.match(c.strip() if name != "days" else c.rstrip()) for c in chunk):
            return [], f"column '{name}' does not line up for {n} flights: {chunk}"
        cols.append(chunk)
        i += n
    for k in range(n):
        rows.append(make_row(page, header, header_raw, flights[k], cols[0][k], cols[1][k], cols[2][k], cols[3][k]))
    return rows, None


def main():
    pdf_path, out_path = sys.argv[1], sys.argv[2]
    review_path = sys.argv[3] if len(sys.argv) > 3 else None
    reader = pypdf.PdfReader(pdf_path)
    all_rows, problems = [], []
    for pno, page in enumerate(reader.pages, start=1):
        lines = (page.extract_text() or "").splitlines()
        idx = 0
        while idx < len(lines):
            header = parse_header(lines[idx])
            if not header:
                idx += 1
                continue
            end = idx + 1
            while end < len(lines) and not parse_header(lines[end]):
                end += 1
            rows, problem = parse_block(pno, header, lines[idx].strip(), lines[idx + 1 : end])
            if problem:
                problems.append(f"page {pno}: {lines[idx].strip()}\n  -> {problem}")
            all_rows.extend(rows)
            idx = end
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(all_rows)
    if review_path:
        with open(review_path, "w", encoding="utf-8") as f:
            f.write("\n".join(problems) + "\n")
    print(f"rows={len(all_rows)} blocks_needing_review={len(problems)}")


if __name__ == "__main__":
    main()
