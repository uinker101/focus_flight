# 飞行界面 3D 飞机模型

“跟随飞机”视角按航班的**具体型号**选用下面的模型（对照表在 `app/js/schedule.js` 的 `MODEL_TYPES`）。没有专属模型的子型号（neo、MAX、777-300ER、787-10、E175、ATR 72 等）用最接近的机身，界面文字和收藏仍按真实型号。来源只确定到系列时用该系列的常见模型（`FAMILY_MODELS`）。机型未确定（EQV、多个可能机型、代码未核对）或型号没有对应模型时，只显示 2D 图标。

| 文件 | 模型实际机型 | 用于（ICAO 型号代码） | 涂装 | FlightGear 原始模型 |
| --- | --- | --- | --- | --- |
| `a318.glb` | A318 | A318 | 白色 | [FGMEMBERS/A320-family](https://github.com/FGMEMBERS/A320-family) |
| `a319.glb` | A319 | A319、A19N | 白色 | [FGMEMBERS/A320-family](https://github.com/FGMEMBERS/A320-family) |
| `a320.glb` | A320 | A320、A20N | 白色 | [FGMEMBERS/A320-family](https://github.com/FGMEMBERS/A320-family) |
| `a321.glb` | A321 | A321、A21N | 空客原厂涂装 | [FGMEMBERS/A320-family](https://github.com/FGMEMBERS/A320-family) |
| `cs100.glb` | A220-100（CS100） | BCS1 | 灰色 | [FGMEMBERS/CSeries](https://github.com/FGMEMBERS/CSeries) |
| `cs300.glb` | A220-300（CS300） | BCS3 | 灰色 | [FGMEMBERS/CSeries](https://github.com/FGMEMBERS/CSeries) |
| `a332.glb` | A330-200 | A332、A338 | 白色 | [FGMEMBERS/A330-200](https://github.com/FGMEMBERS/A330-200) |
| `a333.glb` | A330-300 | A333、A339 | 白色 | [FGMEMBERS/A330-300](https://github.com/FGMEMBERS/A330-300) |
| `a343.glb` | A340-300 | A342、A343 | 空客原厂涂装 | [FGMEMBERS/A340-313X](https://github.com/FGMEMBERS/A340-313X) |
| `a346.glb` | A340-600 | A345、A346 | 空客原厂涂装 | [FGMEMBERS/A340-600HGW](https://github.com/FGMEMBERS/A340-600HGW) |
| `a359.glb` | A350-900 | A359、A35K | 空客原厂涂装 | [FGMEMBERS/A350XWB](https://github.com/FGMEMBERS/A350XWB) |
| `a380.glb` | A380-800 | A388 | 空客原厂涂装 | [FGMEMBERS/A380-omega](https://github.com/FGMEMBERS/A380-omega) |
| `b736.glb` | 737-600 | B736 | 白色 | [FGMEMBERS/737NG](https://github.com/FGMEMBERS/737NG) |
| `b737.glb` | 737-700 | B737、B37M | 白色 | [FGMEMBERS/737NG](https://github.com/FGMEMBERS/737NG) |
| `b738.glb` | 737-800 | B738、B38M | 白色 | [FGMEMBERS/737-800](https://github.com/FGMEMBERS/737-800) |
| `b739.glb` | 737-900 | B739、B39M、B3XM | 白色 | [FGMEMBERS/737NG](https://github.com/FGMEMBERS/737NG) |
| `b744.glb` | 747-400 | B744 | 波音原厂涂装 | [FGMEMBERS/747-400](https://github.com/FGMEMBERS/747-400) |
| `b748.glb` | 747-8i | B748 | 白色 | [FGMEMBERS/747-8i](https://github.com/FGMEMBERS/747-8i) |
| `b752.glb` | 757-200 | B752 | 波音原厂涂装 | [FGMEMBERS/757-200](https://github.com/FGMEMBERS/757-200) |
| `b753.glb` | 757-300 | B753 | 白色 | [FGMEMBERS/757-200](https://github.com/FGMEMBERS/757-200) |
| `b762.glb` | 767-200 | B762 | 白色 | [FGMEMBERS/767](https://github.com/FGMEMBERS/767) |
| `b763.glb` | 767-300 | B763 | 白色 | [FGMEMBERS/767-300](https://github.com/FGMEMBERS/767-300) |
| `b764.glb` | 767-400 | B764 | 白色 | [FGMEMBERS/767](https://github.com/FGMEMBERS/767) |
| `b772.glb` | 777-200 | B772、B77L | 波音原厂涂装 | [FGMEMBERS/777](https://github.com/FGMEMBERS/777) |
| `b773.glb` | 777-300 | B773、B77W | 白色 | [FGMEMBERS/777](https://github.com/FGMEMBERS/777) |
| `b788.glb` | 787-8 | B788 | 波音原厂涂装 | [FGMEMBERS/787-8](https://github.com/FGMEMBERS/787-8) |
| `b789.glb` | 787-9 | B789、B78X | 波音原厂涂装 | [FGMEMBERS/787-9](https://github.com/FGMEMBERS/787-9) |
| `atr42.glb` | ATR 42-500 | AT43、AT45、AT46、AT72、AT75、AT76 | 白色 | [FGMEMBERS/ATR-42-500](https://github.com/FGMEMBERS/ATR-42-500) |
| `q400.glb` | Dash 8 Q400 | DH8D | 庞巴迪原厂涂装 | [FGMEMBERS/Q400](https://github.com/FGMEMBERS/Q400) |
| `bae146.glb` | BAe 146 / Avro RJ | B461、B462、B463、RJ85、RJ1H | 白色 | [FGMEMBERS/Jumbolino](https://github.com/FGMEMBERS/Jumbolino) |
| `crj700.glb` | CRJ700 | CRJ7 | 白色 | [FGMEMBERS/CRJ700-family](https://github.com/FGMEMBERS/CRJ700-family) |
| `crj900.glb` | CRJ900 | CRJ9、CRJX | 白色 | [FGMEMBERS/CRJ700-family](https://github.com/FGMEMBERS/CRJ700-family) |
| `e170.glb` | E170 | E170、E75S、E75L | 白色 | [FGMEMBERS/E-jet-family](https://github.com/FGMEMBERS/E-jet-family) |
| `e190.glb` | E190 | E190、E195、E290、E295 | 白色 | [FGMEMBERS/E-jet-family](https://github.com/FGMEMBERS/E-jet-family) |

模型库里的非客机（An-225、Beluga、Citation、PA-28、ASK 21、直升机等）不会出现在客运班表里，没有收录。

## 来源与许可

- 模型取自 Flightradar24 3D 视图使用的模型库 [kalmykov/fr24-3d-models](https://github.com/kalmykov/fr24-3d-models)（commit `dd53267690c6a4ecbb290a3acf0284333a5d68a9`，`models/*.glb`），该库的模型来自 FlightGear 社区的 FGMEMBERS 仓库，按 **GPLv2** 发布，许可证全文见同目录 `LICENSE`。原作者署名见上表各 FGMEMBERS 仓库；`.blend` 源文件在 fr24-3d-models 的 `source/` 目录。
- 这里的文件是上述模型的转换版本，同样按 GPLv2 提供。网站其余代码和数据不受影响。
- 标“原厂涂装”的模型带有空客、波音、庞巴迪的涂装和标志，商标归各自所有者；个人离线使用没有问题，公开发布前再考虑是否改成白色。

## 转换方法

原文件是 glTF 1.0，当前 Three.js 读不了，转成 glTF 2.0 后再压缩：

1. `gltf-pipeline@4.1.0` 的 `processGlb` 把 glTF 1.0 升级为 2.0（需要把它依赖的 `cesium` 固定在 1.115.0，新版缺少 `defaultValue`）。
2. 737-600、737-700、737-900 和 A340-300 原文件里有游离的小面片或退化成一个点的网格（737NG 右翼尖下方 5 米处的一块小面片，737-600 机头前 3.5 米、A340-300 机头前 3 米的点），会把包围盒撑大，让飞机显示偏小、离地偏高。转换时用 `@gltf-transform/core` 删掉这些 primitive（判断方法：不到 0.05 米或不超过 8 个顶点、并且超出其余机身包围盒 0.5 米以上）。其他模型没有这种情况。
3. 压缩网格和贴图：

```bash
npx @gltf-transform/cli@4.1.1 optimize in.glb out.glb --compress quantize --texture-compress webp --texture-size 1024 --simplify false
```

所有模型 Y 轴朝上、机头朝 −Z，网站加载时按包围盒居中并统一成同一显示大小，不需要逐个调整。转换后逐个渲染俯视、侧视检查过方向和贴图，长度、翼展和真实数据的误差大多在 1–3% 内。例外是原模型本身的比例：ATR 42 的翼展约 27.7 米（接近 ATR 72，真机 24.6 米），787-9 的水平尾翼伸出尾锥约 3 米，767-200 的垂直尾翼伸出尾锥约 2 米，737NG 仓库的 737-600／700／900 机长差 4–6%。以后加模型按同样步骤转换，再在对照表里加一行。
