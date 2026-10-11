<?php
function sendClinicEmail($toEmail, $toName, $subject, $message) {
    $config = require __DIR__ . "/brevo_config.php";

    $payload = [
        "sender"      => [
            "name"  => $config["sender_name"],
            "email" => $config["sender_email"]
        ],
        "to"          => [[
            "email" => $toEmail,
            "name"  => $toName
        ]],
        "subject"     => $subject,
        "textContent" => $message
    ];

    $ch = curl_init("https://api.brevo.com/v3/smtp/email");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            "accept: application/json",
            "api-key: " . $config["api_key"],
            "content-type: application/json"
        ],
        CURLOPT_POSTFIELDS     => json_encode($payload)
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        return ["success" => false, "message" => "Connection error: " . $curlErr];
    }

    if ($httpCode >= 200 && $httpCode < 300) {
        return ["success" => true, "message" => "Email sent successfully."];
    }

    $data = json_decode($response, true);
    $detail = $data["message"] ?? $response;
    return ["success" => false, "message" => "Brevo error ($httpCode): " . $detail];
}