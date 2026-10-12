/* @ds-bundle: {"format":4,"namespace":"LindyOS","components":[{"name":"AppBar"},{"name":"BottomNav"},{"name":"Fab"},{"name":"Button"},{"name":"SegmentedControl"},{"name":"Money"},{"name":"SummaryCard"},{"name":"OrderRow"},{"name":"StatusChip"},{"name":"Toast"},{"name":"TextField"},{"name":"Icon"}]} */
(function () {
  "use strict";
  var React = window.React;
  var h = React.createElement;

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) out.push(arguments[i]);
    return out.join(" ");
  }
  function omit(obj, keys) {
    var o = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k) && keys.indexOf(k) < 0) o[k] = obj[k];
    return o;
  }
  function groupDigits(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }

  // 8450000 -> "8.450.000đ"; negative values use a real minus sign.
  function formatVND(value, opts) {
    var n = Math.round(Number(value) || 0);
    var sign = n < 0 ? "−" : (opts && opts.sign && n > 0 ? "+" : "");
    return sign + groupDigits(Math.abs(n)) + "đ";
  }
  // "1.250.000đ" -> 1250000 (digits only; money is always a whole number of VND).
  function parseVND(text) {
    var d = String(text == null ? "" : text).replace(/[^\d]/g, "");
    return d ? parseInt(d, 10) : 0;
  }

  // ---------- Icon ----------
  var DOTS = [
    ["circle", { cx: 6, cy: 12, r: 1.6, fill: "currentColor", stroke: "none" }],
    ["circle", { cx: 12, cy: 12, r: 1.6, fill: "currentColor", stroke: "none" }],
    ["circle", { cx: 18, cy: 12, r: 1.6, fill: "currentColor", stroke: "none" }]
  ];
  var ICONS = {
    home: [["path", { d: "M4 10.5 12 4l8 6.5V20h-5v-5.5H9V20H4z" }]],
    receipt: [["path", { d: "M6.5 3.5h11v17l-2.75-1.8-2.75 1.8-2.75-1.8-2.75 1.8z" }], ["path", { d: "M9.5 8.5h5M9.5 12h5" }]],
    calendar: [["rect", { x: 4, y: 5.5, width: 16, height: 14.5, rx: 2 }], ["path", { d: "M4 10h16M8.5 3.5v4M15.5 3.5v4" }]],
    user: [["circle", { cx: 12, cy: 8.5, r: 3.8 }], ["path", { d: "M4.5 20c1.3-3.7 4.1-5.6 7.5-5.6s6.2 1.9 7.5 5.6" }]],
    more: DOTS,
    plus: [["path", { d: "M12 5v14M5 12h14" }]],
    check: [["path", { d: "M5 12.5l4.5 4.5L19 7.5" }]],
    "chevron-right": [["path", { d: "M9 5l7 7-7 7" }]],
    search: [["circle", { cx: 11, cy: 11, r: 6.5 }], ["path", { d: "M16 16l4.5 4.5" }]],
    wallet: [["rect", { x: 3.5, y: 6, width: 17, height: 13, rx: 2 }], ["path", { d: "M3.5 9.5h17M15.5 14h2" }]],
    alert: [["circle", { cx: 12, cy: 12, r: 8.5 }], ["path", { d: "M12 7.5v5.5M12 16.2v.3" }]]
  };
  function Icon(props) {
    var size = props.size || 24;
    var parts = ICONS[props.name] || [];
    var labelled = !!props.title;
    return h("svg", {
      className: cx("lo-icon", props.className),
      width: size, height: size, viewBox: "0 0 24 24",
      fill: "none", stroke: "currentColor", strokeWidth: props.strokeWidth || 1.7,
      strokeLinecap: "round", strokeLinejoin: "round",
      role: labelled ? "img" : undefined,
      "aria-label": labelled ? props.title : undefined,
      "aria-hidden": labelled ? undefined : "true",
      focusable: "false"
    }, parts.map(function (p, i) {
      var attrs = Object.assign({ key: i, fill: "none" }, p[1]);
      return h(p[0], attrs);
    }));
  }

  // ---------- AppBar ----------
  function AppBar(props) {
    return h("header", { className: cx("lo-appbar", props.className) },
      h("span", { className: "lo-appbar-brand wordmark" }, props.name || "LINDY OS"),
      props.branch ? h("span", { className: "lo-appbar-branch caption" }, props.branch) : null,
      props.right ? h("span", { className: "lo-appbar-right" }, props.right) : null);
  }

  // ---------- BottomNav ----------
  var NAV_DEFAULT = [
    { key: "overview", label: "Tổng quan", icon: "home" },
    { key: "orders", label: "Đơn hàng", icon: "receipt" },
    { key: "schedule", label: "Lịch", icon: "calendar" },
    { key: "customers", label: "Khách", icon: "user" },
    { key: "more", label: "Thêm", icon: "more" }
  ];
  function BottomNav(props) {
    var items = props.items || NAV_DEFAULT;
    return h("nav", { className: cx("lo-nav", props.className), "aria-label": props.ariaLabel || "Điều hướng chính" },
      items.map(function (it) {
        var on = it.key === props.active;
        return h("button", {
          key: it.key, type: "button",
          className: cx("lo-nav-item", on && "is-active"),
          "aria-current": on ? "page" : undefined,
          onClick: function () { if (props.onChange) props.onChange(it.key); }
        },
          h(Icon, { name: it.icon, size: 24 }),
          h("span", { className: "lo-nav-label nav-label" }, it.label),
          it.badge ? h("span", { className: "lo-nav-badge caption", "aria-label": it.badge + " mục cần xử lý" }, String(it.badge)) : null);
      }));
  }

  // ---------- Fab ----------
  function Fab(props) {
    var rest = omit(props, ["label", "className", "icon", "placement"]);
    var fixed = props.placement !== "inline";
    return h("button", Object.assign({
      type: "button",
      className: cx("lo-fab", fixed && "lo-fab-fixed", props.className),
      "aria-label": props.label || "Tạo đơn"
    }, rest), h(Icon, { name: props.icon || "plus", size: 26, strokeWidth: 2 }));
  }

  // ---------- Button ----------
  function Button(props) {
    var variant = props.variant || "secondary";
    var rest = omit(props, ["variant", "block", "loading", "loadingText", "icon", "className", "children"]);
    return h("button", Object.assign({ type: "button" }, rest, {
      className: cx("lo-btn", "button-label", "lo-btn-" + variant, props.block && "lo-btn-block", props.className),
      disabled: props.disabled || props.loading,
      "aria-busy": props.loading ? "true" : undefined
    }),
      props.icon ? h(Icon, { name: props.icon, size: 20 }) : null,
      h("span", null, props.loading ? (props.loadingText || "Đang lưu…") : props.children));
  }

  // ---------- SegmentedControl ----------
  function SegmentedControl(props) {
    var opts = props.options || [];
    return h("div", { className: cx("lo-seg", props.className), role: "tablist", "aria-label": props.ariaLabel },
      opts.map(function (o) {
        var v = typeof o === "string" ? o : o.value;
        var l = typeof o === "string" ? o : o.label;
        var on = v === props.value;
        return h("button", {
          key: v, type: "button", role: "tab",
          "aria-selected": on ? "true" : "false",
          className: cx("lo-seg-item", "label", on && "is-active"),
          onClick: function () { if (props.onChange) props.onChange(v); }
        }, l);
      }));
  }

  // ---------- Money ----------
  var MONEY_STYLE = { xl: "display-money", md: "amount", sm: "label" };
  function Money(props) {
    var size = props.size || "md";
    return h("span", {
      className: cx("lo-money", MONEY_STYLE[size] || "amount", "lo-money-" + size, props.tone && "lo-tone-" + props.tone, props.className)
    }, formatVND(props.value, { sign: props.sign }));
  }

  // ---------- SummaryCard ----------
  function SummaryCard(props) {
    var rows = props.rows || [];
    return h("section", { className: cx("lo-card", "lo-summary", props.className), "aria-label": props.label },
      h("div", { className: "lo-overline overline" }, props.label),
      h(Money, { value: props.value, size: "xl" }),
      rows.length ? h("dl", { className: "lo-summary-rows" }, rows.map(function (r, i) {
        return h("div", { key: i, className: "lo-summary-row" },
          h("dt", { className: "body" }, r.label),
          h("dd", null, h(Money, { value: r.value, size: "md", tone: r.tone })));
      })) : null,
      props.footnote ? h("p", { className: "lo-summary-foot caption" }, props.footnote) : null);
  }

  // ---------- StatusChip ----------
  var STATUS = {
    paid: { label: "Đã thu đủ", tone: "success" },
    partial: { label: "Thu một phần", tone: "warning" },
    unpaid: { label: "Chưa thu", tone: "danger" },
    refund_partial: { label: "Hoàn một phần", tone: "neutral" },
    refund_full: { label: "Hoàn toàn bộ", tone: "neutral" },
    draft: { label: "Nháp", tone: "neutral" },
    in_progress: { label: "Đang làm", tone: "neutral" },
    awaiting: { label: "Chờ xác nhận", tone: "accent" },
    confirmed: { label: "Đã xác nhận", tone: "neutral" },
    cancelled: { label: "Đã huỷ", tone: "neutral" }
  };
  function StatusChip(props) {
    var s = STATUS[props.status] || { label: props.status || "", tone: "neutral" };
    return h("span", { className: cx("lo-chip", "caption", "lo-chip-" + (props.tone || s.tone), props.className) }, props.children || s.label);
  }

  // ---------- OrderRow ----------
  function OrderRow(props) {
    var action = typeof props.onClick === "function";
    var meta = [props.time, props.staff].filter(Boolean).join(" · ");
    return h(action ? "button" : "div", {
      type: action ? "button" : undefined,
      className: cx("lo-row", action && "lo-row-action", props.className),
      onClick: props.onClick
    },
      h("span", { className: "lo-row-main" },
        h("span", { className: "lo-row-title body-strong" }, props.code,
          props.customer ? h("span", { className: "lo-row-cust body" }, " · " + props.customer) : null),
        meta ? h("span", { className: "lo-row-meta caption" }, meta) : null),
      h("span", { className: "lo-row-side" },
        h(Money, { value: props.amount, size: "md" }),
        props.status ? h(StatusChip, { status: props.status }) : null));
  }

  // ---------- Toast ----------
  function Toast(props) {
    var tone = props.tone || "success";
    return h("div", { className: cx("lo-toast", "body", "lo-toast-" + tone, props.className), role: tone === "error" ? "alert" : "status" },
      h(Icon, { name: tone === "error" ? "alert" : "check", size: 20 }),
      h("span", null, props.children));
  }

  // ---------- TextField ----------
  var fieldSeq = 0;
  function TextField(props) {
    var idRef = React.useRef(null);
    if (!idRef.current) idRef.current = props.id || ("lo-field-" + (++fieldSeq));
    var id = idRef.current;
    var money = !!props.money;
    var msgId = id + "-msg";
    var rest = omit(props, ["label", "hint", "error", "money", "className", "id", "value", "onChange", "onValueChange"]);
    var shown = money
      ? (props.value === "" || props.value == null ? "" : groupDigits(Math.max(0, Math.round(Number(props.value) || 0))))
      : props.value;
    return h("div", { className: cx("lo-field", money && "lo-field-money", props.error && "has-error", props.className) },
      h("label", { className: "lo-field-label label", htmlFor: id }, props.label),
      h("div", { className: "lo-field-box" },
        h("input", Object.assign({
          id: id,
          className: "lo-input input-text",
          inputMode: money ? "numeric" : props.inputMode,
          value: shown == null ? "" : shown,
          "aria-invalid": props.error ? "true" : undefined,
          "aria-describedby": (props.error || props.hint) ? msgId : undefined,
          onChange: function (e) {
            if (money && props.onValueChange) props.onValueChange(parseVND(e.target.value));
            if (props.onChange) props.onChange(e);
          }
        }, rest)),
        money ? h("span", { className: "lo-field-suffix body", "aria-hidden": "true" }, "đ") : null),
      (props.error || props.hint)
        ? h("p", { id: msgId, className: cx("lo-field-msg", "caption", props.error && "is-error") }, props.error || props.hint)
        : null);
  }

  var api = {
    AppBar: AppBar, BottomNav: BottomNav, Fab: Fab, Button: Button, SegmentedControl: SegmentedControl,
    Money: Money, SummaryCard: SummaryCard, OrderRow: OrderRow, StatusChip: StatusChip, Toast: Toast,
    TextField: TextField, Icon: Icon, formatVND: formatVND, parseVND: parseVND
  };
  window.LindyOS = Object.assign(window.LindyOS || {}, api);
})();
