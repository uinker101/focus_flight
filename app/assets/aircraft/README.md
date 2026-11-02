# 飞行界面 3D 飞机模型

“跟随飞机”视角按航班机型的**系列**选用下面的模型（对照表在 `app/js/schedule.js` 的 `AIRCRAFT_MODELS`）。机型未确定（EQV、多个可能机型、代码未核对）或该系列还没有模型时，只显示 2D 图标。

| 文件 | 系列 | 模型实际机型 | 涂装 | FlightGear 原始模型 |
| --- | --- | --- | --- | --- |
| `a320.glb` | A320 系列 | A320 | 白色 | [FGMEMBERS/A320-family](https://github.com/FGMEMBERS/A320-family) |
| `a333.glb` | A330 | A330-300 | 白色 | [FGMEMBERS/A330-300](https://github.com/FGMEMBERS/A330-300) |
| `a359.glb` | A350 | A350-900 | 空客原厂涂装 | [FGMEMBERS/A350XWB](https://github.com/FGMEMBERS/A350XWB) |
| `b738.glb` | 737 | 737-800 | 白色 | [FGMEMBERS/737-800](https://github.com/FGMEMBERS/737-800) |
| `b748.glb` | 747 | 747-8i | 白色 | [FGMEMBERS/747-8i](https://github.com/FGMEMBERS/747-8i) |
| `b773.glb` | 777 | 777-300 | 白色 | [FGMEMBERS/777](https://github.com/FGMEMBERS/777) |
| `b788.glb` | 787 | 787-8 | 波音原厂涂装 | [FGMEMBERS/787-8](https://github.com/FGMEMBERS/787-8) |

## 来源与许可

- 模型取自 Flightradar24 3D 视图使用的模型库 [kalmykov/fr24-3d-models](https://github.com/kalmykov/fr24-3d-models)（commit `dd53267690c6a4ecbb290a3acf0284333a5d68a9`，`models/*.glb`），该库的模型来自 FlightGear 社区的 FGMEMBERS 仓库，按 **GPLv2** 发布，许可证全文见同目录 `LICENSE`。原作者署名见上表各 FGMEMBERS 仓库；`.blend` 源文件在 fr24-3d-models 的 `source/` 目录。
- 这里的文件是上述模型的转换版本，同样按 GPLv2 提供。网站其余代码和数据不受影响。
- A350、787 模型带有空客、波音的原厂涂装和标志，商标归各自所有者；个人离线使用没有问题，公开发布前再考虑是否改成白色。

## 转换方法

原文件是 glTF 1.0，当前 Three.js 读不了，转成 glTF 2.0 后再压缩（尺寸已和真实翼展、机长核对，误差在 1–2% 内）：

1. `gltf-pipeline@4.1.0` 的 `processGlb` 把 glTF 1.0 升级为 2.0（需要把它依赖的 `cesium` 固定在 1.115.0，新版缺少 `defaultValue`）。
2. 压缩网格和贴图：

```bash
npx @gltf-transform/cli@4.1.1 optimize in.glb out.glb --compress quantize --texture-compress webp --texture-size 1024 --simplify false
```

所有模型 Y 轴朝上、机头朝 −Z，网站加载时按包围盒居中并统一成同一显示大小，不需要逐个调整。以后加子型号（A321、A330-200、747-400、777-200、787-9 等，fr24-3d-models 里都有）按同样步骤转换，再在对照表里加一行。
