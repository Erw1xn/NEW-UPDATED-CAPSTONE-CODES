<?php
declare(strict_types=1);
if (!function_exists('categorySkuCode')) {
    function categorySkuCode(string $category): string
    {
        $map = [
            'restorative materials' => 'RST',
            'preventive materials' => 'PRV',
            'disposable supplies' => 'DSP',
            'infection control' => 'INF',
            'sterilization supplies' => 'STR',
            'dental instruments' => 'INS',
            'oral care supplies' => 'ORL',
        ];
        $key = strtolower(trim($category));
        return $map[$key] ?? 'OTH';
    }
}
if (!function_exists('buildSku')) {
    function buildSku(string $category, int $itemId): string
    {
        return 'DNT-' . categorySkuCode($category) . '-' . str_pad((string) $itemId, 3, '0', STR_PAD_LEFT);
    }
}
if (!function_exists('nextBatchNumber')) {
    function nextBatchNumber(mysqli $conn, int $itemId): string
    {
        $skuStmt = $conn->prepare('SELECT sku FROM tbl_inventory_items WHERE item_id = ? LIMIT 1');
        $skuStmt->bind_param('i', $itemId);
        $skuStmt->execute();
        $skuRow = $skuStmt->get_result()->fetch_assoc();
        $skuStmt->close();
        $sku = trim((string) ($skuRow['sku'] ?? ''));
        if ($sku === '') {
            $sku = 'ITEM-' . str_pad((string) $itemId, 3, '0', STR_PAD_LEFT);
        }
        $countStmt = $conn->prepare('SELECT COUNT(*) AS total FROM tbl_inventory_batches WHERE item_id = ?');
        $countStmt->bind_param('i', $itemId);
        $countStmt->execute();
        $countRow = $countStmt->get_result()->fetch_assoc();
        $countStmt->close();
        $sequence = (int) ($countRow['total'] ?? 0) + 1;
        do {
            $candidate = $sku . '-B' . str_pad((string) $sequence, 2, '0', STR_PAD_LEFT);
            $checkStmt = $conn->prepare('SELECT batch_id FROM tbl_inventory_batches WHERE item_id = ? AND batch_number = ? LIMIT 1');
            $checkStmt->bind_param('is', $itemId, $candidate);
            $checkStmt->execute();
            $exists = (bool) $checkStmt->get_result()->fetch_assoc();
            $checkStmt->close();
            $sequence++;
        } while ($exists);
        return $candidate;
    }
}
if (!function_exists('createInventoryBatch')) {
    function createInventoryBatch(mysqli $conn, int $itemId, float $quantity, ?string $expiry, string $batchNumber, ?string $receivedAt, ?int $movementId): int
    {
        $batchNumber = trim($batchNumber);
        if ($batchNumber === '') {
            $batchNumber = nextBatchNumber($conn, $itemId);
        } else {
            $dupStmt = $conn->prepare('SELECT batch_id FROM tbl_inventory_batches WHERE item_id = ? AND batch_number = ? LIMIT 1');
            $dupStmt->bind_param('is', $itemId, $batchNumber);
            $dupStmt->execute();
            $duplicate = $dupStmt->get_result()->fetch_assoc();
            $dupStmt->close();
            if ($duplicate) {
                throw new RuntimeException('Batch number already exists for this item.');
            }
        }
        $receivedValue = $receivedAt !== null && $receivedAt !== '' ? $receivedAt : date('Y-m-d H:i:s');
        $expiryValue = $expiry !== null && $expiry !== '' ? $expiry : null;
        $stmt = $conn->prepare('INSERT INTO tbl_inventory_batches (item_id, batch_number, quantity_received, quantity_remaining, expiry_date, received_date, movement_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->bind_param('isddssi', $itemId, $batchNumber, $quantity, $quantity, $expiryValue, $receivedValue, $movementId);
        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('Unable to create inventory batch.');
        }
        $batchId = (int) $stmt->insert_id;
        $stmt->close();
        return $batchId;
    }
}
if (!function_exists('allocateBatchStock')) {
    function allocateBatchStock(mysqli $conn, int $itemId, float $quantity, ?int $movementId, ?int $treatmentId): void
    {
        $stmt = $conn->prepare('SELECT batch_id, quantity_remaining FROM tbl_inventory_batches WHERE item_id = ? AND quantity_remaining > 0 ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, received_date ASC, batch_id ASC FOR UPDATE');
        $stmt->bind_param('i', $itemId);
        $stmt->execute();
        $batches = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        $remaining = $quantity;
        foreach ($batches as $batch) {
            if ($remaining <= 0.00001) {
                break;
            }
            $batchId = (int) $batch['batch_id'];
            $available = (float) $batch['quantity_remaining'];
            $take = min($available, $remaining);
            $updateStmt = $conn->prepare('UPDATE tbl_inventory_batches SET quantity_remaining = quantity_remaining - ? WHERE batch_id = ?');
            $updateStmt->bind_param('di', $take, $batchId);
            if (!$updateStmt->execute()) {
                $updateStmt->close();
                throw new RuntimeException('Unable to deduct batch stock.');
            }
            $updateStmt->close();
            $usageStmt = $conn->prepare('INSERT INTO tbl_inventory_batch_usage (batch_id, item_id, movement_id, treatment_id, quantity) VALUES (?, ?, ?, ?, ?)');
            $usageStmt->bind_param('iiiid', $batchId, $itemId, $movementId, $treatmentId, $take);
            if (!$usageStmt->execute()) {
                $usageStmt->close();
                throw new RuntimeException('Unable to record batch usage.');
            }
            $usageStmt->close();
            $remaining -= $take;
        }
        if ($remaining > 0.00001) {
            throw new RuntimeException('Batch records do not have enough stock for this deduction.');
        }
    }
}
if (!function_exists('restoreTreatmentBatchStock')) {
    function restoreTreatmentBatchStock(mysqli $conn, int $treatmentId, int $itemId, float $quantity): void
    {
        $stmt = $conn->prepare('SELECT batch_usage_id, batch_id, quantity FROM tbl_inventory_batch_usage WHERE treatment_id = ? AND item_id = ? AND reversed_at IS NULL FOR UPDATE');
        $stmt->bind_param('ii', $treatmentId, $itemId);
        $stmt->execute();
        $usageRows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        $restored = 0.0;
        foreach ($usageRows as $usageRow) {
            $batchId = (int) $usageRow['batch_id'];
            $usageQuantity = (float) $usageRow['quantity'];
            $restoreStmt = $conn->prepare('UPDATE tbl_inventory_batches SET quantity_remaining = quantity_remaining + ? WHERE batch_id = ?');
            $restoreStmt->bind_param('di', $usageQuantity, $batchId);
            if (!$restoreStmt->execute()) {
                $restoreStmt->close();
                throw new RuntimeException('Unable to restore batch stock.');
            }
            $restoreStmt->close();
            $restored += $usageQuantity;
        }
        if ($usageRows) {
            $markStmt = $conn->prepare('UPDATE tbl_inventory_batch_usage SET reversed_at = NOW() WHERE treatment_id = ? AND item_id = ? AND reversed_at IS NULL');
            $markStmt->bind_param('ii', $treatmentId, $itemId);
            if (!$markStmt->execute()) {
                $markStmt->close();
                throw new RuntimeException('Unable to update batch usage history.');
            }
            $markStmt->close();
        }
        $leftover = $quantity - $restored;
        if ($leftover > 0.00001) {
            createInventoryBatch($conn, $itemId, $leftover, null, '', null, null);
        }
    }
}
if (!function_exists('syncItemExpiryFromBatches')) {
    function syncItemExpiryFromBatches(mysqli $conn, int $itemId): void
    {
        $stmt = $conn->prepare('SELECT COUNT(*) AS total, MIN(expiry_date) AS nearest FROM tbl_inventory_batches WHERE item_id = ? AND quantity_remaining > 0');
        $stmt->bind_param('i', $itemId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ((int) ($row['total'] ?? 0) <= 0) {
            return;
        }
        $nearest = $row['nearest'] ?? null;
        $updateStmt = $conn->prepare('UPDATE tbl_inventory_items SET expiry_date = ? WHERE item_id = ?');
        $updateStmt->bind_param('si', $nearest, $itemId);
        $updateStmt->execute();
        $updateStmt->close();
    }
}
if (!function_exists('ensureInventorySchema')) {
    function ensureInventorySchema(mysqli $conn): void
    {
        $conn->query("ALTER TABLE tbl_inventory_items ADD COLUMN IF NOT EXISTS sku VARCHAR(30) NULL AFTER item_id");
        $conn->query("ALTER TABLE tbl_inventory_items ADD UNIQUE INDEX IF NOT EXISTS uq_inventory_sku (sku)");
        $conn->query("CREATE TABLE IF NOT EXISTS tbl_inventory_batches (
            batch_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            item_id BIGINT UNSIGNED NOT NULL,
            batch_number VARCHAR(80) NOT NULL,
            quantity_received DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            quantity_remaining DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            expiry_date DATE NULL,
            received_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            movement_id BIGINT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_item_batch (item_id, batch_number),
            KEY idx_item_remaining (item_id, quantity_remaining)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $conn->query("CREATE TABLE IF NOT EXISTS tbl_inventory_batch_usage (
            batch_usage_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            batch_id BIGINT UNSIGNED NOT NULL,
            item_id BIGINT UNSIGNED NOT NULL,
            movement_id BIGINT UNSIGNED NULL,
            treatment_id BIGINT UNSIGNED NULL,
            quantity DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            reversed_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_usage_batch (batch_id),
            KEY idx_usage_movement (movement_id),
            KEY idx_usage_treatment (treatment_id, item_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $skuResult = $conn->query("SELECT item_id, category FROM tbl_inventory_items WHERE sku IS NULL OR sku = ''");
        if ($skuResult) {
            while ($skuRow = $skuResult->fetch_assoc()) {
                $skuItemId = (int) $skuRow['item_id'];
                $skuValue = buildSku((string) ($skuRow['category'] ?? ''), $skuItemId);
                $skuUpdate = $conn->prepare('UPDATE tbl_inventory_items SET sku = ? WHERE item_id = ?');
                $skuUpdate->bind_param('si', $skuValue, $skuItemId);
                $skuUpdate->execute();
                $skuUpdate->close();
            }
        }
        $gapResult = $conn->query("SELECT i.item_id, i.stock_quantity, i.expiry_date, i.created_at, COALESCE(SUM(b.quantity_remaining), 0) AS batch_total FROM tbl_inventory_items i LEFT JOIN tbl_inventory_batches b ON b.item_id = i.item_id GROUP BY i.item_id, i.stock_quantity, i.expiry_date, i.created_at HAVING i.stock_quantity > COALESCE(SUM(b.quantity_remaining), 0)");
        if ($gapResult) {
            $gaps = $gapResult->fetch_all(MYSQLI_ASSOC);
            foreach ($gaps as $gap) {
                $gapItemId = (int) $gap['item_id'];
                $difference = (float) $gap['stock_quantity'] - (float) $gap['batch_total'];
                if ($difference <= 0.00001) {
                    continue;
                }
                $gapExpiry = $gap['expiry_date'] ?? null;
                $gapReceived = $gap['created_at'] ?? null;
                createInventoryBatch($conn, $gapItemId, $difference, $gapExpiry, '', $gapReceived, null);
            }
        }
    }
}
if (!function_exists('reconcileInventoryBatches')) {
    function reconcileInventoryBatches(mysqli $conn): void
    {
        $result = $conn->query("SELECT i.item_id, i.stock_quantity, COALESCE(SUM(b.quantity_remaining), 0) AS batch_total FROM tbl_inventory_items i INNER JOIN tbl_inventory_batches b ON b.item_id = i.item_id GROUP BY i.item_id, i.stock_quantity HAVING COALESCE(SUM(b.quantity_remaining), 0) > i.stock_quantity + 0.00001");
        if (!$result) {
            return;
        }
        $rows = $result->fetch_all(MYSQLI_ASSOC);
        foreach ($rows as $row) {
            $itemId = (int) $row['item_id'];
            $excess = (float) $row['batch_total'] - (float) $row['stock_quantity'];
            $conn->begin_transaction();
            try {
                allocateBatchStock($conn, $itemId, $excess, null, null);
                $conn->commit();
            } catch (Throwable $error) {
                $conn->rollback();
            }
        }
    }
}