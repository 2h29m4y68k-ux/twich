/* TWITCH SIM — умный чат (ИИ), анализ экрана, раскладка как у Twitch.
   Подключается после основного скрипта: <script src="ai-chat.js"></script> */
(() => {
  const $ = (id) => document.getElementById(id);
  const LS = "twichAI";
  const P = [["LunaPixel","#d68dff","✨"],["M0onCat","#ff9a75","🐱"],["Kaktusik","#7bd88f","🌵"],["neon_fox","#ff8298","🦊"],["sh0gun","#87b8ff","⚡"],["mila_mila","#ffc857","🌼"],["QuietStorm","#bd9dff","☁️"],["vanya_live","#67d8d4","🎧"],["pandaTea","#e5a2c9","🐼"],["pixel_nika","#ffbd8f","🍑"],["frogEnjoyer","#a9d978","🐸"],["NightOwl","#8eabff","🌙"]];
  const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
  const cfg = Object.assign({ key: "", model: "claude-haiku-5-5", name: "Стример", topic: "", vision: true, idle: 18 }, load());
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch {} };

  const feed = $("chatFeed"), input = $("chatInput");
  const hist = []; // {u, t}
  let busy = false, pending = null, topic = "", buf = "", lastAct = Date.now(), lastScreen = Date.now(), lastFrame = 0, warned = false, lastErr = 0;
  const isLive = () => !$("liveBadge").hidden;
  const pick = (n) => P.find((p) => p[0] === n) || P[Math.floor(Math.random() * P.length)];
  const remember = (u, t) => { hist.push({ u, t }); if (hist.length > 30) hist.shift(); };

  /* ---------- чат ---------- */
  function addLine(name, color, emoji, text, own) {
    const l = document.createElement("div");
    l.className = "chat-line"; l.dataset.ai = "1";
    const a = document.createElement("span"); a.className = "chat-avatar"; a.textContent = emoji; a.style.background = color + "33";
    const n = document.createElement("span"); n.className = "chat-name"; n.textContent = name; n.style.color = color;
    const m = document.createElement("span"); m.className = "chat-message"; m.textContent = text;
    l.append(a, n, m); feed.append(l);
    feed.scrollTop = feed.scrollHeight;
    lastAct = Date.now();
  }
  function sys(text) {
    const s = document.createElement("div");
    s.className = "system-message"; s.dataset.ai = "1"; s.textContent = text;
    feed.append(s); feed.scrollTop = feed.scrollHeight;
  }
  // Пока не вижу остальной код: убираем сообщения старых ботов, оставляя только ИИ-чат.
  new MutationObserver((list) => list.forEach((r) => r.addedNodes.forEach((n) => {
    if (n.nodeType === 1 && n.classList.contains("chat-line") && !n.dataset.ai) n.remove();
  }))).observe(feed, { childList: true });

  document.addEventListener("submit", (e) => {
    if (e.target.id !== "chatForm") return;
    e.preventDefault(); e.stopImmediatePropagation();
    const v = input.value.trim(); if (!v) return;
    input.value = "";
    addLine(cfg.name, "#bf94ff", "🎮", v, true);
    remember(cfg.name, v);
    ask("chat", v);
  }, true);

  /* ---------- речь стримера ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, speechOn = false, speechT = null;
  function setSpeech(on) {
    const btn = $("speechButton");
    if (on && !SR) { sys("Этот браузер не умеет распознавать речь. Используй Chrome, Edge или Safari."); return; }
    speechOn = on; btn.classList.toggle("active", on);
    if (!on) { try { rec && rec.stop(); } catch {} return; }
    rec = new SR(); rec.lang = "ru-RU"; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const t = e.results[i][0].transcript.trim(); if (!t) continue;
        buf += (buf ? " " : "") + t; remember(cfg.name + " (голос)", t);
        clearTimeout(speechT); speechT = setTimeout(() => ask("speech"), 1800);
      }
    };
    rec.onerror = (e) => { if (e.error === "not-allowed") { speechOn = false; btn.classList.remove("active"); sys("Нет доступа к микрофону для распознавания речи."); } };
    rec.onend = () => { if (speechOn) setTimeout(() => { try { rec.start(); } catch {} }, 300); };
    try { rec.start(); sys("🎙 Чат тебя слышит."); } catch {}
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#speechButton")) return;
    e.stopImmediatePropagation(); setSpeech(!speechOn);
  }, true);

  /* ---------- кадр с экрана ---------- */
  const cv = document.createElement("canvas"), cx = cv.getContext("2d");
  function frame() {
    const v = $("cameraVideo");
    if (!cfg.vision || v.hidden || !v.videoWidth || v.readyState < 2) return null;
    const w = Math.min(768, v.videoWidth), h = Math.round((v.videoHeight * w) / v.videoWidth);
    cv.width = w; cv.height = h; cx.drawImage(v, 0, 0, w, h);
    return cv.toDataURL("image/jpeg", 0.6).split(",")[1];
  }

  /* ---------- запрос к Claude ---------- */
  const SYS = `Ты — зрители живого чата Twitch-стрима. Пиши только по-русски, как настоящий чат: коротко (до 15 слов), живо, иногда строчными буквами, эмодзи редко. Участники чата: ${P.map((p) => p[0]).join(", ")}. Твоя задача — поддерживать беседу: отвечай на слова и сообщения стримера, держись текущей темы и развивай её, задавай уместные вопросы, иногда отвечайте друг другу. Если приложен скриншот, опирайся на то, что на нём реально видно, ничего не выдумывай, и реагируй как зритель, а не пересказывай сухо. Не повторяй то, что уже было в чате. Не упоминай, что ты ИИ или что это симуляция. Верни только JSON без пояснений: {"topic":"текущая тема в 3-8 словах","messages":[{"user":"имя из списка","text":"..."}]} — от 1 до 4 сообщений от разных участников.`;
  const TASK = {
    speech: "Стример только что сказал вслух (см. ниже). Отреагируйте на это.",
    chat: "Стример написал в чат (см. ниже). Ответьте ему.",
    screen: "Посмотрите на скриншот его экрана и отреагируйте на то, что там видно: прокомментируйте или спросите о нём.",
    idle: "В чате затишье. Мягко продолжите тему беседы или задайте стримеру вопрос по теме."
  };

  async function ask(reason, typed) {
    if (!cfg.key) { if (!warned) { sys("Чтобы чат заработал, нажми «⚙ ИИ-чат» и вставь API-ключ Anthropic."); warned = true; } return; }
    if (busy) { pending = reason; return; }
    busy = true;
    try {
      const now = Date.now();
      const img = reason === "screen" || now - lastFrame > 25000 ? frame() : null;
      if (img) lastFrame = now;
      if (reason === "screen") lastScreen = now;
      const heard = buf; buf = "";
      const text = [
        `Стример: ${cfg.name}. ${cfg.topic ? "Тема, которую он задал: " + cfg.topic + "." : ""} ${topic ? "Текущая тема беседы: " + topic + "." : ""}`,
        `Что сейчас на сцене: ${$("cameraLabel").hidden ? "ничего не показывает" : $("cameraLabel").textContent}.`,
        heard ? `Стример сказал: «${heard}»` : "",
        typed ? `Стример написал в чат: «${typed}»` : "",
        "Последние сообщения чата:\n" + (hist.slice(-20).map((h) => `${h.u}: ${h.t}`).join("\n") || "(пусто)"),
        "Задача: " + TASK[reason]
      ].filter(Boolean).join("\n\n");
      const content = [];
      if (img) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } });
      content.push({ type: "text", text });
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": cfg.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: cfg.model, max_tokens: 500, system: SYS, messages: [{ role: "user", content }] })
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(r.status + " " + (e.error?.message || "")); }
      const d = await r.json();
      const j = JSON.parse((d.content.map((x) => x.text || "").join("").match(/\{[\s\S]*\}/) || ["{}"])[0]);
      if (j.topic) topic = String(j.topic).slice(0, 80);
      let t = 0;
      (j.messages || []).slice(0, 4).forEach((m) => {
        const s = String(m.text || "").slice(0, 200); if (!s) return;
        t += 500 + Math.min(2200, s.length * 45);
        setTimeout(() => { const p = pick(m.user); addLine(p[0], p[1], p[2], s); remember(p[0], s); }, t);
      });
    } catch (e) {
      if (Date.now() - lastErr > 15000) { lastErr = Date.now(); sys("ИИ-чат: " + (e.message || e) + (/^401/.test(e.message) ? " — проверь API-ключ." : "")); }
    } finally {
      busy = false;
      if (pending) { const p = pending; pending = null; setTimeout(() => ask(p), 800); }
    }
  }

  // Поддержание беседы: затишье → вопрос по теме, раз в ~45 с → взгляд на экран.
  setInterval(() => {
    if (!isLive() || busy) return;
    const now = Date.now();
    if (cfg.vision && now - lastScreen > 45000 && frame()) ask("screen");
    else if (now - lastAct > cfg.idle * 1000) ask("idle");
  }, 4000);
  new MutationObserver(() => { if (isLive()) { lastAct = lastScreen = Date.now(); if (!speechOn && SR) sys("🎙 Нажми на кнопку речи — чат будет слышать тебя."); } })
    .observe($("liveBadge"), { attributes: true, attributeFilter: ["hidden"] });

  /* ---------- настройки ---------- */
  const dlg = document.createElement("dialog");
  dlg.className = "guest-dialog";
  dlg.innerHTML = `<h2>ИИ-чат</h2>
    <p>Ключ хранится только в этом браузере (localStorage) и уходит только в api.anthropic.com. Не публикуй страницу с вписанным ключом.</p>
    <label class="ai-field">API-ключ Anthropic<input id="aiKey" type="password" autocomplete="off" placeholder="sk-ant-…"></label>
    <label class="ai-field">Модель<input id="aiModel"></label>
    <label class="ai-field">Твоё имя в чате<input id="aiName"></label>
    <label class="ai-field">Тема стрима (необязательно)<input id="aiTopic" placeholder="например: играем в Minecraft"></label>
    <label class="ai-field">Пауза до нового вопроса от чата, сек<input id="aiIdle" type="number" min="8" max="120"></label>
    <label class="ai-check"><input id="aiVision" type="checkbox"> Чат видит экран (кадр уходит в модель)</label>
    <div class="guest-dialog-actions"><button class="secondary-button" id="aiClose" type="button">Отмена</button><button class="primary-button" id="aiSave" type="button">Сохранить</button></div>`;
  document.body.append(dlg);
  const btn = document.createElement("button");
  btn.className = "secondary-button"; btn.id = "aiBtn"; btn.type = "button"; btn.textContent = "⚙ ИИ-чат";
  $("topStatus").after(btn);
  btn.onclick = () => {
    $("aiKey").value = cfg.key; $("aiModel").value = cfg.model; $("aiName").value = cfg.name;
    $("aiTopic").value = cfg.topic; $("aiIdle").value = cfg.idle; $("aiVision").checked = cfg.vision; dlg.showModal();
  };
  $("aiClose").onclick = () => dlg.close();
  $("aiSave").onclick = () => {
    cfg.key = $("aiKey").value.trim(); cfg.model = $("aiModel").value.trim() || "claude-haiku-5-5";
    cfg.name = $("aiName").value.trim() || "Стример"; cfg.topic = $("aiTopic").value.trim();
    cfg.idle = Math.max(8, Math.min(120, +$("aiIdle").value || 18)); cfg.vision = $("aiVision").checked;
    save(); warned = false; dlg.close(); sys(cfg.key ? "ИИ-чат настроен." : "Ключ не указан.");
  };

  /* ---------- раскладка как у Twitch ---------- */
  const chat = $("chatPanel"), mq = matchMedia("(min-width: 900px)");
  const head = document.createElement("div"); head.className = "tw-chat-head"; head.textContent = "ЧАТ ТРАНСЛЯЦИИ"; chat.prepend(head);
  input.placeholder = "Отправить сообщение";
  const place = () => { document.body.classList.toggle("tw-desktop", mq.matches); (mq.matches ? $("layout") : $("stage")).append(chat); };
  mq.addEventListener("change", place); place();
  const search = document.createElement("div"); search.className = "tw-search";
  search.innerHTML = '<input placeholder="Поиск" aria-label="Поиск" disabled><i>⌕</i>';
  document.querySelector(".top-divider").before(search);
  const follow = document.createElement("button");
  follow.className = "tw-follow"; follow.type = "button"; follow.textContent = "♡ Подписаться";
  follow.onclick = () => { const on = follow.classList.toggle("on"); follow.textContent = on ? "♥ Вы подписаны" : "♡ Подписаться"; };
  document.querySelector(".stream-actions").prepend(follow);
})();
