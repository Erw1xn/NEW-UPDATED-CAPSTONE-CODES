(function () {
  "use strict";

  const FORECAST_API = "../../api/inventory/forecast.php";
  const INVENTORY_API = "../../api/inventory.php?action=list";

  const MAX_DROPDOWN_ITEMS = 6;
  const MAX_HISTORY_POINTS = 30;
  const STALE_DAYS = 14;
  const VIEW_MORE_VALUE = "__view_more__";
  const INVENTORY_PAGE_URL = "../inventory/inventory.html";

  const COLORS = {
    actual: "#36a2eb",
    actualFill: "rgba(54,162,235,0.10)",
    sma: "#ff6384",
    rf: "#ff9f40",
    grid: "#e7ece9",
    text: "#6b7970",
  };

  const state = {
    forecasts: [],
    historyByItem: {},
    inventory: [],
    selected: "",
    selectedByUser: false,
    chart: null,
  };

  const $ = (id) => document.getElementById(id);

  const norm = (v) =>
    String(v || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const esc = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;

    const n = Number(v);

    return Number.isFinite(n) ? n : null;
  };

  const fmt = (n) =>
    Number(n).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });

  function toDate(value) {
    if (!value) return null;

    const text = String(value);

    const d = new Date(
      text.length === 7
        ? `${text}-01T00:00:00`
        : `${text.slice(0, 10)}T00:00:00`,
    );

    return Number.isNaN(d.getTime()) ? null : d;
  }

  function shortDate(value) {
    const d = toDate(value);

    if (!d) return value ? String(value) : "";

    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  function daysSince(value) {
    const d = toDate(value);

    if (!d) return null;

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    return Math.round((today - d) / 86400000);
  }

  async function loadData() {
    const [fr, ir] = await Promise.all([
      fetch(FORECAST_API, {
        credentials: "same-origin",
        cache: "no-store",
      }),
      fetch(INVENTORY_API, {
        credentials: "same-origin",
        cache: "no-store",
      }),
    ]);

    if (!fr.ok) {
      throw new Error("Forecast request failed.");
    }

    const fj = await fr.json();

    if (!fj.success) {
      throw new Error(fj.message || "Forecast unavailable.");
    }

    state.forecasts = Array.isArray(fj.forecasts) ? fj.forecasts : [];

    let byItem =
      fj.history_by_item && typeof fj.history_by_item === "object"
        ? fj.history_by_item
        : {};

    if (!Object.keys(byItem).length && Array.isArray(fj.history)) {
      byItem = {};

      fj.history.forEach((row) => {
        const key = row.item_name;

        if (!key) return;

        (byItem[key] = byItem[key] || []).push(row);
      });
    }

    state.historyByItem = byItem;

    try {
      if (ir.ok) {
        const ij = await ir.json();

        state.inventory = Array.isArray(ij?.data?.items) ? ij.data.items : [];
      }
    } catch (error) {
      state.inventory = [];
    }
  }

  function getHistory(name) {
    const key = Object.keys(state.historyByItem).find(
      (k) => norm(k) === norm(name),
    );

    const rows = key ? state.historyByItem[key] : [];

    return [...(rows || [])].sort((a, b) =>
      String(a.demand_date).localeCompare(String(b.demand_date)),
    );
  }

  function getForecast(name) {
    return state.forecasts.find((f) => norm(f.item_name) === norm(name));
  }

  function getInventoryItem(name) {
    return state.inventory.find(
      (item) => norm(item.name || item.item_name) === norm(name),
    );
  }

  function getItemNames() {
    const map = new Map();

    state.forecasts.forEach((forecast) => {
      if (forecast.item_name) {
        map.set(norm(forecast.item_name), forecast.item_name);
      }
    });

    Object.keys(state.historyByItem).forEach((name) => {
      map.set(norm(name), map.get(norm(name)) || name);
    });

    state.inventory.forEach((item) => {
      const name = item.name || item.item_name;

      if (name) {
        map.set(norm(name), map.get(norm(name)) || name);
      }
    });

    return [...map.values()].sort((a, b) => {
      const aAI = isSelectedRandomForest(getForecast(a)) ? 1 : 0;

      const bAI = isSelectedRandomForest(getForecast(b)) ? 1 : 0;

      if (bAI !== aAI) {
        return bAI - aAI;
      }

      const aHistory = getHistory(a).length;
      const bHistory = getHistory(b).length;

      if (bHistory !== aHistory) {
        return bHistory - aHistory;
      }

      return a.localeCompare(b);
    });
  }

  function getDropdownItems(names) {
    if (names.length <= MAX_DROPDOWN_ITEMS) {
      return names;
    }

    return [...names.slice(0, MAX_DROPDOWN_ITEMS), VIEW_MORE_VALUE];
  }

  function buildSelect() {
    const container = $("fcItemSelect");
    const button = $("fcItemSelectButton");
    const selectedText = $("fcSelectedItem");
    const menu = $("fcItemSelectMenu");

    if (!container || !button || !selectedText || !menu) {
      return;
    }

    const names = getItemNames();

    if (!names.length) {
      selectedText.textContent = "Select item";
      menu.innerHTML = "";
      state.selected = "";
      state.selectedByUser = false;
      return;
    }

    if (
      !state.selected ||
      !names.some((name) => norm(name) === norm(state.selected))
    ) {
      state.selected = names[0];
      state.selectedByUser = false;
    }

    selectedText.textContent = state.selected;

    const dropdownItems = getDropdownItems(names);

    menu.innerHTML = dropdownItems
      .map((item) => {
        if (item === VIEW_MORE_VALUE) {
          return `
            <button
              type="button"
              class="fc-select-more"
              data-value="${VIEW_MORE_VALUE}"
            >
              View more...
            </button>
          `;
        }

        const selected = norm(item) === norm(state.selected);

        const ai = isSelectedRandomForest(getForecast(item))
          ? '<em class="fc-ai-tag">AI</em>'
          : "";

        return `
          <button
            type="button"
            class="fc-select-option${selected ? " selected" : ""}"
            data-value="${esc(item)}"
            role="option"
            aria-selected="${selected}"
          >
            <span>
              ${esc(item)} ${ai}
            </span>
            ${selected ? '<i class="fa-solid fa-check"></i>' : ""}
          </button>
        `;
      })
      .join("");
  }

  function goToInventoryPage2() {
    window.location.assign(`${INVENTORY_PAGE_URL}?page=2`);
  }

  function setText(id, value) {
    const element = $(id);

    if (element) {
      element.textContent = value;
    }
  }

  function setInsight(tone, icon, text) {
    const box = $("fcInsight");

    if (!box) return;

    box.dataset.tone = tone;

    const iconElement = box.querySelector("i");

    if (iconElement) {
      iconElement.className = `fa-solid ${icon}`;
    }

    setText("fcInsightText", text);
  }

  function isRandomForest(forecast) {
    const model = norm(forecast?.model_name);

    return model === "randomforestregressor" || model === "random forest";
  }

  function isSMA(forecast) {
    return norm(forecast?.model_name) === "sma";
  }

  function hasSelectedForecast(forecast) {
    return num(forecast?.selected_forecast) !== null;
  }

  function isSelectedRandomForest(forecast) {
    return hasSelectedForecast(forecast) && isRandomForest(forecast);
  }

  function isSelectedSMA(forecast) {
    return hasSelectedForecast(forecast) && isSMA(forecast);
  }

  function modelLabel(forecast) {
    if (isSelectedRandomForest(forecast)) {
      return "Random Forest";
    }

    if (isSelectedSMA(forecast)) {
      return "SMA";
    }

    return "";
  }

  function getStatusInfo(forecast, hasForecast) {
    const status = norm(forecast?.forecast_status);

    const accuracy = num(forecast?.accuracy);

    if (!hasForecast) {
      return {
        label: "Not Ready",
        sub: "More usage data needed",
        tone: "muted",
      };
    }

    if (isSelectedRandomForest(forecast)) {
      if (forecast?.evaluation_available) {
        return {
          label: "AI Validated",
          sub:
            accuracy !== null
              ? `${fmt(accuracy)}% accuracy`
              : "Model performance available",
          tone: "ok",
        };
      }

      return {
        label: "AI Active",
        sub: "Random Forest selected",
        tone: "ok",
      };
    }

    if (status === "random_forest_below_accuracy_threshold") {
      return {
        label: "SMA Selected",
        sub: "AI accuracy below threshold",
        tone: "warn",
      };
    }

    if (status.includes("insufficient")) {
      return {
        label: "Learning",
        sub: "Not enough data for AI",
        tone: "warn",
      };
    }

    if (isSelectedSMA(forecast)) {
      return {
        label: "Baseline",
        sub: "Simple moving average",
        tone: "muted",
      };
    }

    return {
      label: "Forecast Available",
      sub: "Model result available",
      tone: "muted",
    };
  }

  function showEmpty(message) {
    const empty = $("fcEmpty");

    if (empty) {
      empty.hidden = false;
      setText("fcEmptyText", message);
    }

    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
  }

  function resetCompare() {
    ["fcCmpSma", "fcCmpRf"].forEach((id) => {
      const box = $(id);

      if (box) {
        box.dataset.selected = "false";
        box.dataset.available = "false";
      }
    });

    setText("fcCmpSmaValue", "—");

    setText("fcCmpRfValue", "—");

    setText("fcCmpSmaTag", "");

    setText("fcCmpRfTag", "");
  }

  function resetStats() {
    setText("fcPredicted", "—");

    setText("fcPredictedSub", "Next period");

    setText("fcModel", "—");

    setText("fcModelSub", "Best model picked");

    setText("fcForecastStatus", "—");

    setText("fcForecastStatusSub", "Model status");

    const modelCard = $("fcModelCard");

    if (modelCard) {
      modelCard.dataset.model = "none";
    }

    const status = $("fcForecastStatus");

    if (status) {
      status.dataset.tone = "muted";
    }

    const badge = $("fcAiBadge");

    if (badge) {
      badge.dataset.state = "idle";
    }

    setText("fcAiBadgeText", "AI");

    setText("fcDataNote", "");

    resetCompare();

    document.querySelectorAll(".fc-how-step").forEach((step) => {
      step.classList.remove("active");
    });
  }

  function renderCompare(forecast, unit, sma, rf) {
    const hasSelected = hasSelectedForecast(forecast);

    const rfChosen = hasSelected && isRandomForest(forecast);

    const smaChosen = hasSelected && isSMA(forecast);

    const smaBox = $("fcCmpSma");

    const rfBox = $("fcCmpRf");

    if (smaBox) {
      smaBox.dataset.available = sma !== null ? "true" : "false";

      smaBox.dataset.selected = smaChosen ? "true" : "false";
    }

    if (rfBox) {
      rfBox.dataset.available = rf !== null ? "true" : "false";

      rfBox.dataset.selected = rfChosen ? "true" : "false";
    }

    setText("fcCmpSmaValue", sma !== null ? `${fmt(sma)} ${unit}` : "—");

    setText("fcCmpRfValue", rf !== null ? `${fmt(rf)} ${unit}` : "—");

    setText("fcCmpSmaTag", smaChosen ? "Selected" : "Baseline");

    setText(
      "fcCmpRfTag",
      rfChosen ? "Selected" : rf !== null ? "Not selected" : "Not enough data",
    );
  }

  function render() {
    const name = state.selected;

    if (!name) {
      resetStats();

      setInsight(
        "info",
        "fa-circle-info",
        "Select an item to see its forecast.",
      );

      showEmpty("No inventory items available yet.");

      return;
    }

    const history = getHistory(name);

    const forecast = getForecast(name);

    const inventoryItem = getInventoryItem(name);

    const unit = inventoryItem?.unit ? String(inventoryItem.unit) : "units";

    if (!history.length) {
      resetStats();

      setInsight(
        "info",
        "fa-circle-info",
        `No usage recorded for ${name} yet. Record treatment usage so the AI can learn its demand.`,
      );

      showEmpty("No historical usage data for this item yet.");

      return;
    }

    const sma = num(forecast?.sma_forecast);

    const rf = num(forecast?.random_forest_forecast);

    const selected = num(forecast?.selected_forecast);

    const forecastDate = forecast?.forecast_date || null;

    const hasForecast = selected !== null && !!forecastDate;

    const rfChosen = hasForecast && isRandomForest(forecast);

    const smaChosen = hasForecast && isSMA(forecast);

    const label = modelLabel(forecast);

    const badge = $("fcAiBadge");

    if (badge) {
      badge.dataset.state = rfChosen ? "active" : "idle";
    }

    setText("fcAiBadgeText", rfChosen ? "AI Powered" : "AI Learning");

    setText("fcPredicted", hasForecast ? `${fmt(selected)} ${unit}` : "—");

    setText(
      "fcPredictedSub",
      hasForecast
        ? `Expected by ${shortDate(forecastDate)}`
        : "Not enough data yet",
    );

    setText("fcModel", hasForecast && label ? label : "—");

    setText(
      "fcModelSub",
      rfChosen
        ? "AI · Machine learning"
        : smaChosen
          ? "Baseline · AI not used yet"
          : "Best model picked",
    );

    const modelCard = $("fcModelCard");

    if (modelCard) {
      modelCard.dataset.model = !hasForecast ? "none" : rfChosen ? "rf" : "sma";
    }

    const statusInfo = getStatusInfo(forecast, hasForecast);

    setText("fcForecastStatus", statusInfo.label);

    setText("fcForecastStatusSub", statusInfo.sub);

    const statusElement = $("fcForecastStatus");

    if (statusElement) {
      statusElement.dataset.tone = statusInfo.tone;
    }

    renderCompare(forecast, unit, sma, rf);

    const steps = document.querySelectorAll(".fc-how-step");

    steps.forEach((step, index) => {
      step.classList.toggle("active", index === 1 && rfChosen);
    });

    const aiStepSmall = document.querySelector(
      ".fc-how-step:nth-of-type(2) small",
    );

    if (aiStepSmall) {
      aiStepSmall.textContent = rfChosen
        ? "Random Forest is active"
        : "SMA baseline · RF learning";
    }

    const lastDate = String(history[history.length - 1].demand_date).slice(
      0,
      10,
    );

    const ago = daysSince(lastDate);

    const stale = ago !== null && ago > STALE_DAYS;

    setText(
      "fcDataNote",
      `Based on ${history.length} usage records · last usage ${shortDate(
        lastDate,
      )}`,
    );

    let stockText = "";

    if (inventoryItem) {
      const stock =
        num(
          inventoryItem.stock ??
            inventoryItem.quantity ??
            inventoryItem.current_stock,
        ) ?? 0;

      if (stock <= 0) {
        stockText = `${name} is out of stock. Restock as soon as possible.`;
      } else if (selected !== null && stock < selected) {
        stockText = `Only ${fmt(stock)} ${unit} in stock. Consider restocking soon.`;
      } else {
        stockText = `Stock is enough: ${fmt(stock)} ${unit} on hand.`;
      }
    }

    let stockTone = "ok";

    if (inventoryItem && hasForecast) {
      const stock =
        num(
          inventoryItem.stock ??
            inventoryItem.quantity ??
            inventoryItem.current_stock,
        ) ?? 0;

      stockTone = stock <= 0 ? "danger" : stock < selected ? "warn" : "ok";
    }

    if (!hasForecast) {
      setInsight(
        "info",
        "fa-hourglass-half",
        `Not enough history yet to forecast ${name}. Keep recording treatment usage and the AI will start predicting.`,
      );
    } else if (rfChosen) {
      setInsight(
        stockTone,
        "fa-wand-magic-sparkles",
        `AI (Random Forest) expects about ${fmt(
          selected,
        )} ${unit} of ${name} by ${shortDate(
          forecastDate,
        )}. ${stockText}`.trim(),
      );
    } else if (
      stale ||
      norm(forecast?.forecast_status).includes("insufficient")
    ) {
      setInsight(
        "warn",
        "fa-hourglass-half",
        `AI needs more usage data to learn ${name}${
          stale
            ? ` (last recorded ${shortDate(lastDate)}, ${ago} days ago)`
            : ""
        }. Using the simple SMA baseline of ${fmt(
          selected,
        )} ${unit} for now. ${stockText}`.trim(),
      );
    } else {
      setInsight(
        stockTone,
        stockTone === "ok" ? "fa-circle-check" : "fa-triangle-exclamation",
        `SMA baseline: ${fmt(selected)} ${unit} by ${shortDate(
          forecastDate,
        )}. ${stockText}`.trim(),
      );
    }

    drawChart(history, {
      hasForecast,
      forecastDate,
      selected,
      sma,
      rf,
      unit,
      rfChosen,
    });
  }

  function drawChart(history, forecast) {
    const canvas = $("fcChart");
    const empty = $("fcEmpty");

    if (!canvas) return;

    if (typeof Chart === "undefined") {
      showEmpty(
        "Chart library could not be loaded. Check your internet connection.",
      );

      return;
    }

    if (empty) {
      empty.hidden = true;
    }

    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }

    const recent = [...history]
      .sort((a, b) =>
        String(a.demand_date).localeCompare(String(b.demand_date)),
      )
      .slice(-MAX_HISTORY_POINTS);

    const labels = recent.map((row) => String(row.demand_date).slice(0, 10));

    const actualData = recent.map((row) => Number(row.total_used || 0));

    const smaData = Array(recent.length).fill(null);

    const rfData = Array(recent.length).fill(null);

    if (forecast.hasForecast) {
      const lastActual = actualData[actualData.length - 1];

      if (forecast.sma !== null) {
        smaData[smaData.length - 1] = lastActual;
      }

      if (forecast.rf !== null) {
        rfData[rfData.length - 1] = lastActual;
      }

      labels.push(String(forecast.forecastDate).slice(0, 10));

      actualData.push(null);
      smaData.push(forecast.sma);
      rfData.push(forecast.rf);
    }

    const lineBase = {
      fill: false,
      tension: 0.3,
      spanGaps: false,
    };

    const datasets = [
      {
        ...lineBase,
        label: "Historical Demand",
        data: actualData,
        borderColor: COLORS.actual,
        backgroundColor: COLORS.actualFill,
        fill: true,
        borderWidth: 2,
        pointRadius: 2.5,
        pointBackgroundColor: COLORS.actual,
      },
      {
        ...lineBase,
        label: "SMA (baseline)",
        data: smaData,
        borderColor: COLORS.sma,
        borderDash: [5, 4],
        borderWidth: forecast.hasForecast && !forecast.rfChosen ? 3 : 2,
        pointRadius: (context) =>
          context.dataIndex === labels.length - 1 ? 5 : 0,
        pointBackgroundColor: COLORS.sma,
      },
      {
        ...lineBase,
        label: "AI · Random Forest",
        data: rfData,
        borderColor: COLORS.rf,
        borderDash: [5, 4],
        borderWidth: forecast.rfChosen ? 3 : 2,
        pointRadius: (context) =>
          context.dataIndex === labels.length - 1 ? 6 : 0,
        pointStyle: "rectRot",
        pointBackgroundColor: COLORS.rf,
      },
    ];

    state.chart = new Chart(canvas.getContext("2d"), {
      type: "line",

      data: {
        labels,
        datasets,
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        interaction: {
          mode: "index",
          intersect: false,
        },

        plugins: {
          legend: {
            position: "bottom",

            labels: {
              usePointStyle: true,
              boxWidth: 7,
              boxHeight: 7,
              padding: 14,
              color: COLORS.text,
              font: {
                size: 10,
                family: "Inter,sans-serif",
              },
            },
          },

          tooltip: {
            backgroundColor: "#14201a",

            padding: 10,

            titleFont: {
              size: 11,
            },

            bodyFont: {
              size: 11,
            },

            filter: (context) => context.parsed.y !== null,

            callbacks: {
              label: (context) =>
                ` ${context.dataset.label}: ${fmt(
                  context.parsed.y,
                )} ${forecast.unit}`,
            },
          },
        },

        scales: {
          x: {
            grid: {
              display: false,
            },

            ticks: {
              color: COLORS.text,

              font: {
                size: 9,
              },

              maxRotation: 0,
              autoSkipPadding: 12,

              callback: function (value) {
                return shortDate(this.getLabelForValue(value));
              },
            },

            title: {
              display: true,
              text: "Date",
              color: COLORS.text,
              font: {
                size: 9,
              },
            },
          },

          y: {
            beginAtZero: true,

            grid: {
              color: COLORS.grid,
            },

            ticks: {
              color: COLORS.text,
              font: {
                size: 9,
              },
              precision: 0,
            },

            title: {
              display: true,
              text: `Quantity Used (${forecast.unit})`,
              color: COLORS.text,
              font: {
                size: 9,
              },
            },
          },
        },
      },
    });
  }

  async function refresh() {
    try {
      await loadData();

      buildSelect();

      render();
    } catch (error) {
      console.error("Forecast widget error:", error);

      resetStats();

      setInsight(
        "danger",
        "fa-circle-exclamation",
        "Unable to load the AI forecast right now.",
      );

      showEmpty("Forecast data could not be loaded.");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const container = $("fcItemSelect");

    const button = $("fcItemSelectButton");

    const menu = $("fcItemSelectMenu");

    if (!container || !button || !menu) {
      return;
    }

    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const isOpen = container.classList.contains("open");

      document.querySelectorAll(".custom-select.open").forEach((dropdown) => {
        dropdown.classList.remove("open");

        const dropdownButton = dropdown.querySelector(".fc-select-button");

        if (dropdownButton) {
          dropdownButton.setAttribute("aria-expanded", "false");
        }

        const dropdownMenu = dropdown.querySelector(".fc-select-menu");

        if (dropdownMenu) {
          dropdownMenu.hidden = true;
        }
      });

      if (!isOpen) {
        container.classList.add("open");

        button.setAttribute("aria-expanded", "true");

        menu.hidden = false;
      }
    });

    menu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-value]");

      if (!option) return;

      const value = option.dataset.value;

      if (value === VIEW_MORE_VALUE) {
        goToInventoryPage2();
        return;
      }

      state.selected = value;

      state.selectedByUser = true;

      container.classList.remove("open");

      button.setAttribute("aria-expanded", "false");

      menu.hidden = true;

      buildSelect();
      render();
    });

    document.addEventListener("click", (event) => {
      if (!container.contains(event.target)) {
        container.classList.remove("open");

        button.setAttribute("aria-expanded", "false");

        menu.hidden = true;
      }
    });

    const viewFullForecast = $("fcViewFullForecast");

    if (viewFullForecast) {
      viewFullForecast.addEventListener("click", (event) => {
        event.preventDefault();
        goToInventoryPage2();
      });
    }

    void refresh();

    window.addEventListener("focus", () => void refresh());

    window.addEventListener("inventory:data-changed", () => void refresh());
  });

  window.DashboardForecast = {
    refresh,
  };
})();
