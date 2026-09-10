/* =========================================================
   MILA · pedidos.js
   Núcleo del sistema: pedidos anticipados, sus estados y el
   descuento automático de materias primas al entregar.
   ========================================================= */

const Pedidos = (function () {

  const ESTADOS = ["Pendiente", "Confirmado", "En preparación", "Listo", "Entregado", "Cancelado"];

  let filtroEstado = "";
  let searchTerm = "";
  let vista = "lista"; // "lista" | "proximas"

  function render(container) {
    const pedidos = MilaDB.Pedidos.all().slice().sort((a, b) => new Date(a.fechaEntrega) - new Date(b.fechaEntrega));

    let filtrados = pedidos;
    if (filtroEstado) filtrados = filtrados.filter(p => p.estado === filtroEstado);
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      filtrados = filtrados.filter(p => {
        const blob = `${MilaDB.nombreCliente(p.clienteId)} ${MilaDB.nombreReceta(p.recetaId)}`.toLowerCase();
        return blob.includes(t);
      });
    }

    container.innerHTML = `
      <div class="view-header">
        <div>
          <span class="eyebrow">Encargos</span>
          <h1>Pedidos anticipados</h1>
          <p class="subtitle">${pedidos.length} pedido${pedidos.length === 1 ? "" : "s"} registrados en total</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="btnNuevoPedido">+ Nuevo pedido</button>
        </div>
      </div>

      <div class="tabs">
        <button class="tab-btn ${vista === "lista" ? "active" : ""}" data-tab="lista">Todos los pedidos</button>
        <button class="tab-btn ${vista === "proximas" ? "active" : ""}" data-tab="proximas">Próximas entregas</button>
      </div>

      ${vista === "lista" ? renderLista(filtrados) : renderProximas(pedidos)}
    `;

    document.getElementById("btnNuevoPedido").addEventListener("click", () => abrirFormulario());
    container.querySelectorAll(".tab-btn").forEach(b => b.addEventListener("click", () => { vista = b.dataset.tab; render(container); }));

    if (vista === "lista") {
      const buscador = document.getElementById("buscadorPedidos");
      buscador.addEventListener("input", (e) => { searchTerm = e.target.value; render(container); refocus("buscadorPedidos"); });
      document.getElementById("filtroEstadoPedidos").addEventListener("change", (e) => { filtroEstado = e.target.value; render(container); });

      container.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => verDetalle(b.dataset.view)));
      container.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => abrirFormulario(b.dataset.edit)));
      container.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => eliminar(b.dataset.del, container)));
      container.querySelectorAll("[data-estado-select]").forEach(sel => sel.addEventListener("change", (e) => cambiarEstado(e.target.dataset.estadoSelect, e.target.value, container, e.target)));
    } else {
      container.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => verDetalle(b.dataset.view)));
    }
  }

  function refocus(id) {
    const el = document.getElementById(id);
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  }

  function renderLista(pedidos) {
    return `
      <div class="search-bar">
        <input type="search" id="buscadorPedidos" placeholder="Buscar por cliente o producto…" value="${MilaUtils.escapeHtml(searchTerm)}">
        <select id="filtroEstadoPedidos">
          <option value="">Todos los estados</option>
          ${ESTADOS.map(e => `<option value="${e}" ${filtroEstado === e ? "selected" : ""}>${e}</option>`).join("")}
        </select>
      </div>
      <div class="table-wrap">
        ${pedidos.length === 0 ? `<div class="empty-state"><div class="emoji">🗒️</div><strong>No hay pedidos que coincidan</strong><p>Ajustá los filtros o creá un nuevo pedido.</p></div>` : `
        <table>
          <thead>
            <tr><th>Cliente</th><th>Producto</th><th>Entrega</th><th>Estado</th><th class="text-right">Total</th><th></th></tr>
          </thead>
          <tbody>
            ${pedidos.map(p => filaPedido(p)).join("")}
          </tbody>
        </table>`}
      </div>
    `;
  }

  function filaPedido(p) {
    const dias = MilaUtils.daysUntil(p.fechaEntrega);
    let urgencia = "";
    if (p.estado !== "Entregado" && p.estado !== "Cancelado") {
      if (dias < 0) urgencia = `<span class="badge badge-bajo">Atrasado</span>`;
      else if (dias === 0) urgencia = `<span class="badge badge-confirmado">Hoy</span>`;
      else if (dias <= 2) urgencia = `<span class="badge badge-preparacion">En ${dias}d</span>`;
    }
    return `
      <tr>
        <td><strong style="cursor:pointer" data-view="${p.id}">${MilaUtils.escapeHtml(MilaDB.nombreCliente(p.clienteId))}</strong></td>
        <td>${MilaUtils.escapeHtml(MilaDB.nombreReceta(p.recetaId))} <span class="text-muted">× ${p.cantidad}</span></td>
        <td>${MilaUtils.formatDate(p.fechaEntrega)} ${p.horaEntrega ? `· ${p.horaEntrega}` : ""} ${urgencia}</td>
        <td>${selectorEstado(p)}</td>
        <td class="text-right num">${MilaUtils.money(p.total)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" data-view="${p.id}">Ver</button>
            ${p.estado !== "Entregado" ? `<button class="btn btn-outline btn-sm" data-edit="${p.id}">Editar</button>` : ""}
            <button class="btn btn-danger btn-sm" data-del="${p.id}">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  }

  function selectorEstado(p) {
    return `
      <select data-estado-select="${p.id}" class="badge-select">
        ${ESTADOS.map(e => `<option value="${e}" ${p.estado === e ? "selected" : ""}>${e}</option>`).join("")}
      </select>
    `;
  }

  function renderProximas(pedidos) {
    const activos = pedidos.filter(p => p.estado !== "Entregado" && p.estado !== "Cancelado");
    const porFecha = {};
    activos.forEach(p => {
      const key = p.fechaEntrega || "Sin fecha";
      (porFecha[key] = porFecha[key] || []).push(p);
    });
    const fechas = Object.keys(porFecha).sort();

    if (fechas.length === 0) {
      return `<div class="empty-state"><div class="emoji">📅</div><strong>No hay entregas pendientes</strong><p>Todos los pedidos activos están al día.</p></div>`;
    }

    return fechas.map(f => {
      const dias = MilaUtils.daysUntil(f);
      const etiqueta = dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : dias < 0 ? `Atrasado (${MilaUtils.formatDate(f)})` : MilaUtils.formatDate(f);
      return `
        <div class="section-title" style="margin-top:18px">
          <h2 style="font-size:15px">${etiqueta} ${dias < 0 ? "⚠" : ""}</h2>
          <span class="text-muted" style="font-size:12px">${porFecha[f].length} pedido${porFecha[f].length === 1 ? "" : "s"}</span>
        </div>
        <div class="table-wrap" style="margin-bottom:6px">
          <table>
            <tbody>
              ${porFecha[f].map(p => `
                <tr>
                  <td style="width:26%"><strong style="cursor:pointer" data-view="${p.id}">${MilaUtils.escapeHtml(MilaDB.nombreCliente(p.clienteId))}</strong></td>
                  <td>${MilaUtils.escapeHtml(MilaDB.nombreReceta(p.recetaId))} × ${p.cantidad}</td>
                  <td class="text-muted num">${p.horaEntrega || "—"}</td>
                  <td><span class="badge ${MilaUtils.estadoBadgeClass(p.estado)}">${p.estado}</span></td>
                  <td class="text-right num">${MilaUtils.money(p.total)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }).join("");
  }

  /* ---------- alta / edición ---------- */

  function abrirFormulario(id) {
    const editando = !!id;
    const pedido = editando ? MilaDB.Pedidos.get(id) : null;
    const clientes = MilaDB.Clientes.all().slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
    const recetas = MilaDB.Recetas.all().slice().sort((a, b) => a.nombre.localeCompare(b.nombre));

    if (clientes.length === 0) {
      MilaUtils.toast("Primero registrá al menos un cliente.", "warn");
      return;
    }
    if (recetas.length === 0) {
      MilaUtils.toast("Primero cargá al menos una receta.", "warn");
      return;
    }

    const recetaSel = recetas.find(r => r.id === pedido?.recetaId) || recetas[0];
    const calc = MilaDB.calcularCostoReceta(recetaSel);

    const body = `
      <form id="formPedido" novalidate>
        <div class="form-grid">
          <div class="form-field" data-field="clienteId">
            <label>Cliente *</label>
            <select name="clienteId">
              ${clientes.map(c => `<option value="${c.id}" ${pedido?.clienteId === c.id ? "selected" : ""}>${MilaUtils.escapeHtml(c.nombre)} ${MilaUtils.escapeHtml(c.apellido || "")}</option>`).join("")}
            </select>
          </div>
          <div class="form-field" data-field="recetaId">
            <label>Producto *</label>
            <select name="recetaId" id="selectReceta">
              ${recetas.map(r => `<option value="${r.id}" ${pedido?.recetaId === r.id ? "selected" : ""}>${MilaUtils.escapeHtml(r.nombre)}</option>`).join("")}
            </select>
          </div>
          <div class="form-field" data-field="cantidad">
            <label>Cantidad (en ${MilaUtils.escapeHtml(recetaSel.unidadRendimiento || "unidades")}) *</label>
            <input type="number" min="1" step="1" name="cantidad" id="inputCantidad" value="${pedido?.cantidad ?? 1}">
            <span class="field-error">Ingresá una cantidad mayor a 0.</span>
          </div>
          <div class="form-field" data-field="precioUnitario">
            <label>Precio unitario *</label>
            <input type="number" min="0" step="0.01" name="precioUnitario" id="inputPrecio" value="${pedido?.precioUnitario ?? recetaSel.precioVenta}">
            <span class="field-error">Ingresá un precio válido.</span>
          </div>
          <div class="form-field" data-field="fechaPedido">
            <label>Fecha del pedido *</label>
            <input type="date" name="fechaPedido" value="${pedido?.fechaPedido || MilaUtils.todayYmd()}">
            <span class="field-error">Fecha requerida.</span>
          </div>
          <div class="form-field" data-field="fechaEntrega">
            <label>Fecha de entrega *</label>
            <input type="date" name="fechaEntrega" value="${pedido?.fechaEntrega || ""}">
            <span class="field-error">La fecha de entrega debe ser válida y no anterior al pedido.</span>
          </div>
          <div class="form-field" data-field="horaEntrega">
            <label>Hora de entrega</label>
            <input type="time" name="horaEntrega" value="${pedido?.horaEntrega || ""}">
          </div>
          <div class="form-field" data-field="estado">
            <label>Estado *</label>
            <select name="estado">
              ${ESTADOS.filter(e => e !== "Entregado").map(e => `<option value="${e}" ${pedido?.estado === e ? "selected" : ""}>${e}</option>`).join("")}
              ${editando && pedido.estado === "Entregado" ? `<option value="Entregado" selected>Entregado</option>` : ""}
            </select>
            ${editando && pedido.estado === "Entregado" ? `<span class="hint">Para revertir un pedido entregado, cambiá el estado desde la lista principal.</span>` : ""}
          </div>
          <div class="form-field full" data-field="observaciones">
            <label>Observaciones</label>
            <textarea name="observaciones">${MilaUtils.escapeHtml(pedido?.observaciones || "")}</textarea>
          </div>
        </div>

        <div class="divider-scallop" style="margin-top:18px"></div>
        <div class="detail-list" id="previewPedido"></div>

        <div class="form-actions">
          <button type="button" class="btn btn-outline" id="btnCancelarPedido">Cancelar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Guardar cambios" : "Crear pedido"}</button>
        </div>
      </form>
    `;

    MilaUtils.openModal(editando ? "Editar pedido" : "Nuevo pedido", body, {
      wide: true,
      onMount: () => {
        document.getElementById("btnCancelarPedido").addEventListener("click", MilaUtils.closeModal);
        const form = document.getElementById("formPedido");

        document.getElementById("selectReceta").addEventListener("change", (e) => {
          const r = MilaDB.Recetas.get(e.target.value);
          if (r) {
            document.getElementById("inputPrecio").value = r.precioVenta;
            form.querySelector('[data-field="cantidad"] label').textContent = `Cantidad (en ${r.unidadRendimiento || "unidades"}) *`;
          }
          actualizarPreviewPedido();
        });

        form.addEventListener("input", actualizarPreviewPedido);
        form.addEventListener("submit", (e) => { e.preventDefault(); guardar(e.target, id); });
        actualizarPreviewPedido();
      }
    });
  }

  function actualizarPreviewPedido() {
    const form = document.getElementById("formPedido");
    if (!form) return;
    const recetaId = form.querySelector('[name="recetaId"]').value;
    const cantidad = Number(form.querySelector('[name="cantidad"]').value) || 0;
    const precioUnitario = Number(form.querySelector('[name="precioUnitario"]').value) || 0;
    const receta = MilaDB.Recetas.get(recetaId);
    if (!receta) return;

    const calc = MilaDB.calcularCostoReceta(receta);
    const total = precioUnitario * cantidad;
    const costoProduccion = calc.costoPorUnidad * cantidad;
    const utilidad = total - costoProduccion;
    const stockCheck = MilaDB.verificarStockParaPedido(receta, cantidad);

    document.getElementById("previewPedido").innerHTML = `
      <div class="row"><span>Costo de producción estimado</span><strong>${MilaUtils.money(costoProduccion)}</strong></div>
      <div class="row"><span>Total del pedido</span><strong>${MilaUtils.money(total)}</strong></div>
      <div class="row total"><span>Utilidad estimada</span><strong class="amount">${MilaUtils.money(utilidad)}</strong></div>
      ${!stockCheck.ok ? `
        <div class="alert alert-warn" style="margin-top:10px">
          <span>⚠</span>
          <div><strong>Aviso:</strong> con el stock actual no alcanzaría para producir este pedido si se entregara hoy: ${stockCheck.faltantes.map(f => `${MilaUtils.escapeHtml(f.nombre)} (necesita ${MilaUtils.num(f.necesario)}, hay ${MilaUtils.num(f.disponible)})`).join(", ")}. El stock recién se descuenta al marcar el pedido como "Entregado", así que podés reponer antes de esa fecha.</div>
        </div>` : ""}
    `;
  }

  function guardar(form, id) {
    const data = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll(".form-field").forEach(f => f.classList.remove("has-error"));

    let valido = true;
    if (!MilaUtils.isRequired(data.clienteId)) valido = false;
    if (!MilaUtils.isRequired(data.recetaId)) valido = false;
    if (!MilaUtils.isPositiveNumber(data.cantidad) || Number(data.cantidad) <= 0) { marcar(form, "cantidad"); valido = false; }
    if (!MilaUtils.isPositiveNumber(data.precioUnitario)) { marcar(form, "precioUnitario"); valido = false; }
    if (!MilaUtils.isRequired(data.fechaPedido)) { marcar(form, "fechaPedido"); valido = false; }
    if (!MilaUtils.isRequired(data.fechaEntrega)) { marcar(form, "fechaEntrega"); valido = false; }
    if (data.fechaPedido && data.fechaEntrega && data.fechaEntrega < data.fechaPedido) { marcar(form, "fechaEntrega"); valido = false; }
    if (!valido) return;

    const receta = MilaDB.Recetas.get(data.recetaId);
    const calc = MilaDB.calcularCostoReceta(receta);
    const cantidad = Number(data.cantidad);
    const precioUnitario = Number(data.precioUnitario);
    const total = precioUnitario * cantidad;
    const costoProduccion = calc.costoPorUnidad * cantidad;
    const utilidad = total - costoProduccion;

    const payload = {
      clienteId: data.clienteId,
      recetaId: data.recetaId,
      cantidad,
      fechaPedido: data.fechaPedido,
      fechaEntrega: data.fechaEntrega,
      horaEntrega: data.horaEntrega || "",
      estado: data.estado,
      precioUnitario,
      total,
      costoProduccion,
      utilidad,
      observaciones: (data.observaciones || "").trim()
    };

    if (id) {
      const existente = MilaDB.Pedidos.get(id);
      // No se permite reeditar cantidad/receta de un pedido ya entregado sin pasar por el flujo de reversión.
      if (existente.estado === "Entregado") {
        payload.estado = "Entregado";
        payload.cantidad = existente.cantidad;
        payload.recetaId = existente.recetaId;
        payload.stockDescontado = existente.stockDescontado;
        payload.fechaEntregado = existente.fechaEntregado;
      }
      MilaDB.Pedidos.update(id, payload);
      MilaUtils.toast("Pedido actualizado", "success");
    } else {
      MilaDB.Pedidos.create(Object.assign({ id: MilaDB.generateId("ped"), stockDescontado: false, fechaEntregado: null }, payload));
      MilaUtils.toast("Pedido creado", "success");
    }

    MilaUtils.closeModal();
    render(document.getElementById("content"));
  }

  function marcar(form, campo) {
    const f = form.querySelector(`[data-field="${campo}"]`);
    if (f) f.classList.add("has-error");
  }

  /* ---------- cambio de estado + descuento automático de stock ---------- */

  function cambiarEstado(pedidoId, nuevoEstado, container, selectEl) {
    const pedido = MilaDB.Pedidos.get(pedidoId);
    if (!pedido) return;
    const estadoAnterior = pedido.estado;

    if (nuevoEstado === estadoAnterior) return;

    if (nuevoEstado === "Entregado") {
      confirmarEntrega(pedido, container);
      return; // el cambio de estado se aplica dentro del flujo de confirmación
    }

    if (estadoAnterior === "Entregado" && nuevoEstado !== "Entregado") {
      // Revertir un pedido ya entregado es una operación sensible: requiere confirmación explícita
      // porque el stock ya fue descontado y no se restituye automáticamente.
      const seguro = MilaUtils.confirmAction(
        `Este pedido ya fue marcado como "Entregado" y sus ingredientes fueron descontados del inventario.\n\nCambiar el estado a "${nuevoEstado}" NO devuelve el stock automáticamente. Si fue un error, reponé manualmente las materias primas desde Inventario si corresponde.\n\n¿Confirmás el cambio de estado?`
      );
      if (!seguro) {
        selectEl.value = estadoAnterior;
        return;
      }
    }

    MilaDB.Pedidos.update(pedidoId, { estado: nuevoEstado });
    MilaUtils.toast(`Pedido marcado como "${nuevoEstado}"`, "success");
    render(container);
  }

  function confirmarEntrega(pedido, container) {
    if (pedido.stockDescontado) {
      // Salvaguarda contra doble descuento si el evento se disparara más de una vez.
      MilaDB.Pedidos.update(pedido.id, { estado: "Entregado" });
      render(container);
      return;
    }

    const receta = MilaDB.Recetas.get(pedido.recetaId);
    if (!receta) {
      MilaUtils.toast("No se encontró la receta asociada a este pedido.", "error");
      render(container);
      return;
    }

    const check = MilaDB.verificarStockParaPedido(receta, pedido.cantidad);

    if (!check.ok) {
      const detalle = check.faltantes.map(f => `• ${f.nombre}: necesita ${MilaUtils.num(f.necesario)}, disponible ${MilaUtils.num(f.disponible)} ${f.unidad}`).join("\n");
      const body = `
        <div class="alert alert-danger">
          <span>⚠</span>
          <div>
            <strong>Stock insuficiente para completar este pedido.</strong>
            <p style="white-space:pre-line;margin-top:8px">${MilaUtils.escapeHtml(detalle)}</p>
          </div>
        </div>
        <p class="text-muted" style="font-size:13px">Podés reponer el inventario y volver a intentarlo, o forzar la entrega igualmente (el stock de esos insumos quedará en 0 o negativo evitado, es decir, en 0).</p>
        <div class="form-actions">
          <button type="button" class="btn btn-outline" id="btnCancelarEntrega">Cancelar</button>
          <button type="button" class="btn btn-danger" id="btnForzarEntrega">Entregar de todas formas</button>
        </div>
      `;
      MilaUtils.openModal("Stock insuficiente", body, {
        onMount: () => {
          document.getElementById("btnCancelarEntrega").addEventListener("click", () => { MilaUtils.closeModal(); render(container); });
          document.getElementById("btnForzarEntrega").addEventListener("click", () => {
            procesarEntrega(pedido, receta);
            MilaUtils.closeModal();
            render(container);
          });
        },
        onClose: () => render(container)
      });
      return;
    }

    procesarEntrega(pedido, receta);
    render(container);
  }

  function procesarEntrega(pedido, receta) {
    if (pedido.stockDescontado) return; // salvaguarda anti doble-descuento
    MilaDB.descontarStockPorPedido(receta, pedido.cantidad, pedido.id);
    MilaDB.Pedidos.update(pedido.id, {
      estado: "Entregado",
      stockDescontado: true,
      fechaEntregado: new Date().toISOString()
    });
    MilaUtils.toast(`Pedido entregado: se descontaron los ingredientes de "${receta.nombre}" del inventario.`, "success");
  }

  /* ---------- detalle / eliminar ---------- */

  function verDetalle(id) {
    const p = MilaDB.Pedidos.get(id);
    if (!p) return;
    const receta = MilaDB.Recetas.get(p.recetaId);

    const body = `
      <div class="detail-list">
        <div class="row"><span>Cliente</span><strong>${MilaUtils.escapeHtml(MilaDB.nombreCliente(p.clienteId))}</strong></div>
        <div class="row"><span>Producto</span><strong>${MilaUtils.escapeHtml(MilaDB.nombreReceta(p.recetaId))} × ${p.cantidad}</strong></div>
        <div class="row"><span>Fecha del pedido</span><strong>${MilaUtils.formatDate(p.fechaPedido)}</strong></div>
        <div class="row"><span>Fecha de entrega</span><strong>${MilaUtils.formatDate(p.fechaEntrega)} ${p.horaEntrega ? "· " + p.horaEntrega : ""}</strong></div>
        <div class="row"><span>Estado</span><strong><span class="badge ${MilaUtils.estadoBadgeClass(p.estado)}">${p.estado}</span></strong></div>
        <div class="row"><span>Precio unitario</span><strong>${MilaUtils.money(p.precioUnitario)}</strong></div>
        <div class="row"><span>Costo de producción</span><strong>${MilaUtils.money(p.costoProduccion)}</strong></div>
        <div class="row total"><span>Total del pedido</span><strong class="amount">${MilaUtils.money(p.total)}</strong></div>
        <div class="row"><span>Utilidad</span><strong>${MilaUtils.money(p.utilidad)}</strong></div>
        ${p.observaciones ? `<div class="row"><span>Observaciones</span><strong>${MilaUtils.escapeHtml(p.observaciones)}</strong></div>` : ""}
        ${p.stockDescontado ? `<div class="row"><span>Stock descontado</span><strong>Sí, el ${MilaUtils.formatDate(p.fechaEntregado)}</strong></div>` : ""}
      </div>
      ${!receta ? `<div class="alert alert-danger" style="margin-top:14px">La receta asociada a este pedido fue eliminada.</div>` : ""}
    `;
    MilaUtils.openModal(`Pedido de ${MilaDB.nombreCliente(p.clienteId)}`, body);
  }

  function eliminar(id, container) {
    const p = MilaDB.Pedidos.get(id);
    if (!p) return;
    let msg = "¿Eliminar este pedido? Esta acción no se puede deshacer.";
    if (p.stockDescontado) {
      msg = "Este pedido ya descontó materias primas del inventario. Eliminarlo NO devuelve el stock automáticamente. ¿Eliminar de todas formas?";
    }
    if (!MilaUtils.confirmAction(msg)) return;
    MilaDB.Pedidos.remove(id);
    MilaUtils.toast("Pedido eliminado", "success");
    render(container);
  }

  return { render, ESTADOS };
})();
