/* =========================================================
   MILA · importer.js
   Migrador único e idempotente de LocalStorage a Supabase.
   ========================================================= */

const MilaImporter = (function () {

  async function migrarALaNube() {
    if (!window.supabaseClient) {
      alert("Error: Supabase no está configurado o inicializado.");
      return { ok: false, error: "No Supabase Client" };
    }

    // Permitir migración sin requerir sesión obligatoria
    const { data: sessionData } = await window.supabaseClient.auth.getSession().catch(() => ({ data: {} }));
    const user = sessionData?.session?.user || null;

    let negocioId = null;

    if (user) {
      let { data: miembros } = await window.supabaseClient
        .from("miembros")
        .select("negocio_id")
        .eq("user_id", user.id)
        .limit(1);

      negocioId = miembros && miembros.length > 0 ? miembros[0].negocio_id : null;
    }

    if (!negocioId) {
      // Buscar o crear negocio predeterminado
      const { data: negs } = await window.supabaseClient
        .from("negocios")
        .select("id")
        .limit(1);

      if (negs && negs.length > 0) {
        negocioId = negs[0].id;
      } else {
        const { data: neg, error: negErr } = await window.supabaseClient
          .from("negocios")
          .insert({ nombre: "Mila · Obrador Artesanal", tipo_negocio: "reposteria" })
          .select()
          .single();

        if (neg && !negErr) {
          negocioId = neg.id;
          if (user) {
            await window.supabaseClient.from("miembros").insert({
              user_id: user.id,
              negocio_id: negocioId,
              rol: "owner"
            });
          }
        }
      }
    }

    // 2. Leer LocalStorage
    const localMP = JSON.parse(localStorage.getItem("mila_inventario") || "[]");
    const localRec = JSON.parse(localStorage.getItem("mila_recetas") || "[]");
    const localCli = JSON.parse(localStorage.getItem("mila_clientes") || "[]");
    const localPed = JSON.parse(localStorage.getItem("mila_pedidos") || "[]");
    const localMov = JSON.parse(localStorage.getItem("mila_movimientos") || "[]");

    const idMap = new Map(); // localId -> uuid
    const getUuid = oldId => {
      if (!oldId) return null;
      if (!idMap.has(oldId)) {
        idMap.set(oldId, window.crypto.randomUUID());
      }
      return idMap.get(oldId);
    };

    let countMP = 0, countRec = 0, countCli = 0, countPed = 0, countMov = 0;

    // 3. Migrar Materias Primas
    if (localMP.length > 0) {
      const rows = localMP.map(m => ({
        id: getUuid(m.id),
        negocio_id: negocioId,
        nombre: m.nombre,
        categoria: m.categoria || "Insumo",
        stock_actual: Number(m.stockActual) || 0,
        stock_minimo: Number(m.stockMinimo) || 0,
        costo_unitario: Number(m.costoUnitario) || 0,
        unidad: m.unidad || "g",
        proveedor: m.proveedor || null
      }));
      const { error } = await window.supabaseClient.from("materias_primas").upsert(rows, { onConflict: "id" });
      if (!error) countMP = rows.length;
    }

    // 4. Migrar Recetas e Ingredientes
    for (const r of localRec) {
      const recUuid = getUuid(r.id);
      const recRow = {
        id: recUuid,
        negocio_id: negocioId,
        nombre: r.nombre,
        categoria: r.categoria || "Tortas",
        rendimiento: Number(r.rendimiento) || 1,
        unidad_rendimiento: r.unidadRendimiento || "porciones",
        precio_venta: Number(r.precioVenta) || 0,
        instrucciones: r.descripcion || r.instrucciones || ""
      };

      const { error: rErr } = await window.supabaseClient.from("recetas").upsert(recRow, { onConflict: "id" });
      if (!rErr) {
        countRec++;
        if (Array.isArray(r.ingredientes) && r.ingredientes.length > 0) {
          const ingRows = r.ingredientes.map(ing => ({
            receta_id: recUuid,
            materia_prima_id: getUuid(ing.materiaPrimaId),
            cantidad: Number(ing.cantidad) || 0,
            unidad: ing.unidad || "g"
          })).filter(i => i.materia_prima_id);

          if (ingRows.length > 0) {
            await window.supabaseClient.from("receta_ingredientes").delete().eq("receta_id", recUuid);
            await window.supabaseClient.from("receta_ingredientes").insert(ingRows);
          }
        }
      }
    }

    // 5. Migrar Clientes
    if (localCli.length > 0) {
      const rows = localCli.map(c => ({
        id: getUuid(c.id),
        negocio_id: negocioId,
        nombre: `${c.nombre} ${c.apellido || ""}`.trim(),
        telefono: c.telefono || null,
        email: c.email || null,
        direccion: c.direccion || null,
        notas: c.notas || null
      }));
      const { error } = await window.supabaseClient.from("clientes").upsert(rows, { onConflict: "id" });
      if (!error) countCli = rows.length;
    }

    // 6. Migrar Pedidos
    if (localPed.length > 0) {
      const rows = localPed.map(p => ({
        id: getUuid(p.id),
        negocio_id: negocioId,
        cliente_id: getUuid(p.clienteId),
        receta_id: getUuid(p.recetaId),
        cantidad: Number(p.cantidad) || 1,
        precio_unitario: Number(p.precioUnitario) || 0,
        total: Number(p.total) || 0,
        costo_produccion: Number(p.costoProduccion) || 0,
        utilidad: Number(p.utilidad) || 0,
        estado: p.estado || "Pendiente",
        fecha_pedido: p.fechaPedido ? new Date(p.fechaPedido).toISOString() : new Date().toISOString(),
        fecha_entrega: p.fechaEntrega ? new Date(p.fechaEntrega).toISOString() : new Date().toISOString(),
        fecha_entregado: p.fechaEntregado ? new Date(p.fechaEntregado).toISOString() : null,
        stock_descontado: !!p.stockDescontado,
        eliminado_en: p.eliminadoEn ? new Date(p.eliminadoEn).toISOString() : null,
        observaciones: p.observaciones || null
      })).filter(p => p.receta_id);

      if (rows.length > 0) {
        const { error } = await window.supabaseClient.from("pedidos").upsert(rows, { onConflict: "id" });
        if (!error) countPed = rows.length;
      }
    }

    // 7. Migrar Movimientos
    if (localMov.length > 0) {
      const rows = localMov.map(m => ({
        id: getUuid(m.id),
        negocio_id: negocioId,
        materia_prima_id: getUuid(m.materiaPrimaId),
        tipo: m.tipo || "salida",
        cantidad: Number(m.cantidad) || 0,
        motivo: m.motivo || "Migración local",
        pedido_id: getUuid(m.referenciaPedidoId)
      })).filter(m => m.materia_prima_id);

      if (rows.length > 0) {
        const { error } = await window.supabaseClient.from("movimientos_stock").upsert(rows, { onConflict: "id" });
        if (!error) countMov = rows.length;
      }
    }

    const summary = `✅ ¡Migración completada exitosamente!
• Materias primas: ${countMP}
• Recetas: ${countRec}
• Clientes: ${countCli}
• Pedidos: ${countPed}
• Movimientos: ${countMov}`;

    alert(summary);
    return { ok: true, summary, counts: { countMP, countRec, countCli, countPed, countMov } };
  }

  return {
    migrarALaNube
  };
})();
