<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
require_once __DIR__ . '/../../php/db_connect.php';
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    jsonResponse(false, 'Authentication required.', [], 401);
}
$role = strtolower(trim((string)($_SESSION['role'] ?? '')));
$userId = (int)$_SESSION['user_id'];
function jsonResponse(
    bool $success,
    string $message,
    array $data = [],
    int $status = 200
): void {
    http_response_code($status);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ]);
    exit;
}
function generateTransactionUid(): string
{
    return 'TXN-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(4)));
}
function generatePaymentUid(): string
{
    return 'PAY-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(4)));
}
function getAllowedPaymentMethods(): array
{
    return [
        'cash',
        'gcash',
        'bank_transfer'
    ];
}
function getTransactionSelectFields(): string
{
    return '
        ft.transaction_id,
        ft.transaction_uid,
        ft.patient_id,
        ft.appointment_id,
        ft.treatment_id,
        ft.service_name,
        ft.total_amount,
        ft.discount_amount,
        ft.net_amount,
        ft.paid_amount,
        ft.balance_amount,
        ft.status,
        ft.notes,
        ft.created_by,
        ft.created_at,
        ft.updated_at,
        TRIM(
            CONCAT(
                COALESCE(p.first_name, ""),
                " ",
                COALESCE(p.last_name, "")
            )
        ) AS patient_name
    ';
}
function getPaymentHistoryByTransactionIds(
    mysqli $conn,
    array $transactionIds
): array {
    if (!$transactionIds) {
        return [];
    }
    $cleanIds = [];
    foreach ($transactionIds as $transactionId) {
        $id = (int)$transactionId;
        if ($id > 0) {
            $cleanIds[] = $id;
        }
    }
    $cleanIds = array_values(array_unique($cleanIds));
    if (!$cleanIds) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($cleanIds), '?'));
    $types = str_repeat('i', count($cleanIds));
    $sql = "
        SELECT
            payment_id,
            payment_uid,
            transaction_id,
            patient_id,
            amount,
            payment_method,
            payment_source,
            status,
            reference_number,
            xendit_reference_id,
            xendit_payment_request_id,
            xendit_payment_id,
            xendit_status,
            xendit_channel_code,
            xendit_action_type,
            xendit_action_value,
            notes,
            paid_at,
            created_by,
            created_at,
            updated_at
        FROM tbl_finance_payments
        WHERE transaction_id IN ({$placeholders})
        ORDER BY
            COALESCE(paid_at, created_at) DESC,
            payment_id DESC
    ";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        jsonResponse(
            false,
            'Unable to prepare finance payment history query.',
            [],
            500
        );
    }
    $bindParams = [$types];
    foreach ($cleanIds as $index => $id) {
        $bindParams[] = &$cleanIds[$index];
    }
    call_user_func_array(
        [$stmt, 'bind_param'],
        $bindParams
    );
    if (!$stmt->execute()) {
        $stmt->close();
        jsonResponse(
            false,
            'Unable to load finance payment history.',
            [],
            500
        );
    }
    $result = $stmt->get_result();
    $paymentsByTransaction = [];
    while ($payment = $result->fetch_assoc()) {
        $transactionId = (string)$payment['transaction_id'];
        if (!isset($paymentsByTransaction[$transactionId])) {
            $paymentsByTransaction[$transactionId] = [];
        }
        $paymentsByTransaction[$transactionId][] = $payment;
    }
    $stmt->close();
    return $paymentsByTransaction;
}
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $patientId = trim((string)($_GET['patient_id'] ?? ''));
    $transactionUid = trim((string)($_GET['transaction_uid'] ?? ''));
    if ($role === 'user') {
        $ownPatientStmt = $conn->prepare(
            'SELECT patient_id FROM tbl_patients WHERE user_id = ? AND status = "active" LIMIT 1'
        );
        if (!$ownPatientStmt) {
            jsonResponse(false, 'Unable to verify patient access.', [], 500);
        }
        $ownPatientStmt->bind_param('i', $userId);
        $ownPatientStmt->execute();
        $ownPatient = $ownPatientStmt->get_result()->fetch_assoc();
        $ownPatientStmt->close();
        if (!$ownPatient) {
            jsonResponse(false, 'Patient record not found.', [], 404);
        }
        $ownPatientId = (string)$ownPatient['patient_id'];
        if ($patientId !== '' && $patientId !== $ownPatientId) {
            jsonResponse(
                false,
                'You may access only your own finance transactions.',
                [],
                403
            );
        }
        $patientId = $ownPatientId;
    }
    $selectFields = getTransactionSelectFields();
    if ($transactionUid !== '') {
        $stmt = $conn->prepare(
            "
            SELECT {$selectFields}
            FROM tbl_finance_transactions ft
            LEFT JOIN tbl_patients p
                ON p.patient_id = ft.patient_id
            WHERE ft.transaction_uid = ?
            LIMIT 1
            "
        );
        if (!$stmt) {
            jsonResponse(
                false,
                'Unable to prepare transaction query.',
                [],
                500
            );
        }
        $stmt->bind_param('s', $transactionUid);
        if (!$stmt->execute()) {
            $stmt->close();
            jsonResponse(
                false,
                'Unable to load finance transaction.',
                [],
                500
            );
        }
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        $stmt->close();
        if (!$row) {
            jsonResponse(
                false,
                'Finance transaction not found.',
                [],
                404
            );
        }
        if ($role === 'user' && (string)$row['patient_id'] !== $patientId) {
            jsonResponse(
                false,
                'You may access only your own finance transactions.',
                [],
                403
            );
        }
        $row['patient_name'] = trim(
            (string)($row['patient_name'] ?? '')
        );
        $transactionId = (int)$row['transaction_id'];
        $paymentHistory = getPaymentHistoryByTransactionIds(
            $conn,
            [$transactionId]
        );
        $row['paymentHistory'] =
            $paymentHistory[(string)$transactionId] ?? [];
        jsonResponse(
            true,
            'Finance transaction loaded.',
            [$row]
        );
    }
    if ($patientId !== '') {
        $stmt = $conn->prepare(
            "
            SELECT {$selectFields}
            FROM tbl_finance_transactions ft
            LEFT JOIN tbl_patients p
                ON p.patient_id = ft.patient_id
            WHERE ft.patient_id = ?
            ORDER BY ft.created_at DESC
            "
        );
        if (!$stmt) {
            jsonResponse(
                false,
                'Unable to prepare patient transaction query.',
                [],
                500
            );
        }
        $stmt->bind_param('s', $patientId);
        if (!$stmt->execute()) {
            $stmt->close();
            jsonResponse(
                false,
                'Unable to load patient finance transactions.',
                [],
                500
            );
        }
        $result = $stmt->get_result();
    } else {
        $result = $conn->query(
            "
            SELECT {$selectFields}
            FROM tbl_finance_transactions ft
            LEFT JOIN tbl_patients p
                ON p.patient_id = ft.patient_id
            ORDER BY ft.created_at DESC
            "
        );
    }
    if (!$result) {
        if (isset($stmt) && $stmt instanceof mysqli_stmt) {
            $stmt->close();
        }
        jsonResponse(
            false,
            'Unable to load finance transactions.',
            [],
            500
        );
    }
    $records = [];
    $transactionIds = [];
    while ($row = $result->fetch_assoc()) {
        $row['patient_name'] = trim(
            (string)($row['patient_name'] ?? '')
        );
        $transactionId = (int)$row['transaction_id'];
        $transactionIds[] = $transactionId;
        $records[] = $row;
    }
    if (isset($stmt) && $stmt instanceof mysqli_stmt) {
        $stmt->close();
    }
    $paymentsByTransaction =
        getPaymentHistoryByTransactionIds(
            $conn,
            $transactionIds
        );
    foreach ($records as &$record) {
        $transactionId = (string)$record['transaction_id'];
        $record['paymentHistory'] =
            $paymentsByTransaction[$transactionId] ?? [];
    }
    unset($record);
    jsonResponse(
        true,
        'Finance transactions loaded.',
        $records
    );
}
if ($method === 'POST') {
    if ($role !== 'staff' && $role !== 'doctor') {
        jsonResponse(
            false,
            'Only staff or doctors may modify finance records.',
            [],
            403
        );
    }
    $rawInput = file_get_contents('php://input');
    $input = json_decode(
        $rawInput ?: '',
        true
    );
    if (!is_array($input)) {
        jsonResponse(
            false,
            'Invalid request body.',
            [],
            400
        );
    }
    if (($input['action'] ?? '') === 'record_payment') {
        if ($role !== 'staff' && $role !== 'doctor') {
            jsonResponse(
                false,
                'Only staff or doctors may record payments manually.',
                [],
                403
            );
        }
        $transactionUid = trim(
            (string)($input['transactionUid'] ?? '')
        );
        $patientId = trim(
            (string)($input['patientId'] ?? '')
        );
        $paymentMethod = strtolower(
            trim(
                (string)($input['paymentMethod'] ?? '')
            )
        );
        $amount = (float)(
            $input['amount'] ?? 0
        );
        $paymentDate = trim(
            (string)($input['date'] ?? '')
        );
        $allowedPaymentMethods =
            getAllowedPaymentMethods();
        $parsedDate = DateTime::createFromFormat(
            '!Y-m-d',
            $paymentDate
        );
        if (
            $transactionUid === '' ||
            $patientId === '' ||
            !in_array(
                $paymentMethod,
                $allowedPaymentMethods,
                true
            ) ||
            $amount <= 0 ||
            !$parsedDate ||
            $parsedDate->format('Y-m-d') !== $paymentDate
        ) {
            jsonResponse(
                false,
                'A valid payment method, payment amount, and payment date are required.',
                [],
                400
            );
        }
        $paymentDateTime =
            $paymentDate . ' ' . date('H:i:s');
        $conn->begin_transaction();
        try {
            $transactionStmt = $conn->prepare(
                "
                SELECT
                    transaction_id,
                    appointment_id,
                    patient_id,
                    total_amount,
                    discount_amount,
                    net_amount,
                    paid_amount,
                    balance_amount,
                    status
                FROM tbl_finance_transactions
                WHERE transaction_uid = ?
                FOR UPDATE
                "
            );
            if (!$transactionStmt) {
                throw new RuntimeException(
                    'Unable to prepare payment transaction lookup.'
                );
            }
            $transactionStmt->bind_param(
                's',
                $transactionUid
            );
            if (!$transactionStmt->execute()) {
                $transactionStmt->close();
                throw new RuntimeException(
                    'Unable to load payment transaction.'
                );
            }
            $transactionResult =
                $transactionStmt->get_result();
            $transaction =
                $transactionResult->fetch_assoc();
            $transactionStmt->close();
            if (
                !$transaction ||
                (string)$transaction['patient_id'] !==
                $patientId
            ) {
                throw new RuntimeException(
                    'Finance transaction was not found for this patient.',
                    404
                );
            }
            $transactionId =
                (int)$transaction['transaction_id'];
            $netAmount = max(
                (float)$transaction['total_amount'] -
                (float)$transaction['discount_amount'],
                0
            );
            $currentPaid = max(
                (float)$transaction['paid_amount'],
                0
            );
            $currentBalance = max(
                $netAmount - $currentPaid,
                0
            );
            if ($currentBalance <= 0.009) {
                throw new RuntimeException(
                    'This transaction is already fully paid.',
                    400
                );
            }
            if ($amount > $currentBalance + 0.009) {
                throw new RuntimeException(
                    'Payment amount cannot be greater than the remaining balance.',
                    400
                );
            }
            if ($amount <= 0) {
                throw new RuntimeException(
                    'Payment amount must be greater than zero.',
                    400
                );
            }
            if ($amount > $currentBalance) {
                $amount = $currentBalance;
            }
            $paymentUid = generatePaymentUid();
            $createdBy =
                isset($_SESSION['user_id']) &&
                is_numeric($_SESSION['user_id'])
                    ? (int)$_SESSION['user_id']
                    : null;
            $paymentSource = 'staff';
            $paymentStmt = $conn->prepare(
                "
                INSERT INTO tbl_finance_payments
                (
                    payment_uid,
                    transaction_id,
                    patient_id,
                    amount,
                    payment_method,
                    payment_source,
                    status,
                    paid_at,
                    created_by
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    'paid',
                    ?,
                    ?
                )
                "
            );
            if (!$paymentStmt) {
                throw new RuntimeException(
                    'Unable to prepare payment record.'
                );
            }
            $paymentStmt->bind_param(
                'sisdsssi',
                $paymentUid,
                $transactionId,
                $patientId,
                $amount,
                $paymentMethod,
                $paymentSource,
                $paymentDateTime,
                $createdBy
            );
            if (!$paymentStmt->execute()) {
                $paymentError = $paymentStmt->error;
                $paymentStmt->close();
                throw new RuntimeException(
                    'Unable to save payment: ' . $paymentError
                );
            }
            $paymentId =
                (int)$conn->insert_id;
            $paymentStmt->close();
            $paidAmount =
                $currentPaid + $amount;
            $balanceAmount = max(
                $netAmount - $paidAmount,
                0
            );
            if ($balanceAmount <= 0.009) {
                $balanceAmount = 0;
            }
            $status =
                $balanceAmount <= 0.009
                    ? 'paid'
                    : 'partial';
            $updateStmt = $conn->prepare(
                "
                UPDATE tbl_finance_transactions
                SET
                    paid_amount = ?,
                    balance_amount = ?,
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE transaction_id = ?
                "
            );
            if (!$updateStmt) {
                throw new RuntimeException(
                    'Unable to prepare finance transaction update.'
                );
            }
            $updateStmt->bind_param(
                'ddsi',
                $paidAmount,
                $balanceAmount,
                $status,
                $transactionId
            );
            if (!$updateStmt->execute()) {
                $updateError = $updateStmt->error;
                $updateStmt->close();
                throw new RuntimeException(
                    'Unable to update finance transaction totals: ' .
                    $updateError
                );
            }
            $updateStmt->close();
            if (!empty($transaction['appointment_id'])) {
                $appointmentPaymentStatus =
                    $balanceAmount <= 0.009
                        ? 'paid'
                        : 'partial';
                $appointmentStmt = $conn->prepare(
                    "
                    UPDATE tbl_patient_appointments
                    SET
                        payment_status = ?,
                        payment_amount = ?
                    WHERE appointment_id = ?
                    LIMIT 1
                    "
                );
                if (!$appointmentStmt) {
                    throw new RuntimeException(
                        'Unable to prepare appointment payment update.'
                    );
                }
                $appointmentId =
                    (int)$transaction['appointment_id'];
                $appointmentStmt->bind_param(
                    'sdi',
                    $appointmentPaymentStatus,
                    $paidAmount,
                    $appointmentId
                );
                if (!$appointmentStmt->execute()) {
                    $appointmentError = $appointmentStmt->error;
                    $appointmentStmt->close();
                    throw new RuntimeException(
                        'Unable to update appointment payment status: ' .
                        $appointmentError
                    );
                }
                $appointmentStmt->close();
            }
            if (!$conn->commit()) {
                throw new RuntimeException(
                    'Unable to complete payment transaction.'
                );
            }
            jsonResponse(
                true,
                'Payment saved successfully.',
                [[
                    'payment_id' => $paymentId,
                    'payment_uid' => $paymentUid,
                    'transaction_id' => $transactionId,
                    'transaction_uid' => $transactionUid,
                    'patient_id' => $patientId,
                    'appointment_id' => $transaction['appointment_id'] ?? null,
                    'amount' => $amount,
                    'payment_method' => $paymentMethod,
                    'payment_source' => $paymentSource,
                    'status' => 'paid',
                    'paid_at' => $paymentDateTime,
                    'paid_amount' => $paidAmount,
                    'balance_amount' => $balanceAmount,
                    'transaction_status' => $status
                ]],
                201
            );
        } catch (Throwable $error) {
            $conn->rollback();
            $statusCode =
                $error->getCode() >= 400 &&
                $error->getCode() < 600
                    ? $error->getCode()
                    : 500;
            jsonResponse(
                false,
                $error->getMessage() !== ''
                    ? $error->getMessage()
                    : 'Unable to complete payment.',
                [],
                $statusCode
            );
        }
    }
    $patientId = trim(
        (string)(
            $input['patientId'] ??
            $input['patient_id'] ??
            ''
        )
    );
    $serviceName = trim(
        (string)(
            $input['service'] ??
            $input['serviceName'] ??
            $input['service_name'] ??
            ''
        )
    );
    $totalAmount = (float)(
        $input['total'] ??
        $input['totalAmount'] ??
        $input['total_amount'] ??
        0
    );
    $discountAmount = (float)(
        $input['discount'] ??
        $input['discountAmount'] ??
        $input['discount_amount'] ??
        0
    );
    $appointmentId =
        isset($input['appointmentId']) &&
        $input['appointmentId'] !== ''
            ? (int)$input['appointmentId']
            : null;
    $treatmentId =
        isset($input['treatmentId']) &&
        $input['treatmentId'] !== ''
            ? (int)$input['treatmentId']
            : null;
    $notes = trim(
        (string)($input['notes'] ?? '')
    );
    if ($patientId === '') {
        jsonResponse(
            false,
            'Patient ID is required.',
            [],
            400
        );
    }
    if ($serviceName === '') {
        jsonResponse(
            false,
            'Service name is required.',
            [],
            400
        );
    }
    if ($totalAmount <= 0) {
        jsonResponse(
            false,
            'Treatment price must be greater than zero.',
            [],
            400
        );
    }
    if ($discountAmount < 0) {
        jsonResponse(
            false,
            'Discount cannot be negative.',
            [],
            400
        );
    }
    if ($discountAmount > $totalAmount) {
        jsonResponse(
            false,
            'Discount cannot be greater than the treatment price.',
            [],
            400
        );
    }
    $patientStmt = $conn->prepare(
        "
        SELECT
            patient_id,
            first_name,
            last_name
        FROM tbl_patients
        WHERE patient_id = ?
        LIMIT 1
        "
    );
    if (!$patientStmt) {
        jsonResponse(
            false,
            'Unable to validate patient.',
            [],
            500
        );
    }
    $patientStmt->bind_param(
        's',
        $patientId
    );
    if (!$patientStmt->execute()) {
        $patientStmt->close();
        jsonResponse(
            false,
            'Unable to validate patient.',
            [],
            500
        );
    }
    $patientResult =
        $patientStmt->get_result();
    $patientExists =
        $patientResult->fetch_assoc();
    $patientStmt->close();
    if (!$patientExists) {
        jsonResponse(
            false,
            'Patient does not exist in the database.',
            [],
            404
        );
    }
    $patientName = trim(
        (string)(
            $patientExists['first_name'] ?? ''
        ) .
        ' ' .
        (string)(
            $patientExists['last_name'] ?? ''
        )
    );
    $netAmount = max(
        $totalAmount - $discountAmount,
        0
    );
    $paidAmount = 0;
    $balanceAmount = $netAmount;
    $status =
        $balanceAmount <= 0.009
            ? 'paid'
            : 'unpaid';
    $transactionUid =
        generateTransactionUid();
    $createdBy =
        isset($_SESSION['user_id']) &&
        is_numeric($_SESSION['user_id'])
            ? (int)$_SESSION['user_id']
            : null;
    $stmt = $conn->prepare(
        "
        INSERT INTO tbl_finance_transactions
        (
            transaction_uid,
            patient_id,
            appointment_id,
            treatment_id,
            service_name,
            total_amount,
            discount_amount,
            net_amount,
            paid_amount,
            balance_amount,
            status,
            notes,
            created_by
        )
        VALUES
        (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
        )
        "
    );
    if (!$stmt) {
        jsonResponse(
            false,
            'Unable to prepare finance transaction creation.',
            [],
            500
        );
    }
    $stmt->bind_param(
        'ssiisdddddssi',
        $transactionUid,
        $patientId,
        $appointmentId,
        $treatmentId,
        $serviceName,
        $totalAmount,
        $discountAmount,
        $netAmount,
        $paidAmount,
        $balanceAmount,
        $status,
        $notes,
        $createdBy
    );
    if (!$stmt->execute()) {
        $error = $stmt->error;
        $stmt->close();
        jsonResponse(
            false,
            'Unable to create finance transaction.',
            [
                'error' => $error
            ],
            500
        );
    }
    $transactionId =
        (int)$conn->insert_id;
    $stmt->close();
    jsonResponse(
        true,
        'Treatment charge created successfully.',
        [[
            'transaction_id' => $transactionId,
            'transaction_uid' => $transactionUid,
            'patient_id' => $patientId,
            'patient_name' => $patientName,
            'appointment_id' => $appointmentId,
            'treatment_id' => $treatmentId,
            'service_name' => $serviceName,
            'total_amount' => $totalAmount,
            'discount_amount' => $discountAmount,
            'net_amount' => $netAmount,
            'paid_amount' => $paidAmount,
            'balance_amount' => $balanceAmount,
            'status' => $status,
            'notes' => $notes,
            'paymentHistory' => []
        ]],
        201
    );
}
jsonResponse(
    false,
    'Unsupported request method.',
    [],
    405
);