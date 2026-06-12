// iLabels — AE ScriptUI Panel с системой лицензирования
// Установка: Scripts > ScriptUI Panels > iLabels.jsx

(function (thisObj) {

    // ─── КОНФИГУРАЦИЯ ────────────────────────────────────────────────────────

    var API_BASE        = "https://ilabels-api.iosflowzy.workers.dev";
    var API_BASES       = [
        "https://ilabels-api.iosflowzy.workers.dev",
        "https://ilabels.iosflowzy.workers.dev"
    ];
    var SETTINGS_SECT   = "iLabels";
    var VALIDATE_DAYS   = 7; // валидация раз в неделю

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

    // ─── ЛИЦЕНЗИЯ: HTTP ЗАПРОС ЧЕРЕЗ CURL ───────────────────────────────────

    function buildQueryString(payload) {
        var parts = [];
        if (payload && payload.license) {
            parts.push("license=" + encodeURIComponent(String(payload.license)));
        }
        if (payload && payload.device) {
            parts.push("device=" + encodeURIComponent(String(payload.device)));
        }
        return parts.length ? "?" + parts.join("&") : "";
    }

    function apiRequestSingle(baseUrl, endpoint, payload) {
        var result = { success: false, data: null, error: "Request failed" };

        try {
            var isWin    = ($.os.indexOf("Windows") >= 0);
            var sep      = isWin ? "\\" : "/";
            var inPath     = Folder.temp.fsName + sep + "ilabels_req.json";
            var outPath    = Folder.temp.fsName + sep + "ilabels_res.json";
            var statusPath = Folder.temp.fsName + sep + "ilabels_status.txt";
            var errPath    = Folder.temp.fsName + sep + "ilabels_error.txt";

            var inFile = new File(inPath);
            inFile.encoding = "UTF-8";
            inFile.open("w");
            inFile.write(JSON.stringify(payload));
            inFile.close();

            // Удаляем старый output, если остался от прошлого вызова
            var outFile = new File(outPath);
            if (outFile.exists) { try { outFile.remove(); } catch (e) {} }

            var statusFile = new File(statusPath);
            if (statusFile.exists) { try { statusFile.remove(); } catch (e) {} }

            var errFile = new File(errPath);
            if (errFile.exists) { try { errFile.remove(); } catch (e) {} }

            var url = baseUrl + endpoint + buildQueryString(payload);

            var curlBin = isWin ? "curl.exe" : "curl";
            var httpCodeFormat = isWin ? "%%{http_code}" : "%{http_code}";
            var curlCmd = curlBin + " -sS -L --max-time 15 -X POST \"" + url + "\""
                        + " -H \"Content-Type: application/json\""
                        + " --data-binary @\"" + inPath + "\""
                        + " -o \"" + outPath + "\""
                        + " -w \"" + httpCodeFormat + "\""
                        + " > \"" + statusPath + "\""
                        + " 2> \"" + errPath + "\"";

            system.callSystem(curlCmd);

            // system.callSystem не блокирующий — ждём пока curl отработает
            $.sleep(1500);

            try { inFile.remove(); } catch (e) {}

            var content = "";
            var attempts = 0;
            while (attempts < 5) {
                outFile = new File(outPath);
                if (outFile.exists) {
                    outFile.encoding = "UTF-8";
                    outFile.open("r");
                    content = "";
                    while (!outFile.eof) content += outFile.readln();
                    outFile.close();
                    if (content) break;
                }
                $.sleep(500);
                attempts++;
            }
            var statusCode = "";
            statusFile = new File(statusPath);
            if (statusFile.exists) {
                statusFile.encoding = "UTF-8";
                statusFile.open("r");
                while (!statusFile.eof) statusCode += statusFile.readln();
                statusFile.close();
            }

            var curlError = "";
            errFile = new File(errPath);
            if (errFile.exists) {
                errFile.encoding = "UTF-8";
                errFile.open("r");
                while (!errFile.eof) curlError += errFile.readln();
                errFile.close();
            }

            try { outFile.remove(); } catch (e) {}
            try { statusFile.remove(); } catch (e) {}
            try { errFile.remove(); } catch (e) {}

            content = content.replace(/^\uFEFF/, ""); // снять BOM если есть
            content = content.replace(/^\s+|\s+$/g, "");

            if (!content) {
                result.error = curlError
                    ? "Curl failed" + (statusCode ? " (HTTP " + statusCode + ")" : "") + ": " + curlError.substr(0, 90)
                    : "Empty response" + (statusCode ? " (HTTP " + statusCode + ")" : "");
                return result;
            }

            if (content.charAt(0) !== "{" && content.charAt(0) !== "[") {
                var snippet = content.replace(/\s+/g, " ").substr(0, 90);
                result.error = "HTTP " + (statusCode || "?") + ": " + snippet;
                return result;
            }

            var parsed;
            try {
                parsed = JSON.parse(content);
            } catch (parseError) {
                result.error = "Bad JSON" + (statusCode ? " (HTTP " + statusCode + ")" : "") + ": " + content.substr(0, 90);
                return result;
            }
            result.success = true;
            result.data    = parsed;
            result.error   = "";

        } catch (e) {
            result.error = String(e.message || e);
        }

        return result;
    }

    function shouldTryNextApiRoute(res) {
        if (!res || res.success) return false;
        var msg = String(res.error || "").toLowerCase();
        return msg.indexOf("not found") >= 0
            || msg.indexOf("http 403") >= 0
            || msg.indexOf("http 404") >= 0
            || msg.indexOf("http 5") >= 0
            || msg.indexOf("http ?") >= 0
            || msg.indexOf("server returned non-json") >= 0
            || msg.indexOf("empty response") >= 0
            || msg.indexOf("curl failed") >= 0;
    }

    function apiRequest(endpoint, payload) {
        var paths = [endpoint];
        if (endpoint.indexOf("/api/") === 0) {
            paths.push(endpoint.substr(4));
        } else {
            paths.push("/api" + endpoint);
        }

        var last = null;
        for (var b = 0; b < API_BASES.length; b++) {
            for (var p = 0; p < paths.length; p++) {
                last = apiRequestSingle(API_BASES[b], paths[p], payload);
                if (last.success) return last;
                if (!shouldTryNextApiRoute(last)) return last;
            }
        }

        return last || { success: false, data: null, error: "Request failed" };
    }

    // ─── ЛИЦЕНЗИЯ: АКТИВАЦИЯ ────────────────────────────────────────────────

    function activateLicense(key) {
        var deviceId = getDeviceId();
        var res = apiRequest("/activate", { license: key, device: deviceId });

        if (!res.success) return { ok: false, msg: "Network error: " + res.error };

        var data = res.data;
        if (data && data.success) {
            saveLicenseKey(key);
            saveLastValidated();
            return { ok: true, msg: "Activated! Remaining: " + (data.remaining || 0) };
        }

        return { ok: false, msg: data ? (data.message || data.error || "Activation denied") : "Unknown error" };
    }

    // ─── ЛИЦЕНЗИЯ: ВАЛИДАЦИЯ ─────────────────────────────────────────────────

    function validateLicense(key) {
        var deviceId = getDeviceId();
        var res = apiRequest("/validate", { license: key, device: deviceId });

        if (!res.success) return true; // если сеть недоступна — не блокируем
        return res.data && res.data.valid === true;
    }

    // ─── ЛИЦЕНЗИЯ: НУЖНА ЛИ ПРОВЕРКА СЕГОДНЯ ────────────────────────────────

    function needsValidation() {
        var last = getLastValidated();
        if (!last) return true;
        try {
            var diff = (new Date()) - (new Date(last));
            return diff > VALIDATE_DAYS * 24 * 60 * 60 * 1000;
        } catch (e) { return true; }
    }

    // ─── ЛИЦЕНЗИЯ: СТАТУС ────────────────────────────────────────────────────

    function checkActivation() {
        var key = getLicenseKey();
        if (!key) return false;

        if (needsValidation()) {
            var valid = validateLicense(key);
            if (valid) saveLastValidated();
            else { clearLicense(); return false; }
        }

        return true;
    }

    // ─── UI: ОКНО АКТИВАЦИИ ──────────────────────────────────────────────────

    function buildActivationUI(host) {
        var panel = (host instanceof Panel)
            ? host
            : new Window("palette", "iLabels — Activate", undefined, { resizeable: false });

        panel.orientation   = "column";
        panel.alignChildren = ["fill", "center"];
        panel.spacing       = 10;
        panel.margins       = 16;

        // Заголовок
        var titleGrp = panel.add("group");
        titleGrp.orientation = "column";
        titleGrp.alignChildren = ["center", "center"];
        titleGrp.margins = [0, 8, 0, 0];

        var titleTxt = titleGrp.add("statictext", undefined, "iLabels");
        titleTxt.graphics.font = ScriptUI.newFont("dialog", "BOLD", 18);

        var subTxt = titleGrp.add("statictext", undefined, "Enter your license key");
        subTxt.graphics.foregroundColor = subTxt.graphics.newPen(subTxt.graphics.PenType.SOLID_COLOR, [0.5, 0.5, 0.5, 1], 1);

        // Поле ввода ключа
        var inputGrp = panel.add("group");
        inputGrp.orientation = "column";
        inputGrp.alignChildren = ["fill", "center"];
        inputGrp.margins = [0, 8, 0, 0];

        var label = inputGrp.add("statictext", undefined, "License Key:");
        label.graphics.foregroundColor = label.graphics.newPen(label.graphics.PenType.SOLID_COLOR, [0.6, 0.6, 0.6, 1], 1);

        var input = inputGrp.add("edittext", undefined, "");
        input.preferredSize = [-1, 28];
        input.helpTip = "ILBL-XXXX-XXXX-XXXX";

        // Статус
        var statusTxt = panel.add("statictext", undefined, " ");
        statusTxt.graphics.foregroundColor = statusTxt.graphics.newPen(statusTxt.graphics.PenType.SOLID_COLOR, [0.8, 0.3, 0.3, 1], 1);
        statusTxt.alignment = ["fill", "center"];
        statusTxt.justify = "center";

        // Кнопка активации
        var activateBtn = panel.add("button", undefined, "Activate");
        activateBtn.preferredSize = [-1, 32];
        activateBtn.alignment = ["fill", "center"];

        // Ссылка на покупку
        var buyGrp = panel.add("group");
        buyGrp.orientation = "column";
        buyGrp.alignChildren = ["center", "center"];
        buyGrp.margins = [0, 4, 0, 8];

        var buyTxt = buyGrp.add("statictext", undefined, "No key? Buy at ilabels.iosflowzy.workers.dev");
        buyTxt.graphics.foregroundColor = buyTxt.graphics.newPen(buyTxt.graphics.PenType.SOLID_COLOR, [0.4, 0.4, 0.6, 1], 1);

        // Кнопка активации — логика
        activateBtn.onClick = function () {
            var key = String(input.text || "").trim().toUpperCase();

            if (!key) {
                statusTxt.text = "Please enter your license key.";
                return;
            }

            // Базовая проверка формата
            if (key.length < 10) {
                statusTxt.text = "Invalid key format.";
                return;
            }

            activateBtn.enabled = false;
            activateBtn.text    = "Activating...";
            statusTxt.text      = " ";

            var result = activateLicense(key);

            if (result.ok) {
                statusTxt.graphics.foregroundColor = statusTxt.graphics.newPen(statusTxt.graphics.PenType.SOLID_COLOR, [0.2, 0.7, 0.3, 1], 1);
                statusTxt.text = "Success! Reopen the panel.";
                activateBtn.text = "Restart panel to continue";
            } else {
                statusTxt.graphics.foregroundColor = statusTxt.graphics.newPen(statusTxt.graphics.PenType.SOLID_COLOR, [0.8, 0.3, 0.3, 1], 1);
                statusTxt.text = result.msg;
                activateBtn.enabled = true;
                activateBtn.text    = "Activate";
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
