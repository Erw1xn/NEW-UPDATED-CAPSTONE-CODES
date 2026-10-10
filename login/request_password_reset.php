<?php
session_start();
header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

require_once __DIR__ . "/../php/db_connect.php";
require_once __DIR__ . "/../php/mailer.php";

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

$email = strtolower(trim($_POST["email"] ?? ""));

if ($email === "" || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendResponse(false, "Please enter a valid email address.", 400);
}

$transactionStarted = false;
$userId = null;
$tokenHash = null;

try {
    $stmt = $conn->prepare("
        SELECT user_id, email, firstname, lastname
        FROM tbl_users
        WHERE LOWER(email) = ?
        LIMIT 1
    ");

    if (!$stmt) {
        throw new RuntimeException("Unable to prepare account lookup.");
    }

    $stmt->bind_param("s", $email);

    if (!$stmt->execute()) {
        $stmt->close();
        throw new RuntimeException("Unable to check account.");
    }

    $result = $stmt->get_result();
    $account = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    $genericMessage = "If an account matches that email, password recovery instructions will be sent.";

    if (!$account) {
        $conn->close();
        sendResponse(true, $genericMessage);
    }

    $userId = (int) $account["user_id"];
    $recipientEmail = $account["email"];
    $recipientName = trim(($account["firstname"] ?? "") . " " . ($account["lastname"] ?? ""));

    if ($recipientName === "") {
        $recipientName = "DentaNueva Patient";
    }

    $rawToken = bin2hex(random_bytes(32));
    $tokenHash = hash("sha256", $rawToken);
    $expiresAt = date("Y-m-d H:i:s", time() + 1800);

    $conn->begin_transaction();
    $transactionStarted = true;

    $deleteStmt = $conn->prepare("
        DELETE FROM tbl_password_resets
        WHERE user_id = ?
    ");

    if (!$deleteStmt) {
        throw new RuntimeException("Unable to prepare reset cleanup.");
    }

    $deleteStmt->bind_param("i", $userId);

    if (!$deleteStmt->execute()) {
        $deleteStmt->close();
        throw new RuntimeException("Unable to clear previous reset requests.");
    }

    $deleteStmt->close();

    $insertStmt = $conn->prepare("
        INSERT INTO tbl_password_resets
            (user_id, token_hash, expires_at, used_at)
        VALUES (?, ?, ?, NULL)
    ");

    if (!$insertStmt) {
        throw new RuntimeException("Unable to prepare reset request.");
    }

    $insertStmt->bind_param("iss", $userId, $tokenHash, $expiresAt);

    if (!$insertStmt->execute()) {
        $insertStmt->close();
        throw new RuntimeException("Unable to save reset request.");
    }

    $insertStmt->close();
    $conn->commit();
    $transactionStarted = false;

    $https = isset($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off";
    $scheme = $https ? "https" : "http";
    $host = $_SERVER["HTTP_HOST"] ?? "";

    if ($host === "" || preg_match('/[\r\n]/', $host)) {
        throw new RuntimeException("Invalid request host.");
    }

    $scriptDirectory = str_replace("\\", "/", dirname($_SERVER["SCRIPT_NAME"] ?? "/login/request_password_reset.php"));
$scriptDirectory = rtrim($scriptDirectory, "/");
$appDirectory = dirname($scriptDirectory);
if ($appDirectory === "." || $appDirectory === "/") {
    $appDirectory = "";
}
$resetUrl = $scheme . "://" . $host . $appDirectory
    . "/homepage/homepage.html?reset_token=" . rawurlencode($rawToken);

    $subject = "Reset Your DentaNueva Password";

    $message = "Hello " . $recipientName . ",\n\n";
    $message .= "We received a request to reset your DentaNueva Dental Clinic account password.\n\n";
    $message .= "Use the link below to choose a new password:\n\n";
    $message .= $resetUrl . "\n\n";
    $message .= "This link expires in 30 minutes and can only be used once.\n";
    $message .= "If you did not request a password reset, you can ignore this email.\n\n";
    $message .= "DentaNueva Dental Clinic";

    $mailResult = sendClinicEmail(
        $recipientEmail,
        $recipientName,
        $subject,
        $message
    );

    if (
        !is_array($mailResult) ||
        empty($mailResult["success"])
    ) {
        $cleanupStmt = $conn->prepare("
            DELETE FROM tbl_password_resets
            WHERE user_id = ? AND token_hash = ?
        ");

        if ($cleanupStmt) {
            $cleanupStmt->bind_param("is", $userId, $tokenHash);
            $cleanupStmt->execute();
            $cleanupStmt->close();
        }

        error_log(
            "Password reset email failed for user ID " . $userId . ": "
            . ($mailResult["message"] ?? "Unknown mail error")
        );

        $conn->close();
        sendResponse(false, "We could not send the reset email right now. Please check the email service configuration and try again.", 500);
    }

    $conn->close();
    sendResponse(true, $genericMessage);
} catch (Throwable $error) {
    if ($transactionStarted) {
        try {
            $conn->rollback();
        } catch (Throwable $ignored) {
        }
    }

    error_log("Password reset request failed: " . $error->getMessage());

    if (isset($conn) && $conn instanceof mysqli) {
        $conn->close();
    }

    sendResponse(false, "Unable to process your request right now. Please try again.", 500);
}
?>