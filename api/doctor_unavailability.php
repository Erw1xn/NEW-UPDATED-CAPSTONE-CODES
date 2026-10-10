<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once __DIR__ . '/../php/db_connect.php';
function unavailabilityResponse(bool $success, string $message = '', $data = null, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}
if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    unavailabilityResponse(false, 'Authentication required.', null, 401);
}
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$userId = (int) $_SESSION['user_id'];
$method = strtoupper($_SERVER['REQUEST_METHOD']);
function unavailabilityDoctorUserId(mysqli $conn, string $value): ?int
{
    $value = trim($value);
    if ($value === '') {
        return null;
    }
    $numericValue = ctype_digit($value) ? (int) $value : 0;
    if (preg_match('/^DOC-(\d+)$/i', $value, $matches)) {
        $numericValue = (int) $matches[1];
    }
    $stmt = $conn->prepare("SELECT user_id FROM tbl_users WHERE LOWER(role) = 'doctor' AND (doctor_id = ? OR user_id = ?) LIMIT 1");
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param('si', $value, $numericValue);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? (int) $row['user_id'] : null;
}
function unavailabilityTime(string $value): ?string
{
    if (!preg_match('/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/', trim($value), $matches)) {
        return null;
    }
    return sprintf('%02d:%s', (int) $matches[1], $matches[2]);
}
function unavailabilityDate(string $value): ?string
{
    $date = DateTime::createFromFormat('Y-m-d', trim($value));
    return $date && $date->format('Y-m-d') === trim($value) ? trim($value) : null;
}
function unavailabilityPayload(array $row): array
{
    $doctorCode = (string) ($row['doctor_code'] ?? '');
    $doctorName = trim((string) ($row['doctor_name'] ?? ''));
    $start = substr((string) $row['start_time'], 0, 5);
    $end = substr((string) $row['end_time'], 0, 5);
    $allDay = (bool) $row['all_day'];
    return [
        'id' => (int) $row['unavailability_id'],
        'unavailability_id' => (int) $row['unavailability_id'],
        'unavailability_uid' => $row['unavailability_uid'],
        'uid' => $row['unavailability_uid'],
        'date' => $row['unavailable_date'],
        'unavailable_date' => $row['unavailable_date'],
        'start' => $start,
        'start_time' => $start,
        'end' => $end,
        'end_time' => $end,
        'allDay' => $allDay,
        'all_day' => $allDay,
        'reason' => (string) ($row['reason'] ?? ''),
        'doctorId' => $doctorCode,
        'doctor_id' => $doctorCode,
        'doctorUserId' => (int) $row['doctor_id'],
        'doctorName' => $doctorName,
        'doctor_name' => $doctorName,
        'createdAt' => $row['created_at'],
    ];
}
function unavailabilityConflictCount(mysqli $conn, int $doctorUserId, string $date, string $startTime, string $endTime): int
{
    $stmt = $conn->prepare("SELECT COUNT(*) AS total FROM tbl_patient_appointments WHERE doctor_id = ? AND appointment_date = ? AND LOWER(status) NOT IN ('cancelled', 'completed', 'no_show') AND appointment_time < ? AND ADDTIME(appointment_time, SEC_TO_TIME(duration_minutes * 60)) > ?");
    if (!$stmt) {
        return 0;
    }
    $stmt->bind_param('isss', $doctorUserId, $date, $endTime, $startTime);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return (int) ($row['total'] ?? 0);
}
try {
    if ($method === 'GET') {
        $sql = "SELECT t.*, COALESCE(NULLIF(u.doctor_id, ''), CONCAT('DOC-', LPAD(u.user_id, 4, '0'))) AS doctor_code, TRIM(COALESCE(NULLIF(u.name, ''), CONCAT(u.firstname, ' ', u.lastname))) AS doctor_name FROM tbl_doctor_unavailability t JOIN tbl_users u ON u.user_id = t.doctor_id";
        $conditions = [];
        $types = '';
        $params = [];
        if ($role === 'doctor') {
            $conditions[] = 't.doctor_id = ?';
            $types .= 'i';
            $params[] = $userId;
        } else {
            $doctorFilter = trim((string) ($_GET['doctor_id'] ?? $_GET['dentist_id'] ?? ''));
            if ($doctorFilter !== '') {
                $doctorFilterId = unavailabilityDoctorUserId($conn, $doctorFilter);
                if ($doctorFilterId === null) {
                    unavailabilityResponse(true, 'Unavailability loaded.', []);
                }
                $conditions[] = 't.doctor_id = ?';
                $types .= 'i';
                $params[] = $doctorFilterId;
            }
        }
        $dateFilter = unavailabilityDate((string) ($_GET['date'] ?? ''));
        if ($dateFilter !== null) {
            $conditions[] = 't.unavailable_date = ?';
            $types .= 's';
            $params[] = $dateFilter;
        }
        if ($conditions) {
            $sql .= ' WHERE ' . implode(' AND ', $conditions);
        }
        $sql .= ' ORDER BY t.unavailable_date ASC, t.start_time ASC, t.unavailability_id ASC';
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            unavailabilityResponse(false, 'Unavailability could not be loaded.', null, 500);
        }
        if ($params) {
            $stmt->bind_param($types, ...$params);
        }
        $stmt->execute();
        $result = $stmt->get_result();
        $blocks = [];
        while ($row = $result->fetch_assoc()) {
            $blocks[] = unavailabilityPayload($row);
        }
        $stmt->close();
        unavailabilityResponse(true, 'Unavailability loaded.', $blocks);
    }
    if ($role !== 'doctor') {
        unavailabilityResponse(false, 'Only doctors can manage unavailability.', null, 403);
    }
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        $input = $_POST;
    }
    if ($method === 'DELETE') {
        $blockId = trim((string) ($input['id'] ?? $_GET['id'] ?? ''));
        if ($blockId === '') {
            unavailabilityResponse(false, 'Unavailability ID is required.', null, 422);
        }
        $numericBlockId = ctype_digit($blockId) ? (int) $blockId : 0;
        $stmt = $conn->prepare('SELECT unavailability_id, unavailable_date FROM tbl_doctor_unavailability WHERE (unavailability_id = ? OR unavailability_uid = ?) AND doctor_id = ? LIMIT 1');
        $stmt->bind_param('isi', $numericBlockId, $blockId, $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            unavailabilityResponse(false, 'Unavailability record could not be found.', null, 404);
        }
        if ((string) $row['unavailable_date'] < date('Y-m-d')) {
            unavailabilityResponse(false, 'Past unavailability records cannot be removed.', null, 422);
        }
        $deleteId = (int) $row['unavailability_id'];
        $stmt = $conn->prepare('DELETE FROM tbl_doctor_unavailability WHERE unavailability_id = ? AND doctor_id = ? LIMIT 1');
        $stmt->bind_param('ii', $deleteId, $userId);
        $stmt->execute();
        $stmt->close();
        unavailabilityResponse(true, 'Schedule is open again.');
    }
    if ($method !== 'POST') {
        unavailabilityResponse(false, 'Unsupported request method.', null, 405);
    }
    $date = unavailabilityDate((string) ($input['date'] ?? $input['unavailable_date'] ?? ''));
    if ($date === null) {
        unavailabilityResponse(false, 'A valid date is required.', null, 422);
    }
    if ($date < date('Y-m-d')) {
        unavailabilityResponse(false, 'Past dates cannot be marked unavailable.', null, 422);
    }
    $allDayValue = $input['allDay'] ?? $input['all_day'] ?? false;
    $allDay = $allDayValue === true || $allDayValue === 1 || $allDayValue === '1' || $allDayValue === 'true';
    if ($allDay) {
        $startTime = '10:00';
        $endTime = '18:00';
    } else {
        $startTime = unavailabilityTime((string) ($input['start'] ?? $input['start_time'] ?? ''));
        $endTime = unavailabilityTime((string) ($input['end'] ?? $input['end_time'] ?? ''));
        if ($startTime === null || $endTime === null) {
            unavailabilityResponse(false, 'A valid start and end time are required.', null, 422);
        }
        if ($startTime >= $endTime) {
            unavailabilityResponse(false, 'End time must be later than start time.', null, 422);
        }
        if ($date === date('Y-m-d') && $endTime <= date('H:i')) {
            unavailabilityResponse(false, 'The selected time has already passed.', null, 422);
        }
    }
    $startSql = $startTime . ':00';
    $endSql = $endTime . ':00';
    $reason = mb_substr(trim((string) ($input['reason'] ?? '')), 0, 150);
    $stmt = $conn->prepare('SELECT unavailability_id FROM tbl_doctor_unavailability WHERE doctor_id = ? AND unavailable_date = ? AND (all_day = 1 OR (start_time < ? AND end_time > ?)) LIMIT 1');
    $stmt->bind_param('isss', $userId, $date, $endSql, $startSql);
    $stmt->execute();
    $overlaps = $stmt->get_result()->num_rows > 0;
    $stmt->close();
    if ($overlaps) {
        unavailabilityResponse(false, 'This date or time is already marked unavailable.', null, 409);
    }
    $uid = 'unav_' . bin2hex(random_bytes(8));
    $allDayFlag = $allDay ? 1 : 0;
    $stmt = $conn->prepare('INSERT INTO tbl_doctor_unavailability (unavailability_uid, doctor_id, unavailable_date, start_time, end_time, all_day, reason) VALUES (?, ?, ?, ?, ?, ?, NULLIF(?, ""))');
    if (!$stmt) {
        unavailabilityResponse(false, 'Unavailability could not be saved.', null, 500);
    }
    $stmt->bind_param('sisssis', $uid, $userId, $date, $startSql, $endSql, $allDayFlag, $reason);
    if (!$stmt->execute()) {
        $stmt->close();
        unavailabilityResponse(false, 'Unavailability could not be saved.', null, 500);
    }
    $insertId = (int) $stmt->insert_id;
    $stmt->close();
    $conflictCount = unavailabilityConflictCount($conn, $userId, $date, $startSql, $endSql);
    unavailabilityResponse(true, 'Unavailable time saved.', [
        'id' => $insertId,
        'unavailability_uid' => $uid,
        'date' => $date,
        'start' => $startTime,
        'end' => $endTime,
        'allDay' => $allDay,
        'reason' => $reason,
        'conflictCount' => $conflictCount,
    ]);
} catch (Throwable $exception) {
    unavailabilityResponse(false, 'Unavailability request failed.', null, 500);
}