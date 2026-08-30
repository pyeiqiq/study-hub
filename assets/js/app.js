/* 我刷题你炸了？ —— 纯静态单页应用（高中生理科学习平台）
   状态存 localStorage，跨端用「导出/导入 JSON」同步；AI 助手浏览器直连大模型（key 存本地）。
*/
(function () {
  "use strict";

  var SEED = window.SEED;
  var KEY = "studyHub:v1";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var view = $("#view");

  /* ---------- utils ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(str, n) { var d = new Date(str); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function fmtDate(str) { return str.slice(5).replace("-", "/"); }
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.add("hidden"); }, 2200);
  }
  function subj(id) { return SEED.subjects.find(function (s) { return s.id === id; }); }
  function chapOf(subject, cid) { var m = SEED.map[subject] || []; return m.find(function (c) { return c.id === cid; }); }
  function kpOf(subject, kid) {
    var m = SEED.map[subject] || [];
    for (var i = 0; i < m.length; i++) { var k = (m[i].kps || []).find(function (x) { return x.id === kid; }); if (k) return k; }
    return null;
  }
  function allKps(subject) {
    var out = []; (SEED.map[subject] || []).forEach(function (c) { (c.kps || []).forEach(function (k) { out.push({ chap: c, kp: k }); }); }); return out;
  }
  // 题目来源 = 种子题库 ∪ 固化的用户题库(SEED_EXTRA) ∪ 浏览器本地题库(去重)
  function allQuestions() {
    var seed = SEED.questions.concat(window.SEED_EXTRA || []);
    var seen = {}; seed.forEach(function (q) { seen[q.id] = 1; });
    var user = state.userQuestions || [];
    var clean = [];
    for (var i = 0; i < user.length; i++) { if (!seen[user[i].id]) { seen[user[i].id] = 1; clean.push(user[i]); } }
    return seed.concat(clean);
  }
  function kpQCount() { var m = {}; allQuestions().forEach(function (q) { m[q.kp] = (m[q.kp] || 0) + 1; }); return m; }
  function subjQCount() { var m = {}; allQuestions().forEach(function (q) { m[q.subject] = (m[q.subject] || 0) + 1; }); return m; }
  function chapterOfKp(subject, kpId) {
    var m = SEED.map[subject] || [];
    for (var i = 0; i < m.length; i++) { if ((m[i].kps || []).some(function (k) { return k.id === kpId; })) return m[i].id; }
    return "";
  }

  /* ---------- state ---------- */
  function defaultState() {
    return {
      progress: {}, wrong: [], notes: [], favFormulas: [], favKp: [], plans: [], log: [],
      qstats: {},
      userQuestions: [],
      settings: { theme: "light", ai: { endpoint: "", key: "", model: "" }, pomodoro: { focus: 25, break: 5 }, quizCount: 5 }
    };
  }
  var state = load();
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.settings) {
        // 合并默认结构，补齐升级后新增的字段（如 qstats / settings.quizCount），避免旧数据缺字段导致崩溃
        var d = defaultState();
        for (var k in d) if (!(k in s)) s[k] = d[k];
        for (var sk in d.settings) if (!(sk in s.settings)) s.settings[sk] = d.settings[sk];
        return s;
      }
    } catch (e) {}
    return defaultState();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("保存失败：" + e.message); } }

  /* ---------- ai presets ---------- */
  var AI_PRESETS = {
    "OpenAI": { endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
    "DeepSeek": { endpoint: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat" },
    "Moonshot": { endpoint: "https://api.moonshot.cn/v1/chat/completions", model: "moonshot-v1-8k" },
    "自定义": { endpoint: "", model: "" }
  };

  /* ---------- 练习称号 + 鼓励/夸奖文案 ---------- */
  // 每 10% 一个档的称号（炸系主题，呼应「我刷题你炸了？」）
  var QUIZ_TITLES = [
    "炸毛萌新",     // 0-9%
    "摸鱼学徒",     // 10-19%
    "半梦半醒",     // 20-29%
    "青铜战士",     // 30-39%
    "白银打手",     // 40-49%
    "黄金选手",     // 50-59%
    "铂金学霸",     // 60-69%
    "钻石尖子",     // 70-79%
    "星耀学神",     // 80-89%
    "王者做题家",   // 90-99%
    "满血炸天·全能学神" // 100%
  ];
  // 老爸（老大）对女儿琪的关心 / 鼓励
  var ENCOURAGE_CARE = [
    "琪琪，错了不怕，老爸当年也炸过，慢慢来，饭要一口一口吃。",
    "琪，先喝口水再战，脑子也需要充电，别硬扛。",
    "这波失误正常，咱把错题本翻出来温一温，明天又是好汉。",
    "琪宝，正确率不重要，重要的是你又比昨天多会了一点点。",
    "老爸给你点了份外卖式鼓励：下次这题你肯定秒杀它。",
    "别急，题目是用来练手的，不是用来证明你行不行的。",
    "琪，累了就歇会儿，刷题如跑马拉松，节奏稳才到终点。",
    "错几道而已，老爸的肩膀随时借你靠，哭完接着刷。",
    "琪琪，这题坑不少，能发现坑就是本事，记下来。",
    "今天状态一般？没事，老爸当年模拟考还考过倒数呢。",
    "琪，先把会的做稳，难的咱一点点啃，不丢人。",
    "老爸看了都想拍拍你肩膀：能坐下来刷题，你就已经赢了懒虫。",
    "别跟别人比，跟昨天的自己比，琪你一直在涨。",
    "琪宝，这分数老爸不嫌，嫌的是你没睡够还硬撑。",
    "刷题累了来找老爸聊五分钟，充个电再上。",
    "琪，错误是大脑的肥料，越错越聪明，真的。",
    "老爸给你记着：今天这关过了，回头你就是讲题的那个。",
    "琪琪，别慌，先把题干读三遍，很多坑是自己跳进去的。",
    "这分儿先收着，等周末老爸带你吃顿好的犒劳。",
    "琪，咱们目标不是满分，是别在同一坑里摔两次。",
    "老爸在线陪练中，错多少都陪你刷到会为止。",
    "琪宝，深呼吸，放松的大脑才装得下知识。",
    "这题以前老爸也栽过，咱俩算「同坑父子」了哈。",
    "琪，先保证睡眠，脑子清醒比多刷十道都管用。",
    "老爸说句实话：你比大多数同龄人都舍得下功夫。",
    "琪琪，卡住了就跳，别跟一道题死磕到怀疑人生。",
    "这波没发挥好，老爸当你的啦啦队长，下把翻盘。",
    "琪，错题不是丢脸，是老天给你发的「专属提分券」。",
    "老爸给你泡了杯茶（虚拟的），歇会儿，咱不急。",
    "琪宝，进步是螺旋上升的，今天的低谷是明天的跳板。",
    "别怕错，老爸当年错题本比课本还厚，照样混出来了。",
    "琪，把「我不会」换成「我还没会」，语气一变运气就变。",
    "老爸在线：这分儿先存着，等攒够经验值一起兑换。",
    "琪琪，先给自己鼓个掌，能坚持刷到现在就不容易。",
    "这题偏难，老爸陪你拆解，拆完它就没那么吓人了。",
    "琪，分数随它去，你的好奇心才是最值钱的资产。",
    "老爸提醒：喝水、眨眼、伸懒腰，身体是刷题的本钱。",
    "琪宝，慢慢来，快就是慢，稳才是真的快。",
    "老爸给你点个赞（隔空），能正视错题的孩子最飒。",
    "琪，今天先到这，明天老爸陪你一起把坑填平。"
  ];
  // 大夸特夸
  var ENCOURAGE_PRAISE = [
    "琪琪你是真的强，这正确率看得老爸想鼓掌三分钟！",
    "满分预备役！你这脑子是用来封神的。",
    "琪，你这正确率，隔壁学霸都要来拜师了。",
    "这波操作行云流水，老爸怀疑你是不是偷偷开了挂。",
    "琪宝，你就是传说中「刷题界的隐藏 BOSS」。",
    "稳如老狗（夸你哦），这正确率教科书级别。",
    "琪，你这水平，高考那点儿题也就是热身。",
    "这一套下来，老爸觉得你离学神只差一个称号了。",
    "琪琪，你这正确率，出题老师看了都得愣一下。",
    "炸了！你这脑子怎么长的，老爸实名羡慕。",
    "琪，保持这个节奏，清北的门槛都要被你踏平了。",
    "这题秒答的快感，就是你努力的回响，爽不爽？",
    "琪宝，你这状态，直接去当小老师带同学吧。",
    "老爸给你颁个「今日最飒奖」，实至名归。",
    "琪，这正确率，你的名字应该写进家里的光荣榜。",
    "你这不是刷题，是碾压，老爸看得热血沸腾。",
    "琪琪，保持住，你正在把「不可能」变成「已掌握」。",
    "这波秀得老爸头皮发麻，你真的是天生学霸料。",
    "琪，你的正确率曲线，比股票涨得还让人安心。",
    "满分气质拿捏得死死的，老爸给你双击 666。",
    "琪宝，你这水平，以后出题都轮不到难住你。",
    "这正确率，老爸只想说一句：后生可畏，后生可畏。",
    "琪，你今天的表现，值得在家族群被公开表扬。",
    "刷题如你，已是降维打击，老爸自愧不如。",
    "琪琪，你这脑子转得，老爸都快跟不上了。",
    "这波稳赢，你的名字就是「正确率」的代名词。",
    "琪，继续保持，你正在书写属于你的逆袭剧本。",
    "老爸确认：你就是家里这一代的最强大脑。",
    "琪宝，这正确率，建议你出本《琪式解题秘籍》。",
    "你这状态，老爸恨不得给你拉个横幅：琪琪牛逼！",
    "琪，你每多对一道，老爸的骄傲就多涨一格。",
    "这题你答得，老爸都想抄你作业（虽然没用）。",
    "琪琪，你这正确率，妥妥的「别人家的孩子」本孩。",
    "保持手感，你离「封神榜」就差最后几道题。",
    "琪，你今天的气场，出题人都要退避三舍。",
    "你这水平，老爸只想说：长江后浪拍前浪，拍得真响。",
    "琪琪，保持这个正确率，你就是行走的题库粉碎机。",
    "这波表现，老爸给你封为「本日解题大将军」。",
    "琪，你的努力老爸都看在眼里，今天就一个字：绝。",
    "你这不是练习，是表演，老爸鼓掌到手红。",
    "琪宝，你这正确率，建议直接保送老爸的骄傲榜。",
    "老爸确认无误：你就是家里冉冉升起的学术新星。",
    "琪，你每刷一道都对，老爸的嘴角就上扬一度。",
    "这题你答得行云流水，老爸怀疑你偷看了答案（并没有）。",
    "琪琪，你这状态，高考考场都要被你当成主场。",
    "稳得一批（夸你），老爸给你点满十个赞。",
    "琪，你这正确率，已经不是学霸是「学圣」了。",
    "老爸看得热血上头：我家琪琪就是这么顶！",
    "琪宝，继续保持，你正在把天赋变成实力。",
    "你这表现，老爸想发朋友圈：吾家有女初长成（炸题版）。",
    "琪，你今天的正确率，值得刻进家里的荣誉墙。",
    "这波输出爆炸，老爸给你封号「炸题女王/国王」。",
    "琪琪，你这水平，老爸只想说：青出于蓝而胜于蓝。",
    "保持住，你正在用正确率告诉世界你是谁。",
    "琪，你这表现，老爸的骄傲已经溢出了屏幕。",
    "今日最佳非你莫属，老爸实名认证：琪琪=正确率收割机。",
    "琪，就这正确率，老爸决定把「全家最聪明」的奖杯颁给你。",
    "你这波表现，老爸已经在心里给你放烟花庆祝了。",
    "琪琪，别停，你正在把「会做」升级成「秒杀」。",
    "这正确率，老爸只能用四个字形容：泰裤辣！"
  ];
  function quizTitle(r) { var i = Math.max(0, Math.min(10, Math.floor(r / 10))); return QUIZ_TITLES[i]; }
  function quizFlavor(r) {
    var pool;
    if (r < 50) pool = ENCOURAGE_CARE.concat(ENCOURAGE_PRAISE.slice(0, 10));      // 偏低：偏关心鼓励
    else if (r < 80) pool = ENCOURAGE_CARE.concat(ENCOURAGE_PRAISE);              // 中等：混合
    else pool = ENCOURAGE_PRAISE.concat(ENCOURAGE_CARE.slice(0, 15));            // 偏高：偏夸奖
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ---------- icons ---------- */
  var ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h7v15H4zM13 5h7v15h-7z"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    fx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 19c4 0 4-14 8-14M14 5h4M14 19h4"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><circle cx="18.5" cy="17.5" r="2"/><circle cx="5.5" cy="17.5" r="2"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>'
  };
  var NAV = [
    { id: "home", label: "首页", icon: "home" },
    { id: "map", label: "知识地图", icon: "book" },
    { id: "quiz", label: "题库练习", icon: "list" },
    { id: "wrong", label: "错题本", icon: "x" },
    { id: "formula", label: "公式速查", icon: "fx" },
    { id: "plan", label: "学习计划", icon: "cal" },
    { id: "stats", label: "数据看板", icon: "chart" },
    { id: "ai", label: "AI 助手", icon: "ai" },
    { id: "settings", label: "设置", icon: "gear" }
  ];
  var BOTTOM = ["home", "map", "quiz", "wrong", "more"];

  /* ---------- router ---------- */
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, "");
    var q = h.indexOf("?"), path = h, params = {};
    if (q >= 0) { path = h.slice(0, q); var ps = new URLSearchParams(h.slice(q + 1)); ps.forEach(function (v, k) { params[k] = v; }); }
    return { view: path || "home", params: params };
  }
  function navigate(v, params) {
    var h = "#/" + v; if (params) { var k = Object.keys(params); if (k.length) { h += "?" + k.map(function (x) { return x + "=" + encodeURIComponent(params[x]); }).join("&"); } }
    if (location.hash === h) render(); else location.hash = h;
  }
  function render() {
    var r = parseHash();
    document.querySelectorAll(".nav-item").forEach(function (a) {
      a.classList.toggle("active", a.dataset.view === r.view);
    });
    $("#crumb").textContent = (NAV.find(function (n) { return n.id === r.view; }) || {}).label || "";
    closeSheet();
    var map = { home: viewHome, map: viewMap, quiz: viewQuiz, wrong: viewWrong, formula: viewFormula, plan: viewPlan, stats: viewStats, ai: viewAI, settings: viewSettings };
    (map[r.view] || viewHome)(r.params);
    var curPath = location.hash.replace(/^#\/?/, "").split("?")[0];
    if (curPath !== r.view) location.hash = "#/" + r.view;
    window.scrollTo(0, 0);
  }

  /* ================= VIEWS ================= */

  function viewHome() {
    var t = todayStr();
    var plans = state.plans.filter(function (p) { return p.date === t; });
    var done = plans.filter(function (p) { return p.done; }).length;
    var todayMin = (state.log.filter(function (l) { return l.date === t; })).reduce(function (a, l) { return a + (l.minutes || 0); }, 0);
    var weekQ = (state.log.filter(function (l) { return l.date >= addDays(t, -6); })).reduce(function (a, l) { return a + (l.qCount || 0); }, 0);
    var streak = calcStreak();
    var html = "";
    html += '<h1 class="page-title">嗯？睡前刷两题</h1>';
    html += '<p class="page-sub">' + todayStr() + ' · 距离高考还有很长的路，一步一步来</p>';
    html += '<div class="grid cols-4">';
    html += statCard("今日学习", todayMin + " 分", "blue");
    html += statCard("连续打卡", streak + " 天", "gold");
    html += statCard("错题本", state.wrong.length + " 道", "");
    html += statCard("本周题量", weekQ + " 题", "");
    html += "</div>";
    html += '<div class="section-title">科目入口</div>';
    html += '<div class="grid cols-3">';
    SEED.subjects.forEach(function (s) {
      var cnt = allKps(s.id).length;
      html += '<a class="card" href="#/map?subject=' + s.id + '" style="display:block;text-decoration:none;color:inherit">'
        + '<div class="flex between"><div class="flex"><span class="dot" style="background:' + s.color + '"></span><b>' + s.name + '</b></div>'
        + (s.science ? '' : '<span class="tag">轻量</span>') + '</div>'
        + '<div class="small muted" style="margin-top:6px">' + cnt + ' 个知识点</div></a>';
    });
    html += "</div>";
    html += '<div class="section-title">今日计划 <a class="ghost btn sm" href="#/plan">去安排</a></div>';
    if (plans.length === 0) html += '<div class="muted small">还没有今日计划，去「学习计划」添加吧。</div>';
    else {
      plans.forEach(function (p) {
        html += '<div class="row"><label class="q-opt" style="margin:0;display:flex;align-items:center;gap:10px;flex:1;cursor:pointer">'
          + '<input type="checkbox" data-act="plancheck" data-id="' + p.id + '" ' + (p.done ? "checked" : "") + ' style="width:auto">'
          + '<span class="' + (p.done ? "muted" : "") + '" style="text-decoration:' + (p.done ? "line-through" : "none") + '">' + esc(p.text) + '</span></label></div>';
      });
    }
    html += '<div class="grid cols-2" style="margin-top:18px">'
      + '<a class="card" href="#/quiz" style="color:inherit;text-decoration:none"><b>开始刷题</b><div class="small muted">按知识点组卷练习</div></a>'
      + '<a class="card" href="#/ai" style="color:inherit;text-decoration:none"><b>问问 AI</b><div class="small muted">错题诊断 / 知识点讲解</div></a>'
      + '</div>';
    view.innerHTML = html;
  }
  function statCard(lbl, num, cls) {
    return '<div class="stat ' + (cls || "") + '"><div class="num">' + num + '</div><div class="lbl">' + lbl + "</div></div>";
  }
  function calcStreak() {
    var days = {}; state.log.forEach(function (l) { if (l.minutes > 0 || l.qCount > 0) days[l.date] = 1; });
    state.plans.forEach(function (p) { if (p.done) days[p.date] = 1; });
    var s = 0, d = todayStr();
    while (days[d]) { s++; d = addDays(d, -1); }
    return s;
  }

  function viewMap(params) {
    var sel = params.subject || SEED.subjects[0].id;
    var html = "";
    html += '<h1 class="page-title">知识地图</h1>';
    html += '<p class="page-sub">按科目梳理体系，点击知识点标记掌握度、收藏或去练习</p>';
    html += subjectChips(sel, "map");
    html += '<div class="field"><input id="mapSearch" placeholder="搜索知识点 / 关键词" value="' + esc(mapQ) + '"></div>';
    html += '<div id="mapResults"></div>';
    view.innerHTML = html;
    renderMapResults(sel);
    var s = $("#mapSearch");
    if (s) {
      var composing = false;
      s.addEventListener("compositionstart", function () { composing = true; });
      s.addEventListener("compositionend", function () { composing = false; renderMapResults(sel); });
      s.oninput = function () { if (composing) return; renderMapResults(sel); };
    }
  }
  function renderMapResults(sel) {
    var s = $("#mapSearch"); if (!s) return;
    mapQ = s.value;
    var q = mapQ.trim().toLowerCase();
    var list = allKps(sel);
    if (q) list = list.filter(function (o) { return (o.kp.name + o.kp.concept + (o.kp.formula || "") + (o.kp.pit || "")).toLowerCase().indexOf(q) >= 0; });
    var box = $("#mapResults"); if (!box) return;
    if (list.length === 0) { box.innerHTML = '<div class="muted">该科目暂无匹配内容。</div>'; return; }
    var curChap = null, h = "";
    list.forEach(function (o) {
      if (o.chap.id !== curChap) { curChap = o.chap.id; h += '<div class="section-title">' + esc(o.chap.name) + "</div>"; }
      h += kpCard(sel, o.chap, o.kp);
    });
    box.innerHTML = h;
  }
  function kpCard(subject, chap, kp) {
    var lvl = state.progress[kp.id] || 0;
    var fav = state.favKp.indexOf(kp.id) >= 0;
    var lvTxt = ["未学", "了解", "熟悉", "掌握"][lvl];
    var html = '<div class="kp">';
    html += '<div class="flex between"><h4>' + esc(kp.name) + '</h4>'
      + '<span class="pill l' + lvl + '" style="cursor:pointer" data-act="mlevel" data-kp="' + kp.id + '" data-subject="' + subject + '">' + lvTxt + "</span></div>";
    html += '<div class="body">' + esc(kp.concept) + "</div>";
    if (kp.formula) html += '<div class="formula">' + esc(kp.formula) + "</div>";
    if (kp.pit) html += '<div class="pit">易错：' + esc(kp.pit) + "</div>";
    if (kp.example) html += '<div class="small muted">例：' + esc(kp.example) + "</div>";
    html += '<div class="acts">'
      + '<button class="btn sm" data-act="favkp" data-kp="' + kp.id + '">' + (fav ? "★ 已收藏" : "☆ 收藏") + "</button>"
      + '<a class="btn sm" href="#/quiz?subject=' + subject + "&kp=" + kp.id + '">去练习</a>'
      + '<button class="btn sm ghost" data-act="aiExplain" data-subject="' + subject + '" data-kp="' + kp.id + '">AI 讲解</button>'
      + "</div></div>";
    return html;
  }

  var QZ = null;
  var mapQ = "", formulaQ = "";
  function viewQuiz(params) {
    var selSubject = params.subject || SEED.subjects[0].id;
    if (!QZ) {
      var kpc = kpQCount(), ssc = subjQCount();
      var total = allQuestions().length, userN = (state.userQuestions || []).length;
      var html = '<h1 class="page-title">题库练习</h1><p class="page-sub">选择范围开始练习，客观题自动判分，错题自动进入错题本</p>';
      html += subjectChips(selSubject, "quiz", function (id) { return ssc[id] || 0; });
      var selChap = params.chap || "", selKp = params.kp || "";
      var chapOpts = (SEED.map[selSubject] || []).map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === selChap ? " selected" : "") + ">" + esc(c.name) + "</option>";
      }).join("");
      var kpList = selChap ? allKps(selSubject).filter(function (o) { return o.chap.id === selChap; }) : allKps(selSubject);
      var kpOpts = kpList.map(function (o) {
        return '<option value="' + o.kp.id + '"' + (o.kp.id === selKp ? " selected" : "") + ">" + esc(o.kp.name) + "（" + (kpc[o.kp.id] || 0) + "题）</option>";
      }).join("");
      html += '<div class="field"><label>章节</label><select id="qChap"><option value="">全部章节</option>' + chapOpts + "</select></div>";
      html += '<div class="field"><label>知识点（可选，括号为当前题数；选定章节后仅显示该章节下知识点）</label><select id="qKp"><option value="">不限</option>' + kpOpts + "</select></div>";
      html += '<div class="field"><label>练习题数</label><select id="qCount">'
        + [5, 10, 20, 30, 50].map(function (n) { return '<option value="' + n + '"' + (n === (state.settings.quizCount || 5) ? " selected" : "") + ">" + n + " 题</option>"; }).join("") + "</select></div>";
      html += '<button class="btn primary" data-act="quizStart" data-subject="' + selSubject + '">开始练习</button>';
      html += '<div class="small muted" style="margin-top:14px">当前题库共 <b>' + total + "</b> 道（含你生成/导入 " + userN + " 道）。选了某知识点却提示「暂无题目」，说明该点题量不足，可下方用 AI 生成补全。</div>";
      // AI 生成 + 用户题库管理
      html += '<div class="card" style="margin-top:16px"><div class="section-title" style="margin-top:0">🤖 AI 生成题目（针对「' + esc((subj(selSubject) || {}).name) + '"）</div>';
      html += '<div class="field"><label>知识点（留空=从该科范围随机）</label><select id="genKp"><option value="">随机</option>'
        + allKps(selSubject).map(function (o) { return '<option value="' + o.kp.id + '">' + esc(o.kp.name) + "（" + (kpc[o.kp.id] || 0) + "题）</option>"; }).join("") + "</select></div>";
      html += '<div class="field"><label>生成数量</label><select id="genN"><option>20</option><option>50</option><option>100</option><option>200</option></select></div>';
      html += '<button class="btn" data-act="genRun" data-subject="' + selSubject + '">生成并加入题库</button>';
      html += '<div id="genOut" class="small" style="margin-top:10px;white-space:pre-wrap"></div></div>';
      html += '<div class="flex wrap" style="gap:10px;margin-top:12px"><button class="btn" data-act="importQ">导入题库文件</button><button class="btn" data-act="exportQ">导出我的题库（' + userN + '）</button></div>';
      view.innerHTML = html;
      $("#qChap").onchange = function () { navigate("quiz", { subject: selSubject, chap: this.value, kp: "" }); };
      $("#qKp").onchange = function () { navigate("quiz", { subject: selSubject, chap: selChap, kp: this.value }); };
      return;
    }
    renderQuizCard();
  }
  function startQuiz(subject, chap, kp, count) {
    var items = allQuestions().filter(function (q) {
      if (q.subject !== subject) return false;
      if (chap && q.chapter !== chap) return false;
      if (kp && q.kp !== kp) return false;
      return true;
    });
    if (items.length === 0) { toast("该范围暂无题目，换一个范围试试"); return; }
    var want = count || state.settings.quizCount || 5;
    if (items.length < want) toast("当前范围只有 " + items.length + " 题，已全量练习");
    var picked = weightedPick(items, Math.min(want, items.length));
    QZ = { items: picked, i: 0, chosen: null, revealed: false, correct: 0, wrong: [], answers: [] };
    renderQuizCard();
  }
  // 加权随机抽题：常做对的题权重低、常错的题权重高，使练习更有针对性
  function weightedPick(items, n) {
    var pool = items.slice(), chosen = [];
    while (chosen.length < n && pool.length) {
      var weights = pool.map(function (q) {
        var st = (state.qstats || {})[q.id] || { correct: 0, wrong: 0 };
        var w = (1 + (st.wrong || 0) * 2) / (1 + (st.correct || 0));
        return Math.max(0.05, w);
      });
      var total = weights.reduce(function (a, b) { return a + b; }, 0);
      var r = Math.random() * total, acc = 0, idx = 0;
      for (; idx < weights.length; idx++) { acc += weights[idx]; if (r <= acc) break; }
      if (idx >= weights.length) idx = weights.length - 1;
      chosen.push(pool[idx]); pool.splice(idx, 1);
    }
    return chosen;
  }
  function renderQuizCard() {
    if (!QZ) { render(); return; }
    var q = QZ.items[QZ.i];
    var ai = state.settings.ai;
    var html = '<h1 class="page-title">练习中</h1>';
    html += '<div class="flex between small muted" style="margin-bottom:10px"><span>第 ' + (QZ.i + 1) + " / " + QZ.items.length + " 题</span><span>已对 " + QZ.correct + "</span></div>";
    html += '<div class="quiz-layout">';
    /* 左侧：题目卡片 */
    html += '<div class="quiz-main">';
    html += '<div class="q-card"><div style="font-weight:500;margin-bottom:12px">' + esc(q.q) + "</div>";
    q.options.forEach(function (opt, i) {
      var cls = "q-opt";
      if (QZ.revealed) { if (i === q.answer) cls += " right"; else if (i === QZ.chosen) cls += " wrong"; }
      else if (i === QZ.chosen) cls += " sel";
      html += '<div class="' + cls + '" ' + (QZ.revealed ? "" : 'data-act="qopt" data-i="' + i + '"') + ">" + String.fromCharCode(65 + i) + ". " + esc(opt) + "</div>";
    });
    if (QZ.revealed) {
      html += '<div class="small ' + (QZ.chosen === q.answer ? "" : "muted") + '" style="margin-top:10px">' + (QZ.chosen === q.answer ? "✓ 回答正确" : (QZ.chosen === null ? "ⓘ 本题未作答（已显示答案）" : "✗ 正确答案：" + String.fromCharCode(65 + q.answer))) + "</div>";
      html += '<div class="small muted" style="margin-top:4px">解析：' + esc(q.explain) + "</div>";
    }
    html += "</div>";
    html += '<div class="flex" style="margin-top:14px;gap:10px;flex-wrap:wrap">';
    if (!QZ.revealed) {
      html += '<button class="btn primary" data-act="qsubmit">提交</button>';
      html += '<button class="btn" data-act="qskip">下一题</button>';
      html += '<button class="btn" data-act="qreveal">答案</button>';
    } else if (QZ.i < QZ.items.length - 1) {
      html += '<button class="btn primary" data-act="qnext">下一题</button>';
    } else {
      html += '<button class="btn primary" data-act="qfinish">查看结果</button>';
    }
    html += '<button class="btn" data-act="qcopy" style="margin-left:auto">复制题目</button>';
    html += '<button class="btn" data-act="qresult">查看结果</button>';
    html += '<button class="btn" data-act="quizExit">退出</button></div>';
    html += "</div>";
    /* 右侧：AI 讲解面板 */
    html += '<aside class="quiz-ai"><div class="card" style="position:sticky;top:72px">';
    html += '<div class="section-title" style="margin:0 0 8px">AI 讲解</div>';
    if (!ai.key) {
      html += '<div class="small muted">尚未配置 AI Key。去「设置」的「AI 接入设置」填写后，这里可一键讲解本题。</div>';
    } else {
      html += '<div class="small muted" id="quizAiHint">' + (QZ.revealed ? "点击下方按钮，让 AI 用通俗的话讲解这道题。" : "交卷后可用 AI 讲解本题。") + "</div>";
      html += '<button class="btn primary" style="margin-top:8px;width:100%" data-act="quizExplain"' + (QZ.revealed ? "" : " disabled") + '>AI 讲解这道题</button>';
      html += '<div id="quizAiOut" class="small" style="margin-top:12px;white-space:pre-wrap"></div>';
    }
    html += "</div></aside>";
    html += "</div>";
    view.innerHTML = html;
  }

  function viewWrong() {
    var html = '<h1 class="page-title">错题本</h1><p class="page-sub">自动归集做错的题，按艾宾浩斯间隔复习；点「重做」自我评估</p>';
    if (state.wrong.length === 0) { html += '<div class="card muted center">还没有错题。去题库练一练，做错的会自动出现在这里。</div>'; view.innerHTML = html; return; }
    var subjFilter = $("#wsubj") ? $("#wsubj").value : "";
    var list = state.wrong.slice().sort(function (a, b) { return (a.nextReview < b.nextReview ? -1 : 1); });
    if (subjFilter) list = list.filter(function (w) { return w.subject === subjFilter; });
    html += '<div class="field"><select id="wsubj"><option value="">全部科目</option>' + SEED.subjects.map(function (s) { return '<option value="' + s.id + '">' + s.name + "</option>"; }).join("") + "</select></div>";
    list.forEach(function (w) {
      var due = w.nextReview <= todayStr();
      html += '<div class="card" style="margin-bottom:10px">';
      html += '<div class="flex between"><span class="tag blue">' + esc((subj(w.subject) || {}).name || w.subject) + '</span>'
        + '<span class="tag ' + (due ? "gold" : "") + '">' + (due ? "今天该复习" : "下次 " + fmtDate(w.nextReview)) + "</span></div>";
      html += '<div style="margin:8px 0;font-weight:500">' + esc(w.question) + "</div>";
      html += '<div class="small">我的答案：<span class="muted">' + esc(w.myAnswer) + '</span>　正确：<span style="color:var(--ok)">' + esc(w.correctAnswer) + "</span></div>";
      if (w.reason) html += '<div class="small" style="color:var(--danger)">错因：' + esc(w.reason) + "</div>";
      html += '<div class="acts" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">'
        + '<button class="btn sm" data-act="wredo" data-id="' + w.id + '">重做</button>'
        + '<button class="btn sm ghost" data-act="wreason" data-id="' + w.id + '">改错因</button>'
        + '<button class="btn sm ghost" data-act="wai" data-id="' + w.id + '">AI 诊断</button>'
        + '<button class="btn sm ghost" data-act="wdel" data-id="' + w.id + '">删除</button></div>';
      html += "</div>";
    });
    view.innerHTML = html;
    $("#wsubj").onchange = function () { render(); };
  }

  function viewFormula(params) {
    var sel = params.subject || "all";
    var html = '<h1 class="page-title">公式速查</h1><p class="page-sub">分科公式手册，可搜索、可收藏、可复制</p>';
    html += '<div class="flex wrap" style="gap:8px;margin-bottom:10px">';
    html += '<button class="chip" data-act="fsubj" data-s="all" style="' + (sel === "all" ? "border-color:var(--primary);color:var(--primary)" : "") + '">全部</button>';
    SEED.subjects.forEach(function (s) { html += '<button class="chip" data-act="fsubj" data-s="' + s.id + '" style="' + (sel === s.id ? "border-color:" + s.color + ";color:" + s.color : "") + '"><span class="dot" style="background:' + s.color + '"></span>' + s.name + "</button>"; });
    html += "</div>";
    html += '<div class="field"><input id="fSearch" placeholder="搜索公式 / 名称" value="' + esc(formulaQ) + '"></div>';
    html += '<div id="fResults"></div>';
    view.innerHTML = html;
    renderFormulaResults(sel);
    var s = $("#fSearch");
    if (s) {
      var composing = false;
      s.addEventListener("compositionstart", function () { composing = true; });
      s.addEventListener("compositionend", function () { composing = false; renderFormulaResults(sel); });
      s.oninput = function () { if (composing) return; renderFormulaResults(sel); };
    }
  }
  function renderFormulaResults(sel) {
    var s = $("#fSearch"); if (!s) return;
    formulaQ = s.value;
    var q = formulaQ.trim().toLowerCase();
    var list = SEED.formulas.filter(function (f) { if (sel !== "all" && f.subject !== sel) return false; if (q && (f.name + f.expr + f.note + (subj(f.subject) || {}).name).toLowerCase().indexOf(q) < 0) return false; return true; });
    var box = $("#fResults"); if (!box) return;
    if (list.length === 0) { box.innerHTML = '<div class="muted">无匹配公式。</div>'; return; }
    var h = "";
    list.forEach(function (f) {
      var fav = state.favFormulas.indexOf(f.id) >= 0;
      h += '<div class="row"><div class="grow"><div class="title">' + esc(f.name) + ' <span class="small muted">' + esc((subj(f.subject) || {}).name) + " / " + esc(f.cat) + '</span></div>'
        + '<div class="formula" style="background:var(--surface-2);border-radius:6px;padding:6px 8px;font-family:serif;margin-top:4px">' + esc(f.expr) + (f.note ? ' <span class="small muted">（' + esc(f.note) + "）</span>" : "") + '</div></div>'
        + '<button class="btn sm" data-act="favf" data-id="' + f.id + '">' + (fav ? "★" : "☆") + '</button>'
        + '<button class="btn sm" data-act="copy" data-text="' + esc(f.expr) + '">复制</button></div>';
    });
    box.innerHTML = h;
  }

  /* ----- plan & pomodoro ----- */
  var POMO = null;
  function viewPlan() {
    var t = todayStr();
    var html = '<h1 class="page-title">学习计划</h1><p class="page-sub">安排每日任务、用番茄钟专注、坚持打卡</p>';
    html += '<div class="card"><div class="flex" style="gap:8px"><input id="planText" placeholder="今天要完成的事，如：复习牛顿第二定律"><button class="btn primary" data-act="addplan">添加</button></div>';
    html += '<div class="field"><label>日期</label><input id="planDate" type="date" value="' + t + '"></div></div>';
    var groups = {};
    state.plans.forEach(function (p) { (groups[p.date] = groups[p.date] || []).push(p); });
    var dates = Object.keys(groups).sort().reverse();
    dates.forEach(function (d) {
      html += '<div class="section-title">' + d + (d === t ? " · 今天" : "") + "</div>";
      groups[d].forEach(function (p) {
        html += '<div class="row"><label class="q-opt" style="margin:0;display:flex;align-items:center;gap:10px;flex:1;cursor:pointer">'
          + '<input type="checkbox" data-act="plancheck" data-id="' + p.id + '" ' + (p.done ? "checked" : "") + ' style="width:auto">'
          + '<span class="' + (p.done ? "muted" : "") + '" style="text-decoration:' + (p.done ? "line-through" : "none") + '">' + esc(p.text) + '</span></label>'
          + '<button class="btn sm ghost" data-act="pdel" data-id="' + p.id + '">删</button></div>';
      });
    });
    html += '<div class="section-title">番茄钟</div><div class="card center">';
    html += '<div class="timer" id="pomoTime">25:00</div>';
    html += '<div class="small muted" id="pomoState">专注时段</div>';
    html += '<div class="flex center" style="justify-content:center;margin-top:12px;gap:10px">'
      + '<button class="btn primary" data-act="pomostart">开始</button>'
      + '<button class="btn" data-act="pomopause">暂停</button>'
      + '<button class="btn" data-act="pomoreset">重置</button></div></div>';
    view.innerHTML = html;
    updatePomo();
  }
  function updatePomo() {
    var el = $("#pomoTime"); if (!el) return;
    if (!POMO) { el.textContent = pad(state.settings.pomodoro.focus) + ":00"; return; }
    el.textContent = pad(POMO.left) + ":00";
    var st = $("#pomoState"); if (st) st.textContent = POMO.phase === "focus" ? "专注时段" : "休息时段";
  }
  function pad(n) { return String(n).padStart(2, "0"); }

  function viewStats() {
    var html = '<h1 class="page-title">数据看板</h1><p class="page-sub">看见努力的轨迹与薄弱点</p>';
    var totalMin = state.log.reduce(function (a, l) { return a + (l.minutes || 0); }, 0);
    var totalQ = state.log.reduce(function (a, l) { return a + (l.qCount || 0); }, 0);
    var totalCorrect = state.log.reduce(function (a, l) { return a + (l.correct || 0); }, 0);
    var acc = totalQ ? Math.round(totalCorrect / totalQ * 100) : 0;
    html += '<div class="grid cols-4">';
    html += statCard("累计学习", totalMin + " 分", "blue");
    html += statCard("累计题量", totalQ + " 题", "");
    html += statCard("总正确率", acc + "%", "gold");
    html += statCard("连续打卡", calcStreak() + " 天", "");
    html += "</div>";
    // weekly trend
    var t = todayStr(); var days = [];
    for (var i = 6; i >= 0; i--) { var d = addDays(t, -i); var m = state.log.filter(function (l) { return l.date === d; }).reduce(function (a, l) { return a + (l.minutes || 0); }, 0); days.push({ d: d, m: m }); }
    var max = Math.max(1, Math.max.apply(null, days.map(function (x) { return x.m; })));
    html += '<div class="section-title">近 7 天学习时长（分钟）</div><div class="card"><div style="display:flex;align-items:flex-end;gap:10px;height:140px">';
    days.forEach(function (x) {
      var h = Math.round(x.m / max * 110) + 4;
      html += '<div style="flex:1;text-align:center"><div title="' + x.m + ' 分" style="height:' + h + 'px;background:var(--primary);border-radius:6px 6px 0 0"></div><div class="small muted" style="margin-top:4px">' + fmtDate(x.d) + "</div></div>";
    });
    html += "</div></div>";
    // radar
    var vals = SEED.subjects.map(function (s) {
      var kps = allKps(s.id); var prog = kps.length ? kps.reduce(function (a, o) { return a + (state.progress[o.kp.id] || 0); }, 0) / (kps.length * 3) : 1;
      var wrongCnt = state.wrong.filter(function (w) { return w.subject === s.id; }).length;
      var weak = 1 - prog + Math.min(1, wrongCnt / 5) * 0.5; weak = Math.min(1, Math.max(0.05, weak));
      return { label: s.name, v: weak };
    });
    html += '<div class="section-title">薄弱点雷达（越大越需关注）</div><div class="card radar-wrap">' + radarSVG(vals) + "</div>";
    view.innerHTML = html;
  }
  function radarSVG(values) {
    var cx = 130, cy = 130, r = 95, n = values.length, grid = "";
    for (var g = 1; g <= 4; g++) { var poly = []; for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; var rr = r * g / 4; poly.push((cx + rr * Math.cos(a)).toFixed(1) + "," + (cy + rr * Math.sin(a)).toFixed(1)); } grid += '<polygon points="' + poly.join(" ") + '" fill="none" stroke="#e5e7eb" stroke-width="0.5"/>'; }
    var dp = []; for (var j = 0; j < n; j++) { var a2 = -Math.PI / 2 + j * 2 * Math.PI / n; var rr2 = r * Math.max(0.05, values[j].v); dp.push((cx + rr2 * Math.cos(a2)).toFixed(1) + "," + (cy + rr2 * Math.sin(a2)).toFixed(1)); }
    var labels = ""; for (var k = 0; k < n; k++) { var a3 = -Math.PI / 2 + k * 2 * Math.PI / n; var lx = cx + (r + 20) * Math.cos(a3), ly = cy + (r + 20) * Math.sin(a3); labels += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" font-size="11" fill="#6b7280" text-anchor="middle" dominant-baseline="middle">' + values[k].label + "</text>"; }
    return '<svg width="100%" viewBox="0 0 260 260" role="img"><polygon points="' + dp.join(" ") + '" fill="rgba(184,134,11,.18)" stroke="#b8860b" stroke-width="1.5"/>' + grid + labels + "</svg>";
  }

  /* ----- AI ----- */
  var AI_STATE = { loading: false };
  function viewAI(params) {
    var html = '<h1 class="page-title">AI 助手</h1><p class="page-sub">浏览器直连大模型：错题诊断、知识点讲解、智能出题。API Key 仅存本地浏览器，请在「设置」中填写。</p>';
    html += '<div class="grid cols-3">'
      + '<button class="card" data-act="aitab" data-tab="diag" style="text-align:left;cursor:pointer"><b>错题诊断</b><div class="small muted">贴入错题，判断错因并推荐</div></button>'
      + '<button class="card" data-act="aitab" data-tab="explain" style="text-align:left;cursor:pointer"><b>知识点讲解</b><div class="small muted">选中知识点，通俗讲解</div></button>'
      + '<button class="card" data-act="aitab" data-tab="gen" style="text-align:left;cursor:pointer"><b>智能出题</b><div class="small muted">按薄弱点生成变式题</div></button></div>';
    var tab = params.tab || "diag";
    html += '<div id="aiPanel" class="card" style="margin-top:14px">' + aiPanel(tab, params) + "</div>";
    view.innerHTML = html;
    if (tab === "explain") { var fs = params.sub || SEED.subjects[0].id; var sx = $("#aiSub"); if (sx) sx.value = fs; fillKpSelect("aiKp", fs, params.kp); }
    if (tab === "gen") { fillKpSelect("aiKp2", SEED.subjects[0].id, null); }
  }
  function aiPanel(tab, params) {
    var h = "";
    if (tab === "diag") {
      h += '<div class="field"><label>题目</label><textarea id="aiQ" placeholder="粘贴题目原文（可含你的答案，AI 会判断错因）" style="min-height:120px">' + esc((params && params.qtext) || "") + "</textarea></div>";
      h += '<div class="flex" style="gap:8px;margin:4px 0 12px"><button class="btn sm" data-act="aiPaste">粘贴</button><button class="btn sm" data-act="aiClear">清空</button></div>';
      h += '<button class="btn primary" data-act="airun" data-kind="diag">开始诊断</button>';
    } else if (tab === "explain") {
      h += subjectSelect("aiSub");
      h += '<div class="field"><label>知识点</label><select id="aiKp"></select></div>';
      h += '<button class="btn primary" data-act="airun" data-kind="explain">讲解</button>';
    } else {
      h += subjectSelect("aiSub2");
      h += '<div class="field"><label>知识点</label><select id="aiKp2"></select></div>';
      h += '<button class="btn primary" data-act="airun" data-kind="gen">生成题目</button>';
    }
    h += '<div id="aiOut" class="small" style="margin-top:12px;white-space:pre-wrap"></div>';
    return h;
  }
  function subjectSelect(id) {
    return '<div class="field"><label>科目</label><select id="' + id + '">' + SEED.subjects.map(function (s) { return '<option value="' + s.id + '">' + s.name + "</option>"; }).join("") + "</select></div>";
  }

  /* ----- settings ----- */
  function viewSettings() {
    var ai = state.settings.ai;
    var html = '<h1 class="page-title">设置</h1><p class="page-sub">主题、同步、番茄钟、AI 接入配置</p>';
    html += '<div class="card" style="margin-bottom:14px"><div class="section-title" style="margin-top:0">数据与同步</div>';
    html += '<p class="small muted">本平台无服务器，数据存于本机浏览器。换设备时请「导出」再「导入」。</p>';
    html += '<div class="flex wrap" style="gap:10px;margin-top:8px">'
      + '<button class="btn primary" data-act="export">导出数据</button>'
      + '<button class="btn" data-act="import">导入数据</button>'
      + '<button class="btn" data-act="exportWrong">仅导出错题本</button></div></div>';
    html += '<div class="card" style="margin-bottom:14px"><div class="section-title" style="margin-top:0">AI 接入设置</div>';
    html += '<p class="small muted">浏览器直连大模型（错题诊断 / 知识点讲解 / 智能出题 / AI 生成题目）。API Key 仅存本机浏览器，不上传服务器。</p>';
    html += '<div class="field"><label>服务商预设</label><select id="aiPreset">'
      + Object.keys(AI_PRESETS).map(function (k) { return '<option value="' + k + '">' + k + "</option>"; }).join("") + "</select></div>";
    html += '<div class="field"><label>接口地址</label><input id="aiEp" value="' + esc(ai.endpoint) + '" placeholder="https://.../v1/chat/completions"></div>';
    html += '<div class="field"><label>模型名</label><input id="aiModel" value="' + esc(ai.model) + '"></div>';
    html += '<div class="field"><label>API Key</label><input id="aiKey" type="password" value="' + esc(ai.key) + '" placeholder="sk-..."></div>';
    html += '<div class="flex wrap" style="gap:10px"><button class="btn primary" data-act="aisave">保存设置</button><button class="btn" data-act="aitest">测试连接</button></div>';
    html += '<div class="small muted" style="margin-top:8px">注意：部分厂商（如 OpenAI）默认禁止浏览器跨域（CORS）。若调用失败，可换用支持浏览器 CORS 的端点，或自建一个转发代理。</div></div>';
    html += '<div class="card" style="margin-bottom:14px"><div class="section-title" style="margin-top:0">外观</div>';
    html += '<div class="flex between"><span>护眼模式（米黄底）</span><button class="btn" data-act="toggleTheme">' + (state.settings.theme === "eye" ? "已开启，点此关闭" : "开启护眼") + "</button></div></div>";
    html += '<div class="card" style="margin-bottom:14px"><div class="section-title" style="margin-top:0">番茄钟</div>';
    html += '<div class="field"><label>专注时长（分钟）</label><input id="pomoF" type="number" value="' + state.settings.pomodoro.focus + '"></div>';
    html += '<div class="field"><label>休息时长（分钟）</label><input id="pomoB" type="number" value="' + state.settings.pomodoro.break + '"></div>';
    html += '<button class="btn primary" data-act="savePomo">保存</button></div>';
    html += '<div class="card"><div class="section-title" style="margin-top:0">危险区</div><button class="btn" data-act="reset" style="border-color:var(--danger);color:var(--danger)">清空全部本地数据</button></div>';
    html += '<p class="small muted" style="margin-top:14px">部署：把整个 study-hub 文件夹推到 GitHub 仓库，开启 Pages 即可。详见 README.md。</p>';
    view.innerHTML = html;
    var ax = $("#aiPreset"); if (ax) ax.onchange = function () { var p = AI_PRESETS[this.value]; if (p.endpoint) { $("#aiEp").value = p.endpoint; $("#aiModel").value = p.model; } };
  }

  /* ---------- shared bits ---------- */
  function subjectChips(sel, view2, counter) {
    var h = '<div class="flex wrap" style="gap:8px;margin-bottom:12px">';
    SEED.subjects.forEach(function (s) {
      var extra = counter ? ' <span class="count">' + counter(s.id) + "题</span>" : "";
      h += '<button class="chip" data-act="subj" data-s="' + s.id + '" data-v="' + view2 + '" style="' + (sel === s.id ? "border-color:" + s.color + ";color:" + s.color : "") + '"><span class="dot" style="background:' + s.color + '"></span>' + s.name + extra + "</button>";
    });
    return h + "</div>";
  }

  /* ---------- actions ---------- */
  view.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]"); if (!t) return;
    var act = t.dataset.act;
    if (act === "subj") { navigate(t.dataset.v, { subject: t.dataset.s }); }
    else if (act === "fsubj") { navigate("formula", { subject: t.dataset.s }); }
    else if (act === "mlevel") { cycleLevel(t.dataset.kp); }
    else if (act === "favkp") { toggleArr(state.favKp, t.dataset.kp); save(); render(); }
    else if (act === "favf") { toggleArr(state.favFormulas, t.dataset.id); save(); render(); }
    else if (act === "copy") { copyText(t.dataset.text); }
    else if (act === "quizStart") {
      var chap = ($("#qChap") || {}).value || ""; var kp = ($("#qKp") || {}).value || "";
      var cnt = +($("#qCount") || {}).value || 5; state.settings.quizCount = cnt; save();
      startQuiz(t.dataset.subject, chap, kp, cnt);
    }
    else if (act === "qopt") { if (QZ && !QZ.revealed) { QZ.chosen = +t.dataset.i; renderQuizCard(); } }
    else if (act === "qsubmit") { if (QZ && QZ.chosen !== null) { QZ.revealed = true; var qq = QZ.items[QZ.i]; QZ.answers[QZ.i] = QZ.chosen; if (QZ.chosen === qq.answer) { QZ.correct++; recordQStat(qq.id, true); } else { addWrong(qq, QZ.chosen); } renderQuizCard(); } else toast("请先选择一个选项"); }
    else if (act === "qreveal") { if (QZ && !QZ.revealed) { var rq = QZ.items[QZ.i]; QZ.chosen = null; QZ.revealed = true; QZ.answers[QZ.i] = null; addWrong(rq, null); renderQuizCard(); } }
    else if (act === "quizExplain") { quizExplain(); }
    else if (act === "qcopy") { var cq = QZ && QZ.items[QZ.i]; if (cq) { copyText(cq.q + "\n" + cq.options.map(function (o, i) { return String.fromCharCode(65 + i) + ". " + o; }).join("\n")); } }
    else if (act === "aiPaste") { var ta = $("#aiQ"); if (ta) { if (navigator.clipboard && navigator.clipboard.readText) { navigator.clipboard.readText().then(function (t) { ta.value = t; toast("已粘贴，可点「开始诊断」"); }, function () { toast("自动粘贴失败，请按 Ctrl/Cmd+V 手动粘贴"); }); } else toast("当前环境不支持自动粘贴，请手动粘贴"); } }
    else if (act === "aiClear") { var ta2 = $("#aiQ"); if (ta2) ta2.value = ""; }
    else if (act === "aitest") { var a2 = state.settings.ai; if (!a2.key || !a2.endpoint) { toast("请先在「设置」的「AI 接入设置」填写接口地址、模型名和 API Key 并保存"); return; } toast("正在测试连接…"); callAI("你是学习助手。", "请只回复两个字：成功").then(function (t) { toast("连接成功：" + t.slice(0, 24)); }, function (e) { toast("连接失败：" + (e && e.message ? e.message : e)); }); }
    else if (act === "qskip") { if (QZ && !QZ.revealed) {
      var sq = QZ.items[QZ.i];
      if (QZ.chosen !== null) {           // 已选选项：先记录并判分，再进入下一题
        QZ.answers[QZ.i] = QZ.chosen;
        if (QZ.chosen === sq.answer) { QZ.correct++; recordQStat(sq.id, true); }
        else { addWrong(sq, QZ.chosen); }
      } else {                             // 未选：记为未答
        QZ.answers[QZ.i] = null; addWrong(sq, null);
      }
      QZ.i++; if (QZ.i >= QZ.items.length) { finishQuiz(); return; }
      QZ.chosen = null; QZ.revealed = false; renderQuizCard();
    } }
    else if (act === "qnext") { QZ.i++; QZ.chosen = null; QZ.revealed = false; renderQuizCard(); }
    else if (act === "qfinish") { finishQuiz(); }
    else if (act === "qresult") { finishQuiz(); }
    else if (act === "quizExit") { QZ = null; render(); }
    else if (act === "genRun") { aiGenerateQuestions(t.dataset.subject); }
    else if (act === "importQ") { importQuestions(); }
    else if (act === "exportQ") { exportMyQuestions(); }
    else if (act === "plancheck") { var p = state.plans.find(function (x) { return x.id === t.dataset.id; }); if (p) { p.done = t.checked; save(); var dt = p.date; logStudy(dt, 0, 0, 0); render(); } }
    else if (act === "addplan") { var txt = ($("#planText") || {}).value || ""; var dt2 = ($("#planDate") || {}).value || todayStr(); if (!txt.trim()) { toast("请输入内容"); return; } state.plans.push({ id: uid(), date: dt2, text: txt.trim(), done: false }); save(); render(); }
    else if (act === "pdel") { state.plans = state.plans.filter(function (x) { return x.id !== t.dataset.id; }); save(); render(); }
    else if (act === "wredo") { redoWrong(t.dataset.id); }
    else if (act === "wreason") { editReason(t.dataset.id); }
    else if (act === "wai") { aiDiagFromWrong(t.dataset.id); }
    else if (act === "wdel") { state.wrong = state.wrong.filter(function (w) { return w.id !== t.dataset.id; }); save(); render(); }
    else if (act === "pomostart") { pomoStart(); }
    else if (act === "pomopause") { pomoPause(); }
    else if (act === "pomoreset") { POMO = null; updatePomo(); }
    else if (act === "aitab") { navigate("ai", { tab: t.dataset.tab }); }
    else if (act === "aisave") { saveAI(); }
    else if (act === "airun") { runAI(t.dataset.kind); }
    else if (act === "aiExplain") { var kp2 = kpOf(t.dataset.subject, t.dataset.kp); navigate("ai", { tab: "explain", sub: t.dataset.subject }); setTimeout(function () { if ($("#aiSub")) { $("#aiSub").value = t.dataset.subject; fillKpSelect("aiKp", t.dataset.subject, t.dataset.kp); } }, 60); }
    else if (act === "toggleTheme") { state.settings.theme = state.settings.theme === "eye" ? "light" : "eye"; save(); applyTheme(); render(); }
    else if (act === "savePomo") { state.settings.pomodoro.focus = +($("#pomoF") || {}).value || 25; state.settings.pomodoro.break = +($("#pomoB") || {}).value || 5; save(); toast("已保存"); }
    else if (act === "export") { exportData(false); }
    else if (act === "exportWrong") { exportData(true); }
    else if (act === "import") { importData(); }
    else if (act === "reset") { if (confirm("确定清空全部本地数据？此操作不可恢复。")) { localStorage.removeItem(KEY); state = defaultState(); save(); render(); toast("已清空"); } }
    else if (act === "moresheet") { openMoreSheet(); }
  });

  function cycleLevel(kid) { var cur = state.progress[kid] || 0; state.progress[kid] = (cur + 1) % 4; save(); render(); }
  function toggleArr(arr, id) { var i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast("已复制"); }, function () { fallbackCopy(t); });
    } else fallbackCopy(t);
  }
  function fallbackCopy(t) {
    try {
      var ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; ta.style.top = "0"; document.body.appendChild(ta); ta.select();
      var ok = document.execCommand && document.execCommand("copy"); document.body.removeChild(ta);
      toast(ok ? "已复制" : "复制失败");
    } catch (e) { toast("复制失败"); }
  }

  function recordQStat(qid, isCorrect) {
    var st = state.qstats[qid] || { correct: 0, wrong: 0, attempts: 0 };
    st.attempts = (st.attempts || 0) + 1;
    if (isCorrect) st.correct = (st.correct || 0) + 1; else st.wrong = (st.wrong || 0) + 1;
    state.qstats[qid] = st; save();
  }
  function addWrong(q, chosenIdx) {
    var myAnswer = (chosenIdx == null || chosenIdx < 0) ? "（没做出来）" : q.options[chosenIdx];
    recordQStat(q.id, false);
    if (state.wrong.find(function (w) { return w.qid === q.id; })) return;
    state.wrong.push({ id: uid(), qid: q.id, subject: q.subject, question: q.q, myAnswer: myAnswer, correctAnswer: q.options[q.answer], reason: "", addedAt: todayStr(), nextReview: addDays(todayStr(), 1), interval: 1, reviews: [] });
    save();
  }
  function redoWrong(id) {
    var w = state.wrong.find(function (x) { return x.id === id; }); if (!w) return;
    openSheet('<h3>重做这道题</h3><div class="card" style="margin-bottom:12px">' + esc(w.question) + '</div>'
      + '<p class="small muted">正确：' + esc(w.correctAnswer) + '</p>'
      + '<div class="field"><label>你的重做结果</label><select id="redoR"><option value="1">这次做对了</option><option value="0">还是错了</option></select></div>'
      + '<button class="btn primary" data-act="redoConfirm" data-id="' + id + '">确定</button>');
  }
  function editReason(id) {
    var w = state.wrong.find(function (x) { return x.id === id; }); if (!w) return;
    openSheet('<h3>编辑错因</h3><textarea id="reasonT">' + esc(w.reason) + '</textarea>'
      + '<div class="flex wrap" style="gap:6px;margin:8px 0"><button class="tag" data-rsn="概念不清">概念不清</button><button class="tag" data-rsn="计算错误">计算错误</button><button class="tag" data-rsn="审题偏差">审题偏差</button><button class="tag" data-rsn="方法不会">方法不会</button></div>'
      + '<button class="btn primary" data-act="reasonConfirm" data-id="' + id + '">保存</button>');
    $("#reasonT").addEventListener("input", function () {});
    document.querySelectorAll("[data-rsn]").forEach(function (b) { b.onclick = function () { $("#reasonT").value = this.dataset.rsn; }; });
  }
  function aiDiagFromWrong(id) {
    var w = state.wrong.find(function (x) { return x.id === id; }); if (!w) return;
    var text = w.question + "\n我的答案：" + w.myAnswer + "（错误）\n正确答案：" + w.correctAnswer;
    navigate("ai", { tab: "diag", qtext: text });
  }

  /* sheet */
  function openSheet(html) { var s = $("#sheet"); s.innerHTML = '<div class="panel">' + html + "</div>"; s.classList.remove("hidden"); }
  function closeSheet() { var s = $("#sheet"); s.classList.add("hidden"); s.innerHTML = ""; }
  $("#sheet").addEventListener("click", function (e) {
    if (e.target.id === "sheet") { closeSheet(); return; }
    var t = e.target.closest("[data-act]"); if (!t) return;
    var act = t.dataset.act;
    if (act === "redoConfirm") {
      var w = state.wrong.find(function (x) { return x.id === t.dataset.id; }); if (w) {
        w.reviews.push({ date: todayStr(), ok: t.dataset.ok === "1" });
        if (t.dataset.ok === "1") { var steps = [1, 2, 4, 7, 15, 30]; var idx = steps.indexOf(w.interval); w.interval = steps[Math.min(steps.length - 1, idx + 1)]; w.nextReview = addDays(todayStr(), w.interval); }
        else { w.interval = 1; w.nextReview = addDays(todayStr(), 1); }
        save();
      }
      closeSheet(); render();
    } else if (act === "reasonConfirm") { var w2 = state.wrong.find(function (x) { return x.id === t.dataset.id; }); if (w2) { w2.reason = ($("#reasonT") || {}).value || ""; save(); } closeSheet(); render(); }
  });
  function openMoreSheet() {
    var h = '<h3>全部模块</h3>';
    NAV.forEach(function (n) { h += '<a class="nav-item" href="#/' + n.id + '">' + ICON[n.icon] + "<span>" + n.label + "</span></a>"; });
    openSheet(h);
  }

  /* pomodoro */
  function pomoStart() {
    if (POMO && POMO.timer) return;
    if (!POMO) POMO = { phase: "focus", left: state.settings.pomodoro.focus, timer: null };
    POMO.timer = setInterval(function () {
      POMO.left--; if (POMO.left <= 0) {
        if (POMO.phase === "focus") { logStudy(todayStr(), state.settings.pomodoro.focus, 0, 0); toast("专注完成，休息一下"); POMO.phase = "break"; POMO.left = state.settings.pomodoro.break; }
        else { toast("休息结束，继续加油"); POMO.phase = "focus"; POMO.left = state.settings.pomodoro.focus; }
      }
      updatePomo();
    }, 60000);
    updatePomo();
  }
  function pomoPause() { if (POMO && POMO.timer) { clearInterval(POMO.timer); POMO.timer = null; } }

  /* study log */
  function logStudy(date, minutes, qCount, correct) {
    var rec = state.log.find(function (l) { return l.date === date; });
    if (!rec) { rec = { date: date, minutes: 0, qCount: 0, correct: 0 }; state.log.push(rec); }
    rec.minutes += minutes; rec.qCount += qCount; rec.correct += correct; save();
  }
  function finishQuiz() {
    logStudy(todayStr(), 0, QZ.items.length, QZ.correct);
    var total = QZ.items.length, correct = QZ.correct;
    var r = total ? Math.round(correct / total * 100) : 0;
    var ans = QZ.answers || QZ.items.map(function () { return null; });
    var title = quizTitle(r), phrase = quizFlavor(r);
    var html = "";
    html += '<h1 class="page-title">练习完成</h1>';
    // 模块一：正确率（圆环）
    html += '<div class="res-card center">'
      + '<div class="ring" style="--p:' + r + '"><div class="ring-inner">' + r + '%</div></div>'
      + '<div class="small muted" style="margin-top:12px">答对 <b style="color:var(--text)">' + correct + '</b> / ' + total + ' 题</div>'
      + '</div>';
    // 模块二：称号 + 温馨短语
    html += '<div class="res-card center">'
      + '<div class="title-badge">' + esc(title) + '</div>'
      + '<div class="phrase">' + esc(phrase) + '</div>'
      + '</div>';
    // 模块三：刚才刷过的题
    html += '<div class="res-card"><div class="section-title" style="margin-top:0">刚才刷过的题（' + total + '）</div>';
    QZ.items.forEach(function (q, i) {
      var chosen = ans[i];
      if (chosen === undefined) chosen = null;   // 中途查看结果：未做到的题目按「未答」计
      var ok = chosen === q.answer;
      var tagCls = chosen === null ? "skip" : (ok ? "ok" : "no");
      var tagTxt = chosen === null ? "未答" : (ok ? "答对" : "答错");
      html += '<div class="rq">';
      html += '<div class="rq-head"><span class="rq-no">' + (i + 1) + '</span><span class="rq-tag ' + tagCls + '">' + tagTxt + '</span></div>';
      html += '<div class="rq-q">' + esc(q.q) + '</div>';
      q.options.forEach(function (opt, oi) {
        var cls = "rq-opt";
        if (oi === q.answer) cls += " right";
        else if (oi === chosen) cls += " wrong";
        var mark = oi === q.answer ? "✓" : (oi === chosen ? "✗" : "");
        html += '<div class="' + cls + '">' + String.fromCharCode(65 + oi) + ". " + esc(opt) + (mark ? ' <span class="rq-mark">' + mark + "</span>" : "") + '</div>';
      });
      if (q.explain) html += '<div class="rq-explain">解析：' + esc(q.explain) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div class="center" style="margin-top:18px"><button class="btn primary" data-act="quizExit">返回</button></div>';
    view.innerHTML = html; QZ = null;
  }

  /* export / import */
  function exportData(wrongOnly) {
    var data = wrongOnly ? { type: "studyHub-wrong", wrong: state.wrong } : { type: "studyHub", version: 1, state: state };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = (wrongOnly ? "错题本_" : "学习数据_") + todayStr() + ".json"; a.click();
    toast("已导出");
  }
  function importData() {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json";
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () {
        try {
          var j = JSON.parse(rd.result);
          if (j.type === "studyHub") { state = j.state; save(); toast("导入成功"); }
          else if (j.type === "studyHub-wrong") { state.wrong = j.wrong; save(); toast("错题本已合并"); }
          else if (j.state) { state = j.state; save(); toast("导入成功"); }
          else { state = Object.assign(defaultState(), j); save(); toast("导入成功"); }
          render();
        } catch (e) { toast("文件解析失败"); }
      };
      rd.readAsText(f);
    };
    inp.click();
  }

  /* AI */
  function saveAI() {
    state.settings.ai.endpoint = ($("#aiEp") || {}).value || "";
    state.settings.ai.model = ($("#aiModel") || {}).value || "";
    state.settings.ai.key = ($("#aiKey") || {}).value || "";
    save(); toast("AI 设置已保存");
  }
  function fillKpSelect(selId, subject, kpId) {
    var sel = $("#" + selId); if (!sel) return;
    sel.innerHTML = allKps(subject).map(function (o) { return '<option value="' + o.kp.id + '" ' + (o.kp.id === kpId ? "selected" : "") + ">" + esc(o.kp.name) + "</option>"; }).join("");
  }
  // sync kp select when subject changes
  document.addEventListener("change", function (e) {
    if (e.target && (e.target.id === "aiSub" || e.target.id === "aiSub2")) {
      fillKpSelect(e.target.id === "aiSub" ? "aiKp" : "aiKp2", e.target.value);
    }
  });
  function callAI(system, user, maxTokens) {
    var ai = state.settings.ai;
    if (!ai.key || !ai.endpoint) return Promise.reject(new Error("未配置 API Key，请先在「设置」的「AI 接入设置」中填写"));
    var body = { model: ai.model || "gpt-4o-mini", messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.6 };
    if (maxTokens) body.max_tokens = maxTokens;
    return fetch(ai.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ai.key },
      body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error("接口错误 " + r.status + "：" + t.slice(0, 160)); }); return r.json(); })
      .then(function (j) { return (j.choices && j.choices[0] && j.choices[0].message.content) || "（无返回）"; });
  }
  function runAI(kind) {
    if (AI_STATE.loading) return;
    var out = $("#aiOut"); if (!out) return;
    var ai = state.settings.ai;
    if (!ai.key || !ai.endpoint) {
      out.textContent = "⚠ 尚未配置 AI（接口地址 / 模型 / API Key）。请先在「设置」的「AI 接入设置」填写并点「保存设置」。" + (ai.endpoint && ai.endpoint.indexOf("api.openai.com") >= 0 ? "\n提示：OpenAI 官方接口默认禁止浏览器跨域（CORS），请改用支持 CORS 的端点或自建代理。" : "");
      toast("请先配置 AI（见本页上方）");
      return;
    }
    var sys = "你是高中理科辅导老师，用中文、简明、易懂的方式回答，多举生活例子，避免冗长。";
    var user = "";
    if (kind === "diag") {
      var q = ($("#aiQ") || {}).value || "";
      if (!q.trim()) { toast("请填写或粘贴题目"); return; }
      user = "题目：" + q + "\n请诊断这道题的易错点，给出正确解法和一句记忆/解题口诀；若题目里含有「我的答案」，请指出可能的错误原因，并推荐要复习的知识点与一道类似题。";
    } else if (kind === "explain") {
      var s = ($("#aiSub") || {}).value, kid = ($("#aiKp") || {}).value; var kp = kpOf(s, kid);
      if (!kp) { toast("请选择知识点"); return; }
      user = "请讲解高中" + (subj(s) || {}).name + "知识点「" + kp.name + "」。概念：" + kp.concept + (kp.formula ? " 公式：" + kp.formula : "") + "。用学生能听懂的话讲，并给一个记忆技巧。";
    } else {
      var s2 = ($("#aiSub2") || {}).value, kid2 = ($("#aiKp2") || {}).value; var kp2 = kpOf(s2, kid2);
      if (!kp2) { toast("请选择知识点"); return; }
      user = "请就高中" + (subj(s2) || {}).name + "知识点「" + kp2.name + "」出 1 道选择题（4 选项、标出答案和简要解析），难度中等。";
    }
    AI_STATE.loading = true; out.textContent = "AI 思考中…（若长时间无响应，多为跨域/网络限制）";
    callAI(sys, user).then(function (txt) { out.textContent = txt; }).catch(function (err) {
      var msg = err && err.message ? err.message : String(err);
      out.textContent = "⚠ " + msg + (msg.indexOf("fetch") >= 0 ? "\n可能是浏览器跨域(CORS)或网络限制。请换用支持 CORS 的接口地址，或自建一个转发代理后再试。" : "");
      toast("AI 调用失败，详见下方说明");
    }).finally(function () { AI_STATE.loading = false; });
  }
  /* ---------- 题库：AI 生成 / 导入导出 ---------- */
  // 生成前先看各知识点现有题量，按"缺的多补的多"做水填充分配，使最终题量尽量均衡
  function planKpTargets(subjId, n, forcedKpId) {
    if (forcedKpId) return [{ kpId: forcedKpId, count: n }]; // 指定知识点：全部归入
    var kps = allKps(subjId);
    var K = kps.length; if (!K) return [];
    var counts = kpQCount(); // kpId -> 现有题数（内置题 + 已生成/导入题）
    var plan = {}; kps.forEach(function (o) { plan[o.kp.id] = 0; });
    // 水填充：每次把 1 题分给当前(现有+已分配)最少的知识点
    for (var i = 0; i < n; i++) {
      var minId = kps[0].kp.id, minC = Infinity;
      for (var j = 0; j < K; j++) {
        var eff = (counts[kps[j].kp.id] || 0) + plan[kps[j].kp.id];
        if (eff < minC) { minC = eff; minId = kps[j].kp.id; }
      }
      plan[minId]++;
    }
    return Object.keys(plan).filter(function (id) { return plan[id] > 0; })
      .map(function (id) { return { kpId: id, count: plan[id] }; });
  }
  function aiGenerateQuestions(subjId) {
    var ai = state.settings.ai;
    if (!ai.key || !ai.endpoint) { toast("请先在「设置」的「AI 接入设置」填写 API Key"); return; }
    var kpId = ($("#genKp") || {}).value || "";
    var n = +($("#genN") || {}).value || 20;
    var out = $("#genOut"); if (!out) return;

    // 1) 按现有题量规划每个知识点应补几题（题少的多补，最终尽量均衡）
    var targets = planKpTargets(subjId, n, kpId || null);
    if (!targets.length) { toast("该科目暂无知识点"); return; }

    // 2) 拆成每批最多 10 题、单知识点聚焦的任务（便于精准归类、避免截断）
    var BATCH = 10, jobs = [];
    targets.forEach(function (t) {
      var k = kpOf(subjId, t.kpId); if (!k) return;
      for (var c = t.count; c > 0; c -= BATCH) jobs.push({ kp: k, want: Math.min(BATCH, c) });
    });
    var totalJobs = jobs.length;
    var planTxt = kpId ? ("目标知识点：「" + (kpOf(subjId, kpId) || {}).name + "」")
      : "已按各知识点现有题量自动补齐（题少的多补、尽量均衡）";
    out.textContent = "AI 生成中…（" + planTxt + "；第 1/" + totalJobs + " 批，已得 0/" + n + "）";
    var added = 0, lastTxt = "";
    var chain = Promise.resolve();
    jobs.forEach(function (job, bi) {
      chain = chain.then(function () {
        var sys = "你是高中" + (subj(subjId) || {}).name + "题库编写助手。只输出一个 JSON 数组，不要任何解释、不要 markdown 代码块。";
        var kpHint = "每题请在字段 kp 中填入知识点名称：「" + job.kp.name + "」（必须精确复制，不要自造）。";
        var user = "请生成 " + job.want + " 道高中" + (subj(subjId) || {}).name + "选择题，全部聚焦于知识点「" + job.kp.name + "」（概念：" + job.kp.concept + "）。"
          + kpHint
          + "每题格式：{\"q\":题面,\"options\":[4个选项字符串],\"answer\":正确选项下标(0-3),\"explain\":简短解析,\"kp\":知识点名称}。"
          + "要求：4 个选项、无歧义；answer 为 0/1/2/3 且确实对应正确选项；解析用中文。只返回 JSON 数组本身。";
        return callAI(sys, user, 4096).then(function (txt) {
          lastTxt = txt;
          var arr = parseQuestionJSON(txt);
          if (arr && arr.length) added += mergeUserQuestions(arr, subjId, job.kp.id); // 本批强制归入该知识点
          out.textContent = "AI 生成中…（" + planTxt + "；第 " + (bi + 1) + "/" + totalJobs + " 批，已得 " + added + "/" + n + "）";
        });
      });
    });
    chain.then(function () {
      if (added) {
        var msg = "✓ 已生成 " + added + " 题并加入题库（分 " + totalJobs + " 批请求）。"
          + (kpId ? "已统一归入知识点「" + (kpOf(subjId, kpId) || {}).name + "」。" : "已按各知识点现有题量自动补齐（题少的多补、尽量均衡）。")
          + "去上方选相同知识点点「开始练习」即可刷到。";
        toast("已加入 " + added + " 题");
        render();
        var o2 = $("#genOut"); if (o2) o2.textContent = msg;
      } else {
        out.textContent = "⚠ 全部批次解析失败（多为接口跨域 / 网络 / 输出截断）。请重试，或减小数量。原始返回样例：\n" + lastTxt.slice(0, 300);
      }
    }).catch(function (err) {
      out.textContent = "⚠ 生成中断：" + (err && err.message ? err.message : err) + "（已生成 " + added + " 题，可再次点击补充剩余）";
    });
  }
  function finalizeQuestions(arr) {
    return arr.filter(function (x) {
      return x && typeof x.q === "string" && Array.isArray(x.options) && x.options.length === 4
        && typeof x.answer === "number" && x.answer >= 0 && x.answer <= 3;
    }).map(function (x) {
      return { q: x.q, options: x.options.map(String), answer: x.answer, explain: x.explain ? String(x.explain) : "", kp: x.kp ? String(x.kp) : "" };
    });
  }
  function parseQuestionJSON(txt) {
    try {
      var s = String(txt).trim();
      var m = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (m) s = m[1].trim();
      var start = s.indexOf("["), end = s.lastIndexOf("]");
      if (start >= 0 && end > start) s = s.slice(start, end + 1);
      var arr = JSON.parse(s);
      if (!Array.isArray(arr)) return null;
      return finalizeQuestions(arr);
    } catch (e) {
      // 容错：请求过大时模型可能截断输出，尝试从已完整生成的题目对象中恢复
      try {
        var s2 = String(txt);
        var m2 = s2.match(/```(?:json)?\s*([\s\S]*?)```/i); if (m2) s2 = m2[1];
        var objs = s2.match(/\{[^{}]*\}/g) || [];
        var rec = objs.map(function (o) { try { return JSON.parse(o); } catch (e3) { return null; } }).filter(Boolean);
        if (rec.length) return finalizeQuestions(rec);
      } catch (e2) {}
      return null;
    }
  }
  function mergeUserQuestions(arr, defaultSubject, forcedKpId) {
    if (!state.userQuestions) state.userQuestions = [];
    var kps = allKps(defaultSubject).map(function (o) { return o.kp.id; });
    var nameMap = {}; allKps(defaultSubject).forEach(function (o) { nameMap[o.kp.name] = o.kp.id; });
    var added = 0, kpIdx = 0;
    arr.forEach(function (x) {
      if (!x || !x.q || !Array.isArray(x.options) || x.options.length !== 4) return;
      var subjId = (x.subject && subj(x.subject)) ? x.subject : (defaultSubject && subj(defaultSubject) ? defaultSubject : SEED.subjects[0].id);
      var theKp;
      if (forcedKpId && kpOf(subjId, forcedKpId)) theKp = forcedKpId;          // 指定知识点：全部归入
      else if (x.kp && nameMap[x.kp]) theKp = nameMap[x.kp];                    // 模型自带的可识别知识点
      else { theKp = kps.length ? kps[kpIdx % kps.length] : ""; kpIdx++; }      // 随机：在各知识点间轮转分配
      state.userQuestions.push({
        id: "uq_" + uid(), subject: subjId, chapter: chapterOfKp(subjId, theKp),
        kp: theKp, type: "choice", q: x.q, options: x.options.map(String),
        answer: typeof x.answer === "number" ? x.answer : 0, explain: x.explain || ""
      });
      added++;
    });
    save();
    return added;
  }
  function importQuestions() {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json";
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () {
        try {
          var j = JSON.parse(rd.result);
          var arr = Array.isArray(j) ? j : (j.questions && Array.isArray(j.questions) ? j.questions : null);
          if (!arr) { toast("格式不对：需为题目数组，或 {questions:[...]}"); return; }
          var n = mergeUserQuestions(arr);
          toast("已导入 " + n + " 道题"); render();
        } catch (e) { toast("文件解析失败"); }
      };
      rd.readAsText(f);
    };
    inp.click();
  }
  function exportMyQuestions() {
    if (!(state.userQuestions || []).length) { toast("你还没有生成/导入题目"); return; }
    var data = { type: "studyHub-questions", questions: state.userQuestions };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "我的题库_" + todayStr() + ".json"; a.click();
    toast("已导出我的题库");
  }
  // 练习时右侧「AI 讲解这道题」
  function quizExplain() {
    if (!QZ) return;
    var out = $("#quizAiOut"); if (!out) return;
    var q = QZ.items[QZ.i];
    var ai = state.settings.ai;
    if (!ai.key || !ai.endpoint) { out.textContent = "⚠ 未配置 API Key，请先在「设置」的「AI 接入设置」填写。"; return; }
    var kp = kpOf(q.subject, q.kp);
    var sys = "你是高中理科辅导老师，用中文、简明易懂的方式讲解，多举生活例子，避免冗长。";
    var user = "请讲解下面这道题的【正确思路】：\n题目：" + q.q + "\n选项：\n" + q.options.map(function (o, i) { return String.fromCharCode(65 + i) + ". " + o; }).join("\n")
      + "\n正确答案：" + String.fromCharCode(65 + q.answer) + "（" + q.options[q.answer] + "）\n"
      + (kp ? "涉及知识点「" + kp.name + "」：" + kp.concept + (kp.formula ? "\n公式：" + kp.formula : "") : "")
      + "\n请分三点说明：① 为什么选这个答案；② 常见的易错点；③ 一句记忆或解题口诀。";
    out.textContent = "AI 思考中…";
    callAI(sys, user).then(function (txt) { out.textContent = txt; }).catch(function (err) { out.textContent = "⚠ " + err.message; });
  }

  /* ---------- shell ---------- */
  function buildShell() {
    var sb = "";
    sb += '<div class="brand"><div class="logo">炸</div><div class="name">我刷题你炸了？</div></div>';
    NAV.forEach(function (n) { sb += '<a class="nav-item" data-view="' + n.id + '" href="#/' + n.id + '">' + ICON[n.icon] + "<span>" + n.label + "</span></a>"; });
    $("#sidebar").innerHTML = sb;

    var tb = "";
    BOTTOM.forEach(function (id) {
      if (id === "more") tb += '<button class="nav-item" data-act="moresheet">' + ICON.more + "<span>更多</span></button>";
      else { var n = NAV.find(function (x) { return x.id === id; }); tb += '<a class="nav-item" data-view="' + id + '" href="#/' + id + '">' + ICON[n.icon] + "<span>" + n.label + "</span></a>"; }
    });
    $("#tabbar").innerHTML = tb;
  }
  function applyTheme() { document.body.classList.toggle("eye", state.settings.theme === "eye"); }

  $("#menuBtn").addEventListener("click", function () { $("#sidebar").classList.toggle("open"); });
  $("#syncBtn").addEventListener("click", function () { navigate("settings"); });
  $("#themeBtn").addEventListener("click", function () { state.settings.theme = state.settings.theme === "eye" ? "light" : "eye"; save(); applyTheme(); });
  window.addEventListener("hashchange", render);

  /* ---------- init ---------- */
  buildShell();
  applyTheme();
  if ("serviceWorker" in navigator) {
    try {
      navigator.serviceWorker.register("sw.js").then(function (reg) { if (reg && reg.update) reg.update(); }).catch(function () {});
    } catch (e) {}
  }
  if (!location.hash) location.hash = "#/home";
  else render();
})();
