<?php
$host = "127.0.0.1";
$port = 3307;
$username = "root";
$password = "";
$database = "dental_clinic_system";

$liveConfigPath = __DIR__ . "/db_credentials.php";
$requestHost = strtolower($_SERVER["HTTP_HOST"] ?? $_SERVER["SERVER_NAME"] ?? "localhost");
$requestHost = preg_replace('/:\d+$/', '', $requestHost);

$isLocal = in_array($requestHost, ["localhost", "127.0.0.1"], true)
    || str_ends_with($requestHost, ".ngrok-free.dev")
    || str_ends_with($requestHost, ".ngrok-free.app")
    || str_ends_with($requestHost, ".ngrok.io");

if (!$isLocal && file_exists($liveConfigPath)) {
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