/* Günlük İngilizce: kişisel çalışma uygulaması. Enerji sınırı ve reklam yok.
   İçerik data.js (window.COURSE), ilerleme tarayıcıda (localStorage) tutulur. */
(function () {
  "use strict";

  var COURSE = window.COURSE || { units: [] };
  var KEY = "gunluk-ingilizce-v1";
  var DAY = 86400000;
  var INTERVALS = [0, 1, 3, 7, 14, 30, 60]; // kutu -> gün
  var app = document.getElementById("app");

  // ---------- Kayıt ----------
  function defaults() {
    return {
      v: 1,
      items: {},
      lessons: {},
      xp: {},
      streak: { count: 0, last: "" },
      settings: { goal: 30, rate: 0.9, sound: true, speak: true },
      speakOffUntil: 0
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      var s = JSON.parse(raw);
      var d = defaults();
      for (var k in d) if (!(k in s)) s[k] = d[k];
      for (var k2 in d.settings) if (!(k2 in s.settings)) s.settings[k2] = d.settings[k2];
      return s;
    } catch (e) { return defaults(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* depolama kapalı */ }
  }
  var state = load();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  // ---------- Yardımcılar ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function dayStr(t) {
    var d = new Date(t); var m = d.getMonth() + 1; var g = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (g < 10 ? "0" : "") + g;
  }
  function today() { return dayStr(Date.now()); }
  function yesterday() { return dayStr(Date.now() - DAY); }

  var ALL = [];
  var BY_ID = {};
  COURSE.units.forEach(function (u) {
    u.items.forEach(function (it) { it.unit = u.id; ALL.push(it); BY_ID[it.id] = it; });
  });
  var WORDS = ALL.filter(function (i) { return i.kind === "word"; });
  var SENTS = ALL.filter(function (i) { return i.kind === "sentence"; });

  function lessonsOf(u) {
    var w = u.items.filter(function (i) { return i.kind === "word"; });
    var s = u.items.filter(function (i) { return i.kind === "sentence"; });
    var half = Math.ceil(s.length / 2);
    return [
      { id: u.id + "-L1", name: "Kelimeler", items: w, mode: "words" },
      { id: u.id + "-L2", name: "Cümleler 1", items: s.slice(0, half), mode: "sentences" },
      { id: u.id + "-L3", name: "Cümleler 2", items: s.slice(half), mode: "sentences" }
    ];
  }

  function streakNow() {
    var s = state.streak;
    return (s.last === today() || s.last === yesterday()) ? s.count : 0;
  }
  function dueItems() {
    var now = Date.now();
    return ALL.filter(function (i) {
      var st = state.items[i.id];
      return st && st.box > 0 && st.due <= now;
    }).sort(function (a, b) { return state.items[a.id].due - state.items[b.id].due; });
  }

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
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
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
    var h = normEn(heard).split(" "), t = normEn(target).split(" ");
    var pool = h.slice(), hit = 0;
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
  function beep(ok) {
    if (!state.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var notes = ok ? [660, 880] : [300, 220];
      notes.forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.11;
        o.frequency.value = f; o.type = "sine";
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.2);
      });
    } catch (e) {}
  }
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  function canSpeak() { return !!Rec && state.settings.speak && Date.now() > state.speakOffUntil; }

  // ---------- Alıştırma üretimi ----------
  function others(pool, it, n, field) {
    var seen = {}; seen[it[field]] = 1;
    var same = shuffle(pool.filter(function (p) { return p.unit === it.unit; }));
    var rest = shuffle(pool);
    var out = [];
    same.concat(rest).forEach(function (p) {
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
      type = type || pick(["choose_tr", "choose_en", "listen_choose"]);
      var field = type === "choose_en" ? "en" : "tr";
      return { type: type, item: it, options: shuffle([it[field]].concat(others(WORDS, it, 3, field))) };
    }
    var types = ["build_en", "build_tr", "listen_type"];
    if (it.blank && it.distractors && it.distractors.length) types.push("blank");
    if (canSpeak()) types.push("speak");
    type = type || pick(types);
    if (type === "speak" && !canSpeak()) type = "listen_type";
    if (type === "blank" && !it.blank) type = "build_en";
    var ex = { type: type, item: it };
    if (type === "build_en" || type === "build_tr") {
      var lang = type === "build_en" ? "en" : "tr";
      var ans = tokens(lang === "en" ? it.en : it.tr);
      ex.tiles = shuffle(ans.concat(distractorTiles(ans, lang, Math.min(4, Math.max(2, Math.round(ans.length / 3))))));
    }
    if (type === "blank") ex.options = shuffle([it.blank].concat(it.distractors.slice(0, 3)));
    return ex;
  }
  function buildSession(kind, items) {
    var q = [];
    if (kind === "words") {
      items.forEach(function (it) { q.push(makeEx(it)); });
      q = shuffle(q);
      var five = shuffle(items).slice(0, 5);
      q.splice(Math.min(4, q.length), 0, { type: "match", items: five });
      shuffle(items).slice(0, 4).forEach(function (it) { q.push(makeEx(it)); });
    } else if (kind === "sentences") {
      var first = ["build_en", "blank", "build_tr"], second = ["listen_type", "speak", "build_en"];
      shuffle(items).forEach(function (it, i) { q.push(makeEx(it, first[i % 3])); });
      shuffle(items).forEach(function (it, i) { q.push(makeEx(it, second[i % 3])); });
    } else {
      items.forEach(function (it) {
        q.push(makeEx(it, it.kind === "sentence" ? pick(["build_en", "listen_type", "speak", "blank"]) : null));
      });
      var w = items.filter(function (i) { return i.kind === "word"; });
      if (w.length >= 4) q.splice(2, 0, { type: "match", items: shuffle(w).slice(0, 5) });
    }
    return q;
  }

  // ---------- Ekranlar ----------
  var screen = "home";
  function go(name, arg, replace) {
    screen = name;
    try { history[replace ? "replaceState" : "pushState"]({ s: name }, ""); } catch (e) {}
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    render[name](arg);
    window.scrollTo(0, 0);
  }
  window.addEventListener("popstate", function () { screen = "home"; render.home(); });

  function todayXp() { return state.xp[today()] || 0; }
  function unitProgress(u) {
    var ls = lessonsOf(u), d = 0;
    ls.forEach(function (l) { if (state.lessons[l.id]) d++; });
    return { done: d, total: ls.length };
  }

  var render = {};
  render.home = function () {
    var xp = todayXp(), goal = state.settings.goal, due = dueItems().length;
    var pct = Math.min(100, Math.round(xp / goal * 100));
    var h = '<div class="topbar"><div class="title">Günlük İngilizce</div>' +
      '<span class="chip" title="Seri">🔥 ' + streakNow() + '</span>' +
      '<button class="icon-btn" data-act="settings" aria-label="Ayarlar">⚙️</button></div>' +
      '<div class="card goal"><div class="goal-row"><span>Bugünkü hedef</span><span>' + xp + ' / ' + goal + ' puan</span></div>' +
      '<div class="bar' + (pct >= 100 ? " ok" : "") + '"><span style="width:' + pct + '%"></span></div></div>';
    h += '<button class="review-btn" data-act="review"><span class="big">🔁</span><span><b>' +
      (due ? due + " öğe tekrar bekliyor" : "Serbest tekrar") + '</b><small>' +
      (due ? "Unutmadan önce tekrar edin" : "Öğrendiklerinizden karışık alıştırma") + '</small></span></button>';
    h += '<div class="section-title">Üniteler</div><div class="units">';
    COURSE.units.forEach(function (u, i) {
      var p = unitProgress(u);
      h += '<button class="unit" data-unit="' + i + '"><span class="emoji">' + esc(u.icon || "📘") + '</span>' +
        '<span class="info"><span class="name">' + (i + 1) + '. ' + esc(u.title) + '</span>' +
        '<span class="meta" style="display:block">' + p.done + ' / ' + p.total + ' ders</span>' +
        '<span class="bar" style="display:block"><span style="width:' + Math.round(p.done / p.total * 100) + '%"></span></span></span></button>';
    });
    if (!COURSE.units.length) h += '<p class="muted">Ders içeriği yüklenemedi.</p>';
    h += '</div>';
    app.innerHTML = h;
    app.querySelector('[data-act="settings"]').onclick = function () { go("settings"); };
    app.querySelector('[data-act="review"]').onclick = startReview;
    app.querySelectorAll("[data-unit]").forEach(function (b) {
      b.onclick = function () { go("unit", COURSE.units[+b.dataset.unit]); };
    });
  };

  render.unit = function (u) {
    var h = '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="Geri">←</button>' +
      '<div class="title">' + esc(u.icon || "") + ' ' + esc(u.title) + '</div></div><div class="lessons">';
    lessonsOf(u).forEach(function (l, i) {
      var done = state.lessons[l.id];
      h += '<button class="lesson' + (done ? " done" : "") + '" data-l="' + i + '"><span class="num">' + (done ? "✓" : i + 1) +
        '</span><span><span class="lname" style="display:block">' + esc(l.name) + '</span><small>' + l.items.length +
        (l.mode === "words" ? " kelime" : " cümle") + (done ? " · tekrar çalışabilirsiniz" : "") + '</small></span></button>';
    });
    h += '</div>';
    app.innerHTML = h;
    app.querySelector('[data-act="back"]').onclick = function () { history.back(); };
    var ls = lessonsOf(u);
    app.querySelectorAll("[data-l]").forEach(function (b) {
      b.onclick = function () { var l = ls[+b.dataset.l]; startSession(l.mode, l.items, l.id); };
    });
  };

  render.settings = function () {
    var s = state.settings;
    function seg(name, vals, labels) {
      return '<div class="seg">' + vals.map(function (v, i) {
        return '<button data-set="' + name + '" data-v="' + v + '" class="' + (s[name] === v ? "on" : "") + '">' + labels[i] + '</button>';
      }).join("") + '</div>';
    }
    var h = '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="Geri">←</button><div class="title">Ayarlar</div></div>' +
      '<div class="card">' +
      '<div class="setting"><span>Günlük hedef (puan)</span>' + seg("goal", [20, 30, 50, 100], ["20", "30", "50", "100"]) + '</div>' +
      '<div class="setting"><span>Konuşma hızı</span>' + seg("rate", [0.7, 0.9, 1], ["Yavaş", "Normal", "Hızlı"]) + '</div>' +
      '<div class="setting"><span>Doğru/yanlış sesi</span>' + seg("sound", [true, false], ["Açık", "Kapalı"]) + '</div>' +
      '<div class="setting"><span>Konuşma alıştırması</span>' + seg("speak", [true, false], ["Açık", "Kapalı"]) + '</div>' +
      '</div>' +
      (Rec ? "" : '<p class="muted">Bu tarayıcı konuşma tanımayı desteklemiyor; konuşma alıştırması yerine dinleme gelir.</p>') +
      '<div class="stack"><div class="section-title">Yedek</div>' +
      '<p class="muted">İlerlemeniz yalnız bu telefonda tutulur. Ara sıra yedeği kopyalayıp bir notta saklayın.</p>' +
      '<button class="btn ghost" data-act="copy">Yedeği kopyala</button>' +
      '<textarea class="type" id="restore" placeholder="Yedeği buraya yapıştırın"></textarea>' +
      '<button class="btn ghost" data-act="restore">Yedeği geri yükle</button>' +
      '<button class="btn ghost" data-act="reset">İlerlemeyi sıfırla</button>' +
      '<p class="muted" id="msg"></p></div>';
    app.innerHTML = h;
    var msg = app.querySelector("#msg");
    app.querySelector('[data-act="back"]').onclick = function () { history.back(); };
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
      var data = JSON.stringify(state);
      var ta = app.querySelector("#restore");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(data).then(function () { msg.textContent = "Yedek kopyalandı."; },
          function () { ta.value = data; msg.textContent = "Kopyalanamadı; metin kutuda, elle kopyalayın."; });
      } else { ta.value = data; msg.textContent = "Metin kutuda, elle kopyalayın."; }
    };
    app.querySelector('[data-act="restore"]').onclick = function () {
      try {
        var s = JSON.parse(app.querySelector("#restore").value);
        if (!s || s.v !== 1 || !s.items) throw 0;
        state = s; save(); msg.textContent = "Yedek geri yüklendi.";
      } catch (e) { msg.textContent = "Bu metin geçerli bir yedek değil."; }
    };
    var armed = false;
    app.querySelector('[data-act="reset"]').onclick = function (e) {
      if (!armed) { armed = true; e.target.textContent = "Emin misiniz? Silmek için tekrar dokunun"; return; }
      state = defaults(); save(); go("home", null, true);
    };
  };

  // ---------- Ders oturumu ----------
  var S = null;
  function startSession(kind, items, lessonId) {
    if (!items.length) return;
    S = { kind: kind, lessonId: lessonId, queue: buildSession(kind, items), pos: 0, total: 0,
      correct: 0, wrong: 0, xp: 0, results: {}, requeued: {} };
    S.total = S.queue.length;
    go("lesson");
  }
  function startReview() {
    var due = dueItems().slice(0, 12);
    if (due.length < 6) {
      var seen = ALL.filter(function (i) { return state.items[i.id] && due.indexOf(i) < 0; });
      seen.sort(function (a, b) { return state.items[a.id].box - state.items[b.id].box; });
      due = due.concat(seen.slice(0, 12 - due.length));
    }
    if (!due.length) due = shuffle(lessonsOf(COURSE.units[0])[0].items).slice(0, 8);
    startSession("review", shuffle(due), null);
  }
  function record(it, ok) {
    if (!it) return;
    if (!(it.id in S.results)) S.results[it.id] = ok;
    else S.results[it.id] = S.results[it.id] && ok;
  }
  function finishSession() {
    var now = Date.now();
    Object.keys(S.results).forEach(function (id) {
      var st = state.items[id] || { box: 0, due: 0, ok: 0, bad: 0 };
      if (S.results[id]) { st.box = Math.min(INTERVALS.length - 1, Math.max(1, st.box + 1)); st.ok++; }
      else { st.box = 1; st.bad++; }
      st.due = now + INTERVALS[st.box] * DAY - 3600000;
      state.items[id] = st;
    });
    if (S.lessonId) state.lessons[S.lessonId] = true;
    S.xp += 5;
    state.xp[today()] = todayXp() + S.xp;
    var s = state.streak;
    if (s.last !== today()) { s.count = s.last === yesterday() ? s.count + 1 : 1; s.last = today(); }
    save();
    go("finish", null, true);
  }

  render.lesson = function () {
    if (S.pos >= S.queue.length) return finishSession();
    var ex = S.queue[S.pos];
    var pct = Math.round(S.pos / S.queue.length * 100);
    app.innerHTML = '<div class="lesson-top"><button class="icon-btn" data-act="close" aria-label="Dersi kapat">✕</button>' +
      '<div class="bar"><span style="width:' + pct + '%"></span></div></div>' +
      '<div class="exercise" id="ex"></div><div class="footer" id="foot"></div>';
    app.querySelector('[data-act="close"]').onclick = function () { S = null; go("home", null, true); };
    EX[ex.type](ex, app.querySelector("#ex"));
  };

  var foot = function () { return app.querySelector("#foot"); };
  // Alttaki "Kontrol et" düğmesi; check() -> {ok, ans} veya null (cevap yok)
  function setCheck(check, label) {
    var f = foot();
    f.innerHTML = '<button class="btn" id="chk" disabled>' + (label || "Kontrol et") + '</button>';
    var b = f.querySelector("#chk");
    b.onclick = function () { var r = check(); if (r) feedback(r); };
    return function (on) { b.disabled = !on; };
  }
  function feedback(r) {
    var ex = S.queue[S.pos];
    var it = ex.item;
    beep(r.ok);
    record(it, r.ok);
    if (r.ok) { S.correct++; S.xp += 2; }
    else {
      S.wrong++;
      if (it && !S.requeued[it.id]) { S.requeued[it.id] = 1; S.queue.push(makeEx(it)); }
    }
    var note = it && it.note ? '<div class="note">💡 ' + esc(it.note) + '</div>' : "";
    var html = '<div class="feedback ' + (r.ok ? "ok" : "bad") + '"><b>' +
      (r.ok ? (r.typo ? "Doğru (küçük yazım hatası)" : pick(["Harika!", "Doğru!", "Çok iyi!", "Aynen böyle!"])) : "Doğru cevap:") + '</b>' +
      (r.ans && (!r.ok || r.typo) ? '<div class="ans">' + esc(r.ans) + '</div>' : "") + note + '</div>' +
      '<button class="btn ' + (r.ok ? "ok" : "bad") + '" id="next">Devam</button>';
    foot().innerHTML = html;
    app.querySelectorAll("#ex button, #ex textarea").forEach(function (el) { el.disabled = true; });
    if (it && it.en && !r.ok) say(it.en);
    foot().querySelector("#next").onclick = function () { S.pos++; render.lesson(); };
  }
  function sayBtns(text) {
    return '<div class="speak-big"><button class="round" data-say="n" aria-label="Dinle">🔊</button>' +
      '<button class="round small" data-say="s" aria-label="Yavaş dinle">🐢</button></div>';
  }
  function bindSay(root, text) {
    root.querySelectorAll("[data-say]").forEach(function (b) {
      b.onclick = function () { say(text, b.dataset.say === "s"); };
    });
  }
  function inlineSay(text) { return '<button class="icon-btn say" data-isay aria-label="Dinle">🔊</button>'; }
  function bindInline(root, text) {
    var b = root.querySelector("[data-isay]"); if (b) b.onclick = function () { say(text); };
  }

  var EX = {};
  function chooseEx(ex, root, label, promptHtml, answer, audio) {
    root.innerHTML = '<div class="prompt-label">' + label + '</div>' + promptHtml +
      '<div class="options">' + ex.options.map(function (o, i) {
        return '<button class="opt" data-o="' + i + '">' + esc(o) + '</button>';
      }).join("") + '</div>';
    if (audio) { bindSay(root, audio); bindInline(root, audio); setTimeout(function () { say(audio); }, 250); }
    var sel = -1;
    var enable = setCheck(function () {
      var chosen = ex.options[sel], ok = chosen === answer;
      var btns = root.querySelectorAll(".opt");
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
  EX.choose_tr = function (ex, root) {
    chooseEx(ex, root, "Bu kelimenin anlamı ne?",
      '<div class="prompt">' + inlineSay() + '<span>' + esc(ex.item.en) + '</span></div>', ex.item.tr, ex.item.en);
  };
  EX.choose_en = function (ex, root) {
    chooseEx(ex, root, "İngilizcesini seçin",
      '<div class="prompt"><span>' + esc(ex.item.tr) + '</span></div>', ex.item.en, null);
  };
  EX.listen_choose = function (ex, root) {
    chooseEx(ex, root, "Dinleyin ve anlamını seçin", sayBtns(), ex.item.tr, ex.item.en);
  };
  EX.blank = function (ex, root) {
    var it = ex.item, i = it.en.indexOf(it.blank);
    var shown = esc(it.en.slice(0, i)) + '<span class="gap" id="gap">&nbsp;</span>' + esc(it.en.slice(i + it.blank.length));
    root.innerHTML = '<div class="prompt-label">Boşluğu doldurun</div>' +
      '<div class="sentence-blank">' + shown + '</div><div class="hint">' + esc(it.tr) + '</div>' +
      '<div class="options">' + ex.options.map(function (o, k) {
        return '<button class="opt" data-o="' + k + '">' + esc(o) + '</button>';
      }).join("") + '</div>';
    var sel = -1, gap = root.querySelector("#gap");
    var enable = setCheck(function () {
      var ok = ex.options[sel] === it.blank;
      var btns = root.querySelectorAll(".opt");
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
    var it = ex.item;
    var promptText = en ? it.tr : it.en;
    root.innerHTML = '<div class="prompt-label">' + (en ? "Bu cümleyi İngilizce kurun" : "Bu cümleyi Türkçe kurun") + '</div>' +
      '<div class="prompt">' + (en ? "" : inlineSay()) + '<span>' + esc(promptText) + '</span></div>' +
      '<div class="answer-line" id="line"></div><div class="bank" id="bank">' +
      ex.tiles.map(function (t, i) { return '<button class="tile" data-t="' + i + '">' + esc(t) + '</button>'; }).join("") + '</div>';
    if (!en) { bindInline(root, it.en); setTimeout(function () { say(it.en); }, 250); }
    var line = root.querySelector("#line"), picked = [];
    var enable = setCheck(function () {
      var built = picked.map(function (i) { return ex.tiles[i]; }).join(" ");
      if (en) {
        var ok = answersEn(it).some(function (a) { return normEn(a) === normEn(built); });
        say(it.en);
        return { ok: ok, ans: it.en };
      }
      return { ok: normTr(built) === normTr(it.tr), ans: it.tr };
    });
    function draw() {
      line.innerHTML = picked.map(function (i, k) {
        return '<button class="tile" data-k="' + k + '">' + esc(ex.tiles[i]) + '</button>';
      }).join("");
      root.querySelectorAll("#bank .tile").forEach(function (b) {
        b.classList.toggle("used", picked.indexOf(+b.dataset.t) >= 0);
      });
      line.querySelectorAll(".tile").forEach(function (b) {
        b.onclick = function () { picked.splice(+b.dataset.k, 1); draw(); };
      });
      enable(picked.length > 0);
    }
    root.querySelectorAll("#bank .tile").forEach(function (b) {
      b.onclick = function () { if (picked.indexOf(+b.dataset.t) < 0) { picked.push(+b.dataset.t); draw(); } };
    });
  }
  EX.build_en = function (ex, root) { buildEx(ex, root, true); };
  EX.build_tr = function (ex, root) { buildEx(ex, root, false); };
  EX.listen_type = function (ex, root) {
    var it = ex.item;
    root.innerHTML = '<div class="prompt-label">Duyduğunuzu İngilizce yazın</div>' + sayBtns() +
      '<textarea class="type" id="inp" placeholder="İngilizce yazın" autocapitalize="sentences" autocomplete="off" spellcheck="false"></textarea>';
    bindSay(root, it.en); setTimeout(function () { say(it.en); }, 250);
    var inp = root.querySelector("#inp");
    var enable = setCheck(function () {
      var g = gradeTyped(inp.value, it);
      return { ok: g > 0, typo: g === 1, ans: it.en };
    });
    inp.oninput = function () { enable(inp.value.trim().length > 0); };
  };
  EX.speak = function (ex, root) {
    var it = ex.item;
    root.innerHTML = '<div class="prompt-label">Bu cümleyi sesli okuyun</div>' +
      '<div class="prompt">' + inlineSay() + '<span>' + esc(it.en) + '</span></div><div class="hint">' + esc(it.tr) + '</div>' +
      '<div class="speak-big"><button class="round" id="mic" aria-label="Konuşmaya başla">🎤</button></div>' +
      '<div class="hint" id="heard" style="text-align:center">Mikrofona dokunup okuyun.</div>' +
      '<div style="text-align:center"><button class="link-btn" id="skip">Şu an konuşamıyorum</button></div>';
    bindInline(root, it.en);
    var heard = "", mic = root.querySelector("#mic"), out = root.querySelector("#heard"), rec = null;
    var enable = setCheck(function () {
      var ok = wordOverlap(heard, it.en) >= 0.75;
      return { ok: ok, ans: it.en };
    });
    mic.onclick = function () {
      if (rec) { try { rec.stop(); } catch (e) {} return; }
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      rec = new Rec(); rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 3;
      mic.classList.add("listening"); out.textContent = "Dinliyorum…";
      rec.onresult = function (e) {
        var best = "", bestScore = -1;
        var r = e.results[e.results.length - 1];
        for (var k = 0; k < r.length; k++) {
          var sc = wordOverlap(r[k].transcript, it.en);
          if (sc > bestScore) { bestScore = sc; best = r[k].transcript; }
        }
        heard = best; out.textContent = "“" + best + "”";
        if (heard) enable(true);
      };
      rec.onerror = function (e) {
        out.textContent = e.error === "not-allowed" ? "Mikrofon izni verilmedi. Ayarlardan açın ya da atlayın." : "Duyulamadı, tekrar deneyin.";
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
    foot().innerHTML = "";
    var selL = null, selR = null, left_ = ex.items.length, mistakes = 0;
    function tryPair() {
      if (!selL || !selR) return;
      var a = selL, b = selR; selL = selR = null;
      if (a.dataset.id === b.dataset.id) {
        a.classList.remove("sel"); b.classList.remove("sel");
        a.classList.add("right"); b.classList.add("right");
        setTimeout(function () { a.classList.add("gone"); b.classList.add("gone"); }, 250);
        beep(true);
        if (--left_ === 0) {
          setTimeout(function () {
            S.queue[S.pos].item = null;
            if (mistakes === 0) { S.correct++; S.xp += 2; }
            foot().innerHTML = '<div class="feedback ok"><b>' + (mistakes ? "Tamamlandı" : "Kusursuz!") + '</b></div>' +
              '<button class="btn ok" id="next">Devam</button>';
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
        if (btn.dataset.side === "l") {
          if (selL) selL.classList.remove("sel");
          selL = btn; say(BY_ID[btn.dataset.id].en);
        } else {
          if (selR) selR.classList.remove("sel");
          selR = btn;
        }
        btn.classList.add("sel"); tryPair();
      };
    });
  };

  render.finish = function () {
    var acc = S.correct + S.wrong ? Math.round(S.correct / (S.correct + S.wrong) * 100) : 100;
    var goalHit = todayXp() >= state.settings.goal;
    app.innerHTML = '<div class="finish"><div class="big">' + (acc >= 90 ? "🏆" : acc >= 70 ? "🎉" : "💪") + '</div>' +
      '<h2>' + (S.kind === "review" ? "Tekrar bitti" : "Ders bitti") + '</h2>' +
      '<p class="muted">' + (goalHit ? "Bugünkü hedefe ulaştınız." : "Hedefe " + (state.settings.goal - todayXp()) + " puan kaldı.") + '</p>' +
      '<div class="stats"><div class="stat"><b>+' + S.xp + '</b><small>puan</small></div>' +
      '<div class="stat"><b>%' + acc + '</b><small>doğruluk</small></div>' +
      '<div class="stat"><b>🔥 ' + streakNow() + '</b><small>gün seri</small></div></div>' +
      '<button class="btn" id="home">Ana sayfa</button></div>';
    app.querySelector("#home").onclick = function () { S = null; go("home", null, true); };
  };

  go("home", null, true);
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
