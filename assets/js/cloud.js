/* =========================================================
 * 学习中心 · 云端同步 / 账号 / 埋点
 * 依赖：config.js（window.STUDY_CONFIG）、sha256.js（window.sha256Hex）
 * 无 apiKey 时自动降级为「本地模式」，不影响离线使用。
 * ========================================================= */
window.StudyCloud = (function () {
  var CFG = window.STUDY_CONFIG || {};
  var SALT = "study-hub-v1";
  var SESSION_KEY = "studyHub:session";

  var session = null;      // { username, role }
  var listeners = [];
  var syncTimer = null;
  var lastSyncAt = 0;
  var syncing = false;
  var pendingData = null;

  /* ---------- 基础 ---------- */
  function ready() { return !!(CFG.apiKey && CFG.envId); }
  function base() { return "https://" + CFG.envId + ".api.tcloudbasegateway.com/v1/rdb/rest/"; }
  function headers(extra) {
    var h = {
      "apikey": CFG.apiKey,
      "Authorization": "Bearer " + CFG.apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }
  function hash(u, p) { return window.sha256Hex(u + ":" + p + ":" + SALT); }

  function req(path, opt) {
    opt = opt || {};
    var url = base() + path;
    var init = { method: opt.method || "GET", headers: headers(opt.prefer ? { "Prefer": opt.prefer } : null) };
    if (opt.body !== undefined) init.body = JSON.stringify(opt.body);
    return fetch(url, init).then(function (r) {
      if (r.status === 204 || r.status === 201 && !opt.wantBody) {
        if (r.status === 201) return r.text().then(function (t) { try { return JSON.parse(t); } catch (e) { return []; } });
        return [];
      }
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        if (!r.ok) throw new Error((j && (j.message || j.hint || j.details)) || ("HTTP " + r.status));
        return j;
      });
    });
  }
  function enc(v) { return encodeURIComponent(String(v)); }

  /* ---------- 会话 ---------- */
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
  function on(evt, fn) { if (evt === "change") listeners.push(fn); }
  function saveSession() {
    if (session) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {} }
    else { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
  }
  function restoreSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (s && s.username) session = s;
    } catch (e) {}
    return session;
  }
  function current() { return session; }

  function register(username, password) {
    if (!ready()) return Promise.reject(new Error("后端未配置，无法注册"));
    if (!username || !password) return Promise.reject(new Error("请输入账号和密码"));
    if (password.length < 6) return Promise.reject(new Error("密码至少 6 位"));
    return hash(username, password).then(function (h) {
      return req("study_users?username=eq." + enc(username) + "&select=username").then(function (rows) {
        if (rows && rows.length) throw new Error("该账号已存在，请直接登录");
        return req("study_users", {
          method: "POST",
          body: { username: username, pass_hash: h, role: username === "admin" ? "admin" : "user" },
          prefer: "return=representation"
        });
      });
    }).then(function () {
      return login(username, password);
    });
  }

  function login(username, password) {
    if (!ready()) return Promise.reject(new Error("后端未配置，无法登录"));
    return hash(username, password).then(function (h) {
      return req("study_users?username=eq." + enc(username) + "&pass_hash=eq." + h + "&select=username,role");
    }).then(function (rows) {
      if (!rows || !rows.length) throw new Error("账号或密码不正确");
      session = { username: rows[0].username, role: rows[0].role || "user" };
      saveSession(); emit();
      // 记录登录时间
      req("study_users?username=eq." + enc(session.username), { method: "PATCH", body: { last_login: new Date().toISOString() } }).catch(function () {});
      logEvent({ kind: "login" });
      startHeartbeat();
      return session;
    });
  }

  function logout() {
    stopHeartbeat();
    flushActive(true);
    session = null; saveSession(); emit();
  }

  /* ---------- 数据同步 ---------- */
  function pullData() {
    if (!ready() || !session) return Promise.resolve(null);
    return req("study_data?username=eq." + enc(session.username) + "&select=data").then(function (rows) {
      if (rows && rows.length && rows[0].data && Object.keys(rows[0].data).length) return rows[0].data;
      return null;
    });
  }

  function pushDataNow(data) {
    if (!ready() || !session) return Promise.resolve(false);
    return req("study_data", {
      method: "POST",
      body: { username: session.username, data: data, updated_at: new Date().toISOString() },
      prefer: "resolution=merge-duplicates,return=representation"
    }).then(function () { lastSyncAt = Date.now(); return true; })
      .catch(function () { return false; });
  }

  /** 防抖同步：频繁保存时只在最后一次真正上传 */
  function pushData(data, immediate) {
    if (!ready() || !session) return;
    pendingData = data;
    if (immediate) {
      if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
      doFlush();
      return;
    }
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(doFlush, 1500);
  }
  function doFlush() {
    syncTimer = null;
    if (!pendingData || syncing || !session) return;
    syncing = true;
    var d = pendingData; pendingData = null;
    pushDataNow(d).then(function () { syncing = false; if (pendingData) doFlush(); },
      function () { syncing = false; });
  }

  /* ---------- 埋点 ---------- */
  function logEvent(ev) {
    if (!ready() || !session) return Promise.resolve(false);
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, "0"); };
    var date = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    return req("study_events", {
      method: "POST",
      body: {
        username: session.username,
        date: date,
        kind: ev.kind || "misc",
        subject: ev.subject || null,
        qcount: ev.qcount || 0,
        correct: ev.correct || 0,
        score: (ev.score === undefined || ev.score === null) ? null : ev.score,
        duration_ms: ev.duration_ms || 0,
        meta: ev.meta || null
      },
      prefer: "return=representation"
    }).then(function () { return true; }).catch(function () { return false; });
  }

  /* ---------- 活跃时长（页面是否持续活动） ---------- */
  var ACT = { acc: 0, timer: null, lastBeat: 0, lastAct: 0, started: false };
  function markActive() { ACT.lastAct = Date.now(); }
  function isActive() {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
    return (Date.now() - ACT.lastAct) < 3 * 60 * 1000;   // 3 分钟内有交互视为在用
  }
  function startHeartbeat() {
    if (ACT.started) return;
    ACT.started = true; ACT.lastAct = Date.now(); ACT.lastBeat = Date.now();
    ["mousemove", "keydown", "touchstart", "scroll", "click"].forEach(function (e) {
      window.addEventListener(e, markActive, { passive: true });
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") markActive();
    });
    ACT.timer = setInterval(function () {
      if (isActive()) ACT.acc += 1000;
      if (Date.now() - ACT.lastBeat >= 60000) flushActive();
    }, 1000);
  }
  function stopHeartbeat() {
    if (ACT.timer) { clearInterval(ACT.timer); ACT.timer = null; }
    ACT.started = false;
  }
  function flushActive(force) {
    if (!ACT.acc && !force) return;
    if (ACT.acc < 5000 && !force) return;    // 少于 5 秒不记，减少噪音
    var ms = ACT.acc; ACT.acc = 0; ACT.lastBeat = Date.now();
    if (ms > 0) logEvent({ kind: "active", duration_ms: ms });
  }
  /** 给 UI 显示「本次已用时长」 */
  function activeSeconds() { return Math.round(ACT.acc / 1000); }

  /* ---------- 管理员 ---------- */
  function adminOverview() {
    if (!ready() || !session || session.role !== "admin") return Promise.reject(new Error("无管理员权限"));
    return Promise.all([
      req("study_users?select=username,role,created_at,last_login&order=last_login.desc.nullslast"),
      req("study_events?select=username,ts,date,kind,subject,qcount,correct,score,duration_ms&order=ts.desc&limit=5000")
    ]).then(function (r) { return { users: r[0] || [], events: r[1] || [] }; });
  }

  restoreSession();
  if (session) startHeartbeat();

  return {
    ready: ready, on: on, current: current, register: register, login: login, logout: logout,
    pullData: pullData, pushData: pushData, logEvent: logEvent,
    activeSeconds: activeSeconds, adminOverview: adminOverview,
    lastSyncAt: function () { return lastSyncAt; },
    isAdmin: function () { return !!(session && session.role === "admin"); }
  };
})();
