/* =========================================================
   MILA · utils.js
   Helpers compartidos por todos los módulos: formato de datos,
   sistema de modal, toasts y validaciones comunes.
   ========================================================= */

const MilaUtils = (function () {

  /* ---------- formato ---------- */

  const currencyFmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  const numberFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

  function money(n) {
    if (isNaN(n)) return currencyFmt.format(0);
    return currencyFmt.format(n);
  }

  function num(n, decimals) {
    if (isNaN(n)) n = 0;
    return Number(n).toLocaleString("es-AR", { maximumFractionDigits: decimals != null ? decimals : 2 });
  }

  function pct(n) {
    if (isNaN(n)) n = 0;
    return `${num(n, 1)}%`;
  }

  function formatDate(isoOrYmd) {
    if (!isoOrYmd) return "—";
    const d = new Date(isoOrYmd.length <= 10 ? isoOrYmd + "T00:00:00" : isoOrYmd);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatDateShort(isoOrYmd) {
    if (!isoOrYmd) return "—";
    const d = new Date(isoOrYmd.length <= 10 ? isoOrYmd + "T00:00:00" : isoOrYmd);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) + " · " +
      d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }

  function todayYmd() {
    return new Date().toISOString().slice(0, 10);
  }

  function daysUntil(ymd) {
    if (!ymd) return null;
    const target = new Date(ymd + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function initials(nombre, apellido) {
    const a = (nombre || "").trim()[0] || "";
    const b = (apellido || "").trim()[0] || "";
    return (a + b).toUpperCase() || "?";
  }

  /* ---------- modal genérico ---------- */

  let onCloseCallback = null;

  function openModal(title, bodyHtml, opts) {
    opts = opts || {};
    const overlay = document.getElementById("modalOverlay");
    const box = document.getElementById("modalBox");
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalBody").innerHTML = bodyHtml;
    box.classList.toggle("wide", !!opts.wide);
    overlay.classList.add("open");
    onCloseCallback = opts.onClose || null;
    if (typeof opts.onMount === "function") {
      setTimeout(opts.onMount, 0);
    }
  }

  function closeModal() {
    const overlay = document.getElementById("modalOverlay");
    overlay.classList.remove("open");
    document.getElementById("modalBody").innerHTML = "";
    if (typeof onCloseCallback === "function") onCloseCallback();
    onCloseCallback = null;
  }

  function bindModalChrome() {
    document.getElementById("modalClose").addEventListener("click", closeModal);
    document.getElementById("modalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "modalOverlay") closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  /* ---------- toasts ---------- */

  function toast(message, type) {
    const stack = document.getElementById("toastStack");
    const el = document.createElement("div");
    el.className = "toast" + (type ? ` toast-${type}` : "");
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .25s ease";
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  /* ---------- confirmación ---------- */

  function confirmAction(message) {
    return window.confirm(message);
  }

  /* ---------- validaciones comunes ---------- */

  function isPositiveNumber(v) {
    return v !== "" && v !== null && !isNaN(v) && Number(v) >= 0;
  }

  function isRequired(v) {
    return v !== undefined && v !== null && String(v).trim() !== "";
  }

  /* ---------- badge de estado de pedido ---------- */

  function estadoBadgeClass(estado) {
    const map = {
      "Pendiente": "badge-pendiente",
      "Confirmado": "badge-confirmado",
      "En preparación": "badge-preparacion",
      "Listo": "badge-listo",
      "Entregado": "badge-entregado",
      "Cancelado": "badge-cancelado"
    };
    return map[estado] || "badge-neutral";
  }

  return {
    money, num, pct, formatDate, formatDateShort, formatDateTime, todayYmd, daysUntil,
    escapeHtml, initials,
    openModal, closeModal, bindModalChrome,
    toast, confirmAction,
    isPositiveNumber, isRequired,
    estadoBadgeClass
  };
})();
