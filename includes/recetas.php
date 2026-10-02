<?php
// Todas las funciones reciben la conexión $pdo como primer parámetro.
// Pryeba de comentario
// 1) rpc_search_recipes

//
function buscarRecetas(PDO $pdo, string $q = '', ?string $categoria = null): array
{
    $sql = "SELECT id, nombre, categoria, rendimiento, unidad_rendimiento, precio_venta
            FROM recetas WHERE 1=1";
    $params = [];

    if ($q !== '') {
        $sql .= " AND (nombre LIKE :q1 OR instrucciones LIKE :q2)";
        $params[':q1'] = $params[':q2'] = "%$q%";
    }
    if ($categoria !== null) {
        $sql .= " AND categoria = :cat";
        $params[':cat'] = $categoria;
    }
    $sql .= " ORDER BY nombre";

    $st = $pdo->prepare($sql);
    $st->execute($params);
    return ['recetas' => $st->fetchAll()];
}

// 2) rpc_get_recipe
function obtenerReceta(PDO $pdo, string $id): array
{
    $st = $pdo->prepare(
        "SELECT id, nombre, categoria, rendimiento, unidad_rendimiento, precio_venta, instrucciones
         FROM recetas WHERE id = :id"
    );
    $st->execute([':id' => $id]);
    $receta = $st->fetch();
    if (!$receta) return ['error' => 'Receta no encontrada'];

    $st = $pdo->prepare(
        "SELECT ri.materia_prima_id, mp.nombre AS ingrediente, ri.cantidad, ri.unidad,
                mp.costo_unitario,
                ROUND(ri.cantidad * mp.costo_unitario, 2) AS costo_total_ingrediente
         FROM receta_ingredientes ri
         JOIN materias_primas mp ON mp.id = ri.materia_prima_id
         WHERE ri.receta_id = :id"
    );
    $st->execute([':id' => $id]);

    return ['receta' => $receta, 'ingredientes' => $st->fetchAll()];
}

// 3) rpc_get_recipe_cost
function calcularCostoReceta(PDO $pdo, string $id, ?float $rendimiento = null): array
{
    $st = $pdo->prepare("SELECT nombre, rendimiento, precio_venta FROM recetas WHERE id = :id");
    $st->execute([':id' => $id]);
    $r = $st->fetch();
    if (!$r) return ['error' => 'Receta no encontrada'];

    $st = $pdo->prepare(
        "SELECT COALESCE(SUM(ri.cantidad * mp.costo_unitario), 0)
         FROM receta_ingredientes ri
         JOIN materias_primas mp ON mp.id = ri.materia_prima_id
         WHERE ri.receta_id = :id"
    );
    $st->execute([':id' => $id]);
    $costoTotal = (float)$st->fetchColumn();

    $rend        = $rendimiento ?? (float)$r['rendimiento'];
    $precio      = (float)$r['precio_venta'];
    $costoUnidad = $rend > 0 ? round($costoTotal / $rend, 2) : 0;

    return [
        'receta_id'                 => $id,
        'nombre'                    => $r['nombre'],
        'costo_total_produccion'    => round($costoTotal, 2),
        'rendimiento_evaluado'      => $rend,
        'costo_por_unidad'          => $costoUnidad,
        'precio_venta_actual'       => $precio,
        'margen_actual_pct'         => $precio > 0 ? round((($precio - $costoUnidad) / $precio) * 100, 1) : 0,
        'precio_sugerido_margen_50' => round($costoUnidad * 2, 2),
    ];
}

// 4) rpc_check_production_feasibility
function verificarFactibilidad(PDO $pdo, string $id, float $cantidad = 1): array
{
    $st = $pdo->prepare(
        "SELECT mp.nombre AS ingrediente,
                ri.cantidad * :c1 AS requerido,
                mp.stock_actual AS disponible,
                GREATEST(0, ri.cantidad * :c2 - mp.stock_actual) AS faltante,
                mp.unidad,
                ROUND(GREATEST(0, ri.cantidad * :c3 - mp.stock_actual) * mp.costo_unitario, 2) AS costo_estimado_faltante
         FROM receta_ingredientes ri
         JOIN materias_primas mp ON mp.id = ri.materia_prima_id
         WHERE ri.receta_id = :id"
    );
    $st->execute([':c1' => $cantidad, ':c2' => $cantidad, ':c3' => $cantidad, ':id' => $id]);
    $detalle = $st->fetchAll();

    $factible = true;
    $costoReposicion = 0;
    foreach ($detalle as $d) {
        if ((float)$d['faltante'] > 0) $factible = false;
        $costoReposicion += (float)$d['costo_estimado_faltante'];
    }

    return [
        'factible'                   => $factible,
        'cantidad_solicitada'        => $cantidad,
        'costo_reposicion_faltantes' => round($costoReposicion, 2),
        'detalle_ingredientes'       => $detalle,
    ];
}

// 5) rpc_get_shopping_list
function obtenerListaCompras(PDO $pdo, int $dias = 7): array
{
    $st = $pdo->prepare(
        "SELECT mp.id AS materia_prima_id,
                mp.nombre AS ingrediente,
                mp.stock_actual,
                rp.total_requerido AS requerido_pedidos,
                rp.total_requerido - mp.stock_actual AS a_comprar,
                mp.unidad,
                ROUND((rp.total_requerido - mp.stock_actual) * mp.costo_unitario, 2) AS costo_estimado,
                mp.proveedor
         FROM materias_primas mp
         JOIN (
             SELECT ri.materia_prima_id, SUM(ri.cantidad * p.cantidad) AS total_requerido
             FROM pedidos p
             JOIN receta_ingredientes ri ON ri.receta_id = p.receta_id
             WHERE p.estado IN ('Pendiente', 'Confirmado', 'En Preparacion')
               AND p.fecha_entrega <= DATE_ADD(NOW(), INTERVAL :dias DAY)
             GROUP BY ri.materia_prima_id
         ) rp ON rp.materia_prima_id = mp.id
         WHERE rp.total_requerido > mp.stock_actual
         ORDER BY mp.nombre"
    );
    $st->bindValue(':dias', $dias, PDO::PARAM_INT);
    $st->execute();
    $items = $st->fetchAll();

    return [
        'horizonte_dias'       => $dias,
        'items_a_comprar'      => $items,
        'costo_total_estimado' => round(array_sum(array_column($items, 'costo_estimado')), 2),
    ];
}

// 6) descontar_stock_pedido
function descontarStockPedido(PDO $pdo, string $pedidoId): bool
{
    $propia = !$pdo->inTransaction();   // si ya hay una transacción abierta, usa esa
    if ($propia) $pdo->beginTransaction();

    try {
        // FOR UPDATE bloquea la fila: evita descontar dos veces si se ejecuta en simultáneo
        $st = $pdo->prepare("SELECT receta_id, cantidad, stock_descontado FROM pedidos WHERE id = :id FOR UPDATE");
        $st->execute([':id' => $pedidoId]);
        $p = $st->fetch();

        if (!$p) {
            if ($propia) $pdo->rollBack();
            return false;                       // el pedido no existe
        }
        if ($p['stock_descontado']) {
            if ($propia) $pdo->commit();
            return true;                        // ya estaba descontado
        }

        $st = $pdo->prepare(
            "SELECT materia_prima_id, cantidad * :c AS cant_total
             FROM receta_ingredientes WHERE receta_id = :r"
        );
        $st->execute([':c' => $p['cantidad'], ':r' => $p['receta_id']]);
        $ingredientes = $st->fetchAll();

        $upd = $pdo->prepare("UPDATE materias_primas SET stock_actual = stock_actual - :c WHERE id = :id");
        $mov = $pdo->prepare(
            "INSERT INTO movimientos_stock (materia_prima_id, tipo, cantidad, motivo, pedido_id)
             VALUES (:mp, 'salida', :c, 'Descuento automatico por entrega de pedido', :ped)"
        );

        foreach ($ingredientes as $i) {
            $upd->execute([':c' => $i['cant_total'], ':id' => $i['materia_prima_id']]);
            $mov->execute([':mp' => $i['materia_prima_id'], ':c' => $i['cant_total'], ':ped' => $pedidoId]);
        }

        $pdo->prepare("UPDATE pedidos SET stock_descontado = 1 WHERE id = :id")
            ->execute([':id' => $pedidoId]);

        if ($propia) $pdo->commit();
        return true;
    } catch (Throwable $e) {
        if ($propia && $pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}