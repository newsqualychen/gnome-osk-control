import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as IBusManager from 'resource:///org/gnome/shell/misc/ibusManager.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const BASE_PATH = '/sys/bus/usb/devices/1-7';
const LOG = '/tmp/opencode/osk-simple.log';
const A11Y_SCHEMA = 'org.gnome.desktop.a11y.applications';
const SHOW_KEYBOARD = 'screen-keyboard-enabled';
const HIDE_DELAY_MS = 250; // 吞掉 X11 的 focus-out→focus-in 噪声对

function log(msg) {
    try {
        const f = Gio.File.new_for_path(LOG);
        const out = f.append_to(Gio.FileCreateFlags.NONE, null);
        out.write(`${new Date().toISOString()} ${msg}\n`, null);
        out.close(null);
    } catch (e) {
        // ignore
    }
}

export default class SimpleOskExtension extends Extension {
    enable() {
        log('=== enable osk-simple v1 ===');
        this._settings = new Gio.Settings({schema_id: A11Y_SCHEMA});
        this._hideId = 0;
        this._pollId = 0;
        this._lastDetached = null;
        this._wrappedActor = null;
        this._suggestionId = 0;
        this._orig = {};
        this._candidatePopupRef = null;
        this._origUpdateVisibility = null;
        this._origArrowSide = null;
        this._origCalcArrowSide = null;
        this._origReposition = null;
        this._setupCandidatePopup();

        // 底座分离时打开 GNOME 官方屏幕键盘开关；接上时关闭
        this._syncBase();
        this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._syncBase();
            this._ensureWrapped();
            return GLib.SOURCE_CONTINUE;
        });

        // X11 应用（IBus 输入上下文）的焦点事件补强。
        // 只负责 open/close，不劫持任何 Shell 内部信号。
        try {
            const ibm = IBusManager.getIBusManager();
            this._ibInId = ibm.connect('focus-in', () => this._onFocusIn());
            this._ibOutId = ibm.connect('focus-out', () => this._onFocusOut());
            log('ibus focus signals connected');
        } catch (e) {
            log(`ibus connect failed: ${e.message}`);
        }

        // 手动开关按钮
        this._button = new PanelMenu.Button(0.0, 'OSK Toggle', false);
        this._button.add_child(new St.Icon({
            icon_name: 'input-keyboard-symbolic',
            style_class: 'system-status-icon',
        }));
        this._button.connect('button-press-event', () => {
            if (Main.keyboard.visible)
                this._closeNow();
            else
                this._openNow();
            return Clutter.EVENT_STOP;
        });
        Main.panel.addToStatusArea('osk-simple', this._button);

        log('enabled');
    }

    _baseDetached() {
        return !Gio.File.new_for_path(BASE_PATH).query_exists(null);
    }

    _syncBase() {
        const detached = this._baseDetached();
        if (this._lastDetached === detached)
            return;
        this._lastDetached = detached;
        const enabled = this._settings.get_boolean(SHOW_KEYBOARD);
        if (detached && !enabled) {
            this._settings.set_boolean(SHOW_KEYBOARD, true);
            log('base detached -> official OSK ON');
        } else if (!detached && enabled) {
            this._settings.set_boolean(SHOW_KEYBOARD, false);
            log('base attached -> official OSK OFF');
        }
    }

    _onFocusIn() {
        log('focus-in');
        if (this._hideId) {
            GLib.source_remove(this._hideId);
            this._hideId = 0;
        }
        if (!this._baseDetached())
            return;
        if (!this._settings.get_boolean(SHOW_KEYBOARD))
            return;
        this._openNow();
    }

    _onFocusOut() {
        log('focus-out');
        if (this._hideId)
            GLib.source_remove(this._hideId);
        this._hideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DELAY_MS, () => {
            this._hideId = 0;
            log('focus-out settled -> close');
            Main.keyboard.close();
            return GLib.SOURCE_REMOVE;
        });
    }

    _openNow() {
        try {
            Main.layoutManager.keyboardIndex = Main.layoutManager.focusIndex;
            const actor = Main.keyboard.keyboardActor;
            if (actor)
                actor.open(true); // 跳过 GNOME 内部 300ms rest timer
            else
                Main.keyboard.open(Main.layoutManager.focusIndex);
            log('open');
        } catch (e) {
            log(`open failed: ${e.message}`);
        }
    }

    _closeNow() {
        if (this._hideId) {
            GLib.source_remove(this._hideId);
            this._hideId = 0;
        }
        Main.keyboard.close();
        log('close');
    }

    // 以下补丁与显示/隐藏无关，只做：候选栏高度固定、禁止自动大写、翻页按钮
    _ensureWrapped() {
        const actor = Main.keyboard.keyboardActor;
        if (!actor || this._wrappedActor === actor)
            return;
        this._restoreWrapped();
        this._wrappedActor = actor;

        try {
            // 候选词和拼音串已在输入框旁的 GNOME 候选弹窗显示（带 1-9 编号）。
            // OSK 顶部候选栏改成固定的 1-9 数字键：高度/宽度永远不变，
            // 不会因候选词出现而缩放；点数字即选对应候选，物理数字键也可用。
            this._orig.setSuggestions = actor.setSuggestionsVisible.bind(actor);
            actor.setSuggestionsVisible = () => this._orig.setSuggestions(true);

            // GNOME 往 OSK 里塞候选词时忽略，候选栏只保留固定数字键
            this._orig.addSuggestion = actor.addSuggestion.bind(actor);
            actor.addSuggestion = () => {};

            this._orig.resetSuggestions = actor.resetSuggestions.bind(actor);
            actor.resetSuggestions = () => {
                const a = this._wrappedActor;
                if (!a?._suggestions)
                    return;
                a._suggestions.remove_all_children();
                // 像真实键盘数字行一样 1 2 3 4 5 6 7 8 9 0，
                // 用 keyboard-key 样式类，外观和键盘按键一致。
                for (let i = 1; i <= 10; i++) {
                    const label = i === 10 ? '0' : String(i);
                    const idx = i - 1;
                    const btn = new St.Button({
                        label,
                        style_class: 'keyboard-key',
                    });
                    btn.connect('clicked', () => {
                        try {
                            IBusManager.getIBusManager()._panelService
                                ?.candidate_clicked(idx, 1, 0);
                        } catch (e) {}
                    });
                    a._suggestions.add_child(btn);
                }
            };
            actor.setSuggestionsVisible(true);
            actor.resetSuggestions();
            log('suggestions replaced with keyboard-style 1-9 0 number keys');
        } catch (e) {
            log(`suggestions patch failed: ${e.message}`);
        }

        try {
            this._orig.updateLevel = actor._updateLevelFromHints.bind(actor);
            actor._updateLevelFromHints = userInputHappened => {
                try {
                    if (actor._latched)
                        return;
                    const hints = actor._contentHints ?? 0;
                    const F = Clutter.InputContentHintFlags;
                    if ((hints & F.LOWERCASE) !== 0) {
                        actor._setActiveLevel('default');
                        return;
                    }
                    if (!actor._layers?.['shift'])
                        return;
                    if ((hints & F.UPPERCASE) !== 0) {
                        actor._setActiveLevel('shift');
                        return;
                    }
                    if (userInputHappened && actor._currentPage === actor._layers['shift'])
                        actor._setActiveLevel('default');
                } catch (e) {}
            };
            log('auto-capitalization disabled');
        } catch (e) {
            log(`auto-cap patch failed: ${e.message}`);
        }
    }

    // GNOME 的候选弹窗本来就定位在输入框光标旁，里面就有 IBus preedit
    // （当前正在拼的拼音串）。但 ibusCandidatePopup.js 的 _updateVisibility()
    // 里有 !Main.keyboard.visible，OSK 一弹出就把整个弹窗隐藏，拼音也跟着没了。
    // 这里只去掉这一个显示条件，完全不碰 OSK 的高度与显示/隐藏逻辑。
    _setupCandidatePopup() {
        try {
            const cp = IBusManager.getIBusManager()._candidatePopup;
            if (!cp || this._candidatePopupRef === cp)
                return;
            this._restoreCandidatePopup();
            this._candidatePopupRef = cp;
            this._origUpdateVisibility = cp._updateVisibility;
            try { this._origArrowSide = cp.arrowSide; } catch (e) { this._origArrowSide = null; }
            cp._updateVisibility = () => {
                try {
                    const visible = cp._preeditText?.visible ||
                                    cp._auxText?.visible ||
                                    cp._candidateArea?.visible;
                    if (visible) {
                        cp.setPosition(cp._dummyCursor, 0);
                        cp.open(BoxPointer.PopupAnimation.NONE);
                    } else {
                        cp.close(BoxPointer.PopupAnimation.NONE);
                    }
                } catch (e) {
                    try { this._origUpdateVisibility?.call(cp); } catch (e2) {}
                }
            };
            // 温和的 updateArrowSide 不够：横屏高度紧张时 GNOME 的
            // _calculateArrowSide() 会翻回向下，盖住 OSK。这里强制方向恒为
            // BOTTOM（候选栏在输入框正上方），并补上 BoxPointer 缺失的 Y 方向
            // clamp，避免上方空间不足时候选栏被顶出屏幕。
            try {
                this._origCalcArrowSide = cp._calculateArrowSide;
                cp._calculateArrowSide = () => St.Side.BOTTOM;

                this._origReposition = cp._reposition;
                const origReposition = this._origReposition;
                cp._reposition = function (allocationBox) {
                    origReposition.call(this, allocationBox);
                    const wa = this._workArea;
                    if (wa) {
                        const o = allocationBox.get_origin();
                        const x = Array.isArray(o) ? o[0] : o.x;
                        const y = Array.isArray(o) ? o[1] : o.y;
                        if (y < wa.y)
                            allocationBox.set_origin(x, wa.y);
                    }
                };
                cp.updateArrowSide(St.Side.BOTTOM);
                log('candidate popup forced above input + Y clamp');
            } catch (e) {
                log(`arrow force patch failed: ${e.message}`);
            }
            log('candidate popup visibility patched');
        } catch (e) {
            log(`candidate popup patch failed: ${e.message}`);
        }
    }

    _restoreCandidatePopup() {
        const cp = this._candidatePopupRef;
        if (cp && this._origUpdateVisibility)
            cp._updateVisibility = this._origUpdateVisibility;
        if (cp && this._origArrowSide !== null) {
            try { cp.updateArrowSide(this._origArrowSide); } catch (e) {}
        }
        if (cp && this._origCalcArrowSide)
            cp._calculateArrowSide = this._origCalcArrowSide;
        if (cp && this._origReposition)
            cp._reposition = this._origReposition;
        this._candidatePopupRef = null;
        this._origUpdateVisibility = null;
        this._origArrowSide = null;
        this._origCalcArrowSide = null;
        this._origReposition = null;
    }

    _addPageButtons(actor) {
        try {
            const ps = IBusManager.getIBusManager()._panelService;
            if (!ps)
                return;
            const children = actor._suggestions.get_children();
            if (!children.some(b => b._oskPage === 'prev')) {
                actor.addSuggestion('◀', () => {
                    try { ps.page_up(); } catch (e) {}
                });
                const b = actor._suggestions.get_last_child();
                if (b) b._oskPage = 'prev';
            }
            if (!children.some(b => b._oskPage === 'next')) {
                actor.addSuggestion('▶', () => {
                    try { ps.page_down(); } catch (e) {}
                });
                const b = actor._suggestions.get_last_child();
                if (b) b._oskPage = 'next';
            }
        } catch (e) {}
    }

    _restoreWrapped() {
        const a = this._wrappedActor;
        if (a && this._orig.setSuggestions)
            a.setSuggestionsVisible = this._orig.setSuggestions;
        if (a && this._orig.resetSuggestions)
            a.resetSuggestions = this._orig.resetSuggestions;
        if (a && this._orig.addSuggestion)
            a.addSuggestion = this._orig.addSuggestion;
        if (a && this._orig.updateLevel)
            a._updateLevelFromHints = this._orig.updateLevel;
        this._orig = {};
        this._wrappedActor = null;
    }

    disable() {
        log('disable');
        if (this._hideId) {
            GLib.source_remove(this._hideId);
            this._hideId = 0;
        }
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = 0;
        }
        if (this._suggestionId) {
            GLib.source_remove(this._suggestionId);
            this._suggestionId = 0;
        }
        if (this._ibInId) {
            try { IBusManager.getIBusManager().disconnect(this._ibInId); } catch (e) {}
        }
        if (this._ibOutId) {
            try { IBusManager.getIBusManager().disconnect(this._ibOutId); } catch (e) {}
        }
        this._restoreWrapped();
        this._restoreCandidatePopup();
        this._button?.destroy();
        this._button = null;
        // 恢复官方开关为开启，避免卸载后键盘彻底不可用
        try { this._settings.set_boolean(SHOW_KEYBOARD, true); } catch (e) {}
        Main.keyboard.close();
    }
}
