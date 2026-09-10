/* =========================================================
   MILA · reportes.js
   Métricas del negocio calculadas a partir de pedidos reales.
   ========================================================= */

const Reportes = (function () {

  let periodo = "mes"; // "hoy" | "semana" | "mes" | "personalizado"
  let desdeCustom = "";
  let hastaCustom = "";

  function render(container) {
    const rango = calcularRango();
    const pedidos = MilaDB.Pedidos.all().filter(p => dentroDeRango(p, rango));
    const entregados = pedidos.filter(p => p.estado === "Entregado");
    const pendientesActivos = MilaDB.Pedidos.all().filter(p => p.estado !== "Entregado" && p.estado !== "Cancelado");

    const ventasTotales = entregados.reduce((s, p) => s + Number(p.total), 0);
    const costosTotales = entregados.reduce((s, p) => s + Number(p.costoProduccion), 0);
    const utilidadTotal = entregados.reduce((s, p) => s + Number(p.utilidad), 0);
    const margenPromedio = ventasTotales > 0 ? (utilidadTotal / ventasTotales) * 100 : 0;
    const unidadesVendidas = entregados.reduce((s, p) => s + Number(p.cantidad), 0);

    const porProducto = {};
    entregados.forEach(p => {
      const nombre = MilaDB.nombreReceta(p.recetaId);
      porProducto[nombre] = (porProducto[nombre] || 0) + Number(p.cantidad);
    });
    const rankingProductos = Object.entries(porProducto).sort((a, b) => b[1] - a[1]);

    container.innerHTML = `
      <div class="view-header">
        <div>
          <span class="eyebrow">Métricas</span>
          <h1>Reportes</h1>
          <p class="subtitle">Basado en pedidos entregados en el período seleccionado</p>
        </div>
      </div>

      <div class="tabs">
        <button class="tab-btn ${periodo === "hoy" ? "active" : ""}" data-periodo="hoy">Hoy</button>
        <button class="tab-btn ${periodo === "semana" ? "active" : ""}" data-periodo="semana">Esta semana</button>
        <button class="tab-btn ${periodo === "mes" ? "active" : ""}" data-periodo="mes">Este mes</button>
        <button class="tab-btn ${periodo === "personalizado" ? "active" : ""}" data-periodo="personalizado">Personalizado</button>
      </div>

      ${periodo === "personalizado" ? `
        <div class="search-bar">
          <div class="form-field"><label>Desde</label><input type="date" id="repDesde" value="${desdeCustom}"></div>
          <div class="form-field"><label>Hasta</label><input type="date" id="repHasta" value="${hastaCustom}"></div>
          <button class="btn btn-primary" id="btnAplicarRango" style="align-self:flex-end">Aplicar</button>
        </div>
      ` : ""}

      <div class="grid grid-metrics">
        <div class="card metric-card accent">
          <span class="metric-label">Ventas del período</span>
          <span class="metric-value">${MilaUtils.money(ventasTotales)}</span>
          <span class="metric-sub">${entregados.length} pedido${entregados.length === 1 ? "" : "s"} entregado${entregados.length === 1 ? "" : "s"}</span>
        </div>
        <div class="card metric-card good">
          <span class="metric-label">Utilidad del período</span>
          <span class="metric-value">${MilaUtils.money(utilidadTotal)}</span>
          <span class="metric-sub">Margen promedio: ${MilaUtils.pct(margenPromedio)}</span>
        </div>
        <div class="card metric-card">
          <span class="metric-label">Costos de producción</span>
          <span class="metric-value">${MilaUtils.money(costosTotales)}</span>
          <span class="metric-sub">${unidadesVendidas} unidades producidas</span>
        </div>
        <div class="card metric-card">
          <span class="metric-label">Pedidos pendientes</span>
          <span class="metric-value">${pendientesActivos.length}</span>
          <span class="metric-sub">Activos en todo el sistema</span>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="section-title"><h2>Producto más vendido</h2></div>
          ${rankingProductos.length === 0 ? `<p class="text-muted">Sin ventas entregadas en este período.</p>` : `
          <div class="detail-list">
            ${rankingProductos.slice(0, 6).map(([nombre, cant], i) => `
              <div class="row">
                <span>${i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : "• "}${MilaUtils.escapeHtml(nombre)}</span>
                <strong>${MilaUtils.num(cant, 0)} unidades</strong>
              </div>`).join("")}
          </div>`}
        </div>

        <div class="card">
          <div class="section-title"><h2>Resumen del período</h2></div>
          <div class="detail-list">
            <div class="row"><span>Pedidos entregados</span><strong>${entregados.length}</strong></div>
            <div class="row"><span>Unidades vendidas</span><strong>${unidadesVendidas}</strong></div>
            <div class="row"><span>Ticket promedio</span><strong>${MilaUtils.money(entregados.length ? ventasTotales / entregados.length : 0)}</strong></div>
            <div class="row"><span>Costo promedio por pedido</span><strong>${MilaUtils.money(entregados.length ? costosTotales / entregados.length : 0)}</strong></div>
            <div class="row total"><span>Margen promedio</span><strong class="amount">${MilaUtils.pct(margenPromedio)}</strong></div>
          </div>
        </div>
      </div>

      <div class="section-title" style="margin-top:22px"><h2>Pedidos entregados en el período</h2></div>
      <div class="table-wrap">
        ${entregados.length === 0 ? `<div class="empty-state"><div class="emoji">📊</div><strong>Sin datos para este período</strong><p>Probá otro rango de fechas.</p></div>` : `
        <table>
          <thead><tr><th>Fecha entrega</th><th>Cliente</th><th>Producto</th><th class="text-right">Total</th><th class="text-right">Costo</th><th class="text-right">Utilidad</th></tr></thead>
          <tbody>
            ${entregados.sort((a, b) => new Date(b.fechaEntrega) - new Date(a.fechaEntrega)).map(p => `
              <tr>
                <td>${MilaUtils.formatDate(p.fechaEntrega)}</td>
                <td>${MilaUtils.escapeHtml(MilaDB.nombreCliente(p.clienteId))}</td>
                <td>${MilaUtils.escapeHtml(MilaDB.nombreReceta(p.recetaId))} × ${p.cantidad}</td>
                <td class="text-right num">${MilaUtils.money(p.total)}</td>
                <td class="text-right num text-muted">${MilaUtils.money(p.costoProduccion)}</td>
                <td class="text-right num">${MilaUtils.money(p.utilidad)}</td>
              </tr>`).join("")}
          </tbody>
        </table>`}
      </div>
    `;

    container.querySelectorAll("[data-periodo]").forEach(b => b.addEventListener("click", () => { periodo = b.dataset.periodo; render(container); }));
    const btnAplicar = document.getElementById("btnAplicarRango");
    if (btnAplicar) btnAplicar.addEventListener("click", () => {
      desdeCustom = document.getElementById("repDesde").value;
      hastaCustom = document.getElementById("repHasta").value;
      render(container);
    });
  }

  function calcularRango() {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (periodo === "hoy") {
      return { desde: ymd(hoy), hasta: ymd(hoy) };
    }
    if (periodo === "semana") {
      const diaSemana = hoy.getDay(); // 0=domingo
      const desde = new Date(hoy); desde.setDate(hoy.getDate() - diaSemana);
      return { desde: ymd(desde), hasta: ymd(hoy) };
    }
    if (periodo === "mes") {
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      return { desde: ymd(desde), hasta: ymd(hoy) };
    }
    // personalizado
    return { desde: desdeCustom || "0000-01-01", hasta: hastaCustom || "9999-12-31" };
  }

  function ymd(d) { return d.toISOString().slice(0, 10); }

  function dentroDeRango(pedido, rango) {
    const fecha = pedido.estado === "Entregado" && pedido.fechaEntregado
      ? pedido.fechaEntregado.slice(0, 10)
      : pedido.fechaEntrega;
    return fecha >= rango.desde && fecha <= rango.hasta;
  }

  return { render };
})();
