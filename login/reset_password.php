<?php
header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

require_once __DIR__ . "/../php/db_connect.php";

function sendResponse($success, $message, $status = 200)
{
    http_response_code($status);
    echo json_encode([
        "success" => $success,
        "message" => $message
    ]);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    header("Allow: POST");
    sendResponse(false, "Invalid request method.", 405);
}

$token = trim($_POST["token"] ?? "");
$password = $_POST["password"] ?? "";
$confirmPassword = $_POST["confirm_password"] ?? "";

if (!preg_match('/\A[a-f0-9]{64}\z/i', $token)) {
    sendResponse(false, "This password reset link is invalid. Please request a new one.", 400);
}

if (!is_string($password) || strlen($password) < 8 || strlen($password) > 128) {
    sendResponse(false, "Your password must contain 8 to 128 characters.", 400);
}

if (!is_string($confirmPassword) || !hash_equals($password, $confirmPassword)) {
    sendResponse(false, "The passwords do not match.", 400);
}

$tokenHash = hash("sha256", $token);
$transactionStarted = false;

try {
    $conn->begin_transaction();
    $transactionStarted = true;

    $stmt = $conn->prepare("
        SELECT reset_id, user_id, expires_at, used_at
        FROM tbl_password_resets
        WHERE token_hash = ?
        LIMIT 1
        FOR UPDATE
    ");

    if (!$stmt) {
        throw new RuntimeException("Unable to prepare token lookup.");
    }

    $stmt->bind_param("s", $tokenHash);

    if (!$stmt->execute()) {
        $stmt->close();
        throw new RuntimeException("Unable to validate reset token.");
    }

    $result = $stmt->get_result();
    $reset = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    if (
        !$reset ||
        !empty($reset["used_at"]) ||
        strtotime($reset["expires_at"]) <= time()
    ) {
        $conn->rollback();
        $transactionStarted = false;
        $conn->close();

        sendResponse(
            false,
            "This password reset link is invalid or expired. Please request a new one.",
            400
        );
    }

    $userId = (int) $reset["user_id"];
    $resetId = (int) $reset["reset_id"];
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    if ($passwordHash === false) {
        throw new RuntimeException("Unable to secure the new password.");
    }

    $updateStmt = $conn->prepare("
        UPDATE tbl_users
        SET password = ?
        WHERE user_id = ?
        LIMIT 1
    ");

    if (!$updateStmt) {
        throw new RuntimeException("Unable to prepare password update.");
    }

    $updateStmt->bind_param("si", $passwordHash, $userId);

    if (!$updateStmt->execute() || $updateStmt->affected_rows !== 1) {
        $updateStmt->close();
        throw new RuntimeException("Unable to update the account password.");
    }

    $updateStmt->close();

    $usedStmt = $conn->prepare("
        UPDATE tbl_password_resets
        SET used_at = NOW()
        WHERE reset_id = ? AND used_at IS NULL
    ");

    if (!$usedStmt) {
        throw new RuntimeException("Unable to prepare token update.");
    }

    $usedStmt->bind_param("i", $resetId);

    if (!$usedStmt->execute() || $usedStmt->affected_rows !== 1) {
        $usedStmt->close();
        throw new RuntimeException("Unable to mark reset token as used.");
    }

    $usedStmt->close();

    $conn->commit();
    $transactionStarted = false;
    $conn->close();

    sendResponse(true, "Your password has been changed successfully. You can now log in.");
} catch (Throwable $error) {
    if ($transactionStarted) {
        try {
            $conn->rollback();
        } catch (Throwable $ignored) {
        }
    }

    error_log("Password reset failed: " . $error->getMessage());

    if (isset($conn) && $conn instanceof mysqli) {
        $conn->close();
    }

    sendResponse(false, "Unable to reset your password right now. Please try again.", 500);
}
?>