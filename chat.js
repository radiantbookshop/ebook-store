/* Radiant eBookshop — support chatbox client. Talks to the Cloudflare Worker. */
(function () {
  "use strict";
  var RC = window.RC || {};
  var W = RC.WORKER_URL || "";

  var vid = null;
  try { vid = localStorage.getItem("rc_vid"); } catch (e) {}
  if (!vid) {
    vid = "v" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    try { localStorage.setItem("rc_vid", vid); } catch (e) {}
  }

  var lastTs = 0, greeted = false, pollTimer = null, awaitingEmail = false;
  var pendingOrder = null; // {pid, name} waiting for email

  var fab, panel, msgs, quick, form, input, fileInput, dot;

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function linkify(s) {
    return esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function addMsg(from, text) {
    var m = el("div", "msg " + from, linkify(text));
    msgs.appendChild(m);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function addImgMsg(from, dataUrl) {
    var m = el("div", "msg " + from);
    var img = el("img");
    img.src = dataUrl;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "8px";
    m.appendChild(img);
    msgs.appendChild(m);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function greet() {
    if (greeted) return;
    greeted = true;
    addMsg("o", "မင်္ဂလာပါ 🙏 Radiant eBookshop က ကူညီပေးပါမယ်။ မေးချင်တာရှိရင် ဒီမှာ ရေးလိုက်ပါ။");
  }

  function api(path, opts) {
    return fetch(W + path, opts).then(function (r) { return r.json(); });
  }

  function sendText(text) {
    text = (text || "").trim();
    if (!text) return;
    if (awaitingEmail) {
      awaitingEmail = false;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) {
        addMsg("o", "Gmail လိပ်စာ မှားနေပါတယ် — ဥပမာ name@gmail.com လို ပြန်ရိုက်ပေးပါ။");
        awaitingEmail = true;
        return;
      }
      addMsg("v", text);
      api("/api/chat/email", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitor_id: vid, email: text })
      }).then(function (r) {
        if (!r || r.ok === false) throw new Error("save failed");
        addMsg("o", "✅ မှတ်ထားလိုက်ပါပြီ။ မှာချင်တဲ့စာအုပ်နာမည် ပြောပြပါ — ငွေချေပြီးရင် ပြေစာပုံကို 📷 ခလုတ်နဲ့ တင်ပေးပါ။");
        if (pendingOrder) {
          var po = pendingOrder; pendingOrder = null;
          createOrder(po.pid, po.name);
        }
      }).catch(function () {
        awaitingEmail = true;
        addMsg("o", "⚠️ ခဏတာ သိမ်းမရဖြစ်နေပါတယ် — Gmail လိပ်စာကို နောက်တစ်ခေါက် ပြန်ပို့ပေးပါ။");
      });
      return;
    }
    addMsg("v", text);
    api("/api/chat/send", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitor_id: vid, text: text })
    });
  }

  function sendImage(file) {
    if (!file || !file.type.match(/^image\//)) return;
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      var c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      var dataUrl = c.toDataURL("image/jpeg", 0.8);
      var b64 = dataUrl.split(",")[1];
      URL.revokeObjectURL(img.src);
      // Show the actual image in chat (not just text)
      addImgMsg("v", dataUrl);
      api("/api/chat/send", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitor_id: vid, text: "", image_b64: b64, image_name: file.name })
      }).then(function (r) {
        if (!r.ok) addMsg("o", "ပုံ ပို့ရာမှာ အမှားဖြစ်နေပါတယ် — ပြန်စမ်းကြည့်ပါ။");
        else addMsg("o", "✅ ပြေစာပုံ ရရှိပါပြီ — စစ်ဆေးပြီးရင် ဖိုင်ပို့ပေးပါမယ်။");
      });
    };
    img.src = URL.createObjectURL(file);
  }

  function createOrder(pid, name) {
    api("/api/order", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitor_id: vid, pid: pid, set_name: name })
    }).then(function (r) {
      if (!r.ok) addMsg("o", "အော်ဒါတင်ရာမှာ အမှားဖြစ်နေပါတယ် — chat မှာ တိုက်ရိုက်ပြောပေးပါ။");
    });
  }

  function poll() {
    api("/api/chat/poll?visitor_id=" + encodeURIComponent(vid) + "&since=" + lastTs)
      .then(function (r) {
        (r.messages || []).forEach(function (m) {
          if (m.ts > lastTs) lastTs = m.ts;
          if (m.from === "v") return; // own messages already shown
          addMsg(m.from, m.text);
          if (!panel.classList.contains("open")) {
            dot.classList.add("on");
          }
        });
      })
      .catch(function () {});
  }

  function open() {
    panel.classList.add("open");
    dot.classList.remove("on");
    greet();
    poll();
    if (!pollTimer) pollTimer = setInterval(poll, 3000);
    setTimeout(function () { input.focus(); }, 100);
  }
  function close() { panel.classList.remove("open"); }
  function toggle() { panel.classList.contains("open") ? close() : open(); }

  function orderViaEmail() {
    var d = window._detail || {};
    if (!d.id) return;
    open();
    // ask for email first if we don't have one flow; simplest: go through Gmail pick
    addMsg("o", '📧 "' + d.name + '" ကို Gmail / Drive နဲ့ မှာမယ်ဆိုရင် — ဖိုင်ပို့ပေးရမယ့် Gmail လိပ်စာကို ရိုက်ပေးပါ။');
    awaitingEmail = true;
    pendingOrder = { pid: d.id, name: d.name };
  }

  function init() {
    fab = document.getElementById("chatFab");
    panel = document.getElementById("chatPanel");
    msgs = document.getElementById("chatMsgs");
    quick = document.getElementById("chatQuick");
    form = document.getElementById("chatForm");
    input = document.getElementById("chatInput");
    fileInput = document.getElementById("chatFile");
    dot = fab.querySelector(".dot");

    fab.addEventListener("click", toggle);
    panel.querySelector(".x").addEventListener("click", close);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      sendText(input.value);
      input.value = "";
    });
    panel.querySelector(".imgbtn").addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      if (fileInput.files[0]) sendImage(fileInput.files[0]);
      fileInput.value = "";
    });
    // background poll for notifications even when closed (light)
    setInterval(function () {
      if (!panel.classList.contains("open")) poll();
    }, 15000);
  }

  window.RCChat = { open: open, close: close, toggle: toggle, orderViaEmail: orderViaEmail };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
