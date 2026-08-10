/* =========================================================
   MILA · dashboard.js
   Panel general: resumen del estado del negocio en un vistazo.
   ========================================================= */

const Dashboard = (function () {

  function render(container) {
    const pedidos = MilaDB.Pedidos.all();
    const inventario = MilaDB.Inventario.all();
    const hoy = MilaUtils.todayYmd();

    const hoyDate = new Date(); hoyDate.setHours(0, 0, 0, 0);
    const inicioMes = new Date(hoyDate.getFullYear(), hoyDate.getMonth(), 1).toISOString().slice(0, 10);

    const entregadosMes = pedidos.filter(p => p.estado === "Entregado" && (p.fechaEntregado || "").slice(0, 10) >= inicioMes);
    const ventasMes = entregadosMes.reduce((s, p) => s + Number(p.total), 0);
    const utilidadMes = entregadosMes.reduce((s, p) => s + Number(p.utilidad), 0);
    const costoMes = entregadosMes.reduce((s, p) => s + Number(p.costoProduccion), 0);
    const margenMes = ventasMes > 0 ? (utilidadMes / ventasMes) * 100 : 0;

    const pendientes = pedidos.filter(p => !["Entregado", "Cancelado"].includes(p.estado));
    const proximas7 = pendientes.filter(p => {
      const d = MilaUtils.daysUntil(p.fechaEntrega);
      return d !== null && d >= 0 && d <= 7;
    });
    const entregadosTotal = pedidos.filter(p => p.estado === "Entregado");

    const bajoStock = inventario.filter(i => Number(i.stockActual) <= Number(i.stockMinimo));

    const porProducto = {};
    entregadosTotal.forEach(p => {
      const nombre = MilaDB.nombreReceta(p.recetaId);
      porProducto[nombre] = (porProducto[nombre] || 0) + Number(p.cantidad);
    });
    const topProductos = Object.entries(porProducto).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const proximasEntregas = pendientes
      .slice()
      .sort((a, b) => new Date(a.fechaEntrega) - new Date(b.fechaEntrega))
      .slice(0, 6);

    container.innerHTML = `
      <div class="view-header">
        <div>
          <span class="eyebrow">${MilaUtils.formatDate(hoy)}</span>
          <h1>Hola, ¡buen día en el obrador! 🍰</h1>
          <p class="subtitle">Así está tu negocio este mes</p>
        </div>
      </div>

      ${bajoStock.length > 0 ? `
        <div class="alert alert-warn">
          <span>⚠</span>
          <div><strong>${bajoStock.length} materia${bajoStock.length === 1 ? "" : "s"} prima${bajoStock.length === 1 ? "" : "s"}</strong> con stock bajo: ${bajoStock.map(i => MilaUtils.escapeHtml(i.nombre)).join(", ")}. <a href="#inventario" class="link-btn">Ir a inventario →</a></div>
        </div>` : ""}

      <div class="grid grid-metrics">
        <div class="card metric-card accent">
          <span class="metric-label">Ventas del mes</span>
          <span class="metric-value">${MilaUtils.money(ventasMes)}</span>
          <span class="metric-sub">${entregadosMes.length} pedido${entregadosMes.length === 1 ? "" : "s"} entregado${entregadosMes.length === 1 ? "" : "s"}</span>
        </div>
        <div class="card metric-card good">
          <span class="metric-label">Utilidad del mes</span>
          <span class="metric-value">${MilaUtils.money(utilidadMes)}</span>
          <span class="metric-sub">Margen: ${MilaUtils.pct(margenMes)}</span>
        </div>
        <div class="card metric-card">
          <span class="metric-label">Costo de producción</span>
          <span class="metric-value">${MilaUtils.money(costoMes)}</span>
          <span class="metric-sub">Materias primas consumidas</span>
        </div>
        <div class="card metric-card">
          <span class="metric-label">Pedidos pendientes</span>
          <span class="metric-value">${pendientes.length}</span>
          <span class="metric-sub">${proximas7.length} entregan en 7 días</span>
        </div>
        <div class="card metric-card">
          <span class="metric-label">Pedidos entregados</span>
          <span class="metric-value">${entregadosTotal.length}</span>
          <span class="metric-sub">Histórico total</span>
        </div>
        <div class="card metric-card ${bajoStock.length ? "warn" : ""}">
          <span class="metric-label">Stock bajo</span>
          <span class="metric-value">${bajoStock.length}</span>
          <span class="metric-sub">Insumo${bajoStock.length === 1 ? "" : "s"} por reponer</span>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="section-title">
            <h2>Próximas entregas</h2>
            <a href="#pedidos" class="see-all">Ver todas →</a>
          </div>
          ${proximasEntregas.length === 0 ? `<p class="text-muted">No hay entregas próximas.</p>` : `
          <div class="table-wrap" style="box-shadow:none">
            <table>
              <thead><tr><th>Cliente</th><th>Producto</th><th>Entrega</th><th>Estado</th><th class="text-right">Total</th></tr></thead>
              <tbody>
                ${proximasEntregas.map(p => `
                  <tr>
                    <td>${MilaUtils.escapeHtml(MilaDB.nombreCliente(p.clienteId))}</td>
                    <td>${MilaUtils.escapeHtml(MilaDB.nombreReceta(p.recetaId))} × ${p.cantidad}</td>
                    <td class="text-muted">${MilaUtils.formatDate(p.fechaEntrega)}</td>
                    <td><span class="badge ${MilaUtils.estadoBadgeClass(p.estado)}">${p.estado}</span></td>
                    <td class="text-right num">${MilaUtils.money(p.total)}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>`}
        </div>

        <div class="card">
          <div class="section-title"><h2>Productos más vendidos</h2></div>
          ${topProductos.length === 0 ? `<p class="text-muted">Todavía no hay pedidos entregados.</p>` : `
          <div class="detail-list">
            ${topProductos.map(([nombre, cant], i) => `
              <div class="row">
                <span>${i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : "• "}${MilaUtils.escapeHtml(nombre)}</span>
                <strong>${MilaUtils.num(cant, 0)} un.</strong>
              </div>`).join("")}
          </div>`}

          <div class="section-title" style="margin-top:20px"><h2>Materias primas próximas a agotarse</h2></div>
          ${bajoStock.length === 0 ? `<p class="text-muted">Todo el inventario está en niveles saludables. ✓</p>` : `
          <div class="detail-list">
            ${bajoStock.slice(0, 6).map(i => `
              <div class="row">
                <span>${MilaUtils.escapeHtml(i.nombre)}</span>
                <strong class="text-muted">${MilaUtils.num(i.stockActual)} / ${MilaUtils.num(i.stockMinimo)} ${MilaUtils.escapeHtml(i.unidad)}</strong>
              </div>`).join("")}
          </div>`}
        </div>
      </div>
    `;
  }

  return { render };
})();
