# 上海网络扩充（2026-11-05）

已启用 `global-202611.shanghai1`，沿用参考周 2026-11-09 至 11-15。相对 priority1 新增 1,118 条双向班表模板，重点是东航、上航、吉祥的上海国内直飞网络。

| 指标 | 扩充前 | 扩充后 |
| --- | ---: | ---: |
| 虹桥出发目的机场 | 20 | 53 |
| 虹桥出发班表模板 | 70 | 323 |
| 浦东出发目的机场 | 39 | 131 |
| 浦东出发班表模板 | 100 | 407 |
| 全包班表模板 | 21,048 | 22,166 |
| 全包机场 | 754 | 811 |
| 全包航司 | 98 | 101 |

虹桥补充北京首都、大兴、武汉、青岛、郑州、长沙、福州、昆明、海口、珠海等方向。浦东补充大量国内干线及支线，包含北京、广州、深圳、成都、西安、厦门、武汉、昆明、敦煌、张家界、西宁等。目的地数按机场计算；北京两场、成都两场分别计数。

## 来源与限制

- [浙旅通虹桥冬春表](https://jc.lishui.store/airports/SHA/timetable)、[浦东冬春表](https://jc.lishui.store/airports/PVG/timetable)：第三方整理，**不是航司或机场官方表**。页面标记“2026 冬春”，列出航班号、起降机场、双端计划时间、星期和经停数量。仅提取 MU/FM/HO 国内直飞，标记 `source_parsed`，没有机型时留空。季节班期映射到参考周，没有逐日核查临时取消，也不把它声明为完整官方网络。
- [珠海机场公开时刻表](https://www.zhairport.com/hangban/information.html)：逐行核对上海两场的 30 个客运航段，标记 `source_checked`。页面没有写明航季起止日期，只作为采集时的参考周快照。它提供的机型按原文保留；`919` 未映射为具体机型成就。
- 现有班表优先，珠海官方表优先于第三方表。例如 FM9361 周一、三、五、日的出发时间两表相差 5 分钟，采用珠海官方 16:40；被覆盖条目保存在复核 CSV。
- 排除 96 条包含经停但缺少中间航段时间的记录；另有 15 条记录与现有或更高优先级来源重叠。所有排除原因均保留，不编造中途时间。
- 57 个新机场的坐标来自此前下载的 OurAirports / datasets/airport-codes，均为中国内地机场，使用 Asia/Shanghai。新增吉祥、山东、金鹏航司参考信息；代码依据包括[成田机场](https://www.narita-airport.jp/en/flight/airline-search/dkh/)、[IATA 山东航空查询](https://www.iata.org/en/publications/directories/code-search/?airline.search=SC)、[IATA 金鹏航空](https://www.iata.org/en/about/members/airline-list/suparna-airlines/524/)。

## 文件与架构

- `data/extracted/shanghai_202611.json` 保存 1,229 条原始提取事实和来源行号（含排除项）。
- `tools/shanghai_to_schedules.py` 转换为 `data/schedules/shanghai_202611.csv`，排除记录写入 `data/review/shanghai_202611_held.csv`。
- 使用现有 CSV → build_pack → JSON → 客户端周班表投影流程，无 schema 或运行时代码变更。来源沿用现有 source/verification 字段。
- priority1 保留可回退。刷新应用后加载新激活包；历史旅程继续使用已有快照。

## 验证

- 编译：22,166 条，0 条拒绝；全部 811 个机场从香港可达，无死端。
- 无新增重复告警；新增班次不存在同一航司、航段、出发时间、星期的重叠。
- 使用实际 `app/js/schedule.js` 检查参考周七天：虹桥可投影 1,919 个出发班次，浦东 2,008 个；全部航程为正，旅程快照包含航司、目的机场时区和来源。
- 抽查 MU5099 虹桥—北京首都：07:00–09:20，140 分钟。

本批重点完成上海国内网络；上海国际线、此前卡塔尔及长荣剩余扩充继续列为待办，未把这些项目算作完成。
