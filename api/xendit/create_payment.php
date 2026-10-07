<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
require_once __DIR__ . '/../../php/db_connect.php';
require_once __DIR__ . '/../../php/xendit_config.php';
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'message' => 'Authentication required.'
    ]);
    exit;
}
$sessionRole = strtolower(trim((string)($_SESSION['role'] ?? '')));
$sessionPatientId = $sessionRole === 'user'
    ? 'PN-' . str_pad((string)((int)$_SESSION['user_id']), 4, '0', STR_PAD_LEFT)
    : '';
if (!defined('XENDIT_SECRET_KEY') || trim((string) XENDIT_SECRET_KEY) === '') {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Xendit Secret API Key is not configured.'
    ]);
    exit;
}
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid request body.'
    ]);
    exit;
}
$transactionUid = trim(
    (string) ($input['transactionUid'] ?? $input['transactionId'] ?? '')
);
$patientId = trim(
    (string) ($input['patientId'] ?? '')
);
$patientName = trim(
    (string) ($input['patientName'] ?? '')
);
$amount = (float) ($input['amount'] ?? 0);
$paymentMethodInput = strtolower(
    trim((string) ($input['paymentMethod'] ?? ''))
);
$paymentMethod = str_replace(
    [' ', '-'],
    '_',
    $paymentMethodInput
);
$notes = trim(
    (string) ($input['notes'] ?? '')
);
$returnUrl = trim(
    (string) ($input['returnUrl'] ?? '')
);
$paymentSource = strtolower(
    trim((string) ($input['paymentSource'] ?? 'patient'))
);
if ($sessionRole === 'staff') {
    $paymentSource = 'staff';
} elseif ($sessionRole === 'user') {
    $patientId = $sessionPatientId;
    $paymentSource = 'patient';
} elseif ($sessionRole === 'doctor') {
    $paymentSource = 'staff';
}
if (!in_array($sessionRole, ['user', 'doctor', 'staff'], true)) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Authenticated clinic access required.'
    ]);
    exit;
}
if ($transactionUid === '') {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Transaction UID is required.'
    ]);
    exit;
}
if ($patientId === '') {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Patient ID is required.'
    ]);
    exit;
}
if ($amount <= 0) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Payment amount must be greater than zero.'
    ]);
    exit;
}
if (!in_array($paymentMethod, ['gcash', 'bank_transfer'], true)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Only GCash and Bank Transfer are currently enabled for online payments.'
    ]);
    exit;
}
if (!in_array($paymentSource, ['patient', 'staff'], true)) {
    $paymentSource = 'patient';
}
if ($returnUrl === '') {
    $returnUrl =
        'http://localhost/DENTAL_CLINIC/patients/payments/payments.html';
}
$stmt = $conn->prepare(
    'SELECT
        transaction_id,
        transaction_uid,
        patient_id,
        total_amount,
        discount_amount,
        net_amount,
        paid_amount,
        balance_amount,
        status
     FROM tbl_finance_transactions
     WHERE transaction_uid = ?
     LIMIT 1'
);
if (!$stmt) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to prepare transaction lookup.'
    ]);
    exit;
}
$stmt->bind_param('s', $transactionUid);
if (!$stmt->execute()) {
    $stmt->close();
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to load finance transaction.'
    ]);
    exit;
}
$result = $stmt->get_result();
$transaction = $result->fetch_assoc();
$stmt->close();
if (!$transaction) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'message' => 'Finance transaction was not found.'
    ]);
    exit;
}
if ((string) $transaction['patient_id'] !== $patientId) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'The payment patient does not match the finance transaction.'
    ]);
    exit;
}
$balanceAmount = max(
    0,
    (float) $transaction['balance_amount']
);
if ($balanceAmount <= 0) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'This transaction has no remaining balance.'
    ]);
    exit;
}
if ($amount > $balanceAmount) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Payment amount cannot be greater than the remaining balance.',
        'balance_amount' => $balanceAmount
    ]);
    exit;
}
$paymentUid =
    'PAY-' .
    date('YmdHis') .
    '-' .
    strtoupper(bin2hex(random_bytes(4)));
$insertPayment = $conn->prepare(
    'INSERT INTO tbl_finance_payments
    (
        payment_uid,
        transaction_id,
        patient_id,
        amount,
        payment_method,
        payment_source,
        status,
        notes
    )
    VALUES (?, ?, ?, ?, ?, ?, "pending", ?)'
);
if (!$insertPayment) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to prepare payment record.'
    ]);
    exit;
}
$transactionId = (int) $transaction['transaction_id'];
$insertPayment->bind_param(
    'sisdsss',
    $paymentUid,
    $transactionId,
    $patientId,
    $amount,
    $paymentMethod,
    $paymentSource,
    $notes
);
if (!$insertPayment->execute()) {
    $paymentError = $insertPayment->error;
    $insertPayment->close();
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to create pending payment record.',
        'error' => $paymentError
    ]);
    exit;
}
$localPaymentId = (int) $conn->insert_id;
$insertPayment->close();
$referenceId =
    'DENTANUEVA-' .
    preg_replace(
        '/[^A-Za-z0-9_-]/',
        '-',
        $transactionUid
    ) .
    '-' .
    date('YmdHis') .
    '-' .
    strtoupper(bin2hex(random_bytes(3)));
$channelCode =
    $paymentMethod === 'bank_transfer'
        ? 'BANK_TRANSFER'
        : 'GCASH';
$paymentType =
    $paymentMethod === 'bank_transfer'
        ? 'REUSABLE_PAYMENT_CODE'
        : 'PAY';
$payload = [
    'reference_id' => $referenceId,
    'type' => $paymentType,
    'country' => 'PH',
    'currency' => 'PHP',
    'channel_code' => $channelCode,
    'description' =>
        'DentaNueva Payment - ' .
        ($patientName !== '' ? $patientName : $patientId),
    'metadata' => [
        'source' => 'DentaNueva',
        'payment_uid' => $paymentUid,
        'transaction_uid' => $transactionUid,
        'transaction_id' => (string) $transactionId,
        'patient_id' => $patientId,
        'payment_method' => $paymentMethod,
        'payment_source' => $paymentSource,
        'requested_amount' => number_format($amount, 2, '.', ''),
        'notes' => $notes
    ]
];
if ($paymentMethod === 'gcash') {
    $payload['request_amount'] = $amount;
    $payload['channel_properties'] = [
        'failure_return_url' => $returnUrl,
        'success_return_url' => $returnUrl
    ];
}
if ($paymentMethod === 'bank_transfer') {
    $payload['channel_properties'] = [
        'display_name' => 'DentaNueva Dental Clinic'
    ];
}
$ch = curl_init(
    XENDIT_API_BASE_URL . '/v3/payment_requests'
);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(
        $payload,
        JSON_UNESCAPED_SLASHES
    ),
    CURLOPT_USERPWD => trim((string) XENDIT_SECRET_KEY) . ':',
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Accept: application/json',
        'api-version: 2024-11-11'
    ],
    CURLOPT_TIMEOUT => 30
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo(
    $ch,
    CURLINFO_HTTP_CODE
);
$curlError = curl_error($ch);
curl_close($ch);
if ($response === false || $curlError !== '') {
    $updateFailed = $conn->prepare(
        'UPDATE tbl_finance_payments
         SET status = "failed"
         WHERE payment_id = ?'
    );
    if ($updateFailed) {
        $updateFailed->bind_param(
            'i',
            $localPaymentId
        );
        $updateFailed->execute();
        $updateFailed->close();
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to connect to Xendit.',
        'error' => $curlError
    ]);
    exit;
}
$data = json_decode(
    $response,
    true
);
if (!is_array($data)) {
    $updateFailed = $conn->prepare(
        'UPDATE tbl_finance_payments
         SET status = "failed"
         WHERE payment_id = ?'
    );
    if ($updateFailed) {
        $updateFailed->bind_param(
            'i',
            $localPaymentId
        );
        $updateFailed->execute();
        $updateFailed->close();
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Xendit returned an invalid response.',
        'http_code' => $httpCode
    ]);
    exit;
}
if ($httpCode < 200 || $httpCode >= 300) {
    $updateFailed = $conn->prepare(
        'UPDATE tbl_finance_payments
         SET
            status = "failed",
            xendit_status = ?
         WHERE payment_id = ?'
    );
    if ($updateFailed) {
        $xenditErrorStatus = 'FAILED';
        $updateFailed->bind_param(
            'si',
            $xenditErrorStatus,
            $localPaymentId
        );
        $updateFailed->execute();
        $updateFailed->close();
    }
    http_response_code($httpCode);
    echo json_encode([
        'success' => false,
        'message' => 'Xendit rejected the payment request.',
        'http_code' => $httpCode,
        'xendit_response' => $data
    ]);
    exit;
}
$paymentRequestId = trim(
    (string) ($data['payment_request_id'] ?? '')
);
$xenditStatus = trim(
    (string) ($data['status'] ?? 'REQUIRES_ACTION')
);
$xenditReferenceId = trim(
    (string) (
        $data['reference_id'] ??
        $referenceId
    )
);
$xenditChannelCode = trim(
    (string) (
        $data['channel_code'] ??
        $channelCode
    )
);
if ($paymentRequestId === '') {
    $updateFailed = $conn->prepare(
        'UPDATE tbl_finance_payments
         SET
            status = "failed",
            xendit_status = ?
         WHERE payment_id = ?'
    );
    if ($updateFailed) {
        $xenditErrorStatus = 'FAILED';
        $updateFailed->bind_param(
            'si',
            $xenditErrorStatus,
            $localPaymentId
        );
        $updateFailed->execute();
        $updateFailed->close();
    }
    http_response_code(502);
    echo json_encode([
        'success' => false,
        'message' => 'Xendit did not return a payment request ID.',
        'xendit_response' => $data
    ]);
    exit;
}
$action = null;
if (
    isset($data['actions']) &&
    is_array($data['actions']) &&
    isset($data['actions'][0]) &&
    is_array($data['actions'][0])
) {
    $action = $data['actions'][0];
}
$actionType = trim(
    (string) ($action['type'] ?? '')
);
$actionValue = trim(
    (string) ($action['value'] ?? '')
);
$updatePayment = $conn->prepare(
    'UPDATE tbl_finance_payments
     SET
        xendit_reference_id = ?,
        xendit_payment_request_id = ?,
        xendit_status = ?,
        xendit_channel_code = ?,
        xendit_action_type = ?,
        xendit_action_value = ?,
        status = "processing"
     WHERE payment_id = ?'
);
if (!$updatePayment) {
    $updateFailed = $conn->prepare(
        'UPDATE tbl_finance_payments
         SET status = "failed"
         WHERE payment_id = ?'
    );
    if ($updateFailed) {
        $updateFailed->bind_param(
            'i',
            $localPaymentId
        );
        $updateFailed->execute();
        $updateFailed->close();
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to prepare local payment update.'
    ]);
    exit;
}
$updatePayment->bind_param(
    'ssssssi',
    $xenditReferenceId,
    $paymentRequestId,
    $xenditStatus,
    $xenditChannelCode,
    $actionType,
    $actionValue,
    $localPaymentId
);
if (!$updatePayment->execute()) {
    $updatePayment->close();
    $updateFailed = $conn->prepare(
        'UPDATE tbl_finance_payments
         SET status = "failed"
         WHERE payment_id = ?'
    );
    if ($updateFailed) {
        $updateFailed->bind_param(
            'i',
            $localPaymentId
        );
        $updateFailed->execute();
        $updateFailed->close();
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to save Xendit payment details.'
    ]);
    exit;
}
$updatePayment->close();
echo json_encode([
    'success' => true,
    'message' => 'Xendit payment request created successfully.',
    'payment_id' => $localPaymentId,
    'payment_uid' => $paymentUid,
    'transaction_id' => $transactionId,
    'transaction_uid' => $transactionUid,
    'payment_request_id' => $paymentRequestId,
    'status' => $xenditStatus,
    'reference_id' => $xenditReferenceId,
    'channel_code' => $xenditChannelCode,
    'request_amount' =>
        $paymentMethod === 'bank_transfer'
            ? null
            : $amount,
    'local_amount' => $amount,
    'actions' => $data['actions'] ?? []
]);