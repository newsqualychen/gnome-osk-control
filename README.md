# GNOME OSK Control

一个极简的 GNOME Shell 扩展，让屏幕键盘（OSK）在二合一设备/平板模式下真正可用，并与 **IBus + Rime** 中文输入协同工作。

A minimal GNOME Shell extension that makes the on-screen keyboard (OSK) actually usable on 2-in-1 devices / tablet mode, working together with **IBus + Rime** Chinese input.

---

## 它解决了什么问题 / What it fixes

它解决的不是"再写一个输入法"，而是 GNOME 自带屏幕键盘在真实使用中几个很烦人的问题：

- XWayland 应用（Chrome、IBus 输入框等）点输入框时 GNOME 原生 OSK 不弹出
- 候选弹窗一遇到 OSK 弹出就被 GNOME 隐藏，拼音串看不见
- 候选弹窗在横屏时被翻到输入框下方，盖住屏幕键盘
- OSK 顶部候选栏随候选词数量变化而**缩放**，按键位置飘忽
- 中文输入时 OSK 自动切到大写锁定

This is not another input method. It fixes several annoying issues with GNOME's built-in OSK:

- Native OSK doesn't pop up for XWayland apps (Chrome, IBus input fields, etc.)
- Candidate popup disappears as soon as OSK shows, hiding the pinyin preedit
- In landscape, the popup flips below the input field and covers the OSK
- The OSK suggestion bar **resizes** as candidates change, making keys jump around
- OSK auto-switches to uppercase during Chinese input

本扩展**不接管 GNOME 原生 OSK 的显示/隐藏逻辑**，只做最小限度的桥接和补丁，因此稳定、响应快、不冲突。

This extension **does not take over GNOME's native OSK show/hide logic**. It only adds minimal bridges and patches, so it stays stable, responsive, and conflict-free.

## 功能 / Features

- **底座分离自动开 OSK，接上自动关**（检测 `/sys/bus/usb/devices/1-7` 是否存在）
- **X11 / IBus 焦点桥接**：点输入框即弹键盘，点外部延迟收起（250ms 去抖）
- **顶部栏键盘按钮**：随时手动开关 OSK
- **候选弹窗常显**：去掉 GNOME `ibusCandidatePopup.js` 里 `!Main.keyboard.visible` 的显示限制，OSK 弹出时仍显示拼音和候选词
- **候选弹窗固定在输入框上方**：强制 `St.Side.BOTTOM`，并补上 GNOME `boxpointer.js` 缺失的 Y 方向 clamp，横屏也不挡键盘
- **OSK 顶部固定数字行**：`1 2 3 4 5 6 7 8 9 0`，样式与真实键盘按键一致，候选词出现/消失时键盘**不再缩放**
- **点数字选候选**：点击 OSK 数字键等价于物理数字键 `candidate_clicked`
- **禁止自动大写**：中文输入不会莫名锁 Shift

- **Auto OSK on dock detach, off on attach** (detect `/sys/bus/usb/devices/1-7`)
- **X11 / IBus focus bridge**: tap an input field to open, tap outside to close (250ms debounce)
- **Top-bar keyboard button** for manual toggle
- **Candidate popup always visible**: removes GNOME's `!Main.keyboard.visible` check in `ibusCandidatePopup.js`, so pinyin and candidates stay visible with OSK open
- **Popup pinned above the input field**: forces `St.Side.BOTTOM` and adds the Y-axis clamp missing from GNOME's `boxpointer.js`, so it never covers the OSK in landscape
- **Fixed number row on OSK**: `1 2 3 4 5 6 7 8 9 0`, styled like real keyboard keys; the keyboard **never resizes** when candidates appear/disappear
- **Tap numbers to select candidates**: each OSK number calls `candidate_clicked`, just like the physical number keys
- **No auto-capitalization**: Chinese input won't randomly lock Shift

## 适用环境 / Requirements

- GNOME Shell **45–51**（ES module 格式 / ES module format）
- 推荐 Fedora Linux；其他发行版只要 GNOME 版本匹配也可 / Fedora recommended; other distros with matching GNOME should work
- 中文输入栈：**IBus + Rime**（默认英文 `xkb:us::eng`，手动切 Rime）
- 设备：最初为 **HP Elite x2 G4** 编写；其他二合一设备需修改底座检测路径（见下文）
- Chinese stack: **IBus + Rime** (default `xkb:us::eng`, switch to Rime manually)
- Device: written for **HP Elite x2 G4**; other 2-in-1 devices need a different dock path (see below)

> 注意：本扩展**不绑定 fcitx5**。请确保 fcitx5 没有设置开机自启，以免和 IBus 抢输入上下文。
> Note: this extension **does not work with fcitx5**. Make sure fcitx5 autostart is disabled so it doesn't fight IBus for the input context.

## 安装 / Installation

```bash
git clone https://github.com/newsqualychen/gnome-osk-control.git
cd gnome-osk-control

# 目录名必须和 metadata.json 的 uuid 完全一致
# The directory name must match the uuid in metadata.json exactly
mkdir -p ~/.local/share/gnome-shell/extensions/
cp -r osk-control@localhost ~/.local/share/gnome-shell/extensions/

gnome-extensions enable osk-control@localhost
```

**然后注销并重新登录一次。 / Then log out and log back in once.**

> GNOME 51 会缓存 Shell ES module，改代码后 `gnome-extensions disable/enable` 或 `Alt+F2 r` 经常不生效，必须重新登录。这是 GNOME 的限制，不是本扩展的问题。
> GNOME 51 caches Shell ES modules, so `gnome-extensions disable/enable` or `Alt+F2 r` often won't pick up code changes — a full re-login is required. This is a GNOME limitation, not a bug in this extension.

也可以直接从 [Releases](https://github.com/newsqualychen/gnome-osk-control/releases) 下载打包好的 zip，解压后把 `osk-control@localhost` 目录放进 `~/.local/share/gnome-shell/extensions/`。
You can also download a ready-made zip from [Releases](https://github.com/newsqualychen/gnome-osk-control/releases), extract it, and put the `osk-control@localhost` directory into `~/.local/share/gnome-shell/extensions/`.

验证 / Verify:

```bash
gnome-extensions info osk-control@localhost
# 应显示 OSK Simple / version 1 / ACTIVE
# Should show OSK Simple / version 1 / ACTIVE

grep -E 'enable osk-simple|number keys|candidate popup' /tmp/opencode/osk-simple.log | tail -10
```

## 适配其他设备 / Adapting to other devices

扩展通过检测底座对应的 USB 设备是否存在来判断"分离/接上"：

The extension detects dock state by checking whether a sysfs USB node exists:

```js
const BASE_PATH = '/sys/bus/usb/devices/1-7';
```

在你的设备上插上底座前后执行，找到底座接上才出现的节点，改掉 `BASE_PATH` 然后重新登录：

On your device, compare `ls /sys/bus/usb/devices/` before and after attaching the dock, find the node that only appears when docked, change `BASE_PATH` in `extension.js`, then re-login:

```bash
ls /sys/bus/usb/devices/
```

如果没有可检测的底座，把 `_baseDetached()` 改成 `return true;`，让 OSK 始终按平板模式工作。
If your device has no detectable dock, change `_baseDetached()` to `return true;` so OSK always behaves like tablet mode.

## 推荐的 Rime 配置 / Recommended Rime config

为和 OSK 顶部 10 个数字键对应，建议每页 9 个候选（想让 0 键也选第 10 个候选就改成 10）：
Use 9 candidates per page to match the 10 number keys (set to 10 if you want `0` to select the 10th candidate):

`~/.config/ibus/rime/default.custom.yaml`：

```yaml
patch:
  "menu/page_size": 9
  "style/horizontal": false
```

```bash
ibus restart
```

## 日志与排错 / Logging & troubleshooting

日志 / Log: `/tmp/opencode/osk-simple.log`

```bash
tail -f /tmp/opencode/osk-simple.log
```

- **完全没有键盘 / No keyboard at all**：检查目录名、`metadata.json` 的 `uuid`、`gnome-extensions list` 三者是否都是 `osk-control@localhost`。UUID 不匹配会导致扩展无法加载。/ Make sure the directory name, `uuid`, and `gnome-extensions list` all say `osk-control@localhost`.
- **改了代码没生效 / Changes not applied**：GNOME 51 必须注销重新登录。/ Full re-login required on GNOME 51.
- **候选弹窗不显示 / Popup missing**：确认 `ibus engine` 返回 `rime` 或 `xkb:us::eng`，且日志有 `candidate popup visibility patched`。
- **中文自动大写 / Auto uppercase**：确认日志有 `auto-capitalization disabled`。

## 卸载 / Uninstall

```bash
gnome-extensions disable osk-control@localhost
rm -rf ~/.local/share/gnome-shell/extensions/osk-control@localhost/
```

`disable()` 会恢复 GNOME 原生开关为开启，避免卸载后键盘彻底不可用。
`disable()` restores the native OSK setting to enabled so you won't lose the keyboard entirely.

## 致谢 / Acknowledgments

感谢 **OpenCode** 在整个调试过程中提供的帮助——从 X11 焦点桥接、候选弹窗定位到固定数字键方案，很多思路和排查都是在它的协助下完成的。
Thanks to **OpenCode** for helping throughout the debugging process — from the X11 focus bridge and candidate popup positioning to the fixed number-row design, many of the ideas and investigations were done with its assistance.

## License

MIT © 2026 newsqualychen
