/* Muse Bookshop — web app v1. Static, no build step. */
(function () {
  "use strict";
  var BOT = "musebookfinder_bot";
  var PAGE = 48;

  var MM_D = "၀၁၂၃၄၅၆၇၈၉";
  function mm(n) { return String(n).replace(/[0-9]/g, function (d) { return MM_D[+d]; }); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtSize(b) {
    b = +b || 0;
    if (!b) return "—";
    var u = ["B", "KB", "MB", "GB"], i = 0;
    while (b >= 1024 && i < 3) { b /= 1024; i++; }
    return (b >= 100 ? Math.round(b) : b.toFixed(1)) + " " + u[i];
  }
  function price(s) { return Number(s || 0).toLocaleString("en-US") + " ကျပ်"; }
  function buyUrl(id) { return "https://t.me/" + BOT + "?start=buy_" + id; }

  // deterministic gradient + initials for the title placeholder cover
  var GRADS = [
    ["#3a2b12", "#8a5a13"], ["#1f2a3a", "#3f5a7a"], ["#2a1f33", "#5a3a6e"],
    ["#12332a", "#1f6e52"], ["#33141f", "#7a2a3f"], ["#2b2b2b", "#555555"],
    ["#40260f", "#a06a1c"], ["#1a2e1a", "#3d6b35"]
  ];
  function coverStyle(id) {
    var h = 0, s = String(id);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var g = GRADS[h % GRADS.length];
    return "background:linear-gradient(135deg," + g[0] + "," + g[1] + ")";
  }
  function initials(name) {
    var w = String(name || "").replace(/[^A-Za-z0-9 ]/g, " ").split(" ").filter(Boolean);
    var t = (w[0] ? w[0][0] : "") + (w[1] ? w[1][0] : "");
    return (t || "?").toUpperCase();
  }
  // real cover images (fetched from Open Library); falls back to gradient
  var coverMap = {};
  var coversReady = null;
  function ensureCovers() {
    if (!coversReady) {
      // cache-bust: covers.json grows as the fetcher runs; never serve stale
      var bust = "data/covers.json?v=" + Math.floor(Date.now() / 300000);
      coversReady = fetch(bust, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      }).then(function (d) {
        coverMap = d || {};
        return coverMap;
      }).catch(function () { return coverMap; });
    }
    return coversReady;
  }
  // kick off early so it is likely ready before first render
  ensureCovers();
  function coverHTML(id, name) {
    var c = coverMap[id] || null;
    if (c) {
      return '<img class="coverimg" loading="lazy" src="' + esc(c) + '" alt="' +
        esc(name) + '" onerror="this.outerHTML=window.__coverFallback(\'' + id + '\',\'' +
        esc(name).replace(/'/g, "\\'") + '\')">';
    }
    return '<div class="cover" style="' + coverStyle(id) + '">' + esc(initials(name)) + "</div>";
  }
  function coverBannerHTML(id, name) {
    var c = coverMap[id] || null;
    if (c) {
      return '<div class="banner hasimg"><img loading="lazy" src="' + esc(c) + '" alt="' +
        esc(name) + '"></div>';
    }
    return '<div class="banner" style="' + coverStyle(id) + '">' + esc(initials(name)) + "</div>";
  }
  window.__coverFallback = function (id, name) {
    return '<div class="cover" style="' + coverStyle(id) + '">' + esc(initials(name)) + "</div>";
  };

  var view = document.getElementById("view");
  var qInput = document.getElementById("q");
  var homeData = null, allSets = null, allSetsLoading = null;

  function getJSON(url) {
    return fetch(url, { cache: "force-cache" }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }
  function ensureHome() {
    if (!homeData) homeData = getJSON("data/home.json");
    return homeData;
  }
  function ensureAll() {
    if (allSets) return Promise.resolve(allSets);
    if (!allSetsLoading) {
      allSetsLoading = getJSON("data/sets.json").then(function (d) {
        allSets = d.sets || [];
        return allSets;
      });
    }
    return allSetsLoading;
  }

  function cardHTML(c) {
    return '<a class="card" href="#/s/' + c.id + '">' +
      coverHTML(c.id, c.name) +
      '<div class="cbody"><div class="cname">' + esc(c.name) + "</div>" +
      '<div class="cmeta">' + mm(c.file_count) + " ဖိုင် · " + esc(fmtSize(c.total_size)) + "</div>" +
      '<div class="cprice">' + esc(price(c.price)) + "</div></div></a>";
  }

  function rowHTML(title, countLabel, cards) {
    return '<section class="row"><div class="rowhead"><h2>' + esc(title) + "</h2>" +
      '<span class="count">' + countLabel + "</span></div>" +
      '<div class="rail">' + cards.map(cardHTML).join("") + "</div></section>";
  }

  var shownCount = 0, allList = [];
  function gridHTML(list) {
    return '<div class="grid" id="allGrid">' + list.map(cardHTML).join("") + "</div>";
  }
  function renderMore() {
    var g = document.getElementById("allGrid");
    if (!g) return;
    var next = allList.slice(shownCount, shownCount + PAGE);
    g.insertAdjacentHTML("beforeend", next.map(cardHTML).join(""));
    shownCount += next.length;
    var btn = document.getElementById("moreBtn");
    if (btn) {
      if (shownCount >= allList.length) btn.style.display = "none";
      else btn.textContent = "နောက်ထပ် ပြပါ (" + mm(allList.length - shownCount) + ")";
    }
  }

  function renderHome() {
    view.innerHTML = '<div class="loading">ခဏစောင့်ပါ…</div>';
    Promise.all([ensureHome(), ensureCovers()]).then(function (arr) {
      var d = arr[0];
      var html = "";
      d.series.forEach(function (r) {
        html += rowHTML(r.name, mm(r.count) + " စုံ", r.sets);
      });
      if (d.new && d.new.length) {
        html += rowHTML("🆕 အသစ်ထပ်တိုးများ", mm(d.new.length) + " စုံ", d.new);
      }
      html += '<h2 class="section-title">📚 စာအုပ်အားလုံး</h2><div id="homeAll"><div class="loading">ခဏစောင့်ပါ…</div></div>';
      view.innerHTML = html;
      ensureAll().then(function (sets) {
        allList = sets.slice().sort(function (a, b) {
          return a.name.localeCompare(b.name, undefined, { numeric: true });
        });
        shownCount = 0;
        var host = document.getElementById("homeAll");
        if (!host) return;
        host.innerHTML = gridHTML(allList.slice(0, PAGE)) +
          '<div class="more-wrap"><button class="more-btn" id="moreBtn">နောက်ထပ် ပြပါ</button></div>';
        shownCount = Math.min(PAGE, allList.length);
        document.getElementById("moreBtn").addEventListener("click", renderMore);
        renderMoreBtn();
      });
      function renderMoreBtn() {
        var btn = document.getElementById("moreBtn");
        if (btn && shownCount >= allList.length) btn.style.display = "none";
      }
    }).catch(function () {
      view.innerHTML = '<div class="empty">ဒေတာဖတ်လို့ မရပါ။ ပြန်စမ်းကြည့်ပါ။</div>';
    });
    if (document.activeElement === qInput) qInput.blur();
  }

  function searchSets(sets, q) {
    var toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    var out = [];
    for (var i = 0; i < sets.length; i++) {
      var s = sets[i];
      var hay = (s.name + " " + (s.key || "")).toLowerCase();
      var ok = true;
      for (var t = 0; t < toks.length; t++) {
        if (hay.indexOf(toks[t]) < 0) { ok = false; break; }
      }
      if (!ok) continue;
      var nl = s.name.toLowerCase(), ql = q.toLowerCase();
      var rank = nl.indexOf(ql) === 0 ? 0 : (nl.indexOf(ql) > -1 ? 1 : 2);
      out.push({ s: s, rank: rank });
    }
    out.sort(function (a, b) {
      return a.rank - b.rank || a.s.name.length - b.s.name.length;
    });
    return out.map(function (x) { return x.s; });
  }

  function renderSearch(rawQ) {
    var q = (rawQ || "").trim();
    qInput.value = q;
    if (!q) { location.hash = "#/"; return; }
    view.innerHTML = '<div class="loading">ရှာနေပါတယ်…</div>';
    Promise.all([ensureAll(), ensureCovers()]).then(function (arr) {
      var sets = arr[0];
      var hits = searchSets(sets, q);
      var html = '<a class="back" href="#/">‹ နောက်သို့</a>' +
        '<div class="res-head">"' + esc(q) + '" နဲ့ ပတ်သက်တာ ' +
        mm(hits.length) + " ခု တွေ့ပါတယ်:</div>";
      if (!hits.length) {
        html += '<div class="empty">မတွေ့ပါ။ နာမည်အပြည့်အစုံ ရိုက်ရှာကြည့်ပါ၊ ' +
          'ဒါမှမဟုတ် <a href="https://t.me/' + BOT + '">bot ထဲမှာ</a> မေးကြည့်ပါ။</div>';
      } else {
        html += '<div class="res-list">' + hits.slice(0, 120).map(function (s, i) {
          return '<a class="res-item" href="#/s/' + s.id + '">' +
            '<span class="rnum">' + (i + 1) + ".</span>" +
            coverHTML(s.id, s.name) +
            '<div class="rbody"><div class="rname">' + esc(s.name) + "</div>" +
            '<div class="rmeta">' + mm(s.file_count) + " ဖိုင် · " + esc(fmtSize(s.total_size)) + "</div></div>" +
            '<div class="rprice">' + esc(price(s.price)) + "</div></a>";
        }).join("") + "</div>";
        if (hits.length > 120) {
          html += '<div class="empty">အထက် ၁၂၀ ခုသာ ပြထားပါတယ် — ရှာပုံပိုတိတိကျကျ ရိုက်ပါ။</div>';
        }
      }
      view.innerHTML = html;
      window.scrollTo(0, 0);
    }).catch(function () {
      view.innerHTML = '<div class="empty">ဒေတာဖတ်လို့ မရပါ။ ပြန်စမ်းကြည့်ပါ။</div>';
    });
  }

  function renderDetail(id) {
    view.innerHTML = '<div class="loading">ခဏစောင့်ပါ…</div>';
    Promise.all([getJSON("data/sets/" + encodeURIComponent(id) + ".json"), ensureCovers()]).then(function (arr) {
      var d = arr[0];
      var comps = (d.components && d.components.length)
        ? d.components.join(", ") : "—";
      var files = (d.items || []).map(function (f) {
        var src = f.src === "local"
          ? '<span class="src local">ချက်ချင်းရ</span>'
          : '<span class="src">' + esc(String(f.src).replace("@", "")) + "</span>";
        return '<li><span class="fn">' + esc(f.n) + src + '</span>' +
          '<span class="fs">' + esc(fmtSize(f.s)) + "</span></li>";
      }).join("");
      window._detail = { id: d.id, name: d.name };
      view.innerHTML =
        '<a class="back" href="javascript:history.back()">‹ နောက်သို့</a>' +
        coverBannerHTML(d.id, d.name) +
        "<h1 class='dtitle'>" + esc(d.name) + "</h1>" +
        '<div class="dseries">' + esc(d.series || "") + "</div>" +
        '<div class="chips">' + (d.components || []).map(function (c) {
          return '<span class="chip">' + esc(c) + "</span>";
        }).join("") + "</div>" +
        '<div class="dbox">📦 ပါဝင်မှုများ (' + mm(d.file_count) + " ဖိုင်):<br>" + esc(comps) + "</div>" +
        '<div class="dbox"><ul class="files">' + files + "</ul></div>" +
        '<div class="dbox">စုစုပေါင်း အရွယ်အစား: <b>' + esc(fmtSize(d.total_size)) + "</b></div>" +
        '<div class="buy-note">ငွေပေးချေမှုနှင့် ဖိုင်ပို့ဆောင်မှုကို Telegram bot မှတစ်ဆင့် ဆောင်ရွက်ပါမယ်</div>' +
        '<div class="buybar"><div class="bprice">' + esc(price(d.price)) +
        "<small>တစ်စုံလျှင်</small></div>" +
        '<div class="buybtns">' +
        '<a class="buybtn" href="' + buyUrl(d.id) + '" target="_blank" rel="noopener">ဝယ်ယူမယ်</a>' +
        '<button class="gmailbtn" onclick="window.RCChat && RCChat.orderViaEmail()">📧 Gmail / Drive နဲ့ မှာမယ်</button>' +
        "</div></div>";
      window.scrollTo(0, 0);
    }).catch(function () {
      view.innerHTML = '<a class="back" href="#/">‹ နောက်သို့</a>' +
        '<div class="empty">ဒီစာအုပ် မတွေ့တော့ပါ။ <a href="#/">အစက ပြန်ကြည့်ပါ</a>။</div>';
    });
  }

  function route() {
    var h = location.hash || "#/";
    document.body.classList.toggle("has-buybar", h.indexOf("#/s/") === 0);
    if (h.indexOf("#/s/") === 0) renderDetail(h.slice(4).split("?")[0]);
    else if (h.indexOf("#/search/") === 0) renderSearch(decodeURIComponent(h.slice(9)));
    else {
      if (qInput.value === "" && document.activeElement !== qInput) { /* keep typed text */ }
      renderHome();
    }
  }

  document.getElementById("searchForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = qInput.value.trim();
    if (q) location.hash = "#/search/" + encodeURIComponent(q);
  });
  window.addEventListener("hashchange", route);
  route();
})();
