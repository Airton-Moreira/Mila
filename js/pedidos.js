/* =========================================================
   MILA · pedidos.js
   Núcleo del sistema: pedidos anticipados, sus estados y el
   descuento automático de materias primas al entregar.
   ========================================================= */

const Pedidos = (function () {

  const ESTADOS = ["Pendiente", "Confirmado", "En preparación", "Listo", "Entregado", "Cancelado"];

  let filtroEstado = "";
  let searchTerm = "";
  let vista = "lista"; // "lista" | "proximas" | "papelera"

  async function render(container) {
    const [pedidos, pedidosPapelera, clientes, recetas] = await Promise.all([
      MilaDB.Pedidos.all(),
      MilaDB.Pedidos.papelera(),
      MilaDB.Clientes.all(),
      MilaDB.Recetas.all()
    ]);

    const clientesMap = new Map((clientes || []).map(c => [c.id, `${c.nombre} ${c.apellido || ""}`.trim()]));
    const recetasMap = new Map((recetas || []).map(r => [r.id, r.nombre]));

    const nombreCliente = id => clientesMap.get(id) || "Cliente eliminado";
    const nombreReceta = id => recetasMap.get(id) || "Producto eliminado";

    const ordenados = (pedidos || []).slice().sort((a, b) => new Date(a.fechaEntrega) - new Date(b.fechaEntrega));
    const ordenadosPapelera = (pedidosPapelera || []).slice().sort((a, b) => new Date(b.eliminadoEn || 0) - new Date(a.eliminadoEn || 0));

    let filtrados = ordenados;
    if (filtroEstado) filtrados = filtrados.filter(p => p.estado === filtroEstado);
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      filtrados = filtrados.filter(p => {
        const blob = `${nombreCliente(p.clienteId)} ${nombreReceta(p.recetaId)}`.toLowerCase();
        return blob.includes(t);
      });
    }

    const cantPapelera = ordenadosPapelera.length;
    const subtitulo = vista === "papelera"
      ? `${cantPapelera} pedido${cantPapelera === 1 ? "" : "s"} en la papelera`
      : `${ordenados.length} pedido${ordenados.length === 1 ? "" : "s"} registrados en total`;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <span class="eyebrow">Encargos</span>
          <h1>Pedidos anticipados</h1>
          <p class="subtitle">${subtitulo}</p>
        </div>
        <div class="view-actions">
          ${vista === "papelera" && cantPapelera > 0 ? `<button class="btn btn-danger" id="btnVaciarPapelera">Vaciar papelera</button>` : ""}
          <button class="btn btn-primary" id="btnNuevoPedido">+ Nuevo pedido</button>
        </div>
      </div>

      <div class="tabs">
        <button class="tab-btn ${vista === "lista" ? "active" : ""}" data-tab="lista">Todos los pedidos</button>
        <button class="tab-btn ${vista === "proximas" ? "active" : ""}" data-tab="proximas">Próximas entregas</button>
        <button class="tab-btn ${vista === "papelera" ? "active" : ""}" data-tab="papelera">Papelera (${cantPapelera})</button>
      </div>

      ${vista === "lista"
        ? renderLista(filtrados, nombreCliente, nombreReceta)
        : (vista === "proximas"
          ? renderProximas(ordenados, nombreCliente, nombreReceta)
          : renderPapelera(ordenadosPapelera, nombreCliente, nombreReceta))}
    `;

    document.getElementById("btnNuevoPedido")?.addEventListener("click", () => abrirFormulario());
    container.querySelectorAll(".tab-btn").forEach(b => b.addEventListener("click", () => { vista = b.dataset.tab; render(container); }));

    if (vista === "lista") {
      const buscador = document.getElementById("buscadorPedidos");
      if (buscador) buscador.addEventListener("input", (e) => { searchTerm = e.target.value; render(container); });
      const selectFiltro = document.getElementById("filtroEstadoPedidos");
      if (selectFiltro) selectFiltro.addEventListener("change", (e) => { filtroEstado = e.target.value; render(container); });

      container.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => verDetalle(b.dataset.view)));
      container.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => abrirFormulario(b.dataset.edit)));
      container.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => eliminar(b.dataset.del, container)));
      container.querySelectorAll("[data-estado-select]").forEach(sel => sel.addEventListener("change", (e) => cambiarEstado(e.target.dataset.estadoSelect, e.target.value, container, e.target)));
    } else if (vista === "proximas") {
      container.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => verDetalle(b.dataset.view)));
    } else if (vista === "papelera") {
      const btnVaciar = document.getElementById("btnVaciarPapelera");
      if (btnVaciar) btnVaciar.addEventListener("click", () => vaciarPapelera(container));

      container.querySelectorAll("[data-restore]").forEach(b => b.addEventListener("click", () => {
        const id = b.dataset.restore || b.getAttribute("data-restore");
        restaurarPedido(id, container);
      }));
      container.querySelectorAll("[data-del-permanent]").forEach(b => b.addEventListener("click", () => {
        const id = b.dataset.delPermanent || b.getAttribute("data-del-permanent");
        eliminarDefinitivo(id, container);
      }));
      container.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => verDetalle(b.dataset.view)));
    }
  }

  function renderLista(pedidos, nombreCliente, nombreReceta) {
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
            ${pedidos.map(p => filaPedido(p, nombreCliente, nombreReceta)).join("")}
          </tbody>
        </table>`}
      </div>
    `;
  }

  function filaPedido(p, nombreCliente, nombreReceta) {
    const dias = MilaUtils.daysUntil(p.fechaEntrega);
    let urgencia = "";
    if (p.estado !== "Entregado" && p.estado !== "Cancelado") {
      if (dias < 0) urgencia = `<span class="badge badge-bajo">Atrasado</span>`;
      else if (dias === 0) urgencia = `<span class="badge badge-confirmado">Hoy</span>`;
      else if (dias <= 2) urgencia = `<span class="badge badge-preparacion">En ${dias}d</span>`;
    }
    return `
      <tr>
        <td><strong style="cursor:pointer" data-view="${p.id}">${MilaUtils.escapeHtml(nombreCliente(p.clienteId))}</strong></td>
        <td>${MilaUtils.escapeHtml(nombreReceta(p.recetaId))} <span class="text-muted">× ${p.cantidad}</span></td>
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

  function renderProximas(pedidos, nombreCliente, nombreReceta) {
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
                  <td style="width:26%"><strong style="cursor:pointer" data-view="${p.id}">${MilaUtils.escapeHtml(nombreCliente(p.clienteId))}</strong></td>
                  <td>${MilaUtils.escapeHtml(nombreReceta(p.recetaId))} × ${p.cantidad}</td>
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

  function renderPapelera(pedidos, nombreCliente, nombreReceta) {
    if (pedidos.length === 0) {
      return `
        <div class="empty-state">
          <div class="emoji">🗑️</div>
          <strong>La papelera está vacía</strong>
          <p>Los pedidos que elimines aparecerán acá para que puedas restaurarlos cuando quieras.</p>
        </div>
      `;
    }

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Producto</th>
              <th>Entrega</th>
              <th>Estado previo</th>
              <th class="text-right">Total</th>
              <th>Eliminado el</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${pedidos.map(p => filaPapelera(p, nombreCliente, nombreReceta)).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function filaPapelera(p, nombreCliente, nombreReceta) {
    return `
      <tr>
        <td><strong style="cursor:pointer" data-view="${p.id}">${MilaUtils.escapeHtml(nombreCliente(p.clienteId))}</strong></td>
        <td>${MilaUtils.escapeHtml(nombreReceta(p.recetaId))} <span class="text-muted">× ${p.cantidad}</span></td>
        <td>${MilaUtils.formatDate(p.fechaEntrega)} ${p.horaEntrega ? `· ${p.horaEntrega}` : ""}</td>
        <td><span class="badge ${MilaUtils.estadoBadgeClass(p.estado)}">${p.estado}</span></td>
        <td class="text-right num">${MilaUtils.money(p.total)}</td>
        <td class="text-muted">${MilaUtils.formatDateTime(p.eliminadoEn)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" data-restore="${p.id}">Restaurar</button>
            <button class="btn btn-danger btn-sm" data-del-permanent="${p.id}">Eliminar definitivamente</button>
          </div>
        </td>
      </tr>
    `;
  }

  /* ---------- alta / edición ---------- */

  async function abrirFormulario(id) {
    const editando = !!id;
    const [pedido, clientes, recetas] = await Promise.all([
      editando ? MilaDB.Pedidos.get(id) : null,
      MilaDB.Clientes.all(),
      MilaDB.Recetas.all()
    ]);

    const clientesSorted = (clientes || []).slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    const recetasSorted = (recetas || []).slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

    if (recetasSorted.length === 0) {
      MilaUtils.toast("Primero cargá al menos una receta en el recetario.", "warn");
      return;
    }

    const recetaSel = recetasSorted.find(r => r.id === pedido?.recetaId) || recetasSorted[0];

    const body = `
      <form id="formPedido" novalidate>
        <div class="form-grid">
          <div class="form-field" data-field="clienteId">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <label style="margin:0">Cliente *</label>
              <button type="button" class="link-btn" id="btnToggleQuickCliente" style="font-size:12.5px;cursor:pointer;color:var(--accent-dark);font-weight:700">+ Nuevo cliente</button>
            </div>
            <select name="clienteId" id="selectCliente">
              ${clientesSorted.length === 0 ? `<option value="">-- Sin clientes guardados --</option>` : ""}
              ${clientesSorted.map(c => `<option value="${c.id}" ${pedido?.clienteId === c.id ? "selected" : ""}>${MilaUtils.escapeHtml(c.nombre)} ${MilaUtils.escapeHtml(c.apellido || "")}</option>`).join("")}
            </select>

            <!-- Formulario desplegable de Alta Rápida de Cliente -->
            <div id="quickClienteForm" style="display:${clientesSorted.length === 0 ? "block" : "none"};background:var(--bg-alt);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border);margin-top:8px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <strong style="font-size:13px;color:var(--ink)">Dar de alta nuevo cliente</strong>
                <a href="#clientes" onclick="MilaUtils.closeModal()" style="font-size:11px;color:var(--accent-dark);font-weight:600">Ver agenda completa →</a>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                <input type="text" id="quickCliNombre" placeholder="Nombre *" style="font-size:13px">
                <input type="text" id="quickCliApellido" placeholder="Apellido" style="font-size:13px">
                <input type="tel" id="quickCliTelefono" placeholder="Teléfono" style="font-size:13px">
                <input type="email" id="quickCliEmail" placeholder="Email" style="font-size:13px">
              </div>
              <div style="display:flex;gap:6px;justify-content:flex-end">
                <button type="button" class="btn btn-outline btn-sm" id="btnCancelQuickCli">Cancelar</button>
                <button type="button" class="btn btn-primary btn-sm" id="btnSaveQuickCli">Guardar cliente</button>
              </div>
            </div>
          </div>

          <div class="form-field" data-field="recetaId">
            <label>Producto *</label>
            <select name="recetaId" id="selectReceta">
              ${recetasSorted.map(r => `<option value="${r.id}" ${pedido?.recetaId === r.id ? "selected" : ""}>${MilaUtils.escapeHtml(r.nombre)}</option>`).join("")}
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
              ${editando && pedido?.estado === "Entregado" ? `<option value="Entregado" selected>Entregado</option>` : ""}
            </select>
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
        const quickForm = document.getElementById("quickClienteForm");
        const selectCli = document.getElementById("selectCliente");

        // Toggle Alta Rápida de Cliente
        document.getElementById("btnToggleQuickCliente").addEventListener("click", () => {
          const isHidden = quickForm.style.display === "none";
          quickForm.style.display = isHidden ? "block" : "none";
          if (isHidden) {
            document.getElementById("quickCliNombre").focus();
          }
        });

        document.getElementById("btnCancelQuickCli").addEventListener("click", () => {
          quickForm.style.display = "none";
        });

        // Guardar Cliente Rápido
        document.getElementById("btnSaveQuickCli").addEventListener("click", async () => {
          const nombre = document.getElementById("quickCliNombre").value.trim();
          const apellido = document.getElementById("quickCliApellido").value.trim();
          const telefono = document.getElementById("quickCliTelefono").value.trim();
          const email = document.getElementById("quickCliEmail").value.trim();

          if (!nombre) {
            MilaUtils.toast("Ingresá al menos el nombre del cliente.", "warn");
            document.getElementById("quickCliNombre").focus();
            return;
          }

          const nuevoCli = await MilaDB.Clientes.create({
            id: MilaDB.generateId("cli"),
            nombre,
            apellido,
            telefono,
            email,
            fechaRegistro: new Date().toISOString()
          });

          // Agregar al select y seleccionar
          const opt = document.createElement("option");
          opt.value = nuevoCli.id;
          opt.textContent = `${nuevoCli.nombre} ${nuevoCli.apellido || ""}`.trim();
          opt.selected = true;
          selectCli.appendChild(opt);

          // Limpiar y ocultar quick form
          document.getElementById("quickCliNombre").value = "";
          document.getElementById("quickCliApellido").value = "";
          document.getElementById("quickCliTelefono").value = "";
          document.getElementById("quickCliEmail").value = "";
          quickForm.style.display = "none";

          MilaUtils.toast(`Cliente "${nuevoCli.nombre}" creado y seleccionado.`, "success");
        });

        document.getElementById("selectReceta").addEventListener("change", async (e) => {
          const r = await MilaDB.Recetas.get(e.target.value);
          if (r) {
            document.getElementById("inputPrecio").value = r.precioVenta;
            form.querySelector('[data-field="cantidad"] label').textContent = `Cantidad (en ${r.unidadRendimiento || "unidades"}) *`;
          }
          await actualizarPreviewPedido();
        });

        form.addEventListener("input", () => actualizarPreviewPedido());
        form.addEventListener("submit", (e) => { e.preventDefault(); guardar(e.target, id); });
        actualizarPreviewPedido();
      }
    });
  }

  async function actualizarPreviewPedido() {
    const form = document.getElementById("formPedido");
    if (!form) return;
    const recetaId = form.querySelector('[name="recetaId"]').value;
    const cantidad = Number(form.querySelector('[name="cantidad"]').value) || 0;
    const precioUnitario = Number(form.querySelector('[name="precioUnitario"]').value) || 0;
    const receta = await MilaDB.Recetas.get(recetaId);
    if (!receta) return;

    const calc = await MilaDB.calcularCostoReceta(receta);
    const total = precioUnitario * cantidad;
    const costoProduccion = calc.costoPorUnidad * cantidad;
    const utilidad = total - costoProduccion;
    const stockCheck = await MilaDB.verificarStockParaPedido(receta, cantidad);

    const el = document.getElementById("previewPedido");
    if (el) {
      el.innerHTML = `
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
  }

  async function guardar(form, id) {
    const data = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll(".form-field").forEach(f => f.classList.remove("has-error"));

    let valido = true;
    if (!MilaUtils.isRequired(data.clienteId)) { marcar(form, "clienteId"); valido = false; }
    if (!MilaUtils.isRequired(data.recetaId)) { marcar(form, "recetaId"); valido = false; }
    if (!MilaUtils.isPositiveNumber(data.cantidad) || Number(data.cantidad) <= 0) { marcar(form, "cantidad"); valido = false; }
    if (!MilaUtils.isPositiveNumber(data.precioUnitario)) { marcar(form, "precioUnitario"); valido = false; }
    if (!MilaUtils.isRequired(data.fechaPedido)) { marcar(form, "fechaPedido"); valido = false; }
    if (!MilaUtils.isRequired(data.fechaEntrega)) { marcar(form, "fechaEntrega"); valido = false; }
    if (data.fechaPedido && data.fechaEntrega && data.fechaEntrega < data.fechaPedido) { marcar(form, "fechaEntrega"); valido = false; }
    if (!valido) return;

    const receta = await MilaDB.Recetas.get(data.recetaId);
    const calc = await MilaDB.calcularCostoReceta(receta);
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
      const existente = await MilaDB.Pedidos.get(id);
      if (existente?.estado === "Entregado") {
        payload.estado = "Entregado";
        payload.cantidad = existente.cantidad;
        payload.recetaId = existente.recetaId;
        payload.stockDescontado = existente.stockDescontado;
        payload.fechaEntregado = existente.fechaEntregado;
      }
      await MilaDB.Pedidos.update(id, payload);
      MilaUtils.toast("Pedido actualizado", "success");
    } else {
      await MilaDB.Pedidos.create(Object.assign({ id: MilaDB.generateId("ped"), stockDescontado: false, fechaEntregado: null }, payload));
      MilaUtils.toast("Pedido creado", "success");
    }

    MilaUtils.closeModal();
    await render(document.getElementById("content"));
  }

  function marcar(form, campo) {
    const f = form.querySelector(`[data-field="${campo}"]`);
    if (f) f.classList.add("has-error");
  }

  async function cambiarEstado(pedidoId, nuevoEstado, container, selectEl) {
    const pedido = await MilaDB.Pedidos.get(pedidoId);
    if (!pedido) return;
    const estadoAnterior = pedido.estado;

    if (nuevoEstado === estadoAnterior) return;

    if (nuevoEstado === "Entregado") {
      await confirmarEntrega(pedido, container);
      return;
    }

    if (estadoAnterior === "Entregado" && nuevoEstado !== "Entregado") {
      const seguro = MilaUtils.confirmAction(
        `Este pedido ya fue marcado como "Entregado" y sus ingredientes fueron descontados del inventario.\n\nCambiar el estado a "${nuevoEstado}" NO devuelve el stock automáticamente.\n\n¿Confirmás el cambio de estado?`
      );
      if (!seguro) {
        selectEl.value = estadoAnterior;
        return;
      }
    }

    await MilaDB.Pedidos.update(pedidoId, { estado: nuevoEstado });
    MilaUtils.toast(`Pedido marcado como "${nuevoEstado}"`, "success");
    await render(container);
  }

  async function confirmarEntrega(pedido, container) {
    if (pedido.stockDescontado) {
      await MilaDB.Pedidos.update(pedido.id, { estado: "Entregado" });
      await render(container);
      return;
    }

    const receta = await MilaDB.Recetas.get(pedido.recetaId);
    if (!receta) {
      MilaUtils.toast("No se encontró la receta asociada a este pedido.", "error");
      await render(container);
      return;
    }

    const check = await MilaDB.verificarStockParaPedido(receta, pedido.cantidad);

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
        <p class="text-muted" style="font-size:13px">Podés reponer el inventario y volver a intentarlo, o forzar la entrega igualmente.</p>
        <div class="form-actions">
          <button type="button" class="btn btn-outline" id="btnCancelarEntrega">Cancelar</button>
          <button type="button" class="btn btn-danger" id="btnForzarEntrega">Entregar de todas formas</button>
        </div>
      `;
      MilaUtils.openModal("Stock insuficiente", body, {
        onMount: () => {
          document.getElementById("btnCancelarEntrega").addEventListener("click", () => { MilaUtils.closeModal(); render(container); });
          document.getElementById("btnForzarEntrega").addEventListener("click", async () => {
            await procesarEntrega(pedido, receta);
            MilaUtils.closeModal();
            await render(container);
          });
        },
        onClose: () => render(container)
      });
      return;
    }

    await procesarEntrega(pedido, receta);
    await render(container);
  }

  async function procesarEntrega(pedido, receta) {
    if (pedido.stockDescontado) return;
    await MilaDB.descontarStockPorPedido(receta, pedido.cantidad, pedido.id);
    await MilaDB.Pedidos.update(pedido.id, {
      estado: "Entregado",
      stockDescontado: true,
      fechaEntregado: new Date().toISOString()
    });
    MilaUtils.toast(`Pedido entregado: se descontaron los ingredientes de "${receta.nombre}" del inventario.`, "success");
  }

  async function verDetalle(id) {
    const p = await MilaDB.Pedidos.get(id);
    if (!p) return;
    const [receta, cliente] = await Promise.all([
      MilaDB.Recetas.get(p.recetaId),
      MilaDB.Clientes.get(p.clienteId)
    ]);

    const nombreCli = cliente ? `${cliente.nombre} ${cliente.apellido || ""}`.trim() : "Cliente eliminado";
    const nombreRec = receta ? receta.nombre : "Producto eliminado";

    const body = `
      <div class="detail-list">
        <div class="row"><span>Cliente</span><strong>${MilaUtils.escapeHtml(nombreCli)}</strong></div>
        <div class="row"><span>Producto</span><strong>${MilaUtils.escapeHtml(nombreRec)} × ${p.cantidad}</strong></div>
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
    MilaUtils.openModal(`Pedido de ${MilaUtils.escapeHtml(nombreCli)}`, body);
  }

  async function eliminar(id, container) {
    const p = await MilaDB.Pedidos.get(id);
    if (!p) return;
    let msg = "¿Mover este pedido a la papelera?";
    if (p.stockDescontado) {
      msg = "Este pedido ya descontó materias primas del inventario. Moverlo a la papelera NO devuelve el stock automáticamente.\n\n¿Mover a la papelera?";
    }
    if (!MilaUtils.confirmAction(msg)) return;
    await MilaDB.Pedidos.mandarAPapelera(id);
    MilaUtils.toast("Pedido movido a la papelera", "success");
    await render(container);
  }

  async function restaurarPedido(id, container) {
    const p = await MilaDB.Pedidos.get(id);
    if (!p) return;

    const [cliente, receta] = await Promise.all([
      MilaDB.Clientes.get(p.clienteId),
      MilaDB.Recetas.get(p.recetaId)
    ]);

    if (!cliente || !receta) {
      const faltantes = [];
      if (!cliente) faltantes.push("el cliente original");
      if (!receta) faltantes.push("la receta original");
      MilaUtils.toast(`Aviso: ${faltantes.join(" y ")} ya no existe en el sistema.`, "warn");
    }

    await MilaDB.Pedidos.restaurar(id);
    MilaUtils.toast("Pedido restaurado", "success");
    await render(container);
  }

  async function eliminarDefinitivo(id, container) {
    const seguro = MilaUtils.confirmAction("¿Eliminar este pedido definitivamente? Esta acción no se puede deshacer.");
    if (!seguro) return;
    await MilaDB.Pedidos.remove(id);
    MilaUtils.toast("Pedido eliminado definitivamente", "success");
    await render(container);
  }

  async function vaciarPapelera(container) {
    const enPapelera = await MilaDB.Pedidos.papelera();
    if (enPapelera.length === 0) return;
    const seguro = MilaUtils.confirmAction(`¿Eliminar definitivamente los ${enPapelera.length} pedido${enPapelera.length === 1 ? "" : "s"} de la papelera? Esta acción no se puede deshacer.`);
    if (!seguro) return;
    await MilaDB.Pedidos.vaciarPapelera();
    MilaUtils.toast(`Se eliminaron definitivamente ${enPapelera.length} pedido${enPapelera.length === 1 ? "" : "s"}`, "success");
    await render(container);
  }

  return { render, ESTADOS };
})();
