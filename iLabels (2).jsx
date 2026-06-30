// iLabels — AE ScriptUI Panel с системой лицензирования
// Установка: Scripts > ScriptUI Panels > iLabels.jsx

(function (thisObj) {

    // ─── КОНФИГУРАЦИЯ ────────────────────────────────────────────────────────

    var SETTINGS_SECT   = "iLabels";

    // ─── УТИЛИТЫ ─────────────────────────────────────────────────────────────

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    // ─── ЛИЦЕНЗИЯ: ХРАНЕНИЕ ─────────────────────────────────────────────────

    function getLicenseKey() {
        try { return app.settings.getSetting(SETTINGS_SECT, "licenseKey") || ""; }
        catch (e) { return ""; }
    }

    function saveLicenseKey(key) {
        try { app.settings.saveSetting(SETTINGS_SECT, "licenseKey", key); } catch (e) {}
    }

    function getLastValidated() {
        try { return app.settings.getSetting(SETTINGS_SECT, "lastValidated") || ""; }
        catch (e) { return ""; }
    }

    function saveLastValidated() {
        try { app.settings.saveSetting(SETTINGS_SECT, "lastValidated", (new Date()).toISOString()); } catch (e) {}
    }

    function clearLicense() {
        try {
            app.settings.saveSetting(SETTINGS_SECT, "licenseKey", "");
            app.settings.saveSetting(SETTINGS_SECT, "lastValidated", "");
        } catch (e) {}
    }

    // ─── ЛИЦЕНЗИЯ: FINGERPRINT УСТРОЙСТВА ───────────────────────────────────

    function getDeviceId() {
        var raw = String($.os || "") + "-" + String($.userName || "") + "-AE";
        var hash = 5381;
        for (var i = 0; i < raw.length; i++) {
            hash = (((hash << 5) + hash) + raw.charCodeAt(i)) & 0x7fffffff;
        }
        return "dev-" + Math.abs(hash).toString(16);
    }

    // ─── ОБЩИЙ СЕКРЕТ (должен совпадать с Worker'ом) ────────────────────────

    var UNLOCK_SECRET = "ilabels-unlock-v1-9f3k2";

    // ─── ПРОСТОЙ ХЕШ (djb2), совпадает с реализацией на Worker ──────────────

    function djb2(str) {
        var hash = 5381;
        for (var i = 0; i < str.length; i++) {
            hash = (((hash << 5) + hash) + str.charCodeAt(i)) & 0xffffffff;
        }
        return (hash >>> 0);
    }

    function computeUnlockCode(license, device) {
        var raw = license + ":" + device + ":" + UNLOCK_SECRET;
        var h = djb2(raw);
        var s = h.toString(36).toUpperCase();
        while (s.length < 8) s = "0" + s;
        return s.substr(0, 8);
    }

    // ─── ЛИЦЕНЗИЯ: АКТИВАЦИЯ (офлайн, по коду с сайта) ──────────────────────

    function activateWithCode(license, code) {
        var deviceId = getDeviceId();
        var expected = computeUnlockCode(license, deviceId);
        var normCode = String(code || "").trim().toUpperCase();

        if (normCode === expected) {
            saveLicenseKey(license);
            try { app.settings.saveSetting(SETTINGS_SECT, "unlockCode", normCode); } catch (e) {}
            return { ok: true, msg: "Activated successfully!" };
        }
        return { ok: false, msg: "Invalid unlock code. Check your license key and device code." };
    }

    // ─── ЛИЦЕНЗИЯ: СТАТУС (без сети — просто проверяем сохранённый код) ─────

    function checkActivation() {
        var key = getLicenseKey();
        if (!key) return false;

        var savedCode = "";
        try { savedCode = app.settings.getSetting(SETTINGS_SECT, "unlockCode") || ""; } catch (e) {}

        var deviceId = getDeviceId();
        var expected = computeUnlockCode(key, deviceId);

        return savedCode === expected;
    }

    // ─── UI: ОКНО АКТИВАЦИИ ──────────────────────────────────────────────────

    function buildActivationUI(host) {
        var panel = (host instanceof Panel)
            ? host
            : new Window("palette", "iLabels — Activate", undefined, { resizeable: false });

        panel.orientation   = "column";
        panel.alignChildren = ["fill", "center"];
        panel.spacing       = 8;
        panel.margins       = 16;

        var deviceId = getDeviceId();

        // Заголовок
        var titleGrp = panel.add("group");
        titleGrp.orientation = "column";
        titleGrp.alignChildren = ["center", "center"];
        titleGrp.margins = [0, 8, 0, 0];

        var titleTxt = titleGrp.add("statictext", undefined, "iLabels");
        titleTxt.graphics.font = ScriptUI.newFont("dialog", "BOLD", 18);

        var subTxt = titleGrp.add("statictext", undefined, "Activate your license");
        subTxt.graphics.foregroundColor = subTxt.graphics.newPen(subTxt.graphics.PenType.SOLID_COLOR, [0.5, 0.5, 0.5, 1], 1);

        panel.add("panel").alignment = ["fill", "center"]; // разделитель

        // ── Device ID ──
        var devGrp = panel.add("group");
        devGrp.orientation = "column";
        devGrp.alignChildren = ["fill", "center"];
        devGrp.margins = [0, 6, 0, 0];

        var devLabel = devGrp.add("statictext", undefined, "1. Your Device ID:");
        devLabel.graphics.foregroundColor = devLabel.graphics.newPen(devLabel.graphics.PenType.SOLID_COLOR, [0.6, 0.6, 0.6, 1], 1);

        var devField = devGrp.add("edittext", undefined, deviceId, { readonly: true });
        devField.preferredSize = [-1, 26];

        var devHint = devGrp.add("statictext", undefined, "Copy this and go to ilabels.iosflowzy.workers.dev/activate.html", { multiline: true });
        devHint.preferredSize = [260, 32];
        devHint.graphics.foregroundColor = devHint.graphics.newPen(devHint.graphics.PenType.SOLID_COLOR, [0.4, 0.4, 0.6, 1], 1);

        // ── License Key ──
        var keyGrp = panel.add("group");
        keyGrp.orientation = "column";
        keyGrp.alignChildren = ["fill", "center"];
        keyGrp.margins = [0, 6, 0, 0];

        var keyLabel = keyGrp.add("statictext", undefined, "2. License Key:");
        keyLabel.graphics.foregroundColor = keyLabel.graphics.newPen(keyLabel.graphics.PenType.SOLID_COLOR, [0.6, 0.6, 0.6, 1], 1);

        var keyInput = keyGrp.add("edittext", undefined, "");
        keyInput.preferredSize = [-1, 26];
        keyInput.helpTip = "ILBL-XXXX-XXXX-XXXX";

        // ── Unlock Code ──
        var codeGrp = panel.add("group");
        codeGrp.orientation = "column";
        codeGrp.alignChildren = ["fill", "center"];
        codeGrp.margins = [0, 6, 0, 0];

        var codeLabel = codeGrp.add("statictext", undefined, "3. Unlock Code (from website):");
        codeLabel.graphics.foregroundColor = codeLabel.graphics.newPen(codeLabel.graphics.PenType.SOLID_COLOR, [0.6, 0.6, 0.6, 1], 1);

        var codeInput = codeGrp.add("edittext", undefined, "");
        codeInput.preferredSize = [-1, 26];
        codeInput.helpTip = "8-character code";

        // Статус
        var statusTxt = panel.add("statictext", undefined, " ", { multiline: true });
        statusTxt.preferredSize = [260, 32];
        statusTxt.graphics.foregroundColor = statusTxt.graphics.newPen(statusTxt.graphics.PenType.SOLID_COLOR, [0.8, 0.3, 0.3, 1], 1);
        statusTxt.alignment = ["fill", "center"];
        statusTxt.justify = "center";

        // Кнопка активации
        var activateBtn = panel.add("button", undefined, "Activate");
        activateBtn.preferredSize = [-1, 32];
        activateBtn.alignment = ["fill", "center"];

        var buyTxt = panel.add("statictext", undefined, "No key? Buy at ilabels.iosflowzy.workers.dev");
        buyTxt.graphics.foregroundColor = buyTxt.graphics.newPen(buyTxt.graphics.PenType.SOLID_COLOR, [0.4, 0.4, 0.6, 1], 1);
        buyTxt.alignment = ["center", "center"];

        activateBtn.onClick = function () {
            var key  = String(keyInput.text || "").trim().toUpperCase();
            var code = String(codeInput.text || "").trim().toUpperCase();

            if (!key || !code) {
                statusTxt.text = "Please fill in both License Key and Unlock Code.";
                return;
            }

            if (key.length < 10) {
                statusTxt.text = "Invalid license key format.";
                return;
            }

            var result = activateWithCode(key, code);

            if (result.ok) {
                statusTxt.graphics.foregroundColor = statusTxt.graphics.newPen(statusTxt.graphics.PenType.SOLID_COLOR, [0.2, 0.7, 0.3, 1], 1);
                statusTxt.text = "Success! Restart this panel (close and reopen from Window menu).";
                activateBtn.enabled = false;
            } else {
                statusTxt.graphics.foregroundColor = statusTxt.graphics.newPen(statusTxt.graphics.PenType.SOLID_COLOR, [0.8, 0.3, 0.3, 1], 1);
                statusTxt.text = result.msg;
            }
        };

        if (!(host instanceof Panel)) { panel.center(); panel.show(); }
        panel.layout.layout(true);
        return panel;
    }

    // ─── ЦВЕТОЧИТАЛКА (оригинальный код) ─────────────────────────────────────

    function prefCodeToHexCode(str) {
        return str.replace(/"([^"]+)"/g, function (u, code) {
            var result = "";
            for (var i = 0; i < code.length; i++) result += code.charCodeAt(i).toString(16);
            return result;
        });
    }

    function convertHex(hex) {
        hex = hex.replace('#', '');
        return [parseInt(hex.substring(0, 2), 16) / 255, parseInt(hex.substring(2, 4), 16) / 255, parseInt(hex.substring(4, 6), 16) / 255];
    }

    function findPrefsFile() {
        var isWin    = $.os.indexOf("Windows") >= 0;
        var userData = Folder.userData;
        var version  = app.version.split("x")[0];
        var lang     = app.isoLanguage;
        var prefixName = "", prefName = " Prefs-indep-general";
        if (lang === "de_DE") prefName = " Einstellungen-indep-general";
        if (lang === "es_ES") { prefixName = "Preferencias "; prefName = "-indep-general"; }
        if (lang === "fr_FR") prefName = " Pr\xE9fs-indep-general";
        if (lang === "it_IT") { prefixName = "Preferenze di "; prefName = "-indep-general"; }
        if (lang === "pt_BR") { prefixName = "Prefer\xEAncias do "; prefName = "-indep-general"; }

        var base;
        if (isWin) base = userData.toString() + "/Adobe/After Effects/";
        else { var m = userData.toString(); base = m.substring(0, m.lastIndexOf("/") + 1) + "Preferences/Adobe/After Effects/"; }

        var vFolders = [version, version.substring(0, 4), version.substring(0, 6)];
        var vNames   = [version, version.substring(0, 4)];
        for (var v = 0; v < vFolders.length; v++) {
            for (var n = 0; n < vNames.length; n++) {
                var f = new File(base + vFolders[v] + "/" + prefixName + "Adobe After Effects " + vNames[n] + prefName + ".txt");
                if (f.exists) return f;
            }
        }
        return null;
    }

    function readLines() {
        try { app.preferences.saveToDisk(); } catch(e) {}
        var f = findPrefsFile();
        if (!f) return null;
        var lines = [];
        try { f.open("r"); while (!f.eof) lines.push(f.readln()); f.close(); } catch(e) { return null; }
        return lines;
    }

    function parseColors(lines) {
        var fallback = ["B53838","E4D84C","A9CBC7","E5BCC9","A9A9CA","E7C19E","B3C7B3","677DE0","4AA44C","8E2C9A","E8920D","7F452A","F46DD6","3DA2A5","A89677","1E401E"];
        var colors = [];
        for (var i = 0; i < 16; i++) colors.push(convertHex(fallback[i]));
        if (!lines) return colors;
        var hasChecked1 = 0;
        for (var i = 1; i <= 16; i++) {
            for (var j = 0; j < lines.length; j++) {
                if (lines[j].substr(1, 20 + i.toString().length) === '"Label Color ID 2 # ' + i) {
                    if (i !== 1 || hasChecked1 === 0) {
                        try {
                            var myCode0 = lines[j].split('" = ')[1];
                            var decoded = prefCodeToHexCode(myCode0.substring(2, myCode0.length));
                            if (decoded && decoded.length >= 6) colors[i - 1] = convertHex(decoded);
                        } catch(e) {}
                        if (i === 1) hasChecked1 = 1;
                    }
                    break;
                }
            }
        }
        return colors;
    }

    function parseDefaultLabels(lines) {
        var d = { video:1, audio:1, still:1, solid:1, adjustment:1, nul:1, text:1, shape:1, comp:1, folder:1, camera:1, light:1 };
        if (!lines) return d;
        function extractIdx(line) { var parts = line.split('" = '); if (parts.length < 2) return 0; return parseInt(parts[1].replace(/[^0-9]/g, ''), 10) || 0; }
        for (var j = 0; j < lines.length; j++) {
            var l = lines[j];
            if (l.indexOf('"Video Label Index 2"')      >= 0) d.video      = extractIdx(l);
            if (l.indexOf('"Audio Label Index 2"')      >= 0) d.audio      = extractIdx(l);
            if (l.indexOf('"Still Label Index 2"')      >= 0) d.still      = extractIdx(l);
            if (l.indexOf('"Solid Label Index 2"')      >= 0) d.solid      = extractIdx(l);
            if (l.indexOf('"Adjustment Label Index 2"') >= 0) d.adjustment = extractIdx(l);
            if (l.indexOf('"Null Label Index"')         >= 0) d.nul        = extractIdx(l);
            if (l.indexOf('"Text Label Index"')         >= 0) d.text       = extractIdx(l);
            if (l.indexOf('"Shape Label Index 2"')      >= 0) d.shape      = extractIdx(l);
            if (l.indexOf('"Comp Label Index 2"')       >= 0) d.comp       = extractIdx(l);
            if (l.indexOf('"Folder Label Index 2"')     >= 0) d.folder     = extractIdx(l);
            if (l.indexOf('"Camera Label Index 2"')     >= 0) d.camera     = extractIdx(l);
            if (l.indexOf('"Light Label Index 2"')      >= 0) d.light      = extractIdx(l);
        }
        return d;
    }

    function getDefaultLabel(layer, d) {
        try {
            if (layer instanceof TextLayer)   return d.text;
            if (layer instanceof LightLayer)  return d.light;
            if (layer instanceof CameraLayer) return d.camera;
            if (layer instanceof ShapeLayer)  return d.shape;
            if (layer instanceof AVLayer) {
                if (layer.nullLayer)       return d.nul;
                if (layer.adjustmentLayer) return d.adjustment;
                if (!layer.hasVideo && layer.hasAudio) return d.audio;
                if (layer.source instanceof CompItem)    return d.comp;
                if (layer.source instanceof FootageItem) {
                    var src = layer.source.mainSource;
                    if (src instanceof SolidSource || src instanceof PlaceholderSource) return d.solid;
                }
                return d.video;
            }
        } catch(e) {}
        return d.video;
    }

    function selectByLabel(idx) {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) return;
        for (var i = 1; i <= comp.numLayers; i++) {
            try { if (comp.layer(i).label === idx) comp.layer(i).selected = true; } catch(e) {}
        }
    }

    var labelKeys = (parseFloat(app.version) >= 22.6);

    function applyLabel(idx, defLabels) {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) return;
        var sel = comp.selectedLayers;
        if (!sel || !sel.length) return;
        var isReset = (idx === 0);
        app.beginUndoGroup(isReset ? "Label Reset" : "Label");
        if (labelKeys) {
            try {
                var props = comp.selectedProperties;
                if (props && props.length > 0) {
                    for (var p = 0; p < props.length; p++) {
                        var keys = props[p].selectedKeys;
                        if (keys && keys.length) {
                            for (var k = 0; k < keys.length; k++) {
                                try { props[p].setLabelAtKey(keys[k], isReset ? 0 : idx); } catch(e) {}
                            }
                        }
                    }
                }
            } catch(e) {}
        }
        for (var i = 0; i < sel.length; i++) {
            try { sel[i].label = isReset ? getDefaultLabel(sel[i], defLabels) : idx; } catch(e) {}
        }
        app.endUndoGroup();
    }

    // ─── UI: ОСНОВНОЙ ПЛАГИН ─────────────────────────────────────────────────

    function buildUI(host) {
        var panel = (host instanceof Panel)
            ? host
            : new Window("palette", "Labels", undefined, { resizeable: true });

        panel.orientation   = "column";
        panel.alignChildren = ["fill", "fill"];
        panel.spacing       = 0;
        try { panel.margins = 0; } catch(e) {}
        try { panel.margins.top = 0; panel.margins.left = 0; panel.margins.right = 0; panel.margins.bottom = 0; } catch(e) {}

        var lines     = readLines();
        var colors    = parseColors(lines);
        var defLabels = parseDefaultLabels(lines);
        var btns      = [];

        for (var i = 0; i < 16; i++) {
            (function(idx, rgb) {
                var btn = panel.add("button", undefined, "");
                btn._li        = idx;
                btn._rgb       = rgb;
                btn._lastClick = 0;
                btn.alignment     = ["fill", "fill"];
                btn.preferredSize = [40, 22];
                btn.helpTip       = "";

                btn.onDraw = function () {
                    var g = this.graphics, c = this._rgb;
                    g.newPath();
                    g.rectPath(0, 0, this.size[0], this.size[1]);
                    g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [c[0], c[1], c[2], 1]));
                };

                btn.onClick = function () {
                    var now      = (new Date()).getTime();
                    var timeDiff = now - this._lastClick;
                    this._lastClick = now;
                    var comp = app.project.activeItem;
                    if (!(comp instanceof CompItem)) return;
                    var sel       = comp.selectedLayers;
                    var hasSelect = sel && sel.length > 0;
                    if (!hasSelect)           selectByLabel(this._li);
                    else if (timeDiff < 400)  { applyLabel(0, defLabels); this._lastClick = 0; }
                    else                      applyLabel(this._li, defLabels);
                };

                btns.push(btn);
            })(i + 1, colors[i]);
        }

        function relayout() {
            if (!panel || !panel.size) return;
            var W = panel.size[0], H = panel.size[1];
            if (W < 10 || H < 10) return;
            var perH = clamp(Math.floor(H / btns.length), 10, 400);
            for (var i = 0; i < btns.length; i++) btns[i].preferredSize = [W, perH];
            try { panel.layout.layout(true); } catch(e) {}
            try { panel.layout.resize();     } catch(e) {}
        }

        panel.onResizing = panel.onResize = relayout;
        panel.onShow = relayout;
        if (!(host instanceof Panel)) { panel.center(); panel.show(); }
        panel.layout.layout(true);
        return panel;
    }

    // ─── ТОЧКА ВХОДА ─────────────────────────────────────────────────────────

    if (checkActivation()) {
        buildUI(thisObj);
    } else {
        buildActivationUI(thisObj);
    }

})(this);
