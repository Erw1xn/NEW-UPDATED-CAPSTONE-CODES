<?php
$host = "127.0.0.1";
$port = 3307;
$username = "root";
$password = "";
$database = "dental_clinic_system";
$liveConfigPath = __DIR__ . "/db_credentials.php";
if (file_exists($liveConfigPath) && !in_array($_SERVER["SERVER_NAME"] ?? "localhost", ["localhost", "127.0.0.1"])) {
    $liveConfig = require $liveConfigPath;
    $host = $liveConfig["host"];
    $port = $liveConfig["port"];
    $username = $liveConfig["username"];
    $password = $liveConfig["password"];
    $database = $liveConfig["database"];
}
date_default_timezone_set("Asia/Manila");
$conn = new mysqli($host, $username, $password, $database, $port);
if ($conn->connect_error) {
    die("Database connection failed: " . $conn->connect_error);
}
$conn->set_charset("utf8mb4");
$conn->query("SET time_zone = '+08:00'");
?>