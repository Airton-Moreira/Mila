<?php
date_default_timezone_set('America/Argentina/Cordoba');
$pdo = new PDO('mysql:host=localhost;dbname=mila;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '-03:00'",   // Argentina no tiene horario de verano
]);