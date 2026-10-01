-- MIGRATION 0004: FUNCIONES DE RECETAS, COSTOS Y PRODUCCION (RPCs)
-- Proyecto: Mila · Gestión & Obrador

-- 1. search_recipes
CREATE OR REPLACE FUNCTION rpc_search_recipes(
    p_query TEXT DEFAULT '',
    p_category TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_res JSONB;
BEGIN
    SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'nombre', r.nombre,
        'categoria', r.categoria,
        'rendimiento', r.rendimiento,
        'unidad_rendimiento', r.unidad_rendimiento,
        'precio_venta', r.precio_venta
    )) INTO v_res
    FROM recetas r
    WHERE (p_query = '' OR r.nombre ILIKE '%' || p_query || '%' OR r.instrucciones ILIKE '%' || p_query || '%')
      AND (p_category IS NULL OR r.categoria = p_category);

    RETURN jsonb_build_object('recetas', COALESCE(v_res, '[]'::jsonb));
END;
$$;

-- 2. get_recipe
CREATE OR REPLACE FUNCTION rpc_get_recipe(p_recipe_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_receta JSONB;
    v_ingredientes JSONB;
BEGIN
    SELECT jsonb_build_object(
        'id', r.id,
        'nombre', r.nombre,
        'categoria', r.categoria,
        'rendimiento', r.rendimiento,
        'unidad_rendimiento', r.unidad_rendimiento,
        'precio_venta', r.precio_venta,
        'instrucciones', r.instrucciones
    ) INTO v_receta
    FROM recetas r
    WHERE r.id = p_recipe_id;

    IF v_receta IS NULL THEN
        RETURN jsonb_build_object('error', 'Receta no encontrada');
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
        'materia_prima_id', ri.materia_prima_id,
        'ingrediente', mp.nombre,
        'cantidad', ri.cantidad,
        'unidad', ri.unidad,
        'costo_unitario', mp.costo_unitario,
        'costo_total_ingrediente', ROUND(ri.cantidad * mp.costo_unitario, 2)
    )) INTO v_ingredientes
    FROM receta_ingredientes ri
    JOIN materias_primas mp ON ri.materia_prima_id = mp.id
    WHERE ri.receta_id = p_recipe_id;

    RETURN jsonb_build_object(
        'receta', v_receta,
        'ingredientes', COALESCE(v_ingredientes, '[]'::jsonb)
    );
END;
$$;

-- 3. get_recipe_cost
CREATE OR REPLACE FUNCTION rpc_get_recipe_cost(
    p_recipe_id UUID,
    p_yield NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_rendimiento NUMERIC;
    v_costo_total NUMERIC := 0;
    v_costo_porcion NUMERIC := 0;
    v_precio_venta NUMERIC;
    v_receta_nombre TEXT;
BEGIN
    SELECT nombre, COALESCE(p_yield, rendimiento), precio_venta
    INTO v_receta_nombre, v_rendimiento, v_precio_venta
    FROM recetas WHERE id = p_recipe_id;

    IF v_receta_nombre IS NULL THEN
        RETURN jsonb_build_object('error', 'Receta no encontrada');
    END IF;

    SELECT COALESCE(SUM(ri.cantidad * mp.costo_unitario), 0)
    INTO v_costo_total
    FROM receta_ingredientes ri
    JOIN materias_primas mp ON ri.materia_prima_id = mp.id
    WHERE ri.receta_id = p_recipe_id;

    IF v_rendimiento > 0 THEN
        v_costo_porcion := ROUND(v_costo_total / v_rendimiento, 2);
    END IF;

    RETURN jsonb_build_object(
        'receta_id', p_recipe_id,
        'nombre', v_receta_nombre,
        'costo_total_produccion', ROUND(v_costo_total, 2),
        'rendimiento_evaluado', v_rendimiento,
        'costo_por_unidad', v_costo_porcion,
        'precio_venta_actual', v_precio_venta,
        'margen_actual_pct', CASE WHEN v_precio_venta > 0 THEN ROUND(((v_precio_venta - v_costo_porcion) / v_precio_venta) * 100, 1) ELSE 0 END,
        'precio_sugerido_margen_50', ROUND(v_costo_porcion * 2.0, 2)
    );
END;
$$;

-- 4. check_production_feasibility
CREATE OR REPLACE FUNCTION rpc_check_production_feasibility(
    p_recipe_id UUID,
    p_quantity NUMERIC DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_faltantes JSONB;
    v_factible BOOLEAN := TRUE;
    v_costo_reposicion NUMERIC := 0;
BEGIN
    WITH req AS (
        SELECT 
            mp.id AS materia_prima_id,
            mp.nombre AS ingrediente,
            (ri.cantidad * p_quantity) AS cantidad_requerida,
            mp.stock_actual,
            mp.unidad,
            mp.costo_unitario,
            GREATEST(0, (ri.cantidad * p_quantity) - mp.stock_actual) AS faltante
        FROM receta_ingredientes ri
        JOIN materias_primas mp ON ri.materia_prima_id = mp.id
        WHERE ri.receta_id = p_recipe_id
    )
    SELECT 
        jsonb_agg(jsonb_build_object(
            'ingrediente', ingrediente,
            'requerido', cantidad_requerida,
            'disponible', stock_actual,
            'faltante', faltante,
            'unidad', unidad,
            'costo_estimado_faltante', ROUND(faltante * costo_unitario, 2)
        )),
        COALESCE(SUM(faltante * costo_unitario), 0),
        LOGICAL_AND(faltante = 0)
    INTO v_faltantes, v_costo_reposicion, v_factible
    FROM req;

    RETURN jsonb_build_object(
        'factible', COALESCE(v_factible, TRUE),
        'cantidad_solicitada', p_quantity,
        'costo_reposicion_faltantes', ROUND(v_costo_reposicion, 2),
        'detalle_ingredientes', COALESCE(v_faltantes, '[]'::jsonb)
    );
END;
$$;

-- 5. get_shopping_list
CREATE OR REPLACE FUNCTION rpc_get_shopping_list(p_horizon_days INT DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_res JSONB;
BEGIN
    WITH req_pedidos AS (
        SELECT 
            ri.materia_prima_id,
            SUM(ri.cantidad * p.cantidad) AS total_requerido
        FROM pedidos p
        JOIN receta_ingredientes ri ON p.receta_id = ri.receta_id
        WHERE p.estado IN ('Pendiente', 'Confirmado', 'En Preparacion')
          AND p.fecha_entrega <= NOW() + (p_horizon_days || ' days')::INTERVAL
        GROUP BY ri.materia_prima_id
    )
    SELECT jsonb_agg(jsonb_build_object(
        'materia_prima_id', mp.id,
        'ingrediente', mp.nombre,
        'stock_actual', mp.stock_actual,
        'requerido_pedidos', COALESCE(rp.total_requerido, 0),
        'a_comprar', GREATEST(0, COALESCE(rp.total_requerido, 0) - mp.stock_actual),
        'unidad', mp.unidad,
        'costo_estimado', ROUND(GREATEST(0, COALESCE(rp.total_requerido, 0) - mp.stock_actual) * mp.costo_unitario, 2),
        'proveedor', mp.proveedor
    )) INTO v_res
    FROM materias_primas mp
    LEFT JOIN req_pedidos rp ON mp.id = rp.materia_prima_id
    WHERE GREATEST(0, COALESCE(rp.total_requerido, 0) - mp.stock_actual) > 0;

    RETURN jsonb_build_object(
        'horizonte_dias', p_horizon_days,
        'items_a_comprar', COALESCE(v_res, '[]'::jsonb),
        'costo_total_estimado', (SELECT COALESCE(SUM( (s->>'costo_estimado')::NUMERIC ), 0) FROM jsonb_array_elements(COALESCE(v_res, '[]'::jsonb)) s)
    );
END;
$$;

-- TRANSACTIONAL HELPER: Descontar stock para un pedido entregado
CREATE OR REPLACE FUNCTION descontar_stock_pedido(p_pedido_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE
    v_receta_id UUID;
    v_cantidad NUMERIC;
    v_descontado BOOLEAN;
    v_negocio_id UUID;
    r RECORD;
BEGIN
    SELECT receta_id, cantidad, stock_descontado, negocio_id
    INTO v_receta_id, v_cantidad, v_descontado, v_negocio_id
    FROM pedidos WHERE id = p_pedido_id;

    IF v_descontado IS TRUE THEN
        RETURN TRUE; -- Ya fue descontado previamente
    END IF;

    FOR r IN 
        SELECT materia_prima_id, (cantidad * v_cantidad) AS cant_total
        FROM receta_ingredientes
        WHERE receta_id = v_receta_id
    LOOP
        UPDATE materias_primas
        SET stock_actual = stock_actual - r.cant_total
        WHERE id = r.materia_prima_id;

        INSERT INTO movimientos_stock (negocio_id, materia_prima_id, tipo, cantidad, motivo, pedido_id)
        VALUES (v_negocio_id, r.materia_prima_id, 'salida', r.cant_total, 'Descuento automatico por entrega de pedido', p_pedido_id);
    END LOOP;

    UPDATE pedidos SET stock_descontado = TRUE WHERE id = p_pedido_id;
    RETURN TRUE;
END;
$$;
