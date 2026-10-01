/* =========================================================
   MILA · inventario.js
   Control de materias primas: stock, movimientos y alertas.
   ========================================================= */

const Inventario = (function () {

  let searchTerm = "";
  let filtroCategoria = "";
  let tab = "stock"; // "stock" | "movimientos"

  const UNIDADES = ["g", "kg", "ml", "l", "unidad"];

  async function render(container) {
    const items = await MilaDB.Inventario.all();
    const sorted = (items || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
    const categorias = [...new Set(sorted.map(i => i.categoria).filter(Boolean))];
    const bajoStock = sorted.filter(i => Number(i.stockActual) <= Number(i.stockMinimo));

    let filtrados = sorted;
    if (searchTerm) filtrados = filtrados.filter(i => i.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    if (filtroCategoria) filtrados = filtrados.filter(i => i.categoria === filtroCategoria);

    const mainContent = tab === "stock"
      ? renderStockTab(filtrados, categorias)
      : await renderMovimientosTab();

    container.innerHTML = `
      <div class="view-header">
        <div>
          <span class="eyebrow">Obrador</span>
          <h1>Inventario</h1>
          <p class="subtitle">${sorted.length} materia${sorted.length === 1 ? "" : "s"} prima${sorted.length === 1 ? "" : "s"} registradas</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-outline" id="btnMovimiento">⇅ Registrar movimiento</button>
          <button class="btn btn-primary" id="btnNuevaMp">+ Nueva materia prima</button>
        </div>
      </div>

      ${bajoStock.length > 0 ? `
        <div class="alert alert-warn">
          <span>⚠</span>
          <div><strong>${bajoStock.length} insumo${bajoStock.length === 1 ? "" : "s"}</strong> con stock igual o por debajo del mínimo: ${bajoStock.map(i => MilaUtils.escapeHtml(i.nombre)).join(", ")}.</div>
        </div>` : ""}

      <div class="tabs">
        <button class="tab-btn ${tab === "stock" ? "active" : ""}" data-tab="stock">Stock actual</button>
        <button class="tab-btn ${tab === "movimientos" ? "active" : ""}" data-tab="movimientos">Historial de movimientos</button>
      </div>

      ${mainContent}
    `;

    document.getElementById("btnNuevaMp").addEventListener("click", () => abrirFormularioMp());
    document.getElementById("btnMovimiento").addEventListener("click", () => abrirFormularioMovimiento());

    container.querySelectorAll(".tab-btn").forEach(b => b.addEventListener("click", () => { tab = b.dataset.tab; render(container); }));

    if (tab === "stock") {
      const buscador = document.getElementById("buscadorMp");
      if (buscador) buscador.addEventListener("input", (e) => { searchTerm = e.target.value; render(container); });
      const selCat = document.getElementById("filtroCategoriaMp");
      if (selCat) selCat.addEventListener("change", (e) => { filtroCategoria = e.target.value; render(container); });

      container.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => abrirFormularioMp(btn.dataset.edit)));
      container.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", () => eliminar(btn.dataset.del, container)));
    }
  }

  function renderStockTab(items, categorias) {
    return `
      <div class="search-bar">
        <input type="search" id="buscadorMp" placeholder="Buscar materia prima…" value="${MilaUtils.escapeHtml(searchTerm)}">
        <select id="filtroCategoriaMp">
          <option value="">Todas las categorías</option>
          ${categorias.map(c => `<option value="${MilaUtils.escapeHtml(c)}" ${filtroCategoria === c ? "selected" : ""}>${MilaUtils.escapeHtml(c)}</option>`).join("")}
        </select>
      </div>
      <div class="table-wrap">
        ${items.length === 0 ? `<div class="empty-state"><div class="emoji">🌾</div><strong>Sin resultados</strong><p>No hay materias primas que coincidan con la búsqueda.</p></div>` : `
        <table>
          <thead>
            <tr><th>Materia prima</th><th>Categoría</th><th>Stock</th><th>Costo unitario</th><th>Proveedor</th><th></th></tr>
          </thead>
          <tbody>
            ${items.map(i => filaStock(i)).join("")}
          </tbody>
        </table>`}
      </div>
    `;
  }

  function filaStock(i) {
    const bajo = Number(i.stockActual) <= Number(i.stockMinimo);
    const ratio = Number(i.stockMinimo) > 0 ? Math.min(1, Number(i.stockActual) / (Number(i.stockMinimo) * 2)) : 1;
    const barClass = bajo ? "low" : (ratio < 0.6 ? "mid" : "");
    return `
      <tr>
        <td>
          <strong>${MilaUtils.escapeHtml(i.nombre)}</strong>
          <div class="stock-bar"><div class="stock-bar-fill ${barClass}" style="width:${Math.round(ratio * 100)}%"></div></div>
        </td>
        <td><span class="tag-pill">${MilaUtils.escapeHtml(i.categoria || "—")}</span></td>
        <td class="num">
          ${MilaUtils.num(i.stockActual)} ${MilaUtils.escapeHtml(i.unidad)}
          ${bajo ? `<span class="badge badge-bajo" style="margin-left:6px">Stock bajo</span>` : ""}
          <div class="text-muted" style="font-size:11.5px">mínimo: ${MilaUtils.num(i.stockMinimo)} ${MilaUtils.escapeHtml(i.unidad)}</div>
        </td>
        <td class="num">${MilaUtils.money(i.costoUnitario)} / ${MilaUtils.escapeHtml(i.unidad)}</td>
        <td class="text-muted">${MilaUtils.escapeHtml(i.proveedor || "—")}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-outline btn-sm" data-edit="${i.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-del="${i.id}">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  }

  async function renderMovimientosTab() {
    const movsList = await MilaDB.Movimientos.all();
    const movs = (movsList || []).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 100);
    return `
      <div class="table-wrap">
        ${movs.length === 0 ? `<div class="empty-state"><div class="emoji">📋</div><strong>Sin movimientos todavía</strong><p>Los movimientos aparecen al registrar entradas/salidas o al entregar pedidos.</p></div>` : `
        <table>
          <thead><tr><th>Fecha</th><th>Materia prima</th><th>Tipo</th><th>Cantidad</th><th>Motivo</th></tr></thead>
          <tbody>
            ${movs.map(m => `
              <tr>
                <td class="text-muted">${MilaUtils.formatDateTime(m.fecha)}</td>
                <td><strong>${MilaUtils.escapeHtml(m.materiaPrimaNombre || "Insumo")}</strong></td>
                <td><span class="badge ${m.tipo === "entrada" ? "badge-ok" : "badge-bajo"}">${m.tipo === "entrada" ? "Entrada" : "Salida"}</span></td>
                <td class="num">${m.tipo === "entrada" ? "+" : "−"}${MilaUtils.num(m.cantidad)} ${MilaUtils.escapeHtml(m.unidad || "")}</td>
                <td class="text-muted">${MilaUtils.escapeHtml(m.motivo || "—")}</td>
              </tr>`).join("")}
          </tbody>
        </table>`}
      </div>
    `;
  }

  /* ---------- alta / edición de materia prima ---------- */

  async function abrirFormularioMp(id) {
    const editando = !!id;
    const [mp, items] = await Promise.all([
      editando ? MilaDB.Inventario.get(id) : null,
      MilaDB.Inventario.all()
    ]);

    const categoriasUnicas = [...new Set((items || []).map(i => i.categoria).filter(Boolean))];

    const body = `
      <form id="formMp" novalidate>
        <div class="form-grid">
          <div class="form-field full" data-field="nombre">
            <label>Nombre *</label>
            <input type="text" name="nombre" value="${MilaUtils.escapeHtml(mp?.nombre || "")}">
            <span class="field-error">El nombre es obligatorio.</span>
          </div>
          <div class="form-field" data-field="categoria">
            <label>Categoría</label>
            <input type="text" name="categoria" list="listaCategorias" value="${MilaUtils.escapeHtml(mp?.categoria || "")}" placeholder="Secos, Lácteos…">
            <datalist id="listaCategorias">
              ${categoriasUnicas.map(c => `<option value="${MilaUtils.escapeHtml(c)}">`).join("")}
            </datalist>
          </div>
          <div class="form-field" data-field="unidad">
            <label>Unidad de medida *</label>
            <select name="unidad">
              ${UNIDADES.map(u => `<option value="${u}" ${mp?.unidad === u ? "selected" : ""}>${u}</option>`).join("")}
            </select>
          </div>
          <div class="form-field" data-field="stockActual">
            <label>Stock actual *</label>
            <input type="number" step="0.01" min="0" name="stockActual" value="${mp?.stockActual ?? 0}">
            <span class="field-error">Ingresá un valor mayor o igual a 0.</span>
          </div>
          <div class="form-field" data-field="stockMinimo">
            <label>Stock mínimo *</label>
            <input type="number" step="0.01" min="0" name="stockMinimo" value="${mp?.stockMinimo ?? 0}">
            <span class="field-error">Ingresá un valor mayor o igual a 0.</span>
            <span class="hint">Se avisa cuando el stock cae a este nivel o menos.</span>
          </div>
          <div class="form-field" data-field="costoUnitario">
            <label>Costo unitario *</label>
            <input type="number" step="0.01" min="0" name="costoUnitario" value="${mp?.costoUnitario ?? 0}">
            <span class="field-error">Ingresá un valor mayor o igual a 0.</span>
            <span class="hint">Costo por cada ${mp?.unidad || "unidad"}. Afecta el costo de las recetas.</span>
          </div>
          <div class="form-field" data-field="proveedor">
            <label>Proveedor (opcional)</label>
            <input type="text" name="proveedor" value="${MilaUtils.escapeHtml(mp?.proveedor || "")}">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-outline" id="btnCancelarMp">Cancelar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Guardar cambios" : "Agregar"}</button>
        </div>
      </form>
    `;

    MilaUtils.openModal(editando ? "Editar materia prima" : "Nueva materia prima", body, {
      onMount: () => {
        document.getElementById("btnCancelarMp").addEventListener("click", MilaUtils.closeModal);
        document.getElementById("formMp").addEventListener("submit", (e) => { e.preventDefault(); guardarMp(e.target, id); });
      }
    });
  }

  async function guardarMp(form, id) {
    const data = Object.fromEntries(new FormData(form).entries());
    let valido = true;
    form.querySelectorAll(".form-field").forEach(f => f.classList.remove("has-error"));

    if (!MilaUtils.isRequired(data.nombre)) { marcarError(form, "nombre"); valido = false; }
    if (!MilaUtils.isPositiveNumber(data.stockActual)) { marcarError(form, "stockActual"); valido = false; }
    if (!MilaUtils.isPositiveNumber(data.stockMinimo)) { marcarError(form, "stockMinimo"); valido = false; }
    if (!MilaUtils.isPositiveNumber(data.costoUnitario)) { marcarError(form, "costoUnitario"); valido = false; }
    if (!valido) return;

    const payload = {
      nombre: data.nombre.trim(),
      categoria: (data.categoria || "").trim(),
      unidad: data.unidad,
      stockActual: Number(data.stockActual),
      stockMinimo: Number(data.stockMinimo),
      costoUnitario: Number(data.costoUnitario),
      proveedor: (data.proveedor || "").trim(),
      fechaActualizacion: new Date().toISOString()
    };

    if (id) {
      await MilaDB.Inventario.update(id, payload);
      MilaUtils.toast("Materia prima actualizada", "success");
    } else {
      await MilaDB.Inventario.create(Object.assign({ id: MilaDB.generateId("mp") }, payload));
      MilaUtils.toast("Materia prima agregada", "success");
    }

    MilaUtils.closeModal();
    await render(document.getElementById("content"));
  }

  function marcarError(form, campo) {
    const el = form.querySelector(`[data-field="${campo}"]`);
    if (el) el.classList.add("has-error");
  }

  async function eliminar(id, container) {
    const [mp, todasRecetas] = await Promise.all([
      MilaDB.Inventario.get(id),
      MilaDB.Recetas.all()
    ]);

    if (!mp) return;
    const usadaEnRecetas = (todasRecetas || []).filter(r => (r.ingredientes || []).some(ing => ing.materiaPrimaId === id));
    if (usadaEnRecetas.length > 0) {
      MilaUtils.toast(`No se puede eliminar: se usa en ${usadaEnRecetas.length} receta(s).`, "error");
      return;
    }
    if (!MilaUtils.confirmAction(`¿Eliminar "${mp.nombre}" del inventario?`)) return;
    await MilaDB.Inventario.remove(id);
    MilaUtils.toast("Materia prima eliminada", "success");
    await render(container);
  }

  /* ---------- entradas / salidas manuales ---------- */

  async function abrirFormularioMovimiento() {
    const items = await MilaDB.Inventario.all();
    const sorted = (items || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (sorted.length === 0) {
      MilaUtils.toast("Primero agregá materias primas al inventario.", "warn");
      return;
    }

    const body = `
      <form id="formMovimiento" novalidate>
        <div class="form-grid">
          <div class="form-field full" data-field="materiaPrimaId">
            <label>Materia prima *</label>
            <select name="materiaPrimaId">
              ${sorted.map(i => `<option value="${i.id}">${MilaUtils.escapeHtml(i.nombre)} (stock: ${MilaUtils.num(i.stockActual)} ${i.unidad})</option>`).join("")}
            </select>
          </div>
          <div class="form-field" data-field="tipo">
            <label>Tipo de movimiento *</label>
            <select name="tipo">
              <option value="entrada">Entrada (compra / reposición)</option>
              <option value="salida">Salida (merma / ajuste)</option>
            </select>
          </div>
          <div class="form-field" data-field="cantidad">
            <label>Cantidad *</label>
            <input type="number" step="0.01" min="0.01" name="cantidad" value="">
            <span class="field-error">Ingresá una cantidad mayor a 0.</span>
          </div>
          <div class="form-field full" data-field="motivo">
            <label>Motivo</label>
            <input type="text" name="motivo" placeholder="Ej: compra semanal, producto vencido…">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-outline" id="btnCancelarMov">Cancelar</button>
          <button type="submit" class="btn btn-primary">Registrar movimiento</button>
        </div>
      </form>
    `;

    MilaUtils.openModal("Registrar movimiento de inventario", body, {
      onMount: () => {
        document.getElementById("btnCancelarMov").addEventListener("click", MilaUtils.closeModal);
        document.getElementById("formMovimiento").addEventListener("submit", (e) => { e.preventDefault(); guardarMovimiento(e.target); });
      }
    });
  }

  async function guardarMovimiento(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll(".form-field").forEach(f => f.classList.remove("has-error"));

    if (!MilaUtils.isPositiveNumber(data.cantidad) || Number(data.cantidad) <= 0) {
      marcarError(form, "cantidad");
      return;
    }

    const mp = await MilaDB.Inventario.get(data.materiaPrimaId);
    if (!mp) { MilaUtils.toast("La materia prima seleccionada ya no existe.", "error"); return; }

    const cantidad = Number(data.cantidad);
    if (data.tipo === "salida" && cantidad > Number(mp.stockActual)) {
      if (!MilaUtils.confirmAction(`El stock actual es ${MilaUtils.num(mp.stockActual)} ${mp.unidad}, menor a la salida solicitada (${MilaUtils.num(cantidad)} ${mp.unidad}). ¿Continuar de todas formas? El stock quedará en 0.`)) {
        return;
      }
    }

    const nuevoStock = data.tipo === "entrada"
      ? Number(mp.stockActual) + cantidad
      : Math.max(0, Number(mp.stockActual) - cantidad);

    await MilaDB.Inventario.update(mp.id, { stockActual: nuevoStock, fechaActualizacion: new Date().toISOString() });

    await MilaDB.Movimientos.create({
      id: MilaDB.generateId("mov"),
      materiaPrimaId: mp.id,
      materiaPrimaNombre: mp.nombre,
      tipo: data.tipo,
      cantidad: cantidad,
      unidad: mp.unidad,
      motivo: (data.motivo || (data.tipo === "entrada" ? "Entrada manual" : "Salida manual")).trim(),
      referenciaPedidoId: null,
      fecha: new Date().toISOString()
    });

    MilaUtils.toast("Movimiento registrado", "success");
    MilaUtils.closeModal();
    await render(document.getElementById("content"));
  }

  return { render, UNIDADES };
})();
