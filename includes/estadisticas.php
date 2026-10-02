<?php
// Todas reciben $pdo primero. $periodo es un array: ['tipo' => 'mes'], ['tipo' => 'ultimos_n_dias', 'n' => 30],
// ['tipo' => 'rango', 'desde' => '2026-09-01', 'hasta' => '2026-09-30'], etc.

const FECHA_VENTA  = 'COALESCE(p.fecha_entregado, p.fecha_entrega)';   // en las consultas, pedidos siempre se llama "p"
const COND_PERIODO = "p.estado = 'Entregado' AND " . FECHA_VENTA . " >= :desde AND " . FECHA_VENTA . " < :hasta";

function fechaSql(DateTimeImmutable $d): string { return $d->format('Y-m-d H:i:s'); }

function paramsPeriodo(array $per): array
{
    return [':desde' => fechaSql($per['desde']), ':hasta' => fechaSql($per['hasta'])];
}

function periodoJson(array $per): array   // para mostrar el período en la respuesta
{
    return [
        'tipo'  => $per['tipo'],
        'desde' => fechaSql($per['desde']),
        'hasta' => fechaSql($per['hasta']->modify('-1 second')),
    ];
}

// ---- helper: resolve_period_dates (PHP puro, no usa SQL) ----------------------
// "hasta" es EXCLUSIVO: las consultas usan  fecha >= desde AND fecha < hasta
function resolverPeriodo(array $p = []): array
{
    $tipo  = $p['tipo'] ?? 'mes';
    $n     = max(1, (int)($p['n'] ?? 1));
    $ahora = new DateTimeImmutable('now');
    $hoy   = $ahora->setTime(0, 0);
    $mes   = $hoy->modify('first day of this month');
    $anio  = (int)$hoy->format('Y');

    switch ($tipo) {
        case 'hoy':            $desde = $hoy;                                   $hasta = $desde->modify('+1 day');   break;
        case 'ayer':           $desde = $hoy->modify('-1 day');                 $hasta = $hoy;                       break;
        case 'semana':         $desde = $hoy->modify('monday this week');       $hasta = $desde->modify('+1 week');  break;
        case 'semana_pasada':  $desde = $hoy->modify('monday this week')->modify('-1 week'); $hasta = $desde->modify('+1 week'); break;
        case 'mes_pasado':     $desde = $mes->modify('-1 month');               $hasta = $mes;                       break;
        case 'trimestre':
            $mesIni = (int)(floor(((int)$hoy->format('n') - 1) / 3) * 3 + 1);
            $desde  = $hoy->setDate($anio, $mesIni, 1);
            $hasta  = $desde->modify('+3 months');
            break;
        case 'anio':           $desde = $hoy->setDate($anio, 1, 1);             $hasta = $desde->modify('+1 year');  break;
        case 'anio_pasado':    $desde = $hoy->setDate($anio - 1, 1, 1);         $hasta = $desde->modify('+1 year');  break;
        case 'ultimos_n_dias': $desde = $ahora->modify("-$n days");             $hasta = $ahora;                     break;
        case 'rango':
            $desde = new DateTimeImmutable($p['desde'] ?? 'first day of this month 00:00');
            $hasta = isset($p['hasta']) ? new DateTimeImmutable($p['hasta']) : $ahora;
            if (isset($p['hasta']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $p['hasta'])) {
                $hasta = $hasta->modify('+1 day');   // "hasta 2026-09-30" incluye todo ese día
            }
            break;
        case 'mes':
        default:               $desde = $mes;                                   $hasta = $mes->modify('+1 month');
    }
    return ['tipo' => $tipo, 'desde' => $desde, 'hasta' => $hasta];
}

// 1) rpc_get_sales_summary
function resumenVentas(PDO $pdo, array $periodo, ?string $recetaId = null, ?string $categoria = null): array
{
    $per    = resolverPeriodo($periodo);
    $params = paramsPeriodo($per);

    $sql = "SELECT COUNT(p.id) AS pedidos,
                   COALESCE(SUM(p.total), 0)            AS ventas,
                   COALESCE(SUM(p.cantidad), 0)         AS unidades,
                   COALESCE(SUM(p.costo_produccion), 0) AS costo,
                   COALESCE(SUM(p.utilidad), 0)         AS utilidad
            FROM pedidos p
            LEFT JOIN recetas r ON r.id = p.receta_id
            WHERE " . COND_PERIODO;
    if ($recetaId !== null)  { $sql .= " AND p.receta_id = :rid"; $params[':rid'] = $recetaId; }
    if ($categoria !== null) { $sql .= " AND r.categoria = :cat"; $params[':cat'] = $categoria; }

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $t = $st->fetch();

    $cant = (int)$t['pedidos'];
    $ventas = (float)$t['ventas'];
    $util = (float)$t['utilidad'];

    return [
        'periodo'                => periodoJson($per),
        'ventas_totales'         => $ventas,
        'cantidad_pedidos'       => $cant,
        'unidades_vendidas'      => (float)$t['unidades'],
        'ticket_promedio'        => $cant > 0 ? round($ventas / $cant, 2) : 0,
        'costo_produccion_total' => (float)$t['costo'],
        'utilidad_bruta'         => $util,
        'margen_porcentaje'      => $ventas > 0 ? round($util / $ventas * 100, 1) : 0,
        'datos_insuficientes'    => $cant === 0,
    ];
}

// 2) rpc_compare_periods
function compararPeriodos(PDO $pdo, array $periodo, string $comparar = 'anterior'): array
{
    $per = resolverPeriodo($periodo);
    $desde = $per['desde'];
    $hasta = $per['hasta'];

    if ($comparar === 'anio_anterior') {
        $dPrev = $desde->modify('-1 year');
        $hPrev = $hasta->modify('-1 year');
    } else {                                   // 'anterior': mismo largo, inmediatamente antes
        $seg   = $hasta->getTimestamp() - $desde->getTimestamp();
        $hPrev = $desde;
        $dPrev = $desde->modify("-$seg seconds");
    }

    $ventas = function (DateTimeImmutable $d, DateTimeImmutable $h) use ($pdo): float {
        $st = $pdo->prepare("SELECT COALESCE(SUM(p.total), 0) FROM pedidos p WHERE " . COND_PERIODO);
        $st->execute([':desde' => fechaSql($d), ':hasta' => fechaSql($h)]);
        return (float)$st->fetchColumn();
    };
    $actual = $ventas($desde, $hasta);
    $previo = $ventas($dPrev, $hPrev);
    $dif    = $actual - $previo;

    // Qué productos explican la diferencia (reemplaza el FULL OUTER JOIN, que MySQL no tiene)
    $f = FECHA_VENTA;
    $enActual = "$f >= :d1 AND $f < :h1";
    $enPrevio = "$f >= :d2 AND $f < :h2";
    $st = $pdo->prepare(
        "SELECT r.nombre AS producto,
                SUM(CASE WHEN $enActual THEN p.total ELSE 0 END)
              - SUM(CASE WHEN $enPrevio THEN p.total ELSE 0 END) AS diferencia
         FROM pedidos p
         JOIN recetas r ON r.id = p.receta_id
         WHERE p.estado = 'Entregado' AND (($enActual) OR ($enPrevio))
         GROUP BY r.id, r.nombre
         HAVING diferencia <> 0
         ORDER BY ABS(diferencia) DESC
         LIMIT 5"
    );
    $st->execute([
        ':d1' => fechaSql($desde), ':h1' => fechaSql($hasta),
        ':d2' => fechaSql($dPrev), ':h2' => fechaSql($hPrev),
    ]);

    return [
        'periodo_actual'       => ['desde' => fechaSql($desde), 'hasta' => fechaSql($hasta->modify('-1 second')), 'ventas' => $actual],
        'periodo_comparado'    => ['desde' => fechaSql($dPrev), 'hasta' => fechaSql($hPrev->modify('-1 second')), 'ventas' => $previo],
        'variacion_monto'      => $dif,
        'variacion_porcentaje' => $previo > 0 ? round($dif / $previo * 100, 1) : 0,
        'drivers'              => $st->fetchAll(),
    ];
}

// 3) rpc_get_top_products
function topProductos(PDO $pdo, array $periodo, string $metrica = 'ingresos', string $orden = 'desc', int $limite = 5): array
{
    $per = resolverPeriodo($periodo);

    // Lista blanca: el nombre de columna y el orden NO se pueden pasar como parámetro SQL
    $columnas = ['unidades' => 'unidades', 'ingresos' => 'ingresos', 'utilidad' => 'utilidad', 'margen' => 'margen_pct'];
    $col = $columnas[$metrica] ?? 'ingresos';
    $dir = strtolower($orden) === 'asc' ? 'ASC' : 'DESC';
    $lim = max(1, min($limite, 20));

    $st = $pdo->prepare(
        "SELECT r.id AS receta_id, r.nombre AS producto, r.categoria,
                SUM(p.cantidad) AS unidades,
                SUM(p.total)    AS ingresos,
                SUM(p.utilidad) AS utilidad,
                CASE WHEN SUM(p.total) > 0 THEN ROUND(SUM(p.utilidad) / SUM(p.total) * 100, 1) ELSE 0 END AS margen_pct
         FROM pedidos p
         JOIN recetas r ON r.id = p.receta_id
         WHERE " . COND_PERIODO . "
         GROUP BY r.id, r.nombre, r.categoria
         ORDER BY $col $dir
         LIMIT $lim"
    );
    $st->execute(paramsPeriodo($per));
    $productos = $st->fetchAll();

    return [
        'metrica'             => $metrica,
        'orden'               => strtolower($dir),
        'productos'           => $productos,
        'datos_insuficientes' => count($productos) === 0,
    ];
}

// 4) rpc_get_product_profitability
function rentabilidadProductos(PDO $pdo, array $periodo, ?string $recetaId = null): array
{
    $per    = resolverPeriodo($periodo);
    $params = paramsPeriodo($per);

    $sql = "SELECT r.id AS receta_id, r.nombre AS producto, r.categoria, r.precio_venta AS precio_venta_actual,
                   COALESCE(SUM(p.cantidad), 0)         AS unidades_vendidas,
                   COALESCE(SUM(p.total), 0)            AS ingresos_totales,
                   COALESCE(SUM(p.costo_produccion), 0) AS costo_total,
                   COALESCE(SUM(p.utilidad), 0)         AS utilidad_total,
                   CASE WHEN SUM(p.total) > 0    THEN ROUND(SUM(p.utilidad) / SUM(p.total) * 100, 1) ELSE 0 END AS margen_pct,
                   CASE WHEN SUM(p.cantidad) > 0 THEN ROUND(SUM(p.utilidad) / SUM(p.cantidad), 2)    ELSE 0 END AS utilidad_por_unidad
            FROM recetas r
            LEFT JOIN pedidos p ON p.receta_id = r.id AND " . COND_PERIODO;
    if ($recetaId !== null) { $sql .= " WHERE r.id = :rid"; $params[':rid'] = $recetaId; }
    $sql .= " GROUP BY r.id, r.nombre, r.categoria, r.precio_venta ORDER BY ingresos_totales DESC";

    $st = $pdo->prepare($sql);
    $st->execute($params);
    return ['rentabilidad' => $st->fetchAll()];
}

// 5) rpc_get_sales_by_weekday
function ventasPorDiaSemana(PDO $pdo, array $periodo): array
{
    $per = resolverPeriodo($periodo);
    $st = $pdo->prepare(
        "SELECT WEEKDAY(" . FECHA_VENTA . ") + 1 AS dow,      -- 1 = lunes ... 7 = domingo
                COUNT(p.id) AS pedidos, SUM(p.total) AS ingresos
         FROM pedidos p
         WHERE " . COND_PERIODO . "
         GROUP BY dow"
    );
    $st->execute(paramsPeriodo($per));
    $porDia = array_column($st->fetchAll(), null, 'dow');

    $nombres = [1 => 'Lunes', 2 => 'Martes', 3 => 'Miércoles', 4 => 'Jueves', 5 => 'Viernes', 6 => 'Sábado', 7 => 'Domingo'];
    $dias = [];
    foreach ($nombres as $num => $nombre) {      // devuelve los 7 días, aunque no hayan tenido ventas
        $dias[] = [
            'dia_num'    => $num,
            'dia_nombre' => $nombre,
            'pedidos'    => (int)($porDia[$num]['pedidos'] ?? 0),
            'ingresos'   => (float)($porDia[$num]['ingresos'] ?? 0),
        ];
    }
    return ['dias' => $dias];
}

// 6) rpc_get_ingredient_spend
function gastoInsumos(PDO $pdo, array $periodo, string $agrupar = 'ingrediente'): array
{
    $per = resolverPeriodo($periodo);

    if ($agrupar === 'proveedor') {
        $sql = "SELECT COALESCE(c.proveedor, 'Sin especificar') AS proveedor,
                       COUNT(c.id) AS compras_count, SUM(c.costo_total) AS gasto_total
                FROM compras c
                WHERE c.fecha >= :desde AND c.fecha < :hasta
                GROUP BY COALESCE(c.proveedor, 'Sin especificar')
                ORDER BY gasto_total DESC";
    } else {
        $sql = "SELECT mp.id AS materia_prima_id, mp.nombre AS ingrediente,
                       SUM(c.cantidad) AS cantidad_comprada, mp.unidad,
                       SUM(c.costo_total) AS gasto_total,
                       ROUND(SUM(c.costo_total) / NULLIF(SUM(c.cantidad), 0), 2) AS costo_promedio_unitario
                FROM compras c
                JOIN materias_primas mp ON mp.id = c.materia_prima_id
                WHERE c.fecha >= :desde AND c.fecha < :hasta
                GROUP BY mp.id, mp.nombre, mp.unidad
                ORDER BY gasto_total DESC";
    }
    $st = $pdo->prepare($sql);
    $st->execute(paramsPeriodo($per));
    $filas = $st->fetchAll();

    return [
        'gasto_total_compras' => round(array_sum(array_column($filas, 'gasto_total')), 2),
        'desglose'            => $filas,
        'datos_insuficientes' => count($filas) === 0,
    ];
}

// 7) rpc_get_alerts
function obtenerAlertas(PDO $pdo): array
{
    $stockBajo = $pdo->query(
        "SELECT id, nombre, stock_actual, stock_minimo, unidad
         FROM materias_primas WHERE stock_actual <= stock_minimo ORDER BY nombre"
    )->fetchAll();

    $pedidos = $pdo->query(
        "SELECT p.id, c.nombre AS cliente, r.nombre AS receta, p.fecha_entrega, p.estado
         FROM pedidos p
         LEFT JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN recetas  r ON r.id = p.receta_id
         WHERE p.estado IN ('Pendiente', 'Confirmado', 'En Preparacion')
           AND p.fecha_entrega <= DATE_ADD(NOW(), INTERVAL 2 DAY)
         ORDER BY p.fecha_entrega"
    )->fetchAll();

    return ['stock_bajo' => $stockBajo, 'pedidos_proximos' => $pedidos];
}

// 8) rpc_calculate_sales_goal
function calcularMetaVentas(PDO $pdo, ?float $utilidadObjetivo = null, ?float $facturacionObjetivo = null): array
{
    $gastos = (float)$pdo->query(
        "SELECT COALESCE(SUM(monto), 0) FROM gastos_fijos WHERE periodicidad = 'mensual'"
    )->fetchColumn();

    $t = $pdo->query(
        "SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(utilidad), 0) AS utilidad
         FROM pedidos
         WHERE estado = 'Entregado' AND fecha_pedido >= DATE_SUB(NOW(), INTERVAL 60 DAY)"
    )->fetch();
    $margen = (float)$t['total'] > 0 ? (float)$t['utilidad'] / (float)$t['total'] : 0.40;   // 40% si no hay datos

    if ($utilidadObjetivo !== null) {
        $utilidad = $utilidadObjetivo;
        $factura  = $margen > 0 ? round(($utilidadObjetivo + $gastos) / $margen, 2) : null;
    } elseif ($facturacionObjetivo !== null) {
        $factura  = $facturacionObjetivo;
        $utilidad = round($facturacionObjetivo * $margen - $gastos, 2);
    } else {                                         // punto de equilibrio
        $utilidad = 0;
        $factura  = $margen > 0 ? round($gastos / $margen, 2) : null;
    }

    return [
        'meta_utilidad_neta'           => $utilidad,
        'facturacion_requerida'        => $factura,
        'gastos_fijos_mensuales'       => $gastos,
        'margen_promedio_estimado_pct' => round($margen * 100, 1),
    ];
}