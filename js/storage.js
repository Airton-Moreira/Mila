/* =========================================================
   MILA · storage.js
   Capa de repositorio asíncrona sobre Supabase con fallback a LocalStorage.
   Soporta traducción transparente camelCase <-> snake_case.
   ========================================================= */

const MilaDB = (function () {

  const KEYS = {
    CLIENTES:     "mila_clientes",
    PEDIDOS:      "mila_pedidos",
    RECETAS:      "mila_recetas",
    INVENTARIO:   "mila_inventario",
    MOVIMIENTOS:  "mila_movimientos",
    CONFIG:       "mila_config",
    CHAT_HISTORY: "mila_chat_history"
  };

  /* ---------- Helpers de formato camelCase <-> snake_case ---------- */

  function isSupabaseAvailable() {
    return (window.supabaseClient && typeof window.supabaseClient.from === "function");
  }

  function generateId(prefix) {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    const rnd = Math.random().toString(36).slice(2, 7);
    return `${prefix}_${Date.now().toString(36)}${rnd}`;
  }

  function _toCamel(obj) {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(_toCamel);
    const newObj = {};
    for (const key of Object.keys(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      newObj[camelKey] = obj[key];
    }
    return newObj;
  }

  function _toSnake(obj) {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(_toSnake);
    const newObj = {};
    for (const key of Object.keys(obj)) {
      const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      newObj[snakeKey] = obj[key];
    }
    return newObj;
  }

  /* ---------- Núcleo LocalStorage (Fallback) ---------- */

  function _localGet(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("MilaDB LocalStorage error leyendo " + key, e);
      return [];
    }
  }

  function _localSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("MilaDB LocalStorage error guardando " + key, e);
      return false;
    }
  }

  /* ---------- Métodos Asíncronos Genéricos ---------- */

  async function getAll(entity) {
    const key = KEYS[entity.toUpperCase()];
    if (isSupabaseAvailable()) {
      try {
        const tableMap = {
          clientes: "clientes",
          inventario: "materias_primas",
          recetas: "recetas",
          pedidos: "pedidos",
          movimientos: "movimientos_stock"
        };
        const tableName = tableMap[entity];
        if (tableName) {
          let query = window.supabaseClient.from(tableName).select("*");
          if (entity === "recetas") {
            query = window.supabaseClient.from("recetas").select("*, receta_ingredientes(*, materias_primas(*))");
          }
          const { data, error } = await query;
          if (!error && Array.isArray(data) && data.length > 0) {
            if (entity === "recetas") {
              return data.map(r => {
                const rec = _toCamel(r);
                rec.ingredientes = (r.receta_ingredientes || []).map(ri => ({
                  materiaPrimaId: ri.materia_prima_id,
                  nombreReferencia: ri.materias_primas?.nombre || "Ingrediente",
                  cantidad: Number(ri.cantidad),
                  unidad: ri.unidad
                }));
                return rec;
              });
            }
            return _toCamel(data);
          }
        }
      } catch (err) {
        console.warn(`Supabase fetch failed for ${entity}, falling back to LocalStorage`, err);
      }
    }
    return _localGet(key) || [];
  }

  async function getById(entity, id) {
    const list = await getAll(entity);
    return list.find(item => item.id === id) || null;
  }

  async function insert(entity, obj) {
    const key = KEYS[entity.toUpperCase()];
    if (!obj.id) obj.id = generateId(entity.slice(0, 3));

    if (isSupabaseAvailable()) {
      try {
        const tableMap = {
          clientes: "clientes",
          inventario: "materias_primas",
          recetas: "recetas",
          pedidos: "pedidos",
          movimientos: "movimientos_stock"
        };
        const tableName = tableMap[entity];
        if (tableName) {
          const payload = _toSnake(obj);
          delete payload.negocio_id;

          if (entity === "recetas" && obj.ingredientes) {
            delete payload.ingredientes;
            const { data: recData, error: recErr } = await window.supabaseClient
              .from("recetas")
              .insert(payload)
              .select()
              .single();

            if (!recErr && recData) {
              const ingRows = (obj.ingredientes || []).map(ing => ({
                receta_id: recData.id,
                materia_prima_id: ing.materiaPrimaId,
                cantidad: ing.cantidad,
                unidad: ing.unidad
              }));
              if (ingRows.length > 0) {
                await window.supabaseClient.from("receta_ingredientes").insert(ingRows);
              }
              return await getById("recetas", recData.id);
            }
          } else {
            const { data, error } = await window.supabaseClient
              .from(tableName)
              .insert(payload)
              .select()
              .single();

            if (!error && data) {
              return _toCamel(data);
            }
          }
        }
      } catch (err) {
        console.warn(`Supabase insert failed for ${entity}, using LocalStorage`, err);
      }
    }

    const arr = _localGet(key);
    arr.push(obj);
    _localSet(key, arr);
    return obj;
  }

  async function update(entity, id, patch) {
    const key = KEYS[entity.toUpperCase()];
    if (isSupabaseAvailable()) {
      try {
        const tableMap = {
          clientes: "clientes",
          inventario: "materias_primas",
          recetas: "recetas",
          pedidos: "pedidos",
          movimientos: "movimientos_stock"
        };
        const tableName = tableMap[entity];
        if (tableName) {
          const payload = _toSnake(patch);
          const { data, error } = await window.supabaseClient
            .from(tableName)
            .update(payload)
            .eq("id", id)
            .select()
            .single();

          if (!error && data) {
            return _toCamel(data);
          }
        }
      } catch (err) {
        console.warn(`Supabase update failed for ${entity}, using LocalStorage`, err);
      }
    }

    const arr = _localGet(key);
    const idx = arr.findIndex(item => item.id === id);
    if (idx === -1) return null;
    arr[idx] = Object.assign({}, arr[idx], patch);
    _localSet(key, arr);
    return arr[idx];
  }

  async function remove(entity, id) {
    const key = KEYS[entity.toUpperCase()];
    if (isSupabaseAvailable()) {
      try {
        const tableMap = {
          clientes: "clientes",
          inventario: "materias_primas",
          recetas: "recetas",
          pedidos: "pedidos",
          movimientos: "movimientos_stock"
        };
        const tableName = tableMap[entity];
        if (tableName) {
          const { error } = await window.supabaseClient
            .from(tableName)
            .delete()
            .eq("id", id);
          if (!error) return true;
        }
      } catch (err) {
        console.warn(`Supabase delete failed for ${entity}, using LocalStorage`, err);
      }
    }

    const arr = _localGet(key);
    const next = arr.filter(item => item.id !== id);
    _localSet(key, next);
    return next.length !== arr.length;
  }

  /* ---------- Interfaces de Entidad ---------- */

  const Clientes = {
    all: () => getAll("clientes"),
    get: id => getById("clientes", id),
    create: data => insert("clientes", data),
    update: (id, patch) => update("clientes", id, patch),
    remove: id => remove("clientes", id)
  };

  const Inventario = {
    all: () => getAll("inventario"),
    get: id => getById("inventario", id),
    create: data => insert("inventario", data),
    update: (id, patch) => update("inventario", id, patch),
    remove: id => remove("inventario", id)
  };

  const Recetas = {
    all: () => getAll("recetas"),
    get: id => getById("recetas", id),
    create: data => insert("recetas", data),
    update: (id, patch) => update("recetas", id, patch),
    remove: id => remove("recetas", id)
  };

  async function limpiarPapeleraExpirada(dias = DIAS_RETENCION_PAPELERA) {
    const todos = await getAll("pedidos");
    const ahora = Date.now();
    const limiteMs = dias * 24 * 60 * 60 * 1000;
    const expirados = todos.filter(p => {
      if (!p.eliminadoEn) return false;
      const fechaElim = new Date(p.eliminadoEn).getTime();
      return !isNaN(fechaElim) && (ahora - fechaElim) > limiteMs;
    });
    for (const exp of expirados) {
      await remove("pedidos", exp.id);
    }
  }

  const Pedidos = {
    all: () => getAll("pedidos"),
    get: id => getById("pedidos", id),
    create: data => insert("pedidos", data),
    update: (id, patch) => update("pedidos", id, patch),
    remove: id => remove("pedidos", id)
  };

  const Movimientos = {
    all: () => getAll("movimientos"),
    create: data => insert("movimientos", data)
  };

  /* ---------- Cálculos de negocio ---------- */

  async function calcularCostoReceta(receta) {
    const inventario = await Inventario.all();
    let costoTotal = 0;
    let ingredientesDetalle = [];
    let faltantes = [];

    (receta.ingredientes || []).forEach(ing => {
      const mp = inventario.find(m => m.id === ing.materiaPrimaId);
      if (!mp) {
        faltantes.push(ing.nombreReferencia || "materia prima eliminada");
        return;
      }
      const costoIngrediente = (Number(ing.cantidad) || 0) * (Number(mp.costoUnitario) || 0);
      costoTotal += costoIngrediente;
      ingredientesDetalle.push({
        materiaPrimaId: mp.id,
        nombre: mp.nombre,
        cantidad: Number(ing.cantidad) || 0,
        unidad: ing.unidad || mp.unidad,
        costoUnitario: Number(mp.costoUnitario) || 0,
        costoIngrediente
      });
    });

    const rendimiento = Number(receta.rendimiento) > 0 ? Number(receta.rendimiento) : 1;
    const costoPorUnidad = costoTotal / rendimiento;
    const precioVenta = Number(receta.precioVenta) || 0;
    const utilidad = precioVenta - costoPorUnidad;
    const margen = precioVenta > 0 ? (utilidad / precioVenta) * 100 : 0;

    return {
      costoTotal,
      costoPorUnidad,
      precioVenta,
      utilidad,
      margen,
      ingredientesDetalle,
      faltantes
    };
  }

  async function verificarStockParaPedido(receta, cantidadProducto) {
    const inventario = await Inventario.all();
    const rendimiento = Number(receta.rendimiento) > 0 ? Number(receta.rendimiento) : 1;
    const factor = (Number(cantidadProducto) || 0) / rendimiento;
    const faltantes = [];

    (receta.ingredientes || []).forEach(ing => {
      const mp = inventario.find(m => m.id === ing.materiaPrimaId);
      const necesario = (Number(ing.cantidad) || 0) * factor;
      if (!mp) {
        faltantes.push({ nombre: ing.nombreReferencia || "Ingrediente eliminado", necesario, disponible: 0, unidad: ing.unidad || "" });
        return;
      }
      if (Number(mp.stockActual) < necesario) {
        faltantes.push({ nombre: mp.nombre, necesario, disponible: Number(mp.stockActual), unidad: mp.unidad });
      }
    });

    return { ok: faltantes.length === 0, faltantes, factor };
  }

  async function descontarStockPorPedido(receta, cantidadProducto, pedidoId) {
    if (isSupabaseAvailable()) {
      try {
        const { error } = await window.supabaseClient.rpc("descontar_stock_pedido", { p_pedido_id: pedidoId });
        if (!error) return;
      } catch (e) {
        console.warn("RPC descontar_stock_pedido fallo, usando logica cliente", e);
      }
    }

    const rendimiento = Number(receta.rendimiento) > 0 ? Number(receta.rendimiento) : 1;
    const factor = (Number(cantidadProducto) || 0) / rendimiento;

    for (const ing of (receta.ingredientes || [])) {
      const mp = await Inventario.get(ing.materiaPrimaId);
      if (!mp) continue;
      const necesario = (Number(ing.cantidad) || 0) * factor;
      const nuevoStock = Math.max(0, Number(mp.stockActual) - necesario);

      await Inventario.update(mp.id, {
        stockActual: nuevoStock,
        fechaActualizacion: new Date().toISOString()
      });

      await Movimientos.create({
        id: generateId("mov"),
        materiaPrimaId: mp.id,
        materiaPrimaNombre: mp.nombre,
        tipo: "salida",
        cantidad: necesario,
        unidad: mp.unidad,
        motivo: "Descuento automático por pedido entregado",
        referenciaPedidoId: pedidoId,
        fecha: new Date().toISOString()
      });
    }
  }

  async function nombreCliente(clienteId) {
    const c = await Clientes.get(clienteId);
    return c ? `${c.nombre} ${c.apellido || ""}`.trim() : "Cliente eliminado";
  }

  async function nombreReceta(recetaId) {
    const r = await Recetas.get(recetaId);
    return r ? r.nombre : "Producto eliminado";
  }

  function seedIfEmpty() {
    const yaInicializado = localStorage.getItem(KEYS.CONFIG);
    if (yaInicializado) return;

    const now = new Date();
    const iso = d => d.toISOString();
    const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
    const dateStr = d => d.toISOString().slice(0, 10);

    const mp = [
      { id: generateId("mp"), nombre: "Harina 0000",        categoria: "Secos",    unidad: "g",  stockActual: 4200, stockMinimo: 1500, costoUnitario: 1.4,  proveedor: "Molino San José",  fechaActualizacion: iso(now) },
      { id: generateId("mp"), nombre: "Azúcar",              categoria: "Secos",    unidad: "g",  stockActual: 3600, stockMinimo: 1200, costoUnitario: 1.1,  proveedor: "Distribuidora Sur", fechaActualizacion: iso(now) },
      { id: generateId("mp"), nombre: "Chocolate cobertura",  categoria: "Secos",    unidad: "g",  stockActual: 900,  stockMinimo: 600,  costoUnitario: 8.5,  proveedor: "Cacao & Cía",       fechaActualizacion: iso(now) },
      { id: generateId("mp"), nombre: "Manteca",              categoria: "Lácteos",  unidad: "g",  stockActual: 700,  stockMinimo: 500,  costoUnitario: 6.2,  proveedor: "Tambo La Aurora",   fechaActualizacion: iso(now) },
      { id: generateId("mp"), nombre: "Huevos",               categoria: "Frescos",  unidad: "unidad", stockActual: 48, stockMinimo: 24, costoUnitario: 180, proveedor: "Granja El Nido",    fechaActualizacion: iso(now) },
      { id: generateId("mp"), nombre: "Dulce de leche",       categoria: "Lácteos",  unidad: "g",  stockActual: 1800, stockMinimo: 500,  costoUnitario: 2.8,  proveedor: "Tambo La Aurora",   fechaActualizacion: iso(now) },
      { id: generateId("mp"), nombre: "Crema de leche",       categoria: "Lácteos",  unidad: "ml", stockActual: 800,  stockMinimo: 400,  costoUnitario: 3.6,  proveedor: "Tambo La Aurora",   fechaActualizacion: iso(now) },
      { id: generateId("mp"), nombre: "Esencia de vainilla",  categoria: "Secos",    unidad: "ml", stockActual: 150,  stockMinimo: 60,   costoUnitario: 9,    proveedor: "Distribuidora Sur", fechaActualizacion: iso(now) },
      { id: generateId("mp"), nombre: "Envases x unidad",     categoria: "Packaging", unidad: "unidad", stockActual: 35, stockMinimo: 20, costoUnitario: 260, proveedor: "Pack Express",      fechaActualizacion: iso(now) }
    ];
    _localSet(KEYS.INVENTARIO, mp);

    const idHarina = mp[0].id, idAzucar = mp[1].id, idChoco = mp[2].id, idManteca = mp[3].id, idHuevos = mp[4].id;

    const recetas = [
      {
        id: generateId("rec"),
        nombre: "Torta de chocolate",
        descripcion: "Bizcochuelo húmedo de cacao con ganache.",
        categoria: "Tortas",
        rendimiento: 1,
        unidadRendimiento: "torta (8 porciones)",
        precioVenta: 14000,
        ingredientes: [
          { materiaPrimaId: idHarina,  nombreReferencia: "Harina 0000",       cantidad: 500, unidad: "g" },
          { materiaPrimaId: idAzucar,  nombreReferencia: "Azúcar",             cantidad: 300, unidad: "g" },
          { materiaPrimaId: idChoco,   nombreReferencia: "Chocolate cobertura", cantidad: 200, unidad: "g" },
          { materiaPrimaId: idHuevos,  nombreReferencia: "Huevos",             cantidad: 4,   unidad: "unidad" },
          { materiaPrimaId: idManteca, nombreReferencia: "Manteca",            cantidad: 150, unidad: "g" }
        ],
        fechaActualizacion: iso(now)
      },
      {
        id: generateId("rec"),
        nombre: "Cookies con chips de chocolate",
        descripcion: "Docena de cookies masa madre mantecosa.",
        categoria: "Galletería",
        rendimiento: 12,
        unidadRendimiento: "unidades",
        precioVenta: 950,
        ingredientes: [
          { materiaPrimaId: idHarina,  nombreReferencia: "Harina 0000",       cantidad: 400, unidad: "g" },
          { materiaPrimaId: idAzucar,  nombreReferencia: "Azúcar",             cantidad: 220, unidad: "g" },
          { materiaPrimaId: idManteca, nombreReferencia: "Manteca",            cantidad: 200, unidad: "g" },
          { materiaPrimaId: idChoco,   nombreReferencia: "Chocolate cobertura", cantidad: 180, unidad: "g" },
          { materiaPrimaId: idHuevos,  nombreReferencia: "Huevos",             cantidad: 1,   unidad: "unidad" }
        ],
        fechaActualizacion: iso(now)
      }
    ];
    _localSet(KEYS.RECETAS, recetas);

    const clientes = [
      { id: generateId("cli"), nombre: "Lucía", apellido: "Fernández", telefono: "351 555-1023", email: "lucia.fernandez@mail.com", direccion: "San Martín 452, Villa Giardino", notas: "Prefiere retirar por el local.", fechaRegistro: iso(inDays(-40)) },
      { id: generateId("cli"), nombre: "Martín", apellido: "Ibáñez", telefono: "351 555-8890", email: "martin.ibanez@mail.com", direccion: "Belgrano 120, La Falda", notas: "Alérgico a frutos secos.", fechaRegistro: iso(inDays(-12)) }
    ];
    _localSet(KEYS.CLIENTES, clientes);

    _localSet(KEYS.CONFIG, { inicializado: true, version: 1, fechaInicio: iso(now) });
  }

  return {
    KEYS,
    generateId,
    getAll, getById, insert, update, remove,
    Clientes, Inventario, Recetas, Pedidos, Movimientos,
    calcularCostoReceta, verificarStockParaPedido, descontarStockPorPedido,
    nombreCliente, nombreReceta,
    seedIfEmpty
  };
})();
