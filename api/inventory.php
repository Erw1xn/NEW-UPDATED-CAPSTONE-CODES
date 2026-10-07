<?php
declare(strict_types=1);
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once __DIR__ . '/../php/db_connect.php';
function jsonResponse(bool $success, string $message = '', $data = null, int $status = 200): void
{
    http_response_code($status);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
function normalizeItemRow(array $row): array
{
    $itemId = (string) ($row['item_id'] ?? $row['id'] ?? '');
    $itemName = (string) ($row['item_name'] ?? $row['name'] ?? '');
    return [
        'id' => $itemId,
        'item_id' => $itemId,
        'name' => $itemName,
        'itemName' => $itemName,
        'category' => (string) ($row['category'] ?? 'Other'),
        'unit' => (string) ($row['unit'] ?? 'unit'),
        'stock' => (float) ($row['stock_quantity'] ?? $row['stock'] ?? 0),
        'stock_quantity' => (float) ($row['stock_quantity'] ?? $row['stock'] ?? 0),
        'minimum' => (float) ($row['reorder_level'] ?? $row['minimum'] ?? 0),
        'reorder_level' => (float) ($row['reorder_level'] ?? $row['minimum'] ?? 0),
        'expiry' => $row['expiry_date'] ?? $row['expiry'] ?? null,
        'createdAt' => $row['created_at'] ?? $row['createdAt'] ?? null,
        'updatedAt' => $row['updated_at'] ?? $row['updatedAt'] ?? null,
    ];
}
function normalizeMovementRow(array $row): array
{
    $itemId = (string) ($row['item_id'] ?? $row['itemId'] ?? '');
    $itemName = (string) ($row['item_name'] ?? $row['itemName'] ?? '');
    return [
        'id' => (string) ($row['movement_id'] ?? $row['id'] ?? ''),
        'movementId' => (string) ($row['movement_id'] ?? $row['id'] ?? ''),
        'itemId' => $itemId,
        'itemName' => $itemName,
        'unit' => (string) ($row['unit'] ?? 'unit'),
        'type' => (string) ($row['movement_type'] ?? $row['type'] ?? 'stock-out'),
        'quantity' => (float) ($row['quantity'] ?? 0),
        'previousStock' => (float) ($row['previous_stock'] ?? 0),
        'newStock' => (float) ($row['new_stock'] ?? 0),
        'reason' => (string) ($row['source'] ?? $row['reason'] ?? 'Inventory movement'),
        'source' => (string) ($row['source'] ?? 'manual-adjustment'),
        'patientId' => $row['patient_id'] ?? null,
        'appointmentId' => $row['appointment_id'] ?? null,
        'date' => $row['movement_date'] ?? $row['date'] ?? $row['created_at'] ?? null,
        'createdAt' => $row['created_at'] ?? $row['createdAt'] ?? $row['movement_date'] ?? null,
    ];
}
function loadInventoryData(mysqli $conn): array
{
    $itemsResult = $conn->query("SELECT item_id, item_name, category, unit, stock_quantity, reorder_level, expiry_date, created_at, updated_at FROM tbl_inventory_items ORDER BY item_name ASC");
    $items = [];
    while ($row = $itemsResult ? $itemsResult->fetch_assoc() : null) {
        $items[] = normalizeItemRow($row);
    }
    $movementsResult = $conn->query("SELECT movement_id, item_id, item_name, movement_type, quantity, unit, previous_stock, new_stock, source, appointment_id, patient_id, movement_date, created_at FROM tbl_inventory_movements ORDER BY movement_date DESC, movement_id DESC");
    $movements = [];
    while ($row = $movementsResult ? $movementsResult->fetch_assoc() : null) {
        $movements[] = normalizeMovementRow($row);
    }
    return ['items' => $items, 'movements' => $movements];
}
function normalizeTreatmentMaterial(array $material): array
{
    return [
        'itemId' => trim((string) ($material['itemId'] ?? $material['item_id'] ?? $material['id'] ?? '')),
        'itemName' => trim((string) ($material['itemName'] ?? $material['item_name'] ?? $material['name'] ?? '')),
        'quantity' => max(0, (float) ($material['quantity'] ?? 0)),
    ];
}
function normalizeTreatmentKey(array $treatment, int $treatmentId): string
{
    $key = trim((string) ($treatment['treatmentKey'] ?? $treatment['treatment_key'] ?? ''));
    if ($key !== '') {
        return $key;
    }
    if ($treatmentId > 0) {
        return hash('sha256', 'treatment:' . $treatmentId);
    }
    return '';
}
function resolveInventoryItem(mysqli $conn, string $itemId, string $itemName, bool $forUpdate = false): ?array
{
    if ($itemId !== '' && ctype_digit($itemId) && (int) $itemId > 0) {
        $stmt = $conn->prepare('SELECT item_id, item_name, stock_quantity, unit FROM tbl_inventory_items WHERE item_id = ? LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : ''));
        $id = (int) $itemId;
        $stmt->bind_param('i', $id);
    } else {
        if ($itemName === '') {
            return null;
        }
        $stmt = $conn->prepare('SELECT item_id, item_name, stock_quantity, unit FROM tbl_inventory_items WHERE LOWER(item_name) = LOWER(?) LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : ''));
        $stmt->bind_param('s', $itemName);
    }
    $stmt->execute();
    $item = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $item ?: null;
}
function updateDemandHistory(mysqli $conn, string $itemName, string $demandDate, float $quantity): void
{
    if ($quantity == 0.0) {
        return;
    }
    if ($quantity > 0) {
        $stmt = $conn->prepare('INSERT INTO tbl_inventory_demand_history (item_name, demand_date, total_used, source_type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE total_used = total_used + VALUES(total_used), source_type = VALUES(source_type)');
        $sourceType = 'actual';
        $stmt->bind_param('ssds', $itemName, $demandDate, $quantity, $sourceType);
        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('Unable to update inventory demand history.');
        }
        $stmt->close();
        return;
    }
    $absoluteQuantity = abs($quantity);
    $stmt = $conn->prepare('SELECT history_id, total_used, source_type FROM tbl_inventory_demand_history WHERE item_name = ? AND demand_date = ? LIMIT 1 FOR UPDATE');
    $stmt->bind_param('ss', $itemName, $demandDate);
    $stmt->execute();
    $history = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$history || (string) ($history['source_type'] ?? '') !== 'actual') {
        return;
    }
    $newTotal = max(0, (float) $history['total_used'] - $absoluteQuantity);
    if ($newTotal <= 0) {
        $deleteStmt = $conn->prepare('DELETE FROM tbl_inventory_demand_history WHERE history_id = ?');
        $historyId = (int) $history['history_id'];
        $deleteStmt->bind_param('i', $historyId);
        if (!$deleteStmt->execute()) {
            $deleteStmt->close();
            throw new RuntimeException('Unable to reverse inventory demand history.');
        }
        $deleteStmt->close();
    } else {
        $updateStmt = $conn->prepare('UPDATE tbl_inventory_demand_history SET total_used = ?, source_type = ? WHERE history_id = ?');
        $sourceType = 'actual';
        $historyId = (int) $history['history_id'];
        $updateStmt->bind_param('dsi', $newTotal, $sourceType, $historyId);
        if (!$updateStmt->execute()) {
            $updateStmt->close();
            throw new RuntimeException('Unable to reverse inventory demand history.');
        }
        $updateStmt->close();
    }
}
function createOrUpdateInventoryNotification(mysqli $conn, array $payload, int $createdBy): void
{
    $notificationId = trim((string) ($payload['id'] ?? ''));
    if ($notificationId === '') {
        return;
    }
    $notificationType = 'inventory';
    $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if ($payloadJson === false) {
        throw new RuntimeException('Unable to encode inventory notification.');
    }
    $checkStmt = $conn->prepare('SELECT notification_id FROM tbl_staff_notifications WHERE notification_id = ? LIMIT 1');
    $checkStmt->bind_param('s', $notificationId);
    $checkStmt->execute();
    $existing = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();
    if ($existing) {
        $updateStmt = $conn->prepare('UPDATE tbl_staff_notifications SET notification_type = ?, payload = ?, created_by = ?, updated_at = NOW() WHERE notification_id = ?');
        $updateStmt->bind_param('ssis', $notificationType, $payloadJson, $createdBy, $notificationId);
        if (!$updateStmt->execute()) {
            $updateStmt->close();
            throw new RuntimeException('Unable to update inventory notification.');
        }
        $updateStmt->close();
    } else {
        $insertStmt = $conn->prepare('INSERT INTO tbl_staff_notifications (notification_id, notification_type, payload, created_by) VALUES (?, ?, ?, ?)');
        $insertStmt->bind_param('sssi', $notificationId, $notificationType, $payloadJson, $createdBy);
        if (!$insertStmt->execute()) {
            $insertStmt->close();
            throw new RuntimeException('Unable to create inventory notification.');
        }
        $insertStmt->close();
    }
}
if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    jsonResponse(false, 'Authentication required.', null, 401);
}
$conn->query("ALTER TABLE tbl_inventory_items ADD COLUMN IF NOT EXISTS expiry_date DATE NULL AFTER reorder_level");
$method = $_SERVER['REQUEST_METHOD'];
$raw = file_get_contents('php://input');
$input = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
if (!is_array($input)) {
    $input = $_POST;
}
$action = strtolower(trim((string) ($_GET['action'] ?? $input['action'] ?? 'list')));
if ($method === 'GET') {
    jsonResponse(true, 'Inventory loaded.', loadInventoryData($conn));
}
if ($method !== 'POST') {
    jsonResponse(false, 'Unsupported request method.', null, 405);
}
if ($action === 'list') {
    jsonResponse(true, 'Inventory loaded.', loadInventoryData($conn));
}
if ($action === 'save_item') {
    $itemId = trim((string) ($input['id'] ?? $input['itemId'] ?? ''));
    $name = trim((string) ($input['name'] ?? $input['itemName'] ?? ''));
    $category = trim((string) ($input['category'] ?? 'Other'));
    $unit = trim((string) ($input['unit'] ?? 'unit'));
    $stock = max(0, (float) ($input['stock'] ?? $input['stock_quantity'] ?? 0));
    $minimum = max(0, (float) ($input['minimum'] ?? $input['reorder_level'] ?? 0));
    $expiry = trim((string) ($input['expiry'] ?? ''));
    if ($name === '') {
        jsonResponse(false, 'Inventory item name is required.', null, 422);
    }
    if ($itemId !== '') {

    $existingStmt = $conn->prepare(
        'SELECT item_name
         FROM tbl_inventory_items
         WHERE item_id = ?
         LIMIT 1'
    );

    $existingStmt->bind_param('i', $itemId);
    $existingStmt->execute();

    $existingResult = $existingStmt->get_result();
    $existingItem = $existingResult->fetch_assoc();

    $existingStmt->close();

    if (!$existingItem) {
        jsonResponse(false, 'Inventory item not found.', null, 404);
    }

    $existingName = trim((string) $existingItem['item_name']);

    if ($name !== $existingName) {
        jsonResponse(
            false,
            'Item name cannot be changed after the inventory item has been created.',
            null,
            422
        );
    }

    $stmt = $conn->prepare(
        'UPDATE tbl_inventory_items
         SET category = ?,
             unit = ?,
             stock_quantity = ?,
             reorder_level = ?,
             expiry_date = ?,
             updated_at = NOW()
         WHERE item_id = ?'
    );

    $expiryDate = $expiry !== '' ? $expiry : null;

    $stmt->bind_param(
        'ssddsi',
        $category,
        $unit,
        $stock,
        $minimum,
        $expiryDate,
        (int) $itemId
    );

    $stmt->execute();
    $stmt->close();

} else {
        $stmt = $conn->prepare('INSERT INTO tbl_inventory_items (item_name, category, unit, stock_quantity, reorder_level, expiry_date) VALUES (?, ?, ?, ?, ?, ?)');
        $expiryDate = $expiry !== '' ? $expiry : null;
        $stmt->bind_param('sssdds', $name, $category, $unit, $stock, $minimum, $expiryDate);
        $stmt->execute();
        $itemId = (string) $stmt->insert_id;
        $stmt->close();
    }
    $updated = $conn->query("SELECT item_id, item_name, category, unit, stock_quantity, reorder_level, expiry_date, created_at, updated_at FROM tbl_inventory_items WHERE item_id = " . (int) $itemId . " LIMIT 1");
    $row = $updated ? $updated->fetch_assoc() : null;
    jsonResponse(true, 'Inventory item saved.', $row ? normalizeItemRow($row) : null);
}
if ($action === 'delete_item') {
    $itemId = trim((string) ($input['id'] ?? $input['itemId'] ?? ''));

    if ($itemId === '' || !ctype_digit($itemId)) {
        jsonResponse(false, 'Invalid inventory item ID.', null, 422);
    }

    $itemId = (int) $itemId;

    $checkStmt = $conn->prepare(
        'SELECT item_id, item_name
         FROM tbl_inventory_items
         WHERE item_id = ?
         LIMIT 1'
    );

    if (!$checkStmt) {
        jsonResponse(false, 'Unable to prepare inventory item lookup.', null, 500);
    }

    $checkStmt->bind_param('i', $itemId);
    $checkStmt->execute();

    $itemResult = $checkStmt->get_result();
    $item = $itemResult ? $itemResult->fetch_assoc() : null;

    $checkStmt->close();

    if (!$item) {
        jsonResponse(false, 'Inventory item not found.', null, 404);
    }

    /*
     * Do not allow deletion once the item already has
     * inventory or treatment history.
     */

    $movementStmt = $conn->prepare(
        'SELECT COUNT(*) AS total
         FROM tbl_inventory_movements
         WHERE item_id = ?'
    );

    if (!$movementStmt) {
        jsonResponse(false, 'Unable to check inventory history.', null, 500);
    }

    $movementStmt->bind_param('i', $itemId);
    $movementStmt->execute();

    $movementResult = $movementStmt->get_result();
    $movementRow = $movementResult
        ? $movementResult->fetch_assoc()
        : ['total' => 0];

    $movementStmt->close();

    $treatmentUsageStmt = $conn->prepare(
        'SELECT COUNT(*) AS total
         FROM tbl_inventory_treatment_usage
         WHERE item_id = ?'
    );

    if (!$treatmentUsageStmt) {
        jsonResponse(false, 'Unable to check treatment usage history.', null, 500);
    }

    $treatmentUsageStmt->bind_param('i', $itemId);
    $treatmentUsageStmt->execute();

    $treatmentUsageResult = $treatmentUsageStmt->get_result();
    $treatmentUsageRow = $treatmentUsageResult
        ? $treatmentUsageResult->fetch_assoc()
        : ['total' => 0];

    $treatmentUsageStmt->close();

    $movementCount = (int) ($movementRow['total'] ?? 0);
    $treatmentUsageCount = (int) ($treatmentUsageRow['total'] ?? 0);

    if ($movementCount > 0 || $treatmentUsageCount > 0) {
        jsonResponse(
            false,
            'This inventory item cannot be deleted because it already has inventory or treatment history.',
            null,
            409
        );
    }

    $deleteStmt = $conn->prepare(
        'DELETE FROM tbl_inventory_items
         WHERE item_id = ?'
    );

    if (!$deleteStmt) {
        jsonResponse(false, 'Unable to prepare inventory item deletion.', null, 500);
    }

    $deleteStmt->bind_param('i', $itemId);

    if (!$deleteStmt->execute()) {
        $deleteStmt->close();

        jsonResponse(
            false,
            'Unable to delete inventory item.',
            null,
            500
        );
    }

    $deleteStmt->close();

    jsonResponse(
        true,
        'Inventory item deleted.',
        [
            'item_id' => $itemId,
            'item_name' => $item['item_name']
        ]
    );
}
if ($action === 'record_movement') {
    $itemIdentifier = (string) ($input['itemId'] ?? $input['item_id'] ?? '');
    $itemName = trim((string) ($input['itemName'] ?? $input['name'] ?? ''));
    $type = strtolower(trim((string) ($input['type'] ?? 'stock-in')));
    $quantity = max(0, (float) ($input['quantity'] ?? 0));
    $reason = trim((string) ($input['reason'] ?? 'Inventory adjustment'));
    $patientId = $input['patientId'] ?? null;
    $appointmentId = $input['appointmentId'] ?? null;
    if ($itemIdentifier === '' && $itemName === '') {
        jsonResponse(false, 'Inventory item is required.', null, 422);
    }
    if ($quantity <= 0) {
        jsonResponse(false, 'Movement quantity must be greater than zero.', null, 422);
    }
    if ($itemIdentifier !== '') {
        $itemIdentifierInt = (int) $itemIdentifier;
        $itemSelect = $conn->prepare('SELECT item_id, item_name, stock_quantity, unit FROM tbl_inventory_items WHERE item_id = ? LIMIT 1');
        $itemSelect->bind_param('i', $itemIdentifierInt);
    } else {
        $itemSelect = $conn->prepare('SELECT item_id, item_name, stock_quantity, unit FROM tbl_inventory_items WHERE LOWER(item_name) = LOWER(?) LIMIT 1');
        $itemSelect->bind_param('s', $itemName);
    }
    $itemSelect->execute();
    $item = $itemSelect->get_result()->fetch_assoc();
    $itemSelect->close();
    if (!$item) {
        jsonResponse(false, 'Inventory item not found.', null, 404);
    }
    $previousStock = (float) ($item['stock_quantity'] ?? 0);
    $unit = (string) ($item['unit'] ?? 'unit');
    $newStock = $previousStock;
    if ($type === 'stock-out') {
        if ($quantity > $previousStock) {
            jsonResponse(false, 'Insufficient stock for this movement.', null, 422);
        }
        $newStock = $previousStock - $quantity;
    } else {
        $newStock = $previousStock + $quantity;
    }
    $itemIdForUpdate = (int) $item['item_id'];
    $itemNameForMovement = (string) $item['item_name'];
    $updateStmt = $conn->prepare('UPDATE tbl_inventory_items SET stock_quantity = ?, updated_at = NOW() WHERE item_id = ?');
    $updateStmt->bind_param('di', $newStock, $itemIdForUpdate);
    $updateStmt->execute();
    $updateStmt->close();
    $movementStmt = $conn->prepare('INSERT INTO tbl_inventory_movements (item_id, item_name, movement_type, quantity, unit, previous_stock, new_stock, source, appointment_id, patient_id, movement_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
    $movementType = $type === 'stock-out' ? 'stock-out' : 'stock-in';
    $movementStmt->bind_param('issdsddsss', $itemIdForUpdate, $itemNameForMovement, $movementType, $quantity, $unit, $previousStock, $newStock, $reason, $appointmentId, $patientId);
    $movementStmt->execute();
    $movementStmt->close();
    jsonResponse(true, 'Inventory movement recorded.', loadInventoryData($conn));
}
if ($action === 'deduct_for_treatment') {
    $treatment = is_array($input['treatment'] ?? null) ? $input['treatment'] : [];
    $requestedMaterialsRaw = is_array($input['requestedMaterials'] ?? null) ? $input['requestedMaterials'] : (is_array($input['materials'] ?? null) ? $input['materials'] : []);
    $patient = is_array($input['patient'] ?? null) ? $input['patient'] : [];
    $treatmentId = (int) ($treatment['treatmentId'] ?? $treatment['treatment_id'] ?? $input['treatmentId'] ?? $input['treatment_id'] ?? $input['id'] ?? 0);
    $treatmentKey = normalizeTreatmentKey($treatment, $treatmentId);
    $patientName = trim((string) ($patient['firstName'] ?? $patient['first_name'] ?? $patient['name'] ?? ''));
    $lastName = trim((string) ($patient['lastName'] ?? $patient['last_name'] ?? ''));
    $patientLabel = trim($patientName . ' ' . $lastName);
    $procedure = trim((string) ($treatment['procedure'] ?? $treatment['treatment'] ?? $treatment['procedureName'] ?? $treatment['procedure_name'] ?? 'Treatment'));
    $patientId = trim((string) ($treatment['patientId'] ?? $treatment['patient_id'] ?? $patient['patientId'] ?? $patient['patient_id'] ?? $patient['id'] ?? ''));
    $appointmentId = trim((string) ($treatment['appointmentId'] ?? $treatment['appointment_id'] ?? ''));
    $treatmentDate = trim((string) ($treatment['treatmentDate'] ?? $treatment['treatment_date'] ?? date('Y-m-d')));
    $toothNumber = trim((string) ($treatment['toothNumber'] ?? $treatment['tooth_number'] ?? ''));
    if ($treatmentId <= 0) {
        jsonResponse(false, 'A valid treatment ID is required before inventory deduction.', null, 422);
    }
    if ($treatmentDate === '') {
        $treatmentDate = date('Y-m-d');
    }
    $requestedMaterials = [];
    foreach ($requestedMaterialsRaw as $material) {
        if (!is_array($material)) {
            continue;
        }
        $normalized = normalizeTreatmentMaterial($material);
        if ($normalized['itemName'] === '' && $normalized['itemId'] === '') {
            continue;
        }
        if ($normalized['quantity'] <= 0) {
            continue;
        }
        $requestedMaterials[] = $normalized;
    }
    if (!$requestedMaterials) {
        $existingStmt = $conn->prepare('SELECT usage_id FROM tbl_inventory_treatment_usage WHERE treatment_id = ? LIMIT 1');
        $existingStmt->bind_param('i', $treatmentId);
        $existingStmt->execute();
        $existingUsage = $existingStmt->get_result()->fetch_assoc();
        $existingStmt->close();
        if (!$existingUsage) {
            jsonResponse(true, 'No consumed materials to deduct.', ['movements' => [], 'usage' => [], 'unresolvedMaterials' => []]);
        }
    }
    $aggregatedRequested = [];
    foreach ($requestedMaterials as $material) {
        $item = resolveInventoryItem($conn, $material['itemId'], $material['itemName']);
        if (!$item) {
            jsonResponse(false, 'One or more consumed materials are not registered in inventory.', [
                'movements' => [],
                'usage' => [],
                'unresolvedMaterials' => [[
                    'itemName' => $material['itemName'],
                    'itemId' => $material['itemId'],
                    'quantity' => $material['quantity'],
                    'unit' => 'unit',
                    'available' => 0,
                    'status' => 'unregistered',
                ]],
            ], 422);
        }
        $resolvedId = (int) $item['item_id'];
        if (!isset($aggregatedRequested[$resolvedId])) {
            $aggregatedRequested[$resolvedId] = [
                'itemId' => $resolvedId,
                'itemName' => (string) $item['item_name'],
                'quantity' => 0.0,
                'unit' => (string) ($item['unit'] ?? 'unit'),
            ];
        }
        $aggregatedRequested[$resolvedId]['quantity'] += $material['quantity'];
    }
    $conn->begin_transaction();
    try {
        $existingUsage = [];
        $usageStmt = $conn->prepare('SELECT usage_id, treatment_id, treatment_key, item_id, quantity FROM tbl_inventory_treatment_usage WHERE treatment_id = ? FOR UPDATE');
        $usageStmt->bind_param('i', $treatmentId);
        if (!$usageStmt->execute()) {
            throw new RuntimeException('Unable to check existing treatment inventory usage.');
        }
        $usageResult = $usageStmt->get_result();
        while ($row = $usageResult->fetch_assoc()) {
            $existingUsage[(int) $row['item_id']] = [
                'usageId' => (int) $row['usage_id'],
                'itemId' => (int) $row['item_id'],
                'quantity' => (float) $row['quantity'],
            ];
        }
        $usageStmt->close();
        $requestedIds = array_keys($aggregatedRequested);
        sort($requestedIds);
        $existingIds = array_keys($existingUsage);
        sort($existingIds);
        if ($requestedIds === $existingIds) {
            $sameUsage = true;
            foreach ($requestedIds as $requestedId) {
                if (abs((float) $aggregatedRequested[$requestedId]['quantity'] - (float) $existingUsage[$requestedId]['quantity']) > 0.00001) {
                    $sameUsage = false;
                    break;
                }
            }
            if ($sameUsage) {
                $conn->commit();
                $notificationId = 'inventory-treatment-' . $treatmentId;
                $existingNotification = [
                    'id' => $notificationId,
                    'procedure' => $procedure,
                    'patientName' => $patientLabel !== '' ? $patientLabel : 'Patient',
                    'patientId' => $patientId,
                    'treatmentDate' => $treatmentDate,
                    'toothNumber' => $toothNumber,
                    'items' => [],
                ];
                foreach ($aggregatedRequested as $material) {
                    $existingNotification['items'][] = [
                        'itemId' => (string) $material['itemId'],
                        'itemName' => $material['itemName'],
                        'quantity' => $material['quantity'],
                        'unit' => $material['unit'],
                        'status' => 'stock-out-completed',
                    ];
                }
                jsonResponse(true, 'Treatment inventory usage is already up to date.', [
                    'movements' => [],
                    'usage' => array_values($existingUsage),
                    'unresolvedMaterials' => [],
                    'notification' => $existingNotification,
                ]);
            }
        }
        foreach ($existingUsage as $oldUsage) {
            $oldItemId = (int) $oldUsage['itemId'];
            $oldQuantity = (float) $oldUsage['quantity'];
            $oldItemStmt = $conn->prepare('SELECT item_id, item_name, stock_quantity, unit FROM tbl_inventory_items WHERE item_id = ? LIMIT 1 FOR UPDATE');
            $oldItemStmt->bind_param('i', $oldItemId);
            if (!$oldItemStmt->execute()) {
                $oldItemStmt->close();
                throw new RuntimeException('Unable to load previous inventory item.');
            }
            $oldItem = $oldItemStmt->get_result()->fetch_assoc();
            $oldItemStmt->close();
            if (!$oldItem) {
                throw new RuntimeException('A previously consumed inventory item no longer exists.');
            }
            $oldPreviousStock = (float) $oldItem['stock_quantity'];
            $oldNewStock = $oldPreviousStock + $oldQuantity;
            $oldUpdateStmt = $conn->prepare('UPDATE tbl_inventory_items SET stock_quantity = ?, updated_at = NOW() WHERE item_id = ?');
            $oldUpdateStmt->bind_param('di', $oldNewStock, $oldItemId);
            if (!$oldUpdateStmt->execute()) {
                $oldUpdateStmt->close();
                throw new RuntimeException('Unable to restore previous inventory stock.');
            }
            $oldUpdateStmt->close();
            $reverseReason = 'Treatment inventory reversal: ' . $procedure . ' (' . $patientLabel . ')';
            $reverseMovementStmt = $conn->prepare('INSERT INTO tbl_inventory_movements (item_id, item_name, movement_type, quantity, unit, previous_stock, new_stock, source, appointment_id, patient_id, movement_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())');
            $reverseMovementType = 'stock-in';
            $oldItemName = (string) $oldItem['item_name'];
            $oldUnit = (string) ($oldItem['unit'] ?? 'unit');
            $reverseMovementStmt->bind_param('issdsddsss', $oldItemId, $oldItemName, $reverseMovementType, $oldQuantity, $oldUnit, $oldPreviousStock, $oldNewStock, $reverseReason, $appointmentId, $patientId);
            if (!$reverseMovementStmt->execute()) {
                $reverseMovementStmt->close();
                throw new RuntimeException('Unable to record inventory reversal movement.');
            }
            $reverseMovementStmt->close();
            updateDemandHistory($conn, $oldItemName, $treatmentDate, -$oldQuantity);
        }
        if ($existingUsage) {
            $deleteUsageStmt = $conn->prepare('DELETE FROM tbl_inventory_treatment_usage WHERE treatment_id = ?');
            $deleteUsageStmt->bind_param('i', $treatmentId);
            if (!$deleteUsageStmt->execute()) {
                $deleteUsageStmt->close();
                throw new RuntimeException('Unable to reset previous treatment inventory usage.');
            }
            $deleteUsageStmt->close();
        }
        $movements = [];
        $usage = [];
        $notificationItems = [];
        $nowIso = date('Y-m-d H:i:s');
        foreach ($aggregatedRequested as $material) {
            $itemId = (int) $material['itemId'];
            $quantity = (float) $material['quantity'];
            $itemStmt = $conn->prepare('SELECT item_id, item_name, stock_quantity, unit FROM tbl_inventory_items WHERE item_id = ? LIMIT 1 FOR UPDATE');
            $itemStmt->bind_param('i', $itemId);
            if (!$itemStmt->execute()) {
                $itemStmt->close();
                throw new RuntimeException('Unable to load inventory item.');
            }
            $item = $itemStmt->get_result()->fetch_assoc();
            $itemStmt->close();
            if (!$item) {
                throw new RuntimeException('Inventory item not found.');
            }
            $previousStock = (float) $item['stock_quantity'];
            if ($previousStock < $quantity) {
                $available = $previousStock;
                throw new RuntimeException('Insufficient stock for ' . $item['item_name'] . '. Available: ' . $available . '. Required: ' . $quantity . '.');
            }
            $newStock = $previousStock - $quantity;
            $itemName = (string) $item['item_name'];
            $unit = (string) ($item['unit'] ?? 'unit');
            $updateStmt = $conn->prepare('UPDATE tbl_inventory_items SET stock_quantity = ?, updated_at = NOW() WHERE item_id = ?');
            $updateStmt->bind_param('di', $newStock, $itemId);
            if (!$updateStmt->execute()) {
                $updateStmt->close();
                throw new RuntimeException('Unable to deduct inventory stock.');
            }
            $updateStmt->close();
            $reason = 'Patient treatment: ' . $procedure . ' (' . $patientLabel . ')';
            $movementStmt = $conn->prepare('INSERT INTO tbl_inventory_movements (item_id, item_name, movement_type, quantity, unit, previous_stock, new_stock, source, appointment_id, patient_id, movement_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())');
            $movementType = 'stock-out';
            $movementStmt->bind_param('issdsddsss', $itemId, $itemName, $movementType, $quantity, $unit, $previousStock, $newStock, $reason, $appointmentId, $patientId);
            if (!$movementStmt->execute()) {
                $movementStmt->close();
                throw new RuntimeException('Unable to record inventory movement.');
            }
            $movementId = $movementStmt->insert_id;
            $movementStmt->close();
            $usageStmt = $conn->prepare('INSERT INTO tbl_inventory_treatment_usage (treatment_id, treatment_key, item_id, quantity) VALUES (?, ?, ?, ?)');
            $usageStmt->bind_param('isid', $treatmentId, $treatmentKey, $itemId, $quantity);
            if (!$usageStmt->execute()) {
                $usageStmt->close();
                throw new RuntimeException('Unable to record treatment inventory usage.');
            }
            $usageId = $usageStmt->insert_id;
            $usageStmt->close();
            updateDemandHistory($conn, $itemName, $treatmentDate, $quantity);
            $movements[] = [
                'id' => (string) $movementId,
                'itemId' => (string) $itemId,
                'itemName' => $itemName,
                'unit' => $unit,
                'type' => 'stock-out',
                'quantity' => $quantity,
                'previousStock' => $previousStock,
                'newStock' => $newStock,
                'reason' => $reason,
                'source' => 'clinical-treatment',
                'patientId' => $patientId,
                'appointmentId' => $appointmentId,
                'date' => $nowIso,
                'createdAt' => $nowIso,
            ];
            $usage[] = [
                'usageId' => (string) $usageId,
                'treatmentId' => (string) $treatmentId,
                'treatmentKey' => $treatmentKey,
                'itemId' => (string) $itemId,
                'itemName' => $itemName,
                'quantity' => $quantity,
                'unit' => $unit,
            ];
            $notificationItems[] = [
                'itemId' => (string) $itemId,
                'itemName' => $itemName,
                'quantity' => $quantity,
                'unit' => $unit,
                'status' => 'stock-out-completed',
                'available' => $newStock,
            ];
        }
        $notificationId = 'inventory-treatment-' . $treatmentId;
        $notificationPayload = [
            'id' => $notificationId,
            'type' => 'inventory',
            'notificationType' => 'inventory',
            'procedure' => $procedure,
            'patientName' => $patientLabel !== '' ? $patientLabel : 'Patient',
            'patientId' => $patientId,
            'treatmentDate' => $treatmentDate,
            'toothNumber' => $toothNumber,
            'appointmentId' => $appointmentId,
            'treatmentId' => $treatmentId,
            'items' => $notificationItems,
            'createdAt' => $nowIso,
        ];
        createOrUpdateInventoryNotification($conn, $notificationPayload, (int) $_SESSION['user_id']);
        $conn->commit();
        jsonResponse(true, 'Treatment materials deducted, usage recorded, demand history updated, and inventory notification created.', [
            'movements' => $movements,
            'usage' => $usage,
            'unresolvedMaterials' => [],
            'notification' => $notificationPayload,
        ]);
    } catch (Throwable $error) {
        $conn->rollback();
        $message = $error->getMessage();
        $status = str_contains(strtolower($message), 'insufficient stock') ? 422 : 500;
        jsonResponse(false, $message !== '' ? $message : 'Unable to process treatment inventory usage.', null, $status);
    }
}
jsonResponse(false, 'Inventory action is not supported.', null, 400);