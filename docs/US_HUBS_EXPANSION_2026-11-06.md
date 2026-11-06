# 美国五个重点机场扩充

2026-11-05 采集，2026-11-06 完成验证。已启用 `global-202611.us5`，参考周仍为 2026-11-09 至 11-15。相对 shanghai1 新增 622 条双向班表模板，全部来自航司官方来源。全包共 22,788 条班表、811 个机场、102 家航司。

| 出发机场 | 目的机场数：前 → 后 | 出发模板数：前 → 后 | 航司数：前 → 后 |
| --- | ---: | ---: | ---: |
| IAD 华盛顿杜勒斯 | 79 → 81 | 265 → 283 | 4 → 8 |
| LAX 洛杉矶 | 71 → 76 | 345 → 467 | 8 → 12 |
| SFO 旧金山 | 87 → 89 | 514 → 570 | 7 → 11 |
| JFK 纽约肯尼迪 | 63 → 72 | 134 → 226 | 8 → 13 |
| ATL 亚特兰大 | 185 → 186 | 809 → 850 | 2 → 5 |

模板是一组时刻和机型相同的运行日，不等于独立航线或一天的航班数。目的机场按 IATA 机场分别计数。

新增目的地：

- IAD：多哈、维也纳。
- LAX：夏洛特、多哈、法兰克福、慕尼黑、费城。
- SFO：夏洛特、多哈。
- JFK：安提瓜、百慕大、布鲁塞尔、夏洛特、德里、多哈、慕尼黑、芝加哥奥黑尔、维也纳。
- ATL：多哈；同时增加美国航空、汉莎在已有目的地上的航班选择。

## 来源与取舍

| 来源 | 新增模板 | 处理 |
| --- | ---: | --- |
| [美国航空十一月 Confirmed FS CSV](https://www.aacargo.com/downloads/schedule/ConfirmedFSNov2026.csv) | 553 | 只取涉及五机场的主线客机；原始 558 条参考周记录中 5 条重复运行日保留已有记录 |
| [汉莎集团 CSV](https://www.lufthansa-cargo.com/documents/20184/1559830/LHcargo_FlightSchedule.csv) | 45 | LH 32、OS 7、SN 6；仅 PAXULD 客机航段，排除货机、卡车和 UA 重复来源 |
| [阿拉斯加航空十一月 PDF](https://www.alaskacargo.com/flightschedule/month/2026/11) | 12 | LAX／SFO／JFK 与夏威夷的客运宽体班次，排除 7GF／8GF 货机 |
| [卡塔尔航空官方周班表](https://www.qrcargo.com/s/network-and-services/flight-schedule) | 12 | 五机场与多哈双向，纽约每天两个往返班号；只取 Passenger 航段及绿色运行日 |

美国航空另有 227 条参考周支线来源记录没有明确实际执飞公司，保存到 `data/review/us_hubs_202611_excluded.json`，没有将其全部当作 AA。本批未覆盖 JetBlue、Southwest、Alaska 窄体完整网络或所有外航。

卡塔尔的周表即使不运行也显示星期字母，必须按绿色格提取：ATL 为 1357，LAX 为 2467，SFO 为 1246，IAD／JFK 为 1234567。日期列逐一对应 11 月 9–15 日，所有时间均为当地时间；跨日根据两端时区计算。页面只显示 A350／B777 系列，没有由筛选器猜具体子型号。

汉莎 CSV 中 `74H` 与 `Boeing747-400pax` 名称矛盾，原文一并保留为未映射机型，避免错误解锁具体型号。阿拉斯加 `33L` 也保持来源代码。AS 班号整合依据为 [ARC 的航空公司票务通知](https://www2.arccorp.com/articles-trends/agency-communications/archived-tac/2026-tac-messages/ped-022226/)。

## 实现与验证

- `data/extracted/us_hubs_202611.json`：627 条规范化原始事实，保留 CSV 原始列／PDF 行、页码／浏览器抄录。
- `data/extracted/qr_us_hubs_202611_browser.txt`：卡塔尔的 12 条去重浏览器记录与运行日规则。
- `tools/us_hubs_to_schedules.py`：可重复生成 `data/schedules/us_hubs_202611.csv`；已有航班运行日优先，重复或冲突写入复核文件。
- 架构沿用 CSV → build_pack → JSON → 客户端选班和旅程快照，没有修改 schema、运行时代码或 UI。
- 编译 0 条拒绝；811 个机场从香港可达，无死端。新增一个同一时刻不同班号提示：LAX–JFK AA2118 为 123457，AA28 为 6，运行日不重叠。
- 使用实际 `app/js/schedule.js` 验证五机场各七天选班、航程和旅程快照。新增参考周出发班次：IAD 60、LAX 678、SFO 283、JFK 493、ATL 179。
- 抽查 ATL 的 QR756 仅在列出的星期出现；JFK–DOH QR702 次日抵达，725 分钟；AA LAX–SYD 正确标记抵达日期 +2。
- 重跑转换器输出一致；shanghai1 包保留可回退。刷新应用可加载当前激活包，历史旅程继续使用已有快照。

本批完成五机场这一轮扩充；此前长荣剩余航点及卡塔尔其他地区网络尚未完成。
