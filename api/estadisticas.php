<?php
session_start();
if (empty($_SESSION['admin'])) { http_response_code(401); exit; }   // único admin: Mila

require __DIR__ . '/../includes/db.php';
require __DIR__ . '/../includes/estadisticas.php';
header('Content-Type: application/json; charset=utf-8');

$g = fn(string $k) => ($_GET[$k] ?? '') !== '' ? $_GET[$k] : null;     // vacío = null
$periodo = json_decode($_GET['periodo'] ?? '{}', true) ?: [];          // ej: ?periodo={"tipo":"mes"}

switch ($_GET['accion'] ?? '') {
    case 'resumen':       $r = resumenVentas($pdo, $periodo, $g('receta_id'), $g('categoria')); break;
    case 'comparar':      $r = compararPeriodos($pdo, $periodo, $g('comparar') ?? 'anterior'); break;
    case 'top':           $r = topProductos($pdo, $periodo, $g('metrica') ?? 'ingresos', $g('orden') ?? 'desc', (int)($g('limite') ?? 5)); break;
    case 'rentabilidad':  $r = rentabilidadProductos($pdo, $periodo, $g('receta_id')); break;
    case 'dias':          $r = ventasPorDiaSemana($pdo, $periodo); break;
    case 'gasto_insumos': $r = gastoInsumos($pdo, $periodo, $g('agrupar') ?? 'ingrediente'); break;
    case 'alertas':       $r = obtenerAlertas($pdo); break;
    case 'meta':          $r = calcularMetaVentas($pdo,
                                $g('utilidad') !== null ? (float)$g('utilidad') : null,
                                $g('facturacion') !== null ? (float)$g('facturacion') : null); break;
    default:              http_response_code(400); $r = ['error' => 'Acción inválida'];
}
echo json_encode($r, JSON_UNESCAPED_UNICODE);