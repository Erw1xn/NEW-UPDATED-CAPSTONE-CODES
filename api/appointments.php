<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once __DIR__ . '/../php/db_connect.php';
function appointmentResponse(bool $success, string $message = '', $data = null, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}
if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    appointmentResponse(false, 'Authentication required.', null, 401);
}
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$userId = (int) $_SESSION['user_id'];
$method = strtoupper($_SERVER['REQUEST_METHOD']);
function appointmentPatientAccess(mysqli $conn, string $patientId, int $userId, string $role): void
{
    if ($role === 'doctor' || $role === 'staff') {
        return;
    }
    $stmt = $conn->prepare('SELECT patient_id FROM tbl_patients WHERE patient_id = ? AND user_id = ? LIMIT 1');
    $stmt->bind_param('si', $patientId, $userId);
    $stmt->execute();
    $allowed = $stmt->get_result()->num_rows === 1;
    $stmt->close();
    if (!$allowed) {
        appointmentResponse(false, 'You may access only your own appointments.', null, 403);
    }
}
function appointmentDoctorUserId(mysqli $conn, string $value): ?int
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
function appointmentDoctorUnavailable(mysqli $conn, int $doctorUserId, string $date, string $time, int $duration): bool
{
    $parts = explode(':', $time);
    $startMinutes = ((int) ($parts[0] ?? 0)) * 60 + (int) ($parts[1] ?? 0);
    $endMinutes = min($startMinutes + max($duration, 1), 1439);
    $startTime = sprintf('%02d:%02d:00', intdiv($startMinutes, 60), $startMinutes % 60);
    $endTime = sprintf('%02d:%02d:00', intdiv($endMinutes, 60), $endMinutes % 60);
    $stmt = $conn->prepare('SELECT unavailability_id FROM tbl_doctor_unavailability WHERE doctor_id = ? AND unavailable_date = ? AND (all_day = 1 OR (start_time < ? AND end_time > ?)) LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('isss', $doctorUserId, $date, $endTime, $startTime);
    $stmt->execute();
    $blocked = $stmt->get_result()->num_rows > 0;
    $stmt->close();
    return $blocked;
}
function appointmentPayload(array $row): array
{
    $doctorId = (string) ($row['doctor_code'] ?? '');
    $doctorName = trim((string) ($row['doctor_name'] ?? ''));
    $patientName = trim((string) (($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')));
    $metadata = json_decode((string) ($row['metadata'] ?? ''), true);
    $metadata = is_array($metadata) ? $metadata : [];
    return array_merge($metadata, [
        'id' => $row['appointment_uid'] ?: (string) $row['appointment_id'],
        'appointmentId' => $row['appointment_uid'] ?: (string) $row['appointment_id'],
        'appointment_uid' => $row['appointment_uid'],
        'appointment_id' => (int) $row['appointment_id'],
        'databaseAppointmentId' => (int) $row['appointment_id'],
        'patientId' => $row['patient_id'],
        'patient_id' => $row['patient_id'],
        'patient' => $patientName,
        'date' => $row['appointment_date'],
        'appointment_date' => $row['appointment_date'],
        'start' => $row['appointment_time'],
        'time' => $row['appointment_time'],
        'appointment_time' => $row['appointment_time'],
        'type' => $row['service_type'],
        'service' => $row['service_type'],
        'service_type' => $row['service_type'],
        'dentist' => $doctorId,
        'dentistId' => $doctorId,
        'dentist_id' => $doctorId,
        'doctorId' => $doctorId,
        'doctor_id' => $doctorId,
        'doctorName' => $doctorName,
        'doctor_name' => $doctorName,
        'dentistName' => $doctorName,
        'dentist_name' => $doctorName,
        'duration' => (int) $row['duration_minutes'],
        'status' => $row['status'],
        'checkedIn' => (bool) $row['checked_in'],
        'checkedInAt' => $row['checked_in_at'],
        'consultationStarted' => (bool) $row['consultation_started'],
        'manualReadyComplete' => (bool) $row['manual_ready_complete'],
        'paymentStatus' => $row['payment_status'],
        'paymentAmount' => (float) $row['payment_amount'],
        'cancelledAt' => $row['cancelled_at'],
    ]);
}
function loadAppointments(mysqli $conn, string $patientId = ''): array
{
    $sql = "SELECT a.*, p.first_name, p.last_name, COALESCE(NULLIF(u.doctor_id, ''), CONCAT('DOC-', LPAD(u.user_id, 4, '0'))) AS doctor_code, TRIM(COALESCE(u.name, CONCAT(u.firstname, ' ', u.lastname))) AS doctor_name FROM tbl_patient_appointments a JOIN tbl_patients p ON p.patient_id = a.patient_id LEFT JOIN tbl_users u ON u.user_id = a.doctor_id";
    if ($patientId !== '') {
        $sql .= ' WHERE a.patient_id = ?';
    }
    $sql .= ' ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.appointment_id DESC';
    $stmt = $conn->prepare($sql);
    if ($patientId !== '') {
        $stmt->bind_param('s', $patientId);
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $appointments = [];
    while ($row = $result->fetch_assoc()) {
        $appointments[] = appointmentPayload($row);
    }
    $stmt->close();
    return $appointments;
}
if ($method === 'GET') {
    $scope = strtolower(trim((string) ($_GET['scope'] ?? '')));
    $doctorId = trim((string) ($_GET['doctor_id'] ?? $_GET['dentist_id'] ?? ''));
    $date = trim((string) ($_GET['date'] ?? ''));
    if ($scope === 'reschedule_requests') {
        $sql = "SELECT r.*, a.appointment_uid, a.appointment_date AS current_sched_date, a.appointment_time AS current_sched_time FROM tbl_reschedule_requests r JOIN tbl_patient_appointments a ON a.appointment_id = r.appointment_id";
        $patientId = '';
        if ($role === 'user') {
            $patientId = 'PN-' . str_pad((string) $userId, 4, '0', STR_PAD_LEFT);
            $sql .= ' WHERE r.patient_id = ?';
        }
        $sql .= ' ORDER BY r.created_at DESC, r.reschedule_request_id DESC';
        $stmt = $conn->prepare($sql);
        if ($role === 'user') {
            $stmt->bind_param('s', $patientId);
        }
        $stmt->execute();
        $result = $stmt->get_result();
        $requests = [];
        while ($row = $result->fetch_assoc()) {
            $requests[] = array_merge($row, [
                'id' => $row['request_id'],
                'requestId' => $row['request_id'],
                'appointment_id' => $row['appointment_uid'] ?: (string) $row['appointment_id'],
                'appointmentId' => $row['appointment_uid'] ?: (string) $row['appointment_id'],
                'databaseAppointmentId' => (int) $row['appointment_id'],
                'status' => $row['status'],
            ]);
        }
        $stmt->close();
        appointmentResponse(true, 'Reschedule requests loaded.', $requests);
    }
    if ($scope === 'doctor_schedule' && $doctorId !== '' && $date !== '') {
        $doctorUserId = appointmentDoctorUserId($conn, $doctorId);
        $sql = "SELECT a.*, p.first_name, p.last_name, COALESCE(NULLIF(u.doctor_id, ''), CONCAT('DOC-', LPAD(u.user_id, 4, '0'))) AS doctor_code, TRIM(COALESCE(u.name, CONCAT(u.firstname, ' ', u.lastname))) AS doctor_name FROM tbl_patient_appointments a JOIN tbl_patients p ON p.patient_id = a.patient_id LEFT JOIN tbl_users u ON u.user_id = a.doctor_id WHERE a.appointment_date = ? AND (a.doctor_id = ? OR u.doctor_id = ? OR u.user_id = ?) ORDER BY a.appointment_time ASC";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('sisi', $date, $doctorUserId, $doctorId, $doctorUserId);
        $stmt->execute();
        $result = $stmt->get_result();
        $appointments = [];
        while ($row = $result->fetch_assoc()) {
            $appointments[] = appointmentPayload($row);
        }
        $stmt->close();
        appointmentResponse(true, 'Doctor schedule loaded.', $appointments);
    }
    $patientId = trim((string) ($_GET['patient_id'] ?? ''));
    if ($role === 'user') {
        $patientId = 'PN-' . str_pad((string) $userId, 4, '0', STR_PAD_LEFT);
    }
    if ($patientId !== '') {
        appointmentPatientAccess($conn, $patientId, $userId, $role);
    }
    appointmentResponse(true, 'Appointments loaded.', loadAppointments($conn, $patientId));
}
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}
if ($method === 'DELETE') {
    $appointmentId = trim((string) ($input['id'] ?? $_GET['id'] ?? ''));
    if ($appointmentId === '') {
        appointmentResponse(false, 'Appointment ID is required.', null, 422);
    }
    $numericAppointmentId = ctype_digit($appointmentId) ? (int) $appointmentId : 0;
    $stmt = $conn->prepare('SELECT patient_id FROM tbl_patient_appointments WHERE appointment_uid = ? OR appointment_id = ? LIMIT 1');
    $stmt->bind_param('si', $appointmentId, $numericAppointmentId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) {
        appointmentResponse(true, 'Appointment already removed.');
    }
    appointmentPatientAccess($conn, $row['patient_id'], $userId, $role);
    $stmt = $conn->prepare('DELETE FROM tbl_patient_appointments WHERE appointment_uid = ? OR appointment_id = ?');
    $stmt->bind_param('si', $appointmentId, $numericAppointmentId);
    $stmt->execute();
    $stmt->close();
    appointmentResponse(true, 'Appointment deleted.');
}
if ($method !== 'POST') {
    appointmentResponse(false, 'Unsupported request method.', null, 405);
}
if (isset($input['reschedule']) && is_array($input['reschedule'])) {
    $appointment = $input['reschedule'];
    $appointmentId = trim((string) ($appointment['id'] ?? $appointment['appointmentId'] ?? $appointment['appointment_id'] ?? ''));
    $patientId = trim((string) ($appointment['patientId'] ?? $appointment['patient_id'] ?? ''));
    $date = trim((string) ($appointment['date'] ?? $appointment['appointment_date'] ?? ''));
    $time = trim((string) ($appointment['start'] ?? $appointment['time'] ?? $appointment['appointment_time'] ?? ''));
    if ($appointmentId === '' || $patientId === '' || $date === '' || $time === '') {
        appointmentResponse(false, 'Appointment ID, date, and time are required.', null, 422);
    }
    appointmentPatientAccess($conn, $patientId, $userId, $role);
    $numericAppointmentId = ctype_digit($appointmentId) ? (int) $appointmentId : 0;
    $metadata = json_encode($appointment, JSON_UNESCAPED_UNICODE);
    $lookup = $conn->prepare('SELECT appointment_id, patient_id, doctor_id, appointment_date, appointment_time, duration_minutes FROM tbl_patient_appointments WHERE appointment_uid = ? OR appointment_id = ? LIMIT 1');
    $lookup->bind_param('si', $appointmentId, $numericAppointmentId);
    $lookup->execute();
    $existing = $lookup->get_result()->fetch_assoc();
    $lookup->close();
    if (!$existing || (string) $existing['patient_id'] !== $patientId) {
        appointmentResponse(false, 'Appointment could not be found for this patient.', null, 404);
    }
    $scheduleChanged = (string) $existing['appointment_date'] !== $date || substr((string) $existing['appointment_time'], 0, 5) !== substr($time, 0, 5);
    if ($scheduleChanged && $existing['doctor_id'] !== null && appointmentDoctorUnavailable($conn, (int) $existing['doctor_id'], $date, $time, (int) $existing['duration_minutes'])) {
        appointmentResponse(false, 'The doctor is unavailable on the selected date and time.', null, 409);
    }
    $databaseAppointmentId = (int) $existing['appointment_id'];
    $stmt = $conn->prepare('UPDATE tbl_patient_appointments SET appointment_date = ?, appointment_time = ?, status = ?, metadata = ?, updated_at = NOW() WHERE appointment_id = ? LIMIT 1');
    if (!$stmt) {
        appointmentResponse(false, 'Appointment schedule update could not be prepared.', null, 500);
    }
    $status = strtolower(str_replace(' ', '_', (string) ($appointment['status'] ?? 'scheduled')));
    $stmt->bind_param('ssssi', $date, $time, $status, $metadata, $databaseAppointmentId);
    if (!$stmt->execute()) {
        $stmt->close();
        appointmentResponse(false, 'Appointment schedule could not be updated.', null, 500);
    }
    $stmt->close();
    appointmentResponse(true, 'Appointment rescheduled.', loadAppointments($conn, $patientId));
}
if (isset($input['reschedule_requests'])) {
    $requests = is_array($input['reschedule_requests']) ? $input['reschedule_requests'] : [];
    foreach ($requests as $request) {
        if (!is_array($request)) {
            continue;
        }
        $requestId = trim((string) ($request['request_id'] ?? $request['requestId'] ?? $request['id'] ?? ''));
        $appointmentValue = trim((string) ($request['appointment_id'] ?? $request['appointmentId'] ?? ''));
        $patientId = trim((string) ($request['patient_id'] ?? $request['patientId'] ?? ''));
        if ($requestId === '' || $appointmentValue === '' || $patientId === '') {
            continue;
        }
        appointmentPatientAccess($conn, $patientId, $userId, $role);
        $numericAppointmentId = ctype_digit($appointmentValue) ? (int) $appointmentValue : 0;
        $lookup = $conn->prepare('SELECT appointment_id FROM tbl_patient_appointments WHERE appointment_uid = ? OR appointment_id = ? LIMIT 1');
        $lookup->bind_param('si', $appointmentValue, $numericAppointmentId);
        $lookup->execute();
        $appointmentRow = $lookup->get_result()->fetch_assoc();
        $lookup->close();
        if (!$appointmentRow) {
            continue;
        }
        $appointmentId = (int) $appointmentRow['appointment_id'];
        $status = strtolower(str_replace(' ', '_', (string) ($request['status'] ?? 'pending')));
        if (!in_array($status, ['pending', 'approved', 'rejected'], true)) {
            $status = 'pending';
        }
        $requestedBy = strtolower((string) ($request['requested_by'] ?? ($role === 'user' ? 'patient' : $role)));
        if (!in_array($requestedBy, ['patient', 'staff', 'doctor'], true)) {
            $requestedBy = 'patient';
        }
        $reason = (string) ($request['reason'] ?? '');
        $reasonLabel = (string) ($request['reason_label'] ?? $request['reasonLabel'] ?? '');
        $message = (string) ($request['message'] ?? '');
        $preferredDate = (string) ($request['preferred_date'] ?? $request['preferredDate'] ?? '');
        $preferredTime = (string) ($request['preferred_time'] ?? $request['preferredTime'] ?? '');
        $approvedDate = (string) ($request['approved_date'] ?? $request['approvedDate'] ?? '');
        $approvedTime = (string) ($request['approved_time'] ?? $request['approvedTime'] ?? '');
        $patientAcknowledged = !empty($request['patient_acknowledged']) || !empty($request['patientAcknowledged']) ? 1 : 0;
        $patientAcknowledgedAt = (string) ($request['patient_acknowledged_at'] ?? $request['patientAcknowledgedAt'] ?? '');
        $stmt = $conn->prepare('INSERT INTO tbl_reschedule_requests (appointment_id, patient_id, request_id, status, requested_by, reason, reason_label, message, preferred_date, preferred_time, approved_date, approved_time, patient_acknowledged, patient_acknowledged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULLIF(?, ""), NULLIF(?, ""), NULLIF(?, ""), NULLIF(?, ""), ?, NULLIF(?, "")) ON DUPLICATE KEY UPDATE status = VALUES(status), requested_by = VALUES(requested_by), reason = VALUES(reason), reason_label = VALUES(reason_label), message = VALUES(message), preferred_date = VALUES(preferred_date), preferred_time = VALUES(preferred_time), approved_date = VALUES(approved_date), approved_time = VALUES(approved_time), patient_acknowledged = VALUES(patient_acknowledged), patient_acknowledged_at = VALUES(patient_acknowledged_at), updated_at = NOW()');
        $stmt->bind_param('isssssssssssis', $appointmentId, $patientId, $requestId, $status, $requestedBy, $reason, $reasonLabel, $message, $preferredDate, $preferredTime, $approvedDate, $approvedTime, $patientAcknowledged, $patientAcknowledgedAt);
        $stmt->execute();
        $stmt->close();
    }
    appointmentResponse(true, 'Reschedule requests saved.');
}
$records = $input['appointments'] ?? [$input['appointment'] ?? $input];
if (!is_array($records) || isset($records['id']) || isset($records['appointmentId'])) {
    $records = [$records];
}
$conn->begin_transaction();
try {
    foreach ($records as $appointment) {
        if (!is_array($appointment)) {
            continue;
        }
        $appointmentId = trim((string) ($appointment['id'] ?? $appointment['appointmentId'] ?? ''));
        $patientId = trim((string) ($appointment['patientId'] ?? $appointment['patient_id'] ?? ''));
        if ($appointmentId === '' || $patientId === '') {
            continue;
        }
        appointmentPatientAccess($conn, $patientId, $userId, $role);
        $doctorValue = (string) ($appointment['dentist_id'] ?? $appointment['dentistId'] ?? $appointment['doctor_id'] ?? $appointment['doctorId'] ?? $appointment['dentist'] ?? '');
        $doctorUserId = appointmentDoctorUserId($conn, $doctorValue);
        if ($doctorUserId === null) {
            throw new RuntimeException('A valid doctor is required before saving an appointment.');
        }
        $date = (string) ($appointment['date'] ?? $appointment['appointment_date'] ?? '');
        $time = (string) ($appointment['start'] ?? $appointment['time'] ?? $appointment['appointment_time'] ?? '');
        $service = (string) ($appointment['type'] ?? $appointment['service'] ?? $appointment['service_type'] ?? 'Dental Appointment');
        $duration = (int) ($appointment['duration'] ?? $appointment['duration_minutes'] ?? 30);
        $status = strtolower(str_replace(' ', '_', (string) ($appointment['status'] ?? 'scheduled')));
        if (!in_array($status, ['cancelled', 'completed', 'no_show'], true) && $date !== '' && $time !== '') {
            $existingStmt = $conn->prepare('SELECT doctor_id, appointment_date, appointment_time FROM tbl_patient_appointments WHERE appointment_uid = ? LIMIT 1');
            $existingStmt->bind_param('s', $appointmentId);
            $existingStmt->execute();
            $existingRow = $existingStmt->get_result()->fetch_assoc();
            $existingStmt->close();
            $scheduleChanged = !$existingRow || (int) $existingRow['doctor_id'] !== $doctorUserId || (string) $existingRow['appointment_date'] !== $date || substr((string) $existingRow['appointment_time'], 0, 5) !== substr($time, 0, 5);
            if ($scheduleChanged && appointmentDoctorUnavailable($conn, $doctorUserId, $date, $time, $duration)) {
                throw new RuntimeException('The selected doctor is unavailable on this date and time.');
            }
        }
        $metadata = json_encode($appointment, JSON_UNESCAPED_UNICODE);
        $checkedIn = !empty($appointment['checkedIn']) || !empty($appointment['checked_in']) ? 1 : 0;
        $checkedInAt = (string) ($appointment['checkedInAt'] ?? $appointment['checked_in_at'] ?? '');
        $consultationStarted = !empty($appointment['consultationStarted']) ? 1 : 0;
        $readyComplete = !empty($appointment['manualReadyComplete']) ? 1 : 0;
        $paymentStatus = (string) ($appointment['paymentStatus'] ?? 'unpaid');
        $paymentAmount = (float) ($appointment['paymentAmount'] ?? 0);
        $cancelledAt = (string) ($appointment['cancelledAt'] ?? $appointment['cancelled_at'] ?? '');
        $stmt = $conn->prepare('INSERT INTO tbl_patient_appointments (appointment_uid, patient_id, doctor_id, appointment_date, appointment_time, service_type, duration_minutes, status, checked_in, checked_in_at, consultation_started, manual_ready_complete, payment_status, payment_amount, cancelled_at, metadata) VALUES (?, ?, ?, NULLIF(?, ""), NULLIF(?, ""), ?, ?, ?, ?, NULLIF(?, ""), ?, ?, ?, ?, NULLIF(?, ""), ?) ON DUPLICATE KEY UPDATE patient_id = VALUES(patient_id), doctor_id = COALESCE(VALUES(doctor_id), doctor_id), appointment_date = VALUES(appointment_date), appointment_time = VALUES(appointment_time), service_type = VALUES(service_type), duration_minutes = VALUES(duration_minutes), status = VALUES(status), checked_in = VALUES(checked_in), checked_in_at = VALUES(checked_in_at), consultation_started = VALUES(consultation_started), manual_ready_complete = VALUES(manual_ready_complete), payment_status = VALUES(payment_status), payment_amount = VALUES(payment_amount), cancelled_at = VALUES(cancelled_at), metadata = VALUES(metadata), updated_at = NOW()');
        if (!$stmt) {
            throw new RuntimeException('Appointment query could not be prepared: ' . $conn->error);
        }
        $stmt->bind_param('ssisssisisiisdss', $appointmentId, $patientId, $doctorUserId, $date, $time, $service, $duration, $status, $checkedIn, $checkedInAt, $consultationStarted, $readyComplete, $paymentStatus, $paymentAmount, $cancelledAt, $metadata);
        if (!$stmt->execute()) {
            $error = $stmt->error;
            $stmt->close();
            throw new RuntimeException('Appointment could not be saved: ' . $error);
        }
        $stmt->close();
    }
    $conn->commit();
} catch (Throwable $exception) {
    $conn->rollback();
    appointmentResponse(false, $exception->getMessage(), null, 500);
}
$savedPatientId = '';
foreach ($records as $record) {
    if (is_array($record)) {
        $savedPatientId = trim((string) ($record['patientId'] ?? $record['patient_id'] ?? ''));
        if ($savedPatientId !== '') break;
    }
}
appointmentResponse(true, 'Appointments saved.', loadAppointments($conn, $savedPatientId));