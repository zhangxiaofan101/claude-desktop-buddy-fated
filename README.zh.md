# claude-desktop-buddy-fated

[English](README.md) · **简体中文**

> **Fork 自 [anthropics/claude-desktop-buddy](https://github.com/anthropics/claude-desktop-buddy)。**
> 上游的硬件 buddy 固件原样保留；本 fork 额外加入了两件事：把 Anthropic 在
> 2026 年初短暂上线、随后就被废弃的 Claude Code **本命 `/buddy`**（账号决
> 定的那只）找回来；以及当 feature flag 拉不到、硬件 buddy 菜单不显示时
> 用的一个本地 override 小工具。

Claude 的 macOS / Windows 桌面端可以通过 BLE 把 Claude Cowork 和 Claude
Code 连到 maker 设备上，让开发者能做硬件来显示权限请求、最近消息、各
种交互。上游项目以一个 ESP32 桌面宠物固件作为参考实现，自带 18 种
ASCII 宠物可循环切换。

本 fork 多做了一件小事：每个 Claude Code 账号当年都有过一只**本命
buddy** —— 物种、稀有度、眼睛、帽子、属性、名字、人格全部由账号 UUID
决定。暴露这只 buddy 的 `/buddy` 命令大约在 2026-04-10 前后从 Claude
Code 移除，但生成算法被 [`jrykn/save-buddy`][save-buddy] 完整逆向出来
了，所以分配结果**仍然可以离线复算**。`tools/my-buddy/` 把这套算法浓缩
进一个文件，并把物种映射到固件的 `SPECIES_TABLE` 顺序里，让你能直接在
M5 stick 上选中你的本命宠物。

> **只是想自己造硬件？** 那其实你不需要这里面的代码。看
> **[REFERENCE.md](REFERENCE.md)** 就够了：Nordic UART 服务的 UUID、
> JSON 协议、文件夹推送传输全部在那里。

举个例子：上游用 ESP32 做了一只桌面宠物，靠权限批准和与 Claude 的交互
"活着"。没事的时候它睡觉、会话开始时它醒来、有 approval 等着的时候它会
显得不耐烦，并且能直接在设备上批准或拒绝。

<p align="center">
  <img src="docs/device.jpg" alt="M5StickC Plus running the buddy firmware" width="500">
</p>

## 硬件

固件目标平台是 ESP32 + Arduino framework。代码依赖 M5StickCPlus 的库
(显示、IMU、按键)，所以你需要这块板子，或者自己 fork 替换掉这些驱动
适配你的引脚布局。

## 烧录

先安装
[PlatformIO Core](https://docs.platformio.org/en/latest/core/installation/),
然后:

```bash
pio run -t upload
```

如果设备上次刷过别的固件，先擦除:

```bash
pio run -t erase && pio run -t upload
```

跑起来之后，也可以从设备本身擦除：**长按 A → settings → reset →
factory reset → 双击确认**。

## 配对

要把设备和 Claude 配对，先开启开发者模式（**Help → Troubleshooting →
Enable Developer Mode**），然后在 **Developer → Open Hardware Buddy…**
里打开 Hardware Buddy 窗口，点 **Connect**，从列表里选你的设备。
macOS 第一次连接时会弹蓝牙权限请求，授权即可。

<p align="center">
  <img src="docs/menu.png" alt="Developer → Open Hardware Buddy… menu item" width="420">
  <img src="docs/hardware-buddy-window.png" alt="Hardware Buddy window with Connect button and folder drop target" width="420">
</p>

配对成功之后，只要两端都没睡，连接会自动恢复。

> **打开了开发者模式，但 "Open Hardware Buddy…" 这一项就是不出现?**
> 这是 GrowthBook flag 的服务端拉取被网络拦下时的常见问题。解决方案见
> **[`tools/enable-hardware-buddy/`](tools/enable-hardware-buddy/)** 里的
> 本地 override 小脚本。

如果搜不到设备：

- 确认 stick 是醒着的（按一下任何键）
- 检查 stick 的 settings 菜单里 bluetooth 是开的

## 按键操作

|                         | 普通态               | Pet         | Info        | Approval  |
| ----------------------- | -------------------- | ----------- | ----------- | --------- |
| **A**（正面）           | 下一屏               | 下一屏      | 下一屏      | **批准**  |
| **B**（右侧）           | 滚动 transcript      | 翻页        | 翻页        | **拒绝**  |
| **长按 A**              | 进菜单               | 进菜单      | 进菜单      | 进菜单    |
| **Power**（左侧短按）   | 屏幕开/关            |             |             |           |
| **Power**（左侧 ~6s）   | 硬关机               |             |             |           |
| **摇晃**                | 头晕                 |             |             | —         |
| **正面朝下**            | 小睡（精力回复）     |             |             |           |

无操作 30 秒后屏幕自动熄灭（有 approval 等待时不熄）。任意按键唤醒。

## ASCII 宠物

18 种宠物，每种 7 个动画态（sleep / idle / busy / attention /
celebrate / dizzy / heart）。**菜单 → "next pet"** 循环切换，带计数器，
选择保存到 NVS。

## GIF 宠物

如果你不想用 ASCII buddy，想用自定义 GIF 角色：把一个角色包文件夹拖到
Hardware Buddy 窗口的 drop target 上，桌面端会通过 BLE 流给 stick，
stick 实时切到 GIF 模式。**Settings → delete char** 切回 ASCII 模式。

一个角色包是带 `manifest.json` 和 96px 宽 GIF 的文件夹：

```json
{
  "name": "bufo",
  "colors": {
    "body": "#6B8E23",
    "bg": "#000000",
    "text": "#FFFFFF",
    "textDim": "#808080",
    "ink": "#000000"
  },
  "states": {
    "sleep": "sleep.gif",
    "idle": ["idle_0.gif", "idle_1.gif", "idle_2.gif"],
    "busy": "busy.gif",
    "attention": "attention.gif",
    "celebrate": "celebrate.gif",
    "dizzy": "dizzy.gif",
    "heart": "heart.gif"
  }
}
```

每个状态可以是单个文件名或数组。数组会循环：每次播放结束切下一个，
适合做 idle 的活动轮播，避免主屏幕只重复一段。

GIF 宽度 96px；高度 ~140px 以内能在 135×240 竖屏内放得下。把角色裁紧——
透明边距既浪费屏幕空间又会缩小角色。`tools/prep_character.py` 处理
缩放：喂给它任意大小的源 GIF，它会输出一组 96px 宽的、角色比例统一的
GIF。

整个文件夹要小于 1.8MB——`gifsicle --lossy=80 -O3 --colors 64` 一般能
压掉 40–60%。

可以参考 `characters/bufo/` 这个能跑的例子。

如果你正在调一个角色、不想每次走 BLE 推送，可以用
`tools/flash_character.py characters/bufo`，它会把素材准备到 `data/` 然
后直接 `pio run -t uploadfs` 走 USB 烧。

## 七种状态

| 状态        | 触发条件                    | 表现                              |
| ----------- | --------------------------- | --------------------------------- |
| `sleep`     | 桥接未连上                  | 闭眼，缓慢呼吸                    |
| `idle`      | 已连接但没紧急事            | 眨眼，左顾右盼                    |
| `busy`      | 会话进行中                  | 流汗、忙碌                        |
| `attention` | 有 approval 等待            | 警觉，**LED 闪烁**                |
| `celebrate` | 升级（每 50K tokens）       | 撒花、跳动                        |
| `dizzy`     | 你摇了 stick                | 螺旋眼、晃动                      |
| `heart`     | 5 秒内批准的 approval       | 漂浮的心                          |

## 项目结构

```
src/
  main.cpp       — 主循环、状态机、UI 各屏幕
  buddy.cpp      — ASCII 物种分发 + 渲染辅助
  buddies/       — 一个物种一文件，每文件 7 个动画函数
  ble_bridge.cpp — Nordic UART service，行缓冲收发
  character.cpp  — GIF 解码 + 渲染
  data.h         — 协议、JSON 解析
  xfer.h         — 文件夹推送接收
  stats.h        — NVS 持久化的 stats、设置、owner、物种选择
characters/      — 示例 GIF 角色包
tools/
  prep_character.py        — 上游：GIF 缩放 / 标准化
  flash_character.py       — 上游：USB 端角色烧录
  my-buddy/                — fork：找回你的本命 /buddy
  enable-hardware-buddy/   — fork：硬件 buddy 菜单不显示时的本地 override
```

## 本 fork 新增的工具

### [`tools/my-buddy/`](tools/my-buddy/) — 找回你的本命 buddy

**背景。** Claude Code 的 `/buddy` 斜杠命令在 2026 年春季上线，大约一个
月后（2026-04-10 前后）被移除。它存在的那段时间，每个账号都对应一只
**确定性**生成的伙伴：把 `accountUuid + "friend-2026-401"` 喂给 FNV-1a
（在 Bun 下是 `Bun.hash`）做 hash，再用结果种子化 mulberry32 PRNG，
然后按固定顺序从固定列表里抽稀有度 / 物种 / 眼睛 / 帽子 / shiny / 属性。
**同一个账号永远生成同一只 buddy。** 持久化到磁盘的只有 LLM 生成的
`name` 和 `personality`，其它每次渲染都从种子重算。

社区项目 [`jrykn/save-buddy`][save-buddy] 把生成器逆向得很完整，并把
配套的 hooks/MCP/状态栏管线都重写了。本 fork 只移植**生成器本身**到一
个单文件脚本里，并加了一份"save-buddy 物种顺序 → 固件 SPECIES_TABLE
顺序"的映射表，方便直接在 M5 stick 上选中。

**怎么找回你自己的：**

```bash
bun run tools/my-buddy/compute.js
```

它会从 `~/.claude.json` 读 `oauthAccount.accountUuid`，打印物种、稀有
度、眼睛、帽子、shiny、属性，以及对应的固件物种 idx。**必须用
[Bun](https://bun.sh)** 才能拿到 canonical 结果——Node 下会 fall back
到 FNV-1a，结果仍然是确定性的，但**和 Anthropic 当年给你的不是同一只**。

把物种应用到设备上的两种方式：

- **设备上**——长按 A → 菜单 → "next pet" 按打印出来的次数（默认开机
  是 idx 0 的 `capybara`）。选择保存到 NVS。
- **走 BLE**——发 `{"cmd":"species","idx":N}\n` 到 Nordic UART RX
  characteristic。

**我自己的本命** ([my-buddy.json](tools/my-buddy/my-buddy.json))：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Species       : DUCK 🦆          (firmware idx 1)
  Rarity        : common ★
  Eye           : ◉
  Hat           : none
  Shiny         : no
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DEBUGGING     6   █                ← weakness
  PATIENCE     18   ███
  CHAOS        15   ███
  WISDOM       68   █████████████    ← peak
  SNARK        44   ████████
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Name: Pondsage
  "A lakeside contemplative who serves up unreasonably
   profound life advice in a perfectly flat quack — but
   watch their eyes glaze the moment a stack trace shows up."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

一只**贼有智慧但完全不会调试**的瞪眼鸭。原版的 hatching API 也已经下
线了，所以这只是离线由 Claude Opus 4.7 按原 prompt 的约束（≤12 字符
单词名、按 rarity 缩放怪异度的一句话人设）补的"灵魂"。

### [`tools/enable-hardware-buddy/`](tools/enable-hardware-buddy/) — 菜单不显示时的本地 override

Claude 桌面端的 "Open Hardware Buddy…" 菜单项受一个 GrowthBook
feature flag 控制，启动时桌面端会从服务端拉取这个 flag。如果拉取失
败——最常见的情况是网络路径上有 Cloudflare challenge 拦截（部分 VPN /
代理用户会遇到），或者你这个账号还没被 enable——菜单就一直不显示，
即使开了 Developer Mode 也没用。**这是服务端 fetch 问题，不是授权检
查。**

`enable.py` 把 flag 直接写到 Claude 的本地 feature cache
（`~/Library/Application Support/Claude/fcache`），相当于代替 GrowthBook
SDK 给本地写了一个 `{on: true}` 覆盖。完全退出 Claude → 跑脚本 → 重新
打开，菜单就出来了。完整的注意事项见
[`tools/enable-hardware-buddy/README.md`](tools/enable-hardware-buddy/README.md)
——它是非官方 workaround，并不是 Anthropic 认可的路径。

## 路线图 / 在做的事

下面这些是我在断断续续琢磨的，轻量维护、不排期：

- **连上时通过 BLE 自动设置物种。** 现在 stick 默认开机是 capybara，要
  自己手动 cycle 到本命物种。桥接层完全可以读
  `tools/my-buddy/my-buddy.json` 然后在连接成功时直接发物种命令。
- **把 personality 显示在设备上。** 现在 `attention` / `celebrate` 状
  态用的是通用文案；如果换成你 buddy 自己的 `personality`，stick 才真
  的有"是你的"那种感觉。
- **离线 hatching 工具。** 一个小脚本，拿 bones + inspirationSeed，
  按原 prompt 的约束让本地 Claude 生成 `{name, personality}`，给那
  些 hatching API 下线前没来得及 hatch 的账号补一份灵魂（我自己上面
  那只 Pondsage 就是这么补的）。
- **定期跟上游同步。** anthropics 那边有什么值得拉的，就
  `git fetch upstream && git merge upstream/main`。

PR 欢迎，不主动征集；这是个个人尺度的 fork。

## 可用范围

BLE API 只在桌面端开发者模式下可用（**Help → Troubleshooting → Enable
Developer Mode**），面向 maker 和开发者，**不是官方支持的产品功能。**

## Credits

- **[anthropics/claude-desktop-buddy](https://github.com/anthropics/claude-desktop-buddy)**
  ——上游项目。固件、BLE 协议、18 种 ASCII 宠物、GIF 角色系统、
  Hardware Buddy 窗口都是他们做的。本 fork 原样保留他们的工作，只在
  上面多加了上面那两个 tools。
- **[jrykn/save-buddy][save-buddy]**（MIT）——
  `tools/my-buddy/compute.js` 用的确定性 `/buddy` 生成器（PRNG、hash、
  常量、抽取顺序）是 save-buddy 算法的单文件移植。该 repo 里的
  `METHODOLOGY.md` 是原版 `/buddy` feature 唯一权威的取证级参考资料。

[save-buddy]: https://github.com/jrykn/save-buddy
