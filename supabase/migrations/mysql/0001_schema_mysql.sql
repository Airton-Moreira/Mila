-- MIGRATION 0001: TABLAS BASE E INDICES
-- Proyecto: Mila · Gestión & Obrador

--  Herramienta que proporciona funciones para generar Identificadores Únicos Universales
-- Ideal para claves primarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. NEGOCIOS Y MIEMBROS
CREATE TABLE IF NOT EXISTS negocios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    tipo_negocio TEXT NOT NULL DEFAULT 'reposteria',
    timezone TEXT NOT NULL DEFAULT 'America/Argentina/Cordoba',
    moneda TEXT NOT NULL DEFAULT 'ARS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CLIENTES
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    telefono TEXT,
    email TEXT,
    direccion TEXT,
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. MATERIAS PRIMAS (INVENTARIO)
CREATE TABLE IF NOT EXISTS materias_primas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    categoria TEXT DEFAULT 'Insumo',
    stock_actual NUMERIC(14,3) NOT NULL DEFAULT 0,
    stock_minimo NUMERIC(14,3) NOT NULL DEFAULT 0,
    costo_unitario NUMERIC(14,2) NOT NULL DEFAULT 0,
    unidad TEXT NOT NULL DEFAULT 'g',
    proveedor TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. RECETAS E INGREDIENTES
CREATE TABLE IF NOT EXISTS recetas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'Tortas',
    rendimiento NUMERIC(14,2) NOT NULL DEFAULT 1,
    unidad_rendimiento TEXT NOT NULL DEFAULT 'porciones',
    precio_venta NUMERIC(14,2) NOT NULL DEFAULT 0,
    instrucciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receta_ingredientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receta_id UUID NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
    materia_prima_id UUID NOT NULL REFERENCES materias_primas(id) ON DELETE CASCADE,
    cantidad NUMERIC(14,3) NOT NULL,
    unidad TEXT NOT NULL
);

-- 5. PEDIDOS
CREATE TABLE IF NOT EXISTS pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    receta_id UUID REFERENCES recetas(id) ON DELETE RESTRICT,
    cantidad NUMERIC(14,2) NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(14,2) NOT NULL,
    total NUMERIC(14,2) NOT NULL,
    costo_produccion NUMERIC(14,2) NOT NULL DEFAULT 0,
    utilidad NUMERIC(14,2) NOT NULL DEFAULT 0,
    estado TEXT NOT NULL CHECK (estado IN ('Pendiente', 'Confirmado', 'En Preparacion', 'Listo', 'Entregado', 'Cancelado')),
    fecha_pedido TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_entrega TIMESTAMPTZ NOT NULL,
    fecha_entregado TIMESTAMPTZ,
    stock_descontado BOOLEAN NOT NULL DEFAULT FALSE,
    observaciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. MOVIMIENTOS DE STOCK
CREATE TABLE IF NOT EXISTS movimientos_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    materia_prima_id UUID NOT NULL REFERENCES materias_primas(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
    cantidad NUMERIC(14,3) NOT NULL,
    motivo TEXT,
    pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. COMPRAS (REGISTRO DE INSUMOS)
CREATE TABLE IF NOT EXISTS compras (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    materia_prima_id UUID NOT NULL REFERENCES materias_primas(id) ON DELETE CASCADE,
    proveedor TEXT,
    cantidad NUMERIC(14,3) NOT NULL,
    unidad TEXT NOT NULL,
    costo_total NUMERIC(14,2) NOT NULL,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. GASTOS FIJOS
CREATE TABLE IF NOT EXISTS gastos_fijos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    concepto TEXT NOT NULL,
    monto NUMERIC(14,2) NOT NULL,
    periodicidad TEXT NOT NULL DEFAULT 'mensual',
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDICES DE OPTIMIZACION
CREATE INDEX IF NOT EXISTS idx_pedidos_negocio_fecha ON pedidos(negocio_id, fecha_entregado, estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_negocio_estado ON pedidos(negocio_id, estado);
CREATE INDEX IF NOT EXISTS idx_compras_negocio_fecha ON compras(negocio_id, fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_negocio ON movimientos_stock(negocio_id, materia_prima_id);
CREATE INDEX IF NOT EXISTS idx_recetas_negocio ON recetas(negocio_id);
CREATE INDEX IF NOT EXISTS idx_clientes_negocio ON clientes(negocio_id);
CREATE INDEX IF NOT EXISTS idx_materias_primas_negocio ON materias_primas(negocio_id);
