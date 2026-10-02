<?php
session_start();
if (empty($_SESSION['admin'])) { http_response_code(401); exit; }   // único admin: Mila

require __DIR__ . '/../includes/db.php';
require __DIR__ . '/../includes/recetas.php';
header('Content-Type: application/json; charset=utf-8');

$id = $_GET['id'] ?? '';

switch ($_GET['accion'] ?? '') {
    case 'buscar':    $r = buscarRecetas($pdo, $_GET['q'] ?? '', $_GET['categoria'] ?? null); break;
    case 'receta':    $r = obtenerReceta($pdo, $id); break;
    case 'costo':     $r = calcularCostoReceta($pdo, $id, isset($_GET['rendimiento']) ? (float)$_GET['rendimiento'] : null); break;
    case 'factible':  $r = verificarFactibilidad($pdo, $id, (float)($_GET['cantidad'] ?? 1)); break;
    case 'compras':   $r = obtenerListaCompras($pdo, (int)($_GET['dias'] ?? 7)); break;
    default:          http_response_code(400); $r = ['error' => 'Acción inválida'];
}
echo json_encode($r, JSON_UNESCAPED_UNICODE);