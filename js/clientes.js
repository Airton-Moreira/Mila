/* =========================================================
   MILA · clientes.js
   Módulo de administración de clientes.
   ========================================================= */

const Clientes = (function () {

  let searchTerm = "";

  async function render(container) {
    const [clientesList, pedidosList] = await Promise.all([
      MilaDB.Clientes.all(),
      MilaDB.Pedidos.all()
    ]);

    const clientes = (clientesList || []).slice().sort((a, b) => ((a.nombre || "") + (a.apellido || "")).localeCompare((b.nombre || "") + (b.apellido || "")));
    const pedidos = pedidosList || [];

    const filtrados = searchTerm
      ? clientes.filter(c => {
          const blob = `${c.nombre} ${c.apellido || ""} ${c.telefono || ""} ${c.email || ""}`.toLowerCase();
          return blob.includes(searchTerm.toLowerCase());
        })
      : clientes;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <span class="eyebrow">Agenda</span>
          <h1>Clientes</h1>
          <p class="subtitle">${clientes.length} cliente${clientes.length === 1 ? "" : "s"} registrado${clientes.length === 1 ? "" : "s"}</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="btnNuevoCliente">+ Nuevo cliente</button>
        </div>
      </div>

      <div class="search-bar">
        <input type="search" id="buscadorClientes" placeholder="Buscar por nombre, teléfono o email…" value="${MilaUtils.escapeHtml(searchTerm)}">
      </div>

      <div class="table-wrap">
        ${filtrados.length === 0 ? emptyState() : tabla(filtrados, pedidos)}
      </div>
    `;

    document.getElementById("btnNuevoCliente").addEventListener("click", () => abrirFormulario());
    const buscador = document.getElementById("buscadorClientes");
    if (buscador) {
      buscador.addEventListener("input", (e) => {
        searchTerm = e.target.value;
        render(container);
      });
    }

    container.querySelectorAll("[data-edit]").forEach(btn =>
      btn.addEventListener("click", () => abrirFormulario(btn.dataset.edit)));
    container.querySelectorAll("[data-del]").forEach(btn =>
      btn.addEventListener("click", () => eliminar(btn.dataset.del, container)));
    container.querySelectorAll("[data-view-cliente]").forEach(btn =>
      btn.addEventListener("click", () => verDetalle(btn.dataset.viewCliente)));
  }

  function emptyState() {
    return `
      <div class="empty-state">
        <div class="emoji">🧁</div>
        <strong>Todavía no hay clientes cargados</strong>
        <p>Agregá el primero para empezar a registrar pedidos.</p>
      </div>`;
  }

  function tabla(clientes, pedidos) {
    return `
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Teléfono</th>
            <th>Email</th>
            <th>Pedidos</th>
            <th>Registrado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${clientes.map(c => {
            const pedidosCliente = pedidos.filter(p => p.clienteId === c.id);
            return `
            <tr>
              <td>
                <strong style="cursor:pointer" data-view-cliente="${c.id}">${MilaUtils.escapeHtml(c.nombre)} ${MilaUtils.escapeHtml(c.apellido || "")}</strong>
                ${c.direccion ? `<div class="text-muted" style="font-size:12px">${MilaUtils.escapeHtml(c.direccion)}</div>` : ""}
              </td>
              <td class="num">${MilaUtils.escapeHtml(c.telefono || "—")}</td>
              <td>${MilaUtils.escapeHtml(c.email || "—")}</td>
              <td><span class="tag-pill">${pedidosCliente.length} pedido${pedidosCliente.length === 1 ? "" : "s"}</span></td>
              <td class="text-muted">${MilaUtils.formatDate(c.fechaRegistro)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-outline btn-sm" data-view-cliente="${c.id}">Ver</button>
                  <button class="btn btn-outline btn-sm" data-edit="${c.id}">Editar</button>
                  <button class="btn btn-danger btn-sm" data-del="${c.id}">Eliminar</button>
                </div>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  async function abrirFormulario(id) {
    const editando = !!id;
    const cliente = editando ? await MilaDB.Clientes.get(id) : null;

    const body = `
      <form id="formCliente" novalidate>
        <div class="form-grid">
          <div class="form-field" data-field="nombre">
            <label>Nombre *</label>
            <input type="text" name="nombre" value="${MilaUtils.escapeHtml(cliente?.nombre || "")}">
            <span class="field-error">El nombre es obligatorio.</span>
          </div>
          <div class="form-field" data-field="apellido">
            <label>Apellido</label>
            <input type="text" name="apellido" value="${MilaUtils.escapeHtml(cliente?.apellido || "")}">
          </div>
          <div class="form-field" data-field="telefono">
            <label>Teléfono</label>
            <input type="tel" name="telefono" value="${MilaUtils.escapeHtml(cliente?.telefono || "")}">
          </div>
          <div class="form-field" data-field="email">
            <label>Email</label>
            <input type="email" name="email" value="${MilaUtils.escapeHtml(cliente?.email || "")}">
          </div>
          <div class="form-field full" data-field="direccion">
            <label>Dirección</label>
            <input type="text" name="direccion" value="${MilaUtils.escapeHtml(cliente?.direccion || "")}">
          </div>
          <div class="form-field full" data-field="notas">
            <label>Notas</label>
            <textarea name="notas">${MilaUtils.escapeHtml(cliente?.notas || "")}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-outline" id="btnCancelarCliente">Cancelar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Guardar cambios" : "Crear cliente"}</button>
        </div>
      </form>
    `;

    MilaUtils.openModal(editando ? "Editar cliente" : "Nuevo cliente", body, {
      onMount: () => {
        document.getElementById("btnCancelarCliente").addEventListener("click", MilaUtils.closeModal);
        document.getElementById("formCliente").addEventListener("submit", (e) => {
          e.preventDefault();
          guardar(e.target, id);
        });
      }
    });
  }

  async function guardar(form, id) {
    const data = Object.fromEntries(new FormData(form).entries());
    let valido = true;

    form.querySelectorAll(".form-field").forEach(f => f.classList.remove("has-error"));

    if (!MilaUtils.isRequired(data.nombre)) {
      form.querySelector('[data-field="nombre"]').classList.add("has-error");
      valido = false;
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      const emailField = form.querySelector('[data-field="email"]');
      if (emailField) emailField.classList.add("has-error");
      valido = false;
    }
    if (!valido) return;

    if (id) {
      await MilaDB.Clientes.update(id, {
        nombre: data.nombre.trim(),
        apellido: (data.apellido || "").trim(),
        telefono: (data.telefono || "").trim(),
        email: (data.email || "").trim(),
        direccion: (data.direccion || "").trim(),
        notas: (data.notas || "").trim()
      });
      MilaUtils.toast("Cliente actualizado", "success");
    } else {
      await MilaDB.Clientes.create({
        id: MilaDB.generateId("cli"),
        nombre: data.nombre.trim(),
        apellido: (data.apellido || "").trim(),
        telefono: (data.telefono || "").trim(),
        email: (data.email || "").trim(),
        direccion: (data.direccion || "").trim(),
        notas: (data.notas || "").trim(),
        fechaRegistro: new Date().toISOString()
      });
      MilaUtils.toast("Cliente creado", "success");
    }

    MilaUtils.closeModal();
    await render(document.getElementById("content"));
  }

  async function eliminar(id, container) {
    const [cliente, todosPedidos] = await Promise.all([
      MilaDB.Clientes.get(id),
      MilaDB.Pedidos.all()
    ]);

    if (!cliente) return;
    const pedidosAsociados = (todosPedidos || []).filter(p => p.clienteId === id);
    const msg = pedidosAsociados.length
      ? `${cliente.nombre} tiene ${pedidosAsociados.length} pedido(s) asociado(s). Los pedidos quedarán con la referencia al cliente eliminada. ¿Eliminar de todas formas?`
      : `¿Eliminar a ${cliente.nombre} ${cliente.apellido || ""}? Esta acción no se puede deshacer.`;
    if (!MilaUtils.confirmAction(msg)) return;

    await MilaDB.Clientes.remove(id);
    MilaUtils.toast("Cliente eliminado", "success");
    await render(container);
  }

  async function verDetalle(id) {
    const [cliente, todosPedidos, recetas] = await Promise.all([
      MilaDB.Clientes.get(id),
      MilaDB.Pedidos.all(),
      MilaDB.Recetas.all()
    ]);

    if (!cliente) return;
    const recetasMap = new Map((recetas || []).map(r => [r.id, r.nombre]));
    const pedidos = (todosPedidos || [])
      .filter(p => p.clienteId === id)
      .sort((a, b) => new Date(b.fechaEntrega) - new Date(a.fechaEntrega));

    const body = `
      <div class="detail-list" style="margin-bottom:18px">
        <div class="row"><span>Teléfono</span><strong>${MilaUtils.escapeHtml(cliente.telefono || "—")}</strong></div>
        <div class="row"><span>Email</span><strong>${MilaUtils.escapeHtml(cliente.email || "—")}</strong></div>
        <div class="row"><span>Dirección</span><strong>${MilaUtils.escapeHtml(cliente.direccion || "—")}</strong></div>
        <div class="row"><span>Cliente desde</span><strong>${MilaUtils.formatDate(cliente.fechaRegistro)}</strong></div>
        ${cliente.notas ? `<div class="row"><span>Notas</span><strong>${MilaUtils.escapeHtml(cliente.notas)}</strong></div>` : ""}
      </div>
      <div class="section-title"><h2 style="font-size:15px">Pedidos asociados (${pedidos.length})</h2></div>
      ${pedidos.length === 0 ? '<p class="text-muted">Sin pedidos todavía.</p>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Producto</th><th>Entrega</th><th>Estado</th><th class="text-right">Total</th></tr></thead>
            <tbody>
              ${pedidos.map(p => `
                <tr>
                  <td>${MilaUtils.escapeHtml(recetasMap.get(p.recetaId) || "Producto eliminado")} × ${p.cantidad}</td>
                  <td>${MilaUtils.formatDate(p.fechaEntrega)}</td>
                  <td><span class="badge ${MilaUtils.estadoBadgeClass(p.estado)}">${p.estado}</span></td>
                  <td class="text-right num">${MilaUtils.money(p.total)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      `}
    `;

    MilaUtils.openModal(`${cliente.nombre} ${cliente.apellido || ""}`, body);
  }

  return { render };
})();
