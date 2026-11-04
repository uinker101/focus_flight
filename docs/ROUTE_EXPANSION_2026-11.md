# 2026 年 11 月航线扩充记录

## 已编译：asia-202611.1

参考周为 2026-11-09。保留原有 80 条记录，新增 60 条，合计 140 条班表、12 个机场、14 家执飞航司。香港可直飞目的地从 TPE/KHH 扩至 TPE/KHH/FUK/TAK/NRT/HND。全部机场从 HKG 可达，编译没有拒绝、重复或死端机场。旧数据包保留，可在设置中回退。

| 来源 | 新增条数 | 核验范围 |
| --- | ---: | --- |
| [福冈机场国际月表](https://www.fukuoka-airport.jp/assets/flight/schedule/doc/11/202611_timetable_int.pdf) | 46 | PDF 第 1、3、4 页，2026-10-25 至 11-30；香港、台北、高雄、仁川、马尼拉、曼谷、新加坡往返精选 |
| [高松机场国际月表](https://www.takamatsu-airport.com/timetable/int.php) | 8 | 2026 年 11 月页面的香港、台北、仁川往返栏 |
| [ANA 香港—东京冬季计划](https://www.ana.co.jp/ja/hk/plan-book/promotions/latest-flight-hk/) | 6 | 成田每日一对、羽田每日两对；每条有效期按原表记录 |

采集日期为 2026-11-02。福冈 PDF 已渲染并逐行核对；运航日栏空白按该月表的每日班次处理，有星期限制的保留限制。CX529 的 00:15 抵达按原文“翌日”记录为 +1。高松 UO642/643 按周一、三、五、日，CX5642/5643 只作为营销代码共享。高松台北航班按周五与其余六天分别保存。

福冈和 ANA 这两个来源没有列机型，52 条新记录保留未知，不用航司机队或通常机型补填。高松的 8 条记录按原表 A320/A321/A321Neo 记录。只提取事实字段和出处，不把原 PDF、品牌素材或整页网页加入仓库。

新增机场坐标来自 OurAirports 的 [FUK](https://ourairports.com/airports/RJFF/)、[TAK](https://ourairports.com/airports/RJOT/)、[HND](https://ourairports.com/airports/RJTT/) 页面；时区为 Asia/Tokyo。

## 后续全球搜索

2026-11-03 起按洲继续搜索主要机场的官方班表。搜索入口、取得完整班表、已编译可飞是不同状态；不能把找到航点介绍或当天出发板当作完整周班表。

- 华航同一官方季节 PDF 的其余区域仍有大量原料，包含北美、欧洲、澳洲和新西兰；必须核对机场映射、直飞与中停、日期及代码共享后再加入。
- [American Airlines Cargo](https://www.aacargo.com/ship/schedules.html) 提供宽体航班 CSV；加入前区分客机腹舱航班、货运服务与卡车。
- [ANA Cargo](https://www.anacargo.jp/en/news/special_info_1/) 提供客运/货运/取消航班分开的月计划，需按图例筛选。
- [SkyTeam 美洲 PDF 旧入口](https://services.skyteam.com/Timetable/Skyteam_Timetable_NA_SA.pdf) 在 2026-11-03 返回 404，搜索缓存不能当作已取得数据。
- 仙台月表当前文本读取未取得班次；小松搜索结果仍为夏季/7 月页面，不混入 11 月参考周。

## 已编译：global-202611.1

在第一批140条基础上新增ANA客运137条，共277条班表、49个机场，全部从HKG可达，无拒绝行、重复或死端。新加入北美、欧洲、澳洲以及亚洲主要枢纽。

来源为[ANA 2026年11月全球月表](https://www.anacargo.jp/en/news/upload/2026/1016/271b492ec67dbf893bc5fa78de95fd8babe3a284.pdf)，2026-10-16发布，2026-11-03采集。只提取PAX行的11/9–11/15七个日历格，非整月推断；PDF第3页已图像核对，其余标记source_parsed。6条香港航班已有来源不重复加入；NH801/802脚注为AirJapan机组及飞机执行，未核准独立执飞编号前暂缓；NH106有抵达前一当地日的-1跨日，当前数据格式不支持，保留待收录，未更改程序。773、76ER、A320未据机队推断ER/neo；A380按ANA官方座位图明确为A380-800。

## 全球机场搜索清单

`data/review/global_airport_search.csv` 当前列789个主要枢纽、首都机场、区域门户及部分重要旅游机场；这是一份逐项推进的工作清单，不是声称覆盖全部机场的完成报告。六个人口大陆分别记录，夏威夷和太平洋岛屿按地理位置归大洋洲；南极单列特殊运营，不能把探险包机日期编造成普通周班表。pending即未完成搜索；compiled_partial表示已有部分可飞航线，仍需扩充本地与区域连接。

美航11月宽体PDF明确注明时刻取整到半小时，只作航点线索；目前不导入。非洲和南美已找到若干官方动态查询或旧季节表，不能把这些入口等同于已取得精确11月周班表。

## 已编译：global-202611.2 与 global-202611.3

Emirates 新增 25 条，扩至 57 个机场、302 条班表。按 8 份官方目的地时刻表的 0 stops 航段和逐行有效期取 11/9–11/15 交集，包括迪拜、开普敦、德班、拉各斯、突尼斯、亚的斯亚贝巴、普吉、阿德莱德。

[Air Niugini Schedule 143](https://www.airniugini.com.pg/wp-content/uploads/2026/10/SCH-143-SUNDAY-25TH-OCTOBER-2026-SATURDAY-28TH-NOVEMBER-2026-External.pdf) 有效期 2026-10-25 至 11-28，新增 159 条，当前 79 个机场、461 条班表、16 家航司，全部从 HKG 可达，无拒绝、重复或死端。PDF 已用原生 PDFKit 渲染，星期列按排版提取；跨夜行匹配翌日列到达时刻，经停航班拆成逐段。机型按区块原文保留，未将 B737/B767/A220 推断为具体变型。

11/17 才开航的 AKL 不在参考周。周四 PX853 PNP–POM 异常 90 分钟及周日 HKN–POM 17:10 班号与早班同为 PX241 两项暂缓，未臆改。

欧洲补充线索：尼斯冬季计划和 Condor 冬季 PDF 只有航点、星期、频次，缺班号或时刻，暂不编译；Linz 冬季表包含双方时刻，可继续收录。Finnair、airBaltic、Icelandair 有交互式时刻查询，尚未取得目标周完整结果。澳洲政府说明冬季 2026/27 汇总将于 11 月底发布，现有夏季表不混入 11 月。

## 已编译：global-202611.4

[博洛尼亚机场冬季时刻表](https://www.bologna-airport.it/System/pdf/scheduled_flight_winter_2026_2027.pdf) 158页，2026-10-19更新。按PDF表格单元边界提取1,969行，修正提取造成的数字/斜线间空格后没有未解析行；有效期与11/9–11/15取交集，再合并同班号、航段、时刻的运行日。新增666条，共134机场、1,127条班表、43航司。PDF第3页已渲染核对，整体仍标记source_parsed。

7组同航线同时刻不同班号的编译提示均已核对：各班号运行星期交集为空，确实是不同日的航班，保留原始数据；没有改编译器来隐藏提示。没有被拒绝的行、不可达机场或死端。

Neos的NO1446及NO4962在表中包含经停总行程，TUI的RAK往返时长也显示需要另查中停；这两家21条原始行暂缓。其余按机场所列执飞公司录入，来源没有机型，保持未知。Tenerife对应TFS、Chisinau对应RMO已核对机场官方目的地页。

## 已编译：global-202611.5

[巴西民航局 ANAC SIROS 2026-11-02 公开快照](https://siros.anac.gov.br/siros/registros/voos/serie/2026/voos_2026-11-02.zip) 的逐日定期客运登记新增7,084条班表，包含18,412个实际出发日期记录。当前263个机场、8,211条班表、70家执飞航司，六个人口大陆均有连接；全部从HKG可达。源数据是登记计划，不是实际飞行历史。原ZIP不加入仓库。

按[官方字段说明](https://www.anac.gov.br/acesso-a-informacao/dados-abertos/areas-de-atuacao/voos-e-operacoes-aereas/registro-de-servicos-aereos/49-registro-de-servicos-aereos)使用UTC完整起降日期，转换后按出发机场当地11/9–11/15筛选；同班号的不同时刻和机型分别分组。只保留REGULAR DE PASSAGEIROS，货运及非定期服务未导入。运营公司按源ICAO映射IATA；LATAM各国子公司依[IATA成员表](https://www.iata.org/en/about/members/airline-list/?search=LATAM)分别保留，不改成统一营销代码LA；营销代码源文件未提供。

机场坐标来自OurAirports。时区以IANA标识转换，巴西依[国家天文台时区表](https://www.gov.br/observatorio/pt-br/assuntos/areas-de-atuacao/tempo-e-frequencia/brasil)核对各州，并单独处理Fernando de Noronha UTC−2、Tabatinga UTC−5。新机型采用源表明确的ICAO机型代码；泛称A330仍未推断具体型号。

暂缓：ACN/ABJ运营代码未核准；SKX在2026年营销代码合并后需再核运营标识；GVPR旧机场代码需确认；AZU的Z开头登记班号不擅自删除字母；AR1249在11/13两条不同时刻登记冲突；DM6260/6268在11/10 PUJ–EZE同刻登记冲突。后两项只去掉冲突日，其余日期保留。编译器提示的其余87组同航线、同时刻、不同班号均无运行星期交集，已逐组核对。未修改编译器或运行时代码。

## 已编译：global-202611.6

新增133条班表，当前281个机场、8,344条班表、73家执飞航司。

- [Air Mauritius逐日公开计划](https://appsmk.airmauritius.com/flightlist/flights.aspx)：参考周258个Scheduled日期记录合成64条班表；保留当天代码共享差异。源表没有机型，未从机队推断；单次MK7/8未核客运性质而暂缓。涵盖MRU、RRG、RUN、TNR、LGW、GVA、MAA等，优先使用逐日计划中的调整时刻。
- [Airlink 10月19日官方公告](https://www.flyairlink.com/news/airlink-summer-schedule)：JNB与NBO、ZNZ往返4条，明确E195-E2。HLA–HRE官方开航日为11/15，未把整个参考周标为已开航。
- [Proflight 10月23日完整表](https://proflight-zambia.com/wp-content/uploads/2026/10/ProflightZambiaFullTimetable-v23Oct26.pdf)：逐行有效期筛选64条direct航段；PDF第1页图像核对，其余保留source_parsed。不导入经停总行程或连接航班。另1条P065 WDH–LUN的via栏与官方公告不符，依据[航司官方公告](https://za.linkedin.com/company/proflightzambia)及9月21日国际表交叉确认11月起不停站，记录cross_checked及冲突说明。Kalumbila UMB坐标使用OurAirports ZM-0045，ICAO未知留空。

塞舌尔机场官方PDF链接转到登录页，未取得公开PDF；公开Power BI入口仍可继续调查。圣赫勒拿政府表只给日期与航段，缺时刻，暂不导入。

## 已编译：global-202611.7

[IBEX官方冬季表](https://www.ibexair.co.jp/en/timetable/)新增58条日本国内班表，当前290个机场、8,402条班表、74家执飞航司。有效期10/25–3/27，按页面统一日表录入；同航段在出发和到达机场栏目重复出现，已去重。来源没有机型及营销班号，保持未知。新加入CTS、SDJ、FKS、KIJ、NGO、ITM、HIJ、MYJ、OIT。

中部机场月表部分页面实际仍为10/18–10/31，未套用至11月。新千岁与那霸有官方逐日/月度查询，目标周数据尚未完整提取。

## 已编译：global-202611.8

[Drukair 11月官方月表](https://drukair.com.bt/wp-content/uploads/2025/11/SCHEDULE-NOVEMBER-2026.pdf)三页109个星期航段合成50条班表，当前299个机场、8,452条班表、75家执飞航司。三页均图像核对，包括跨页的周三KB540及周五KB211；四处文本提取伪字/漏字已按原图恢复。经停拆为具体腿；未填机型。新增PBH、GAU、DAC、IXB、KTM、CCU、YON、BUT、GAY。

尼泊尔民航局冬季批准表已读Air Arabia及Nepal Airlines两份，除少数尼泊尔国内段外均只有尼泊尔机场一端的时刻，不能直接补齐另一端。斐济ATS 11月月表同样只有南迪一端的时刻，作为日期、机型和经停线索，不凭空补全行程。

## 已编译：global-202611.9

[ANA冬季国内线完整表](https://www.ana.co.jp/guide/plan/airinfo/dom-timetable/pdf/timetable_all_20261025_20270131.pdf)67页，2026-08-25发布，有效10/25–1/31。提取3,118个原始表格行，按运航社ANA和11/9–11/15日期筛选、重复机场栏目去重后新增381条；当前325机场、8,833条班表、75航司。新增26个日本机场，全部从HKG可达，0拒绝、无死端，既有87条提示未增加。

第1页图像核对；运航社色块导致的72个拆分单元格已按同一表格行恢复，最终无未解析表格行。日期条件逐项展开，保留不同日时刻差异。AKX及其他运营者只有NH营销班号，未擅自换成EH/HD等号码，暂缓收录；机型未提供。没有修改程序。

## 已编译：global-202611.10

新增21条班表：日内瓦机场官方公告的MU217/218上海往返4条和UX1663–1666马德里往返4条；[林茨机场冬季表](https://www.linz-airport.com/Flugplan/FlugplanWinter.pdf)的DAT法兰克福往返10条及Ryanair阿利坎特3条。当前327机场、8,854条班表、77航司。

林茨PDF全页图像核对，保留DAT实际班号及LH营销共享，AT72不推断子型；周一返程FR486与周四FR3486不一致，暂缓周一行。XR赫尔格达方向仍需交叉确认；一次性旅游包机未加入。日内瓦UX用全年运营公告交叉核对；两机场新数据保守限定参考周，不延伸未核准日期。

## 已编译：global-202611.11

达美[国内121页](https://www.deltacargo.com/content/dam/cargo/pdfs/Nov2026Deltadomesticschedule.pdf)和[国际18页](https://www.deltacargo.com/content/dam/cargo/pdfs/Nov2026Deltainternationalschedule.pdf)11月官方客机表新增3,270条；当前491个可飞机场、12,124条班表、77航司。新增164个可飞机场，包括LAS、PHX、CLT、MSP、DTW、PHL、SLC、DEN、DCA、BWI、SAN、TPA、BNA、AUS、PDX、加勒比与中美洲多个门户，以及ACC、DSS、RAK、MEL、AKL。0拒绝、无不可达或死端，原有87个无重叠星期提示未增加。

官网网络内容页10/16更新，货车时刻表为独立链接，未导入。3,654个参考周原始行均解析成功；逐行有效日期与星期筛选。两册第一页和国内第12页已图像核对，其余保留source_parsed。源表无抵达日标记，按两地IANA时区唯一正向且不超过20小时的航程推导0/1/2；未按当地钟面大小简单判断。机型A319/A320/A321可明确，其余泛称保持原始代码、不按机队猜子型。

原表确有异常时刻，例如DL1266 ATL–DJT 07:00→19:32；原图确认非解析错误。137条距离/航程异常及另外210条超过同向航线中位航程60分钟的记录暂缓。另50个同班号/航段/运行日时刻冲突及6个同航线同时刻不同班号的运行日暂缓；同一时刻只机型不同则合成组合记录。ANAC已有10组DL航段的53个运行日不重复导入。IDA、TVC只有出站时刻通过检查，入站源时刻异常，其2条出站记录一并暂缓以保持当前可达图；机场参考资料保留待补。详细暂缓清单见data/review/dl_202611_deferred.csv。

西棕榈滩代码DJT依[机场官方改名公告](https://flydjt.org/articles/post/president-donald-j-trump-international-airport-name-change-takes-effect/)核对：IATA代码自8/18由PBI改为DJT；没有按旧库映射回PBI。MEL使用Australia/Melbourne，TQO使用America/Cancun，DSS使用Africa/Dakar。SalamAir官方11月页面已取得，但仅提供航点与星期，不含双方时刻，暂不导入。

## 已编译：global-202611.12

华航同一冬季官方PDF第4–12页新增217条；当前509可飞机场、12,341条班表、84航司。新增BWN、CEB、CGO、CNX、CTU、DAD、DPS、FOC、KTI、NKG、PEN、PRG、PUS、RGN、RMQ、ROR、WUH、XMN。保留PDF括号明确列出的实际承运班号，营销班号只作codeshare；未明确实际承运的CI8000以上记录不加入。已有来源覆盖的相同班号、航段、运行日优先保留，缺的日才补；超出参考周的记录不加入。

第8页已图像核对。CTU依[华航官方首页公告](https://www.china-airlines.com/us/en?arrstn=CNX&deptstn=YVR)确认自2026-08-02由TFU迁回双流，没有依旧印象误改成TFU。0拒绝、全可达、无死端，87条既有提示未增加。

## 已编译：global-202611.13

[春秋航空官方完整时刻表](https://hk.ch.com/flights/flight-date)2,963行中，1,456行覆盖参考周；筛选大陆境内1,241行，按同航段/班号/时刻合并成836条，新增72机场。当前581可飞机场、13,177条班表、85航司。0拒绝、全可达、无死端。

机场代码取HTML每行name属性，不依城市名猜测：上海为SHA，浦东为PVG，天府为TFU，北京大兴为PKX。所有大陆航班使用北京时间Asia/Shanghai。已核同班号/航段/运行日无冲突，也无另列中间腿的总行程重复；机型未提供。国际215行的时区口径不明，暂缓，未照搬为当地时刻。

新增4组编译提示均是不相交星期：LHW–PVG 19:45的9C6464(15)/9C6624(2467)；PVG–LHW 06:30的9C6463(5)/9C6623(2467)；SWA–YTY 12:10的9C7603(2467)/9C8833(135)；SZX–LHW 06:40的9C6165(2467)/9C7679(135)。提示合计91，未更改编译器。

## 已编译：global-202611.14

[Aeroregional官网当前班表](https://www.aeroregional.net/itinerarios)新增10条厄瓜多尔国内航班，UIO往返LOH、ETR、OCC。当前584可飞机场、13,187条班表、86航司。星期根据HTML高亮bg-muted text-foreground提取，隐藏/灰色星期不计；星期序D/L/M/X/J/V/S为日/一/二/三/四/五/六。排除3个1 escala转机总行程，Río Hato旅行社合作航班性质未确认暂缓。页面无统一截止日期，保守限定11/9–15，不推断机型。0拒绝、全可达、无死端。

## 已编译：global-202611.15

广岛机场[国内7页](https://www.hij.airport.jp/assets/files/flight/kokunai/2610/kokunai.pdf)和[国际5页](https://www.hij.airport.jp/assets/files/flight/kokusai/2610/kokusai.pdf)官方冬季表，新增30条：JL羽田/新千岁16，IJ成田2，UO香港2，7C仁川4，RF清州2，VJ河内4。当前585可飞机场、13,217条班表、90航司。新增清州CJJ；实际承运航司与营销共享分开。8个新增数据所在页面逐页图像核对，使用source_checked；已有NH/CI/FW航段不重复。清州11/16之后新增星期不纳入，国内12月以后变化不纳入；统一保守限定参考周。B737/B767泛称不映射具体子型。0拒绝、全可达、无死端，91个既有提示未增加。

航司统计已按编译包coverage.airlines重新核对：.13实际85家（此前记录84家），.14为86家，.15为90家；未因此调整任何航班记录。

## 已编译：global-202611.16

[SpiceJet官方全表](https://corporate.spicejet.com/schedules.aspx)HTML内LabelSchedulesJson共4,041项，包含大量转机总行程。按Wef/Wet/Frequency筛选参考周，只取Via=-且单一SG班号，得到138项；4条Goa因GOI/GOX无法明确暂缓，2条仅11/12运营的SG9033/9034性质未确认暂缓，其余合并为120条。新增17机场：AMD、ATQ、BLR、COK、DBR、DHM、GOP、IXJ、IXL、IXZ、JAI、PAT、PNQ、SHL、SXR、UDR、VNS。当前602可飞机场、13,337条班表、91航司。

运行日无同班号/航段的时间冲突；航程45–290分钟，使用印度Asia/Kolkata半小时时区，并分别处理DXB/HKT当地时区。到达日期按唯一正向合理航程推导。未按机队猜机型，统一限定参考周，不把合并后的星期模式延伸到整季。0拒绝、全可达、无死端，91个既有提示未增加。

非洲续查：Afrijet官网表明确仅适用2024/8/2–9/7；Eswatini Air官网图明确2024年4月发布；Badr旧页面没有有效日期且朱巴时区/经停/航程存在不一致。均未用于2026年11月。Air Madagascar当前页面为日期查询入口，夏季PDF不套用冬季。详情记录在全球机场检索CSV。

## 已编译：global-202611.17

新增南太平洋121条：瑙鲁航空20条实际航段、所罗门航空101条班表（105个星期/航段项合并）。新增24机场，当前626可飞机场、13,458条班表、93航司。

- [瑙鲁航空2026/10/1–2027/4/2官方班表](https://www.nauruair.com/library/files/20260902ns26-27passengerflightschedule-01oct2026-02apr2027updated.pdf)：逐行图像核对出发/到达日；ON041/042多站航班按实际航段拆分；ON123/124明确由Nauru执飞，属于Air Kiribati服务；塔拉瓦UTC+12、基里蒂马蒂UTC+14分别处理，波纳佩UTC+11。无机型不猜。
- [所罗门航空2026/9/16–12/1官方班表](https://www.flysolomons.com/documents/84/SAL_Schedule_16_SEP_-1DEC.pdf)：星期列及红色日期标题经图像核对；PDF隐藏文本有旧2025标题，采用可见2026标题和官网当前下载期间。周二取9/29–11/24时刻，排除11/4与11/18专班。A320按明确标注；DHT仅保留Twin Otter原文，不猜子型号。
- 所有新班表保守限定11/9–15；新机场按OurAirports坐标及IANA时区，逐日确认航程10–360分钟内。编译0拒绝、全可达、无死端。
- Dunedin官网已有11/9–15班表，但只有DUD一端的ETA/ETD，缺另一端时刻，暂不编造完整航段。

## 已编译：global-202611.18

[Air Canada Vacations官方地区班表目录](https://vacations.aircanada.com/en/plan-your-trip/travel-info/where-we-fly)的加拿大西部294页、东部475页、大西洋79页PDF，共32,484行，按From/To Date与MTWRFSU筛参考周得2,651行。保守排除班号>=1500和DH4/CR9/E75/BUS等实际运营方未确认或地面交通记录；剩余按航段/班号/时刻/机型合并为378条，同一天无同班号时刻或机型冲突。原始页码写入每行notes，暂缓记录保存在data/review/ac_canada_202611_deferred.csv。

新增16机场：YEG、YFC、YHZ、YLW、YOW、YQB、YQM、YQR、YQT、YQY、YSJ、YWG、YXE、YXY、YYT、YZF。当前642可飞机场、13,836条班表、93航司；0拒绝，全可达，无死端。YYJ有官网资料，但此批班号保守过滤后尚未入库。

机型按PDF末页图例，新增A220-300（BCS3）、777-200LR（B77L）；32Q原文为A321XLR，按A321neo系列处理并注明。西部PDF第9/35/59/154页已图像抽查，包括星期符号、反向航段和跨夜。三份地区表重复记录去重。

本机IANA数据库已正确反映2026年加拿大时区变化，无需修改程序或机场时区字段：Vancouver=-07、Edmonton/Yellowknife=-06、Winnipeg=-05。核对[BC政府](https://www2.gov.bc.ca/gov/content/governments/celebrating-british-columbia/daylight-saving-time)、[Alberta政府](https://www.alberta.ca/albertas-new-time-system-abt)、[NWT政府](https://www.gov.nt.ca/en/newsroom/northwest-territories-ends-seasonal-time-change)、[Manitoba政府](https://news.gov.mb.ca/news/index.html?item=75937&posted=2026-10-29)。新航段按当地时区计算0/1日到达偏移，航程及距离检查通过。

Canadian North官网标示11/1/26起适用，但当前可读结果只有表头；American Airlines Cargo官网列出11月CSV，但下载返回403，未绕过限制，也未导入未经读取的记录。

## 已编译：global-202611.19

续查Air Canada Vacations目录全部37份国际/美国地区PDF，参考周1,070原始项，实际运营方保守过滤后合并357条。与现有ANAC的8条班表、29个航班日重叠，时刻全部一致，去掉重叠日期后新增350条。新增LYS、TLS、GGT；645机场、14,186班表、93航司。原页码保留notes，未确认运营方的597原始项保存ac_global_202611_deferred.csv。

图像抽查France第2页、Asia第2页、Australia第2页、Bahamas第4页，覆盖反向航段、长途跨日、11/15新开GGT。按IANA时区唯一合理航程推导0/1/2日偏移；无冲突/航程异常；0拒绝，全可达，无死端。

## 已编译：global-202611.20

[老挝航空冬季官方班表](https://laoairlines.com/en/flight-schedule/)两张图片有效2026/10/25–2027/3/27，逐行目视转录60条实际航段（国际37、国内23），新增BOR、LPQ、LXG、PKZ、SAI、VTE、XKH、ZVK八机场。当前653可飞机场、14,246班表、94航司。

经停SGN/CNX/SAI的总行程不重复导入，VTE-PKZ/LPQ-PKZ等航段取国内页。QV923跨夜到ICN按当地时区推导，QV852次日到达按源图+1。ATR72与C909保留原文，不据机队猜型号。BOR使用博胶新机场VLBK，另以[机场官方QV901/902班表](https://www.bokeointernationalairport.com/en/flights/schedules)交叉确认，不能误用法国旧BOR或老挝HOE。

暂缓：义乌回程原图把YIW写成TIW，因此QV875/876待核；NEU的新Nong Khang与旧Sam Neua在坐标源的IATA分配冲突，暂缓四条。0拒绝、全可达、无死端。

## 已编译：global-202611.21

[文莱航空10/28更新的S74/26官方表](https://www.flyroyalbrunei.com/wp-content/uploads/2026/10/28Oct2026-RB-Operating-Flights.pdf)冬季第7–11页新增89条并替换旧共享来源2条，净增87。新增BKI、BPN、JED、KCH、SUB；658机场、14,333班表、94航司。第7/10页图像核对。11/13伦敦和11/10杭州取消按注释排除；1/2/3月特定班次与11/29后吉达加班不纳入。北京按航司公告确认为PKX，东京NRT、伦敦LHR。

旧华航共享表的BI451/452周日时刻分别08:35/13:10，实际承运方当前表改为09:05/13:40；采用更新的实际承运方来源，旧两行存于data/review/bi_2026w_superseded.csv，保留营销班号。相同的周二/周四数据去重。新表未提供机型，未沿用旧表推断。0拒绝、全可达、无死端。

## 已编译：global-202611.22

[台湾虎航官方班表](https://www.tigerairtw.com/print/flight-schedule-table)组件公开的[只读数据](https://api-cms.tigerairtw.com/api/flight-schedules/merge)共330项，参考周166项合并154条，新增CJU、HNA、TNN。当前661机场、14,487班表、95航司。具名daysOfWeek布尔字段与日期清单、多段日期区间逐日求交集，不把图标遗漏视为每日；跨日采用overnight，计算航程全部与durationInMinutes一致，同班号/航段/日期无时刻冲突。无机型不猜。

IT762高雄至石垣周三为08:30–10:10当地时刻，40分钟，另以[石垣机场11月官方时刻表](https://ishigaki-airport.co.jp/fly/timetable/index.html)交叉核对；周日为09:30–11:25。IT/TTW代码以成田机场航司页核对。此次公开端点只返回日本/韩国/越南，不据此声称澳门、泰国已覆盖。0拒绝、全可达、无死端，91条既有提示不变。

## 已编译：global-202611.23

[不丹航空官网班表](https://www.bhutanairlines.bt/assets/bhutan-airlines-images/pdf/SCHEDULE.pdf)三页逐页图像核对，参考周11/9–14用第1页、11/15用第2页，新增12条，661机场、14,499班表、96航司。B3700/701拆成经加尔各答的实际航段；不导入总行程。B3702原图PBH04:10–BKK06:10按时区仅60分钟，与距离不符，连同反向B3703暂缓；不擅自改钟点。印度/尼泊尔半小时和45分钟时区按IANA处理。无机型不猜。0拒绝、全可达、无死端。

## 已编译：global-202611.24

[卡尔斯鲁厄/巴登巴登机场官方冬季表](https://www.baden-airpark.de/en/passengers-visitors/flights/seasonal-timetables/?season=winter-2026)公开flightmap查询双向873行，参考周189项合并188，暂缓28后新增160条。新增ARW、BBU、BNX、FAO、FKB、GRO、PMI、PRN、SBZ、SKG、TGD、ZAG十二机场。当前673机场、14,659班表、97航司。

星期依HTML索引0=周一；逐行有效期过滤。新增GP Aviation IV/GPX以[日内瓦机场官方航司资料](https://www.gva.ch/en/passengers/flights-and-destinations/airlines/Gp-aviation)确认。明确机型照录，737-8200记为MAX8系列。无同班号/航段/日期冲突，航程及距离检查通过。0拒绝、全可达、无死端。

摩洛哥26条双向时刻呈系统性一小时口径差异，未按猜测加减时刻；Flyvini的FV0815/0816为营销品牌，未核实实际运营方，不误作Rossiya。两类原始行保留data/review/fkb_2026w_deferred.csv。

欧洲续查：塔林当前下载仍是截至10/25的夏季PDF；Condor冬季PDF只有频次/星期；BTS完整冬季表下载403；贝加莫冬季日历可由网页读取部分双端时刻，但文件下载403、回程页尚未读取。均不按摘要推断缺失时刻。


## 已编译：global-202611.25

[American Airlines官方11月完整PDF](https://www.aacargo.com/downloads/schedule/ConfirmedFSNov2026.pdf)可由网页工具读取，378页。人工摘取迈阿密与MDE、CLO、GYE、MGA的16条737客运实际航段；AA923只取11/9、AA910只取11/9–10，其余逐条核对有效日期。新增四机场，677机场、14,675班表、97航司。直接下载403、截图读取失败，未绕过，数据标记source_parsed，页码保留notes。0拒绝、全可达、无死端。

[昆卡机场11月公开月表](https://aeropuertocuenca.ec/itinerarios/lib/fetch_itinerarios_data_daily_for_month.v2.php?monthYear=2026-11)参考周104项有双端时刻，但LA/AV营销班号与XL/2K实际运营班号的映射未证实；全部保留cue_202611_deferred.csv，不凭猜测改前缀或修改编译器。

## 已编译：global-202611.26

[约旦皇家航空No475官方11月表](https://www.rj.com/en/plan-and-book/track-flights/rjs-timetable)四页逐页图像核对。238项排除12项后新增226条，新增29机场：ADJ、ALG、ALP、AMM、AQJ、AUH、BAH、BEN、BEY、BGW、BSR、CAI、DAM、DME、DMM、EBL、HAM、ISU、KWI、LCA、MCX、MED、MJI、MRA、NJF、RUH、SHJ、TAS、TBS。当前706机场、14,901班表、98航司，0拒绝、全可达、无死端。

安曼AMM与马尔卡ADJ按各行注释区分；往返各自读取星期，特别是跨夜后返程星期不同。MCX回程标题只写城市名，以同页对应去程机场确认。排除11/4、19、28特定日期6项、YYZ经停总行程2项、ALY机场代号待核2项、CMN时区口径待核2项，保留rj_202611_deferred.csv。SSH表头GMT+3有误，航班原始当地钟点按埃及11月IANA UTC+2计算为85/75分钟，不改原始钟点。290/295/787无本表图例，不猜子型。

参考周每个航班运行日无同班号时刻冲突，航程50–870分钟、距离/航程检查通过。编译重复提示102项；此次增加1项为RJ303与RJ305同钟点但运行星期互斥，已核对保留。更正早期文字中的提示数量：.21/.22/.23实际各100项，.24/.25各101项；以各版完整review文件为准，先前“91条不变”文字不准确，并非0拒绝计数发生变化。


## 收尾：global-202611.stable1（2026-11-04）

用户确认结束广泛扩充，做一轮有界的关键连接补充后冻结版本。[新航官方A350-900航线页面](https://www.singaporeair.com/en_UK/us/flying-withus/our-story/our-fleet/airbus-a350-900/)公开Flight/Time/Dates/Days/Aircraft，参考周逐日求交、合并相同钟点，新增58条班表，仅连接现有机场。香港新增新加坡目的地；新加坡直飞目的地由9增至23。新增28条有向航线（14对机场连接）。未延伸到页面上的其他机场或整个机队。

最终706机场、4,135条有向航线、2,083对机场连接、14,959条班表、98家航司。源码及运行时未变。新表无同班号/航段/运行日冲突，与已有数据无重叠冲突；跨日由IANA时区与合理航程确认。官网页面可经网页工具读取，直接下载404，数据标为source_parsed。港航公开班表查询未取得可用返回，香港其余缺口保留，不延长收尾搜索。

稳定包编译0拒绝、全部从HKG可达、无死端；102条编译提示保持不变。服务器现有数据包校验通过，当前索引与28个旧包回退文件均有效，班表ID唯一、机场/航司/来源引用完整。临时存档实例的浏览器检查显示稳定版标题、706机场/98航司，以及香港出发SQ875/SQ883/SQ895的正确时间和A350机型。未更改用户真实存档。

收尾同步发现远端main已有Claude合并的3D、离线地图及双面登机牌更新（bc4b36d）。保留远端运行时代码，合并本轮数据；仅README发生内容冲突，已按最新功能说明与稳定数据规模合并。离线地图首次下载仍由原启动脚本负责，本次未运行约900MB下载。
