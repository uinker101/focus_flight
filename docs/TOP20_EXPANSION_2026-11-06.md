# 前20机场网络扩充 — 2026-11-06

已启用 `global-202611.top20`。相对 `global-202611.us5` 新增 **12,993 条班表模板**；全包 **35,781 条模板、1,013 个机场、132 家航司**。参考周为 2026-11-09 至 11-15，应用沿用原有周班表向实际日历投影的机制。

前20范围采用 [ACI 2025年最终总旅客吞吐量排名（2026-07-15发布）](https://aci.aero/2026/07/15/worlds-busiest-airports-atlanta-holds-asia-climbs-strong-demand-while-asia-pacific-growth-reshape-the-rankings/)，并非国际旅客排名，也不是2026年预测榜。

## 验收口径与结果

本项目把“较强覆盖”落实为三个可重复检查的条件：每机场至少75个出发目的机场、至少8个出发航司IATA代码，并达到各主要基地航司的目的地数量目标。后者逐项写在 `tools/check_top20_coverage.mjs` 的 `anchors` 中，例如 DFW/AA≥80、LHR/BA≥75、IST/TK≥90、KUL/MH≥60和AK≥45。所有20机场均通过；这些是本项目的可用网络门槛，不表示覆盖了真实机场全部航班的某个百分比。

目的地按不同机场IATA计数；航司按实际收录的出发班表计数，不把营销代码共享名单当作额外航司。一条模板是一组时刻和机型相同的运行日，不等于一天一班或一条独立航线。

| 排名 | 机场 | 目的机场：扩充前 → 后 | 航司：扩充前 → 后 |
| --- | --- | ---: | ---: |
| 1 | ATL 亚特兰大 | 186 → 187 | 5 → 9 |
| 2 | DXB 迪拜 | 19 → 143 | 4 → 10 |
| 3 | HND 东京羽田 | 75 → 82 | 9 → 18 |
| 4 | DFW 达拉斯沃思堡 | 19 → 104 | 6 → 14 |
| 5 | PVG 上海浦东 | 131 → 143 | 14 → 43 |
| 6 | ORD 芝加哥奥黑尔 | 118 → 124 | 8 → 15 |
| 7 | LHR 伦敦希思罗 | 27 → 106 | 11 → 23 |
| 8 | IST 伊斯坦布尔 | 5 → 105 | 3 → 10 |
| 9 | CAN 广州白云 | 9 → 114 | 10 → 33 |
| 10 | DEN 丹佛 | 134 → 136 | 3 → 8 |
| 11 | DEL 德里 | 25 → 82 | 9 → 21 |
| 12 | ICN 首尔仁川 | 17 → 76 | 12 → 21 |
| 13 | LAX 洛杉矶 | 76 → 85 | 12 → 24 |
| 14 | CDG 巴黎戴高乐 | 30 → 138 | 12 → 18 |
| 15 | PEK 北京首都 | 11 → 127 | 9 → 23 |
| 16 | SIN 新加坡 | 24 → 78 | 10 → 21 |
| 17 | AMS 阿姆斯特丹 | 21 → 144 | 9 → 17 |
| 18 | MAD 马德里 | 16 → 81 | 12 → 18 |
| 19 | SZX 深圳宝安 | 16 → 94 | 7 → 30 |
| 20 | KUL 吉隆坡 | 7 → 86 | 8 → 17 |

## 五组实施结果

1. AA：DFW达100个AA目的地，ORD达53个AA目的地；既有UA、DL网络继续保留。
2. 中国内地：CAN/CZ达101、PEK/CA达103、SZX/ZH与CZ各54；同步补充其他国内客运航司。
3. 欧洲：LHR/BA达92、CDG/AF达132、AMS/KL达107、MAD/IB达51；AMS另有HV、MAD另有UX的区域网络。
4. 土耳其及海湾：IST/TK达102；DXB/EK达118，另补FZ区域航线。
5. 亚洲：HND/JL达33；ICN/KE达56、OZ达20；SIN/SQ达60、TR达22；KUL/MH达66、AK达50；DEL/6E达53、AI达17。丹佛另外补入F9和WN，避免只有大型传统航司可选。

以下数字为各航司在该机场的不同出发目的地数：

| 机场 | 覆盖最多的三家航司 |
| --- | --- |
| ATL | DL 185、AA 7、UA 6 |
| DXB | EK 118、FZ 32、SG 6 |
| HND | NH 68、JL 33、DL 6 |
| DFW | AA 100、DL 9、UA 6 |
| PVG | MU 81、HO 45、FM 36 |
| ORD | UA 114、AA 53、DL 8 |
| LHR | BA 92、AA 9、DL 7 |
| IST | TK 102、RJ 2、6E 2 |
| CAN | CZ 101、MU 26、ZH 26 |
| DEN | UA 132、F9 24、WN 14 |
| DEL | 6E 53、SG 17、AI 17 |
| ICN | KE 56、OZ 20、7C 14 |
| LAX | UA 46、DL 45、AA 28 |
| CDG | AF 132、DL 9、AA 4 |
| PEK | CA 103、HU 35、SC 10 |
| SIN | SQ 60、TR 22、6E 4 |
| AMS | KL 107、HV 36、DL 9 |
| MAD | IB 51、UX 34、AA 6 |
| SZX | CZ 54、ZH 54、HU 18 |
| KUL | MH 66、AK 50、NH 2 |

## 新增来源

| 来源 | 入包模板 | 使用方式 |
| --- | ---: | --- |
| [AA官方十一月CSV](https://www.aacargo.com/downloads/schedule/ConfirmedFSNov2026.csv) | 1,635 | 参考周有效的主线客机；实际执飞公司不明确的支线另存审查 |
| [AF/KL/TO/HV官方SSIM开放数据](https://transport.data.gouv.fr/datasets/programme-des-vols-air-france) | 3,619 | 2026-11-03发布；读取UTC时刻、时差、有效期、运行日和实际运营标记，转换为当地日期；补齐涉及枢纽的多段航班续程 |
| [浙旅通CAN冬春班表](https://jc.lishui.store/airports/CAN/timetable)及同站PEK、SZX、PVG页 | 4,758 | 第三方季节性快照；仅已识别客运航司的中国内地直飞；不推测机型 |
| [AeroLOPA航司与机型航线表](https://www.aerolopa.com/ba) | 1,881 | 第三方OAG时刻快照；仅日期/星期/班次数一致、单一起飞时刻的规则记录；原始航线页URL逐条保留 |
| [Flight.info逐航班有效期班表](https://www.flight.info/MH) | 1,100 | 按具体有效期与参考周求交集，包含单日运行；两端时区与公布时长交叉检查；逐班URL存于事实和模板notes |

官方SSIM下载：[2026-11-03 AF/KL/TO/HV文件](https://static.data.gouv.fr/resources/programme-des-vols-air-france/20261103-142508/af-kl-to-hv-w26-s27.ssim)。

第三方快照不等于航司实时确认。内地来源是季节班表；AeroLOPA的到达时刻是公布的汇总时刻，多起飞时刻、日期不规则、幽灵班次已排除；Flight.info仅采用能解析有效期的记录。这些数据适用于本项目的离线模拟旅行，不是实时航班运行状态。

Iberia部分区域/Express记录无法确定实际运营代码，留在审查文件；UX及使用同一IATA代码的Air Europa Express按UX品牌计数，现有架构不区分它们的AOC。机型不明确或未映射时保持未知，不为了收藏强行指定机型。

## 连通性与验证

- 最终编译：**35,781条入包，0条拒绝**。
- 前20机场连续七天共 **47,928个出发实例**，使用实际 `app/js/schedule.js` 的选班和旅程快照函数检查，逐日数量与模板一致，航程为正，快照机场与数据包版本一致。
- 全网1,013个机场均从HKG可达，且均有路径返回HKG；没有只能到达却无法继续出发的机场。
- 补齐AF/KL非洲多段航班，以及TK571的BJL–NKC、TK553的CKY–OUA续程。没有把含中途停站的整段旅程当作不停站航段。
- 新增模板无重复航班/机场对/星期；所有引用机场、航司、来源存在。
- Flight.info的公布时长与参考周当地时区不一致的记录留待审查，例如UX51的哈瓦那时差冲突，未覆盖既有来源。
- 重跑转换器检查输出一致；既有其他CSV的航班运行日优先，1,810条重复/重叠来源记录未重复导入。

## 文件与复现

- `data/extracted/top20*_202611.json`：可重放的规范化来源事实，包含原始行或逐航班证据。
- `data/schedules/top20_202611.csv`：本轮12,993条新增模板。
- `data/reference/airports.csv`、`airlines.csv`、`data/sources.csv`：配套元数据和来源。
- `tools/extract_top20_afkl.py`、`extract_top20_aerolopa.py`、`extract_top20_flightinfo.py`：分别解析下载的SSIM、公开HTML和逐航班文本快照。
- `tools/top20_to_schedules.py`：合并来源事实、保留已有航班运行日并去重。
- `data/review/top20_coverage_202611.json`：机器可读覆盖表及验证结果。
- `data/review/top20*_held.*`、`top20*_excluded.*`：未导入记录与原因。

从仓库已保存的规范化事实复现，不需要重新联网：

```sh
python3 tools/top20_to_schedules.py
python3 -I tools/build_pack.py --version global-202611.top20 --title '全球航线 · 前20机场网络扩充'
node tools/check_top20_coverage.mjs
```

保持现有 CSV → build_pack → JSON → 客户端选班/旅程快照架构，schema仍为1。本轮没有引入线上航班API、数据库或新的UI状态；刷新应用会读取当前激活包，旧旅程仍使用已有快照。

这轮完成了前20机场的较强目的地及航司覆盖。仍未收齐所有机场的全部现实航线、所有支线运营商或所有班次频率；完整性不应解读为实时或全量覆盖。
