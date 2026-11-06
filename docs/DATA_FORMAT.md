# 航班数据格式（schema_version 1）

采集工具（Codex、浏览器 Agent、手工整理）和网站之间只通过这里定义的文件交接。任何来源只要整理成下面的 CSV，就能用 `tools/build_pack.py` 校验并编译成网站读取的数据包。

## 目录

| 路径 | 内容 |
| --- | --- |
| `data/reference/airports.csv` | 机场：`iata,icao,name_zh,name_en,city_zh,city_en,country,lat,lon,tz,coord_source` |
| `data/reference/airlines.csv` | 航司：`iata,icao,name_zh,name_en,country` |
| `data/reference/aircraft_types.csv` | 标准机型：`type`（ICAO 型号代码，如 `A359`）`,name,manufacturer,family` |
| `data/reference/aircraft_codes.csv` | 来源机型代码 → 标准机型，如 `32Q → A21N`、`73H → B738`。别名在这里合并，不会重复解锁 |
| `data/sources.csv` | 来源：`source_id,title,publisher,url,retrieved_at,valid_from,valid_to,usage_note` |
| `data/schedules/*.csv` | 班表模板（下表），可以有多个文件 |
| `data/extracted/` | 从原始资料机械提取的中间结果，保留原文，不直接给网站读 |
| `data/review/<版本>.txt` | 编译时被拒绝的行、重复、死端机场，需要人工处理 |
| `app/packs/<版本>.json` | 编译后的数据包；`app/packs/index.json` 记录已安装版本和当前版本 |

## 班表模板 `data/schedules/*.csv`

一行 = 一个航班在参考周里时刻、机型都相同的一组运行日。同一班号不同星期时刻或机型不同时，拆成多行。

| 列 | 格式 | 说明 |
| --- | --- | --- |
| `schedule_id` | 文本，全局唯一 | 建议 `<source_id>-<执飞航班号>-<起降>-<星期>`，如 `ci-2026w-CI602-HKGTPE-1234567` |
| `operating_airline` | 航司 IATA 两字码 | 实际执飞公司；成就按它统计 |
| `operating_flight_number` | 如 `CI602`、`KE2026` | 执飞航班号，不带空格和前导零 |
| `marketing_codeshares` | `;` 分隔，可空 | 营销代码共享班号，如 `CI9064` |
| `origin` / `destination` | 机场 IATA 三字码 | 必须在 airports.csv |
| `days_of_week` | 升序数字 `1`–`7`，1=星期一 | 如 `1234567`、`135`；只写参考周里有证据运行的日子 |
| `departure_local` / `arrival_local` | `HH:MM` 24 小时制 | 各自机场当地的**计划**时刻；不得填实际起降时间 |
| `arrival_day_offset` | `-1` / `0` / `1` / `2` | 抵达相对出发日跨了几天（按当地日期）；`-1` 表示跨日期变更线后在前一天抵达 |
| `reference_week_start` | `YYYY-MM-DD`，必须是星期一 | 本行依据的参考周 |
| `source_valid_from` / `source_valid_to` | `YYYY-MM-DD` | 来源班表的有效期 |
| `aircraft_raw` | 原文 | 来源里的机型原文，如 `359`、`333/32Q`、`EQV`；没有就留空 |
| `aircraft_type` | 可空 | 只有另有证据确定具体型号时才填（覆盖自动判断），值必须在 aircraft_types.csv |
| `aircraft_evidence_status` | 可空 | 与 `aircraft_type` 一起填，通常为 `exact` |
| `passenger_status` | `passenger` / `cargo` / `unknown` | 只有 `passenger` 会进数据包 |
| `source_ref` | sources.csv 的 `source_id` | |
| `captured_at` | `YYYY-MM-DD` | 采集日期 |
| `verification_status` | 见下 | |
| `notes` | 文本 | 原文班号、页码、例外日期等依据 |

`verification_status`：

- `source_parsed`：由脚本从来源提取，未逐行人工对照
- `source_checked`：已逐行对照来源原页
- `cross_checked`：已用第二个独立来源核对
- `manual`：人工录入（必须在 notes 写依据）

## 机型依据（编译时自动判断）

| 状态 | 条件 | 成就 |
| --- | --- | --- |
| `exact` | 原文只对应一个标准机型（如 `359`，或 `738`/`73H` 这种同型别名） | 解锁具体机型和系列 |
| `family` | 多个候选但同一系列（如 `788/789`） | 只解锁系列 |
| `multiple` | 多个候选且跨系列（如 `333/32Q`） | 不解锁 |
| `varies` | `EQV`，机型不固定 | 不解锁 |
| `unmapped` | 原文代码不在 aircraft_codes.csv（如华航的 `32C`） | 不解锁，补对照表前保持未确定 |
| `missing` | 原文为空 | 不解锁 |

## 编译和校验

```bash
python3 -I tools/build_pack.py --version ci-2026w-demo.1 --title "华航 2026/27 冬季时刻表 · 演示包"
```

检查内容：机场／航司在参考表；时刻、星期、跨日格式；参考周是星期一；用两端时区和完整日期算出航程（正数、不超过 20 小时、参考周每天一致）；同班号运行日重叠；同一时段疑似代码共享重复；从起始机场出发的连通性和死端机场。不合格的行不进数据包，写入 `data/review/`。

## 数据包 JSON

```text
{
  schema_version, dataset_version, title, generated_at, start_airport,
  reference_weeks: ["2026-11-09"],
  coverage: { airports, airlines, aircraft_types, schedules, aircraft_evidence, note },
  sources: [...],
  airports: { HKG: { iata, icao, name, name_en, city, city_en, country, lat, lon, tz } },
  airlines: { CI: { iata, icao, name, name_en } },
  aircraft_types: { A359: { type, name, manufacturer, family } },
  schedules: [{ id, airline, flight, codeshares, origin, destination, days, dep, arr,
                arr_offset, duration_min, aircraft: { raw, type, family, status },
                source, verification, notes }]
}
```

网站把 `days` + `dep`（出发机场时区）投影到当前日历，抵达时刻 = 出发时间戳 + `duration_min`，再换算成目的机场当地时间。这样跨日、夏令时都不会算出负航程。

## 现有数据

- `ci-2026w`：华航 2026/27 冬季时刻表 PDF（2026-10-25 至 2027-03-27）。`tools/extract_ci_timetable.py` 提取全部 1150 行到 `data/extracted/ci_timetable_2026w.csv`；有 4 个航线块列对不齐，没有自动收录。
- `data/schedules/ci_demo.csv`：参考周 2026-11-09，9 个机场（HKG TPE KHH NRT KIX ICN BKK SIN MNL）共 80 条。第 7 页（香港、马尼拉）和第 11 页（高雄）已逐行对照原页，其余为脚本提取。
- 桃园机场开放 CSV（`odp.taoyuan-airport.com`）在 2026-11-02 从本机下载时 TLS 连接被对方断开，尚未取得。
