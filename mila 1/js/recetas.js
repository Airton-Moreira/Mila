/* =========================================================
   MILA · recetas.js
   Fichas técnicas: ingredientes, costos, precio y rentabilidad.
   ========================================================= */
   document.querySelectorAll(".card-scallop").forEach(c => {
    c.style.webkitMaskImage = "none";
});

const Recetas = (function () {

  let searchTerm = "";
  let ingredienteRowSeq = 0;

  function render(container) {
    const recetas = MilaDB.Recetas.all().slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
    const filtradas = searchTerm ? recetas.filter(r => r.nombre.toLowerCase().includes(searchTerm.toLowerCase())) : recetas;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <span class="eyebrow">Fichas técnicas</span>
          <h1>Recetas</h1>
          <p class="subtitle">${recetas.length} producto${recetas.length === 1 ? "" : "s"} en el recetario</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="btnNuevaReceta">+ Nueva receta</button>
        </div>
      </div>

      <div class="search-bar">
        <input type="search" id="buscadorRecetas" placeholder="Buscar receta…" value="${MilaUtils.escapeHtml(searchTerm)}">
      </div>

      ${filtradas.length === 0 ? `
        <div class="empty-state">
          <div class="emoji">📖</div>
          <strong>Todavía no hay recetas</strong>
          <p>Creá la primera ficha técnica para poder calcular costos y armar pedidos.</p>
        </div>` : `
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
        ${filtradas.map(r => tarjetaReceta(r)).join("")}
      </div>`}
    `;

    document.getElementById("btnNuevaReceta").addEventListener("click", () => abrirFormulario());
    const buscador = document.getElementById("buscadorRecetas");
    buscador.addEventListener("input", (e) => { searchTerm = e.target.value; render(container); refocus("buscadorRecetas"); });

    container.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => abrirFormulario(b.dataset.edit)));
    container.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => eliminar(b.dataset.del, container)));
    container.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => verDetalle(b.dataset.view)));
  }

  function refocus(id) {
    const el = document.getElementById(id);
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  }

  function tarjetaReceta(r) {
    const calc = MilaDB.calcularCostoReceta(r);
    const margenClass = calc.margen < 15 ? "warn" : (calc.margen >= 40 ? "good" : "");
    return `
      <div class="card card-scallop">
        <span class="tag-pill">${MilaUtils.escapeHtml(r.categoria || "General")}</span>
        <h3 style="margin-top:8px;font-size:18px">${MilaUtils.escapeHtml(r.nombre)}</h3>
        <p class="text-muted" style="font-size:12.5px;min-height:32px">${MilaUtils.escapeHtml(r.descripcion || "Sin descripción.")}</p>
        <div class="detail-list" style="margin:12px 0">
          <div class="row"><span>Rinde</span><strong>${MilaUtils.num(r.rendimiento)} ${MilaUtils.escapeHtml(r.unidadRendimiento || "")}</strong></div>
          <div class="row"><span>Costo / unidad</span><strong>${MilaUtils.money(calc.costoPorUnidad)}</strong></div>
          <div class="row"><span>Precio de venta</span><strong>${MilaUtils.money(calc.precioVenta)}</strong></div>
          <div class="row total"><span>Margen</span><strong class="amount ${margenClass === 'warn' ? 'text-muted' : ''}">${MilaUtils.pct(calc.margen)}</strong></div>
        </div>
        ${calc.faltantes.length > 0 ? `<div class="alert alert-danger" style="font-size:12px;padding:8px 10px">Ingredientes eliminados del inventario: ${calc.faltantes.join(", ")}</div>` : ""}
        <div class="row-actions" style="justify-content:flex-start;margin-top:8px">
          <button class="btn btn-outline btn-sm" data-view="${r.id}">Ver ficha</button>
          <button class="btn btn-outline btn-sm" data-edit="${r.id}">Editar</button>
          <button class="btn btn-danger btn-sm" data-del="${r.id}">Eliminar</button>
        </div>
      </div>
    `;
  }

  /* ---------- detalle ---------- */

  function verDetalle(id) {
    const r = MilaDB.Recetas.get(id);
    if (!r) return;
    const calc = MilaDB.calcularCostoReceta(r);

    const body = `
      <p class="text-muted">${MilaUtils.escapeHtml(r.descripcion || "")}</p>
      <div class="section-title" style="margin-top:14px"><h2 style="font-size:15px">Ingredientes</h2></div>
      <div class="table-wrap" style="margin-bottom:16px">
        <table>
          <thead><tr><th>Ingrediente</th><th>Cantidad</th><th class="text-right">Costo</th></tr></thead>
          <tbody>
            ${calc.ingredientesDetalle.map(i => `
              <tr>
                <td>${MilaUtils.escapeHtml(i.nombre)}</td>
                <td class="num">${MilaUtils.num(i.cantidad)} ${MilaUtils.escapeHtml(i.unidad)}</td>
                <td class="text-right num">${MilaUtils.money(i.costoIngrediente)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="detail-list">
        <div class="row"><span>Rendimiento</span><strong>${MilaUtils.num(r.rendimiento)} ${MilaUtils.escapeHtml(r.unidadRendimiento || "")}</strong></div>
        <div class="row"><span>Costo total del lote</span><strong>${MilaUtils.money(calc.costoTotal)}</strong></div>
        <div class="row"><span>Costo por unidad</span><strong>${MilaUtils.money(calc.costoPorUnidad)}</strong></div>
        <div class="row"><span>Precio de venta</span><strong>${MilaUtils.money(calc.precioVenta)}</strong></div>
        <div class="row"><span>Utilidad por unidad</span><strong>${MilaUtils.money(calc.utilidad)}</strong></div>
        <div class="row total"><span>Margen de ganancia</span><strong class="amount">${MilaUtils.pct(calc.margen)}</strong></div>
      </div>
    `;

    MilaUtils.openModal(r.nombre, body, { wide: true });
  }

  /* ---------- alta / edición ---------- */

  function abrirFormulario(id) {
    const editando = !!id;
    const receta = editando ? MilaDB.Recetas.get(id) : null;
    const inventario = MilaDB.Inventario.all().slice().sort((a, b) => a.nombre.localeCompare(b.nombre));

    if (inventario.length === 0) {
      MilaUtils.toast("Primero cargá materias primas en el inventario para poder crear recetas.", "warn");
      return;
    }

    const ingredientesIniciales = editando && receta.ingredientes.length > 0
      ? receta.ingredientes
      : [{ materiaPrimaId: inventario[0].id, cantidad: "", unidad: inventario[0].unidad }];

    const body = `
      <form id="formReceta" novalidate>
        <div class="form-grid">
          <div class="form-field full" data-field="nombre">
            <label>Nombre del producto *</label>
            <input type="text" name="nombre" value="${MilaUtils.escapeHtml(receta?.nombre || "")}" placeholder="Ej: Torta de chocolate">
            <span class="field-error">El nombre es obligatorio.</span>
          </div>
          <div class="form-field full" data-field="descripcion">
            <label>Descripción</label>
            <textarea name="descripcion">${MilaUtils.escapeHtml(receta?.descripcion || "")}</textarea>
          </div>
          <div class="form-field" data-field="categoria">
            <label>Categoría</label>
            <input type="text" name="categoria" list="listaCategoriasRec" value="${MilaUtils.escapeHtml(receta?.categoria || "")}" placeholder="Tortas, Galletería…">
            <datalist id="listaCategoriasRec">
              ${[...new Set(MilaDB.Recetas.all().map(r => r.categoria).filter(Boolean))].map(c => `<option value="${MilaUtils.escapeHtml(c)}">`).join("")}
            </datalist>
          </div>
          <div class="form-field" data-field="rendimiento">
            <label>Rendimiento *</label>
            <input type="number" step="0.01" min="0.01" name="rendimiento" value="${receta?.rendimiento ?? 1}">
            <span class="field-error">Ingresá un rendimiento mayor a 0.</span>
          </div>
          <div class="form-field full" data-field="unidadRendimiento">
            <label>Unidad de rendimiento *</label>
            <input type="text" name="unidadRendimiento" value="${MilaUtils.escapeHtml(receta?.unidadRendimiento || "")}" placeholder="Ej: torta, unidades, porciones">
            <span class="hint">Ej: si la receta rinde 12 cookies, poné rendimiento 12 y unidad "unidades".</span>
          </div>
        </div>

        <div class="section-title" style="margin-top:18px">
          <h2 style="font-size:15px">Ingredientes</h2>
        </div>
        <div id="listaIngredientes"></div>
        <button type="button" class="btn btn-outline btn-sm ingredient-add" id="btnAddIngrediente">+ Agregar ingrediente</button>
        <p class="field-error" id="errorIngredientes" style="display:none;margin-top:6px">Agregá al menos un ingrediente válido del inventario.</p>

        <div class="divider-scallop" style="margin-top:20px"></div>
        <div class="form-grid">
          <div class="form-field" data-field="precioVenta">
            <label>Precio de venta (por unidad) *</label>
            <input type="number" step="0.01" min="0" name="precioVenta" value="${receta?.precioVenta ?? ""}">
            <span class="field-error">Ingresá un precio válido.</span>
          </div>
          <div class="form-field">
            <label>Costo estimado / unidad</label>
            <input type="text" id="previewCosto" value="—" disabled>
          </div>
          <div class="form-field">
            <label>Utilidad estimada</label>
            <input type="text" id="previewUtilidad" value="—" disabled>
          </div>
          <div class="form-field">
            <label>Margen estimado</label>
            <input type="text" id="previewMargen" value="—" disabled>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-outline" id="btnCancelarReceta">Cancelar</button>
          <button type="submit" class="btn btn-primary">${editando ? "Guardar cambios" : "Crear receta"}</button>
        </div>
      </form>
    `;

    MilaUtils.openModal(editando ? "Editar receta" : "Nueva receta", body, {
      wide: true,
      onMount: () => {
        ingredienteRowSeq = 0;
        const lista = document.getElementById("listaIngredientes");
        ingredientesIniciales.forEach(ing => lista.appendChild(crearFilaIngrediente(inventario, ing)));

        document.getElementById("btnAddIngrediente").addEventListener("click", () => {
          lista.appendChild(crearFilaIngrediente(inventario, null));
          actualizarPreview();
        });

        document.getElementById("btnCancelarReceta").addEventListener("click", MilaUtils.closeModal);
        document.getElementById("formReceta").addEventListener("submit", (e) => { e.preventDefault(); guardar(e.target, id, inventario); });
        document.getElementById("formReceta").addEventListener("input", actualizarPreview);
        actualizarPreview();
      }
    });
  }

  function crearFilaIngrediente(inventario, valores) {
    const row = document.createElement("div");
    row.className = "ingredient-row";
    row.dataset.rowId = "ing_" + (ingredienteRowSeq++);
    const mpSeleccionada = valores ? inventario.find(m => m.id === valores.materiaPrimaId) : inventario[0];
    row.innerHTML = `
      <div class="form-field">
        ${row.dataset.rowId === "ing_0" ? '<label>Materia prima</label>' : ""}
        <select class="ing-mp">
          ${inventario.map(m => `<option value="${m.id}" data-unidad="${m.unidad}" data-costo="${m.costoUnitario}" ${valores && valores.materiaPrimaId === m.id ? "selected" : ""}>${MilaUtils.escapeHtml(m.nombre)}</option>`).join("")}
        </select>
      </div>
      <div class="form-field">
        ${row.dataset.rowId === "ing_0" ? '<label>Cantidad</label>' : ""}
        <input type="number" class="ing-cantidad" step="0.01" min="0" value="${valores?.cantidad ?? ""}" placeholder="0">
      </div>
      <div class="form-field">
        ${row.dataset.rowId === "ing_0" ? '<label>Unidad</label>' : ""}
        <input type="text" class="ing-unidad" value="${mpSeleccionada?.unidad || ""}" disabled>
      </div>
      <button type="button" class="btn btn-outline btn-icon ing-remove" title="Quitar ingrediente">✕</button>
    `;
    row.querySelector(".ing-mp").addEventListener("change", (e) => {
      const opt = e.target.selectedOptions[0];
      row.querySelector(".ing-unidad").value = opt.dataset.unidad || "";
      actualizarPreview();
    });
    row.querySelector(".ing-remove").addEventListener("click", () => { row.remove(); actualizarPreview(); });
    return row;
  }

  function leerIngredientesForm() {
    const filas = document.querySelectorAll("#listaIngredientes .ingredient-row");
    const ingredientes = [];
    filas.forEach(row => {
      const select = row.querySelector(".ing-mp");
      const cantidad = row.querySelector(".ing-cantidad").value;
      if (select.value && cantidad !== "" && Number(cantidad) > 0) {
        const opt = select.selectedOptions[0];
        ingredientes.push({
          materiaPrimaId: select.value,
          nombreReferencia: opt.textContent.split(" (")[0],
          cantidad: Number(cantidad),
          unidad: opt.dataset.unidad
        });
      }
    });
    return ingredientes;
  }

  function actualizarPreview() {
    const rendimientoInput = document.querySelector('#formReceta [name="rendimiento"]');
    const precioInput = document.querySelector('#formReceta [name="precioVenta"]');
    if (!rendimientoInput) return;

    const rendimiento = Number(rendimientoInput.value) > 0 ? Number(rendimientoInput.value) : 1;
    let costoTotal = 0;
    document.querySelectorAll("#listaIngredientes .ingredient-row").forEach(row => {
      const select = row.querySelector(".ing-mp");
      const cantidad = Number(row.querySelector(".ing-cantidad").value) || 0;
      const opt = select.selectedOptions[0];
      const costoUnitario = opt ? Number(opt.dataset.costo) : 0;
      costoTotal += cantidad * costoUnitario;
    });

    const costoPorUnidad = costoTotal / rendimiento;
    const precioVenta = Number(precioInput.value) || 0;
    const utilidad = precioVenta - costoPorUnidad;
    const margen = precioVenta > 0 ? (utilidad / precioVenta) * 100 : 0;

    document.getElementById("previewCosto").value = MilaUtils.money(costoPorUnidad);
    document.getElementById("previewUtilidad").value = MilaUtils.money(utilidad);
    document.getElementById("previewMargen").value = MilaUtils.pct(margen);
  }

  function guardar(form, id, inventario) {
    const data = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll(".form-field").forEach(f => f.classList.remove("has-error"));
    document.getElementById("errorIngredientes").style.display = "none";

    let valido = true;
    if (!MilaUtils.isRequired(data.nombre)) { marcarError(form, "nombre"); valido = false; }
    if (!MilaUtils.isRequired(data.unidadRendimiento)) { marcarError(form, "unidadRendimiento"); valido = false; }
    if (!MilaUtils.isPositiveNumber(data.rendimiento) || Number(data.rendimiento) <= 0) { marcarError(form, "rendimiento"); valido = false; }
    if (!MilaUtils.isPositiveNumber(data.precioVenta)) { marcarError(form, "precioVenta"); valido = false; }

    const ingredientes = leerIngredientesForm();
    if (ingredientes.length === 0) {
      document.getElementById("errorIngredientes").style.display = "block";
      valido = false;
    }

    if (!valido) return;

    const payload = {
      nombre: data.nombre.trim(),
      descripcion: (data.descripcion || "").trim(),
      categoria: (data.categoria || "").trim(),
      rendimiento: Number(data.rendimiento),
      unidadRendimiento: data.unidadRendimiento.trim(),
      precioVenta: Number(data.precioVenta),
      ingredientes,
      fechaActualizacion: new Date().toISOString()
    };

    if (id) {
      MilaDB.Recetas.update(id, payload);
      MilaUtils.toast("Receta actualizada", "success");
    } else {
      MilaDB.Recetas.create(Object.assign({ id: MilaDB.generateId("rec") }, payload));
      MilaUtils.toast("Receta creada", "success");
    }

    MilaUtils.closeModal();
    render(document.getElementById("content"));
  }

  function marcarError(form, campo) {
    form.querySelector(`[data-field="${campo}"]`).classList.add("has-error");
  }

  function eliminar(id, container) {
    const receta = MilaDB.Recetas.get(id);
    if (!receta) return;
    const pedidosAsociados = MilaDB.Pedidos.all().filter(p => p.recetaId === id);
    if (pedidosAsociados.length > 0) {
      MilaUtils.toast(`No se puede eliminar: hay ${pedidosAsociados.length} pedido(s) que usan esta receta.`, "error");
      return;
    }
    if (!MilaUtils.confirmAction(`¿Eliminar la receta "${receta.nombre}"?`)) return;
    MilaDB.Recetas.remove(id);
    MilaUtils.toast("Receta eliminada", "success");
    render(container);
  }

  return { render };
})();
