/* 不识趣思考 · 工作台管线地铁图、1–3天滚动排期与 A/B 封面组件库 (pipeline_ui.js)
 * 遵循原则：
 * 1. 零框架、纯原生 JavaScript (Vanilla JS)，支持独立调用与 Node 单测加载。
 * 2. 100% 采用 DOM textContent 构建文本节点，严禁动态 HTML 拼接注入，杜绝 XSS。
 * 3. 严格遵循可访问性与移动端优先自适应布局（390px 零横向溢出，触摸热区 >= 44px）。
 * 4. 纯视图呈现组件：不自行伪造审核通过、不修改存储状态、缺失数据统一显示为「未知」。
 */

(function (root, factory) {
  "use strict";
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PipelineUI = factory();
  }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var STYLES_INJECTED = false;

  function ensureStyles() {
    if (STYLES_INJECTED || typeof document === "undefined" || !document.head) return;
    var existing = document.getElementById("pipeline-ui-styles");
    if (existing) {
      STYLES_INJECTED = true;
      return;
    }

    var css = [
      "/* PipelineUI 自适应布局（390px 手机端零溢出） */",
      ".pui-root { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 100%; box-sizing: border-box; }",
      ".pui-root * { box-sizing: border-box; }",

      ".pui-pill { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 700; line-height: 1.4; max-width: 100%; white-space: normal; word-break: break-word; }",
      ".pui-st-completed, .pui-st-approved { background: var(--ok-bg, #e5f1e6); color: var(--ok, #2f6b3c); }",
      ".pui-st-running, .pui-st-in_progress { background: #e0f2fe; color: #0369a1; border: 1px solid rgba(3,105,161,0.25); }",
      ".pui-st-warn_pass, .pui-st-warning, .pui-st-feedback_submitted { background: var(--warn-bg, #fbf0dd); color: var(--warn, #9a5b12); }",
      ".pui-st-blocked, .pui-st-error, .pui-st-failed, .pui-st-halted { background: #fbe4e2; color: #8c1d18; border: 1px solid rgba(140,29,24,0.3); }",
      ".pui-st-pending, .pui-st-not_started { background: var(--pend-bg, #eceae5); color: var(--pend, #4a5058); }",
      ".pui-st-unknown { background: #f3f4f6; color: #6b7280; border: 1px dashed #9ca3af; }",

      "@media (prefers-color-scheme: dark) {",
      "  .pui-st-running, .pui-st-in_progress { background: #082f49; color: #7dd3fc; border-color: rgba(125,211,252,0.35); }",
      "  .pui-st-blocked, .pui-st-error, .pui-st-failed, .pui-st-halted { background: #450a0a; color: #fca5a5; border-color: rgba(252,165,165,0.35); }",
      "  .pui-st-unknown { background: #1f2937; color: #9ca3af; border-color: #4b5563; }",
      "}",

      "/* 地铁图 Subway Pipeline */",
      ".pui-subway-card { background: var(--card, #fffdf8); border: 1px solid var(--line, #e2ddd2); border-radius: var(--radius, 14px); padding: 14px; max-width: 100%; overflow: hidden; }",
      ".pui-subway-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }",
      ".pui-subway-title { margin: 0; font-size: 16.5px; font-weight: 800; color: var(--ink, #1c1d21); word-break: break-word; }",
      ".pui-subway-sub { font-size: 12px; color: var(--muted, #6b6a66); margin-top: 2px; line-height: 1.45; }",
      ".pui-subway-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; color: var(--muted, #6b6a66); background: var(--bg, #f4f1ea); border-radius: 8px; padding: 8px 10px; margin-bottom: 12px; }",
      ".pui-subway-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; position: relative; }",
      ".pui-subway-item { position: relative; padding-left: 26px; min-width: 0; }",
      ".pui-subway-item::before { content: ''; position: absolute; left: 8px; top: 18px; bottom: -12px; width: 2px; background: var(--line, #e2ddd2); }",
      ".pui-subway-item:last-child::before { display: none; }",
      ".pui-subway-dot { position: absolute; left: 0; top: 4px; width: 18px; height: 18px; border-radius: 50%; background: var(--bg, #f4f1ea); border: 3px solid var(--muted, #6b6a66); z-index: 1; }",
      ".pui-subway-dot.completed, .pui-subway-dot.approved { border-color: var(--ok, #2f6b3c); background: var(--ok, #2f6b3c); }",
      ".pui-subway-dot.running, .pui-subway-dot.in_progress { border-color: #0284c7; background: #fff; box-shadow: 0 0 0 3px rgba(2,132,199,0.25); }",
      ".pui-subway-dot.blocked, .pui-subway-dot.error, .pui-subway-dot.failed, .pui-subway-dot.halted { border-color: #dc2626; background: #dc2626; }",
      ".pui-subway-dot.warn_pass, .pui-subway-dot.warning { border-color: var(--warn, #9a5b12); background: var(--warn, #9a5b12); }",
      ".pui-subway-dot.pending, .pui-subway-dot.not_started { border-color: var(--line, #e2ddd2); background: var(--bg, #f4f1ea); }",
      ".pui-subway-dot.unknown { border-color: #9ca3af; border-style: dashed; }",
      ".pui-subway-body { background: var(--bg, #f4f1ea); border: 1px solid var(--line, #e2ddd2); border-radius: 10px; padding: 10px 12px; min-width: 0; }",
      ".pui-subway-headrow { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }",
      ".pui-subway-stagename { font-size: 14.5px; font-weight: 700; color: var(--ink, #1c1d21); display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }",
      ".pui-subway-owner { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: rgba(166,138,86,0.15); color: var(--gold, #a68a56); font-weight: 700; }",
      ".pui-subway-desc { font-size: 12.5px; color: var(--muted, #6b6a66); margin: 3px 0 6px; line-height: 1.45; word-break: break-word; }",

      ".pui-subtasks { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; padding-top: 6px; border-top: 1px dashed var(--line, #e2ddd2); }",
      ".pui-subtask-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 8px; font-size: 12px; }",
      ".pui-subtask-name { color: var(--ink, #1c1d21); font-weight: 600; min-width: 0; word-break: break-word; }",
      ".pui-subtask-right { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }",
      ".pui-subtask-prog { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: var(--muted, #6b6a66); }",
      ".pui-progress-track { width: 56px; height: 5px; border-radius: 999px; background: var(--line, #e2ddd2); overflow: hidden; flex-shrink: 0; }",
      ".pui-progress-fill { height: 100%; border-radius: 999px; background: var(--ok, #2f6b3c); }",
      ".pui-progress-fill.running { background: #0284c7; }",

      "/* 错误熔断与拦截记录 */",
      ".pui-breaker-box { background: #fdf2f2; border: 1.5px solid #dc2626; border-radius: var(--radius, 14px); padding: 12px 14px; margin-bottom: 12px; }",
      "@media (prefers-color-scheme: dark) { .pui-breaker-box { background: #3b0d0c; border-color: #ef4444; } }",
      ".pui-breaker-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }",
      ".pui-breaker-icon { font-size: 18px; line-height: 1; flex-shrink: 0; }",
      ".pui-breaker-title { font-size: 15.5px; font-weight: 800; color: #991b1b; margin: 0; }",
      "@media (prefers-color-scheme: dark) { .pui-breaker-title { color: #fca5a5; } }",
      ".pui-breaker-ironrules { font-size: 12px; line-height: 1.5; color: #7f1d1d; background: rgba(220,38,38,0.08); border-left: 3px solid #dc2626; padding: 6px 10px; border-radius: 0 6px 6px 0; margin: 8px 0; }",
      "@media (prefers-color-scheme: dark) { .pui-breaker-ironrules { color: #fecaca; background: rgba(239,68,68,0.15); } }",
      ".pui-breaker-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 10px; font-size: 12px; margin: 8px 0; }",
      ".pui-breaker-field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }",
      ".pui-breaker-field-lbl { color: var(--muted, #6b6a66); font-size: 11px; }",
      ".pui-breaker-field-val { font-weight: 700; color: var(--ink, #1c1d21); word-break: break-word; font-family: ui-monospace, SFMono-Regular, monospace; }",
      ".pui-denied-box { background: var(--warn-bg, #fbf0dd); border: 1px solid rgba(154,91,18,0.3); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; font-size: 12px; color: var(--warn, #9a5b12); }",

      "/* 封面 A/B 并排展示组件 */",
      ".pui-cover-section { background: var(--card, #fffdf8); border: 1px solid var(--line, #e2ddd2); border-radius: var(--radius, 14px); padding: 14px; margin: 10px 0; max-width: 100%; }",
      ".pui-cover-quickcompare { display: none; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0 10px; padding: 8px; background: var(--bg, #f4f1ea); border: 1px dashed var(--line, #e2ddd2); border-radius: 10px; }",
      ".pui-cover-quickitem { min-width: 0; display: flex; flex-direction: column; gap: 4px; }",
      ".pui-cover-quicklbl { font-size: 11.5px; font-weight: 800; color: var(--ink, #1c1d21); display: flex; align-items: center; justify-content: space-between; gap: 4px; }",
      ".pui-cover-quickthumb { width: 100%; aspect-ratio: 16/9; border-radius: 6px; overflow: hidden; background: #222; border: 1px solid var(--line, #e2ddd2); }",
      ".pui-cover-quickthumb img { width: 100%; height: 100%; object-fit: cover; display: block; }",
      "@media (max-width: 620px) { .pui-cover-quickcompare.has-both { display: grid; } }",

      ".pui-cover-ab-container { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 10px; }",
      "@media (max-width: 620px) { .pui-cover-ab-container { grid-template-columns: minmax(0, 1fr); } }",
      ".pui-cover-card { display: flex; flex-direction: column; background: var(--bg, #f4f1ea); border: 1px solid var(--line, #e2ddd2); border-radius: 12px; padding: 12px; min-width: 0; position: relative; }",
      ".pui-cover-card.is-primary { border: 2px solid var(--ok, #2f6b3c); box-shadow: 0 2px 8px rgba(47,107,60,0.14); }",
      ".pui-cover-card.is-backup { border: 1.5px dashed #0284c7; }",
      ".pui-cover-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }",
      ".pui-cover-scheme-tag { font-size: 14.5px; font-weight: 800; color: var(--ink, #1c1d21); display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }",
      ".pui-cover-archetype { font-size: 11px; padding: 1px 7px; border-radius: 4px; background: rgba(158,42,43,0.12); color: var(--accent, #9e2a2b); font-weight: 700; }",
      ".pui-cover-primary-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--ok, #2f6b3c); color: #fff; font-weight: 800; }",
      ".pui-cover-backup-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #e0f2fe; color: #0369a1; border: 1px solid rgba(3,105,161,0.3); font-weight: 800; }",
      "@media (prefers-color-scheme: dark) { .pui-cover-backup-badge { background: #082f49; color: #7dd3fc; } }",

      ".pui-cover-figure { margin: 0 0 8px; border-radius: 8px; overflow: hidden; background: #222; border: 1px solid var(--line, #e2ddd2); aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; }",
      ".pui-cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }",
      ".pui-cover-noimg { padding: 16px 12px; text-align: center; color: var(--muted, #6b6a66); font-size: 12.5px; line-height: 1.5; white-space: pre-line; }",
      ".pui-cover-caption { font-size: 11.5px; color: var(--muted, #6b6a66); margin-bottom: 8px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px; }",

      ".pui-cover-copybox { background: var(--card, #fffdf8); border: 1px solid var(--line, #e2ddd2); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; font-size: 12.5px; line-height: 1.45; }",
      ".pui-cover-copylbl { font-size: 11px; font-weight: 700; color: var(--muted, #6b6a66); margin-bottom: 3px; }",
      ".pui-cover-copyval { color: var(--ink, #1c1d21); font-weight: 600; white-space: pre-wrap; word-break: break-word; }",
      ".pui-cover-details { border: 1px dashed var(--line, #e2ddd2); border-radius: 8px; padding: 6px 10px; margin-bottom: 10px; background: var(--card, #fffdf8); }",
      ".pui-cover-summary { font-size: 12px; font-weight: 700; color: var(--muted, #6b6a66); cursor: pointer; user-select: none; min-height: 32px; display: flex; align-items: center; }",
      ".pui-cover-prompt-text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; line-height: 1.5; color: var(--ink, #1c1d21); white-space: pre-wrap; word-break: break-word; margin: 6px 0 2px; padding: 6px 8px; background: var(--bg, #f4f1ea); border-radius: 6px; }",

      ".pui-cover-actions { display: flex; flex-direction: column; gap: 6px; margin-top: auto; }",
      ".pui-cover-btn-primary { width: 100%; min-height: 44px; border-radius: 10px; font-size: 14px; font-weight: 800; border: 1px solid transparent; cursor: pointer; padding: 8px 12px; line-height: 1.3; }",
      ".pui-cover-btn-primary.is-active { background: var(--ok, #2f6b3c); color: #fff; cursor: default; }",
      ".pui-cover-btn-primary.can-select { background: var(--card, #fffdf8); color: var(--ink, #1c1d21); border-color: var(--line, #e2ddd2); }",
      ".pui-cover-btn-primary.can-select:hover { border-color: var(--ok, #2f6b3c); color: var(--ok, #2f6b3c); }",
      ".pui-cover-dissatisfied-bar { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--line, #e2ddd2); display: flex; flex-direction: column; gap: 8px; }",
      ".pui-cover-dissatisfied-lbl { font-size: 12px; font-weight: 700; color: var(--muted, #6b6a66); }",
      ".pui-cover-returns-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }",
      "@media (max-width: 480px) { .pui-cover-returns-row { grid-template-columns: minmax(0, 1fr); } }",
      ".pui-cover-btn-return { min-height: 44px; font-size: 13px; font-weight: 700; border-radius: 10px; border: 1px solid rgba(154,91,18,0.35); background: var(--warn-bg, #fbf0dd); color: var(--warn, #9a5b12); cursor: pointer; padding: 8px 12px; line-height: 1.35; text-align: center; }",
      ".pui-cover-btn-return:disabled { opacity: 0.5; cursor: not-allowed; }",

      "/* 未来三天排期（每天 1 长 + 1 短 · 克制暖宣纸浅底分区） */",
      ".pui-schedule-section { background: #faf5eb; border: 1px solid #dfd2bc; border-left: 4px solid #b5894c; border-radius: var(--radius, 14px); padding: 13px 14px; margin-bottom: 14px; max-width: 100%; }",
      "@media (prefers-color-scheme: dark) { .pui-schedule-section { background: #221f1a; border-color: #3d3529; border-left-color: #c99d5e; } }",
      ".pui-sched-rules { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }",
      ".pui-sched-rule-short { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: #e6f4ee; color: #1e6043; }",
      ".pui-sched-rule-long { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: #e8eef6; color: #2b4c7e; }",
      "@media (prefers-color-scheme: dark) { .pui-sched-rule-short { background: #143528; color: #8ce0b5; } .pui-sched-rule-long { background: #1a293d; color: #9ec0f0; } }",
      ".pui-schedule-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin-top: 10px; }",
      ".pui-day-card { background: var(--card, #ffffff); border: 1px solid #e4dac9; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 7px; min-width: 0; }",
      "@media (prefers-color-scheme: dark) { .pui-day-card { background: #191b20; border-color: #333742; } }",
      ".pui-day-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; border-bottom: 1px dashed var(--line, #e2ddd2); padding-bottom: 5px; flex-wrap: wrap; }",
      ".pui-day-title { font-size: 13.5px; font-weight: 800; color: var(--ink, #1c1d21); }",
      ".pui-day-slot { display: flex; align-items: flex-start; gap: 7px; font-size: 13px; line-height: 1.45; min-width: 0; }",
      ".pui-slot-badge { flex-shrink: 0; font-size: 11px; font-weight: 800; padding: 1.5px 6px; border-radius: 5px; margin-top: 1px; }",
      ".pui-slot-badge.short { background: #e6f4ee; color: #1e6043; }",
      ".pui-slot-badge.long { background: #e8eef6; color: #2b4c7e; }",
      "@media (prefers-color-scheme: dark) { .pui-slot-badge.short { background: #143528; color: #8ce0b5; } .pui-slot-badge.long { background: #1a293d; color: #9ec0f0; } }",
      ".pui-slot-body { min-width: 0; flex: 1; }",
      ".pui-slot-title { font-weight: 700; color: var(--ink, #1c1d21); word-break: break-word; }",
      ".pui-slot-note { font-size: 11.5px; color: var(--muted, #6b6a66); margin-top: 1px; word-break: break-word; }",
      ".pui-day-task { font-size: 13px; font-weight: 700; color: var(--ink, #1c1d21); line-height: 1.4; word-break: break-word; }",
      ".pui-day-sub { font-size: 12px; color: var(--muted, #6b6a66); line-height: 1.45; word-break: break-word; }",
      ".pui-queue-banner { margin-top: 8px; padding: 7px 10px; border-radius: 8px; background: #e8eef6; color: #2b4c7e; font-size: 12px; line-height: 1.45; }",
      "@media (prefers-color-scheme: dark) { .pui-queue-banner { background: #1a293d; color: #9ec0f0; } }",

      ".pui-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 8px 14px; border-radius: 10px; font-size: 14px; font-weight: 700; border: 1px solid transparent; cursor: pointer; }",
      ".pui-btn:disabled { opacity: 0.55; cursor: not-allowed; }",
      ".pui-btn-primary { background: var(--ok, #2f6b3c); color: #fff; }",
      ".pui-btn-warn { background: var(--warn-bg, #fbf0dd); color: var(--warn, #9a5b12); border-color: rgba(154,91,18,0.3); }",
      ".pui-btn-ghost { background: var(--card, #fffdf8); color: var(--ink, #1c1d21); border-color: var(--line, #e2ddd2); }"
    ];

    var styleNode = document.createElement("style");
    styleNode.id = "pipeline-ui-styles";
    styleNode.textContent = css.join("\n");
    document.head.appendChild(styleNode);
    STYLES_INJECTED = true;
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  function safeText(val, fallback) {
    if (val === null || val === undefined) return fallback !== undefined ? fallback : "未知";
    var s = String(val).trim();
    return s.length > 0 ? s : (fallback !== undefined ? fallback : "未知");
  }

  function formatTime(isoStr) {
    if (!isoStr) return "未知";
    try {
      var cleaned = String(isoStr).replace("T", " ").replace(/\.\d+/, "").replace(/([+-]\d{2}:\d{2}|Z)$/, "");
      return cleaned.slice(0, 19) || "未知";
    } catch (_) {
      return "未知";
    }
  }

  var STATUS_LABEL_MAP = {
    completed: "已完成",
    approved: "已通过",
    running: "进行中",
    in_progress: "进行中",
    warn_pass: "告警放行",
    warning: "例外放行",
    feedback_submitted: "已提意见",
    blocked: "阻断拦截",
    halted: "异常熔断",
    error: "熔断错误",
    failed: "失败",
    pending: "待启动",
    not_started: "未开始",
    unknown: "未知"
  };

  function resolveStatusClass(status) {
    var st = String(status || "").toLowerCase().trim();
    if (st === "completed" || st === "approved") return "pui-st-completed";
    if (st === "running" || st === "in_progress") return "pui-st-running";
    if (st === "warn_pass" || st === "warning" || st === "feedback_submitted") return "pui-st-warn_pass";
    if (st === "blocked" || st === "error" || st === "failed" || st === "halted") return "pui-st-blocked";
    if (st === "pending" || st === "not_started") return "pui-st-pending";
    return "pui-st-unknown";
  }

  function statusPill(status, customLabel) {
    var cls = "pui-pill " + resolveStatusClass(status);
    var label = customLabel || STATUS_LABEL_MAP[status] || "未知";
    return el("span", cls, label);
  }

  // =========================================================================
  // 1. EpisodePipelineStore -> 地铁图视图数据适配器 (不推算、缺项一律写“未知”)
  // =========================================================================
  var PIPELINE_STAGES_DEF = [
    { key: "TOPIC_PROPOSED", name: "选题与排期提报待审（或作者手动直提新故事）", owner: "Rozi → 作者审核" },
    { key: "TOPIC_APPROVED", name: "选题已通过（已入异步队列）", owner: "作者审批" },
    { key: "PREPROD_RUNNING", name: "前期撰稿 · Rozi 包装（长片 A/B 封面提示词） · 导演设计", owner: "AGY + Rozi + Codex" },
    { key: "GATE_CONTENT_AND_BUDGET", name: "三项独立审核与付费预算关口", owner: "作者门禁" },
    { key: "PROD_STAGE5_PARALLEL", name: "阶段 5 并行资产生产（配音时轴 ＋ 生图）", owner: "Tom + Zoe" },
    { key: "PROD_PRE_RENDER_GATE", name: "渲染前汇合质检闸门（Pre-Render Gate）", owner: "Neo QC" },
    { key: "PROD_STAGE6_SYNTHESIS", name: "阶段 6 配乐校准与分章视频合成", owner: "Daniel + AGY" },
    { key: "READY_FOR_FINAL_REVIEW", name: "成片就绪待作者终审发布", owner: "作者终审" }
  ];

  var STAGE_INDEX_MAP = {};
  for (var si = 0; si < PIPELINE_STAGES_DEF.length; si++) {
    STAGE_INDEX_MAP[PIPELINE_STAGES_DEF[si].key] = si;
  }

  function buildRoleSubtask(roleObj, fallbackLabel) {
    if (!roleObj || typeof roleObj !== "object") {
      return {
        name: fallbackLabel,
        status: "unknown",
        status_label: "未知",
        display_progress: "未知",
        progress_pct: null
      };
    }
    var rSt = String(roleObj.status || "unknown").toLowerCase();
    var disp = safeText(roleObj.display_progress, "未知");
    var pct = null;
    if (
      typeof roleObj.completed_units === "number" &&
      typeof roleObj.total_units === "number" &&
      roleObj.total_units > 0
    ) {
      pct = (roleObj.completed_units / roleObj.total_units) * 100.0;
    }
    return {
      name: safeText(roleObj.label || fallbackLabel, fallbackLabel),
      status: rSt,
      status_label: safeText(roleObj.status_label, STATUS_LABEL_MAP[rSt] || "未知"),
      display_progress: disp,
      progress_pct: pct
    };
  }

  function buildSubwayFromEpisodePipeline(pipeObj, storyTitle) {
    var p = pipeObj || {};
    var curState = String(p.status || "");
    var isHalted = curState === "HALTED_ON_ERROR";
    var haltInfo = p.halt_info || null;
    var activeKey = isHalted && haltInfo && haltInfo.interrupted_stage
      ? String(haltInfo.interrupted_stage)
      : curState;
    var curIdx = Object.prototype.hasOwnProperty.call(STAGE_INDEX_MAP, activeKey)
      ? STAGE_INDEX_MAP[activeKey]
      : -1;

    var roles = p.roles || {};
    var chap = p.chapter_progress || {};
    var gate = p.content_and_budget_gate || null;

    var stages = PIPELINE_STAGES_DEF.map(function (def, idx) {
      var st = "unknown";
      var stLabel = "未知";
      if (curIdx >= 0) {
        if (idx < curIdx) {
          st = "completed";
          stLabel = "已完成";
        } else if (idx === curIdx) {
          if (isHalted) {
            st = "halted";
            stLabel = "异常熔断停机";
          } else if (curState === "READY_FOR_FINAL_REVIEW") {
            st = "completed";
            stLabel = "成片待终审";
          } else {
            st = "running";
            stLabel = safeText(p.status_label, "当前阶段");
          }
        } else {
          st = "pending";
          stLabel = "未到达";
        }
      }

      var detail = "";
      var subtasks = [];
      if (def.key === "PREPROD_RUNNING") {
        subtasks.push(buildRoleSubtask(roles.rozi, "选题与包装专员 Rozi"));
        detail = "故事 v" + safeText(p.script_version, "未知") +
          " · 预包装 v" + safeText(p.packaging_version, "未知") +
          " · 导演设计 v" + safeText(p.design_version, "未知");
      } else if (def.key === "GATE_CONTENT_AND_BUDGET") {
        if (gate) {
          var exc = gate.episode_exception;
          if (exc && exc.status === "author_episode_exception_deferred") {
            if (st === "completed") st = "warn_pass";
            stLabel = "单集特批放行（通用门禁不变）";
            detail = "作者单集例外：" + safeText(exc.reason, "预包装暂缓，本集先行制作") + "（仅限本集）";
          } else {
            detail = "三项审核与预算核验已记录";
          }
        } else {
          detail = "须故事、预包装、导演设计独立审核通过且收费预算获批";
        }
      } else if (def.key === "PROD_STAGE5_PARALLEL") {
        subtasks.push(buildRoleSubtask(roles.tom, "配音与时轴专员 Tom"));
        subtasks.push(buildRoleSubtask(roles.zoe, "视觉生图专员 Zoe"));
      } else if (def.key === "PROD_PRE_RENDER_GATE") {
        subtasks.push(buildRoleSubtask(roles.neo, "渲染前质检专员 Neo"));
      } else if (def.key === "PROD_STAGE6_SYNTHESIS") {
        subtasks.push(buildRoleSubtask(roles.daniel, "配乐与混音专员 Daniel"));
        var chapPct = null;
        if (
          typeof chap.completed_chapters === "number" &&
          typeof chap.total_chapters === "number" &&
          chap.total_chapters > 0
        ) {
          chapPct = (chap.completed_chapters / chap.total_chapters) * 100.0;
        }
        var chapDisp = safeText(chap.display_progress, "未知");
        subtasks.push({
          name: "分章视频渲染合成",
          status: chapPct === 100 ? "completed" : (chapPct !== null && chapPct > 0 ? "running" : "not_started"),
          status_label: chapDisp === "未知" ? "未知" : (chapPct === 100 ? "已完成" : "分章进度"),
          display_progress: chapDisp,
          progress_pct: chapPct
        });
      }

      return {
        id: def.key,
        name: def.name,
        owner: def.owner,
        status: st,
        status_label: stLabel,
        detail: detail,
        subtasks: subtasks
      };
    });

    var breaker = null;
    if (isHalted) {
      var hi = haltInfo || {};
      var msgParts = [];
      if (hi.stop_reason) msgParts.push(String(hi.stop_reason));
      if (hi.error_message && hi.error_message !== hi.stop_reason) msgParts.push(String(hi.error_message));
      if (!msgParts.length && hi.reason) msgParts.push(String(hi.reason));
      breaker = {
        stage: hi.interrupted_stage_label || hi.interrupted_stage || "未知环节",
        error_code: hi.error_type || hi.error_code || (hi.http_status ? ("HTTP " + hi.http_status) : "未知"),
        request_id: hi.request_id || hi.log_id || "未知",
        has_submit_lock: true,
        timestamp: hi.halted_at || p.updated_at,
        is_paid_service: true,
        message: msgParts.length ? msgParts.join(" ｜ ") : "遇到异常已停机保护，禁止自动收费重试"
      };
    }

    var overallSt = isHalted
      ? "halted"
      : (curState === "READY_FOR_FINAL_REVIEW" ? "completed" : (curIdx >= 0 ? "running" : "unknown"));

    var rawDenied = Array.isArray(p.denied_actions) && p.denied_actions.length
      ? p.denied_actions
      : (haltInfo && Array.isArray(haltInfo.denied_actions) ? haltInfo.denied_actions : []);
    var latestReqOrLog = p.last_request_id || p.last_log_id || (haltInfo && (haltInfo.request_id || haltInfo.log_id)) || null;

    return {
      project_id: safeText(p.project_id, "未知"),
      pipeline_title: (storyTitle ? ("《" + storyTitle + "》") : safeText(p.project_id, "未命名项目")) + " · 制作进度地铁图",
      overall_status: overallSt,
      overall_status_label: safeText(p.status_label, "未知状态"),
      updated_at: p.updated_at || null,
      last_request_id: latestReqOrLog,
      denied_actions: rawDenied,
      circuit_breaker: breaker,
      stages: stages
    };
  }

  // =========================================================================
  // 2. 错误熔断展示组件 (renderCircuitBreaker)
  // =========================================================================
  function renderCircuitBreaker(container, errorData, options) {
    ensureStyles();
    if (!container) return null;
    var opts = options || {};
    var data = errorData || {};

    var card = el("section", "pui-breaker-box");
    card.setAttribute("role", "alert");

    var head = el("div", "pui-breaker-head");
    head.appendChild(el("span", "pui-breaker-icon", "🛑"));
    head.appendChild(el("h3", "pui-breaker-title", "管线异常熔断停机 (HALTED_ON_ERROR)"));
    card.appendChild(head);

    card.appendChild(
      el(
        "div",
        "pui-breaker-ironrules",
        "【硬约束】遇到 HTTP 错误、限流、断连、超时或欠费已立即停止，不自动收费重试、不充值买额度。"
      )
    );

    var grid = el("div", "pui-breaker-grid");
    function addField(lbl, val) {
      var f = el("div", "pui-breaker-field");
      f.appendChild(el("span", "pui-breaker-field-lbl", lbl));
      f.appendChild(el("span", "pui-breaker-field-val", safeText(val, "未知")));
      grid.appendChild(f);
    }
    addField("中断阶段", data.stage || data.stage_name || "未知");
    addField("错误码 / HTTP 状态", data.error_code || (data.status_code ? ("HTTP " + data.status_code) : "未知"));
    addField("Request / Log ID", data.request_id || data.log_id || "未知");
    addField("停机时间", formatTime(data.timestamp || data.created_at));
    card.appendChild(grid);

    var reasonBox = el("div", "pui-breaker-field");
    reasonBox.appendChild(el("span", "pui-breaker-field-lbl", "熔断原因"));
    var reasonVal = el("div", "pui-breaker-field-val", safeText(data.message || data.reason, "未知"));
    reasonVal.style.fontWeight = "normal";
    reasonBox.appendChild(reasonVal);
    card.appendChild(reasonBox);

    if (typeof opts.onCopyDetails === "function") {
      var act = el("div", "");
      act.style.marginTop = "8px";
      var copyBtn = el("button", "pui-btn pui-btn-ghost", "复制熔断诊断信息");
      copyBtn.type = "button";
      copyBtn.addEventListener("click", function () { opts.onCopyDetails(data); });
      act.appendChild(copyBtn);
      card.appendChild(act);
    }

    container.appendChild(card);
    return card;
  }

  // =========================================================================
  // 3. 地铁图进度组件 (renderSubwayPipeline)
  // =========================================================================
  function renderSubwayPipeline(container, pipelineData, options) {
    ensureStyles();
    if (!container) return null;
    var raw = pipelineData || {};
    var data = Array.isArray(raw.stages) ? raw : buildSubwayFromEpisodePipeline(raw, options && options.storyTitle);
    var opts = options || {};
    var stages = Array.isArray(data.stages) ? data.stages : [];

    var card = el("section", "pui-subway-card");
    card.setAttribute("role", "region");
    card.setAttribute("aria-label", "制作管线地铁图进度");

    var head = el("div", "pui-subway-header");
    var leftHead = el("div");
    leftHead.appendChild(el("h3", "pui-subway-title", safeText(data.pipeline_title, "制作进度地铁图")));
    leftHead.appendChild(el("div", "pui-subway-sub", "展示真实磁盘落盘状态与各专岗/分章进度；缺失数据固定显示「未知」"));
    head.appendChild(leftHead);
    head.appendChild(statusPill(data.overall_status || "unknown", data.overall_status_label));
    card.appendChild(head);

    var metaRow = el("div", "pui-subway-meta");
    metaRow.appendChild(el("span", "", "项目 ID：" + safeText(data.project_id, "未知")));
    metaRow.appendChild(el("span", "", "最后更新：" + formatTime(data.updated_at)));
    metaRow.appendChild(el("span", "", "最近请求/日志 ID：" + safeText(data.last_request_id, "未知")));
    card.appendChild(metaRow);

    if (data.circuit_breaker) {
      renderCircuitBreaker(card, data.circuit_breaker, opts.circuitBreakerOptions);
    }

    var denied = Array.isArray(data.denied_actions) ? data.denied_actions : [];
    if (denied.length > 0) {
      var lastDen = denied[denied.length - 1];
      var denText = typeof lastDen === "string"
        ? safeText(lastDen, "未知被拒操作")
        : (safeText(lastDen && lastDen.action, "未知操作") + " — " + safeText(lastDen && lastDen.reason, "未知原因"));
      card.appendChild(
        el(
          "div",
          "pui-denied-box",
          "⚠️ 已记录被拒/拦截操作共 " + denied.length + " 条（最近：" + denText + "）"
        )
      );
    }

    var list = el("ol", "pui-subway-list");
    stages.forEach(function (stg, idx) {
      var stgStatus = String(stg.status || "unknown").toLowerCase();
      var item = el("li", "pui-subway-item");

      var dotCls = "pui-subway-dot " + resolveStatusClass(stgStatus).replace("pui-st-", "");
      var dot = el("div", dotCls);
      dot.setAttribute("aria-hidden", "true");
      item.appendChild(dot);

      var body = el("div", "pui-subway-body");
      var headRow = el("div", "pui-subway-headrow");
      var nameRow = el("div", "pui-subway-stagename");
      nameRow.appendChild(document.createTextNode((idx + 1) + ". " + safeText(stg.name, "未知阶段")));
      if (stg.owner) {
        nameRow.appendChild(el("span", "pui-subway-owner", safeText(stg.owner)));
      }
      headRow.appendChild(nameRow);
      headRow.appendChild(statusPill(stgStatus, stg.status_label));
      body.appendChild(headRow);

      if (stg.detail) {
        body.appendChild(el("div", "pui-subway-desc", safeText(stg.detail)));
      }

      var subtasks = Array.isArray(stg.subtasks) ? stg.subtasks : [];
      if (subtasks.length > 0) {
        var subBox = el("div", "pui-subtasks");
        subtasks.forEach(function (sub) {
          var sRow = el("div", "pui-subtask-row");
          sRow.appendChild(el("span", "pui-subtask-name", safeText(sub.name, "未知专岗")));

          var sRight = el("div", "pui-subtask-right");
          sRight.appendChild(el("span", "pui-subtask-prog", "进度：" + safeText(sub.display_progress, "未知")));
          if (typeof sub.progress_pct === "number" && !isNaN(sub.progress_pct)) {
            var track = el("div", "pui-progress-track");
            var fill = el("div", "pui-progress-fill" + (sub.status === "running" ? " running" : ""));
            fill.style.width = Math.max(0, Math.min(100, sub.progress_pct)) + "%";
            track.appendChild(fill);
            sRight.appendChild(track);
          }
          sRight.appendChild(statusPill(sub.status || "unknown", sub.status_label));
          sRow.appendChild(sRight);
          subBox.appendChild(sRow);
        });
        body.appendChild(subBox);
      }

      item.appendChild(body);
      list.appendChild(item);
    });

    card.appendChild(list);
    container.appendChild(card);
    return card;
  }

  // =========================================================================
  // 4. 独立「选题与 1–3 天排期」顶部面板 (renderRollingScheduleBanner)
  // =========================================================================
  function renderRollingScheduleBanner(container, rollingSchedule, asyncQueue) {
    ensureStyles();
    if (!container) return null;

    var sec = el("section", "pui-schedule-section");
    sec.setAttribute("role", "region");
    sec.setAttribute("aria-label", "未来三天排期");

    var head = el("div", "pui-subway-header");
    head.style.marginBottom = "4px";
    var leftHead = el("div");
    leftHead.appendChild(el("h3", "pui-subway-title", "📅 未来三天排期（每天 1 长 + 1 短）"));
    var ruleRow = el("div", "pui-sched-rules");
    ruleRow.appendChild(el("span", "pui-sched-rule-short", "⚡ Shorts：强制每天发 1 期"));
    ruleRow.appendChild(el("span", "pui-sched-rule-long", "🎬 长视频：可先选储备 · 不强制发布"));
    leftHead.appendChild(ruleRow);
    head.appendChild(leftHead);
    sec.appendChild(head);

    var days = rollingSchedule && Array.isArray(rollingSchedule.days) ? rollingSchedule.days : [];
    if (days.length > 0) {
      var grid = el("div", "pui-schedule-grid");
      days.forEach(function (d, idx) {
        var dayCard = el("div", "pui-day-card");
        var dHead = el("div", "pui-day-head");
        var lbl = safeText(d.day_label, "Day " + (idx + 1)) + (d.date ? (" · " + d.date) : "");
        dHead.appendChild(el("span", "pui-day-title", lbl));
        dayCard.appendChild(dHead);

        if (d.short_title || d.long_title) {
          var sRow = el("div", "pui-day-slot");
          sRow.appendChild(el("span", "pui-slot-badge short", "短·必发"));
          var sBody = el("div", "pui-slot-body");
          sBody.appendChild(el("div", "pui-slot-title", safeText(d.short_title, "待选定今日 Shorts")));
          if (d.short_note) sBody.appendChild(el("div", "pui-slot-note", safeText(d.short_note)));
          sRow.appendChild(sBody);
          dayCard.appendChild(sRow);

          var lRow = el("div", "pui-day-slot");
          lRow.appendChild(el("span", "pui-slot-badge long", "长·备选"));
          var lBody = el("div", "pui-slot-body");
          lBody.appendChild(el("div", "pui-slot-title", safeText(d.long_title, "可先勾选储备")));
          if (d.long_note) lBody.appendChild(el("div", "pui-slot-note", safeText(d.long_note)));
          lRow.appendChild(lBody);
          dayCard.appendChild(lRow);
        } else {
          dayCard.appendChild(el("div", "pui-day-task", safeText(d.task_title, "未命名排期项")));
          if (d.detail) {
            dayCard.appendChild(el("div", "pui-day-sub", safeText(d.detail)));
          }
        }
        grid.appendChild(dayCard);
      });
      sec.appendChild(grid);
    } else {
      sec.appendChild(
        el("div", "pui-subway-desc", "暂无未来三天排期卡片。")
      );
    }

    var tasks = asyncQueue && Array.isArray(asyncQueue.tasks) ? asyncQueue.tasks : [];
    var activeTasks = tasks.filter(function (t) {
      return t && (t.status === "queued" || t.status === "running");
    });
    if (activeTasks.length > 0) {
      sec.appendChild(
        el(
          "div",
          "pui-queue-banner",
          "✓ 已勾选进入备选/待办队列：" + activeTasks.length + " 项"
        )
      );
    }

    container.appendChild(sec);
    return sec;
  }

  // =========================================================================
  // 5. 预包装 A/B 封面并排展示组件 (renderCoverAB)
  // =========================================================================
  function resolveVariantImageUrl(vData, mediaUrlFn) {
    if (!vData || typeof vData !== "object") return "";
    if (vData.image_url) return String(vData.image_url);
    var fin = vData.final_image;
    if (fin && typeof fin === "object" && fin.exists !== false) {
      if (fin.url) return String(fin.url);
      if (fin.rel_path && typeof mediaUrlFn === "function") return mediaUrlFn(fin.rel_path);
      if (fin.rel_path) return "/api/media/" + String(fin.rel_path).replace(/^\/+/, "");
    }
    var cln = vData.clean_image;
    if (cln && typeof cln === "object" && cln.exists !== false) {
      if (cln.url) return String(cln.url);
      if (cln.rel_path && typeof mediaUrlFn === "function") return mediaUrlFn(cln.rel_path);
      if (cln.rel_path) return "/api/media/" + String(cln.rel_path).replace(/^\/+/, "");
    }
    return "";
  }

  function renderCoverAB(container, coverData, options) {
    ensureStyles();
    if (!container) return null;
    var data = coverData || {};
    var opts = options || {};
    var variants = data.cover_variants || data;

    var schemeAData = variants.A || data.scheme_a || data.cover_a || {};
    var schemeBData = variants.B || data.scheme_b || data.cover_b || {};
    var curPrimary = data.primary_cover_variant || data.primary_scheme || data.selected_scheme || null;
    if (curPrimary) curPrimary = String(curPrimary).toUpperCase();
    var curBackup = data.backup_cover_variant || (curPrimary === "A" ? "B" : (curPrimary === "B" ? "A" : null));

    var sec = el("section", "pui-cover-section");
    sec.setAttribute("role", "region");
    sec.setAttribute("aria-label", "预包装 A/B 排字封面对比与选择");

    var head = el("div", "pui-subway-header");
    var leftHead = el("div");
    leftHead.appendChild(el("h3", "pui-subway-title", "🎨 长视频预包装 A/B 封面方案（Rozi 提示词 · 参考真实调研审美）"));
    leftHead.appendChild(
      el(
        "div",
        "pui-subway-sub",
        "仅长视频需要封面（Shorts 无需封面）。Rozi 明确写好 A/B 提示词（输出工作台或 AGY 对话均可，取消 Codex 封面制作）；选定一张设为「首发主封面」，另一张留作「CTR 迭代备用封面」。"
      )
    );
    head.appendChild(leftHead);

    if (curPrimary === "A" || curPrimary === "B") {
      head.appendChild(
        statusPill(
          "completed",
          "首发主封面：" + curPrimary + " ｜ CTR 备用：" + (curBackup || (curPrimary === "A" ? "B" : "A"))
        )
      );
    } else {
      head.appendChild(statusPill("warn_pass", "待选定首发主封面"));
    }
    sec.appendChild(head);

    var urlA = resolveVariantImageUrl(schemeAData, opts.resolveMediaUrl);
    var urlB = resolveVariantImageUrl(schemeBData, opts.resolveMediaUrl);

    // 窄屏（手机端 <=620px）顶部提供 A/B 左右同屏快览缩略图，兼顾并排对比与下方大按钮无横向滚动
    var quickCompare = el("div", "pui-cover-quickcompare" + (urlA && urlB ? " has-both" : ""));
    if (urlA && urlB) {
      [
        { key: "A", url: urlA },
        { key: "B", url: urlB }
      ].forEach(function (q) {
        var qItem = el("div", "pui-cover-quickitem");
        var qLbl = el("div", "pui-cover-quicklbl");
        qLbl.appendChild(el("span", "", "方案 " + q.key));
        if (curPrimary === q.key) {
          qLbl.appendChild(el("span", "pui-cover-primary-badge", "首发"));
        } else if (curBackup === q.key) {
          qLbl.appendChild(el("span", "pui-cover-backup-badge", "CTR 备用"));
        }
        qItem.appendChild(qLbl);
        var qThumb = el("div", "pui-cover-quickthumb");
        var qImg = el("img", "");
        qImg.loading = "lazy";
        qImg.alt = "方案 " + q.key + " 缩略对比";
        qImg.src = q.url;
        if (typeof opts.onOpenImage === "function") {
          qThumb.style.cursor = "zoom-in";
          qThumb.addEventListener("click", function () { opts.onOpenImage(q.url); });
        }
        qThumb.appendChild(qImg);
        qItem.appendChild(qThumb);
        quickCompare.appendChild(qItem);
      });
      sec.appendChild(quickCompare);
    }

    var abWrap = el("div", "pui-cover-ab-container");
    var schemes = [
      {
        key: "A",
        label: safeText(schemeAData.variant_name, "方案 A"),
        defaultArchetype: "人物神态特写 / 强反差留白",
        url: urlA,
        data: schemeAData
      },
      {
        key: "B",
        label: safeText(schemeBData.variant_name, "方案 B"),
        defaultArchetype: "制度空间压迫 / 博弈对峙",
        url: urlB,
        data: schemeBData
      }
    ];

    schemes.forEach(function (sch) {
      var sKey = sch.key;
      var sData = sch.data || {};
      var isPrimary = curPrimary === sKey;
      var isBackup = !isPrimary && curBackup === sKey;

      var cardCls = "pui-cover-card" + (isPrimary ? " is-primary" : (isBackup ? " is-backup" : ""));
      var card = el("article", cardCls);
      card.setAttribute("aria-label", "封面方案 " + sKey);

      var cHead = el("div", "pui-cover-head");
      var titleTag = el("div", "pui-cover-scheme-tag");
      titleTag.appendChild(document.createTextNode(sch.label));
      var archetype = sData.archetype || sData.composition_archetype || sch.defaultArchetype;
      titleTag.appendChild(el("span", "pui-cover-archetype", safeText(archetype)));
      cHead.appendChild(titleTag);

      if (isPrimary) {
        cHead.appendChild(el("span", "pui-cover-primary-badge", "★ 首发主封面"));
      } else if (isBackup) {
        cHead.appendChild(el("span", "pui-cover-backup-badge", "⇄ CTR 迭代备用封面"));
      }
      card.appendChild(cHead);

      if (sch.url) {
        var fig = el("figure", "pui-cover-figure");
        var img = el("img", "pui-cover-img");
        img.loading = "lazy";
        img.alt = sch.label + " 封面预览";
        img.src = sch.url;
        if (typeof opts.onOpenImage === "function") {
          fig.style.cursor = "zoom-in";
          fig.addEventListener("click", function () { opts.onOpenImage(sch.url); });
        }
        img.addEventListener("error", function () {
          fig.textContent = "";
          fig.appendChild(el("div", "pui-cover-noimg", "封面图加载失败"));
        });
        fig.appendChild(img);
        card.appendChild(fig);
      }

      var cap = el("div", "pui-cover-caption");
      cap.appendChild(el("span", "", "留白方位：" + safeText(sData.blank_position || sData.placement, "未注明")));
      cap.appendChild(el("span", "", sch.url ? "已附封面成图" : "提示词直审模式（无需 Codex 出图）"));
      card.appendChild(cap);

      var copyBox = el("div", "pui-cover-copybox");
      copyBox.appendChild(el("div", "pui-cover-copylbl", "拟排繁体主文案："));
      var copyParts = [];
      if (sData.main_text) copyParts.push(String(sData.main_text));
      if (sData.sub_text) copyParts.push("副标：" + String(sData.sub_text));
      if (!copyParts.length && (sData.typography_spec || sData.copy_text)) {
        copyParts.push(String(sData.typography_spec || sData.copy_text));
      }
      copyBox.appendChild(el("div", "pui-cover-copyval", copyParts.length ? copyParts.join(" · ") : "未知"));
      card.appendChild(copyBox);

      var details = el("details", "pui-cover-details");
      if (!sch.url) details.open = true;
      var summary = el("summary", "pui-cover-summary", sch.url ? "▸ 展开查看 Rozi 封面提示词 (Prompt)" : "▾ Rozi 封面生图提示词 (Prompt)");
      details.appendChild(summary);
      var promptContent = sData.image_prompt || sData.prompt || sData.english_prompt;
      details.appendChild(
        el("div", "pui-cover-prompt-text", safeText(promptContent, "未提供英文提示词"))
      );
      if (sData.negative_prompt) {
        details.appendChild(
          el("div", "pui-cover-prompt-text", "Negative: " + safeText(sData.negative_prompt))
        );
      }
      card.appendChild(details);

      if (!opts.readOnly) {
        var actions = el("div", "pui-cover-actions");
        var otherKey = sKey === "A" ? "B" : "A";
        var primaryBtn = el(
          "button",
          "pui-cover-btn-primary" + (isPrimary ? " is-active" : " can-select"),
          isPrimary
            ? ("✓ 已设为「首发主封面」（方案 " + otherKey + " 为 CTR 迭代备用）")
            : ("⭐ 设为「首发主封面」（方案 " + otherKey + " 留作 CTR 备用）")
        );
        primaryBtn.type = "button";
        primaryBtn.disabled = Boolean(isPrimary || opts.disabled);
        primaryBtn.addEventListener("click", function () {
          if (typeof opts.onSelectPrimary === "function") {
            opts.onSelectPrimary(sKey, sData);
          }
        });
        actions.appendChild(primaryBtn);
        card.appendChild(actions);
      }

      abWrap.appendChild(card);
    });

    sec.appendChild(abWrap);

    if (!opts.readOnly) {
      var disBar = el("div", "pui-cover-dissatisfied-bar");
      disBar.appendChild(
        el(
          "div",
          "pui-cover-dissatisfied-lbl",
          "两版封面提示词都不满意时，可退回 Rozi 重出（不影响已通过的故事正文与导演设计）："
        )
      );
      var retRow = el("div", "pui-cover-returns-row");

      var retRoziBtn = el("button", "pui-cover-btn-return", "🔄 退回 Rozi 重改封面提示词");
      retRoziBtn.type = "button";
      retRoziBtn.disabled = Boolean(opts.disabled);
      retRoziBtn.addEventListener("click", function () {
        if (typeof opts.onReturnFeedback === "function") {
          opts.onReturnFeedback("return_rozi_prompt");
        }
      });
      retRow.appendChild(retRoziBtn);

      disBar.appendChild(retRow);
      sec.appendChild(disBar);
    }

    container.appendChild(sec);
    return sec;
  }

  return {
    version: "1.1.0",
    ensureStyles: ensureStyles,
    buildSubwayFromEpisodePipeline: buildSubwayFromEpisodePipeline,
    renderCircuitBreaker: renderCircuitBreaker,
    renderSubwayPipeline: renderSubwayPipeline,
    renderRollingScheduleBanner: renderRollingScheduleBanner,
    renderCoverAB: renderCoverAB,
    utils: {
      el: el,
      safeText: safeText,
      formatTime: formatTime,
      statusPill: statusPill,
      resolveStatusClass: resolveStatusClass
    }
  };
});
