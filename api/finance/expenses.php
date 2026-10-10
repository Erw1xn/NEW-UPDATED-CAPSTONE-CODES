<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
require_once __DIR__ . '/../../php/db_connect.php';
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
function expenseResponse(bool $success, string $message, $data = [], int $status = 200): void
{
    http_response_code($status);
    echo json_encode(
        ['success' => $success, 'message' => $message, 'data' => $data],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}
if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    expenseResponse(false, 'Authentication required.', [], 401);
}
$role = strtolower(trim((string)($_SESSION['role'] ?? '')));
$userId = (int)$_SESSION['user_id'];
if ($role !== 'doctor' && $role !== 'staff') {
    expenseResponse(false, 'Only staff or doctors may access clinic expenses.', [], 403);
}
$expenseOwnerId = $role === 'doctor' ? $userId : null;
$conn->query(
    "CREATE TABLE IF NOT EXISTS tbl_finance_expenses (
        expense_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        expense_uid VARCHAR(80) NOT NULL UNIQUE,
        category VARCHAR(40) NOT NULL,
        description VARCHAR(255) NOT NULL DEFAULT '',
        amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        expense_date DATE NOT NULL,
        created_by INT UNSIGNED DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_expense_date (expense_date),
        KEY idx_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
);
const MANUAL_CATEGORIES = [
    'utilities' => 'Utilities',
    'maintenance' => 'Equipment Maintenance',
    'rent_facilities' => 'Rent and Facilities',
    'other' => 'Other Expenses'
];
function parseMonth(string $value): array
{
    if (!preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/', $value, $match)) {
        $value = date('Y-m');
        preg_match('/^(\d{4})-(\d{2})$/', $value, $match);
    }
    $start = $match[1] . '-' . $match[2] . '-01';
    $end = date('Y-m-d', strtotime($start . ' +1 month'));
    return [$value, $start, $end, (int)$match[1]];
}
function fetchAll(mysqli $conn, string $sql, string $types = '', array $params = []): array
{
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        expenseResponse(false, 'Unable to prepare expense query.', [], 500);
    }
    if ($types !== '') {
        $stmt->bind_param($types, ...$params);
    }
    if (!$stmt->execute()) {
        $stmt->close();
        expenseResponse(false, 'Unable to run expense query.', [], 500);
    }
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
}
function manualExpenseTotals(mysqli $conn, string $start, string $end, ?int $ownerId = null): array
{
    $sql = 'SELECT category, SUM(amount) AS total
         FROM tbl_finance_expenses
         WHERE expense_date >= ? AND expense_date < ?';
    $types = 'ss';
    $params = [$start, $end];
    if ($ownerId !== null) {
        $sql .= ' AND created_by = ?';
        $types .= 'i';
        $params[] = $ownerId;
    }
    $sql .= ' GROUP BY category';
    $rows = fetchAll($conn, $sql, $types, $params);
    $totals = [];
    foreach ($rows as $row) {
        $totals[(string)$row['category']] = (float)$row['total'];
    }
    return $totals;
}
function monthTotal(mysqli $conn, string $start, string $end, ?int $ownerId = null): float
{
    return round(array_sum(manualExpenseTotals($conn, $start, $end, $ownerId)), 2);
}
function buildAuditTrail(mysqli $conn, int $limit, ?int $ownerId = null): array
{
    $events = [];
    $paymentScope = '';
    $chargeScope = '';
    $expenseScope = '';
    $scopeTypes = '';
    $scopeParams = [];
    if ($ownerId !== null) {
        $paymentScope = ' AND fp.patient_id IN (SELECT a.patient_id FROM tbl_patient_appointments a WHERE a.doctor_id = ?)';
        $chargeScope = ' WHERE ft.patient_id IN (SELECT a.patient_id FROM tbl_patient_appointments a WHERE a.doctor_id = ?)';
        $expenseScope = ' WHERE e.created_by = ?';
        $scopeTypes = 'i';
        $scopeParams = [$ownerId];
    }
    $payments = fetchAll(
        $conn,
        "SELECT fp.payment_uid, fp.amount, fp.payment_method, fp.payment_source,
                COALESCE(fp.paid_at, fp.created_at) AS happened_at,
                ft.transaction_uid, ft.service_name,
                TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS patient_name,
                u.name AS actor
         FROM tbl_finance_payments fp
         LEFT JOIN tbl_finance_transactions ft ON ft.transaction_id = fp.transaction_id
         LEFT JOIN tbl_patients p ON p.patient_id = fp.patient_id
         LEFT JOIN tbl_users u ON u.user_id = fp.created_by
         WHERE fp.status = 'paid'" . $paymentScope . "
         ORDER BY happened_at DESC LIMIT " . $limit,
        $scopeTypes,
        $scopeParams
    );
    foreach ($payments as $row) {
        $events[] = [
            'type' => 'payment',
            'title' => 'Payment received',
            'detail' => trim(($row['patient_name'] ?: 'Patient') . ' · ' . ($row['service_name'] ?? '') .
                ' · ' . strtoupper(str_replace('_', ' ', (string)$row['payment_method']))),
            'reference' => (string)($row['transaction_uid'] ?? ''),
            'amount' => (float)$row['amount'],
            'actor' => $row['actor'] ?: ($row['payment_source'] === 'patient' ? 'Patient (online)' : 'System'),
            'timestamp' => $row['happened_at'],
        ];
    }
    $charges = fetchAll(
        $conn,
        "SELECT ft.transaction_uid, ft.service_name, ft.total_amount, ft.discount_amount, ft.created_at,
                TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS patient_name,
                u.name AS actor
         FROM tbl_finance_transactions ft
         LEFT JOIN tbl_patients p ON p.patient_id = ft.patient_id
         LEFT JOIN tbl_users u ON u.user_id = ft.created_by" . $chargeScope . "
         ORDER BY ft.created_at DESC LIMIT " . $limit,
        $scopeTypes,
        $scopeParams
    );
    foreach ($charges as $row) {
        $discount = (float)$row['discount_amount'];
        $events[] = [
            'type' => 'charge',
            'title' => 'Treatment charge created',
            'detail' => trim(($row['patient_name'] ?: 'Patient') . ' · ' . $row['service_name'] .
                ($discount > 0 ? ' · discount ₱' . number_format($discount, 2) : '')),
            'reference' => (string)$row['transaction_uid'],
            'amount' => (float)$row['total_amount'],
            'actor' => $row['actor'] ?: 'System',
            'timestamp' => $row['created_at'],
        ];
    }
    $manual = fetchAll(
        $conn,
        'SELECT e.expense_uid, e.category, e.description, e.amount, e.created_at, u.name AS actor
         FROM tbl_finance_expenses e
         LEFT JOIN tbl_users u ON u.user_id = e.created_by' . $expenseScope . '
         ORDER BY e.created_at DESC LIMIT ' . $limit,
        $scopeTypes,
        $scopeParams
    );
    foreach ($manual as $row) {
        $label = MANUAL_CATEGORIES[$row['category']] ?? ucfirst((string)$row['category']);
        $events[] = [
            'type' => 'expense',
            'title' => 'Expense recorded',
            'detail' => $label . ($row['description'] !== '' ? ' · ' . $row['description'] : ''),
            'reference' => (string)$row['expense_uid'],
            'amount' => (float)$row['amount'],
            'actor' => $row['actor'] ?: 'System',
            'timestamp' => $row['created_at'],
        ];
    }
    usort($events, static fn($a, $b) => strcmp((string)$b['timestamp'], (string)$a['timestamp']));
    return array_slice($events, 0, $limit);
}
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $action = (string)($_GET['action'] ?? 'summary');
    if ($action === 'audit') {
        $limit = max(1, min(50, (int)($_GET['limit'] ?? 8)));
        expenseResponse(true, 'Audit trail loaded.', buildAuditTrail($conn, $limit, $expenseOwnerId));
    }
    [$month, $start, $end, $year] = parseMonth((string)($_GET['month'] ?? ''));
    $manualTotals = manualExpenseTotals($conn, $start, $end, $expenseOwnerId);
    $categories = [];
    foreach (MANUAL_CATEGORIES as $key => $label) {
        $categories[] = ['key' => $key, 'label' => $label, 'amount' => round($manualTotals[$key] ?? 0, 2)];
    }
    $total = round(array_sum(array_column($categories, 'amount')), 2);
    $manualEntriesSql = 'SELECT expense_uid, category, description, amount, expense_date
         FROM tbl_finance_expenses
         WHERE expense_date >= ? AND expense_date < ?';
    $manualEntriesTypes = 'ss';
    $manualEntriesParams = [$start, $end];
    if ($expenseOwnerId !== null) {
        $manualEntriesSql .= ' AND created_by = ?';
        $manualEntriesTypes .= 'i';
        $manualEntriesParams[] = $expenseOwnerId;
    }
    $manualEntriesSql .= ' ORDER BY expense_date DESC, expense_id DESC';
    $manualEntries = fetchAll($conn, $manualEntriesSql, $manualEntriesTypes, $manualEntriesParams);
    foreach ($manualEntries as &$entry) {
        $entry['amount'] = (float)$entry['amount'];
        $entry['category_label'] = MANUAL_CATEGORIES[$entry['category']] ?? ucfirst((string)$entry['category']);
    }
    unset($entry);
    $previousStart = date('Y-m-d', strtotime($start . ' -1 month'));
    $previousTotal = monthTotal($conn, $previousStart, $start, $expenseOwnerId);
    $yearly = [];
    for ($m = 1; $m <= 12; $m++) {
        $monthStart = sprintf('%04d-%02d-01', $year, $m);
        $monthEnd = date('Y-m-d', strtotime($monthStart . ' +1 month'));
        $yearly[] = monthTotal($conn, $monthStart, $monthEnd, $expenseOwnerId);
    }
    expenseResponse(true, 'Monthly expenses loaded.', [
        'month' => $month,
        'total' => $total,
        'previous_total' => $previousTotal,
        'categories' => $categories,
        'manual_entries' => $manualEntries,
        'yearly' => $yearly,
        'year' => $year,
        'can_edit' => $role === 'doctor',
    ]);
}
if ($method === 'POST') {
    if ($role !== 'doctor') {
        expenseResponse(false, 'Only doctors may record expenses.', [], 403);
    }
    $input = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($input)) {
        expenseResponse(false, 'Invalid request body.', [], 400);
    }
    $category = strtolower(trim((string)($input['category'] ?? '')));
    $description = trim((string)($input['description'] ?? ''));
    $amount = round((float)($input['amount'] ?? 0), 2);
    $date = trim((string)($input['date'] ?? ''));
    if (!isset(MANUAL_CATEGORIES[$category])) {
        expenseResponse(false, 'Please choose a valid expense category.', [], 422);
    }
    if ($amount <= 0 || $amount > 99999999) {
        expenseResponse(false, 'Please enter a valid amount.', [], 422);
    }
    $parsed = DateTime::createFromFormat('Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date) {
        expenseResponse(false, 'Please enter a valid expense date.', [], 422);
    }
    if (mb_strlen($description) > 255) {
        $description = mb_substr($description, 0, 255);
    }
    $uid = 'EXP-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(4)));
    $stmt = $conn->prepare(
        'INSERT INTO tbl_finance_expenses (expense_uid, category, description, amount, expense_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    if (!$stmt) {
        expenseResponse(false, 'Unable to save expense.', [], 500);
    }
    $stmt->bind_param('sssdsi', $uid, $category, $description, $amount, $date, $userId);
    if (!$stmt->execute()) {
        $stmt->close();
        expenseResponse(false, 'Unable to save expense.', [], 500);
    }
    $stmt->close();
    expenseResponse(true, 'Expense recorded.', ['expense_uid' => $uid], 201);
}
if ($method === 'DELETE') {
    if ($role !== 'doctor') {
        expenseResponse(false, 'Only doctors may delete expenses.', [], 403);
    }
    $uid = trim((string)($_GET['expense_uid'] ?? ''));
    if ($uid === '') {
        expenseResponse(false, 'Expense reference is required.', [], 422);
    }
    $stmt = $conn->prepare('DELETE FROM tbl_finance_expenses WHERE expense_uid = ? AND created_by = ?');
    $stmt->bind_param('si', $uid, $userId);
    $stmt->execute();
    $deleted = $stmt->affected_rows;
    $stmt->close();
    if ($deleted < 1) {
        expenseResponse(false, 'Expense not found.', [], 404);
    }
    expenseResponse(true, 'Expense deleted.', []);
}
expenseResponse(false, 'Method not allowed.', [], 405);