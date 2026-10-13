<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once __DIR__ . '/../php/db_connect.php';
function notificationResponse(bool $success, string $message = '', $data = null, int $status = 200): void {
    http_response_code($status);
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}
if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    notificationResponse(false, 'Authentication required.', null, 401);
}
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if (!in_array($role, ['staff', 'doctor'], true)) {
    notificationResponse(false, 'Unauthorized access.', null, 403);
}
$type = trim((string) ($_GET['type'] ?? 'general'));
$method = strtoupper($_SERVER['REQUEST_METHOD']);
if ($type === '') {
    notificationResponse(false, 'Notification type is required.', null, 422);
}
if ($role === 'doctor' && $type !== 'inventory') {
    notificationResponse(false, 'Doctors may access inventory notifications only.', null, 403);
}
if ($method === 'GET') {
    $stmt = $conn->prepare('SELECT notification_id, payload FROM tbl_staff_notifications WHERE notification_type = ? ORDER BY created_at DESC');
    if (!$stmt) {
        notificationResponse(false, 'Unable to prepare notification query.', null, 500);
    }
    $stmt->bind_param('s', $type);
    if (!$stmt->execute()) {
        $stmt->close();
        notificationResponse(false, 'Unable to load notifications.', null, 500);
    }
    $result = $stmt->get_result();
    $data = [];
    while ($row = $result->fetch_assoc()) {
        $payload = json_decode((string) $row['payload'], true);
        if (is_array($payload)) {
            $data[] = $payload;
        }
    }
    $stmt->close();
    notificationResponse(true, 'Notifications loaded.', $data);
}
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = [];
}
if ($method === 'DELETE') {
    $id = trim((string) ($input['id'] ?? $_GET['id'] ?? ''));
    if ($id === '') {
        notificationResponse(false, 'Notification ID is required.', null, 422);
    }
    $stmt = $conn->prepare('DELETE FROM tbl_staff_notifications WHERE notification_id = ? AND notification_type = ? LIMIT 1');
    if (!$stmt) {
        notificationResponse(false, 'Unable to prepare notification deletion.', null, 500);
    }
    $stmt->bind_param('ss', $id, $type);
    if (!$stmt->execute()) {
        $stmt->close();
        notificationResponse(false, 'Unable to delete notification.', null, 500);
    }
    $deleted = $stmt->affected_rows === 1;
    $stmt->close();
    notificationResponse($deleted, $deleted ? 'Notification deleted.' : 'Notification not found.', null, $deleted ? 200 : 404);
}
if ($method !== 'POST') {
    header('Allow: GET, POST, DELETE');
    notificationResponse(false, 'Unsupported request method.', null, 405);
}
$notifications = $input['notifications'] ?? [];
if (!is_array($notifications)) {
    notificationResponse(false, 'Notifications must be an array.', null, 422);
}
$conn->begin_transaction();
try {
    $stmt = $conn->prepare('INSERT INTO tbl_staff_notifications (notification_id, notification_type, payload, created_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE notification_type = VALUES(notification_type), payload = VALUES(payload), created_by = VALUES(created_by), updated_at = NOW()');
    if (!$stmt) {
        throw new RuntimeException('Unable to prepare notification save.');
    }
    $userId = (int) $_SESSION['user_id'];
    foreach ($notifications as $notification) {
        if (!is_array($notification)) {
            continue;
        }
        $id = trim((string) ($notification['id'] ?? ''));
        if ($id === '') {
            continue;
        }
        $payload = json_encode($notification, JSON_UNESCAPED_UNICODE);
        if ($payload === false) {
            throw new RuntimeException('Unable to encode notification data.');
        }
        $stmt->bind_param('sssi', $id, $type, $payload, $userId);
        if (!$stmt->execute()) {
            throw new RuntimeException('Unable to save notification.');
        }
    }
    $stmt->close();
    $conn->commit();
} catch (Throwable $exception) {
    if (isset($stmt) && $stmt instanceof mysqli_stmt) {
        $stmt->close();
    }
    $conn->rollback();
    error_log('Staff notifications API error: ' . $exception->getMessage());
    notificationResponse(false, 'Unable to save notifications.', null, 500);
}
notificationResponse(true, 'Notifications saved.');
