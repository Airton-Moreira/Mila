/* =========================================================
   MILA · app.js
   Inicialización general y enrutamiento entre vistas (hash routing).
   ========================================================= */

(function () {

  const ROUTES = {
    dashboard: Dashboard,
    pedidos: Pedidos,
    clientes: Clientes,
    recetas: Recetas,
    inventario: Inventario,
    reportes: Reportes
  };

  const DEFAULT_VIEW = "dashboard";

  function getViewFromHash() {
    const hash = (location.hash || "").replace("#", "");
    return ROUTES[hash] ? hash : DEFAULT_VIEW;
  }

  function setActiveNav(view) {
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.toggle("active", link.dataset.view === view);
    });
  }

  function navigate() {
    const view = getViewFromHash();
    setActiveNav(view);
    const content = document.getElementById("content");
    content.innerHTML = "";
    ROUTES[view].render(content);
    closeMobileSidebar();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function closeMobileSidebar() {
    document.getElementById("sidebar").classList.remove("open");
  }

  function initMobileMenu() {
    const toggle = document.getElementById("menuToggle");
    const sidebar = document.getElementById("sidebar");
    toggle.addEventListener("click", () => sidebar.classList.toggle("open"));
    document.addEventListener("click", (e) => {
      if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && e.target !== toggle) {
        sidebar.classList.remove("open");
      }
    });
  }

  function initFechaSidebar() {
    const el = document.getElementById("fecha-hoy-side");
    if (el) el.textContent = MilaUtils.formatDate(MilaUtils.todayYmd());
  }

  function init() {
    MilaDB.seedIfEmpty();
    MilaUtils.bindModalChrome();
    initMobileMenu();
    initFechaSidebar();

    window.addEventListener("hashchange", navigate);
    if (!location.hash) location.hash = "#" + DEFAULT_VIEW;
    navigate();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
