-- MIGRATION 0003: FUNCIONES DE ESTADISTICAS Y HERRAMIENTAS DE NEGOCIO (RPCs)
-- Proyecto: Mila · Gestión & Obrador

-- Helper function to resolve period object into start/end timestamp
CREATE OR REPLACE FUNCTION resolve_period_dates(p_period JSONB, p_timezone TEXT DEFAULT 'America/Argentina/Cordoba')
RETURNS TABLE (desde TIMESTAMPTZ, hasta TIMESTAMPTZ, tipo TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_tipo TEXT;
    v_n INT;
    v_now TIMESTAMPTZ;
    v_desde TIMESTAMPTZ;
    v_hasta TIMESTAMPTZ;
BEGIN
    v_tipo := COALESCE(p_period->>'tipo', 'mes');
    v_n := COALESCE((p_period->>'n')::INT, 1);
    v_now := NOW() AT TIME ZONE p_timezone;

    CASE v_tipo
        WHEN 'hoy' THEN
            v_desde := date_trunc('day', v_now);
            v_hasta := v_desde + INTERVAL '1 day' - INTERVAL '1 millisecond';
        WHEN 'ayer' THEN
            v_desde := date_trunc('day', v_now - INTERVAL '1 day');
            v_hasta := v_desde + INTERVAL '1 day' - INTERVAL '1 millisecond';
        WHEN 'semana' THEN
            v_desde := date_trunc('week', v_now);
            v_hasta := v_desde + INTERVAL '1 week' - INTERVAL '1 millisecond';
        WHEN 'semana_pasada' THEN
            v_desde := date_trunc('week', v_now - INTERVAL '1 week');
            v_hasta := v_desde + INTERVAL '1 week' - INTERVAL '1 millisecond';
        WHEN 'mes' THEN
            v_desde := date_trunc('month', v_now);
            v_hasta := v_desde + INTERVAL '1 month' - INTERVAL '1 millisecond';
        WHEN 'mes_pasado' THEN
            v_desde := date_trunc('month', v_now - INTERVAL '1 month');
            v_hasta := v_desde + INTERVAL '1 month' - INTERVAL '1 millisecond';
        WHEN 'trimestre' THEN
            v_desde := date_trunc('quarter', v_now);
            v_hasta := v_desde + INTERVAL '3 months' - INTERVAL '1 millisecond';
        WHEN 'anio' THEN
            v_desde := date_trunc('year', v_now);
            v_hasta := v_desde + INTERVAL '1 year' - INTERVAL '1 millisecond';
        WHEN 'anio_pasado' THEN
            v_desde := date_trunc('year', v_now - INTERVAL '1 year');
            v_hasta := v_desde + INTERVAL '1 year' - INTERVAL '1 millisecond';
        WHEN 'ultimos_n_dias' THEN
            v_hasta := v_now;
            v_desde := v_now - (v_n || ' days')::INTERVAL;
        WHEN 'rango' THEN
            v_desde := (p_period->>'desde')::TIMESTAMPTZ;
            v_hasta := (p_period->>'hasta')::TIMESTAMPTZ;
            IF v_hasta IS NULL THEN v_hasta := v_now; END IF;
        ELSE
            v_desde := date_trunc('month', v_now);
            v_hasta := v_desde + INTERVAL '1 month' - INTERVAL '1 millisecond';
    END CASE;

    RETURN QUERY SELECT v_desde AT TIME ZONE p_timezone, v_hasta AT TIME ZONE p_timezone, v_tipo;
END;
$$;

-- 1. get_sales_summary
CREATE OR REPLACE FUNCTION rpc_get_sales_summary(
    p_period JSONB,
    p_product_id UUID DEFAULT NULL,
    p_category TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_desde TIMESTAMPTZ;
    v_hasta TIMESTAMPTZ;
    v_tipo TEXT;
    v_res JSONB;
BEGIN
    SELECT desde, hasta, tipo INTO v_desde, v_hasta, v_tipo FROM resolve_period_dates(p_period);

    SELECT jsonb_build_object(
        'periodo', jsonb_build_object('tipo', v_tipo, 'desde', v_desde, 'hasta', v_hasta),
        'ventas_totales', COALESCE(SUM(p.total), 0),
        'cantidad_pedidos', COUNT(p.id),
        'unidades_vendidas', COALESCE(SUM(p.cantidad), 0),
        'ticket_promedio', CASE WHEN COUNT(p.id) > 0 THEN ROUND(COALESCE(SUM(p.total), 0) / COUNT(p.id), 2) ELSE 0 END,
        'costo_produccion_total', COALESCE(SUM(p.costo_produccion), 0),
        'utilidad_bruta', COALESCE(SUM(p.utilidad), 0),
        'margen_porcentaje', CASE WHEN COALESCE(SUM(p.total), 0) > 0 THEN ROUND((COALESCE(SUM(p.utilidad), 0) / SUM(p.total)) * 100, 1) ELSE 0 END,
        'datos_insuficientes', (COUNT(p.id) = 0)
    ) INTO v_res
    FROM pedidos p
    LEFT JOIN recetas r ON p.receta_id = r.id
    WHERE p.estado = 'Entregado'
      AND COALESCE(p.fecha_entregado, p.fecha_entrega) BETWEEN v_desde AND v_hasta
      AND (p_product_id IS NULL OR p.receta_id = p_product_id)
      AND (p_category IS NULL OR r.categoria = p_category);

    RETURN v_res;
END;
$$;

-- 2. compare_periods
CREATE OR REPLACE FUNCTION rpc_compare_periods(
    p_period JSONB,
    p_compare_to TEXT DEFAULT 'anterior'
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_desde TIMESTAMPTZ;
    v_hasta TIMESTAMPTZ;
    v_duracion INTERVAL;
    v_desde_prev TIMESTAMPTZ;
    v_hasta_prev TIMESTAMPTZ;
    
    v_curr_sales NUMERIC;
    v_prev_sales NUMERIC;
    v_diff_sales NUMERIC;
    v_var_pct NUMERIC;

    v_drivers JSONB;
BEGIN
    SELECT desde, hasta INTO v_desde, v_hasta FROM resolve_period_dates(p_period);
    v_duracion := v_hasta - v_desde;

    IF p_compare_to = 'anio_anterior' THEN
        v_desde_prev := v_desde - INTERVAL '1 year';
        v_hasta_prev := v_hasta - INTERVAL '1 year';
    ELSE
        v_hasta_prev := v_desde - INTERVAL '1 millisecond';
        v_desde_prev := v_hasta_prev - v_duracion;
    END IF;

    SELECT COALESCE(SUM(total), 0) INTO v_curr_sales FROM pedidos WHERE estado = 'Entregado' AND COALESCE(fecha_entregado, fecha_entrega) BETWEEN v_desde AND v_hasta;
    SELECT COALESCE(SUM(total), 0) INTO v_prev_sales FROM pedidos WHERE estado = 'Entregado' AND COALESCE(fecha_entregado, fecha_entrega) BETWEEN v_desde_prev AND v_hasta_prev;

    v_diff_sales := v_curr_sales - v_prev_sales;
    v_var_pct := CASE WHEN v_prev_sales > 0 THEN ROUND((v_diff_sales / v_prev_sales) * 100, 1) ELSE 0 END;

    -- Drivers (top productos contribuyentes)
    WITH curr_p AS (
        SELECT r.nombre, SUM(p.total) AS total
        FROM pedidos p JOIN recetas r ON p.receta_id = r.id
        WHERE p.estado = 'Entregado' AND COALESCE(p.fecha_entregado, p.fecha_entrega) BETWEEN v_desde AND v_hasta
        GROUP BY r.nombre
    ), prev_p AS (
        SELECT r.nombre, SUM(p.total) AS total
        FROM pedidos p JOIN recetas r ON p.receta_id = r.id
        WHERE p.estado = 'Entregado' AND COALESCE(p.fecha_entregado, p.fecha_entrega) BETWEEN v_desde_prev AND v_hasta_prev
        GROUP BY r.nombre
    ), diffs AS (
        SELECT COALESCE(c.nombre, pr.nombre) AS producto,
               COALESCE(c.total, 0) - COALESCE(pr.total, 0) AS dif
        FROM curr_p c FULL OUTER JOIN prev_p pr ON c.nombre = pr.nombre
    )
    SELECT jsonb_agg(jsonb_build_object('producto', producto, 'diferencia', dif)) INTO v_drivers
    FROM (
        SELECT producto, dif FROM diffs ORDER BY ABS(dif) DESC LIMIT 5
    ) s;

    RETURN jsonb_build_object(
        'periodo_actual', jsonb_build_object('desde', v_desde, 'hasta', v_hasta, 'ventas', v_curr_sales),
        'periodo_comparado', jsonb_build_object('desde', v_desde_prev, 'hasta', v_hasta_prev, 'ventas', v_prev_sales),
        'variacion_monto', v_diff_sales,
        'variacion_porcentaje', v_var_pct,
        'drivers', COALESCE(v_drivers, '[]'::jsonb)
    );
END;
$$;

-- 3. get_top_products
CREATE OR REPLACE FUNCTION rpc_get_top_products(
    p_period JSONB,
    p_metric TEXT DEFAULT 'ingresos',
    p_order TEXT DEFAULT 'desc',
    p_limit INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_desde TIMESTAMPTZ;
    v_hasta TIMESTAMPTZ;
    v_res JSONB;
BEGIN
    SELECT desde, hasta INTO v_desde, v_hasta FROM resolve_period_dates(p_period);

    WITH stats AS (
        SELECT 
            r.id AS receta_id,
            r.nombre AS producto,
            r.categoria,
            SUM(p.cantidad) AS unidades,
            SUM(p.total) AS ingresos,
            SUM(p.utilidad) AS utilidad,
            CASE WHEN SUM(p.total) > 0 THEN ROUND((SUM(p.utilidad) / SUM(p.total)) * 100, 1) ELSE 0 END AS margen_pct
        FROM pedidos p
        JOIN recetas r ON p.receta_id = r.id
        WHERE p.estado = 'Entregado' AND COALESCE(p.fecha_entregado, p.fecha_entrega) BETWEEN v_desde AND v_hasta
        GROUP BY r.id, r.nombre, r.categoria
    )
    SELECT jsonb_agg(jsonb_build_object(
        'receta_id', receta_id,
        'producto', producto,
        'categoria', categoria,
        'unidades', unidades,
        'ingresos', ingresos,
        'utilidad', utilidad,
        'margen_pct', margen_pct
    )) INTO v_res
    FROM (
        SELECT * FROM stats
        ORDER BY 
            CASE WHEN p_metric = 'unidades' AND p_order = 'desc' THEN unidades END DESC,
            CASE WHEN p_metric = 'unidades' AND p_order = 'asc' THEN unidades END ASC,
            CASE WHEN p_metric = 'ingresos' AND p_order = 'desc' THEN ingresos END DESC,
            CASE WHEN p_metric = 'ingresos' AND p_order = 'asc' THEN ingresos END ASC,
            CASE WHEN p_metric = 'utilidad' AND p_order = 'desc' THEN utilidad END DESC,
            CASE WHEN p_metric = 'utilidad' AND p_order = 'asc' THEN utilidad END ASC,
            CASE WHEN p_metric = 'margen' AND p_order = 'desc' THEN margen_pct END DESC,
            CASE WHEN p_metric = 'margen' AND p_order = 'asc' THEN margen_pct END ASC
        LIMIT LEAST(p_limit, 20)
    ) s;

    RETURN jsonb_build_object(
        'metrica', p_metric,
        'orden', p_order,
        'productos', COALESCE(v_res, '[]'::jsonb),
        'datos_insuficientes', (v_res IS NULL)
    );
END;
$$;

-- 4. get_product_profitability
CREATE OR REPLACE FUNCTION rpc_get_product_profitability(
    p_period JSONB,
    p_product_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_desde TIMESTAMPTZ;
    v_hasta TIMESTAMPTZ;
    v_res JSONB;
BEGIN
    SELECT desde, hasta INTO v_desde, v_hasta FROM resolve_period_dates(p_period);

    SELECT jsonb_agg(jsonb_build_object(
        'receta_id', r.id,
        'producto', r.nombre,
        'categoria', r.categoria,
        'precio_venta_actual', r.precio_venta,
        'unidades_vendidas', COALESCE(SUM(p.cantidad), 0),
        'ingresos_totales', COALESCE(SUM(p.total), 0),
        'costo_total', COALESCE(SUM(p.costo_produccion), 0),
        'utilidad_total', COALESCE(SUM(p.utilidad), 0),
        'margen_pct', CASE WHEN SUM(p.total) > 0 THEN ROUND((SUM(p.utilidad) / SUM(p.total)) * 100, 1) ELSE 0 END,
        'utilidad_por_unidad', CASE WHEN SUM(p.cantidad) > 0 THEN ROUND(SUM(p.utilidad) / SUM(p.cantidad), 2) ELSE 0 END
    )) INTO v_res
    FROM recetas r
    LEFT JOIN pedidos p ON p.receta_id = r.id AND p.estado = 'Entregado' AND COALESCE(p.fecha_entregado, p.fecha_entrega) BETWEEN v_desde AND v_hasta
    WHERE (p_product_id IS NULL OR r.id = p_product_id)
    GROUP BY r.id, r.nombre, r.categoria, r.precio_venta;

    RETURN jsonb_build_object('rentabilidad', COALESCE(v_res, '[]'::jsonb));
END;
$$;

-- 5. get_sales_by_weekday
CREATE OR REPLACE FUNCTION rpc_get_sales_by_weekday(p_period JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_desde TIMESTAMPTZ;
    v_hasta TIMESTAMPTZ;
    v_res JSONB;
BEGIN
    SELECT desde, hasta INTO v_desde, v_hasta FROM resolve_period_dates(p_period);

    WITH days AS (
        SELECT 
            EXTRACT(ISODOW FROM COALESCE(p.fecha_entregado, p.fecha_entrega)) AS dow,
            COUNT(p.id) AS pedidos,
            SUM(p.total) AS ingresos
        FROM pedidos p
        WHERE p.estado = 'Entregado' AND COALESCE(p.fecha_entregado, p.fecha_entrega) BETWEEN v_desde AND v_hasta
        GROUP BY dow
    )
    SELECT jsonb_agg(jsonb_build_object(
        'dia_num', d.dow,
        'dia_nombre', CASE d.dow
            WHEN 1 THEN 'Lunes'
            WHEN 2 THEN 'Martes'
            WHEN 3 THEN 'Miércoles'
            WHEN 4 THEN 'Jueves'
            WHEN 5 THEN 'Viernes'
            WHEN 6 THEN 'Sábado'
            WHEN 7 THEN 'Domingo'
        END,
        'pedidos', COALESCE(d.pedidos, 0),
        'ingresos', COALESCE(d.ingresos, 0)
    ) ORDER BY d.dow) INTO v_res
    FROM days d;

    RETURN jsonb_build_object('dias', COALESCE(v_res, '[]'::jsonb));
END;
$$;

-- 6. get_ingredient_spend
CREATE OR REPLACE FUNCTION rpc_get_ingredient_spend(
    p_period JSONB,
    p_group_by TEXT DEFAULT 'ingrediente'
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_desde TIMESTAMPTZ;
    v_hasta TIMESTAMPTZ;
    v_res JSONB;
BEGIN
    SELECT desde, hasta INTO v_desde, v_hasta FROM resolve_period_dates(p_period);

    IF p_group_by = 'proveedor' THEN
        SELECT jsonb_agg(jsonb_build_object(
            'proveedor', COALESCE(c.proveedor, 'Sin especificar'),
            'compras_count', COUNT(c.id),
            'gasto_total', SUM(c.costo_total)
        )) INTO v_res
        FROM compras c
        WHERE c.fecha BETWEEN v_desde AND v_hasta
        GROUP BY c.proveedor;
    ELSE
        SELECT jsonb_agg(jsonb_build_object(
            'materia_prima_id', mp.id,
            'ingrediente', mp.nombre,
            'cantidad_comprada', SUM(c.cantidad),
            'unidad', mp.unidad,
            'gasto_total', SUM(c.costo_total),
            'costo_promedio_unitario', ROUND(SUM(c.costo_total) / NULLIF(SUM(c.cantidad), 0), 2)
        )) INTO v_res
        FROM compras c
        JOIN materias_primas mp ON c.materia_prima_id = mp.id
        WHERE c.fecha BETWEEN v_desde AND v_hasta
        GROUP BY mp.id, mp.nombre, mp.unidad;
    END IF;

    RETURN jsonb_build_object(
        'gasto_total_compras', (SELECT COALESCE(SUM(costo_total), 0) FROM compras WHERE fecha BETWEEN v_desde AND v_hasta),
        'desglose', COALESCE(v_res, '[]'::jsonb),
        'datos_insuficientes', (v_res IS NULL)
    );
END;
$$;

-- 7. get_alerts
CREATE OR REPLACE FUNCTION rpc_get_alerts()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_stock_bajo JSONB;
    v_margen_bajo JSONB;
    v_pedidos_vencer JSONB;
BEGIN
    -- Stock bajo
    SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'nombre', nombre, 'stock_actual', stock_actual, 'stock_minimo', stock_minimo, 'unidad', unidad
    )) INTO v_stock_bajo
    FROM materias_primas
    WHERE stock_actual <= stock_minimo;

    -- Pedidos próximos a vencer (próximos 2 días sin entregar)
    SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'cliente', c.nombre, 'receta', r.nombre, 'fecha_entrega', p.fecha_entrega, 'estado', p.estado
    )) INTO v_pedidos_vencer
    FROM pedidos p
    LEFT JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN recetas r ON p.receta_id = r.id
    WHERE p.estado IN ('Pendiente', 'Confirmado', 'En Preparacion')
      AND p.fecha_entrega <= NOW() + INTERVAL '2 days';

    RETURN jsonb_build_object(
        'stock_bajo', COALESCE(v_stock_bajo, '[]'::jsonb),
        'pedidos_proximos', COALESCE(v_pedidos_vencer, '[]'::jsonb)
    );
END;
$$;

-- 8. calculate_sales_goal
CREATE OR REPLACE FUNCTION rpc_calculate_sales_goal(
    p_target_profit NUMERIC DEFAULT NULL,
    p_target_revenue NUMERIC DEFAULT NULL,
    p_period JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_gastos_fijos NUMERIC;
    v_avg_margen NUMERIC;
    v_req_revenue NUMERIC;
    v_req_profit NUMERIC;
BEGIN
    SELECT COALESCE(SUM(monto), 0) INTO v_gastos_fijos FROM gastos_fijos WHERE periodicidad = 'mensual';

    SELECT CASE WHEN SUM(total) > 0 THEN (SUM(utilidad) / SUM(total)) ELSE 0.40 END INTO v_avg_margen
    FROM pedidos WHERE estado = 'Entregado' AND fecha_pedido >= NOW() - INTERVAL '60 days';

    IF p_target_profit IS NOT NULL THEN
        v_req_profit := p_target_profit;
        v_req_revenue := ROUND((p_target_profit + v_gastos_fijos) / NULLIF(v_avg_margen, 0), 2);
    ELSIF p_target_revenue IS NOT NULL THEN
        v_req_revenue := p_target_revenue;
        v_req_profit := ROUND((p_target_revenue * v_avg_margen) - v_gastos_fijos, 2);
    ELSE
        -- Punto de equilibrio por defecto
        v_req_profit := 0;
        v_req_revenue := ROUND(v_gastos_fijos / NULLIF(v_avg_margen, 0), 2);
    END IF;

    RETURN jsonb_build_object(
        'meta_utilidad_neta', v_req_profit,
        'facturacion_requerida', v_req_revenue,
        'gastos_fijos_mensuales', v_gastos_fijos,
        'margen_promedio_estimado_pct', ROUND(v_avg_margen * 100, 1)
    );
END;
$$;
