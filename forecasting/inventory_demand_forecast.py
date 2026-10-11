#!/usr/bin/env python3
"""Inventory demand forecasting pipeline for the Dental Clinic System.

The model does not read raw movement rows as a forecast dataset. Instead:
1. Raw Inventory Movement Ledger records are kept as operational events.
2. Only stock-out rows are isolated.
3. They are aggregated into a daily demand series by item.
4. The last 4 months of aggregated demand is used for feature engineering.
5. A Simple Moving Average baseline and a Random Forest Regressor are evaluated.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error

MIN_DAILY_HISTORY_FOR_RF = 60
MIN_FEATURE_ROWS_FOR_RF = MIN_DAILY_HISTORY_FOR_RF - 7


def to_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def get_db_config(args: Optional[argparse.Namespace] = None) -> Optional[Dict[str, Any]]:
    if args is not None and getattr(args, "db_skip", False):
        return None

    host = getattr(args, "db_host", None) or os.getenv("DB_HOST") or os.getenv("MYSQL_HOST")
    user = getattr(args, "db_user", None) or os.getenv("DB_USER") or os.getenv("MYSQL_USER")
    password = getattr(args, "db_password", None) or os.getenv("DB_PASSWORD") or os.getenv("MYSQL_PASSWORD")
    database = getattr(args, "db_name", None) or os.getenv("DB_NAME") or os.getenv("MYSQL_DATABASE")
    port = getattr(args, "db_port", None) or os.getenv("DB_PORT") or os.getenv("MYSQL_PORT")

    if not host or not user or not database:
        return None

    try:
        port = int(port) if port else 3306
    except (TypeError, ValueError):
        port = 3306

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password or "",
        "database": database,
        "autocommit": True,
    }


def parse_material_rows(payload: Any) -> List[Dict[str, Any]]:
    if payload is None:
        return []

    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return []

    if isinstance(payload, dict):
        payload = [payload]

    if not isinstance(payload, list):
        return []

    materials: List[Dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        item_name = (
            item.get("itemName")
            or item.get("item_name")
            or item.get("name")
            or item.get("materialName")
            or item.get("item")
            or ""
        )
        quantity = (
            item.get("quantity")
            or item.get("qty")
            or item.get("used")
            or item.get("amount")
            or item.get("consumed")
            or 0
        )
        if not item_name or to_float(quantity) <= 0:
            continue

        material = {
            "itemName": str(item_name),
            "itemId": item.get("itemId"),
            "quantity": to_float(quantity),
            "unit": item.get("unit") or item.get("unitName") or "unit",
        }
        materials.append(material)

    return materials

def build_treatment_usage_rows(treatments: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []

    for treatment in treatments:
        if not isinstance(treatment, dict):
            continue

        date_value = (
            treatment.get("date")
            or treatment.get("treatment_date")
            or treatment.get("treatmentDate")
            or treatment.get("createdAt")
            or treatment.get("created_at")
        )
        if not date_value:
            continue

        parsed_date = pd.to_datetime(date_value, errors="coerce")
        if pd.isna(parsed_date):
            continue

        consumed_payload = (
            treatment.get("consumedMaterials")
            or treatment.get("consumed_materials")
            or treatment.get("materials")
            or []
        )

        for material in parse_material_rows(consumed_payload):
            rows.append({
                "itemName": material["itemName"],
                "itemId": material.get("itemId"),
                "quantity": material["quantity"],
                "date": parsed_date,
                "type": "stock-out",
                "unit": material.get("unit") or "unit",
            })

    return rows


def load_treatment_usage_from_database(db_config: Dict[str, Any]) -> List[Dict[str, Any]]:
    try:
        import mysql.connector
    except ImportError as exc:
        raise RuntimeError(
            "mysql-connector-python is required for DB mode. "
            "Install with pip install -r forecasting/requirements.txt."
        ) from exc

    connection = mysql.connector.connect(**db_config)

    try:
        treatment_query = """
            SELECT
                t.treatment_id,
                t.patient_id,
                t.appointment_id,
                t.treatment_date AS date,
                t.consumed_materials AS consumed_materials,
                a.status AS appointment_status
            FROM tbl_patient_treatments t
            LEFT JOIN tbl_patient_appointments a
                ON a.appointment_id = t.appointment_id
            WHERE t.treatment_date IS NOT NULL
              AND COALESCE(t.consumed_materials, '') <> ''
              AND (
                  a.appointment_id IS NULL
                  OR LOWER(COALESCE(a.status, '')) IN ('completed', 'complete')
              )
            ORDER BY t.treatment_date ASC, t.treatment_id ASC
        """

        cursor = connection.cursor(dictionary=True)
        cursor.execute(treatment_query)
        treatment_rows = cursor.fetchall()
        cursor.close()

        usage_rows = build_treatment_usage_rows(treatment_rows)

        if not usage_rows:
            return []

        inventory_query = """
            SELECT
                item_id,
                item_name,
                created_at
            FROM tbl_inventory_items
        """

        cursor = connection.cursor(dictionary=True)
        cursor.execute(inventory_query)
        inventory_rows = cursor.fetchall()
        cursor.close()
        
        inventory_by_id = {}
        inventory_by_name = {}

        for inventory_item in inventory_rows:
            item_id = inventory_item.get("item_id")
            item_name = str(
                inventory_item.get("item_name") or ""
            ).strip()
            created_at = inventory_item.get("created_at")

            inventory_data = {
                "itemId": item_id,
                "itemName": item_name,
                "createdAt": created_at,
            }

            if item_id is not None:
                inventory_by_id[str(item_id)] = inventory_data

            if item_name:
                inventory_by_name[item_name.lower()] = inventory_data

        for row in usage_rows:
            item_id = row.get("itemId")
            item_name = str(
                row.get("itemName") or ""
            ).strip()

            inventory_item = None

            if item_id is not None:
                inventory_item = inventory_by_id.get(str(item_id))

            if inventory_item is None and item_name:
                inventory_item = inventory_by_name.get(item_name.lower())

            if inventory_item is None and item_name:
                normalized_name = " ".join(
                    item_name.lower().split()
                )

                for inventory_name, inventory_data in inventory_by_name.items():
                    normalized_inventory_name = " ".join(
                        inventory_name.lower().split()
                    )

                    if normalized_inventory_name == normalized_name:
                        inventory_item = inventory_data
                        break

            if inventory_item is not None:
                row["inventoryItemId"] = inventory_item.get("itemId")
                row["availableFrom"] = inventory_item.get("createdAt")
            else:
                row["inventoryItemId"] = item_id
                row["availableFrom"] = None

        return usage_rows

    finally:
        connection.close()

def load_excel_usage(path: Path) -> List[Dict[str, Any]]:
    try:
        import pandas as pd
    except ImportError as exc:
        raise RuntimeError("pandas is required to read Excel historical data.") from exc

    frame = pd.read_excel(path, sheet_name="Historical Data")
    required_columns = {"Date", "Item_Name", "Actual_Usage"}
    missing_columns = required_columns.difference(frame.columns)
    if missing_columns:
        raise ValueError(f"Excel historical data is missing columns: {sorted(missing_columns)}")

    item_aliases = {
        "disposable examination gloves": "Gloves",
        "dental cotton rolls": "Cotton Rolls",
    }
    rows: List[Dict[str, Any]] = []
    for _, row in frame.iterrows():
        quantity = to_float(row.get("Actual_Usage"))
        date_value = row.get("Date")
        item_name = str(row.get("Item_Name") or "").strip()
        if not item_name or pd.isna(date_value) or quantity < 0:
            continue
        item_name = item_aliases.get(item_name.lower(), item_name)
        rows.append({
            "itemName": item_name,
            "itemId": row.get("Item_ID"),
            "quantity": quantity,
            "date": date_value,
            "type": "stock-out",
        })
    return rows


def forecast_excel_with_features(path: Path) -> Dict[str, Any]:
    frame = pd.read_excel(path, sheet_name="Historical Data")
    target_column = "Actual_Usage"
    feature_columns = [
        "Appointments_Completed", "Consultation", "Dental_Cleaning", "Tooth_Filling",
        "Tooth_Extraction", "Root_Canal", "Braces_Adjustment", "Opening_Stock",
        "Received_Stock", "Stockout_Qty", "Restock_Ordered", "Closing_Stock",
    ]
    frame = frame.dropna(subset=["Date", "Item_Name", target_column]).copy()
    frame[feature_columns] = frame[feature_columns].apply(pd.to_numeric, errors="coerce").fillna(0)
    results: List[Dict[str, Any]] = []

    for item_name, item_frame in frame.groupby("Item_Name", sort=True):
        item_frame = item_frame.sort_values("Date").reset_index(drop=True)
        if len(item_frame) < 10:
            continue
        split_index = max(1, int(len(item_frame) * 0.8))
        train = item_frame.iloc[:split_index]
        test = item_frame.iloc[split_index:]
        model = RandomForestRegressor(n_estimators=500, random_state=42)
        model.fit(train[feature_columns], train[target_column])
        predictions = model.predict(test[feature_columns])
        actual = test[target_column].to_numpy(dtype=float)
        non_zero = actual > 0
        mape = float(mean_absolute_percentage_error(actual[non_zero], predictions[non_zero]) * 100) if non_zero.any() else 100.0
        wape = float(np.abs(actual - predictions).sum() / max(np.abs(actual).sum(), 1.0) * 100)
        model.fit(item_frame[feature_columns], item_frame[target_column])
        forecast = max(0.0, float(model.predict(item_frame[feature_columns].tail(1))[0]))
        results.append({
            "item": item_name,
            "accuracy": max(0.0, 100.0 - wape),
            "mape": mape,
            "rmse": float(np.sqrt(mean_squared_error(actual[non_zero], predictions[non_zero]))) if non_zero.any() else 0.0,
            "wape": wape,
            "rf_forecast": forecast,
            "sma_forecast": float(item_frame[target_column].tail(4).mean()),
            "model_name": "RandomForestRegressor",
        })

    overall_accuracy = float(np.mean([item["accuracy"] for item in results])) if results else 0.0
    return {
        "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "lookback_months": 4,
        "movement_ledger_not_forecast_dataset": True,
        "ml_model": "RandomForestRegressor",
        "historical_usage_source": "Excel Historical Data with procedure and stock features",
        "overall_accuracy": overall_accuracy,
        "target_accuracy": 80.0,
        "passes_accuracy_target": overall_accuracy >= 80.0,
        "mape": float(np.mean([item["mape"] for item in results])) if results else 100.0,
        "rmse": float(np.mean([item["rmse"] for item in results])) if results else 0.0,
        "items": results,
    }


def load_movements(path: Optional[Path] = None, db_config: Optional[Dict[str, Any]] = None, source: str = "auto") -> List[Dict[str, Any]]:
    if path is not None and path.exists():
        if path.suffix.lower() in {".xlsx", ".xls"}:
            return load_excel_usage(path)
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise ValueError(f"Expected a JSON list in {path}")

        if source in {"auto", "treatments"} and any(
            bool(isinstance(item, dict) and ("consumed_materials" in item or "consumedMaterials" in item))
            for item in payload
        ):
            return build_treatment_usage_rows(payload)

        return payload

    if db_config is None:
        raise FileNotFoundError("No input file or database config was provided.")

    if source in {"auto", "treatments"}:
        try:
            treatment_rows = load_treatment_usage_from_database(db_config)
            if treatment_rows:
                return treatment_rows
            return []
        except Exception as exc:
            print(f"Treatment database load error: {exc}")
            raise

    try:
        import mysql.connector
    except ImportError as exc:
        raise RuntimeError("mysql-connector-python is required for DB mode. Install with pip install -r forecasting/requirements.txt.") from exc

    connection = mysql.connector.connect(**db_config)
    try:
        query = """
            SELECT
                item_name AS itemName,
                item_id AS itemId,
                quantity,
                movement_date AS date,
                movement_type AS type
            FROM tbl_inventory_movements
            WHERE movement_type IN ('stock-out', 'OUT')
              AND quantity > 0
            ORDER BY movement_date ASC, movement_id ASC
        """
        cursor = connection.cursor(dictionary=True)
        cursor.execute(query)
        rows = cursor.fetchall()
        return [
            {
                "itemName": row.get("itemName") or row.get("item") or row.get("itemId") or "Unknown Item",
                "itemId": row.get("itemId"),
                "quantity": row.get("quantity"),
                "date": row.get("date"),
                "type": row.get("type") or "stock-out",
            }
            for row in rows
        ]
    finally:
        connection.close()


def aggregate_stock_outs(
    movements: Iterable[Dict[str, Any]],
    lookback_months: int = 4,
) -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []

    for movement in movements:
        if not isinstance(movement, dict):
            continue

        if str(movement.get("type", "")).lower() != "stock-out":
            continue

        quantity = to_float(movement.get("quantity"))

        if quantity <= 0:
            continue

        item_name = (
            movement.get("itemName")
            or movement.get("item")
            or movement.get("itemId")
            or "Unknown Item"
        )

        date_value = (
            movement.get("date")
            or movement.get("createdAt")
            or movement.get("movementDate")
        )

        if not date_value:
            continue

        parsed_date = pd.to_datetime(
            date_value,
            errors="coerce",
        )

        if pd.isna(parsed_date):
            continue

        available_from = pd.to_datetime(
            movement.get("availableFrom"),
            errors="coerce",
        )

        rows.append(
            {
                "item": str(item_name),
                "date": parsed_date.normalize(),
                "quantity": quantity,
                "available_from": (
                    available_from.normalize()
                    if not pd.isna(available_from)
                    else pd.NaT
                ),
            }
        )

    if not rows:
        return pd.DataFrame(
            columns=[
                "item",
                "date",
                "quantity",
                "available_from",
            ]
        )

    demand_df = pd.DataFrame(rows)

    demand_df["date"] = pd.to_datetime(
        demand_df["date"],
        errors="coerce",
    )

    demand_df["available_from"] = pd.to_datetime(
        demand_df["available_from"],
        errors="coerce",
    )

    demand_df = demand_df.dropna(
        subset=["date"]
    )

    demand_df = (
        demand_df
        .groupby(
            ["item", "date"],
            as_index=False,
        )
        .agg(
            quantity=("quantity", "sum"),
            available_from=("available_from", "min"),
        )
    )

    demand_df = demand_df.sort_values(
        ["item", "date"]
    ).reset_index(drop=True)

    if demand_df.empty:
        return demand_df

    cutoff = (
        demand_df["date"].max()
        - pd.DateOffset(
            months=max(1, lookback_months)
        )
    )

    demand_df = demand_df[
        demand_df["date"] >= cutoff
    ].copy()

    return demand_df

def build_daily_usage_dataset(
    demand_df: pd.DataFrame,
) -> pd.DataFrame:
    if demand_df.empty:
        return pd.DataFrame(
            columns=[
                "item",
                "date",
                "quantity",
            ]
        )

    daily_frames: List[pd.DataFrame] = []

    latest_demand_date = pd.to_datetime(
        demand_df["date"],
        errors="coerce",
    ).max()

    history_cutoff = (
        latest_demand_date
        - pd.DateOffset(months=4)
    )

    for item_name, item_group in demand_df.groupby(
        "item",
        sort=True,
    ):
        item_group = item_group.sort_values(
            "date"
        ).copy()

        item_group["date"] = pd.to_datetime(
            item_group["date"],
            errors="coerce",
        )

        item_group = item_group.dropna(
            subset=["date"]
        )

        if item_group.empty:
            continue

        available_from = pd.to_datetime(
            item_group["available_from"],
            errors="coerce",
        ).min()

        first_demand_date = item_group["date"].min()

        if pd.isna(available_from):
            start_date = max(
                history_cutoff,
                first_demand_date,
            )
        else:
            start_date = max(
                history_cutoff,
                available_from.normalize(),
            )

        end_date = max(
            latest_demand_date,
            first_demand_date,
        )

        full_index = pd.date_range(
            start=start_date,
            end=end_date,
            freq="D",
        )

        item_group = (
            item_group
            .groupby("date", as_index=True)["quantity"]
            .sum()
        )

        daily_usage = (
            item_group
            .reindex(
                full_index,
                fill_value=0.0,
            )
            .reset_index()
        )

        daily_usage.columns = [
            "date",
            "quantity",
        ]

        daily_usage["item"] = str(
            item_name
        )

        daily_frames.append(
            daily_usage[
                [
                    "item",
                    "date",
                    "quantity",
                ]
            ]
        )

    if not daily_frames:
        return pd.DataFrame(
            columns=[
                "item",
                "date",
                "quantity",
            ]
        )

    return (
        pd.concat(
            daily_frames,
            ignore_index=True,
        )
        .sort_values(
            ["item", "date"]
        )
        .reset_index(drop=True)
    )

def engineer_features(daily_usage: pd.DataFrame) -> pd.DataFrame:
    records: List[Dict[str, Any]] = []

    for item_name, item_group in daily_usage.groupby("item", sort=True):
        item_group = item_group.sort_values("date").reset_index(drop=True)
        if len(item_group) < MIN_DAILY_HISTORY_FOR_RF:
            continue

        for idx in range(7, len(item_group)):
            row = item_group.iloc[idx]
            history = item_group.iloc[:idx]
            values = history["quantity"].astype(float)

            records.append({
                "item": item_name,
                "date": row["date"],
                "lag_1": float(values.iloc[-1]) if len(values) >= 1 else 0.0,
                "lag_2": float(values.iloc[-2]) if len(values) >= 2 else 0.0,
                "lag_3": float(values.iloc[-3]) if len(values) >= 3 else 0.0,
                "lag_4": float(values.iloc[-4]) if len(values) >= 4 else 0.0,
                "lag_5": float(values.iloc[-5]) if len(values) >= 5 else 0.0,
                "lag_6": float(values.iloc[-6]) if len(values) >= 6 else 0.0,
                "lag_7": float(values.iloc[-7]) if len(values) >= 7 else 0.0,
                "rolling_7": float(values.tail(7).mean()) if len(values) >= 7 else float(values.mean()),
                "rolling_14": float(values.tail(14).mean()) if len(values) >= 14 else float(values.mean()),
                "rolling_28": float(values.tail(28).mean()) if len(values) >= 28 else float(values.mean()),
                "day_of_week": int(row["date"].weekday()),
                "day_of_month": int(row["date"].day),
                "month": int(row["date"].month),
                "target": float(row["quantity"]),
            })

    if not records:
        return pd.DataFrame(columns=[
            "item", "date", "lag_1", "lag_2", "lag_3", "lag_4", "lag_5", "lag_6", "lag_7",
            "rolling_7", "rolling_14", "rolling_28", "day_of_week", "day_of_month", "month", "target"
        ])

    return pd.DataFrame(records)


def sma_forecast(values: pd.Series, window: int = 4) -> float:
    if values.empty:
        return 0.0
    window = max(1, min(window, len(values)))
    return float(values.tail(window).mean())


def seasonal_weekday_forecast(values: pd.Series, dates: pd.Series, horizon: int = 1) -> float:
    if values.empty or len(values) < 7:
        return 0.0

    if len(dates) < 7:
        return float(values.tail(1).iloc[0])

    last_day = dates.iloc[-1]
    weekday = last_day.weekday()
    mask = dates.dt.dayofweek == weekday
    same_weekday = values[mask].tail(1)
    if same_weekday.empty:
        return float(values.tail(1).iloc[0])
    return float(same_weekday.iloc[-1]) * max(0.6, 1.0 - 0.05 * horizon)


def evaluate_item(item_frame: pd.DataFrame) -> Dict[str, Any]:
    feature_columns = [
        "lag_1",
        "lag_2",
        "lag_3",
        "lag_4",
        "lag_5",
        "lag_6",
        "lag_7",
        "rolling_7",
        "rolling_14",
        "rolling_28",
        "day_of_week",
        "day_of_month",
        "month",
    ]

    if item_frame.empty or len(item_frame) < MIN_FEATURE_ROWS_FOR_RF:
        return {
            "item": "",
            "accuracy": 0.0,
            "mape": 0.0,
            "rmse": 0.0,
            "sma_mape": 0.0,
            "rf_mape": 0.0,
            "sma_rmse": 0.0,
            "rf_rmse": 0.0,
            "rf_forecast": 0.0,
            "sma_forecast": 0.0,
            "model_name": "SMA",
            "forecast_status": "insufficient_historical_data",
            "evaluation_available": False,
        }

    item_frame = item_frame.sort_values("date").reset_index(drop=True)

    split_index = int(len(item_frame) * 0.8)

    if split_index <= 0 or split_index >= len(item_frame):
        return {
            "item": item_frame["item"].iloc[0],
            "accuracy": 0.0,
            "mape": 0.0,
            "rmse": 0.0,
            "sma_mape": 0.0,
            "rf_mape": 0.0,
            "sma_rmse": 0.0,
            "rf_rmse": 0.0,
            "rf_forecast": 0.0,
            "sma_forecast": 0.0,
            "model_name": "SMA",
            "forecast_status": "insufficient_historical_data",
            "evaluation_available": False,
        }

    train = item_frame.iloc[:split_index].copy()
    test = item_frame.iloc[split_index:].copy()

    if train.empty or test.empty:
        return {
            "item": item_frame["item"].iloc[0],
            "accuracy": 0.0,
            "mape": 0.0,
            "rmse": 0.0,
            "sma_mape": 0.0,
            "rf_mape": 0.0,
            "sma_rmse": 0.0,
            "rf_rmse": 0.0,
            "rf_forecast": 0.0,
            "sma_forecast": 0.0,
            "model_name": "SMA",
            "forecast_status": "insufficient_historical_data",
            "evaluation_available": False,
        }

    actual = test["target"].to_numpy(dtype=float)

    valid_mask = actual > 0

    if not valid_mask.any():
        valid_mask = np.ones_like(actual, dtype=bool)

    actual_valid = actual[valid_mask]

    sma_predictions = []

    historical_values = train["target"].astype(float).tolist()

    for index in range(len(test)):
        history_end = len(historical_values) + index
        history = item_frame["target"].iloc[:history_end].astype(float)

        sma_prediction = sma_forecast(history, window=4)
        sma_predictions.append(float(sma_prediction))

    sma_predictions = np.asarray(sma_predictions, dtype=float)
    sma_predictions_valid = sma_predictions[valid_mask]

    if len(actual_valid) > 0 and len(sma_predictions_valid) > 0:
        sma_mape = float(
            mean_absolute_percentage_error(
                actual_valid,
                sma_predictions_valid,
            ) * 100.0
        )

        sma_rmse = float(
            np.sqrt(
                mean_squared_error(
                    actual_valid,
                    sma_predictions_valid,
                )
            )
        )

        sma_wape = float(
            np.abs(actual - sma_predictions).sum()
            / max(np.abs(actual).sum(), 1.0)
            * 100.0
        )

        sma_accuracy = max(
            0.0,
            100.0 - sma_wape,
        )
    else:
        sma_mape = 0.0
        sma_rmse = 0.0
        sma_accuracy = 0.0

    model = RandomForestRegressor(
        n_estimators=500,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(
        train[feature_columns],
        train["target"],
    )

    rf_predictions = model.predict(test[feature_columns])
    rf_predictions = np.maximum(rf_predictions, 0.0)

    rf_predictions_valid = rf_predictions[valid_mask]

    if len(actual_valid) > 0 and len(rf_predictions_valid) > 0:
        rf_mape = float(
            mean_absolute_percentage_error(
                actual_valid,
                rf_predictions_valid,
            ) * 100.0
        )

        rf_rmse = float(
            np.sqrt(
                mean_squared_error(
                    actual_valid,
                    rf_predictions_valid,
                )
            )
        )

        rf_wape = float(
            np.abs(actual - rf_predictions).sum()
            / max(np.abs(actual).sum(), 1.0)
            * 100.0
        )

        rf_accuracy = max(
            0.0,
            100.0 - rf_wape,
        )
    else:
        rf_mape = 0.0
        rf_rmse = 0.0
        rf_accuracy = 0.0

    last_values = item_frame["target"].astype(float)

    sma_forecast_value = sma_forecast(
        last_values,
        window=4,
    )

    next_date = (
        pd.to_datetime(item_frame["date"].iloc[-1])
        + pd.Timedelta(days=1)
    )

    history_values = last_values.tolist()

    next_features = {
        "lag_1": float(history_values[-1]),
        "lag_2": float(history_values[-2]),
        "lag_3": float(history_values[-3]),
        "lag_4": float(history_values[-4]),
        "lag_5": float(history_values[-5]),
        "lag_6": float(history_values[-6]),
        "lag_7": float(history_values[-7]),
        "rolling_7": float(np.mean(history_values[-7:])),
        "rolling_14": float(np.mean(history_values[-14:])),
        "rolling_28": float(np.mean(history_values[-28:])),
        "day_of_week": int(next_date.weekday()),
        "day_of_month": int(next_date.day),
        "month": int(next_date.month),
    }

    final_model = RandomForestRegressor(
        n_estimators=500,
        random_state=42,
        n_jobs=-1,
    )

    final_model.fit(
        item_frame[feature_columns],
        item_frame["target"],
    )

    rf_forecast_value = float(
        final_model.predict(
            pd.DataFrame([next_features])[feature_columns]
        )[0]
    )

    rf_forecast_value = max(
        0.0,
        rf_forecast_value,
    )

    if rf_accuracy >= 80.0:
        selected_model = "RandomForestRegressor"
        selected_forecast = rf_forecast_value
        selected_accuracy = rf_accuracy
        selected_mape = rf_mape
        selected_rmse = rf_rmse
        forecast_status = "random_forest_evaluation_available"
    else:
        selected_model = "SMA"
        selected_forecast = max(
            0.0,
            sma_forecast_value,
        )
        selected_accuracy = sma_accuracy
        selected_mape = sma_mape
        selected_rmse = sma_rmse
        forecast_status = "random_forest_below_accuracy_threshold"

    return {
        "item": item_frame["item"].iloc[0],
        "accuracy": float(selected_accuracy),
        "mape": float(selected_mape),
        "rmse": float(selected_rmse),
        "sma_mape": float(sma_mape),
        "rf_mape": float(rf_mape),
        "sma_rmse": float(sma_rmse),
        "rf_rmse": float(rf_rmse),
        "sma_accuracy": float(sma_accuracy),
        "rf_accuracy": float(rf_accuracy),
        "rf_forecast": float(rf_forecast_value),
        "sma_forecast": max(
            0.0,
            float(sma_forecast_value),
        ),
        "forecast": float(selected_forecast),
        "model_name": selected_model,
        "forecast_status": forecast_status,
        "evaluation_available": True,
    }


def save_forecast_to_database(db_config: Dict[str, Any], demand_df: pd.DataFrame, summary: Dict[str, Any]) -> None:
    try:
        import mysql.connector
    except ImportError as exc:
        raise RuntimeError("mysql-connector-python is required before saving to the database.") from exc

    connection = mysql.connector.connect(**db_config)
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS tbl_inventory_demand_history (
            history_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            item_name VARCHAR(150) NOT NULL,
            demand_date DATE NOT NULL,
            total_used DECIMAL(10,2) NOT NULL DEFAULT 0,
            source_type VARCHAR(30) NOT NULL DEFAULT 'actual',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (history_id),
                UNIQUE KEY uq_inventory_demand_history (item_name, demand_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS tbl_inventory_forecast_runs (
                forecast_run_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                item_name VARCHAR(150) NOT NULL,
                forecast_date DATE NULL,
                model_name VARCHAR(120) NOT NULL,
                sma_forecast DECIMAL(10,2) NULL,
                random_forest_forecast DECIMAL(10,2) NULL,
                mape DECIMAL(10,2) NULL,
                rmse DECIMAL(10,2) NULL,
                accuracy DECIMAL(10,2) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (forecast_run_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

        if not demand_df.empty:
            demand_df = demand_df.copy()
            demand_df["demand_date"] = pd.to_datetime(demand_df["date"]).dt.date
            demand_df["item_name"] = demand_df["item"].astype(str)
            demand_df["total_used"] = demand_df["quantity"].astype(float)

            latest_demand_date = pd.to_datetime(
                demand_df["demand_date"]
            ).max()

            forecast_date = (
                latest_demand_date + pd.Timedelta(days=1)
            ).date()

            history_cutoff = (
                latest_demand_date
                - pd.DateOffset(months=4)
            )

            cursor.execute(
                """
                DELETE FROM tbl_inventory_demand_history
                WHERE source_type = 'treatment'
                  AND demand_date >= %s
                  AND demand_date <= %s
                """,
                (
                    history_cutoff.date(),
                    latest_demand_date.date(),
                ),
            )

            records = (
                demand_df[
                    [
                        "item_name",
                        "demand_date",
                        "total_used",
                    ]
                ]
                .drop_duplicates()
                .to_dict("records")
            )

            for record in records:
                cursor.execute(
                    """
                    INSERT INTO tbl_inventory_demand_history (
                        item_name,
                        demand_date,
                        total_used,
                        source_type
                    )
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        total_used = VALUES(total_used),
                        source_type = VALUES(source_type)
                    """,
                    (
                        record["item_name"],
                        record["demand_date"],
                        float(record["total_used"]),
                        "treatment",
                    ),
                )

            for item in summary.get("items", []):
                cursor.execute(
                    """
                    INSERT INTO tbl_inventory_forecast_runs (
                        item_name,
                        forecast_date,
                        model_name,
                        sma_forecast,
                        random_forest_forecast,
                        selected_forecast,
                        mape,
                        rmse,
                        accuracy,
                        forecast_status,
                        evaluation_available
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        item.get("item"),
                        (latest_demand_date + pd.Timedelta(days=1)).date(),
                        item.get("model_name", "SMA"),
                        float(item.get("sma_forecast", 0) or 0),
                        (
                            float(item["rf_forecast"])
                            if item.get("rf_forecast") is not None
                            else None
                        ),
                        float(
                            item.get(
                                "forecast",
                                item.get("sma_forecast", 0),
                            ) or 0
                        ),
                        (
                            float(item["mape"])
                            if item.get("mape") is not None
                            else None
                        ),
                        (
                            float(item["rmse"])
                            if item.get("rmse") is not None
                            else None
                        ),
                        (
                            float(item["accuracy"])
                            if item.get("accuracy") is not None
                            else None
                        ),
                        item.get(
                            "forecast_status",
                            "insufficient_historical_data",
                        ),
                        1 if item.get("evaluation_available") is True else 0,
                    ),
                )

        connection.commit()
    finally:
        connection.close()


def forecast_inventory(
    demand_df: pd.DataFrame,
    source_label: str = "Aggregated completed treatment consumption over the last 4 months",
) -> Dict[str, Any]:
    daily_usage = build_daily_usage_dataset(demand_df)
    print("\n=== DAILY USAGE DATASET ===")

    if daily_usage.empty:
        print("No daily usage data found.")
    else:
        print(
            daily_usage[
                ["item", "date", "quantity"]
            ].to_string(index=False)
        )

    print("Total daily usage rows:", len(daily_usage))
    feature_frame = engineer_features(daily_usage)

    if daily_usage.empty:
        return {
            "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
            "lookback_months": 4,
            "movement_ledger_not_forecast_dataset": True,
            "ml_model": "RandomForestRegressor",
            "historical_usage_source": source_label,
            "forecast_status": "no_historical_data",
            "evaluation_available": False,
            "overall_accuracy": 0.0,
            "target_accuracy": 80.0,
            "passes_accuracy_target": False,
            "mape": 0.0,
            "rmse": 0.0,
            "items": [],
        }

    per_item = []

    feature_items = set(feature_frame["item"].astype(str).unique()) if not feature_frame.empty else set()

    for item_name, daily_item_group in daily_usage.groupby("item", sort=True):
        item_name = str(item_name)

        if item_name in feature_items:
            item_features = feature_frame[
                feature_frame["item"].astype(str) == item_name
            ].copy()

            evaluation = evaluate_item(item_features)

            if evaluation.get("item"):
                evaluation["evaluation_available"] = True
                per_item.append(evaluation)
                continue

        history_values = daily_item_group.sort_values("date")["quantity"].astype(float)

        sma_value = sma_forecast(history_values, window=4)

        per_item.append({
            "item": item_name,
            "accuracy": None,
            "mape": None,
            "rmse": None,
            "sma_mape": None,
            "rf_mape": None,
            "sma_rmse": None,
            "rf_rmse": None,
            "rf_forecast": None,
            "sma_forecast": max(0.0, float(sma_value)),
            "forecast": max(0.0, float(sma_value)),
            "model_name": "SMA",
            "forecast_status": "insufficient_historical_data",
            "evaluation_available": False,
        })

    if not per_item:
        return {
            "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
            "lookback_months": 4,
            "movement_ledger_not_forecast_dataset": True,
            "ml_model": "RandomForestRegressor",
            "historical_usage_source": source_label,
            "forecast_status": "no_forecast_available",
            "evaluation_available": False,
            "overall_accuracy": 0.0,
            "target_accuracy": 80.0,
            "passes_accuracy_target": False,
            "mape": 0.0,
            "rmse": 0.0,
            "items": [],
        }

    evaluated_items = [
        value for value in per_item
        if value.get("evaluation_available") is True
    ]

    if evaluated_items:
        avg_accuracy = float(
            np.mean([value["accuracy"] for value in evaluated_items])
        )
        avg_mape = float(
            np.mean([value["mape"] for value in evaluated_items])
        )
        avg_rmse = float(
            np.mean([value["rmse"] for value in evaluated_items])
        )
        evaluation_available = True
        forecast_status = "random_forest_evaluation_available"
    else:
        avg_accuracy = None
        avg_mape = None
        avg_rmse = None
        evaluation_available = False
        forecast_status = "insufficient_historical_data"

    def average_available_metric(metric_name: str) -> Optional[float]:
        values = [
            float(value[metric_name])
            for value in per_item
            if value.get(metric_name) is not None
        ]

        if not values:
            return None

        return float(np.mean(values))


    avg_sma_mape = average_available_metric("sma_mape")
    avg_rf_mape = average_available_metric("rf_mape")
    avg_sma_rmse = average_available_metric("sma_rmse")
    avg_rf_rmse = average_available_metric("rf_rmse")

    return {
        "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "lookback_months": 4,
        "movement_ledger_not_forecast_dataset": True,
        "ml_model": "RandomForestRegressor",
        "historical_usage_source": source_label,
        "forecast_status": forecast_status,
        "evaluation_available": evaluation_available,
        "overall_accuracy": (float(avg_accuracy) 
            if avg_accuracy is not None 
            else None),
        "target_accuracy": 80.0,
        "passes_accuracy_target": bool(
            evaluation_available
            and avg_accuracy is not None
            and avg_accuracy >= 80.0
        ),
        "mape": (
            float(avg_mape)
            if avg_mape is not None
            else None
        ),
        "rmse": (
            float(avg_rmse)
            if avg_rmse is not None
            else None
        ),
        "sma_mape": (
            float(avg_sma_mape)
            if avg_sma_mape is not None
            else None
        ),
        "rf_mape": (
            float(avg_rf_mape)
            if avg_rf_mape is not None
            else None
        ),
        "sma_rmse": (
            float(avg_sma_rmse)
            if avg_sma_rmse is not None
            else None
        ),
        "rf_rmse": (
            float(avg_rf_rmse)
            if avg_rf_rmse is not None
            else None
        ),
        "items": per_item,
    }

def find_input_file(path: Path) -> Path:
    candidates = [
        path,
        Path.cwd() / "forecasting" / "sample_inventory_movements.json",
        Path.cwd() / "sample_inventory_movements.json",
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise FileNotFoundError("Could not find an inventory movement file. Use --input with a JSON array of stock-out movements.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Inventory demand forecasting for the Dental Clinic System")
    parser.add_argument("--input", type=Path, help="JSON file containing raw inventory movement rows.")
    parser.add_argument("--output", type=Path, default=Path("forecasting") / "inventory_forecast_summary.json", help="Output JSON summary path.")
    parser.add_argument("--lookback-months", type=int, default=4, help="Number of months of historical consumption to use.")
    parser.add_argument("--db-host", default=None, help="MySQL host for database mode.")
    parser.add_argument("--db-port", default=None, help="MySQL port for database mode.")
    parser.add_argument("--db-user", default=None, help="MySQL username for database mode.")
    parser.add_argument("--db-password", default=None, help="MySQL password for database mode.")
    parser.add_argument("--db-name", default=None, help="MySQL database name for database mode.")
    parser.add_argument("--save-to-db", action="store_true", help="Persist aggregated demand history and forecast runs to MySQL.")
    parser.add_argument("--db-skip", action="store_true", help="Ignore database settings and use file mode only.")
    parser.add_argument("--data-source", choices=["auto", "movements", "treatments"], default="auto", help="Use real treatment consumption data or raw movement ledger as the demand source.")
    args = parser.parse_args()

    db_config = (
        get_db_config(args)
        if args.save_to_db or args.data_source in {"auto", "treatments"}
        else None
    )
    input_path = args.input if args.input else Path("forecasting") / "sample_inventory_movements.json"

    source_label = "Aggregated completed treatment consumption over the last 4 months"
    excel_feature_summary = None
    if args.input and args.input.suffix.lower() in {".xlsx", ".xls"}:
        raw_movements = load_excel_usage(args.input)
        excel_feature_summary = forecast_excel_with_features(args.input)
        source_label = "Excel Historical Data with procedure and stock features"
    elif not args.db_skip and db_config is not None and not args.input:
        raw_movements = load_movements(db_config=db_config, source=args.data_source)
        if args.data_source == "movements":
            source_label = "Aggregated stock-out movement consumption over the last 4 months"
    else:
        input_path = find_input_file(input_path)
        raw_movements = load_movements(path=input_path, source=args.data_source)
        if args.data_source == "movements":
            source_label = "Aggregated stock-out movement consumption over the last 4 months"

    args.output.parent.mkdir(parents=True, exist_ok=True)

    aggregated = aggregate_stock_outs(raw_movements, lookback_months=args.lookback_months)
    print("\n=== AGGREGATED DAILY DEMAND ===")

    if aggregated.empty:
        print("No aggregated demand data found.")
    else:
       print(
            aggregated[
                ["item", "date", "quantity", "available_from"]
            ].to_string(index=False)
        )

    print("Total demand rows:", len(aggregated))
    summary = excel_feature_summary or forecast_inventory(aggregated, source_label=source_label)

    if args.save_to_db and db_config is not None:
        save_forecast_to_database(db_config, aggregated, summary)

    args.output.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(json.dumps({
        "overall_accuracy": summary["overall_accuracy"],
        "target_accuracy": summary["target_accuracy"],
        "passes_accuracy_target": summary["passes_accuracy_target"],
        "mape": summary["mape"],
        "rmse": summary["rmse"],
        "output": str(args.output),
    }, indent=2))

    return 0 if summary["passes_accuracy_target"] else 1


if __name__ == "__main__":
    raise SystemExit(main())