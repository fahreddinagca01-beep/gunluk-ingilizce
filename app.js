/* Günlük İngilizce: kişisel çalışma uygulaması. Enerji sınırı ve reklam yok.
   İçerik data.js (window.COURSE), ilerleme tarayıcıda (localStorage) tutulur. */
(function () {
  "use strict";

  var COURSE = window.COURSE || { units: [] };
  var KEY = "gunluk-ingilizce-v1";
  var DAY = 86400000;
  var INTERVALS = [0, 1, 3, 7, 14, 30, 60]; // kutu -> gün
  var COLORS = ["#3b4bd8", "#0f9d8a", "#e8590c", "#c2255c", "#7048e8", "#1c7ed6",
    "#2b8a3e", "#d9480f", "#5f3dc4", "#0b7285", "#a61e4d", "#5c6b7a"];
  var SECTIONS = ["Evde ve markette", "Kendini ve çevreni anlat", "Şehirde ve dışarıda", "İşte ve yolculukta"];
  var OFFSETS = [0, 48, 78, 48, 0, -48, -78, -48];
  var PASS = 80; // ünite sınavı geçme yüzdesi
  var app = document.getElementById("app");

  // ---------- Kayıt ----------
  function defaults() {
    return {
      v: 1, course: COURSE.version || 1, items: {}, lessons: {}, xp: {},
      streak: { count: 0, last: "", best: 0 },
      stats: { lessons: 0, perfect: 0, correct: 0, wrong: 0, seconds: 0 },
      settings: { goal: 30, rate: 0.9, sound: true, speak: true },
      speakOffUntil: 0, shown: {}
    };
  }
  function load() {
    var d = defaults(), s;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
    if (!s) return d;
    // İçerik değişince ders ve öğe ilerlemesi sıfırlanır; puan, seri ve istatistik kalır.
    if ((s.course || 1) !== (COURSE.version || 1)) { s.lessons = {}; s.items = {}; s.course = COURSE.version || 1; }
    for (var k in d) if (!(k in s)) s[k] = d[k];
    ["settings", "stats", "streak"].forEach(function (g) { for (var k2 in d[g]) if (!(k2 in s[g])) s[g][k2] = d[g][k2]; });
    migrate(s);
    return s;
  }
  // Eski sürümde ünite başına 3 ders vardı (L1–L3); yeni düzende 6 ders var.
  function migrate(s) {
    var map = { L1: ["k1", "k2"], L2: ["c1", "c2"], L3: ["c3"] };
    Object.keys(s.lessons).forEach(function (id) {
      var m = /^(u\d+)-(L\d)$/.exec(id);
      if (m) {
        map[m[2]].forEach(function (n) { if (!s.lessons[m[1] + "-" + n]) s.lessons[m[1] + "-" + n] = { stars: 2, best: 80 }; });
        delete s.lessons[id];
      } else if (s.lessons[id] === true) s.lessons[id] = { stars: 2, best: 80 };
    });
    if (s.streak.best < s.streak.count) s.streak.best = s.streak.count;
    // Ünite başına ayrı kelime (k) ve cümle (c) dersleri birleşik derslere (d) taşınır.
    Object.keys(s.lessons).forEach(function (id) {
      var m = /^(u\d+)-[kc](\d)$/.exec(id);
      if (!m) return;
      var nid = m[1] + "-d" + m[2], o = s.lessons[nid], v = s.lessons[id];
      s.lessons[nid] = o ? { stars: Math.min(o.stars, v.stars), best: Math.min(o.best, v.best) } : v;
      delete s.lessons[id];
    });
    if (!s.stats.lessons) s.stats.lessons = Object.keys(s.lessons).length;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  var state = load();
  save();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  // ---------- Yardımcılar ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function dayStr(t) {
    var d = new Date(t), m = d.getMonth() + 1, g = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (g < 10 ? "0" : "") + g;
  }
  function today() { return dayStr(Date.now()); }
  function yesterday() { return dayStr(Date.now() - DAY); }
  function chunk(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  var ALL = [], BY_ID = {};
  COURSE.units.forEach(function (u, ui) {
    u.color = COLORS[ui % COLORS.length];
    u.index = ui;
    u.items.forEach(function (it) { it.unit = u.id; ALL.push(it); BY_ID[it.id] = it; });
  });
  var WORDS = ALL.filter(function (i) { return i.kind === "word"; });
  var SENTS = ALL.filter(function (i) { return i.kind === "sentence"; });

  // Ünite başına: 5'erli kelime dersleri, 4'erli cümle dersleri, ünite sınavı
  function lessonsOf(u) {
    if (u._lessons) return u._lessons;
    var w = u.items.filter(function (i) { return i.kind === "word"; });
    var s = u.items.filter(function (i) { return i.kind === "sentence"; });
    var out = [];
    // Ders: 5 yeni kelime + 4 cümle; her öğe derste bir kez sorulur.
    // Dersler arasına dinleme, konuşma, okuma, sandık ve pekiştirme durakları girer.
    var wc = chunk(w, 5), sc = chunk(s, 4), n = Math.max(wc.length, sc.length);
    var R = u.readings || [];
    function d(i) { return { id: u.id + "-d" + (i + 1), name: "Ders " + (i + 1), items: (wc[i] || []).concat(sc[i] || []), mode: "mixed", icon: "⭐" }; }
    function grp(a, b) { return (wc[a] || []).concat(sc[a] || [], wc[b] || [], sc[b] || []); }
    function rd(k) { if (R[k]) out.push({ id: u.id + "-r" + (k + 1), name: "Okuma: " + R[k].title, items: [], reading: R[k], mode: "reading", icon: "📖" }); }
    for (var i = 0; i < n; i++) {
      out.push(d(i));
      if (i === 1) out.push({ id: u.id + "-l1", name: "Dinleme", items: grp(0, 1), mode: "listen", icon: "🎧" });
      if (i === 2) rd(0);
      if (i === 3) {
        out.push({ id: u.id + "-s1", name: "Konuşma", items: grp(2, 3), mode: "speak", icon: "🎤" });
        out.push({ id: u.id + "-c1", name: "Sandık", items: [], mode: "chest", icon: "🎁" });
      }
      if (i === 5) rd(1);
    }
    if (n < 6) rd(1);
    out.push({ id: u.id + "-p", name: "Pekiştirme", items: u.items, mode: "practice", icon: "🏋️" });
    rd(2);
    out.push({ id: u.id + "-test", name: "Ünite sınavı", items: u.items, mode: "test", icon: "🏆" });
    out.forEach(function (l) { l.unit = u; });
    u._lessons = out;
    return out;
  }
  var PATH = [];
  COURSE.units.forEach(function (u) { lessonsOf(u).forEach(function (l) { l.gi = PATH.length; PATH.push(l); }); });
  function isDone(l) { return !!state.lessons[l.id]; }
  function currentIndex() { for (var i = 0; i < PATH.length; i++) if (!isDone(PATH[i])) return i; return PATH.length; }
  function unitDone(u) { return lessonsOf(u).every(isDone); }

  function totalXp() { var t = 0; for (var d in state.xp) t += state.xp[d]; return t; }
  function todayXp() { return state.xp[today()] || 0; }
  function levelOf(xp) { var n = 1; while (xp >= 25 * n * (n + 1)) n++; return n; }
  function levelFloor(n) { return 25 * n * (n - 1); }
  function streakNow() { var s = state.streak; return (s.last === today() || s.last === yesterday()) ? s.count : 0; }
  function learnedCount(kind) {
    return ALL.filter(function (i) { var st = state.items[i.id]; return (!kind || i.kind === kind) && st && st.box >= 1 && st.ok > 0; }).length;
  }
  function dueItems() {
    var now = Date.now();
    return ALL.filter(function (i) { var st = state.items[i.id]; return st && st.box > 0 && st.due <= now; })
      .sort(function (a, b) { return state.items[a.id].due - state.items[b.id].due; });
  }
  function weakItems() {
    return ALL.filter(function (i) { var st = state.items[i.id]; return st && (st.bad > 0 && st.box <= 2); })
      .sort(function (a, b) { return state.items[b.id].bad - state.items[a.id].bad; });
  }
  function seenItems() { return ALL.filter(function (i) { return state.items[i.id]; }); }

  // ---------- Metin karşılaştırma ----------
  var CONTR = {
    "i'm": "i am", "you're": "you are", "we're": "we are", "they're": "they are",
    "he's": "he is", "she's": "she is", "it's": "it is", "that's": "that is", "there's": "there is",
    "what's": "what is", "who's": "who is", "where's": "where is", "how's": "how is", "let's": "let us",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "don't": "do not", "doesn't": "does not", "didn't": "did not", "can't": "can not", "cannot": "can not",
    "couldn't": "could not", "won't": "will not", "wouldn't": "would not", "shouldn't": "should not",
    "haven't": "have not", "hasn't": "has not", "hadn't": "had not", "mustn't": "must not",
    "i've": "i have", "you've": "you have", "we've": "we have", "they've": "they have",
    "i'll": "i will", "you'll": "you will", "he'll": "he will", "she'll": "she will", "it'll": "it will",
    "we'll": "we will", "they'll": "they will", "i'd": "i would", "you'd": "you would", "he'd": "he would",
    "she'd": "she would", "we'd": "we would", "they'd": "they would", "gonna": "going to", "wanna": "want to"
  };
  function normEn(s) {
    s = String(s).toLowerCase().replace(/[’‘`]/g, "'");
    s = s.replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
    return s.split(" ").map(function (w) { return CONTR[w] || w; }).join(" ").replace(/'/g, "");
  }
  function normTr(s) {
    return String(s).toLocaleLowerCase("tr").replace(/[’‘`']/g, "")
      .replace(/[.,!?;:"()\-–—…]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function lev(a, b) {
    var m = a.length, n = b.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function answersEn(it) { return [it.en].concat(it.altEn || []); }
  // 0: yanlış, 1: küçük yazım hatası, 2: tam doğru
  function gradeTyped(input, it) {
    var x = normEn(input); if (!x) return 0;
    var best = 0;
    answersEn(it).forEach(function (a) {
      var y = normEn(a);
      if (x === y) best = 2;
      else if (best < 1 && lev(x, y) <= Math.max(1, Math.floor(y.length / 12))) best = 1;
    });
    return best;
  }
  function wordOverlap(heard, target) {
    var h = normEn(heard).split(" "), t = normEn(target).split(" "), pool = h.slice(), hit = 0;
    t.forEach(function (w) { var k = pool.indexOf(w); if (k >= 0) { hit++; pool.splice(k, 1); } });
    return hit / t.length;
  }
  function tokens(s) {
    return String(s).split(/\s+/).map(function (w) {
      return w.replace(/^[^\wçğıöşüÇĞİÖŞÜ']+|[^\wçğıöşüÇĞİÖŞÜ']+$/g, "");
    }).filter(Boolean);
  }

  // ---------- Ses ----------
  var voice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    var vs = speechSynthesis.getVoices().filter(function (v) { return /^en[-_]/i.test(v.lang); });
    voice = vs.filter(function (v) { return /en[-_]US/i.test(v.lang) && /google|natural|neural/i.test(v.name); })[0] ||
      vs.filter(function (v) { return /en[-_]US/i.test(v.lang); })[0] || vs[0] || null;
  }
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text, slow) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; if (voice) u.voice = voice;
    u.rate = slow ? 0.6 : state.settings.rate;
    speechSynthesis.speak(u);
  }
  var actx = null;
  function tone(notes, type, vol) {
    if (!state.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      notes.forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.09;
        o.frequency.value = f; o.type = type || "sine";
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.16, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.25);
      });
    } catch (e) {}
  }
  function beep(ok) { if (ok) tone([659, 880]); else { tone([311, 233], "triangle", 0.12); vibrate(120); } }
  function fanfare() { tone([523, 659, 784, 1047], "sine", 0.14); }
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  function canSpeak() { return !!Rec && state.settings.speak && Date.now() > state.speakOffUntil; }

  // ---------- Alıştırma üretimi ----------
  function others(pool, it, n, field) {
    var seen = {}; seen[it[field]] = 1;
    var out = [];
    shuffle(pool.filter(function (p) { return p.unit === it.unit; })).concat(shuffle(pool)).forEach(function (p) {
      if (out.length < n && !seen[p[field]]) { seen[p[field]] = 1; out.push(p[field]); }
    });
    return out;
  }
  function distractorTiles(answerToks, lang, n) {
    var have = {}; answerToks.forEach(function (t) { have[t.toLowerCase()] = 1; });
    var out = [];
    shuffle(SENTS).some(function (s) {
      var t = pick(tokens(lang === "en" ? s.en : s.tr));
      if (t && !have[t.toLowerCase()]) { have[t.toLowerCase()] = 1; out.push(t); }
      return out.length >= n;
    });
    return out;
  }
  function makeEx(it, type) {
    if (it.kind === "word") {
      if (!type || !/^(choose_tr|choose_en|listen_choose)$/.test(type)) type = pick(["choose_tr", "choose_en", "listen_choose"]);
      var field = type === "choose_en" ? "en" : "tr";
      return { type: type, item: it, options: shuffle([it[field]].concat(others(WORDS, it, 3, field))) };
    }
    var types = ["build_en", "build_tr", "listen_type"];
    if (it.blank && it.distractors && it.distractors.length) types.push("blank");
    if (canSpeak()) types.push("speak");
    if (!type || /^(choose_tr|choose_en|listen_choose)$/.test(type)) type = pick(types);
    if (type === "speak" && !canSpeak()) type = "listen_type";
    if (type === "blank" && !(it.blank && it.distractors)) type = "build_en";
    var ex = { type: type, item: it };
    if (type === "build_en" || type === "build_tr") {
      var lang = type === "build_en" ? "en" : "tr";
      var ans = tokens(lang === "en" ? it.en : it.tr);
      ex.tiles = shuffle(ans.concat(distractorTiles(ans, lang, Math.min(4, Math.max(2, Math.round(ans.length / 3))))));
    }
    if (type === "blank") ex.options = shuffle([it.blank].concat(it.distractors.slice(0, 3)));
    return ex;
  }
  function buildSession(kind, items, extra) {
    var q = [];
    var w = items.filter(function (i) { return i.kind === "word"; });
    var s = items.filter(function (i) { return i.kind === "sentence"; });
    // Bir oturumda her öğe yalnız bir kez sorulur; pekiştirme tekrar ve sınavda yapılır.
    if (kind === "mixed") {
      var t1 = ["choose_tr", "listen_choose", "choose_en"], t2 = ["build_en", "blank", "build_tr", canSpeak() ? "speak" : "listen_type"];
      shuffle(w).forEach(function (it, i) { q.push(makeEx(it, t1[i % 3])); });
      shuffle(s).forEach(function (it, i) { q.push(makeEx(it, t2[i % 4])); });
    } else if (kind === "practice") {
      // Önce hatalı ve zayıf öğeler, sonra az görülenler; derslerden farklı alıştırma türleri
      var score = function (i) { var st = state.items[i.id]; return st ? st.box * 2 - st.bad * 3 : -1; };
      var pw = shuffle(w).sort(function (a, b) { return score(a) - score(b); });
      var ps = shuffle(s).sort(function (a, b) { return score(a) - score(b); });
      var t3 = ["listen_choose", "choose_en", "choose_tr"], t4 = ["listen_type", "build_tr", canSpeak() ? "speak" : "build_en", "blank"];
      pw.slice(0, 3).forEach(function (it, i) { q.push(makeEx(it, t3[i % 3])); });
      if (pw.length >= 7) q.push({ type: "match", items: pw.slice(3, 7) });
      ps.slice(0, 6).forEach(function (it, i) { q.push(makeEx(it, t4[i % 4])); });
      q = [q[0]].concat(shuffle(q.slice(1)));
    } else if (kind === "test") {
      var ws = shuffle(w);
      ws.slice(0, 4).forEach(function (it) { q.push(makeEx(it)); });
      if (ws.length >= 8) q.push({ type: "match", items: ws.slice(4, 9) });
      var tt = ["build_en", "listen_type", "blank", "build_tr", "speak"];
      shuffle(s).slice(0, 9).forEach(function (it, i) { q.push(makeEx(it, tt[i % tt.length])); });
    } else if (kind === "listen") {
      shuffle(w).slice(0, 4).forEach(function (it) { q.push(makeEx(it, "listen_choose")); });
      shuffle(s).slice(0, 6).forEach(function (it) { q.push(makeEx(it, "listen_type")); });
    } else if (kind === "speak") {
      var sp = s.length ? s : items;
      shuffle(w).slice(0, 2).forEach(function (it) { q.push(makeEx(it, "listen_choose")); });
      shuffle(sp).slice(0, 7).forEach(function (it) { q.push(makeEx(it, "speak")); });
    } else if (kind === "reading") {
      extra.questions.forEach(function (qq, k) {
        q.push({ type: "read", reading: extra, q: qq, n: k,
          options: shuffle(qq.options.map(function (o, j) { return { t: o, ok: j === qq.answer }; })) });
      });
    } else {
      var mw = w.length >= 7 ? shuffle(w).slice(0, 4) : [];
      items.forEach(function (it) {
        if (mw.indexOf(it) >= 0) return;
        q.push(makeEx(it, it.kind === "sentence" ? pick(["build_en", "listen_type", "speak", "blank"]) : null));
      });
      if (mw.length) q.splice(2, 0, { type: "match", items: mw });
    }
    return q;
  }

  // ---------- Gezinme ----------
  var tab = "learn";
  var screen = "tab";
  function go(name, arg) {
    screen = name;
    try { history.pushState({ s: name }, ""); } catch (e) {}
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    render[name](arg);
    window.scrollTo(0, 0);
  }
  function showTab(t) {
    tab = t; screen = "tab";
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    render[t]();
  }
  window.addEventListener("popstate", function () { S = null; closeSheet(); showTab(tab); });
  try { history.scrollRestoration = "manual"; history.replaceState({ s: "tab" }, ""); } catch (e) {}

  function tabbar() {
    var tabs = [["learn", "🏠", "Öğren"], ["practice", "🔁", "Tekrar"], ["profile", "👤", "Profil"]];
    return '<nav class="tabbar">' + tabs.map(function (t) {
      return '<button data-tab="' + t[0] + '" class="' + (tab === t[0] ? "on" : "") + '"><span>' + t[1] + '</span><small>' + t[2] + '</small></button>';
    }).join("") + '</nav>';
  }
  function bindTabbar() {
    app.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { window.scrollTo(0, 0); showTab(b.dataset.tab); }; });
  }
  function ring(pct, inner) {
    return '<span class="ring" style="--p:' + Math.min(100, pct) + '"><span>' + inner + '</span></span>';
  }
  function statsBar() {
    var goal = state.settings.goal, xp = todayXp();
    return '<header class="statsbar">' +
      '<span class="chip ' + (streakNow() && state.streak.last === today() ? "fire" : "") + '">🔥 ' + streakNow() + '</span>' +
      '<span class="chip">⚡ ' + totalXp() + '</span>' +
      '<span class="chip">⭐ Sv ' + levelOf(totalXp()) + '</span>' +
      '<span class="chip goalchip">' + ring(Math.round(xp / goal * 100), "") + ' ' + xp + '/' + goal + '</span>' +
      '</header>';
  }

  // ---------- Alt sayfa (sheet) ----------
  function openSheet(html, bind) {
    closeSheet();
    var d = document.createElement("div");
    d.className = "sheet-wrap"; d.id = "sheet";
    d.innerHTML = '<div class="sheet-bg"></div><div class="sheet">' + html + '</div>';
    document.body.appendChild(d);
    requestAnimationFrame(function () { d.classList.add("open"); });
    d.querySelector(".sheet-bg").onclick = closeSheet;
    if (bind) bind(d);
  }
  function closeSheet() { var d = document.getElementById("sheet"); if (d) d.remove(); }

  var render = {};

  // ---------- Öğren (yol haritası) ----------
  render.learn = function () {
    var cur = currentIndex();
    var h = statsBar() + '<div class="path">';
    COURSE.units.forEach(function (u, ui) {
      var ls = lessonsOf(u);
      var done = ls.filter(isDone).length;
      var sec = Math.floor(ui / 4);
      if (ui % 4 === 0) h += '<div class="section-head"><small>' + (sec + 1) + '. KISIM</small><b>' + esc(SECTIONS[sec] || "") + '</b></div>';
      else h += '<div class="divider"><span>' + esc(u.title) + '</span></div>';
      h += '<section class="unit-block" style="--c:' + u.color + '">' +
        '<div class="unit-banner"><div><small>' + (sec + 1) + '. KISIM, ' + (ui % 4 + 1) + '. ÜNİTE · ' + done + '/' + ls.length + '</small>' +
        '<h2>' + esc(u.title) + '</h2></div><button class="guide-btn" data-guide="' + ui + '" aria-label="Ünite rehberi">📘</button></div>' +
        '<div class="nodes">';
      ls.forEach(function (l, li) {
        var st = state.lessons[l.id];
        var cls = st ? "done" : l.gi === cur ? "current" : l.gi < cur ? "done" : "locked";
        var off = OFFSETS[li % OFFSETS.length];
        var stars = st ? '<span class="stars">' + "★★★".slice(0, st.stars) + '<i>' + "★★★".slice(st.stars) + '</i></span>' : "";
        h += '<div class="node-row' + (cls === "current" ? " cur" : "") + '" style="transform:translateX(' + off + 'px)">' +
          (cls === "current" ? '<div class="start-bubble">BAŞLA</div>' : "") +
          '<button class="node ' + cls + (l.mode === "test" ? " test" : "") + '" data-gi="' + l.gi + '" aria-label="' + esc(l.name) + '">' +
          '<span>' + (cls === "locked" ? "🔒" : cls === "done" && l.mode === "mixed" ? "✓" : l.icon) + '</span></button>' + stars + '</div>';
      });
      h += '</div>';
      if (unitDone(u)) h += '<div class="unit-done">✅ ' + esc(u.title) + ' tamamlandı</div>';
      h += '</section>';
    });
    if (!COURSE.units.length) h += '<p class="muted">Ders içeriği yüklenemedi.</p>';
    if (cur >= PATH.length && PATH.length) h += '<div class="card center">🎓 Bütün üniteleri bitirdiniz. Tekrar sekmesinden pekiştirin.</div>';
    h += '</div>' + tabbar();
    app.innerHTML = h;
    bindTabbar();
    app.querySelectorAll("[data-gi]").forEach(function (b) { b.onclick = function () { nodeSheet(PATH[+b.dataset.gi]); }; });
    app.querySelectorAll("[data-guide]").forEach(function (b) { b.onclick = function () { go("guide", COURSE.units[+b.dataset.guide]); }; });
    var c = app.querySelector(".node.current");
    if (c) c.scrollIntoView({ block: "center" });
  };

  function nodeSheet(l) {
    var cur = currentIndex(), u = l.unit, st = state.lessons[l.id];
    var locked = !st && l.gi > cur;
    var li = lessonsOf(u).indexOf(l) + 1, total = lessonsOf(u).length;
    var desc = l.mode === "test" ? "Ünitenin tamamından " + PASS + "% başarıyla geçin." :
      l.mode === "practice" ? "Ünitede öğrendiklerinizi farklı alıştırmalarla pekiştirin; önce hata yaptıklarınız gelir." :
      l.mode === "listen" ? "Önceki iki dersin kelime ve cümlelerini dinleyerek anlayın." :
      l.mode === "speak" ? "Öğrendiğiniz cümleleri sesli okuyun." :
      l.mode === "reading" ? "Kısa bir metni okuyup soruları cevaplayın." :
      l.mode === "chest" ? "Ödül sandığı: açın ve bonus puan kazanın." :
      l.items.filter(function (i) { return i.kind === "word"; }).length + " yeni kelime, " +
      l.items.filter(function (i) { return i.kind === "sentence"; }).length + " cümle";
    var h = '<div class="sheet-head" style="--c:' + u.color + '"><span class="sheet-icon">' + (locked ? "🔒" : l.icon) + '</span><div>' +
      '<small>' + esc(u.title) + ' · Ders ' + li + '/' + total + '</small><h3>' + esc(l.name) + '</h3><p>' + desc + '</p></div></div>';
    if (locked) {
      var first = lessonsOf(u)[0];
      h += '<p class="muted">Bu ders, önceki dersler bitince açılır.</p>';
      if (u.index > 0 && first.gi > cur) h += '<button class="btn" data-skip>Sınavla bu üniteye atla</button>';
      h += '<button class="btn ghost" data-close>Kapat</button>';
    } else {
      if (st) h += '<p class="muted">En iyi sonuç: %' + st.best + ' · ' + "★★★".slice(0, st.stars) + '</p>';
      if (l.mode === "chest") h += st ? '<p class="muted">Bu sandığı açtınız.</p><button class="btn ghost" data-close>Kapat</button>' : '<button class="btn" data-start>SANDIĞI AÇ</button>';
      else h += '<button class="btn" data-start>' + (st ? "TEKRAR ÇALIŞ" : "BAŞLA") + ' · +' + (l.mode === "test" ? 20 : 10) + ' puan</button>';
    }
    openSheet(h, function (d) {
      var s = d.querySelector("[data-start]");
      if (s) s.onclick = function () { closeSheet(); startLesson(l); };
      var k = d.querySelector("[data-skip]");
      if (k) k.onclick = function () { closeSheet(); startLesson(lessonsOf(u)[lessonsOf(u).length - 1], true); };
      var c = d.querySelector("[data-close]");
      if (c) c.onclick = closeSheet;
    });
  }

  render.guide = function (u) {
    var h = '<div class="topbar"><button class="icon-btn" data-back aria-label="Geri">←</button><div class="title">📘 ' + esc(u.title) + '</div></div>' +
      '<p class="muted">Ünitenin kelimeleri ve cümleleri. Dinlemek için satıra dokunun.</p><div class="list">';
    u.items.forEach(function (it) {
      h += '<button class="row" data-say="' + esc(it.id) + '"><span class="row-main"><b>' + esc(it.en) + '</b><span>' + esc(it.tr) + '</span>' +
        (it.note ? '<small>💡 ' + esc(it.note) + '</small>' : "") + '</span><span class="row-icon">🔊</span></button>';
    });
    app.innerHTML = h + '</div>';
    app.querySelector("[data-back]").onclick = function () { history.back(); };
    app.querySelectorAll("[data-say]").forEach(function (b) { b.onclick = function () { say(BY_ID[b.dataset.say].en); }; });
  };

  // ---------- Tekrar ----------
  render.practice = function () {
    var due = dueItems().length, weak = weakItems().length, seen = seenItems().length;
    function card(act, icon, title, sub, dis) {
      return '<button class="pcard" data-p="' + act + '"' + (dis ? " disabled" : "") + '><span class="pcard-icon">' + icon + '</span>' +
        '<span><b>' + title + '</b><small>' + sub + '</small></span><span class="chev">›</span></button>';
    }
    var h = statsBar() + '<h1 class="page-title">Tekrar</h1><div class="plist">' +
      card("smart", "🧠", "Akıllı tekrar", due ? due + " öğe tekrar zamanı geldi" : "Şu an bekleyen yok; karışık alıştırma", false) +
      card("weak", "🎯", "Hatalarım", weak ? weak + " öğede hata yaptınız; bunları çalışın" : "Henüz hata yok", !weak) +
      card("listen", "🎧", "Dinleme", "Duyduğunuzu anlayın ve yazın", !seen) +
      card("speak", "🎤", "Konuşma", Rec ? "Cümleleri sesli okuyun" : "Bu tarayıcıda konuşma tanıma yok", !seen || !Rec) +
      card("words", "📚", "Kelime listesi", learnedCount() + " öğe öğrenildi · " + seen + " öğe görüldü", !seen) +
      '</div>' + (seen ? "" : '<p class="muted center">Alıştırmalar ilk dersi bitirince açılır.</p>') + tabbar();
    app.innerHTML = h;
    bindTabbar();
    app.querySelectorAll("[data-p]").forEach(function (b) {
      b.onclick = function () {
        var p = b.dataset.p;
        if (p === "smart") startReview();
        else if (p === "weak") startSession("review", shuffle(weakItems().slice(0, 10)), null, "Hatalarım");
        else if (p === "listen") startSession("listen", shuffle(seenItems()).slice(0, 10), null, "Dinleme");
        else if (p === "speak") startSession("speak", shuffle(seenItems().filter(function (i) { return i.kind === "sentence"; })).slice(0, 8), null, "Konuşma");
        else go("words");
      };
    });
  };
  render.words = function () {
    var items = seenItems().sort(function (a, b) { return state.items[a.id].box - state.items[b.id].box; });
    var h = '<div class="topbar"><button class="icon-btn" data-back aria-label="Geri">←</button><div class="title">Kelime listesi</div></div>' +
      '<p class="muted">Çubuk, öğeyi ne kadar sağlam bildiğinizi gösterir. Dinlemek için dokunun.</p><div class="list">';
    items.forEach(function (it) {
      var b = state.items[it.id].box, pct = Math.round(b / (INTERVALS.length - 1) * 100);
      h += '<button class="row" data-say="' + esc(it.id) + '"><span class="row-main"><b>' + esc(it.en) + '</b><span>' + esc(it.tr) + '</span>' +
        '<span class="strength"><span style="width:' + pct + '%"></span></span></span><span class="row-icon">🔊</span></button>';
    });
    app.innerHTML = h + '</div>';
    app.querySelector("[data-back]").onclick = function () { history.back(); };
    app.querySelectorAll("[data-say]").forEach(function (b) { b.onclick = function () { say(BY_ID[b.dataset.say].en); }; });
  };

  // ---------- Profil ----------
  var BADGES = [
    { icon: "🌱", name: "İlk adım", desc: "İlk dersi bitir", v: function () { return state.stats.lessons; }, max: 1 },
    { icon: "🔥", name: "Alev", desc: "7 günlük seri", v: function () { return state.streak.best; }, max: 7 },
    { icon: "🌋", name: "Volkan", desc: "30 günlük seri", v: function () { return state.streak.best; }, max: 30 },
    { icon: "⚡", name: "Enerji", desc: "500 puan topla", v: totalXp, max: 500 },
    { icon: "💎", name: "Elmas", desc: "2.000 puan topla", v: totalXp, max: 2000 },
    { icon: "🎯", name: "Keskin nişancı", desc: "10 kusursuz ders", v: function () { return state.stats.perfect; }, max: 10 },
    { icon: "📚", name: "Kelime avcısı", desc: "100 öğe öğren", v: function () { return learnedCount(); }, max: 100 },
    { icon: "🏆", name: "Bölüm ustası", desc: "3 ünite bitir", v: function () { return COURSE.units.filter(unitDone).length; }, max: 3 },
    { icon: "🎓", name: "Mezun", desc: "Bütün üniteleri bitir", v: function () { return COURSE.units.filter(unitDone).length; }, max: COURSE.units.length || 1 }
  ];
  render.profile = function () {
    var xp = totalXp(), lv = levelOf(xp), lo = levelFloor(lv), hi = levelFloor(lv + 1);
    var st = state.stats, acc = st.correct + st.wrong ? Math.round(st.correct / (st.correct + st.wrong) * 100) : 0;
    var done = PATH.filter(isDone).length, coursePct = PATH.length ? Math.round(done / PATH.length * 100) : 0;
    var days = [], max = 1;
    for (var i = 6; i >= 0; i--) { var d = dayStr(Date.now() - i * DAY), v = state.xp[d] || 0; days.push([d, v]); if (v > max) max = v; }
    var names = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
    var h = '<div class="topbar"><div class="title">Profil</div><button class="icon-btn" data-set aria-label="Ayarlar">⚙️</button></div>' +
      '<div class="card level-card"><div class="level-badge">' + lv + '</div><div class="grow"><small>SEVİYE</small>' +
      '<b>Seviye ' + lv + '</b><div class="bar"><span style="width:' + Math.round((xp - lo) / (hi - lo) * 100) + '%"></span></div>' +
      '<small>' + (hi - xp) + ' puan sonra Seviye ' + (lv + 1) + '</small></div></div>' +
      '<div class="card"><div class="goal-row"><span>B1 kursu ilerlemesi</span><b>%' + coursePct + '</b></div>' +
      '<div class="bar ok"><span style="width:' + coursePct + '%"></span></div><small class="muted">' + done + ' / ' + PATH.length + ' ders · ' +
      COURSE.units.filter(unitDone).length + ' / ' + COURSE.units.length + ' ünite</small></div>' +
      '<div class="sgrid">' +
      '<div class="stat"><b>🔥 ' + streakNow() + '</b><small>günlük seri</small></div>' +
      '<div class="stat"><b>🏅 ' + state.streak.best + '</b><small>en uzun seri</small></div>' +
      '<div class="stat"><b>⚡ ' + xp + '</b><small>toplam puan</small></div>' +
      '<div class="stat"><b>📚 ' + learnedCount() + '</b><small>öğrenilen öğe</small></div>' +
      '<div class="stat"><b>🎯 %' + acc + '</b><small>doğruluk</small></div>' +
      '<div class="stat"><b>⏱ ' + Math.round(st.seconds / 60) + ' dk</b><small>çalışma süresi</small></div></div>' +
      '<div class="card"><div class="goal-row"><span>Son 7 gün</span><span>' + state.settings.goal + ' puan hedef</span></div><div class="chart">' +
      days.map(function (x) {
        var hgt = Math.round(x[1] / Math.max(max, state.settings.goal) * 100);
        return '<div class="col' + (x[1] >= state.settings.goal ? " hit" : "") + '"><small>' + (x[1] || "") + '</small><span style="height:' + Math.max(hgt, 3) + '%"></span><small>' +
          names[new Date(x[0] + "T12:00").getDay()] + '</small></div>';
      }).join("") + '</div></div>' +
      '<h3 class="section-title">Rozetler</h3><div class="badges">' +
      BADGES.map(function (b) {
        var v = Math.min(b.v(), b.max), ok = v >= b.max;
        return '<div class="badge' + (ok ? " got" : "") + '"><span class="b-icon">' + b.icon + '</span><b>' + b.name + '</b><small>' + b.desc + '</small>' +
          '<span class="bar"><span style="width:' + Math.round(v / b.max * 100) + '%"></span></span></div>';
      }).join("") + '</div>' + tabbar();
    app.innerHTML = h;
    bindTabbar();
    app.querySelector("[data-set]").onclick = function () { go("settings"); };
  };

  render.settings = function () {
    var s = state.settings;
    function seg(name, vals, labels) {
      return '<div class="seg">' + vals.map(function (v, i) {
        return '<button data-set="' + name + '" data-v="' + v + '" class="' + (s[name] === v ? "on" : "") + '">' + labels[i] + '</button>';
      }).join("") + '</div>';
    }
    var h = '<div class="topbar"><button class="icon-btn" data-back aria-label="Geri">←</button><div class="title">Ayarlar</div></div>' +
      '<div class="card">' +
      '<div class="setting"><span>Günlük hedef (puan)</span>' + seg("goal", [20, 30, 50, 100], ["20", "30", "50", "100"]) + '</div>' +
      '<div class="setting"><span>Konuşma hızı</span>' + seg("rate", [0.7, 0.9, 1], ["Yavaş", "Normal", "Hızlı"]) + '</div>' +
      '<div class="setting"><span>Ses efektleri</span>' + seg("sound", [true, false], ["Açık", "Kapalı"]) + '</div>' +
      '<div class="setting"><span>Konuşma alıştırması</span>' + seg("speak", [true, false], ["Açık", "Kapalı"]) + '</div>' +
      '</div>' +
      (Rec ? "" : '<p class="muted">Bu tarayıcı konuşma tanımayı desteklemiyor; konuşma alıştırması yerine dinleme gelir.</p>') +
      '<div class="stack"><h3 class="section-title">Yedek</h3>' +
      '<p class="muted">İlerlemeniz yalnız bu telefonda tutulur. Ara sıra yedeği kopyalayıp bir notta saklayın.</p>' +
      '<button class="btn ghost" data-act="copy">Yedeği kopyala</button>' +
      '<textarea class="type" id="restore" placeholder="Yedeği buraya yapıştırın"></textarea>' +
      '<button class="btn ghost" data-act="restore">Yedeği geri yükle</button>' +
      '<button class="btn ghost" data-act="reset">İlerlemeyi sıfırla</button>' +
      '<p class="muted" id="msg"></p></div>';
    app.innerHTML = h;
    var msg = app.querySelector("#msg");
    app.querySelector("[data-back]").onclick = function () { history.back(); };
    app.querySelectorAll("[data-set]").forEach(function (b) {
      b.onclick = function () {
        var v = b.dataset.v; v = v === "true" ? true : v === "false" ? false : +v;
        state.settings[b.dataset.set] = v;
        if (b.dataset.set === "speak" && v) state.speakOffUntil = 0;
        save(); render.settings();
        if (b.dataset.set === "rate") say("This is how fast I will speak.");
      };
    });
    app.querySelector('[data-act="copy"]').onclick = function () {
      var data = JSON.stringify(state), ta = app.querySelector("#restore");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(data).then(function () { msg.textContent = "Yedek kopyalandı."; },
          function () { ta.value = data; msg.textContent = "Kopyalanamadı; metin kutuda, elle kopyalayın."; });
      } else { ta.value = data; msg.textContent = "Metin kutuda, elle kopyalayın."; }
    };
    app.querySelector('[data-act="restore"]').onclick = function () {
      try {
        var s2 = JSON.parse(app.querySelector("#restore").value);
        if (!s2 || s2.v !== 1 || !s2.items) throw 0;
        localStorage.setItem(KEY, JSON.stringify(s2)); state = load(); save(); msg.textContent = "Yedek geri yüklendi.";
      } catch (e) { msg.textContent = "Bu metin geçerli bir yedek değil."; }
    };
    var armed = false;
    app.querySelector('[data-act="reset"]').onclick = function (e) {
      if (!armed) { armed = true; e.target.textContent = "Emin misiniz? Silmek için tekrar dokunun"; return; }
      state = defaults(); save(); history.back();
    };
  };

  // ---------- Ders oturumu ----------
  var S = null;
  function startLesson(l, skipTest) {
    if (l.mode === "chest") return openChest(l);
    startSession(l.mode, l.items, l, skipTest ? "Atlama sınavı" : l.name, l.reading);
  }
  // Bir kelime ilk kez sorulmadan ya da cümlede geçmeden önce öğretme kartı gösterilir.
  function wordKey(en) { return normEn(en).replace(/^(to|a|an|the) /, ""); }
  var WORD_KEYS = [], seenKey = {};
  WORDS.forEach(function (w) {
    var k = wordKey(w.en);
    if (k.length >= 3 && !seenKey[k]) { seenKey[k] = 1; WORD_KEYS.push({ k: k, multi: k.indexOf(" ") > 0, item: w }); }
  });
  // Kelimenin çekimli biçimleri: curtain -> curtains, chop -> chopped, carry -> carries
  function forms(k) {
    var parts = k.split(" "), w = parts.pop(), pre = parts.length ? parts.join(" ") + " " : "", f = [w];
    ["s", "es", "ed", "d", "ing", "er", "est"].forEach(function (x) { f.push(w + x); });
    if (/e$/.test(w)) f.push(w.slice(0, -1) + "ing");
    if (/[^aeiou]y$/.test(w)) f.push(w.slice(0, -1) + "ies", w.slice(0, -1) + "ied");
    if (/[^aeiou][aeiou][^aeiouwy]$/.test(w)) f.push(w + w.slice(-1) + "ed", w + w.slice(-1) + "ing");
    return f.map(function (x) { return " " + pre + x + " "; });
  }
  WORD_KEYS.forEach(function (x) { x.f = forms(x.k); });
  function wordsIn(it) {
    var sent = " " + normEn(it.en) + " ", out = [];
    WORD_KEYS.forEach(function (x) {
      var hit = x.f.some(function (v) { return sent.indexOf(v) >= 0; });
      if (hit) {
        var same = WORDS.filter(function (w) { return wordKey(w.en) === x.k && w.unit === it.unit; })[0];
        out.push(same || x.item);
      }
    });
    return out;
  }
  function known(w) { return !!(state.items[w.id] || state.shown[w.id]); }
  function addIntros(q) {
    var out = [], done = {};
    q.forEach(function (ex) {
      var ws = ex.type === "match" ? ex.items : !ex.item ? [] : ex.item.kind === "word" ? [ex.item] : wordsIn(ex.item);
      ws.forEach(function (w) {
        if (!known(w) && !done[w.id]) { done[w.id] = 1; out.push({ type: "intro", item: w }); }
      });
      out.push(ex);
    });
    return out;
  }
  function startSession(kind, items, lesson, title, extra) {
    if (!items.length && kind !== "reading") return;
    S = { kind: kind, lesson: lesson, title: title || "", queue: addIntros(buildSession(kind, items, extra)), pos: 0,
      correct: 0, wrong: 0, firstOk: 0, firstAll: 0, combo: 0, maxCombo: 0, results: {}, requeued: {}, start: Date.now() };
    go("lesson");
  }
  function openChest(l) {
    if (state.lessons[l.id]) return;
    var gain = 15 + Math.floor(Math.random() * 3) * 5;
    state.lessons[l.id] = { stars: 3, best: 100 };
    state.xp[today()] = todayXp() + gain;
    save();
    openSheet('<div class="center chest-open"><div class="big pop">🎁</div><h3>Sandık açıldı!</h3><p class="muted">Çalışmanızın ödülü</p>' +
      '<div class="chest-gain">⚡ +' + gain + ' puan</div></div><canvas id="fx"></canvas><button class="btn" data-ok>HARİKA</button>', function (d) {
        fanfare(); confetti(d.querySelector("#fx"));
        d.querySelector("[data-ok]").onclick = function () { closeSheet(); render.learn(); };
      });
  }
  function startReview() {
    var due = dueItems().slice(0, 12);
    if (due.length < 6) {
      var seen = seenItems().filter(function (i) { return due.indexOf(i) < 0; });
      seen.sort(function (a, b) { return state.items[a.id].box - state.items[b.id].box; });
      due = due.concat(seen.slice(0, 12 - due.length));
    }
    if (!due.length) due = shuffle(PATH[0].items).slice(0, 5);
    startSession("review", shuffle(due), null, "Akıllı tekrar");
  }
  function record(it, ok, first) {
    if (first) { S.firstAll++; if (ok) S.firstOk++; }
    if (!it) return;
    S.results[it.id] = (it.id in S.results) ? S.results[it.id] && ok : ok;
  }
  function finishSession() {
    var now = Date.now(), r = S;
    Object.keys(r.results).forEach(function (id) {
      var st = state.items[id] || { box: 0, due: 0, ok: 0, bad: 0 };
      if (r.results[id]) { st.box = Math.min(INTERVALS.length - 1, Math.max(1, st.box + 1)); st.ok++; }
      else { st.box = 1; st.bad++; }
      st.due = now + INTERVALS[st.box] * DAY - 3600000;
      state.items[id] = st;
    });
    var acc = r.firstAll ? Math.round(r.firstOk / r.firstAll * 100) : 100;
    var perfect = r.wrong === 0;
    r.acc = acc; r.perfect = perfect;
    r.passed = true;
    var gain = r.kind === "test" ? 20 : 10;
    if (r.kind === "test" && acc < PASS) { r.passed = false; gain = 5; }
    if (perfect) gain += 5;
    r.gain = gain;
    if (r.lesson && r.passed) {
      var stars = acc >= 95 ? 3 : acc >= 80 ? 2 : 1;
      var prev = state.lessons[r.lesson.id];
      state.lessons[r.lesson.id] = { stars: Math.max(stars, prev ? prev.stars : 0), best: Math.max(acc, prev ? prev.best : 0) };
      if (r.kind === "test") lessonsOf(r.lesson.unit).forEach(function (l) { if (!state.lessons[l.id]) state.lessons[l.id] = { stars: 2, best: acc }; });
    }
    var before = todayXp();
    state.xp[today()] = before + gain;
    r.goalNow = before < state.settings.goal && before + gain >= state.settings.goal;
    r.levelUp = levelOf(totalXp() - gain) < levelOf(totalXp());
    var s = state.streak;
    r.streakUp = s.last !== today();
    if (r.streakUp) { s.count = s.last === yesterday() ? s.count + 1 : 1; s.last = today(); s.best = Math.max(s.best, s.count); }
    state.stats.lessons++; if (perfect) state.stats.perfect++;
    state.stats.correct += r.correct; state.stats.wrong += r.wrong;
    state.stats.seconds += Math.min(3600, Math.round((now - r.start) / 1000));
    r.secs = Math.round((now - r.start) / 1000);
    save();
    screen = "finish";
    try { history.replaceState({ s: "finish" }, ""); } catch (e) {}
    render.finish();
  }

  render.lesson = function () {
    if (S.pos >= S.queue.length) return finishSession();
    var ex = S.queue[S.pos];
    var pct = Math.round(S.pos / S.queue.length * 100);
    app.innerHTML = '<div class="lesson-top"><button class="icon-btn" data-act="close" aria-label="Dersi kapat">✕</button>' +
      '<div class="bar lesson-bar"><span style="width:' + pct + '%"></span></div>' +
      (S.combo >= 3 ? '<span class="combo">🔥' + S.combo + '</span>' : "") + '</div>' +
      '<div class="exercise" id="ex"></div><div class="foot" id="foot"></div>';
    app.querySelector('[data-act="close"]').onclick = function () {
      openSheet('<h3 class="center">Dersten çıkılsın mı?</h3><p class="muted center">Bu dersteki ilerleme kaydedilmez.</p>' +
        '<button class="btn" data-stay>Devam et</button><button class="btn ghost danger" data-quit>Çık</button>', function (d) {
          d.querySelector("[data-stay]").onclick = closeSheet;
          d.querySelector("[data-quit]").onclick = function () { closeSheet(); S = null; history.back(); };
        });
    };
    EX[ex.type](ex, app.querySelector("#ex"));
    if (ex.retry) {
      var t = app.querySelector("#ex .new-tag");
      if (t) t.remove();
      app.querySelector("#ex").insertAdjacentHTML("afterbegin", '<span class="new-tag retry-tag">↺ ÖNCEKİ HATA</span>');
    }
  };

  function foot() { return app.querySelector("#foot"); }
  // Alttaki "Kontrol et" düğmesi; check() -> {ok, ans} veya null
  function setCheck(check) {
    var f = foot();
    f.className = "foot";
    f.innerHTML = '<button class="btn" id="chk" disabled>KONTROL ET</button>';
    var b = f.querySelector("#chk");
    b.onclick = function () { var r = check(); if (r) feedback(r); };
    return function (on) { b.disabled = !on; };
  }
  var PRAISE = ["Harika!", "Doğru!", "Çok iyi!", "Mükemmel!", "Süper!", "Aynen böyle!"];
  function feedback(r) {
    var ex = S.queue[S.pos], it = ex.item;
    var first = !ex.retry;
    beep(r.ok);
    record(it, r.ok, first);
    if (r.ok) { S.correct++; S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo); }
    else {
      S.wrong++; S.combo = 0;
      // Yanlış cevaplanan soru 3 soru sonra (az soru kaldıysa sonda) yeniden gelir; en çok 2 kez
      var tries = (ex.tries || 0) + 1;
      if (it && tries <= 2) {
        var again = makeEx(it, ex.type); again.retry = true; again.tries = tries;
        S.queue.splice(Math.min(S.pos + 4, S.queue.length), 0, again);
      }
    }
    var note = it && it.note ? '<div class="note">💡 ' + esc(it.note) + '</div>' : "";
    var head = r.ok ? (r.typo ? "Doğru, küçük bir yazım hatası var" : (S.combo >= 3 ? S.combo + " doğru üst üste! 🔥" : pick(PRAISE))) : "Doğru cevap:";
    var f = foot();
    f.className = "foot " + (r.ok ? "ok" : "bad");
    f.innerHTML = '<div class="fb"><span class="fb-icon">' + (r.ok ? "✓" : "✕") + '</span><div class="fb-text"><b>' + head + '</b>' +
      (r.ans && (!r.ok || r.typo) ? '<div class="ans">' + esc(r.ans) + '</div>' : "") + note + '</div>' +
      (it && it.en ? '<button class="icon-btn fb-say" aria-label="Dinle">🔊</button>' : "") + '</div>' +
      '<button class="btn ' + (r.ok ? "ok" : "bad") + '" id="next">DEVAM</button>';
    app.querySelectorAll("#ex button, #ex textarea").forEach(function (el) { el.disabled = true; });
    var fs = f.querySelector(".fb-say"); if (fs) fs.onclick = function () { say(it.en); };
    if (it && it.en && !r.ok) say(it.en);
    f.querySelector("#next").onclick = function () { S.pos++; render.lesson(); };
  }
  function sayBtns() {
    return '<div class="speak-big"><button class="round" data-say="n" aria-label="Dinle">🔊</button>' +
      '<button class="round small" data-say="s" aria-label="Yavaş dinle">🐢</button></div>';
  }
  function bindSay(root, text) {
    root.querySelectorAll("[data-say]").forEach(function (b) { b.onclick = function () { say(text, b.dataset.say === "s"); }; });
  }
  function inlineSay() { return '<button class="icon-btn say" data-isay aria-label="Dinle">🔊</button>'; }
  function bindInline(root, text) { var b = root.querySelector("[data-isay]"); if (b) b.onclick = function () { say(text); }; }
  function newTag(it) { return it && !state.items[it.id] && !state.shown[it.id] ? '<span class="new-tag">YENİ</span>' : ""; }

  var EX = {};
  function chooseEx(ex, root, label, promptHtml, answer, audio) {
    root.innerHTML = newTag(ex.item) + '<div class="prompt-label">' + label + '</div>' + promptHtml +
      '<div class="options">' + ex.options.map(function (o, i) {
        return '<button class="opt" data-o="' + i + '"><span class="key">' + (i + 1) + '</span>' + esc(o) + '</button>';
      }).join("") + '</div>';
    if (audio) { bindSay(root, audio); bindInline(root, audio); setTimeout(function () { say(audio); }, 250); }
    var sel = -1;
    var enable = setCheck(function () {
      var ok = ex.options[sel] === answer, btns = root.querySelectorAll(".opt");
      btns[sel].classList.add(ok ? "right" : "wrong");
      if (!ok) btns[ex.options.indexOf(answer)].classList.add("right");
      return { ok: ok, ans: answer };
    });
    root.querySelectorAll(".opt").forEach(function (b) {
      b.onclick = function () {
        root.querySelectorAll(".opt").forEach(function (x) { x.classList.remove("sel"); });
        b.classList.add("sel"); sel = +b.dataset.o; enable(true);
      };
    });
  }
  EX.read = function (ex, root) {
    var r = ex.reading;
    root.innerHTML = '<div class="prompt-label">Oku ve yanıtla</div>' +
      '<div class="passage"><button class="icon-btn" data-isay aria-label="Dinle">🔊</button><div><b>' + esc(r.title) + '</b>' +
      r.en.split(/\n+/).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join("") +
      '<details><summary>Türkçesi</summary><p>' + esc(r.tr) + '</p></details></div></div>' +
      '<div class="question">' + (ex.n + 1) + '. ' + esc(ex.q.q) + '</div>' +
      '<div class="options">' + ex.options.map(function (o, i) {
        return '<button class="opt" data-o="' + i + '"><span class="key">' + (i + 1) + '</span>' + esc(o.t) + '</button>';
      }).join("") + '</div>';
    bindInline(root, r.en);
    var sel = -1, right = ex.options.filter(function (o) { return o.ok; })[0].t;
    var enable = setCheck(function () {
      var btns = root.querySelectorAll(".opt"), ok = ex.options[sel].ok;
      btns[sel].classList.add(ok ? "right" : "wrong");
      if (!ok) ex.options.forEach(function (o, i) { if (o.ok) btns[i].classList.add("right"); });
      return { ok: ok, ans: right };
    });
    root.querySelectorAll(".opt").forEach(function (b) {
      b.onclick = function () {
        root.querySelectorAll(".opt").forEach(function (x) { x.classList.remove("sel"); });
        b.classList.add("sel"); sel = +b.dataset.o; enable(true);
      };
    });
  };
  EX.intro = function (ex, root) {
    var it = ex.item;
    var sample = SENTS.filter(function (x) { return x.unit === it.unit && wordsIn(x).indexOf(it) >= 0; })[0];
    root.innerHTML = '<span class="new-tag">YENİ KELİME</span><div class="prompt-label">Bu kelimeyi öğrenin</div>' +
      '<div class="intro-card"><button class="round" data-isay aria-label="Dinle">🔊</button>' +
      '<div class="intro-en">' + esc(it.en) + '</div><div class="intro-tr">' + esc(it.tr) + '</div>' +
      (it.note ? '<div class="intro-note">💡 ' + esc(it.note) + '</div>' : "") +
      (sample ? '<div class="intro-ex"><b>Örnek:</b> ' + esc(sample.en) + '<br><span>' + esc(sample.tr) + '</span></div>' : "") + '</div>';
    bindInline(root, it.en);
    setTimeout(function () { say(it.en); }, 250);
    state.shown[it.id] = 1; save();
    var f = foot();
    f.className = "foot";
    f.innerHTML = '<button class="btn" id="next">ÖĞRENDİM</button>';
    f.querySelector("#next").onclick = function () { S.pos++; render.lesson(); };
  };
  EX.choose_tr = function (ex, root) {
    chooseEx(ex, root, "Bu kelimenin anlamı ne?", '<div class="prompt">' + inlineSay() + '<span>' + esc(ex.item.en) + '</span></div>', ex.item.tr, ex.item.en);
  };
  EX.choose_en = function (ex, root) {
    chooseEx(ex, root, "İngilizcesini seçin", '<div class="prompt"><span>' + esc(ex.item.tr) + '</span></div>', ex.item.en, null);
  };
  EX.listen_choose = function (ex, root) {
    chooseEx(ex, root, "Dinleyin ve anlamını seçin", sayBtns(), ex.item.tr, ex.item.en);
  };
  EX.blank = function (ex, root) {
    var it = ex.item, i = it.en.indexOf(it.blank);
    var shown = esc(it.en.slice(0, i)) + '<span class="gap" id="gap">&nbsp;</span>' + esc(it.en.slice(i + it.blank.length));
    root.innerHTML = newTag(it) + '<div class="prompt-label">Boşluğu doldurun</div>' +
      '<div class="bubble-row"><span class="speaker">💬</span><div class="bubble"><div class="sentence-blank">' + shown + '</div><div class="hint">' + esc(it.tr) + '</div></div></div>' +
      '<div class="options">' + ex.options.map(function (o, k) {
        return '<button class="opt" data-o="' + k + '"><span class="key">' + (k + 1) + '</span>' + esc(o) + '</button>';
      }).join("") + '</div>';
    var sel = -1, gap = root.querySelector("#gap");
    var enable = setCheck(function () {
      var ok = ex.options[sel] === it.blank, btns = root.querySelectorAll(".opt");
      btns[sel].classList.add(ok ? "right" : "wrong");
      if (!ok) btns[ex.options.indexOf(it.blank)].classList.add("right");
      say(it.en);
      return { ok: ok, ans: it.en };
    });
    root.querySelectorAll(".opt").forEach(function (b) {
      b.onclick = function () {
        root.querySelectorAll(".opt").forEach(function (x) { x.classList.remove("sel"); });
        b.classList.add("sel"); sel = +b.dataset.o; gap.textContent = ex.options[sel]; enable(true);
      };
    });
  };
  function buildEx(ex, root, en) {
    var it = ex.item, promptText = en ? it.tr : it.en;
    root.innerHTML = newTag(it) + '<div class="prompt-label">' + (en ? "Bu cümleyi İngilizce kurun" : "Bu cümleyi Türkçe kurun") + '</div>' +
      '<div class="bubble-row"><span class="speaker">' + (en ? "🗨️" : "🔊") + '</span><div class="bubble">' + (en ? "" : inlineSay()) +
      '<span>' + esc(promptText) + '</span></div></div>' +
      '<div class="answer-line" id="line"></div><div class="bank" id="bank">' +
      ex.tiles.map(function (t, i) { return '<button class="tile" data-t="' + i + '">' + esc(t) + '</button>'; }).join("") + '</div>';
    if (!en) { bindInline(root, it.en); setTimeout(function () { say(it.en); }, 250); }
    var line = root.querySelector("#line"), picked = [];
    var enable = setCheck(function () {
      var built = picked.map(function (i) { return ex.tiles[i]; }).join(" ");
      if (en) {
        say(it.en);
        return { ok: answersEn(it).some(function (a) { return normEn(a) === normEn(built); }), ans: it.en };
      }
      return { ok: normTr(built) === normTr(it.tr), ans: it.tr };
    });
    function draw() {
      line.innerHTML = picked.map(function (i, k) { return '<button class="tile" data-k="' + k + '">' + esc(ex.tiles[i]) + '</button>'; }).join("");
      root.querySelectorAll("#bank .tile").forEach(function (b) { b.classList.toggle("used", picked.indexOf(+b.dataset.t) >= 0); });
      line.querySelectorAll(".tile").forEach(function (b) { b.onclick = function () { picked.splice(+b.dataset.k, 1); draw(); }; });
      enable(picked.length > 0);
    }
    root.querySelectorAll("#bank .tile").forEach(function (b) {
      b.onclick = function () { if (picked.indexOf(+b.dataset.t) < 0) { picked.push(+b.dataset.t); if (en) say(ex.tiles[+b.dataset.t]); draw(); } };
    });
  }
  EX.build_en = function (ex, root) { buildEx(ex, root, true); };
  EX.build_tr = function (ex, root) { buildEx(ex, root, false); };
  EX.listen_type = function (ex, root) {
    var it = ex.item;
    root.innerHTML = newTag(it) + '<div class="prompt-label">Duyduğunuzu İngilizce yazın</div>' + sayBtns() +
      '<textarea class="type" id="inp" placeholder="İngilizce yazın" autocapitalize="sentences" autocomplete="off" spellcheck="false"></textarea>';
    bindSay(root, it.en); setTimeout(function () { say(it.en); }, 250);
    var inp = root.querySelector("#inp");
    var enable = setCheck(function () { var g = gradeTyped(inp.value, it); return { ok: g > 0, typo: g === 1, ans: it.en }; });
    inp.oninput = function () { enable(inp.value.trim().length > 0); };
  };
  EX.speak = function (ex, root) {
    var it = ex.item;
    root.innerHTML = newTag(it) + '<div class="prompt-label">Bu cümleyi sesli okuyun</div>' +
      '<div class="bubble-row"><span class="speaker">🎤</span><div class="bubble">' + inlineSay() + '<span>' + esc(it.en) + '</span><div class="hint">' + esc(it.tr) + '</div></div></div>' +
      '<div class="speak-big"><button class="round mic" id="mic" aria-label="Konuşmaya başla">🎤</button></div>' +
      '<div class="hint center" id="heard">Mikrofona dokunup okuyun.</div>' +
      '<div class="center"><button class="link-btn" id="skip">Şu an konuşamıyorum</button></div>';
    bindInline(root, it.en);
    var heard = "", mic = root.querySelector("#mic"), out = root.querySelector("#heard"), rec = null;
    var enable = setCheck(function () { return { ok: wordOverlap(heard, it.en) >= 0.75, ans: it.en }; });
    mic.onclick = function () {
      if (rec) { try { rec.stop(); } catch (e) {} return; }
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      rec = new Rec(); rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 3;
      mic.classList.add("listening"); out.textContent = "Dinliyorum…";
      rec.onresult = function (e) {
        var best = "", bestScore = -1, r = e.results[e.results.length - 1];
        for (var k = 0; k < r.length; k++) {
          var sc = wordOverlap(r[k].transcript, it.en);
          if (sc > bestScore) { bestScore = sc; best = r[k].transcript; }
        }
        heard = best; out.textContent = "“" + best + "”";
        if (heard) enable(true);
      };
      rec.onerror = function (e) {
        out.textContent = e.error === "not-allowed" ? "Mikrofon izni verilmedi. Tarayıcı ayarından açın ya da atlayın." : "Duyulamadı, tekrar deneyin.";
      };
      rec.onend = function () { mic.classList.remove("listening"); rec = null; };
      try { rec.start(); } catch (e) { out.textContent = "Mikrofon başlatılamadı."; mic.classList.remove("listening"); rec = null; }
    };
    root.querySelector("#skip").onclick = function () {
      state.speakOffUntil = Date.now() + 15 * 60000; save();
      S.queue[S.pos] = makeEx(it, "listen_type"); render.lesson();
    };
  };
  EX.match = function (ex, root) {
    var left = shuffle(ex.items), right = shuffle(ex.items);
    root.innerHTML = '<div class="prompt-label">Eşleri bulun</div><div class="match">' +
      left.map(function (it, i) {
        return '<button class="opt" data-side="l" data-id="' + esc(it.id) + '" style="grid-column:1;grid-row:' + (i + 1) + '">' + esc(it.en) + '</button>';
      }).join("") + right.map(function (it, i) {
        return '<button class="opt" data-side="r" data-id="' + esc(it.id) + '" style="grid-column:2;grid-row:' + (i + 1) + '">' + esc(it.tr) + '</button>';
      }).join("") + '</div>';
    foot().innerHTML = ""; foot().className = "foot";
    var selL = null, selR = null, remaining = ex.items.length, mistakes = 0;
    function tryPair() {
      if (!selL || !selR) return;
      var a = selL, b = selR; selL = selR = null;
      if (a.dataset.id === b.dataset.id) {
        [a, b].forEach(function (x) { x.classList.remove("sel"); x.classList.add("right"); });
        setTimeout(function () { a.classList.add("gone"); b.classList.add("gone"); }, 250);
        tone([784], "sine", 0.1);
        if (--remaining === 0) {
          setTimeout(function () {
            var ok = mistakes === 0;
            record(null, ok, true);
            if (ok) { S.correct++; S.combo++; } else S.combo = 0;
            foot().className = "foot ok";
            foot().innerHTML = '<div class="fb"><span class="fb-icon">✓</span><div class="fb-text"><b>' + (ok ? "Kusursuz eşleştirme!" : "Tamamlandı") + '</b></div></div>' +
              '<button class="btn ok" id="next">DEVAM</button>';
            foot().querySelector("#next").onclick = function () { S.pos++; render.lesson(); };
          }, 300);
        }
      } else {
        mistakes++; beep(false);
        [a, b].forEach(function (x) { x.classList.remove("sel"); x.classList.add("wrong"); });
        setTimeout(function () { a.classList.remove("wrong"); b.classList.remove("wrong"); }, 400);
      }
    }
    root.querySelectorAll(".opt").forEach(function (btn) {
      btn.onclick = function () {
        if (btn.dataset.side === "l") { if (selL) selL.classList.remove("sel"); selL = btn; say(BY_ID[btn.dataset.id].en); }
        else { if (selR) selR.classList.remove("sel"); selR = btn; }
        btn.classList.add("sel"); tryPair();
      };
    });
  };

  // ---------- Bitiş ----------
  render.finish = function () {
    var r = S;
    var title = r.kind === "test" ? (r.passed ? "Sınavı geçtiniz!" : "Bu sefer olmadı") : r.perfect ? "Kusursuz ders!" : "Ders tamamlandı!";
    var icon = r.kind === "test" ? (r.passed ? "🏆" : "📘") : r.perfect ? "🌟" : r.acc >= 80 ? "🎉" : "💪";
    var mm = Math.floor(r.secs / 60), ss = r.secs % 60;
    var extras = [];
    if (r.kind === "test" && !r.passed) extras.push("Geçmek için %" + PASS + " gerekiyor; siz %" + r.acc + " yaptınız. Dersleri tekrar edip yeniden deneyin.");
    if (r.levelUp) extras.push("⭐ Yeni seviye: Seviye " + levelOf(totalXp()));
    if (r.goalNow) extras.push("🎯 Bugünkü hedefe ulaştınız");
    if (r.streakUp) extras.push("🔥 Seri " + streakNow() + " güne çıktı");
    app.innerHTML = '<div class="finish"><canvas id="fx"></canvas><div class="big pop">' + icon + '</div><h2>' + title + '</h2>' +
      (r.title ? '<p class="muted">' + esc(r.title) + '</p>' : "") +
      '<div class="stats">' +
      '<div class="stat gold"><small>TOPLAM PUAN</small><b>⚡ <span id="cnt">0</span></b></div>' +
      '<div class="stat green"><small>DOĞRULUK</small><b>🎯 %' + r.acc + '</b></div>' +
      '<div class="stat blue"><small>SÜRE</small><b>⏱ ' + mm + ':' + (ss < 10 ? "0" : "") + ss + '</b></div></div>' +
      extras.map(function (x) { return '<div class="extra">' + x + '</div>'; }).join("") +
      '<button class="btn" id="home">DEVAM</button></div>';
    var n = 0, el = app.querySelector("#cnt");
    var t = setInterval(function () { n++; el.textContent = n; if (n >= r.gain) clearInterval(t); }, 40);
    if (r.perfect || r.levelUp || r.goalNow || (r.kind === "test" && r.passed)) { fanfare(); confetti(app.querySelector("#fx")); }
    else tone([523, 784], "sine", 0.12);
    app.querySelector("#home").onclick = function () { S = null; history.back(); };
  };
  function confetti(cv) {
    if (!cv) return;
    var ctx = cv.getContext("2d"), W = cv.width = cv.offsetWidth, H = cv.height = cv.offsetHeight, ps = [];
    for (var i = 0; i < 90; i++) ps.push({ x: W / 2, y: H / 3, vx: (Math.random() - .5) * 9, vy: Math.random() * -9 - 3,
      c: COLORS[i % COLORS.length], s: 4 + Math.random() * 5, r: Math.random() * 6 });
    var frames = 0;
    (function step() {
      ctx.clearRect(0, 0, W, H);
      ps.forEach(function (p) { p.vy += 0.25; p.x += p.vx; p.y += p.vy; p.r += 0.2; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore(); });
      if (++frames < 150 && document.body.contains(cv)) requestAnimationFrame(step); else ctx.clearRect(0, 0, W, H);
    })();
  }

  showTab("learn");
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(function () {});
})();
