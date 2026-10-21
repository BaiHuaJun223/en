/* ============================================================
   鲸落落 · 前端对话逻辑
   无框架、无依赖，一个文件搞定。
   ============================================================ */

(function () {
  "use strict";

  var cfg = window.WHALE_CONFIG || {};
  var maxHistory = cfg.maxHistory || 12;

  /* 接口地址：优先同源 /api/chat；不行就退回 https://api.<本站域名>/api/chat。
     两种部署方式都能跑，页面不用改。 */
  var candidates = [];
  (function () {
    var first = cfg.chatEndpoint || "/api/chat";
    candidates.push(first);
    var host = location.hostname;
    var isLocal = !host || host === "localhost" || /^127\./.test(host) || /^\[?::1\]?$/.test(host);
    if (!isLocal && first.indexOf("://") === -1) {
      candidates.push("https://api." + host.replace(/^www\./, "") + "/api/chat");
    }
  })();

  var endpoint = candidates[0];

  function healthOf(ep) {
    return ep.replace(/\/chat$/, "/health");
  }

  var log = document.getElementById("log");
  var form = document.getElementById("form");
  var input = document.getElementById("input");
  var sendBtn = document.getElementById("send");
  var resetBtn = document.getElementById("reset");
  var statusEl = document.getElementById("status");
  var chips = document.getElementById("chips");

  /** 对话历史：只保留 user / assistant 的纯文本 */
  var history = [];
  var pending = null;   // AbortController
  var busy = false;

  /* ---------------- 渲染工具 ---------------- */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** 极简 markdown：**粗体**、*斜体*、`代码` */
  function format(text) {
    var out = escapeHtml(text);
    out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    return out;
  }

  function makeMsg(role, text) {
    var wrap = document.createElement("div");
    wrap.className = "msg " + (role === "user" ? "msg--me" : "msg--bot");

    var avatar = document.createElement("div");
    avatar.className = "msg__avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = role === "user" ? "🫧" : "🐋";

    var bubble = document.createElement("div");
    bubble.className = "msg__bubble";
    if (text) {
      bubble.innerHTML = format(text);
    } else {
      bubble.innerHTML =
        '<span class="dots" aria-label="正在输入"><i></i><i></i><i></i></span>';
    }

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    log.appendChild(wrap);
    scrollToBottom();
    return bubble;
  }

  function scrollToBottom(force) {
    var nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 140;
    if (force || nearBottom) {
      log.scrollTop = log.scrollHeight;
    }
  }

  function setStatus(state, text) {
    statusEl.classList.remove("is-ok", "is-err");
    if (state) statusEl.classList.add(state);
    statusEl.querySelector("em").textContent = text;
  }

  /* ---------------- 输入框 ---------------- */

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 132) + "px";
  }

  input.addEventListener("input", autoGrow);

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

  /* ---------------- 发送 ---------------- */

  function pushHistory(role, content) {
    history.push({ role: role, content: content });
    while (history.length > maxHistory * 2) history.shift();
  }

  function setBusy(state) {
    busy = state;
    sendBtn.disabled = state;
    sendBtn.textContent = state ? "等等…" : "发送";
  }

  function fail(message) {
    var bubble = makeMsg("assistant", message);
    bubble.parentElement.classList.add("msg--err");
  }

  async function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;

    input.value = "";
    autoGrow();
    makeMsg("user", text);
    pushHistory("user", text);

    setBusy(true);
    pending = new AbortController();

    var bubble = makeMsg("assistant", "");
    var body = { messages: history.slice() };
    var answer = "";

    try {
      var res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: pending.signal,
      });

      if (!res.ok) {
        var detail = "";
        try {
          var j = await res.json();
          detail = (j && (j.error || j.message)) || "";
        } catch (_) {
          /* 忽略 */
        }
        throw new Error(detail || "HTTP " + res.status);
      }

      var type = res.headers.get("content-type") || "";

      if (type.indexOf("text/event-stream") === -1) {
        // 非流式兜底
        var data = await res.json();
        answer =
          (data && data.reply) ||
          (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
          "";
        bubble.innerHTML = format(answer || "（张了张嘴，没发出声音）");
      } else {
        await readStream(res, function (delta) {
          answer += delta;
          bubble.innerHTML = format(answer);
          scrollToBottom();
        });
        if (!answer.trim()) {
          bubble.innerHTML = format("（歪了歪头）……我刚刚走神了，你再说一遍？");
          answer = "";
        }
      }

      if (answer.trim()) pushHistory("assistant", answer);
      setStatus("is-ok", "在线 · 懒得动但醒着");
    } catch (err) {
      if (err && err.name === "AbortError") {
        bubble.parentElement.remove();
      } else {
        bubble.parentElement.classList.add("msg--err");
        bubble.innerHTML = format(
          "（尾巴耷拉下来）……网那头没接上。\n" +
            "可能是 Worker 还没部署、密钥没配，或者额度用完了。\n" +
            "主人去看一眼吧，我只能在这儿干着急。"
        );
        setStatus("is-err", "离线 · 后端没接上");
        console.error("[whale] chat failed:", err);
      }
    } finally {
      pending = null;
      setBusy(false);
      input.focus();
    }
  }

  /** 解析 SSE：DeepSeek 的 data: {...} 每行一包 */
  async function readStream(res, onDelta) {
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;

      buffer += decoder.decode(chunk.value, { stream: true });
      var lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.indexOf("data:") !== 0) continue;

        var payload = line.slice(5).trim();
        if (payload === "[DONE]") return;

        try {
          var json = JSON.parse(payload);
          var delta =
            (json.choices &&
              json.choices[0] &&
              json.choices[0].delta &&
              json.choices[0].delta.content) ||
            "";
          if (delta) onDelta(delta);
        } catch (_) {
          /* 半包/心跳，跳过 */
        }
      }
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    send(input.value);
  });

  resetBtn.addEventListener("click", function () {
    if (pending) pending.abort();
    history = [];
    log.innerHTML = "";
    greet();
    input.focus();
  });

  chips.addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (btn) send(btn.textContent);
  });

  /* ---------------- 启动 ---------------- */

  function greet() {
    makeMsg("assistant", cfg.greeting || "……来了啊。");
  }

  async function probe() {
    for (var i = 0; i < candidates.length; i++) {
      try {
        var res = await fetch(healthOf(candidates[i]), { cache: "no-store" });
        if (!res.ok) continue;
        var j = await res.json();
        endpoint = candidates[i];
        setStatus("is-ok", j && j.configured ? "在线 · 懒得动但醒着" : "在线 · 但还没配密钥");
        return;
      } catch (_) {
        /* 试下一个 */
      }
    }
    setStatus("is-err", "离线 · 后端没接上");
  }

  greet();
  probe();
  // 别在页面刚打开时把视口拽到聊天框
  try { input.focus({ preventScroll: true }); } catch (_) { /* 老浏览器忽略 */ }
})();
