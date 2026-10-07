<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
require_once __DIR__ . '/../../php/db_connect.php';
require_once __DIR__ . '/../../php/xendit_config.php';
if (
    !defined('XENDIT_WEBHOOK_TOKEN') ||
    trim((string) XENDIT_WEBHOOK_TOKEN) === ''
) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Xendit webhook token is not configured.'
    ]);
    exit;
}
$callbackToken = trim(
    (string) ($_SERVER['HTTP_X_CALLBACK_TOKEN'] ?? '')
);
$expectedToken = trim(
    (string) XENDIT_WEBHOOK_TOKEN
);
if (
    $callbackToken === '' ||
    !hash_equals($expectedToken, $callbackToken)
) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid Xendit webhook token.'
    ]);
    exit;
}
$rawBody = file_get_contents('php://input');
if (
    $rawBody === false ||
    trim($rawBody) === ''
) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Empty webhook request body.'
    ]);
    exit;
}
$payload = json_decode(
    $rawBody,
    true
);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid webhook JSON payload.'
    ]);
    exit;
}
$event = trim(
    (string) ($payload['event'] ?? '')
);
$data = $payload['data'] ?? [];
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid webhook data.'
    ]);
    exit;
}
if (
    !in_array(
        $event,
        [
            'payment.capture',
            'payment.failure',
            'payment.authorization'
        ],
        true
    )
) {
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Webhook event received but no action was required.',
        'event' => $event
    ]);
    exit;
}
$paymentRequestId = trim(
    (string) ($data['payment_request_id'] ?? '')
);
$paymentId = trim(
    (string) ($data['payment_id'] ?? '')
);
$referenceId = trim(
    (string) ($data['reference_id'] ?? '')
);
$xenditStatus = trim(
    (string) ($data['status'] ?? '')
);
$channelCode = trim(
    (string) ($data['channel_code'] ?? '')
);
$failureCode = trim(
    (string) ($data['failure_code'] ?? '')
);
$requestAmount = (float) (
    $data['request_amount'] ?? 0
);
if ($paymentRequestId === '') {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Payment request ID is missing from the webhook.'
    ]);
    exit;
}
if ($event === 'payment.failure') {
    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare(
            'SELECT
                payment_id,
                transaction_id,
                amount,
                status
             FROM tbl_finance_payments
             WHERE xendit_payment_request_id = ?
             LIMIT 1
             FOR UPDATE'
        );
        if (!$stmt) {
            throw new RuntimeException(
                'Unable to prepare payment lookup.'
            );
        }
        $stmt->bind_param(
            's',
            $paymentRequestId
        );
        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException(
                'Unable to execute payment lookup.'
            );
        }
        $result = $stmt->get_result();
        $payment = $result->fetch_assoc();
        $stmt->close();
        if (!$payment) {
            $conn->rollback();
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'message' => 'Local finance payment was not found.',
                'payment_request_id' => $paymentRequestId
            ]);
            exit;
        }
        if ((string) $payment['status'] === 'paid') {
            $updatePayment = $conn->prepare(
                'UPDATE tbl_finance_payments
                 SET
                    xendit_payment_id = NULLIF(?, ""),
                    xendit_status = ?,
                    xendit_reference_id = ?,
                    xendit_channel_code = ?
                 WHERE payment_id = ?'
            );
            if (!$updatePayment) {
                throw new RuntimeException(
                    'Unable to prepare completed payment update.'
                );
            }
            $updatePayment->bind_param(
                'ssssi',
                $paymentId,
                $xenditStatus,
                $referenceId,
                $channelCode,
                $payment['payment_id']
            );
            if (!$updatePayment->execute()) {
                $updatePayment->close();
                throw new RuntimeException(
                    'Unable to update completed payment.'
                );
            }
            $updatePayment->close();
            $conn->commit();
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'Payment was already completed. Failure webhook ignored.',
                'payment_request_id' => $paymentRequestId
            ]);
            exit;
        }
        $updatePayment = $conn->prepare(
            'UPDATE tbl_finance_payments
             SET
                status = "failed",
                xendit_payment_id = NULLIF(?, ""),
                xendit_status = ?,
                xendit_reference_id = ?,
                xendit_channel_code = ?
             WHERE payment_id = ?'
        );
        if (!$updatePayment) {
            throw new RuntimeException(
                'Unable to prepare payment failure update.'
            );
        }
        $failedStatus =
            $xenditStatus !== ''
                ? $xenditStatus
                : 'FAILED';
        $updatePayment->bind_param(
            'ssssi',
            $paymentId,
            $failedStatus,
            $referenceId,
            $channelCode,
            $payment['payment_id']
        );
        if (!$updatePayment->execute()) {
            $updatePayment->close();
            throw new RuntimeException(
                'Unable to update failed payment.'
            );
        }
        $updatePayment->close();
        $conn->commit();
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Payment failure processed successfully.',
            'payment_request_id' => $paymentRequestId,
            'payment_id' => $paymentId,
            'failure_code' => $failureCode
        ]);
        exit;
    } catch (Throwable $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Unable to process payment failure webhook.'
        ]);
        exit;
    }
}
if ($event === 'payment.authorization') {
    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare(
            'SELECT
                payment_id,
                status
             FROM tbl_finance_payments
             WHERE xendit_payment_request_id = ?
             LIMIT 1
             FOR UPDATE'
        );
        if (!$stmt) {
            throw new RuntimeException(
                'Unable to prepare authorization lookup.'
            );
        }
        $stmt->bind_param(
            's',
            $paymentRequestId
        );
        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException(
                'Unable to execute authorization lookup.'
            );
        }
        $result = $stmt->get_result();
        $payment = $result->fetch_assoc();
        $stmt->close();
        if (!$payment) {
            $conn->rollback();
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'message' => 'Local finance payment was not found.',
                'payment_request_id' => $paymentRequestId
            ]);
            exit;
        }
        if ((string) $payment['status'] !== 'paid') {
            $updatePayment = $conn->prepare(
                'UPDATE tbl_finance_payments
                 SET
                    status = "processing",
                    xendit_payment_id = NULLIF(?, ""),
                    xendit_status = ?,
                    xendit_reference_id = ?,
                    xendit_channel_code = ?
                 WHERE payment_id = ?'
            );
            if (!$updatePayment) {
                throw new RuntimeException(
                    'Unable to prepare authorization update.'
                );
            }
            $authorizedStatus =
                $xenditStatus !== ''
                    ? $xenditStatus
                    : 'AUTHORIZED';
            $updatePayment->bind_param(
                'ssssi',
                $paymentId,
                $authorizedStatus,
                $referenceId,
                $channelCode,
                $payment['payment_id']
            );
            if (!$updatePayment->execute()) {
                $updatePayment->close();
                throw new RuntimeException(
                    'Unable to update authorized payment.'
                );
            }
            $updatePayment->close();
        }
        $conn->commit();
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Payment authorization received. Payment was not marked as paid.',
            'payment_request_id' => $paymentRequestId,
            'payment_id' => $paymentId
        ]);
        exit;
    } catch (Throwable $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Unable to process payment authorization webhook.'
        ]);
        exit;
    }
}
$conn->begin_transaction();
try {
    $stmt = $conn->prepare(
        'SELECT
            payment_id,
            transaction_id,
            patient_id,
            amount,
            status,
            payment_method
         FROM tbl_finance_payments
         WHERE xendit_payment_request_id = ?
         LIMIT 1
         FOR UPDATE'
    );
    if (!$stmt) {
        throw new RuntimeException(
            'Unable to prepare payment lookup.'
        );
    }
    $stmt->bind_param(
        's',
        $paymentRequestId
    );
    if (!$stmt->execute()) {
        $stmt->close();
        throw new RuntimeException(
            'Unable to execute payment lookup.'
        );
    }
    $result = $stmt->get_result();
    $payment = $result->fetch_assoc();
    $stmt->close();
    if (!$payment) {
        $conn->rollback();
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Webhook received. No local finance payment matched this notification.',
            'payment_request_id' => $paymentRequestId
        ]);
        exit;
    }
    if ((string) $payment['status'] === 'paid') {
        $updatePayment = $conn->prepare(
            'UPDATE tbl_finance_payments
             SET
                xendit_payment_id = NULLIF(?, ""),
                xendit_status = ?,
                xendit_reference_id = ?,
                xendit_channel_code = ?
             WHERE payment_id = ?'
        );
        if (!$updatePayment) {
            throw new RuntimeException(
                'Unable to prepare completed payment update.'
            );
        }
        $updatePayment->bind_param(
            'ssssi',
            $paymentId,
            $xenditStatus,
            $referenceId,
            $channelCode,
            $payment['payment_id']
        );
        if (!$updatePayment->execute()) {
            $updatePayment->close();
            throw new RuntimeException(
                'Unable to update completed payment.'
            );
        }
        $updatePayment->close();
        $conn->commit();
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Payment webhook was already processed.',
            'payment_request_id' => $paymentRequestId,
            'payment_id' => $paymentId
        ]);
        exit;
    }
    $localPaymentAmount = (float) $payment['amount'];
    $capturedAmount = 0;
    if (
        isset($data['captures']) &&
        is_array($data['captures'])
    ) {
        foreach ($data['captures'] as $capture) {
            if (!is_array($capture)) {
                continue;
            }
            $captureStatus = strtoupper(
                trim((string) ($capture['status'] ?? ''))
            );
            $captureAmount = (float) (
                $capture['capture_amount'] ??
                $capture['amount'] ??
                0
            );
            if (
                $captureStatus === 'SUCCEEDED' &&
                $captureAmount > 0
            ) {
                $capturedAmount += $captureAmount;
            }
        }
    }
    if ($capturedAmount <= 0) {
        $capturedAmount = $requestAmount;
    }
    if ($capturedAmount <= 0) {
        $capturedAmount = $localPaymentAmount;
    }
    if ($capturedAmount <= 0) {
        $conn->rollback();
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Captured payment amount is missing or invalid.'
        ]);
        exit;
    }
    $paymentMethod = strtolower(
        trim((string) ($payment['payment_method'] ?? ''))
    );
    if (
        $paymentMethod === 'gcash' &&
        abs(
            $capturedAmount -
            $localPaymentAmount
        ) > 0.01
    ) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => 'Webhook payment amount does not match the local payment amount.',
            'local_amount' => $localPaymentAmount,
            'xendit_amount' => $capturedAmount
        ]);
        exit;
    }
    $transactionId = (int) $payment['transaction_id'];
    $transactionStmt = $conn->prepare(
        'SELECT
            transaction_id,
            appointment_id,
            patient_id,
            net_amount,
            paid_amount,
            balance_amount,
            status
         FROM tbl_finance_transactions
         WHERE transaction_id = ?
         LIMIT 1
         FOR UPDATE'
    );
    if (!$transactionStmt) {
        throw new RuntimeException(
            'Unable to prepare transaction lookup.'
        );
    }
    $transactionStmt->bind_param(
        'i',
        $transactionId
    );
    if (!$transactionStmt->execute()) {
        $transactionStmt->close();
        throw new RuntimeException(
            'Unable to execute transaction lookup.'
        );
    }
    $transactionResult =
        $transactionStmt->get_result();
    $transaction =
        $transactionResult->fetch_assoc();
    $transactionStmt->close();
    if (!$transaction) {
        throw new RuntimeException(
            'Finance transaction was not found.'
        );
    }
    if (
        (string) $transaction['patient_id'] !==
        (string) $payment['patient_id']
    ) {
        throw new RuntimeException(
            'Payment patient does not match finance transaction.'
        );
    }
    $netAmount = max(
        0,
        (float) $transaction['net_amount']
    );
    $currentPaidAmount = max(
        0,
        (float) $transaction['paid_amount']
    );
    $currentBalanceAmount = max(
        0,
        $netAmount - $currentPaidAmount
    );
    if ($currentBalanceAmount <= 0) {
        throw new RuntimeException(
            'This finance transaction is already fully paid.'
        );
    }
    if ($capturedAmount > $currentBalanceAmount + 0.01) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => 'Captured payment amount is greater than the remaining finance balance.',
            'captured_amount' => $capturedAmount,
            'remaining_balance' => $currentBalanceAmount
        ]);
        exit;
    }
    $newPaidAmount =
        $currentPaidAmount +
        $capturedAmount;
    if ($newPaidAmount > $netAmount) {
        $newPaidAmount = $netAmount;
    }
    $newBalanceAmount = max(
        0,
        $netAmount - $newPaidAmount
    );
    if ($newPaidAmount <= 0) {
        $newStatus = 'unpaid';
    } elseif ($newBalanceAmount <= 0.009) {
        $newStatus = 'paid';
    } else {
        $newStatus = 'partial';
    }
    $updatePayment = $conn->prepare(
        'UPDATE tbl_finance_payments
         SET
            status = "paid",
            xendit_payment_id = NULLIF(?, ""),
            xendit_status = ?,
            xendit_reference_id = ?,
            xendit_channel_code = ?,
            paid_at = CURRENT_TIMESTAMP
         WHERE payment_id = ?'
    );
    if (!$updatePayment) {
        throw new RuntimeException(
            'Unable to prepare successful payment update.'
        );
    }
    $successStatus =
        $xenditStatus !== ''
            ? $xenditStatus
            : 'SUCCEEDED';
    $updatePayment->bind_param(
        'ssssi',
        $paymentId,
        $successStatus,
        $referenceId,
        $channelCode,
        $payment['payment_id']
    );
    if (!$updatePayment->execute()) {
        $updatePayment->close();
        throw new RuntimeException(
            'Unable to mark payment as paid.'
        );
    }
    $updatePayment->close();
    $updateTransaction = $conn->prepare(
        'UPDATE tbl_finance_transactions
         SET
            paid_amount = ?,
            balance_amount = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
         WHERE transaction_id = ?'
    );
    if (!$updateTransaction) {
        throw new RuntimeException(
            'Unable to prepare finance transaction update.'
        );
    }
    $updateTransaction->bind_param(
        'ddsi',
        $newPaidAmount,
        $newBalanceAmount,
        $newStatus,
        $transactionId
    );
    if (!$updateTransaction->execute()) {
        $updateTransaction->close();
        throw new RuntimeException(
            'Unable to update finance transaction.'
        );
    }
    $updateTransaction->close();
    if (!empty($transaction['appointment_id'])) {
        $appointmentPaymentStatus =
            $newBalanceAmount <= 0.009
                ? 'paid'
                : 'partial';
        $appointmentStmt = $conn->prepare(
            'UPDATE tbl_patient_appointments
             SET
                payment_status = ?,
                payment_amount = ?
             WHERE appointment_id = ?
             LIMIT 1'
        );
        if (!$appointmentStmt) {
            throw new RuntimeException(
                'Unable to prepare appointment payment update.'
            );
        }
        $appointmentId = (int) $transaction['appointment_id'];
        $appointmentStmt->bind_param(
            'sdi',
            $appointmentPaymentStatus,
            $newPaidAmount,
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
    $conn->commit();
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Payment captured and finance records updated successfully.',
        'event' => $event,
        'payment_id' => $paymentId,
        'payment_request_id' => $paymentRequestId,
        'transaction_id' => $transactionId,
        'payment_amount' => $capturedAmount,
        'paid_amount' => $newPaidAmount,
        'balance_amount' => $newBalanceAmount,
        'status' => $newStatus
    ]);
    exit;
} catch (Throwable $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to process payment capture webhook.'
    ]);
    exit;
}