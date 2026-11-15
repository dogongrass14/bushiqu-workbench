/* 不识趣思考 · 频道决策工作台 前端（零依赖，全部用 textContent 构建 DOM，不注入 HTML） */
(function () {
  "use strict";

  var state = {
    data: null,
    csrf: "",
    tab: "analytics",
    detail: null,
    viewVersion: null,
    viewPackagingVersion: null,
    viewDesignVersion: null,
    busy: false
  };
  var EST_CHARS_PER_MIN = 251;
  var SUBVIEW_KEY_MAP = { antigravity: "antigravity", codex: "codex" };
  var pendingRequestIds = {}; // 同一操作重试时复用同一个 request_id，防止网络重发造成重复记录
  var TYPE_OF_TAB = { topics: "topic", stories: "story" };
  var ID_KEY = { topic: "topic_id", story: "story_id", packaging: "packaging_id", design: "design_id" };
  var STATUS_TEXT = { pending: "未确认", feedback_submitted: "已提修改意见", approved: "已通过", rejected: "暂不采用" };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function randomId() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return "req_" + Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function fmtTime(iso) {
    if (!iso) return "";
    return String(iso).replace("T", " ").replace(/\+.*$/, "").slice(0, 16);
  }

  function showBanner(msg, kind) {
    var b = $("banner");
    b.textContent = msg;
    b.className = "banner" + (kind ? " " + kind : "");
    b.hidden = false;
    if (kind === "ok") {
      clearTimeout(showBanner._t);
      showBanner._t = setTimeout(function () { b.hidden = true; }, 3500);
    }
  }
  function hideBanner() { $("banner").hidden = true; }

  var inFlightLoad = null;
  var lastLoadOkAt = 0;
  var showCloudSetupModal = false;
  var cloudBlobCache = {};

  function isCloudMode() {
    var host = String(location.hostname || "").toLowerCase();
    var search = String(location.search || "");
    var hash = String(location.hash || "");
    if (host.slice(-10) === ".github.io" || location.protocol === "file:") return true;
    if (/[?&](cloud=1|mode=github)\b/.test(search)) return true;
    if (hash.indexOf("gh_repo=") !== -1 || hash === "#cloud-setup") return true;
    return false;
  }

  function getCloudConfig() {
    return {
      repo: (localStorage.getItem("wb_gh_repo") || "").trim(),
      token: (localStorage.getItem("wb_gh_token") || "").trim(),
      branch: (localStorage.getItem("wb_gh_branch") || "main").trim() || "main"
    };
  }

  function ghEncodePath(relPath) {
    return String(relPath || "").replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  }

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(String(str));
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    var clean = String(b64 || "").replace(/\s+/g, "");
    var bin = atob(clean);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  function ghApiFetch(method, urlPath, opts) {
    var cfg = getCloudConfig();
    var options = opts || {};
    var headers = {
      "Authorization": "Bearer " + cfg.token,
      "Accept": options.accept || "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    var fetchOpts = { method: method, cache: "no-store", headers: headers };
    if (options.bodyObj) {
      headers["Content-Type"] = "application/json";
      fetchOpts.body = JSON.stringify(options.bodyObj);
    }
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    if (ctrl) {
      fetchOpts.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, options.timeoutMs || 15000);
    }
    return fetch("https://api.github.com" + urlPath, fetchOpts).then(function (r) {
      if (timer) clearTimeout(timer);
      return r;
    }, function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === "AbortError") throw new Error("连接 GitHub 云端超过 15 秒无响应");
      throw err;
    });
  }

  function ensureFootCloudBtn() {
    if (!isCloudMode()) return;
    if ($("cloudCfgBtn")) return;
    var btn = el("button", "foot-link", "☁️ 云端设置");
    btn.id = "cloudCfgBtn";
    btn.type = "button";
    btn.addEventListener("click", function () {
      showCloudSetupModal = !showCloudSetupModal;
      render();
      window.scrollTo(0, 0);
    });
    $("foot").appendChild(btn);
  }

  function renderCloudSetup(root) {
    var cfg = getCloudConfig();
    var card = el("div", "cloud-card");
    card.appendChild(el("h2", "", "☁️ 连接 GitHub 私有云端工作台"));
    card.appendChild(el("p", "", "全天候免开电脑、免连 Tailscale。未公开文稿与 YouTube 私享留存数据全部加密保存在你的 GitHub 私有仓库中；令牌仅保存在当前手机浏览器本地。"));

    var fRepo = el("div", "cloud-field");
    fRepo.appendChild(el("label", "", "私有数据仓库（格式：GitHub用户名/bushiqu-workbench-data）"));
    var inRepo = el("input", "cloud-input");
    inRepo.type = "text";
    inRepo.placeholder = "例如：ancle/bushiqu-workbench-data";
    inRepo.value = cfg.repo;
    fRepo.appendChild(inRepo);
    card.appendChild(fRepo);

    var fTok = el("div", "cloud-field");
    fTok.appendChild(el("label", "", "GitHub 访问令牌（Personal Access Token）"));
    var inTok = el("input", "cloud-input");
    inTok.type = "password";
    inTok.placeholder = "粘贴 github_pat_... 或 ghp_...";
    inTok.value = cfg.token;
    fTok.appendChild(inTok);
    card.appendChild(fTok);

    var fBr = el("div", "cloud-field");
    fBr.appendChild(el("label", "", "分支名称（默认 main）"));
    var inBr = el("input", "cloud-input");
    inBr.type = "text";
    inBr.value = cfg.branch || "main";
    fBr.appendChild(inBr);
    card.appendChild(fBr);

    var acts = el("div", "cloud-actions");
    var saveBtn = el("button", "btn primary", "保存并打开云端工作台");
    saveBtn.type = "button";
    saveBtn.addEventListener("click", function () {
      var rVal = inRepo.value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
      var tVal = inTok.value.trim();
      var bVal = inBr.value.trim() || "main";
      if (!rVal || rVal.indexOf("/") === -1) {
        showBanner("请填写完整的仓库名，格式为：用户名/bushiqu-workbench-data", "err");
        return;
      }
      if (!tVal) {
        showBanner("请粘贴你的 GitHub 访问令牌", "err");
        return;
      }
      localStorage.setItem("wb_gh_repo", rVal);
      localStorage.setItem("wb_gh_token", tVal);
      localStorage.setItem("wb_gh_branch", bVal);
      showCloudSetupModal = false;
      load(false);
    });
    acts.appendChild(saveBtn);

    if (cfg.repo && cfg.token && state.data) {
      var cancelBtn = el("button", "btn ghost", "返回工作台");
      cancelBtn.type = "button";
      cancelBtn.addEventListener("click", function () { showCloudSetupModal = false; render(); });
      acts.appendChild(cancelBtn);
    }
    if (cfg.token) {
      var clrBtn = el("button", "btn reject", "清除本机令牌");
      clrBtn.type = "button";
      clrBtn.addEventListener("click", function () {
        localStorage.removeItem("wb_gh_token");
        state.data = null;
        showCloudSetupModal = true;
        showBanner("已清除本手机浏览器保存的 GitHub 令牌。", "ok");
        render();
      });
      acts.appendChild(clrBtn);
    }
    card.appendChild(acts);
    root.appendChild(card);
  }

  function loadCloudImage(imgNode, relPath) {
    var clean = String(relPath || "").replace(/^\/+/, "").replace(/^api\/media\//, "");
    if (!clean) return;
    if (cloudBlobCache[clean]) {
      imgNode.src = cloudBlobCache[clean];
      return;
    }
    var cfg = getCloudConfig();
    if (!cfg.repo || !cfg.token) return;
    var urlPath = "/repos/" + cfg.repo + "/contents/data/media/" + ghEncodePath(clean) + "?ref=" + encodeURIComponent(cfg.branch);
    ghApiFetch("GET", urlPath, { accept: "application/vnd.github.raw", timeoutMs: 20000 })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.blob();
      })
      .then(function (blob) {
        var objUrl = URL.createObjectURL(blob);
        cloudBlobCache[clean] = objUrl;
        imgNode.src = objUrl;
      })
      .catch(function () {
        imgNode.alt = "云端图片读取失败：" + clean;
      });
  }

  function cloudLoad(silent) {
    ensureFootCloudBtn();
    var cfg = getCloudConfig();
    if (!cfg.repo || !cfg.token) {
      showCloudSetupModal = true;
      $("syncInfo").textContent = "☁️ 待配置 GitHub 云端令牌";
      $("detailView").hidden = true;
      $("listView").hidden = false;
      $("listView").textContent = "";
      renderCloudSetup($("listView"));
      return Promise.resolve();
    }
    if (inFlightLoad) return inFlightLoad;
    var urlPath = "/repos/" + cfg.repo + "/contents/data/cloud_snapshot.json?ref=" + encodeURIComponent(cfg.branch);
    inFlightLoad = ghApiFetch("GET", urlPath, { accept: "application/vnd.github.raw+json", timeoutMs: 15000 })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) {
          throw new Error("GitHub 令牌无效或无该私有仓库读取权限（HTTP " + r.status + "）");
        }
        if (r.status === 404) {
          throw new Error("未找到私有仓库或 data/cloud_snapshot.json（请确认仓库名与令牌权限）");
        }
        if (!r.ok) throw new Error("GitHub 返回 HTTP " + r.status);
        return r.json();
      })
      .then(function (snap) {
        inFlightLoad = null;
        state.data = snap;
        lastLoadOkAt = Date.now();
        var d = new Date();
        var pad = function (n) { return ("0" + n).slice(-2); };
        $("syncInfo").textContent = "☁️ 云端已同步 " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
          " · 数据更新于 " + fmtTime(snap.updated_at || (snap.daily_analytics && snap.daily_analytics.published_at));
        render();
        if (!silent) hideBanner();
      })
      .catch(function (e) {
        inFlightLoad = null;
        showBanner("云端读取失败：" + e.message, "err");
        $("syncInfo").textContent = "☁️ 云端连接异常";
        if (!state.data) {
          $("listView").textContent = "";
          renderCloudSetup($("listView"));
        }
      });
    return inFlightLoad;
  }

  function applyDecisionToCloudSnapshot(snap, ctx, comment, reqId) {
    var colMap = { topic: "topics", story: "stories", packaging: "packagings", design: "designs" };
    var col = colMap[ctx.type];
    var list = snap[col] || [];
    var target = null;
    for (var i = 0; i < list.length; i++) {
      var cand = list[i];
      var cid = ctx.type === "packaging" ? (cand.story_id || cand.packaging_id) :
                (ctx.type === "design" ? (cand.story_id || cand.design_id) : cand[ID_KEY[ctx.type]]);
      if (cid === ctx.id) { target = cand; break; }
    }
    if (!target) return { ok: false, _status: 404, message: "未找到目标条目：" + ctx.id };
    if (Number(target.current_version) !== Number(ctx.version)) {
      return { ok: false, _status: 409, data: snap, message: "版本已更新，请先阅读最新版" };
    }
    var hist = target.feedback_history = target.feedback_history || [];
    for (var j = 0; j < hist.length; j++) {
      if (hist[j].request_id === reqId) return { ok: true, deduplicated: true, data: snap };
    }
    var statusMap = { approve: "approved", request_changes: "feedback_submitted", reject: "rejected" };
    var statusLabelMap = { approved: "已通过", feedback_submitted: "作者已反馈", rejected: "暂不采用" };
    var actionLabelMap = { approve: "确认通过", request_changes: "提交修改意见", reject: "暂不采用" };
    var statusAfter = statusMap[ctx.action] || "pending";
    var nowStr = new Date().toISOString().replace(/\.\d+Z$/, "Z");

    hist.push({
      event_id: "cloud_" + reqId,
      request_id: reqId,
      version: target.current_version,
      action: ctx.action,
      action_label: actionLabelMap[ctx.action] || ctx.action,
      status_after: statusAfter,
      status_after_label: statusLabelMap[statusAfter] || statusAfter,
      comment: comment,
      created_at: nowStr
    });
    target.current_status = statusAfter;
    target.raw_status_label = statusLabelMap[statusAfter] || statusAfter;
    target.status_label = statusLabelMap[statusAfter] || statusAfter;
    target.raw_approved = (statusAfter === "approved");
    if (ctx.type === "packaging") {
      target.is_approved = Boolean(target.raw_approved && target.packaging_is_complete);
    } else if (ctx.type === "design") {
      target.is_approved = Boolean(target.raw_approved && !target.is_stale);
    } else {
      target.is_approved = Boolean(target.raw_approved);
    }
    target.updated_at = nowStr;
    snap.updated_at = nowStr;

    // Recompute counts
    ["topics", "stories", "packagings", "designs"].forEach(function (k) {
      var arr = snap[k] || [];
      var c = (snap.counts && snap.counts[k]) || {};
      c.total = arr.length;
      c.pending = arr.filter(function (x) { return x.current_status === "pending"; }).length;
      c.feedback_submitted = arr.filter(function (x) { return x.current_status === "feedback_submitted"; }).length;
      c.approved = arr.filter(function (x) { return Boolean(x.is_approved); }).length;
      c.rejected = arr.filter(function (x) { return x.current_status === "rejected"; }).length;
      if (snap.counts) snap.counts[k] = c;
    });
    return { ok: true, deduplicated: false, data: snap, submitted_at: nowStr };
  }

  function cloudSubmitDecision(ctx, comment, reqId) {
    var cfg = getCloudConfig();
    var metaPath = "/repos/" + cfg.repo + "/contents/data/cloud_snapshot.json?ref=" + encodeURIComponent(cfg.branch);
    var snapSha = "";
    return ghApiFetch("GET", metaPath, { accept: "application/vnd.github+json", timeoutMs: 15000 })
      .then(function (r) {
        if (!r.ok) throw new Error("读取云端状态失败 HTTP " + r.status);
        return r.json();
      })
      .then(function (metaObj) {
        snapSha = metaObj.sha;
        if (metaObj.content) {
          return JSON.parse(base64ToUtf8(metaObj.content));
        }
        return ghApiFetch("GET", metaPath, { accept: "application/vnd.github.raw+json", timeoutMs: 15000 })
          .then(function (rr) { return rr.json(); });
      })
      .then(function (latestSnap) {
        var applied = applyDecisionToCloudSnapshot(latestSnap, ctx, comment, reqId);
        if (!applied.ok) return applied;
        if (applied.deduplicated) return applied;

        var decRecord = {
          request_id: reqId,
          item_type: ctx.type,
          item_id: ctx.id,
          target_version: ctx.version,
          action: ctx.action,
          comment: comment,
          submitted_at: applied.submitted_at,
          source: "github_cloud_mobile"
        };
        var decPath = "/repos/" + cfg.repo + "/contents/data/mobile_decisions/" + encodeURIComponent(reqId) + ".json";
        return ghApiFetch("PUT", decPath, {
          bodyObj: {
            message: "workbench(mobile): " + ctx.action + " " + ctx.type + "/" + ctx.id + " v" + ctx.version,
            content: utf8ToBase64(JSON.stringify(decRecord, null, 2) + "\n"),
            branch: cfg.branch
          }
        }).then(function (decResp) {
          if (!decResp.ok && decResp.status !== 422) {
            throw new Error("写入云端审批单失败（HTTP " + decResp.status + "，请检查令牌 Contents Read & Write 权限）");
          }
          return ghApiFetch("PUT", "/repos/" + cfg.repo + "/contents/data/cloud_snapshot.json", {
            bodyObj: {
              message: "workbench(snapshot): sync mobile decision " + reqId,
              content: utf8ToBase64(JSON.stringify(applied.data, null, 2) + "\n"),
              sha: snapSha,
              branch: cfg.branch
            }
          }).then(function (putResp) {
            if (putResp.status === 409) {
              return { ok: false, _status: 409, message: "云端快照刚有并发更新，请再点一次确认" };
            }
            if (!putResp.ok) throw new Error("更新云端快照失败 HTTP " + putResp.status);
            return applied;
          });
        });
      });
  }

  function api(method, path, body, timeoutMs) {
    var opts = { method: method, credentials: "same-origin", cache: "no-store", headers: {} };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.headers["X-Workbench-Request"] = "1";
      opts.headers["X-CSRF-Token"] = state.csrf;
      opts.body = JSON.stringify(body);
    }
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    if (ctrl) {
      opts.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 10000);
    }
    return fetch(path, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.json().catch(function () { return { ok: false, message: "服务器返回无法解析" }; })
        .then(function (j) { j._status = r.status; return j; });
    }, function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === "AbortError") {
        throw new Error("请求超过 10 秒无响应");
      }
      throw err;
    });
  }

  function load(silent) {
    if (isCloudMode()) return cloudLoad(silent);
    if (inFlightLoad) return inFlightLoad;
    inFlightLoad = api("GET", "/api/state", null, 10000).then(function (j) {
      inFlightLoad = null;
      if (!j.ok) throw new Error(j.message || "读取失败");
      state.csrf = j.csrf_token;
      state.data = j.data;
      lastLoadOkAt = Date.now();
      var d = new Date();
      var pad = function (n) { return ("0" + n).slice(-2); };
      $("syncInfo").textContent = "已同步 " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
        " · 数据更新于 " + fmtTime(j.data.updated_at);
      render();
      if (!silent) hideBanner();
    }).catch(function (e) {
      inFlightLoad = null;
      showBanner(
        "无法连接工作台：" + e.message + "。请确认手机 Tailscale 已开启（未与其它 VPN 冲突），或改用 http://anclemacbook-air:18763 访问。",
        "err"
      );
      $("syncInfo").textContent = "未连接";
    });
    return inFlightLoad;
  }

  function findItem(type, id) {
    if (!state.data) return null;
    var list = state.data[type === "topic" ? "topics" : "stories"] || [];
    for (var i = 0; i < list.length; i++) if (list[i][ID_KEY[type]] === id) return list[i];
    return null;
  }

  function findLatestPackagingByStoryId(storyId) {
    if (!state.data || !Array.isArray(state.data.packagings) || !storyId) return null;
    var list = state.data.packagings;
    var matched = null;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if ((p.story_id || p.packaging_id) === storyId) {
        if (!matched || (p.current_version || 0) > (matched.current_version || 0) ||
            ((p.current_version || 0) === (matched.current_version || 0) && String(p.updated_at || "") > String(matched.updated_at || ""))) {
          matched = p;
        }
      }
    }
    return matched;
  }

  function findLatestDesignByStoryId(storyId) {
    if (!state.data || !Array.isArray(state.data.designs) || !storyId) return null;
    var list = state.data.designs;
    var matched = null;
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if ((d.story_id || d.design_id) === storyId) {
        if (!matched || (d.current_version || 0) > (matched.current_version || 0) ||
            ((d.current_version || 0) === (matched.current_version || 0) && String(d.updated_at || "") > String(matched.updated_at || ""))) {
          matched = d;
        }
      }
    }
    return matched;
  }

  function evaluatePackagingVersion(ver, pkgItem) {
    var latest = (pkgItem && pkgItem.latest) || {};
    var v = ver || latest;
    var rawTitle = v.packaging_title !== undefined ? v.packaging_title : (v.title !== undefined ? v.title : (latest.packaging_title !== undefined ? latest.packaging_title : latest.title));
    var rawDesc = v.packaging_description !== undefined ? v.packaging_description : (v.description !== undefined ? v.description : (latest.packaging_description !== undefined ? latest.packaging_description : latest.description));
    var rawImgs = v.packaging_images !== undefined ? v.packaging_images : (v.sample_images !== undefined ? v.sample_images : (v.cover_images !== undefined ? v.cover_images : (latest.packaging_images !== undefined ? latest.packaging_images : latest.sample_images)));
    var titleStr = typeof rawTitle === "string" ? rawTitle.trim() : "";
    var descStr = typeof rawDesc === "string" ? rawDesc.trim() : "";
    var imgs = Array.isArray(rawImgs) ? rawImgs : [];

    var missing = [];
    var hasBackendMissing = Array.isArray(v.missing_packaging_fields) || Array.isArray(v.missing_fields) || (pkgItem && Array.isArray(pkgItem.missing_packaging_fields)) || (pkgItem && Array.isArray(pkgItem.missing_fields));
    if (Array.isArray(v.missing_packaging_fields)) {
      missing = v.missing_packaging_fields.slice();
    } else if (Array.isArray(v.missing_fields)) {
      missing = v.missing_fields.slice();
    } else if (pkgItem && Array.isArray(pkgItem.missing_packaging_fields) && v === latest) {
      missing = pkgItem.missing_packaging_fields.slice();
    } else if (pkgItem && Array.isArray(pkgItem.missing_fields) && v === latest) {
      missing = pkgItem.missing_fields.slice();
    }

    if (!hasBackendMissing || v !== latest) {
      missing = [];
      if (!titleStr) missing.push("标题");
      if (!descStr) missing.push("简介");
      if (!imgs.length) missing.push("封面");
      else if (imgs.some(function (img) { return img && img.exists === false; })) missing.push("封面（文件缺失）");
    }

    var backendComplete = null;
    if (v === latest && pkgItem) {
      if (typeof pkgItem.packaging_is_complete === "boolean") backendComplete = pkgItem.packaging_is_complete;
      else if (typeof pkgItem.is_complete === "boolean") backendComplete = pkgItem.is_complete;
      else if (typeof pkgItem.has_complete_packaging === "boolean") backendComplete = pkgItem.has_complete_packaging;
    }
    if (backendComplete === null) {
      if (typeof v.packaging_is_complete === "boolean") backendComplete = v.packaging_is_complete;
      else if (typeof v.is_complete === "boolean") backendComplete = v.is_complete;
    }

    var localComplete = Boolean(titleStr && descStr && imgs.length && !imgs.some(function (img) { return img && img.exists === false; }));
    var isComplete = backendComplete !== null ? (backendComplete && localComplete) : (missing.length === 0 && localComplete);
    if (!isComplete && !missing.length) {
      if (!titleStr) missing.push("标题");
      if (!descStr) missing.push("简介");
      if (!imgs.length) missing.push("封面");
      else if (imgs.some(function (img) { return img && img.exists === false; })) missing.push("封面（文件缺失）");
    }
    var hasAny = Boolean(titleStr || descStr || imgs.length);
    return {
      titleStr: titleStr,
      descStr: descStr,
      imgs: imgs,
      missing: missing,
      hasAny: hasAny,
      isComplete: isComplete
    };
  }

  // ---------- 字段与估算辅助 ----------
  function countHanzi(text) {
    if (!text) return 0;
    var m = String(text).match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g);
    return m ? m.length : 0;
  }

  function resolveStoryUnitText(item) {
    var latest = (item && item.latest) || {};
    var raw = item.unit_label || item.unit_code || item.unit_number || latest.unit_label || latest.unit_code || "";
    var s = typeof raw === "string" ? raw.trim() : String(raw || "").trim();
    return s || "未填写";
  }

  function resolveStoryEpisodeText(item) {
    var latest = (item && item.latest) || {};
    var raw = item.episode_code || latest.episode_code || item.episode_label || latest.episode_label || "";
    var s = typeof raw === "string" ? raw.trim() : String(raw || "").trim();
    return s || "未填写";
  }

  function resolveStoryVideoTitle(item) {
    var latest = (item && item.latest) || {};
    var pkg = findLatestPackagingByStoryId(item.story_id);
    var pkgTitle = "";
    if (pkg) {
      var pLatest = pkg.latest || {};
      var pRaw = pLatest.packaging_title !== undefined ? pLatest.packaging_title : (pLatest.title !== undefined ? pLatest.title : pkg.title);
      pkgTitle = typeof pRaw === "string" ? pRaw.trim() : "";
    }
    var embPkgTitle = typeof item.packaging_title === "string" ? item.packaging_title.trim() : (typeof latest.packaging_title === "string" ? latest.packaging_title.trim() : "");
    var storyTitle = typeof latest.title === "string" ? latest.title.trim() : (typeof item.title === "string" ? item.title.trim() : "");
    return pkgTitle || embPkgTitle || storyTitle || "未填写";
  }

  function resolveStoryCountAndDuration(item) {
    var latest = (item && item.latest) || {};
    var content = typeof latest.content === "string" ? latest.content.trim() : "";
    var narration = content.split(/\r?\n/).filter(function (line) {
      var t = line.trim();
      return t && !/^#{1,6}\s/.test(t) && !/^\*\*S\d+/.test(t) && !/^[-_*]{3,}$/.test(t);
    }).join("\n");
    var hanziCount = countHanzi(narration);
    var countForDisplay = hanziCount;
    var countForEst = hanziCount;
    if (!countForDisplay || !countForEst) {
      return {
        charCountText: "未填写",
        estDurationText: "未填写"
      };
    }
    var totalSeconds = Math.max(1, Math.round((countForEst / EST_CHARS_PER_MIN) * 60));
    var mins = Math.floor(totalSeconds / 60);
    var secs = totalSeconds % 60;
    var durStr = mins > 0
      ? ("约 " + mins + " 分 " + ("0" + secs).slice(-2) + " 秒（按251汉字/分估算）")
      : ("约 " + secs + " 秒（按251汉字/分估算）");
    return {
      charCountText: countForDisplay + " 汉字（估算）",
      estDurationText: durStr
    };
  }

  function getStoryGateStatuses(storyItem) {
    var pkg = findLatestPackagingByStoryId(storyItem.story_id);
    var pkgApproved = false;
    var pkgDetail = "未提交";
    if (pkg) {
      var pkgEval = evaluatePackagingVersion(pkg.latest, pkg);
      pkgApproved = Boolean(pkg.is_approved && pkgEval.isComplete);
      if (pkgApproved) {
        pkgDetail = "已通过（v" + pkg.current_version + "）";
      } else if (!pkgEval.hasAny) {
        pkgDetail = "未通过（未提交内容）";
      } else if (!pkgEval.isComplete) {
        pkgDetail = "未通过（缺字段：" + pkgEval.missing.join("、") + "）";
      } else {
        pkgDetail = "未通过（" + (pkg.raw_status_label || STATUS_TEXT[pkg.current_status] || "未确认") + " · v" + pkg.current_version + "）";
      }
    } else if (storyItem.packaging_state && storyItem.packaging_state.legacy_embedded_packaging_present) {
      pkgDetail = "未通过（旧版内嵌包装，待独立审批）";
    } else {
      pkgDetail = "未通过（未提交）";
    }

    var storyApproved = Boolean(storyItem.is_approved);
    var storyDetail = storyApproved
      ? "已通过（v" + storyItem.current_version + "）"
      : "未通过（" + storyStatusLabel(storyItem) + " · v" + storyItem.current_version + "）";

    var design = findLatestDesignByStoryId(storyItem.story_id);
    var designApproved = false;
    var designDetail = "未通过（未提交）";
    if (design) {
      var isStale = Boolean(design.is_stale || design.stale);
      designApproved = Boolean(design.is_approved && !isStale);
      if (designApproved) {
        designDetail = "已通过（v" + design.current_version + "）";
      } else if (isStale) {
        designDetail = "未通过（已过期 · v" + design.current_version + "）";
      } else {
        designDetail = "未通过（" + (STATUS_TEXT[design.current_status] || design.status_label || "未确认") + " · v" + design.current_version + "）";
      }
    }

    return {
      packaging: { approved: pkgApproved, pillText: pkgApproved ? "预包装：已通过" : "预包装：未通过", detailText: pkgDetail },
      story: { approved: storyApproved, pillText: storyApproved ? "故事：已通过" : "故事：未通过", detailText: storyDetail },
      design: { approved: designApproved, pillText: designApproved ? "导演设计：已通过" : "导演设计：未通过", detailText: designDetail }
    };
  }

  // ---------- 路由 ----------
  function parseHash() {
    var raw = (location.hash || "").replace(/^#/, "");
    // 支持从连接二维码/网址自动保存仓库名：#gh_repo=owner/repo
    if (raw.indexOf("gh_repo=") === 0) {
      var rp = decodeURIComponent(raw.slice(8)).trim();
      if (rp && rp.indexOf("/") !== -1) {
        localStorage.setItem("wb_gh_repo", rp);
      }
      history.replaceState(null, "", location.pathname + location.search + "#analytics");
      raw = "analytics";
    }
    var parts = raw.split("/").filter(function (p) { return p !== ""; }).map(function (p) {
      try { return decodeURIComponent(p); } catch (_) { return p; }
    });
    if (parts[0] === "topics" || parts[0] === "stories") {
      state.tab = parts[0];
    } else {
      state.tab = "analytics";
    }
    if (state.tab === "analytics" || !parts[1]) {
      state.detail = null;
    } else if (state.tab === "stories") {
      var sub = parts[2] && SUBVIEW_KEY_MAP[parts[2]] ? SUBVIEW_KEY_MAP[parts[2]] : null;
      state.detail = { type: "story", id: parts[1], subview: sub };
    } else {
      state.detail = { type: TYPE_OF_TAB[state.tab], id: parts.slice(1).join("/"), subview: null };
    }
    state.viewVersion = null;
    state.viewPackagingVersion = null;
    state.viewDesignVersion = null;
  }
  function go(hash) { location.hash = hash; }
  window.addEventListener("hashchange", function () { parseHash(); render(); window.scrollTo(0, 0); });

  // ---------- 渲染 ----------
  function render() {
    if (isCloudMode() && showCloudSetupModal) {
      $("detailView").hidden = true;
      $("listView").hidden = false;
      $("listView").textContent = "";
      renderCloudSetup($("listView"));
      return;
    }
    if (!state.data) return;
    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute("aria-selected", tabs[i].dataset.tab === state.tab ? "true" : "false");
    ["topics", "stories"].forEach(function (k) {
      var c = state.data.counts && state.data.counts[k];
      var badge = $("badge-" + k);
      if (badge) badge.textContent = c && c.pending ? String(c.pending) : "";
    });
    $("demoNotice").hidden = !state.data.has_demo_items;
    if (state.detail) {
      var item = findItem(state.detail.type, state.detail.id);
      $("listView").hidden = true;
      $("detailView").hidden = false;
      renderDetail(state.detail.type, item);
    } else {
      $("detailView").hidden = true;
      $("listView").hidden = false;
      renderList();
    }
  }

  function statusPill(status, label) {
    return el("span", "pill st-" + status, label || STATUS_TEXT[status] || "未确认");
  }
  function storyStatusLabel(item) {
    return item.raw_status_label || STATUS_TEXT[item.current_status] || item.status_label || "未确认";
  }
  function metaRow(item, extra, customStatusLabel) {
    var m = el("div", "meta");
    m.appendChild(statusPill(item.current_status, customStatusLabel || item.status_label));
    if (item.series_name) m.appendChild(el("span", "pill series", item.series_name));
    m.appendChild(el("span", "pill ver", "v" + item.current_version));
    if (item.is_demo) m.appendChild(el("span", "pill demo", "测试示例"));
    if (extra) m.appendChild(el("span", "", extra));
    return m;
  }

  var EMPTY_TEXT = {
    topics: ["暂无候选题目", "完成预研并录入候选题后会显示在这里。"],
    stories: ["暂无待确认故事", "作者选定题目、故事与预包装录入后会显示在这里。"]
  };

  function fmtInt(n) {
    var v = Number(n || 0);
    if (!isFinite(v)) return "0";
    return Math.round(v).toLocaleString("en-US");
  }

  function svgEl(tag, attrs) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, String(attrs[k])); });
    }
    return n;
  }

  function makeMicroStat(label, boldVal) {
    var s = el("span", "ana-micro-stat");
    s.appendChild(document.createTextNode(label + " "));
    s.appendChild(el("strong", "", boldVal));
    return s;
  }

  function makeSubBanner(code, title) {
    var bar = el("div", "ana-subbanner");
    bar.appendChild(el("span", "ana-subnum", code));
    bar.appendChild(el("span", "ana-subtxt", title));
    return bar;
  }

  function appendFormattedText(container, text) {
    var s = String(text || "");
    var parts = s.split(/(\*\*[^*]+\*\*)/g);
    parts.forEach(function (part) {
      if (!part) return;
      if (part.length > 4 && part.slice(0, 2) === "**" && part.slice(-2) === "**") {
        container.appendChild(el("strong", "ana-hl", part.slice(2, -2)));
      } else {
        container.appendChild(document.createTextNode(part));
      }
    });
  }

  function roleTagClass(tagStr) {
    var t = String(tagStr || "");
    if (t.indexOf("最新") !== -1) return "ana-rtag latest";
    if (t.indexOf("吸粉") !== -1 || t.indexOf("订阅") !== -1) return "ana-rtag fan";
    if (t.indexOf("时长") !== -1) return "ana-rtag watch";
    return "ana-rtag";
  }

  // 第一部分：长视频图形卡片（重点图形化：点击率 CTR + 观看总时长）
  function appendLongVideoGroup(secNode, groupCode, groupTitle, list) {
    var g = el("div", "ana-group");
    g.appendChild(makeSubBanner(groupCode, groupTitle));
    if (!Array.isArray(list) || !list.length) {
      g.appendChild(el("div", "muted small", "暂无已公开长视频。"));
      secNode.appendChild(g);
      return;
    }
    var wrap = el("div", "ana-vlist");
    list.forEach(function (v) {
      var item = el("div", "ana-vitem");

      var head = el("div", "ana-vhead");
      head.appendChild(el("span", "ana-rank", "#" + (v.rank || 1)));
      head.appendChild(el("h4", "ana-vtitle", v.display_title || v.title || v.video_id || "未命名视频"));
      item.appendChild(head);

      var top = el("div", "ana-vtop");
      var dtStr = (v.short_date || v.published_date || "") + (v.duration_label ? " · " + v.duration_label : "");
      if (dtStr) top.appendChild(el("span", "", dtStr));
      top.appendChild(makeMicroStat("播放", fmtInt(v.views_public)));
      if (v.views_chip) {
        top.appendChild(el("span", "ana-chip " + (v.views_trend || "flat"), v.views_chip));
      }
      if (v.r7_chip) top.appendChild(el("span", "ana-micro-stat", v.r7_chip));
      if (!v.is_unsettled && Number(v.subs_gained_num || 0) > 0) {
        top.appendChild(makeMicroStat("订", "+" + fmtInt(v.subs_gained_num)));
      }
      item.appendChild(top);

      var meters = el("div", "ana-lmeters");

      // 横条 1：封面点击率 CTR（带 5% 基准竖线，满格=15%）
      var mCtr = el("div", "ana-meter-row");
      mCtr.appendChild(el("span", "ana-meter-lbl", "封面点击率"));
      var ctrTrack = el("div", "ana-meter-track");
      var tick5 = el("span", "ana-meter-tick");
      tick5.style.left = "33.3%";
      ctrTrack.appendChild(tick5);
      var ctrBarNum = Number(v.ctr_bar_pct || 0);
      var ctrCls = "ctr-low";
      if (ctrBarNum >= 30) ctrCls = "ctr-good";
      else if (ctrBarNum >= 13) ctrCls = "ctr-mid";
      var ctrFill = el("div", "ana-meter-fill " + ctrCls);
      ctrFill.style.width = Math.max(0, Math.min(100, ctrBarNum)) + "%";
      ctrTrack.appendChild(ctrFill);
      mCtr.appendChild(ctrTrack);

      var ctrValBox = el("div", "ana-meter-valbox");
      var ctrLbl = v.ctr_value_label || "未取得";
      var ctrMuted = ctrLbl === "待出表" || ctrLbl === "0曝光" || ctrLbl === "未取得";
      ctrValBox.appendChild(el("span", "ana-meter-val" + (ctrMuted ? " muted-val" : ""), ctrLbl));
      if (v.ctr_sub_chip) ctrValBox.appendChild(el("span", "ana-meter-sub", v.ctr_sub_chip));
      mCtr.appendChild(ctrValBox);
      meters.appendChild(mCtr);

      // 横条 2：观看总时长（按频道长片最高总时长等比缩放）
      var mWatch = el("div", "ana-meter-row");
      mWatch.appendChild(el("span", "ana-meter-lbl", "观看总时长"));
      var wTrack = el("div", "ana-meter-track");
      var wFill = el("div", "ana-meter-fill watch");
      wFill.style.width = Math.max(0, Math.min(100, Number(v.watch_bar_pct || 0))) + "%";
      wTrack.appendChild(wFill);
      mWatch.appendChild(wTrack);

      var wValBox = el("div", "ana-meter-valbox");
      var wLbl = v.watch_value_label || (fmtInt(v.watch_minutes_num) + " 分");
      wValBox.appendChild(el("span", "ana-meter-val" + (wLbl === "待结算" ? " muted-val" : ""), wLbl));
      if (v.watch_sub_chip) wValBox.appendChild(el("span", "ana-meter-sub", v.watch_sub_chip));
      mWatch.appendChild(wValBox);
      meters.appendChild(mWatch);

      item.appendChild(meters);
      wrap.appendChild(item);
    });
    g.appendChild(wrap);
    secNode.appendChild(g);
  }

  // 第二部分：短视频图形卡片（重点三列图形微卡：完播率 · 新增订阅人数 · 点赞数）
  function appendShortsVideoGroup(secNode, groupCode, groupTitle, list) {
    var g = el("div", "ana-group");
    g.appendChild(makeSubBanner(groupCode, groupTitle));
    if (!Array.isArray(list) || !list.length) {
      g.appendChild(el("div", "muted small", "暂无已公开短视频。"));
      secNode.appendChild(g);
      return;
    }
    var wrap = el("div", "ana-vlist");
    list.forEach(function (v) {
      var item = el("div", "ana-vitem");

      var head = el("div", "ana-vhead");
      head.appendChild(el("span", "ana-rank", "#" + (v.rank || 1)));
      head.appendChild(el("h4", "ana-vtitle", v.display_title || v.title || v.video_id || "未命名视频"));
      item.appendChild(head);

      var top = el("div", "ana-vtop");
      var dtStr = (v.short_date || v.published_date || "") + (v.duration_label ? " · " + v.duration_label : "");
      if (dtStr) top.appendChild(el("span", "", dtStr));
      top.appendChild(makeMicroStat("播放", fmtInt(v.views_public)));
      if (v.views_chip) {
        top.appendChild(el("span", "ana-chip " + (v.views_trend || "flat"), v.views_chip));
      }
      if (!v.is_unsettled && Number(v.watch_minutes_num || 0) > 0) {
        top.appendChild(makeMicroStat("总时长", fmtInt(v.watch_minutes_num) + "分"));
      }
      item.appendChild(top);

      var sGrid = el("div", "ana-s3-grid");

      // 微卡 1：完播率
      var tComp = el("div", "ana-s3-tile");
      var hComp = el("div", "ana-s3-head");
      hComp.appendChild(el("span", "ana-s3-lbl", "完播率"));
      if (v.completion_sub_chip) {
        hComp.appendChild(el("span", "ana-s3-badge", v.completion_sub_chip === "循环重播" ? "重播" : "高完播"));
      }
      tComp.appendChild(hComp);
      var compLbl = v.completion_value_label || (Number(v.avg_view_pct || 0).toFixed(1) + "%");
      tComp.appendChild(el("div", "ana-s3-val" + (compLbl === "待结算" ? " muted-val" : ""), compLbl));
      var trComp = el("div", "ana-s3-track");
      var tk100 = el("span", "ana-meter-tick");
      tk100.style.left = "83.3%";
      trComp.appendChild(tk100);
      var flComp = el("div", "ana-s3-fill comp");
      flComp.style.width = Math.max(0, Math.min(100, Number(v.completion_bar_pct || 0))) + "%";
      trComp.appendChild(flComp);
      tComp.appendChild(trComp);
      sGrid.appendChild(tComp);

      // 微卡 2：新增订阅人数
      var tSubs = el("div", "ana-s3-tile");
      var hSubs = el("div", "ana-s3-head");
      hSubs.appendChild(el("span", "ana-s3-lbl", "新增订阅"));
      tSubs.appendChild(hSubs);
      var subsLbl = v.subs_value_label || ("+" + fmtInt(v.subs_gained_num) + " 人");
      tSubs.appendChild(el("div", "ana-s3-val" + (subsLbl === "待结算" ? " muted-val" : ""), subsLbl));
      var trSubs = el("div", "ana-s3-track");
      var flSubs = el("div", "ana-s3-fill subs");
      flSubs.style.width = Math.max(0, Math.min(100, Number(v.subs_bar_pct || 0))) + "%";
      trSubs.appendChild(flSubs);
      tSubs.appendChild(trSubs);
      sGrid.appendChild(tSubs);

      // 微卡 3：点赞数
      var tLikes = el("div", "ana-s3-tile");
      var hLikes = el("div", "ana-s3-head");
      hLikes.appendChild(el("span", "ana-s3-lbl", "点赞数"));
      tLikes.appendChild(hLikes);
      var likesLbl = v.likes_value_label || (fmtInt(v.likes_num) + " 赞");
      tLikes.appendChild(el("div", "ana-s3-val", likesLbl));
      var trLikes = el("div", "ana-s3-track");
      var flLikes = el("div", "ana-s3-fill likes");
      flLikes.style.width = Math.max(0, Math.min(100, Number(v.likes_bar_pct || 0))) + "%";
      trLikes.appendChild(flLikes);
      tLikes.appendChild(trLikes);
      sGrid.appendChild(tLikes);

      item.appendChild(sGrid);
      wrap.appendChild(item);
    });
    g.appendChild(wrap);
    secNode.appendChild(g);
  }

  function buildRetentionSparkSvg(checkpoints) {
    var w = 300;
    var h = 44;
    var padX = 10;
    var padTop = 6;
    var padBot = 6;
    var plotW = w - padX * 2;
    var plotH = h - padTop - padBot;

    var maxY = 100;
    checkpoints.forEach(function (cp) {
      var v = Number(cp.retention_pct || 0);
      if (v > maxY) maxY = Math.ceil(v / 10) * 10;
    });

    var xs = [0.0, 0.05, 0.15, 0.30, 0.50, 0.70, 0.90];
    var ys = [Math.min(maxY, Math.max(100, Number(checkpoints[0].retention_pct || 100)))];
    checkpoints.forEach(function (cp) { ys.push(Number(cp.retention_pct || 0)); });

    var pts = [];
    for (var i = 0; i < xs.length; i++) {
      var px = padX + (xs[i] / 0.90) * plotW;
      var py = padTop + plotH - (Math.max(0, Math.min(maxY, ys[i])) / maxY) * plotH;
      pts.push([px, py]);
    }

    var svg = svgEl("svg", { viewBox: "0 0 " + w + " " + h, "class": "ana-spark-svg", "aria-hidden": "true" });
    var baseY = padTop + plotH;
    var midY = padTop + plotH * 0.5;
    svg.appendChild(svgEl("line", { x1: padX, y1: midY.toFixed(1), x2: w - padX, y2: midY.toFixed(1), stroke: "currentColor", "stroke-opacity": "0.12", "stroke-dasharray": "3,3" }));

    var areaStr = pts.map(function (p, idx) { return (idx === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") +
      " L" + pts[pts.length - 1][0].toFixed(1) + "," + baseY.toFixed(1) +
      " L" + pts[0][0].toFixed(1) + "," + baseY.toFixed(1) + " Z";
    svg.appendChild(svgEl("path", { d: areaStr, fill: "#9e2a2b", "fill-opacity": "0.14" }));

    var polyStr = pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
    svg.appendChild(svgEl("polyline", { points: polyStr, fill: "none", stroke: "#9e2a2b", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }));

    for (var j = 1; j < pts.length; j++) {
      svg.appendChild(svgEl("circle", { cx: pts[j][0].toFixed(1), cy: pts[j][1].toFixed(1), r: "2.6", fill: "#9e2a2b" }));
    }
    return svg;
  }

  function appendRetentionSection(pageNode, secTitle, secDesc, list) {
    var sec = el("div", "ana-section");
    var head = el("div", "ana-sec-head");
    head.appendChild(el("h3", "", secTitle));
    head.appendChild(el("p", "", secDesc));
    sec.appendChild(head);

    if (!Array.isArray(list) || !list.length) {
      sec.appendChild(el("div", "muted small", "暂无重点关注视频留存记录。"));
      pageNode.appendChild(sec);
      return;
    }

    // 前端兜底去重并严格限最多 5 支重点关注视频
    var seen = {};
    var dedupList = [];
    list.forEach(function (r) {
      var k = r.video_id || r.title || String(dedupList.length);
      if (!seen[k] && dedupList.length < 5) {
        seen[k] = true;
        dedupList.push(r);
      }
    });

    var wrap = el("div", "ana-vlist");
    dedupList.forEach(function (r) {
      var item = el("div", "ana-vitem");

      if (Array.isArray(r.tags) && r.tags.length) {
        var roleRow = el("div", "ana-role-row");
        r.tags.forEach(function (t) {
          roleRow.appendChild(el("span", roleTagClass(t), t));
        });
        item.appendChild(roleRow);
      }

      item.appendChild(el("h4", "ana-vtitle", r.display_title || r.title || r.video_id || "未命名视频"));

      var metaLine = el("div", "ana-vtop");
      if (r.published_date) metaLine.appendChild(el("span", "", "发布于 " + r.published_date));
      if (r.duration_label) metaLine.appendChild(el("span", "", "· 总长 " + r.duration_label));
      if (metaLine.childNodes.length) item.appendChild(metaLine);

      if (r.summary_line) {
        item.appendChild(el("div", "ana-ret-summary", r.summary_line));
      }

      if (r.has_curve && Array.isArray(r.checkpoints) && r.checkpoints.length) {
        var sparkBox = el("div", "ana-spark-wrap");
        sparkBox.appendChild(buildRetentionSparkSvg(r.checkpoints));
        item.appendChild(sparkBox);

        var grid = el("div", "ana-ret-grid");
        r.checkpoints.forEach(function (cp) {
          var cell = el("div", "ana-ret-cell");
          cell.appendChild(el("div", "ana-ret-cp", (cp.pct_label || "") + " · " + (cp.time_label || "--")));
          var pctNum = Number(cp.retention_pct || 0);
          cell.appendChild(el("div", "ana-ret-val", pctNum.toFixed(1) + "%"));
          var track = el("div", "ana-bar-track");
          var fill = el("div", "ana-bar-fill");
          fill.style.width = Math.max(0, Math.min(100, pctNum)) + "%";
          track.appendChild(fill);
          cell.appendChild(track);
          grid.appendChild(cell);
        });
        item.appendChild(grid);
      }

      if (r.drop_note) {
        item.appendChild(el("div", "ana-drop-note", r.drop_note));
      }
      wrap.appendChild(item);
    });
    sec.appendChild(wrap);
    pageNode.appendChild(sec);
  }

  function appendDiagGroup(secNode, groupCode, groupTitle, items, cardExtraCls) {
    var g = el("div", "ana-group");
    g.appendChild(makeSubBanner(groupCode, groupTitle));
    if (!Array.isArray(items) || !items.length) {
      g.appendChild(el("div", "muted small", "暂无条目。"));
      secNode.appendChild(g);
      return;
    }
    var list = el("div", "ana-diag-list");
    items.forEach(function (d) {
      var c = el("div", "ana-diag-card" + (cardExtraCls ? " " + cardExtraCls : ""));
      if (d.title) c.appendChild(el("h4", "", d.title));
      if (d.body) {
        var bodyDiv = el("div", "ana-diag-body");
        appendFormattedText(bodyDiv, d.body);
        c.appendChild(bodyDiv);
      }
      list.appendChild(c);
    });
    g.appendChild(list);
    secNode.appendChild(g);
  }

  function renderAnalyticsBrief(root, brief) {
    if (!brief || typeof brief !== "object") {
      var empty = el("div", "empty");
      empty.appendChild(el("strong", "", "今日数据分析简报尚未生成"));
      empty.appendChild(el("span", "", "系统将在每日早上 09:00 自动拉取 YouTube 数据并单页完整发布于此。"));
      root.appendChild(empty);
      return;
    }

    var page = el("div", "ana-page");
    var meta = brief.meta || {};
    var ov = brief.overview || {};

    // 顶部总览区：三个小框平行排布 + 全站吸粉榜 Top 3
    var hero = el("div", "ana-hero");
    var heroPills = el("div", "meta");
    heroPills.appendChild(statusPill(brief.collect_status === "ok" ? "approved" : "feedback_submitted", brief.schedule_label || "每日 09:00 定时发布"));
    if (brief.report_date) heroPills.appendChild(el("span", "pill series", brief.report_date));
    if (meta.compare_baseline_label) heroPills.appendChild(el("span", "pill ver", "对比：" + meta.compare_baseline_label));
    if (brief.is_demo) heroPills.appendChild(el("span", "pill demo", "测试示例"));
    hero.appendChild(heroPills);

    hero.appendChild(el("h2", "", (meta.channel_title || "不识趣思考") + " · 每日数据简报"));
    hero.appendChild(el(
      "div",
      "ana-submeta",
      "更新于 " + fmtTime(brief.published_at) +
      (meta.analytics_latest_day ? " · Analytics 结算至 " + meta.analytics_latest_day : "")
    ));

    // 平行三列核心指标框：频道总订阅 ｜ 总观看时长(去短视频)及4000h占比 ｜ 近7日播放与环比
    var kpiRow = el("div", "ana-kpi-row3");

    var k1 = el("div", "ana-kpi");
    var subsTotal = Number(ov.subscribers_total || 0);
    var subsYppPct = ov.subs_ypp_progress_pct !== undefined ? Number(ov.subs_ypp_progress_pct) : (subsTotal / 1000 * 100);
    var subsGap = ov.subs_gap_to_1000 !== undefined ? Number(ov.subs_gap_to_1000) : Math.max(0, 1000 - subsTotal);
    k1.appendChild(el("div", "ana-kpi-label", "👥 频道总订阅"));
    k1.appendChild(el("div", "ana-kpi-val", fmtInt(subsTotal) + " 人"));
    var subsSubText = (subsGap > 0 ? "差 " + fmtInt(subsGap) + " 粉" : "已满 1000 粉") +
      (ov.subscribers_chip ? " · " + ov.subscribers_chip : "");
    k1.appendChild(el("div", "ana-kpi-sub", subsSubText));
    var subsTrack = el("div", "ana-ypp-track");
    var subsFill = el("div", "ana-ypp-fill");
    subsFill.style.width = (subsYppPct > 0 ? Math.max(2.5, Math.min(100, subsYppPct)) : 0) + "%";
    subsTrack.appendChild(subsFill);
    k1.appendChild(subsTrack);
    k1.appendChild(el(
      "span",
      "ana-chip " + (ov.subscribers_trend === "down" ? "down" : "up"),
      ov.subscribers_ypp_chip || ("🎯 占 1000粉 的 " + subsYppPct.toFixed(2) + "%")
    ));
    kpiRow.appendChild(k1);

    var k2 = el("div", "ana-kpi");
    var watchHoursEx = Number(ov.watch_hours_ex_shorts || 0);
    var yppPct = Number(ov.ypp_progress_pct || 0);
    k2.appendChild(el("div", "ana-kpi-label", "⏳ 总时长(去短视频)"));
    k2.appendChild(el("div", "ana-kpi-val", watchHoursEx.toFixed(1) + " 小时"));
    var yppTrack = el("div", "ana-ypp-track");
    var yppFill = el("div", "ana-ypp-fill");
    yppFill.style.width = (yppPct > 0 ? Math.max(2.5, Math.min(100, yppPct)) : 0) + "%";
    yppTrack.appendChild(yppFill);
    k2.appendChild(yppTrack);
    k2.appendChild(el(
      "span",
      "ana-chip " + (ov.watch_hours_trend || "up"),
      ov.watch_hours_chip || ("🎯 占 4000h 的 " + yppPct.toFixed(2) + "%")
    ));
    kpiRow.appendChild(k2);

    var k3 = el("div", "ana-kpi");
    k3.appendChild(el("div", "ana-kpi-label", "🔥 近7日播放与环比"));
    k3.appendChild(el("div", "ana-kpi-val", fmtInt(ov.views_7d)));
    k3.appendChild(el("span", "ana-chip " + (ov.views_7d_trend || "flat"), ov.views_7d_chip || ov.views_7d_delta_text || ""));
    kpiRow.appendChild(k3);

    hero.appendChild(kpiRow);

    // 全站吸粉榜 Top 3（不分长短视频，带可爱勋章与图标）
    var fanTop3 = ov.top_fan_magnets_3;
    if (Array.isArray(fanTop3) && fanTop3.length) {
      var fanBox = el("div", "ana-fan-box");
      var fanHead = el("div", "ana-fan-head");
      fanHead.appendChild(el("span", "ana-fan-title", "🏆 全站吸粉榜 Top 3 ✨"));
      fanHead.appendChild(el("span", "ana-fan-sub", "不分长短视频 · 累计订阅榜"));
      fanBox.appendChild(fanHead);

      var fanList = el("div", "ana-fan-list");
      fanTop3.slice(0, 3).forEach(function (f, idx) {
        var row = el("div", "ana-fan-row");
        var defaultMedals = ["🥇", "🥈", "🥉"];
        row.appendChild(el("div", "ana-fan-medal", f.medal || defaultMedals[idx] || ("#" + (idx + 1))));

        var mid = el("div", "ana-fan-mid");
        var nameRow = el("div", "ana-fan-name-row");
        nameRow.appendChild(el("span", "ana-fan-fmt", f.format_badge || (f.is_short ? "⚡ 短视频" : "🎬 长视频")));
        nameRow.appendChild(el("span", "ana-fan-name", f.display_title || f.title || f.video_id || "未命名视频"));
        mid.appendChild(nameRow);

        var barTrack = el("div", "ana-fan-bar-track");
        var barFill = el("div", "ana-fan-bar-fill");
        barFill.style.width = Math.max(0, Math.min(100, Number(f.bar_pct || 0))) + "%";
        barTrack.appendChild(barFill);
        mid.appendChild(barTrack);

        row.appendChild(mid);
        row.appendChild(el("div", "ana-fan-subs", f.subs_badge || ("❤️ +" + fmtInt(f.subs_gained) + " 粉")));
        fanList.appendChild(row);
      });
      fanBox.appendChild(fanList);
      hero.appendChild(fanBox);
    }

    if (meta.data_boundary_note) {
      hero.appendChild(el("div", "ana-boundary", "口径说明：" + meta.data_boundary_note));
    }
    page.appendChild(hero);

    // 一、长视频图形看板（仅保留 1.1 与 1.2，已按要求取消 1.3）
    var longData = brief.long_videos || {};
    var secLong = el("div", "ana-section");
    var headLong = el("div", "ana-sec-head");
    headLong.appendChild(el("h3", "", "一、长视频核心表现（重点：点击率 · 观看总时长）"));
    headLong.appendChild(el("p", "", "点击率进度条满格为 15%（竖线为 5% 达标参考线）；观看总时长按频道长片最高值等比缩放。"));
    secLong.appendChild(headLong);
    appendLongVideoGroup(secLong, "1.1", "最新发布 Top 3", longData.latest_3);
    appendLongVideoGroup(secLong, "1.2", "长视频吸粉榜 Top 3", longData.popular_by_subs_3);
    secLong.appendChild(el("div", "ana-footnote", "注：新发视频待 24–48h 官方结算；0曝光指报表日未触发主页/搜索缩略图展示。"));
    page.appendChild(secLong);

    // 二、短视频 Shorts 图形看板（重点：完播率 · 新增订阅人数 · 点赞数）
    var shortData = brief.shorts_videos || {};
    var secShort = el("div", "ana-section");
    var headShort = el("div", "ana-sec-head");
    headShort.appendChild(el("h3", "", "二、短视频 Shorts 核心表现（重点：完播率 · 新增订阅 · 点赞）"));
    headShort.appendChild(el("p", "", "完播率进度条满格为 120%（竖线为 100% 完整看完线，超 100% 含循环重播）；订阅与点赞按短片最高值等比缩放。"));
    secShort.appendChild(headShort);
    appendShortsVideoGroup(secShort, "2.1", "最新发布 Top 3", shortData.latest_3);
    appendShortsVideoGroup(secShort, "2.2", "短视频吸粉榜 Top 3", shortData.popular_by_subs_3);
    appendShortsVideoGroup(secShort, "2.3", "观看总时长最长 Top 3", shortData.popular_by_watch_time_3);
    secShort.appendChild(el("div", "ana-footnote", "注：Shorts 主流量来自上下划动推荐流；48h 内新片完播与订阅待 Analytics 入库，播放与点赞为实时值。"));
    page.appendChild(secShort);

    // 三、长视频详细留存率（严格去重精选 5 支重点关注视频，上方标注身份标签）
    appendRetentionSection(
      page,
      "三、长视频重点关注 5 支 · 详细留存率",
      "去重精选 5 支重点长视频，上方标注所属榜单标签，曲线与分秒节点定位流失断层。",
      longData.retention_details
    );

    // 四、短视频详细留存率（严格去重精选 5 支重点关注视频，上方标注身份标签）
    appendRetentionSection(
      page,
      "四、短视频重点关注 5 支 · 详细留存率",
      "去重精选 5 支重点短视频，上方标注所属榜单标签，展示各秒级节点留存走势。",
      shortData.retention_details
    );

    // 五、数据复盘、核心症结与优化策略（核心问题与最建议方案加粗呈现）
    var diag = brief.diagnosis || {};
    var secDiag = el("div", "ana-section");
    var headDiag = el("div", "ana-sec-head");
    headDiag.appendChild(el("h3", "", "五、数据复盘 · 核心症结 · 优化策略"));
    headDiag.appendChild(el("p", "", "基于实测盘面数据，重点加粗标注当前核心问题与最建议优先采取的方案。"));
    secDiag.appendChild(headDiag);
    appendDiagGroup(secDiag, "5.1", "数据盘面与转化效率", diag.data_analysis, "");
    appendDiagGroup(secDiag, "5.2", "核心症结诊断", diag.core_problems, "prob");
    appendDiagGroup(secDiag, "5.3", "优化策略与落地方案", diag.solutions, "sol");

    // 5.4 各 Agent 启动记忆自动派发回执（一页直读，无需额外点击）
    var agRec = state.data && state.data.agent_recommendations;
    if (agRec && agRec.agents) {
      var memGroup = el("div", "ana-group");
      memGroup.appendChild(makeSubBanner("5.4", "🤖 各 Agent 启动记忆自动同步"));
      var memBox = el("div", "ana-mem-box");
      memBox.appendChild(
        el(
          "div",
          "ana-mem-note",
          "已自动写入 频道制作规范/数据优化记忆_最新简报建议.md 与 .agents/memory/*.md；各 Agent 启动新任务时先自动读取对应策略（" +
            (agRec.precedence_rule || "作者当集明确指令优先") +
            "）。"
        )
      );
      var memGrid = el("div", "ana-mem-grid");
      ["antigravity", "codex", "zoe-image", "tom-tts", "daniel-bgm", "neo-qc"].forEach(function (rk) {
        var info = agRec.agents[rk];
        if (!info) return;
        var mRow = el("div", "ana-mem-row");
        mRow.appendChild(el("div", "ana-mem-role", info.display_name || rk));
        var ul = el("ul", "ana-mem-ul");
        (info.directives || []).forEach(function (dLine) {
          var li = el("li");
          appendFormattedText(li, dLine);
          ul.appendChild(li);
        });
        mRow.appendChild(ul);
        memGrid.appendChild(mRow);
      });
      memBox.appendChild(memGrid);
      memGroup.appendChild(memBox);
      secDiag.appendChild(memGroup);
    }

    page.appendChild(secDiag);

    root.appendChild(page);
  }

  function renderList() {
    var root = $("listView");
    root.textContent = "";
    if (state.tab === "analytics") {
      renderAnalyticsBrief(root, state.data ? state.data.daily_analytics : null);
      return;
    }
    var items = state.data[state.tab] || [];
    if (!items.length) {
      var e = el("div", "empty");
      e.appendChild(el("strong", "", EMPTY_TEXT[state.tab][0]));
      e.appendChild(el("span", "", EMPTY_TEXT[state.tab][1]));
      root.appendChild(e);
      return;
    }
    var order = { pending: 0, feedback_submitted: 1, approved: 2, rejected: 3 };
    items = items.slice().sort(function (a, b) {
      return (order[a.current_status] - order[b.current_status]) || String(b.updated_at).localeCompare(String(a.updated_at));
    });
    var type = TYPE_OF_TAB[state.tab];
    items.forEach(function (item) {
      var card = el("button", "card");
      card.type = "button";
      var latest = item.latest || {};
      if (type === "story") {
        var unitText = resolveStoryUnitText(item);
        var epText = resolveStoryEpisodeText(item);
        var videoTitle = resolveStoryVideoTitle(item);
        var stats = resolveStoryCountAndDuration(item);

        var storyMeta = el("div", "meta story-list-meta");
        storyMeta.appendChild(el("span", "pill series", "单元：" + unitText));
        storyMeta.appendChild(el("span", "pill ver", "集数：" + epText));
        if (item.is_demo) storyMeta.appendChild(el("span", "pill demo", "测试示例"));
        card.appendChild(storyMeta);

        card.appendChild(el("h3", "", "视频标题：" + videoTitle));

        var infoList = el("div", "story-card-fields");
        var fCount = el("div", "story-field-item");
        fCount.appendChild(el("span", "muted", "字数："));
        fCount.appendChild(el("span", "", stats.charCountText));
        infoList.appendChild(fCount);

        var fDur = el("div", "story-field-item");
        fDur.appendChild(el("span", "muted", "估计时长："));
        fDur.appendChild(el("span", "", stats.estDurationText));
        infoList.appendChild(fDur);
        card.appendChild(infoList);

        card.addEventListener("click", function () { go("stories/" + encodeURIComponent(item.story_id)); });
        root.appendChild(card);
        return;
      }

      var extra = "";
      if (type === "topic" && latest.suggested_schedule) extra = "排期：" + latest.suggested_schedule;
      card.appendChild(metaRow(item, extra, item.status_label));
      card.appendChild(el("h3", "", latest.title));
      var sub = latest.hook;
      if (sub) {
        var s = el("div", "muted small", sub.length > 90 ? sub.slice(0, 90) + "…" : sub);
        card.appendChild(s);
      }
      card.addEventListener("click", function () { go(state.tab + "/" + encodeURIComponent(item[ID_KEY[type]])); });
      root.appendChild(card);
    });
  }

  function addSection(root, title, text) {
    if (!text) return;
    root.appendChild(el("div", "section-title", title));
    root.appendChild(el("div", "text-block", text));
  }

  function renderStoryBody(text) {
    var wrap = el("div", "story-body");
    var blocks = String(text).split(/\n{2,}/);
    blocks.forEach(function (b) {
      var t = b.replace(/^\s+|\s+$/g, "");
      if (!t) return;
      var m = /^#{1,6}\s+(.*)$/.exec(t);
      if (m && t.indexOf("\n") === -1) wrap.appendChild(el("h4", "", m[1]));
      else wrap.appendChild(el("p", "", t));
    });
    return wrap;
  }

  function renderImages(root, imgs, emptyText) {
    if (!imgs || !imgs.length) { root.appendChild(el("div", "noimg", emptyText)); return; }
    var g = el("div", "images");
    imgs.forEach(function (img) {
      var f = el("figure");
      if (img.exists && (img.url || img.rel_path)) {
        var i = el("img");
        i.loading = "lazy";
        i.alt = img.caption || "参考图";
        if (isCloudMode() && (img.rel_path || String(img.url || "").indexOf("/api/media/") === 0)) {
          loadCloudImage(i, img.rel_path || img.url);
        } else {
          i.src = img.url;
        }
        f.appendChild(i);
      } else {
        f.appendChild(el("div", "noimg", "图片文件缺失：" + (img.rel_path || "")));
      }
      if (img.caption) f.appendChild(el("figcaption", "", img.caption));
      g.appendChild(f);
    });
    root.appendChild(g);
  }

  function renderHistory(root, item, titleText) {
    root.appendChild(el("div", "section-title", titleText || "决定与意见记录"));
    var hist = item.feedback_history || [];
    if (!hist.length) { root.appendChild(el("div", "muted small", "尚无记录。")); return; }
    var ul = el("ul", "history");
    hist.slice().reverse().forEach(function (h) {
      var li = el("li", h.action);
      li.appendChild(el("div", "h-meta", "v" + h.version + " · " + fmtTime(h.created_at) + " · " + (h.action_label || h.action) + " → " + (h.status_after_label || "")));
      if (h.comment) li.appendChild(el("div", "text-block", h.comment));
      ul.appendChild(li);
    });
    root.appendChild(ul);
  }

  function renderVersionSwitch(root, item, stateKey) {
    var key = stateKey || "viewVersion";
    var vers = item.versions || [];
    if (vers.length < 2) return;
    root.appendChild(el("div", "section-title", "版本（旧版本保留可查看）"));
    var box = el("div", "version-switch");
    var current = state[key] || item.current_version;
    vers.forEach(function (v) {
      var b = el("button", "", "v" + v.version + (v.version === item.current_version ? "（最新）" : ""));
      b.type = "button";
      b.setAttribute("aria-pressed", v.version === current ? "true" : "false");
      b.addEventListener("click", function () { state[key] = v.version; render(); });
      box.appendChild(b);
    });
    root.appendChild(box);
  }

  function renderPackagingSection(root, storyItem) {
    var box = el("div", "card");
    var pkg = findLatestPackagingByStoryId(storyItem.story_id);
    if (!pkg) {
      var hasLegacyEmbedded = Boolean(storyItem.packaging_state && storyItem.packaging_state.legacy_embedded_packaging_present);
      var emptyMeta = el("div", "meta");
      emptyMeta.appendChild(statusPill("pending", hasLegacyEmbedded ? "旧版内嵌包装（未独立审批）" : "未提交"));
      emptyMeta.appendChild(el("span", "pill ver", "Antigravity 成果"));
      box.appendChild(emptyMeta);
      box.appendChild(el("h3", "", "Antigravity 预包装（标题、简介、封面）"));
      if (hasLegacyEmbedded) {
        box.appendChild(el("div", "old-version-note", "当前存在旧故事内嵌预包装内容（旧联合批准不自动计为独立预包装通过；需提交独立预包装记录后方可独立审批通过）。"));
        var legTitle = typeof storyItem.packaging_title === "string" ? storyItem.packaging_title.trim() : "";
        var legDesc = typeof storyItem.packaging_description === "string" ? storyItem.packaging_description.trim() : "";
        var legImgs = Array.isArray(storyItem.packaging_images) ? storyItem.packaging_images : [];
        box.appendChild(el("div", "section-title", "预包装标题（旧版内嵌）"));
        box.appendChild(legTitle ? el("div", "text-block", legTitle) : el("div", "muted small", "未填写"));
        box.appendChild(el("div", "section-title", "预包装简介（旧版内嵌）"));
        box.appendChild(legDesc ? el("div", "text-block", legDesc) : el("div", "muted small", "未填写"));
        box.appendChild(el("div", "section-title", "封面（旧版内嵌）"));
        renderImages(box, legImgs, "无图片");
      } else {
        box.appendChild(el("div", "muted small", "尚未提交预包装（缺少预包装不影响下方故事正文独立审核）。"));
      }
      root.appendChild(box);
      return;
    }

    var viewingPkgVer = state.viewPackagingVersion || pkg.current_version;
    var pVer = null;
    (pkg.versions || []).forEach(function (v) { if (v.version === viewingPkgVer) pVer = v; });
    if (!pVer) {
      pVer = pkg.latest || ((pkg.versions && pkg.versions.length) ? pkg.versions[pkg.versions.length - 1] : {});
      viewingPkgVer = pkg.current_version;
    }
    var isPkgLatest = viewingPkgVer === pkg.current_version;
    var evalRes = evaluatePackagingVersion(pVer, pkg);

    var headMeta = el("div", "meta");
    var statusCode = pkg.is_approved ? "approved" : (pkg.current_status || "pending");
    var statusText = pkg.status_label || STATUS_TEXT[statusCode] || "未确认";
    if (!evalRes.hasAny && !pkg.is_approved) {
      statusCode = "pending";
      statusText = "未提交";
    }
    headMeta.appendChild(statusPill(statusCode, statusText));
    headMeta.appendChild(el("span", "pill ver", "Antigravity 成果"));
    headMeta.appendChild(el("span", "pill ver", "包装 v" + pkg.current_version));
    if (pkg.is_demo) headMeta.appendChild(el("span", "pill demo", "测试示例"));
    box.appendChild(headMeta);

    box.appendChild(el("h3", "", "Antigravity 预包装（标题、简介、封面）"));
    renderVersionSwitch(box, pkg, "viewPackagingVersion");
    if (!isPkgLatest) {
      box.appendChild(el("div", "old-version-note", "正在查看预包装旧版本 v" + viewingPkgVer + "，只能阅读；决定只能针对最新版 v" + pkg.current_version + "。"));
    }
    if (pVer.change_note) {
      box.appendChild(el("div", "muted small", "本版包装说明：" + pVer.change_note));
    }
    if (!evalRes.isComplete) {
      box.appendChild(el("div", "old-version-note", "预包装缺字段：" + evalRes.missing.join("、") + "（补齐前不允许点击“通过预包装”，可提修改意见；不影响故事正文独立审核）。"));
    }

    box.appendChild(el("div", "section-title", "预包装标题"));
    if (evalRes.titleStr) {
      box.appendChild(el("div", "text-block", evalRes.titleStr));
    } else {
      box.appendChild(el("div", "muted small", "未提交标题（缺字段）"));
    }

    box.appendChild(el("div", "section-title", "预包装简介"));
    if (evalRes.descStr) {
      box.appendChild(el("div", "text-block", evalRes.descStr));
    } else {
      box.appendChild(el("div", "muted small", "未提交简介（缺字段）"));
    }

    box.appendChild(el("div", "section-title", "封面"));
    renderImages(box, evalRes.imgs, "未提交封面（缺字段）");

    renderHistory(box, pkg, "预包装决定与意见记录");

    if (isPkgLatest) {
      renderActions(box, "packaging", pkg, {
        incompletePackaging: !evalRes.isComplete,
        missingPackagingFields: evalRes.missing,
        fallbackTitle: storyItem.latest && storyItem.latest.title,
        seriesName: pkg.series_name || storyItem.series_name,
        storyId: storyItem.story_id
      });
    }
    root.appendChild(box);
  }

  function renderStorySection(root, storyItem, ver, viewing, isLatest) {
    var box = el("div", "card");
    var headMeta = el("div", "meta");
    headMeta.appendChild(statusPill(storyItem.current_status, storyStatusLabel(storyItem)));
    headMeta.appendChild(el("span", "pill ver", "Antigravity 成果"));
    if (storyItem.series_name) headMeta.appendChild(el("span", "pill series", storyItem.series_name));
    headMeta.appendChild(el("span", "pill ver", "故事 v" + storyItem.current_version));
    if (storyItem.is_demo) headMeta.appendChild(el("span", "pill demo", "测试示例"));
    box.appendChild(headMeta);

    box.appendChild(el("h3", "", "Antigravity 故事正文：" + (ver.title || storyItem.story_id)));
    if (storyItem.episode_code) box.appendChild(el("div", "muted small", "集数：" + storyItem.episode_code));

    renderVersionSwitch(box, storyItem, "viewVersion");
    if (!isLatest) {
      box.appendChild(el("div", "old-version-note", "正在查看故事旧版本 v" + viewing + "，只能阅读；决定只能针对最新版 v" + storyItem.current_version + "。"));
    }
    if (ver.change_note) box.appendChild(el("div", "muted small", "本版故事说明：" + ver.change_note));

    addSection(box, "大纲摘要", ver.outline_summary);
    box.appendChild(el("div", "section-title", "故事全文（" + (ver.char_count || 0) + " 字）"));
    var tools = el("div", "font-tools");
    tools.appendChild(el("span", "", "字号"));
    [["A-", -1], ["A+", 1]].forEach(function (p) {
      var b = el("button", "", p[0]);
      b.type = "button";
      b.addEventListener("click", function () { adjustFont(p[1]); });
      tools.appendChild(b);
    });
    box.appendChild(tools);
    box.appendChild(renderStoryBody(ver.content || ""));
    addSection(box, "来源与证据说明", ver.sources_note);
    if (ver.sample_images && ver.sample_images.length) {
      box.appendChild(el("div", "section-title", "故事参考图"));
      renderImages(box, ver.sample_images, "无图片");
    }

    renderHistory(box, storyItem, "故事正文决定与意见记录");
    if (isLatest) {
      renderActions(box, "story", storyItem);
    }
    root.appendChild(box);
  }

  function renderDesignSection(root, storyItem, isStoryLatest, viewingStoryVer) {
    var box = el("div", "card");
    var design = findLatestDesignByStoryId(storyItem.story_id);
    if (!design) {
      var emptyMeta = el("div", "meta");
      emptyMeta.appendChild(statusPill("pending", "未提交导演设计"));
      emptyMeta.appendChild(el("span", "pill ver", "Codex 成果"));
      box.appendChild(emptyMeta);
      box.appendChild(el("h3", "", "Codex 导演设计方案"));
      box.appendChild(el("div", "muted small", "尚未提交关联本故事的导演设计（Codex 完成核实与分镜设计后将显示在此处；导演设计阶段不提前配音）。"));
      root.appendChild(box);
      return;
    }

    var viewingDesignVer = state.viewDesignVersion || design.current_version;
    var dVer = null;
    (design.versions || []).forEach(function (v) { if (v.version === viewingDesignVer) dVer = v; });
    if (!dVer) {
      dVer = design.latest || ((design.versions && design.versions.length) ? design.versions[design.versions.length - 1] : {});
      viewingDesignVer = design.current_version;
    }
    var isDesignLatest = viewingDesignVer === design.current_version;
    var isStale = Boolean(design.is_stale || design.stale);
    var staleReason = design.stale_reason || (storyItem.design_state && storyItem.design_state.design_stale_reason) || "";
    var meta = el("div", "meta");
    meta.appendChild(statusPill(isStale ? "feedback_submitted" : design.current_status, design.status_label));
    meta.appendChild(el("span", "pill ver", "Codex 成果"));
    meta.appendChild(el("span", "pill ver", "设计 v" + design.current_version));
    if (dVer.story_version !== undefined && dVer.story_version !== null) {
      meta.appendChild(el("span", "pill ver", "对应故事 v" + dVer.story_version));
    } else if (design.story_version !== undefined && design.story_version !== null) {
      meta.appendChild(el("span", "pill ver", "对应故事 v" + design.story_version));
    }
    if (design.is_demo) meta.appendChild(el("span", "pill demo", "测试示例"));
    if (dVer.char_count) meta.appendChild(el("span", "", dVer.char_count + " 字"));
    box.appendChild(meta);

    box.appendChild(el("h3", "", "Codex 导演设计：" + (dVer.title || storyItem.latest.title || design.design_id)));
    renderVersionSwitch(box, design, "viewDesignVersion");
    if (!isDesignLatest) {
      box.appendChild(el("div", "old-version-note", "正在查看导演设计旧版本 v" + viewingDesignVer + "，只能阅读；决定只能针对最新版 v" + design.current_version + "。"));
    }
    if (dVer.change_note) box.appendChild(el("div", "muted small", "本版设计说明：" + dVer.change_note));

    if (isStale) {
      box.appendChild(el("div", "banner", "该导演设计已过期：" + (staleReason || "关联故事已变更，需同步更新导演设计后重审") + "。过期状态下禁止点“通过导演设计”，但可继续提修改意见。"));
    }

    box.appendChild(el("div", "section-title", "导演设计全文（预估时长，不提前配音）"));
    var dTools = el("div", "font-tools");
    dTools.appendChild(el("span", "", "字号"));
    [["A-", -1], ["A+", 1]].forEach(function (p) {
      var b = el("button", "", p[0]);
      b.type = "button";
      b.addEventListener("click", function () { adjustFont(p[1]); });
      dTools.appendChild(b);
    });
    box.appendChild(dTools);
    box.appendChild(renderStoryBody(dVer.content || ""));

    box.appendChild(el("div", "section-title", "导演设计参考图"));
    renderImages(box, dVer.sample_images, "无图片（本版导演设计未附参考图）");

    renderHistory(box, design, "导演设计决定与意见历史");

    if (!isDesignLatest) {
      // 查看设计旧版本时已在顶部提示仅可阅读
    } else if (isStoryLatest) {
      renderActions(box, "design", design);
    } else {
      box.appendChild(el("div", "old-version-note", "当前正在查看故事旧版本 v" + viewingStoryVer + "，不可对导演设计进行审批操作；请切回故事最新版 v" + storyItem.current_version + " 后再操作。"));
    }
    root.appendChild(box);
  }

  function renderStoryHub(root, item) {
    var gates = getStoryGateStatuses(item);
    var unitText = resolveStoryUnitText(item);
    var epText = resolveStoryEpisodeText(item);
    var videoTitle = resolveStoryVideoTitle(item);
    var stats = resolveStoryCountAndDuration(item);

    var head = el("div", "detail-head");
    var topMeta = el("div", "meta");
    topMeta.appendChild(el("span", "pill series", "单元：" + unitText));
    topMeta.appendChild(el("span", "pill ver", "集数：" + epText));
    if (item.is_demo) topMeta.appendChild(el("span", "pill demo", "测试示例"));
    head.appendChild(topMeta);
    head.appendChild(el("h2", "", videoTitle));
    head.appendChild(el("div", "muted small", "字数：" + stats.charCountText + " · 估计时长：" + stats.estDurationText));
    root.appendChild(head);

    var statusOverview = el("div", "meta hub-status-overview");
    statusOverview.appendChild(statusPill(gates.packaging.approved ? "approved" : "pending", gates.packaging.pillText));
    statusOverview.appendChild(statusPill(gates.story.approved ? "approved" : "pending", gates.story.pillText));
    statusOverview.appendChild(statusPill(gates.design.approved ? "approved" : "pending", gates.design.pillText));
    root.appendChild(statusOverview);

    var entriesWrap = el("div", "hub-entries");

    // 二级入口 1：Antigravity 成果（预包装与故事）
    var agBtn = el("button", "card hub-entry");
    agBtn.type = "button";
    var agTop = el("div", "hub-entry-top");
    agTop.appendChild(el("span", "pill ver", "入口 1"));
    agTop.appendChild(el("span", "hub-arrow", "进入审核 ›"));
    agBtn.appendChild(agTop);
    agBtn.appendChild(el("h3", "", "Antigravity 成果（预包装与故事）"));
    var agPills = el("div", "meta");
    agPills.appendChild(statusPill(gates.packaging.approved ? "approved" : "pending", "预包装：" + gates.packaging.detailText));
    agPills.appendChild(statusPill(gates.story.approved ? "approved" : "pending", "故事：" + gates.story.detailText));
    agBtn.appendChild(agPills);
    agBtn.appendChild(el("div", "muted small hub-desc", "独立审核视频标题、简介、封面与正式口播故事正文（包装与故事互不影响）。"));
    agBtn.addEventListener("click", function () {
      go("stories/" + encodeURIComponent(item.story_id) + "/antigravity");
    });
    entriesWrap.appendChild(agBtn);

    // 二级入口 2：Codex 成果（导演设计）
    var cdxBtn = el("button", "card hub-entry");
    cdxBtn.type = "button";
    var cdxTop = el("div", "hub-entry-top");
    cdxTop.appendChild(el("span", "pill ver", "入口 2"));
    cdxTop.appendChild(el("span", "hub-arrow", "进入审核 ›"));
    cdxBtn.appendChild(cdxTop);
    cdxBtn.appendChild(el("h3", "", "Codex 成果（导演设计）"));
    var cdxPills = el("div", "meta");
    cdxPills.appendChild(statusPill(gates.design.approved ? "approved" : "pending", "导演设计：" + gates.design.detailText));
    cdxBtn.appendChild(cdxPills);
    cdxBtn.appendChild(el("div", "muted small hub-desc", "独立审核史料核实、分镜、预估时长、视觉与声音整体导演方案。"));
    cdxBtn.addEventListener("click", function () {
      go("stories/" + encodeURIComponent(item.story_id) + "/codex");
    });
    entriesWrap.appendChild(cdxBtn);

    root.appendChild(entriesWrap);
  }

  function renderDetail(type, item) {
    var root = $("detailView");
    root.textContent = "";
    var subview = (type === "story" && state.detail && state.detail.subview) ? state.detail.subview : null;
    var back = el("button", "back", subview ? "‹ 返回单集入口" : "‹ 返回列表");
    back.type = "button";
    back.addEventListener("click", function () {
      if (subview && item) {
        go("stories/" + encodeURIComponent(item.story_id));
      } else {
        go(state.tab);
      }
    });
    root.appendChild(back);
    if (!item) {
      var e = el("div", "empty");
      e.appendChild(el("strong", "", "找不到这一条"));
      e.appendChild(el("span", "", "它可能已被移除或尚未录入，请返回列表刷新。"));
      root.appendChild(e);
      return;
    }

    if (type === "story" && !subview) {
      renderStoryHub(root, item);
      return;
    }

    var viewing = state.viewVersion || item.current_version;
    var ver = null;
    (item.versions || []).forEach(function (v) { if (v.version === viewing) ver = v; });
    if (!ver) { ver = item.latest || {}; viewing = item.current_version; }
    var isLatest = viewing === item.current_version;

    if (type === "story") {
      var unitText = resolveStoryUnitText(item);
      var epText = resolveStoryEpisodeText(item);
      var head = el("div", "detail-head");
      var topMeta = el("div", "meta");
      topMeta.appendChild(el("span", "pill series", "单元：" + unitText));
      topMeta.appendChild(el("span", "pill ver", "集数：" + epText));
      if (item.is_demo) topMeta.appendChild(el("span", "pill demo", "测试示例"));
      head.appendChild(topMeta);
      head.appendChild(el("h2", "", resolveStoryVideoTitle(item)));

      if (subview === "antigravity") {
        head.appendChild(el("div", "muted small", "Antigravity 成果：预包装与故事正文分开独立审核，互不影响。"));
        root.appendChild(head);
        renderPackagingSection(root, item);
        renderStorySection(root, item, ver, viewing, isLatest);
      } else if (subview === "codex") {
        head.appendChild(el("div", "muted small", "Codex 成果：导演设计独立审核（仅预估时长、不提前配音）。"));
        root.appendChild(head);
        renderDesignSection(root, item, isLatest, viewing);
      }
      return;
    }

    var topicHead = el("div", "detail-head");
    topicHead.appendChild(metaRow(item));
    topicHead.appendChild(el("h2", "", ver.title));
    root.appendChild(topicHead);
    renderVersionSwitch(root, item, "viewVersion");
    if (!isLatest) root.appendChild(el("div", "old-version-note", "正在查看旧版本 v" + viewing + "，只能阅读；决定只能针对最新版 v" + item.current_version + "。"));
    if (ver.change_note) root.appendChild(el("div", "muted small", "本版说明：" + ver.change_note));

    addSection(root, "核心问题／切入点", ver.hook);
    addSection(root, "预研说明", ver.summary);
    addSection(root, "参考书目", ver.source_books);
    addSection(root, "建议排期", ver.suggested_schedule);
    addSection(root, "批次", ver.batch_label);

    renderHistory(root, item);
    if (isLatest) renderActions(root, type, item);
  }

  function renderActions(root, type, item, opts) {
    var options = opts || {};
    var bar = el("div", "actionbar");
    if (type === "packaging" || type === "story" || type === "design") {
      bar.style.position = "static";
    }
    var labels = {
      topic: { approve: "选择此题", change: "提修改意见", reject: "暂不采用" },
      packaging: { approve: "通过预包装", change: "对预包装提意见" },
      story: { approve: "通过故事正文", change: "对故事提意见" },
      design: { approve: "通过导演设计", change: "对导演设计提意见" }
    }[type];
    var isStale = type === "design" && Boolean(item.is_stale || item.stale);
    var incompletePkg = type === "packaging" && Boolean(options.incompletePackaging);
    var approved = Boolean(item.is_approved);
    var approveText = approved
      ? "已通过 v" + item.current_version
      : (incompletePkg
        ? "预包装缺字段（禁止通过）"
        : (isStale ? "导演设计已过期（禁止通过）" : labels.approve));
    var a = el("button", "btn primary", approveText);
    a.type = "button";
    a.disabled = approved || isStale || incompletePkg || state.busy;
    a.addEventListener("click", function () {
      if (isStale || incompletePkg) return;
      openSheet(type, item, "approve", options);
    });
    bar.appendChild(a);
    var c = el("button", "btn change", labels.change);
    c.type = "button";
    c.disabled = state.busy;
    c.addEventListener("click", function () { openSheet(type, item, "request_changes", options); });
    bar.appendChild(c);
    if (labels.reject) {
      var r = el("button", "btn reject", labels.reject);
      r.type = "button";
      r.disabled = state.busy || item.current_status === "rejected";
      r.addEventListener("click", function () { openSheet(type, item, "reject", options); });
      bar.appendChild(r);
    }
    root.appendChild(bar);
    var note = {
      topic: "选择题目后，后续进入故事撰写、预包装与导演设计；本页面不会自动开始制作。",
      packaging: incompletePkg
        ? "当前预包装缺少必填字段（" + (options.missingPackagingFields || []).join("、") + "），不能通过预包装；可直接提修改意见，不影响下方故事正文独立审核。"
        : "独立审核 Antigravity 预包装（标题、简介、封面），与下方故事正文互不影响。",
      story: "独立审核 Antigravity 故事正文，不受上方预包装是否提交或是否通过影响。",
      design: isStale
        ? "当前导演设计已过期，禁止点击通过，但可直接提交修改意见；待更新版本后再审。"
        : "独立审核 Codex 导演设计（仅预估时长、不提前配音）；预包装、故事正文与导演设计均通过后进入正式配音与素材制作。"
    }[type];
    root.appendChild(el("div", "gate-note", note));
  }

  function adjustFont(delta) {
    var cur = parseInt(localStorage.getItem("storyFont") || "18", 10);
    cur = Math.max(14, Math.min(26, cur + delta * 2));
    localStorage.setItem("storyFont", String(cur));
    document.documentElement.style.setProperty("--story-size", cur + "px");
  }

  // ---------- 提交 ----------
  var sheetCtx = null;
  function openSheet(type, item, action, opts) {
    var options = opts || {};
    if (type === "packaging" && action === "approve") {
      var pkgEval = evaluatePackagingVersion(item.latest, item);
      if (options.incompletePackaging || !pkgEval.isComplete) {
        showBanner("预包装的标题、简介或封面尚未完整，不能通过预包装。", "err");
        return;
      }
    }
    if (type === "design" && action === "approve" && Boolean(item.is_stale || item.stale)) {
      showBanner("当前导演设计已过期，不能审批通过；请先提修改意见或等待更新版本。", "err");
      return;
    }
    var latest = item.latest || {};
    var name = latest.packaging_title || latest.title || item.story_title || options.fallbackTitle || item[ID_KEY[type]] || item.story_id || "";
    var titles = {
      approve: {
        topic: "确认选择这个题目？",
        packaging: "确认通过当前版预包装？",
        story: "确认通过当前版故事正文？",
        design: "确认通过当前版导演设计？"
      }[type],
      request_changes: {
        topic: "对选题提出修改意见",
        packaging: "对预包装提出修改意见",
        story: "对故事正文提出修改意见",
        design: "对导演设计提出修改意见"
      }[type] || "提出修改意见",
      reject: "确认暂不采用这个题目？"
    };
    var itemId = type === "packaging"
      ? (item.packaging_id || item.story_id || options.storyId)
      : (type === "design" ? (item.design_id || item.story_id) : item[ID_KEY[type]]);
    sheetCtx = { type: type, id: itemId, version: item.current_version, action: action };
    $("sheetTitle").textContent = titles[action];
    var typeTag = {
      topic: "v",
      packaging: "预包装 v",
      story: "故事 v",
      design: "导演设计 v"
    }[type] || "v";
    var seriesText = item.series_name || options.seriesName || "";
    $("sheetDesc").textContent = "《" + name + "》" + (seriesText ? " · " + seriesText : "") + " · " + typeTag + item.current_version;
    var ta = $("sheetComment");
    ta.hidden = false;
    ta.value = "";
    ta.placeholder = action === "request_changes" ? "请写具体修改意见（必填）" : "可选附言（例如：某处镜头或语气微调建议）";
    $("sheetConfirm").textContent = action === "request_changes" ? "提交意见" : "确认";
    $("sheet").hidden = false;
    if (action === "request_changes") setTimeout(function () { ta.focus(); }, 50);
  }
  function closeSheet() { $("sheet").hidden = true; sheetCtx = null; }
  $("sheetCancel").addEventListener("click", closeSheet);
  $("sheet").addEventListener("click", function (e) { if (e.target === $("sheet")) closeSheet(); });
  $("sheetConfirm").addEventListener("click", function () {
    if (!sheetCtx || state.busy) return;
    var comment = $("sheetComment").value.trim();
    if (sheetCtx.action === "request_changes" && !comment) {
      $("sheetComment").focus();
      showBanner("修改意见不能为空。", "err");
      return;
    }
    submit(sheetCtx, comment);
  });

  function submit(ctx, comment) {
    var key = [ctx.type, ctx.id, ctx.version, ctx.action, comment].join("|");
    if (!pendingRequestIds[key]) pendingRequestIds[key] = randomId();
    state.busy = true;
    $("sheetConfirm").disabled = true;
    var reqPromise = isCloudMode()
      ? cloudSubmitDecision(ctx, comment, pendingRequestIds[key])
      : api("POST", "/api/decision", {
          item_type: ctx.type, item_id: ctx.id, target_version: ctx.version,
          action: ctx.action, comment: comment, request_id: pendingRequestIds[key]
        });
    reqPromise.then(function (j) {
      if (j.ok) {
        delete pendingRequestIds[key];
        state.data = j.data;
        closeSheet();
        showBanner(j.deduplicated ? "这条决定之前已保存，未重复记录。" : "已保存。下次读取时会看到更新；页面不会自动通知或推进制作。", "ok");
        render();
      } else if (j._status === 409) {
        delete pendingRequestIds[key];
        closeSheet();
        if (j.data) state.data = j.data;
        state.viewVersion = null;
        state.viewPackagingVersion = null;
        state.viewDesignVersion = null;
        render();
        showBanner("内容已更新为新版本，你刚才的决定没有保存。请先阅读最新版再决定。", "");
      } else if (j._status === 403 && j.error_code === "CSRF_TOKEN_MISMATCH") {
        showBanner("服务已重启，正在刷新安全令牌，请再点一次确认。", "");
        load(true);
      } else {
        showBanner("未保存：" + (j.message || "未知错误"), "err");
      }
    }).catch(function () {
      showBanner("网络中断，未确认是否保存。请再点一次确认（同一操作不会重复记录）。", "err");
    }).then(function () {
      state.busy = false;
      $("sheetConfirm").disabled = false;
      render();
    });
  }

  // ---------- 启动 ----------
  var tabs = document.querySelectorAll(".tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener("click", function () { go(this.dataset.tab); });
  }
  $("refreshBtn").addEventListener("click", function () { load(false); });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !state.busy && $("sheet").hidden && (Date.now() - lastLoadOkAt > 20000)) {
      load(true);
    }
  });
  var savedFont = localStorage.getItem("storyFont");
  if (savedFont) document.documentElement.style.setProperty("--story-size", savedFont + "px");
  parseHash();
  load(false);
})();
