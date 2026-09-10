/* =========================================================
   MILA · storage.js
   Capa de persistencia sobre LocalStorage.
   Ningún otro módulo debe tocar localStorage directamente:
   todos pasan por MilaDB para mantener una única fuente de verdad.
   ========================================================= */

const MilaDB = (function () {

  const KEYS = {
    CLIENTES:     "mila_clientes",
    PEDIDOS:      "mila_pedidos",
    RECETAS:      "mila_recetas",
    INVENTARIO:   "mila_inventario",
    MOVIMIENTOS:  "mila_movimientos",
    CONFIG:       "mila_config"
  };

  /* ---------- núcleo genérico ---------- */

  function _get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("MilaDB: error leyendo " + key, e);
      return [];
    }
  }

  function _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("MilaDB: error guardando " + key, e);
      return false;
    }
  }

  function generateId(prefix) {
    const rnd = Math.random().toString(36).slice(2, 7);
    return `${prefix}_${Date.now().toString(36)}${rnd}`;
  }

  /* ---------- colecciones ---------- */

  function getAll(entity) {
    return _get(KEYS[entity.toUpperCase()]) || [];
  }

  function saveAll(entity, arr) {
    return _set(KEYS[entity.toUpperCase()], arr);
  }

  function getById(entity, id) {
    return getAll(entity).find(item => item.id === id) || null;
  }

  function insert(entity, obj) {
    const arr = getAll(entity);
    arr.push(obj);
    saveAll(entity, arr);
    return obj;
  }

  function update(entity, id, patch) {
    const arr = getAll(entity);
    const idx = arr.findIndex(item => item.id === id);
    if (idx === -1) return null;
    arr[idx] = Object.assign({}, arr[idx], patch);
    saveAll(entity, arr);
    return arr[idx];
  }

  function remove(entity, id) {
    const arr = getAll(entity);
    const next = arr.filter(item => item.id !== id);
    saveAll(entity, next);
    return next.length !== arr.length;
  }

  /* ---------- accesos directos por entidad ---------- */

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

  /* ---------- cálculos de negocio compartidos ---------- */

  // Costo y rentabilidad de una receta, en base a precios ACTUALES del inventario.
  function calcularCostoReceta(receta) {
    const inventario = Inventario.all();
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

  // Verifica si hay stock suficiente para producir `cantidadProducto` unidades
  // del producto de una receta. Devuelve { ok, faltantes:[{nombre, necesario, disponible, unidad}] }
  function verificarStockParaPedido(receta, cantidadProducto) {
    const inventario = Inventario.all();
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

  // Descuenta del inventario los ingredientes de una receta para `cantidadProducto`
  // unidades, y registra el movimiento. Debe llamarse UNA sola vez por pedido.
  function descontarStockPorPedido(receta, cantidadProducto, pedidoId) {
    const rendimiento = Number(receta.rendimiento) > 0 ? Number(receta.rendimiento) : 1;
    const factor = (Number(cantidadProducto) || 0) / rendimiento;

    (receta.ingredientes || []).forEach(ing => {
      const mp = Inventario.get(ing.materiaPrimaId);
      if (!mp) return;
      const necesario = (Number(ing.cantidad) || 0) * factor;
      const nuevoStock = Math.max(0, Number(mp.stockActual) - necesario);

      Inventario.update(mp.id, {
        stockActual: nuevoStock,
        fechaActualizacion: new Date().toISOString()
      });

      Movimientos.create({
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
    });
  }

  function nombreCliente(clienteId) {
    const c = Clientes.get(clienteId);
    return c ? `${c.nombre} ${c.apellido || ""}`.trim() : "Cliente eliminado";
  }

  function nombreReceta(recetaId) {
    const r = Recetas.get(recetaId);
    return r ? r.nombre : "Producto eliminado";
  }

  /* ---------- seed inicial (datos de ejemplo editables) ---------- */

  function seedIfEmpty() {
    const yaInicializado = localStorage.getItem(KEYS.CONFIG);
    if (yaInicializado) return;

    const now = new Date();
    const iso = d => d.toISOString();
    const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
    const dateStr = d => d.toISOString().slice(0, 10);

    // --- Materias primas ---
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
    saveAll("inventario", mp);

    const idHarina = mp[0].id, idAzucar = mp[1].id, idChoco = mp[2].id, idManteca = mp[3].id, idHuevos = mp[4].id;

    // --- Recetas ---
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
    saveAll("recetas", recetas);

    // --- Clientes ---
    const clientes = [
      { id: generateId("cli"), nombre: "Lucía", apellido: "Fernández", telefono: "351 555-1023", email: "lucia.fernandez@mail.com", direccion: "San Martín 452, Villa Giardino", notas: "Prefiere retirar por el local.", fechaRegistro: iso(inDays(-40)) },
      { id: generateId("cli"), nombre: "Martín", apellido: "Ibáñez", telefono: "351 555-8890", email: "martin.ibanez@mail.com", direccion: "Belgrano 120, La Falda", notas: "Alérgico a frutos secos.", fechaRegistro: iso(inDays(-12)) }
    ];
    saveAll("clientes", clientes);

    // --- Pedidos de ejemplo ---
    const recetaTorta = recetas[0];
    const recetaCookies = recetas[1];
    const costoTorta = calcularCostoReceta(recetaTorta);
    const costoCookies = calcularCostoReceta(recetaCookies);

    const pedidos = [
      {
        id: generateId("ped"),
        clienteId: clientes[0].id,
        recetaId: recetaTorta.id,
        cantidad: 1,
        fechaPedido: dateStr(inDays(-3)),
        fechaEntrega: dateStr(inDays(2)),
        horaEntrega: "17:00",
        estado: "Confirmado",
        precioUnitario: recetaTorta.precioVenta,
        total: recetaTorta.precioVenta * 1,
        costoProduccion: costoTorta.costoPorUnidad * 1,
        utilidad: (recetaTorta.precioVenta - costoTorta.costoPorUnidad) * 1,
        observaciones: "Escribir 'Feliz cumple Sole' en chocolate.",
        stockDescontado: false,
        fechaEntregado: null
      },
      {
        id: generateId("ped"),
        clienteId: clientes[1].id,
        recetaId: recetaCookies.id,
        cantidad: 24,
        fechaPedido: dateStr(inDays(-6)),
        fechaEntrega: dateStr(inDays(-1)),
        horaEntrega: "10:30",
        estado: "Entregado",
        precioUnitario: recetaCookies.precioVenta,
        total: recetaCookies.precioVenta * 24,
        costoProduccion: costoCookies.costoPorUnidad * 24,
        utilidad: (recetaCookies.precioVenta - costoCookies.costoPorUnidad) * 24,
        observaciones: "",
        stockDescontado: true,
        fechaEntregado: iso(inDays(-1))
      },
      {
        id: generateId("ped"),
        clienteId: clientes[0].id,
        recetaId: recetaCookies.id,
        cantidad: 12,
        fechaPedido: dateStr(inDays(-1)),
        fechaEntrega: dateStr(inDays(5)),
        horaEntrega: "16:00",
        estado: "Pendiente",
        precioUnitario: recetaCookies.precioVenta,
        total: recetaCookies.precioVenta * 12,
        costoProduccion: costoCookies.costoPorUnidad * 12,
        utilidad: (recetaCookies.precioVenta - costoCookies.costoPorUnidad) * 12,
        observaciones: "Sin nueces.",
        stockDescontado: false,
        fechaEntregado: null
      }
    ];
    saveAll("pedidos", pedidos);

    // Movimiento correspondiente al pedido ya entregado (para el historial)
    const factorCookiesEntregadas = 24 / recetaCookies.rendimiento;
    const movimientos = recetaCookies.ingredientes.map(ing => ({
      id: generateId("mov"),
      materiaPrimaId: ing.materiaPrimaId,
      materiaPrimaNombre: ing.nombreReferencia,
      tipo: "salida",
      cantidad: ing.cantidad * factorCookiesEntregadas,
      unidad: ing.unidad,
      motivo: "Descuento automático por pedido entregado",
      referenciaPedidoId: pedidos[1].id,
      fecha: iso(inDays(-1))
    }));
    saveAll("movimientos", movimientos);

    _set(KEYS.CONFIG, { inicializado: true, version: 1, fechaInicio: iso(now) });
  }

  return {
    KEYS,
    generateId,
    getAll, saveAll, getById, insert, update, remove,
    Clientes, Inventario, Recetas, Pedidos, Movimientos,
    calcularCostoReceta, verificarStockParaPedido, descontarStockPorPedido,
    nombreCliente, nombreReceta,
    seedIfEmpty
  };
})();
