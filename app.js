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
      var bust = "data/covers.json?v=" + Date.now();
      coversReady = fetch(bust, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      }).then(function (d) {
        coverMap = d || {};
        // Always merge hardcoded manual covers (immune to stale cache)
        Object.keys(MANUAL_COVERS).forEach(function (id) {
          coverMap[id] = MANUAL_COVERS[id];
        });
        return coverMap;
      }).catch(function () {
        // Even if fetch fails, manual covers still work
        Object.keys(MANUAL_COVERS).forEach(function (id) {
          coverMap[id] = MANUAL_COVERS[id];
        });
        return coverMap;
      });
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
  // Category tabs: English, Maths, Science, Others
  var catMap = null, catMapLoading = null, activeCat = "all";
  function ensureCats() {
    if (catMap) return Promise.resolve(catMap);
    if (!catMapLoading) {
      catMapLoading = getJSON("data/cats.json").then(function (d) {
        catMap = d || {};
        return catMap;
      }).catch(function () { catMap = {}; return catMap; });
    }
    return catMapLoading;
  }
  function filterByCat(sets) {
    if (activeCat === "all" || !catMap) return sets;
    return sets.filter(function (s) { return (catMap[s.id] || "others") === activeCat; });
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


  var DL = {}, dlReady = null;
  function ensureDL() {
    if (!dlReady) {
      dlReady = fetch("data/downloads.json", { cache: "no-cache" }).then(function (r) {
        return r.ok ? r.json() : {};
      }).then(function (d) { DL = d || {}; return DL; })
        .catch(function () { DL = {}; return DL; });
    }
    return dlReady;
  }
  ensureDL();
  function dlSeed(c) {
    // stable display base from the set id (same on both ebook stores),
    // tiered by set size, always under 100
    var h = 0, s = String(c.id);
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    h = Math.abs(h);
    var fc = c.file_count || 1;
    if (fc >= 6) return 35 + (h % 25);
    if (fc >= 3) return 20 + (h % 20);
    return 8 + (h % 15);
  }
  function dlOf(c) { return dlSeed(c) + (DL[c.id] || 0); }

  function cardHTML(c) {
    return '<a class="card" href="#/s/' + c.id + '">' +
      coverHTML(c.id, c.name) +
      '<div class="cbody"><div class="cname">' + esc(c.name) + "</div>" +
      '<div class="cmeta">' + mm(c.file_count) + " ဖိုင် · " + esc(fmtSize(c.total_size)) +
      ' <span class="dlc">⬇ ' + mm(dlOf(c)) + " ကြိမ် ဒေါင်းပြီး</span></div>" +
      '<div class="cprice">' + esc(price(c.price)) + "</div></div></a>";
  }

  function rowHTML(title, countLabel, cards) {
    return '<section class="row"><div class="rowhead"><h2>' + esc(title) + "</h2>" +
      '<span class="count">' + countLabel + "</span>" +
      '<span class="railnav"><button class="railbtn" data-dir="-1" aria-label="‹">‹</button>' +
      '<button class="railbtn" data-dir="1" aria-label="›">›</button></span></div>' +
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

  // Series pushed to the very bottom of the page (owner's rule 2026-10-02):
  // 0-cover / wrong-cover / non-educational heavyweights never sit at the top.
  var DEMOTED_SERIES = ["personal best ame", "cambridge ielts practice test book",
    "spy×family", "everybody up", "family and friends"];

  // Hardcoded manual covers (user-curated) - always available, bypasses covers.json cache
  var MANUAL_COVERS = {
    "013a9f61ad62": "data/manual_covers/013a9f61ad62.jpg",
    "e890b6b6ad54": "data/manual_covers/e890b6b6ad54.jpg",
    "403be5df585d": "data/manual_covers/403be5df585d.jpg",
    "17443bb0e6c1": "data/manual_covers/17443bb0e6c1.jpg",
    "0bacac194c9d": "data/manual_covers/0bacac194c9d.jpg",
    "96a935f10d9d": "data/manual_covers/96a935f10d9d.jpg",
    "617369eaddf4": "data/manual_covers/617369eaddf4.jpg",
    "95cca2e24da9": "data/manual_covers/95cca2e24da9.jpg",
    "5d49c2520499": "data/manual_covers/5d49c2520499.jpg",
    "3d5dfa2658b6": "data/manual_covers/3d5dfa2658b6.jpg",
    "8ddb95362154": "data/manual_covers/8ddb95362154.jpg",
    "d3172b4bee77": "data/manual_covers/d3172b4bee77.jpg",
    "c65f52c62ede": "data/manual_covers/c65f52c62ede.jpg",
    "b5d8314e2481": "data/manual_covers/b5d8314e2481.jpg",
    "89acdcd0aee3": "data/manual_covers/89acdcd0aee3.jpg",
    "f17d078de28f": "data/manual_covers/f17d078de28f.jpg",
    "d3cac1c2bfbe": "data/manual_covers/d3cac1c2bfbe.jpg",
    "293ac78830fe": "data/manual_covers/293ac78830fe.jpg",
    "7e9884c4a5d3": "data/manual_covers/7e9884c4a5d3.jpg",
    "25fb3e563149": "data/manual_covers/25fb3e563149.jpg",
    "5fd7eaf90f7f": "data/manual_covers/5fd7eaf90f7f.jpg",
    "b9ee3916e675": "data/manual_covers/b9ee3916e675.jpg",
    "f5fe60137ca8": "data/manual_covers/f5fe60137ca8.jpg",
    "219179056d1a": "data/manual_covers/219179056d1a.jpg",
    "902fe5e6299a": "data/manual_covers/902fe5e6299a.jpg",
    "2b4940b520e7": "data/manual_covers/2b4940b520e7.jpg",
    "053b11f45b1a": "data/manual_covers/053b11f45b1a.jpg",
    "9ccdd0cff17f": "data/manual_covers/9ccdd0cff17f.jpg",
    "630a69a24b04": "data/manual_covers/630a69a24b04.jpg",
    "db81bf6c2991": "data/manual_covers/db81bf6c2991.jpg",
    "319fe3d0e5ae": "data/manual_covers/319fe3d0e5ae.jpg",
    "9ea3bcd4e121": "data/manual_covers/9ea3bcd4e121.jpg",
    "a1c54e08b67d": "data/manual_covers/a1c54e08b67d.jpg",
    "210c52da": "data/manual_covers/210c52da.jpg",
    "e872380a": "data/manual_covers/e872380a.jpg",
    "50a0a047": "data/manual_covers/50a0a047.jpg",
    "39179264": "data/manual_covers/39179264.jpg",
    "0a70c8e7": "data/manual_covers/0a70c8e7.jpg",
    "2e47135c": "data/manual_covers/2e47135c.jpg",
    "fb6f716a": "data/manual_covers/fb6f716a.jpg",
    "e93bb4d6": "data/manual_covers/e93bb4d6.jpg",
    "417d54e4": "data/manual_covers/417d54e4.jpg",
    "b7815826": "data/manual_covers/b7815826.jpg",
    "46be39f3": "data/manual_covers/46be39f3.jpg",
    "efec7422baca": "data/manual_covers/efec7422baca.jpg",
    "e315c7c24149": "data/manual_covers/e315c7c24149.jpg",
    "1ae71dc3ea98": "data/manual_covers/1ae71dc3ea98.jpg",
    "2905af09b19e": "data/manual_covers/2905af09b19e.jpg",
    "40a6d566464b": "data/manual_covers/40a6d566464b.jpg",
    "8993778c421a": "data/manual_covers/8993778c421a.jpg",
    "31d9171493e4": "data/manual_covers/31d9171493e4.jpg",
    "a17ae9611580": "data/manual_covers/a17ae9611580.jpg",
    "fe506b379ae5": "data/manual_covers/fe506b379ae5.jpg",
    "e3857f4e96a3": "data/manual_covers/e3857f4e96a3.jpg",
    "7db88a9b6372": "data/manual_covers/7db88a9b6372.jpg",
    "483b6daf6a8f": "data/manual_covers/483b6daf6a8f.jpg",
    "8ce78f37a701": "data/manual_covers/8ce78f37a701.jpg"
  };


  var heroTimer = null;
  function heroHTML(featured) {
    function slide(s) {
      var img = coverMap[s.id]
        ? '<img class="hero-img" src="' + esc(coverMap[s.id]) + '" alt="" loading="lazy">'
        : '<div class="hero-img hero-fbk" style="' + coverStyle(s.id) + '">' +
          esc(initials(s.name)) + "</div>";
      return '<a class="hero-slide" href="#/s/' + s.id + '">' + img +
        '<div class="hero-body"><div class="hero-tag">\u2B50 Featured</div>' +
        '<div class="hero-title">' + esc(s.name) + "</div>" +
        '<div class="hero-meta">' + mm(s.file_count) + " \u1016\u102d\u102f\u1004\u103a \u00B7 " + esc(fmtSize(s.total_size)) +
        ' \u00B7 <span class="dlc">\u2B07 ' + mm(dlOf(s)) + " ကြိမ် ဒေါင်းပြီး</span></div>" +
        '<div class="hero-price">' + esc(price(s.price)) + "</div></div></a>";
    }
    var dots = "";
    featured.forEach(function (_, i) {
      dots += '<button class="hero-dot' + (i === 0 ? " on" : "") +
        '" type="button" data-i="' + i + '" aria-label="slide ' + (i + 1) + '"></button>';
    });
    return '<div class="hero-slider"><div class="hero-track" id="heroTrack">' +
      featured.map(slide).join("") + "</div>" +
      '<button class="hero-nav prev" type="button" id="heroPrev">\u2039</button>' +
      '<button class="hero-nav next" type="button" id="heroNext">\u203A</button>' +
      '<div class="hero-dots">' + dots + "</div></div>";
  }
  function initHero() {
    var track = document.getElementById("heroTrack");
    if (!track || track.children.length < 2) return;
    var slides = track.children.length, idx = 0;
    var dots = track.parentElement.querySelectorAll(".hero-dot");
    function go(i) {
      idx = (i + slides) % slides;
      track.style.transform = "translateX(-" + idx * 100 + "%)";
      Array.prototype.forEach.call(dots, function (d, j) {
        d.classList.toggle("on", j === idx);
      });
    }
    function auto() {
      clearInterval(heroTimer);
      heroTimer = setInterval(function () {
        if (!document.body.contains(track)) { clearInterval(heroTimer); return; }
        go(idx + 1);
      }, 4500);
    }
    var prev = document.getElementById("heroPrev");
    var next = document.getElementById("heroNext");
    if (prev) prev.onclick = function () { go(idx - 1); auto(); };
    if (next) next.onclick = function () { go(idx + 1); auto(); };
    Array.prototype.forEach.call(dots, function (d) {
      d.onclick = function () { go(+d.dataset.i); auto(); };
    });
    var x0 = null;
    track.addEventListener("touchstart", function (e) {
      x0 = e.touches[0].clientX;
    }, { passive: true });
    track.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) { go(idx + (dx < 0 ? 1 : -1)); auto(); }
      x0 = null;
    }, { passive: true });
    go(0); auto();
  }

  function renderHome() {
    view.innerHTML = '<div class="loading">ခဏစောင့်ပါ…</div>';
    Promise.all([ensureHome(), ensureCovers(), ensureAll(), ensureCats(), ensureDL()]).then(function (arr) {
      var d = arr[0], cmap = arr[1], sets = arr[2];
      var html = "";
      // When a specific category is active, show ONLY the filtered grid (no Featured/series)
      var catActive = activeCat !== "all";
      if (!catActive) {
      // Featured: books with manual covers (user-curated) at the very top
      // Merge hardcoded manual covers into coverMap (bypasses stale covers.json)
      Object.keys(MANUAL_COVERS).forEach(function (id) {
        cmap[id] = MANUAL_COVERS[id];
      });
      var manualIds = Object.keys(MANUAL_COVERS);
      if (manualIds.length) {
        var byId = {};
        sets.forEach(function (s) { byId[s.id] = s; });
        var featured = manualIds.map(function (id) { return byId[id]; })
          .filter(Boolean);
        if (featured.length) {
          html += heroHTML(featured.slice(0, 5));
        }
      }
      d.series.forEach(function (r) {
        html += rowHTML(r.name, mm(r.count) + " စုံ", r.sets);
      });
      if (d.new && d.new.length) {
        html += rowHTML("🆕 အသစ်ထပ်တိုးများ", mm(d.new.length) + " စုံ", d.new);
      }
      } // end if (!catActive)
      var catTitles = {all: "📚 စာအုပ်အားလုံး", english: "📚 English စာအုပ်များ", maths: "📚 Maths စာအုပ်များ", science: "📚 Science စာအုပ်များ", others: "📚 အခြား စာအုပ်များ"};
      html += '<h2 class="section-title">' + (catTitles[activeCat] || catTitles.all) + '</h2><div id="homeAll"><div class="loading">ခဏစောင့်ပါ…</div></div>';
      view.innerHTML = html;
      initHero();
      Promise.all([ensureAll(), ensureCats()]).then(function (arr2) {
        var sets = arr2[0], cats = arr2[1];
        // Education first (english/maths/science), covers prioritized, others (novels/anime) last
        function catRank(s) {
          var c = (cats && cats[s.id]) || "others";
          if (c === "english" || c === "maths" || c === "science") return 0;
          return 1;
        }
        function hasCover(s) { return (cmap && cmap[s.id]) ? 0 : 1; }
        allList = filterByCat(sets.slice()).sort(function (a, b) {
          var r = (DEMOTED_SERIES.indexOf((a.series || "").trim().toLowerCase()) !== -1 ? 1 : 0) -
                  (DEMOTED_SERIES.indexOf((b.series || "").trim().toLowerCase()) !== -1 ? 1 : 0);
          if (r) return r;
          r = (MANUAL_COVERS[a.id] ? 0 : 1) - (MANUAL_COVERS[b.id] ? 0 : 1);
          if (r) return r;
          r = catRank(a) - catRank(b);
          if (r) return r;
          r = hasCover(a) - hasCover(b);
          if (r) return r;
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
    Promise.all([ensureAll(), ensureCovers(), ensureDL()]).then(function (arr) {
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
    Promise.all([getJSON("data/sets/" + encodeURIComponent(id) + ".json"), ensureCovers(), ensureDL()]).then(function (arr) {
      var d = arr[0];
      var comps = (d.components && d.components.length)
        ? d.components.join(", ") : "—";
      var files = (d.items || []).map(function (f) {
        var src = f.src === "local"
          ? '<span class="src local">ချက်ချင်းရ</span>'
          : '';
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
        '<div class="dbox">စုစုပေါင်း အရွယ်အစား: <b>' + esc(fmtSize(d.total_size)) +
        '</b> · <span class="dlc">⬇ ' + mm(dlOf(d)) + " ကြိမ် ဒေါင်းပြီး</span></div>" +
        '<div class="buy-note">ငွေပေးချေမှုနှင့် ဖိုင်ပို့ဆောင်မှုကို Telegram bot မှတစ်ဆင့် ဆောင်ရွက်ပါမယ်</div>' +
        '<div class="buybar"><div class="bprice">' + esc(price(d.price)) +
        "<small>တစ်စုံလျှင်</small></div>" +
        '<div class="buybtns">' +
        '<button class="buybtn" onclick="var o=document.getElementById(\'buyOpts\');o.style.display=o.style.display===\'none\'?\'flex\':\'none\';">ဝယ်ယူမယ်</button>' +
        '<div class="buyopts" id="buyOpts" style="display:none">' +
        '<a class="buyopt" href="' + buyUrl(d.id) + '" target="_blank" rel="noopener">Telegram က မှာယူမယ်</a>' +
        '<button class="buyopt" onclick="window.RCChat && RCChat.orderViaEmail()">Gmail လိပ်စာနဲ့ မှာယူမယ်</button>' +
        "</div></div></div>";
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
  // Rail left/right nav buttons (desktop)
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("button.railbtn");
    if (!btn) return;
    var row = btn.closest("section.row");
    var rail = row && row.querySelector(".rail");
    if (!rail) return;
    var dir = parseInt(btn.getAttribute("data-dir"), 10) || 1;
    rail.scrollBy({ left: dir * rail.clientWidth * 0.8, behavior: "smooth" });
  });
  // Category tab clicks
  document.getElementById("catTabs").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    activeCat = btn.getAttribute("data-cat");
    var buttons = this.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("active", buttons[i] === btn);
    }
    // Re-render home with filter (if on home page)
    var h = location.hash || "#/";
    if (h === "#/" || h === "") {
      route();
    } else {
      location.hash = "#/";
    }
  });

  var CATCOLORS = { all: "#f5a623", english: "#4da3ff", maths: "#c586ff",
    science: "#4dd08a", others: "#9db2c4" };
  Array.prototype.forEach.call(document.querySelectorAll(".cattabs button"),
    function (b) {
      var c = CATCOLORS[b.getAttribute("data-cat")];
      if (c) b.style.setProperty("--catc", c);
    });
  route();
})();
