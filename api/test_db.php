
<?php
require_once __DIR__ . '/../includes/db.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $stmt = $pdo->prepare(
            "INSERT INTO test_persistencia (mensaje)
             VALUES (?)"
        );
        $stmt->execute(['Prueba de persistencia']);

        echo "Registro guardado correctamente.<br>";
    }

    $stmt = $pdo->query(
        "SELECT id, mensaje, creado_en
         FROM test_persistencia
         ORDER BY id DESC"
    );

    foreach ($stmt->fetchAll() as $fila) {
        echo htmlspecialchars((string) $fila['id']) . " - ";
        echo htmlspecialchars($fila['mensaje']) . " - ";
        echo htmlspecialchars($fila['creado_en']) . "<br>";
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo "Error al guardar o leer los datos.";
}
?>

<form method="POST">
    <button type="submit">Guardar prueba</button>
</form>