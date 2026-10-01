-- MIGRATION 0002: ROW LEVEL SECURITY (RLS) Y POLITICAS
-- Proyecto: Mila · Gestión & Obrador

-- Helper function to get active negocio_id for current user
CREATE OR REPLACE FUNCTION get_user_negocio_id()
RETURNS UUID STABLE LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT negocio_id FROM miembros WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Helper function to check if user is member of a specific negocio
CREATE OR REPLACE FUNCTION user_is_member_of(target_negocio_id UUID)
RETURNS BOOLEAN STABLE LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM miembros
    WHERE user_id = auth.uid() AND negocio_id = target_negocio_id
  );
$$;

-- 1. HABILITAR RLS
ALTER TABLE negocios ENABLE ROW LEVEL SECURITY;
ALTER TABLE miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE materias_primas ENABLE ROW LEVEL SECURITY;
ALTER TABLE recetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE receta_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos_fijos ENABLE ROW LEVEL SECURITY;

-- 2. POLITICAS NEGOCIOS Y MIEMBROS
DROP POLICY IF EXISTS "Ver propios negocios" ON negocios;
CREATE POLICY "Ver propios negocios" ON negocios
    FOR SELECT USING (user_is_member_of(id));

DROP POLICY IF EXISTS "Ver propios miembros" ON miembros;
CREATE POLICY "Ver propios miembros" ON miembros
    FOR ALL USING (user_id = auth.uid() OR user_is_member_of(negocio_id));

-- 3. POLITICAS CLIENTES
DROP POLICY IF EXISTS "Acceso clientes por negocio" ON clientes;
CREATE POLICY "Acceso clientes por negocio" ON clientes
    FOR ALL USING (user_is_member_of(negocio_id));

-- 4. POLITICAS MATERIAS PRIMAS
DROP POLICY IF EXISTS "Acceso materias_primas por negocio" ON materias_primas;
CREATE POLICY "Acceso materias_primas por negocio" ON materias_primas
    FOR ALL USING (user_is_member_of(negocio_id));

-- 5. POLITICAS RECETAS Y RECETA INGREDIENTES
DROP POLICY IF EXISTS "Acceso recetas por negocio" ON recetas;
CREATE POLICY "Acceso recetas por negocio" ON recetas
    FOR ALL USING (user_is_member_of(negocio_id));

DROP POLICY IF EXISTS "Acceso receta_ingredientes por negocio" ON receta_ingredientes;
CREATE POLICY "Acceso receta_ingredientes por negocio" ON receta_ingredientes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM recetas r
            WHERE r.id = receta_ingredientes.receta_id
            AND user_is_member_of(r.negocio_id)
        )
    );

-- 6. POLITICAS PEDIDOS
DROP POLICY IF EXISTS "Acceso pedidos por negocio" ON pedidos;
CREATE POLICY "Acceso pedidos por negocio" ON pedidos
    FOR ALL USING (user_is_member_of(negocio_id));

-- 7. POLITICAS MOVIMIENTOS STOCK
DROP POLICY IF EXISTS "Acceso movimientos_stock por negocio" ON movimientos_stock;
CREATE POLICY "Acceso movimientos_stock por negocio" ON movimientos_stock
    FOR ALL USING (user_is_member_of(negocio_id));

-- 8. POLITICAS COMPRAS
DROP POLICY IF EXISTS "Acceso compras por negocio" ON compras;
CREATE POLICY "Acceso compras por negocio" ON compras
    FOR ALL USING (user_is_member_of(negocio_id));

-- 9. POLITICAS GASTOS FIJOS
DROP POLICY IF EXISTS "Acceso gastos_fijos por negocio" ON gastos_fijos;
CREATE POLICY "Acceso gastos_fijos por negocio" ON gastos_fijos
    FOR ALL USING (user_is_member_of(negocio_id));
