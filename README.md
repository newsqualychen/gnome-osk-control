# GNOME OSK Control

一个极简的 GNOME Shell 扩展，让屏幕键盘（OSK）在二合一设备/平板模式下真正可用，并与 **IBus + Rime** 中文输入协同工作。

它解决的不是"再写一个输入法"，而是 GNOME 自带屏幕键盘在真实使用中几个很烦人的问题：

- XWayland 应用（Chrome、IBus 输入框等）点输入框时 GNOME 原生 OSK 不弹出
- 候选弹窗一遇到 OSK 弹出就被 GNOME 隐藏，拼音串看不见
- 候选弹窗在横屏时被翻到输入框下方，盖住屏幕键盘
- OSK 顶部候选栏随候选词数量变化而**缩放**，按键位置飘忽
- 中文输入时 OSK 自动切到大写锁定

本扩展**不接管 GNOME 原生 OSK 的显示/隐藏逻辑**，只做最小限度的桥接和补丁，因此稳定、响应快、不冲突。

## 功能

- **底座分离自动开 OSK，接上自动关**（通过检测 `/sys/bus/usb/devices/1-7` 是否存在）
- **X11 / IBus 焦点桥接**：点输入框即弹键盘，点外部延迟收起（250ms 去抖）
- **顶部栏键盘按钮**：随时手动开关 OSK
- **候选弹窗常显**：去掉 GNOME `ibusCandidatePopup.js` 里 `!Main.keyboard.visible` 的显示限制，OSK 弹出时仍显示拼音和候选词
- **候选弹窗固定在输入框上方**：强制 `St.Side.BOTTOM`，并补上 GNOME `boxpointer.js` 缺失的 Y 方向 clamp，横屏也不挡键盘
- **OSK 顶部固定数字行**：`1 2 3 4 5 6 7 8 9 0`，样式与真实键盘按键一致，候选词出现/消失时键盘**不再缩放**
- **点数字选候选**：点击 OSK 数字键等价于按物理数字键调用 `candidate_clicked`
- **禁止自动大写**：中文输入不会莫名锁 Shift

## 适用环境

- GNOME Shell **45–51**（扩展使用现代 ES module 格式）
- 推荐 Fedora Linux，其他发行版只要 GNOME 版本匹配也可
- 中文输入栈：**IBus + Rime**（默认英文 `xkb:us::eng`，手动切 Rime）
- 设备：最初为 **HP Elite x2 G4** 编写；其他二合一设备需修改底座检测路径（见下文）

> 注意：本扩展**不绑定 fcitx5**。请确保 fcitx5 没有设置开机自启，以免和 IBus 抢输入上下文。

## 安装

```bash
git clone https://github.com/newsqualychen/gnome-osk-control.git
cd gnome-osk-control

# 安装到 GNOME 扩展目录，目录名必须和 metadata.json 的 uuid 完全一致
mkdir -p ~/.local/share/gnome-shell/extensions/
cp -r osk-control@localhost ~/.local/share/gnome-shell/extensions/

gnome-extensions enable osk-control@localhost
```

**然后注销并重新登录一次。**

> GNOME 51 会缓存 Shell ES module，扩展代码改动后 `gnome-extensions disable/enable` 或 `Alt+F2 r` 经常不生效，必须重新登录才能加载新代码。这是 GNOME 的限制，不是本扩展的问题。

验证是否加载成功：

```bash
gnome-extensions info osk-control@localhost
# 应显示：OSK Simple / version 1 / ACTIVE

grep -E 'enable osk-simple|number keys|candidate popup' /tmp/opencode/osk-simple.log | tail -10
```

## 适配其他设备

扩展通过检测底座对应的 USB 设备是否存在来判断"分离/接上"：

```js
const BASE_PATH = '/sys/bus/usb/devices/1-7';
```

在你的设备上插上底座前后执行：

```bash
ls /sys/bus/usb/devices/
```

找到底座接上才出现的那个设备节点，把 `extension.js` 顶部的 `BASE_PATH` 改成对应路径，然后**注销重新登录**。

如果你的设备没有可检测的底座，可以直接把 `_baseDetached()` 改成 `return true;`，让 OSK 始终按平板模式工作。

## 推荐的 Rime 配置

为了和 OSK 顶部 10 个数字键对应，建议每页 9 个候选（第 10 个 0 键留作键盘样式；如想让 0 也选字，把 `page_size` 改成 10）：

`~/.config/ibus/rime/default.custom.yaml`：

```yaml
patch:
  "menu/page_size": 9
  "style/horizontal": false
```

改完执行：

```bash
ibus restart
```

## 工作原理（简要）

- 底座状态：`Gio.File.query_exists()` 检测 sysfs 节点，切换 `org.gnome.desktop.a11y.applications screen-keyboard-enabled`
- 焦点桥接：连接 `IBusManager` 的 `focus-in` / `focus-out` 信号，只调用 `Main.keyboard.open/close`，不劫持任何 Shell 内部信号
- 候选弹窗：patch `IBusManager._candidatePopup` 的 `_updateVisibility`、`_calculateArrowSide`、`_reposition`
- 固定数字键：patch `Main.keyboard.keyboardActor` 的 `setSuggestionsVisible` / `addSuggestion` / `resetSuggestions`，忽略 GNOME 塞进来的候选词，用 `St.Button` 加 `keyboard-key` 样式类绘制数字行
- 所有 patch 在 `disable()` 中都会恢复原方法

## 日志与排错

日志写在 `/tmp/opencode/osk-simple.log`：

```bash
tail -f /tmp/opencode/osk-simple.log
```

常见问题：

- **完全没有键盘**：检查目录名、`metadata.json` 的 `uuid`、`gnome-extensions list` 三者是否都是 `osk-control@localhost`。历史上 UUID 不匹配会导致扩展无法加载。
- **改了代码没生效**：GNOME 51 必须注销重新登录。
- **候选弹窗不显示**：确认 IBus 正在运行（`ibus engine` 应返回 `rime` 或 `xkb:us::eng`），且日志里有 `candidate popup visibility patched`。
- **中文自动大写**：确认日志里有 `auto-capitalization disabled`。

## 卸载

```bash
gnome-extensions disable osk-control@localhost
rm -rf ~/.local/share/gnome-shell/extensions/osk-control@localhost/
```

`disable()` 会恢复 GNOME 原生开关为开启，避免卸载后键盘彻底不可用。

## License

MIT © 2026 newsqualychen
