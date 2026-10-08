document.addEventListener("DOMContentLoaded", async () => {
  const NOTIFICATIONS_KEY = "dentanueva_inventory_notifications";
  const CONFIRMED_NOTIFICATIONS_KEY =
    "dentanueva_inventory_confirmed_notifications";

  const RESET_VERSION = "inventory-reset-2026-08-16-v1";
  const INVENTORY_PAGE_SIZE = 10;

  void loadInventoryNotificationsFromDatabase();

  const INVENTORY_CATEGORIES = [
    "Restorative Materials",
    "Preventive Materials",
    "Disposable Supplies",
    "Infection Control",
    "Sterilization Supplies",
    "Dental Instruments",
    "Oral Care Supplies",
    "Other",
  ];

  const addItemBtn = document.getElementById("addItemBtn");
  const emptyAddItemBtn = document.getElementById("emptyAddItemBtn");
  const stockMovementBtn = document.getElementById("stockMovementBtn");
  const inventoryNotificationBtn = document.getElementById(
    "inventoryNotificationBtn",
  );
  const exportInventoryCsvBtn = document.getElementById(
    "exportInventoryCsvBtn",
  );
  const inventoryNotificationCount = document.getElementById(
    "inventoryNotificationCount",
  );
  const inventoryNotificationPopover = document.getElementById(
    "inventoryNotificationPopover",
  );
  const inventoryNotificationClose = document.getElementById(
    "inventoryNotificationClose",
  );
  const inventoryNotificationList = document.getElementById(
    "inventoryNotificationList",
  );
  const inventorySearch = document.getElementById("inventorySearch");
  const categoryFilter = document.getElementById("categoryFilter");
  const statusFilter = document.getElementById("statusFilter");
  const expiryFilter = document.getElementById("expiryFilter");
  const sortFilter = document.getElementById("sortFilter");
  const inventoryTableBody = document.getElementById("inventoryTableBody");
  const emptyState = document.getElementById("emptyState");
  const itemCount = document.getElementById("itemCount");
  const inventoryPagination = document.getElementById("inventoryPagination");
  const inventoryPaginationSummary = document.getElementById(
    "inventoryPaginationSummary",
  );
  const inventoryPaginationPageInfo = document.getElementById(
    "inventoryPaginationPageInfo",
  );
  const inventoryPrevPageBtn = document.getElementById("inventoryPrevPageBtn");
  const inventoryNextPageBtn = document.getElementById("inventoryNextPageBtn");
  const inventoryToast = document.getElementById("inventoryToast");
  const inventoryToastIcon = document.getElementById("inventoryToastIcon");
  const inventoryToastMessage = document.getElementById(
    "inventoryToastMessage",
  );

  const inventoryPageSections = [
    ...document.querySelectorAll(".inventory-page-section"),
  ];

  const inventoryPageButtons = [
    ...document.querySelectorAll(".inventory-page-btn"),
  ];

  let stockStatusIcon = document.getElementById("stockStatusIcon");
  let inventoryCurrentPage = 1;
  const requestedInventorySection = Number(
    new URLSearchParams(window.location.search).get("page"),
  );
  let inventoryCurrentSection =
    Number.isInteger(requestedInventorySection) && requestedInventorySection > 0
      ? requestedInventorySection
      : 1;
  let itemUnitManuallyEdited = false;
  let inventoryToastTimeout = null;
  let selectedDeleteItemId = null;

  function getInventoryNotifications() {
    return window.dentanuevaInventoryNotifications || [];
  }

  function getConfirmedInventoryNotificationIds() {
    try {
      const stored = localStorage.getItem(CONFIRMED_NOTIFICATIONS_KEY);
      const parsed = stored ? JSON.parse(stored) : [];

      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (error) {
      console.error("Unable to load confirmed inventory notifications:", error);

      return [];
    }
  }

  function saveConfirmedInventoryNotificationIds(ids) {
    try {
      const uniqueIds = [...new Set(ids.map(String))];

      localStorage.setItem(
        CONFIRMED_NOTIFICATIONS_KEY,
        JSON.stringify(uniqueIds),
      );
    } catch (error) {
      console.error("Unable to save confirmed inventory notifications:", error);
    }
  }

  function filterConfirmedInventoryNotifications(notifications) {
    const confirmedIds = new Set(getConfirmedInventoryNotificationIds());

    return notifications.filter(
      (notification) => !confirmedIds.has(String(notification.id)),
    );
  }

  async function loadInventoryNotificationsFromDatabase() {
    try {
      const response = await fetch(
        "../../api/staff_notifications.php?type=inventory",
        {
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      const result = await response.json();

      if (response.ok && result.success && Array.isArray(result.data)) {
        window.dentanuevaInventoryNotifications =
          filterConfirmedInventoryNotifications(result.data);

        renderInventoryNotifications();
      }
    } catch (error) {
      console.error("Unable to load inventory notifications:", error);
    }
  }

  async function saveInventoryNotifications(notifications) {
    try {
      const response = await fetch(
        "../../api/staff_notifications.php?type=inventory",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notifications }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || "Unable to save notification changes.",
        );
      }

      window.dentanuevaInventoryNotifications = notifications;
      return true;
    } catch (error) {
      console.error("Unable to save inventory notifications:", error);
      showInventoryMessage(
        error.message || "Unable to save notification changes.",
        "error",
      );
      return false;
    }
  }

  function renderInventoryNotifications() {
    if (!inventoryNotificationList || !inventoryNotificationCount) return;

    const notifications = getInventoryNotifications();
    inventoryNotificationCount.textContent = notifications.length;
    inventoryNotificationCount.hidden = notifications.length === 0;

    inventoryNotificationList.innerHTML = notifications.length
      ? notifications
          .map(
            (notification) => `
                <article class="inventory-notification-card">
                  <div class="inventory-notification-card-icon"><i class="fa-solid fa-boxes-stacked"></i></div>
                  <div class="inventory-notification-card-body">
                    <strong>Stock used for ${escapeHTML(notification.procedure || "Treatment")}</strong>
                    <p><b>Patient:</b> ${escapeHTML(notification.patientName || "Patient")} ${notification.patientId ? `(${escapeHTML(notification.patientId)})` : ""}</p>
                    <p><b>Date:</b> ${escapeHTML(notification.treatmentDate || "Not provided")}${notification.toothNumber ? ` · <b>Tooth:</b> ${escapeHTML(notification.toothNumber)}` : ""}</p>
                    <div class="inventory-notification-items">
                      ${(notification.items || [])
                        .map((item) => {
                          const status = item.status || "stock-out-completed";
                          const statusLabel =
                            status === "unregistered"
                              ? "Not registered in inventory"
                              : status === "insufficient-stock"
                                ? `${Number(item.available) || 0} available only`
                                : "Stock-out completed";
                          const icon =
                            status === "stock-out-completed"
                              ? "fa-circle-check"
                              : "fa-triangle-exclamation";
                          return `<span class="inventory-notification-item-${status}"><i class="fa-solid ${icon}"></i>${escapeHTML(item.itemName || "Item")} · ${Number(item.quantity) || 0} ${escapeHTML(item.unit || "unit")} <small>${escapeHTML(statusLabel)}</small></span>`;
                        })
                        .join("")}
                    </div>
                    <button type="button" class="inventory-notification-confirm" data-notification-id="${escapeHTML(notification.id)}"><i class="fa-solid fa-check"></i> Confirm</button>
                  </div>
                </article>
              `,
          )
          .join("")
      : `<div class="inventory-notification-empty"><i class="fa-regular fa-bell-slash"></i><strong>No unread notifications</strong><span>Confirmed treatment stock-outs will no longer appear here.</span></div>`;
  }

  function openInventoryNotifications() {
    renderInventoryNotifications();
    inventoryNotificationPopover?.classList.add("open");
    inventoryNotificationPopover?.setAttribute("aria-hidden", "false");
  }

  function closeInventoryNotifications() {
    inventoryNotificationPopover?.classList.remove("open");
    inventoryNotificationPopover?.setAttribute("aria-hidden", "true");
  }

  inventoryNotificationBtn?.addEventListener(
    "click",
    openInventoryNotifications,
  );
  inventoryNotificationClose?.addEventListener(
    "click",
    closeInventoryNotifications,
  );
  inventoryNotificationList?.addEventListener("click", (event) => {
    const confirmButton = event.target.closest("[data-notification-id]");

    if (!confirmButton) {
      return;
    }

    const notificationId = confirmButton.dataset.notificationId;

    if (!notificationId) {
      return;
    }

    const currentConfirmedIds = getConfirmedInventoryNotificationIds();

    if (!currentConfirmedIds.includes(String(notificationId))) {
      currentConfirmedIds.push(String(notificationId));

      saveConfirmedInventoryNotificationIds(currentConfirmedIds);
    }

    window.dentanuevaInventoryNotifications =
      getInventoryNotifications().filter(
        (notification) => String(notification.id) !== String(notificationId),
      );

    renderInventoryNotifications();

    showInventoryMessage("Notification confirmed.");
  });

  renderInventoryNotifications();
  window.addEventListener(
    "inventory:notification-created",
    renderInventoryNotifications,
  );

  function showInventorySection(pageNumber) {
    const requestedPage = Number(pageNumber);

    if (!Number.isInteger(requestedPage) || requestedPage < 1) {
      return;
    }

    const targetSection = inventoryPageSections.find(
      (section) => Number(section.dataset.pageSection) === requestedPage,
    );

    const targetButton = inventoryPageButtons.find(
      (button) => Number(button.dataset.page) === requestedPage,
    );

    if (!targetSection || !targetButton) {
      return;
    }

    inventoryCurrentSection = requestedPage;

    inventoryPageSections.forEach((section) => {
      const sectionPage = Number(section.dataset.pageSection);
      section.classList.toggle("active", sectionPage === requestedPage);
    });

    inventoryPageButtons.forEach((button) => {
      const buttonPage = Number(button.dataset.page);
      const isActive = buttonPage === requestedPage;

      button.classList.toggle("active", isActive);

      if (isActive) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    if (
      requestedPage === 2 &&
      typeof window.refreshInventoryForecast === "function"
    ) {
      window.refreshInventoryForecast();
    }

    if (
      requestedPage === 2 &&
      typeof window.refreshDemandForecast === "function"
    ) {
      window.refreshDemandForecast();
    }

    if (requestedPage === 2) {
      initializeForecastChart();
    }
  }

  inventoryPageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showInventorySection(button.dataset.page);
    });
  });

  function showInventoryMessage(message, type = "success") {
    if (!inventoryToast || !inventoryToastMessage || !inventoryToastIcon) {
      return;
    }

    inventoryToastMessage.textContent = message;
    inventoryToast.classList.remove("error");

    if (type === "error") {
      inventoryToast.classList.add("error");
      inventoryToastIcon.className = "fa-solid fa-circle-exclamation";
    } else {
      inventoryToastIcon.className = "fa-solid fa-circle-check";
    }

    inventoryToast.classList.add("show");
    clearTimeout(inventoryToastTimeout);

    inventoryToastTimeout = setTimeout(() => {
      inventoryToast.classList.remove("show");
    }, 3000);
  }

  function setupInventoryHeader() {
    if (!itemCount || !stockMovementBtn || !addItemBtn) {
      return;
    }

    const headerRight = itemCount.parentElement;

    if (!headerRight) {
      return;
    }

    if (stockStatusIcon) {
      stockStatusIcon.remove();
      stockStatusIcon = null;
    }

    headerRight.appendChild(itemCount);

    const headerActions = headerRight.querySelector(
      ".inventory-header-actions",
    );

    if (headerActions) {
      headerRight.appendChild(headerActions);
    }

    [exportInventoryCsvBtn, stockMovementBtn, addItemBtn].forEach((button) => {
      if (!button) {
        return;
      }
      button.style.minHeight = "36px";
      button.style.height = "36px";
      button.style.padding = "0 12px";
      button.style.gap = "6px";
      button.style.borderRadius = "9px";
      button.style.fontSize = "0.68rem";
      button.style.whiteSpace = "nowrap";
    });

    const addItemText = addItemBtn.querySelector("span");

    if (addItemText) {
      addItemText.textContent = "Add Item";
    } else {
      addItemBtn.innerHTML =
        '<i class="fa-solid fa-plus"></i><span>Add Item</span>';
    }
  }

  setupInventoryHeader();

  const itemModal = document.getElementById("itemModal");
  const itemModalClose = document.getElementById("itemModalClose");
  const itemCancelBtn = document.getElementById("itemCancelBtn");
  const itemModalTitle = document.getElementById("itemModalTitle");
  const itemForm = document.getElementById("itemForm");
  const itemId = document.getElementById("itemId");
  const itemName = document.getElementById("itemName");
  const itemCategory = document.getElementById("itemCategory");
  const itemUnit = document.getElementById("itemUnit");
  const itemStock = document.getElementById("itemStock");
  const itemMinimum = document.getElementById("itemMinimum");
  const itemExpiry = document.getElementById("itemExpiry");
  const itemUnitCost = document.getElementById("itemUnitCost");

  const DENTAL_ITEM_CATEGORIES = {
    "Restorative Materials": [
      "Composite Resin",
      "Composite Resins",
      "Flowable Composite",
      "Flowable Composites",
      "Etching Gel",
      "Dental Bonding Agent",
      "Bonding Agent",
      "Universal Bond",
      "Glass Ionomer Cement",
      "Glass Ionomer",
      "Temporary Filling Material",
      "Dental Cement",
      "Zinc Oxide Eugenol",
    ],
    "Preventive Materials": [
      "Prophy Paste",
      "Prophylaxis Paste",
      "Fluoride Gel",
      "Fluoride Varnish",
      "Fluoride Foam",
      "Pit and Fissure Sealant",
      "Dental Sealant",
      "Pumice Powder",
    ],
    "Disposable Supplies": [
      "Cotton Rolls",
      "Sterile Gauze",
      "Dental Bibs",
      "Disposable Dental Cups",
      "Dental Cups",
      "Saliva Ejector",
      "High-Volume Suction Tip",
      "HVE Tip",
      "Air-Water Syringe Tip",
      "Three-Way Syringe Tip",
      "Microbrush",
      "Micro Brushes",
      "Cotton Swabs",
      "Paper Towels",
      "Dental Floss",
      "Disposable Gloves",
      "Nitrile Gloves",
      "Latex Gloves",
      "Surgical Face Mask",
      "Face Mask",
    ],
    "Infection Control": [
      "Surface Disinfectant",
      "Dental Disinfectant",
      "Instrument Disinfectant",
      "Hand Sanitizer",
      "Alcohol Pads",
      "Alcohol Swabs",
    ],
    "Sterilization Supplies": [
      "Sterilization Pouch",
      "Sterilization Pouches",
      "Sterilization Wrap",
      "Autoclave Indicator",
      "Sterilization Indicator",
    ],
    "Dental Instruments": [
      "Dental Mirror",
      "Mouth Mirror",
      "Dental Explorer",
      "Dental Probe",
      "Dental Tweezers",
      "College Tweezers",
      "Scaler",
      "Dental Scaler",
      "Curette",
      "Dental Curette",
      "Periodontal Probe",
    ],
    "Oral Care Supplies": [
      "Toothbrush",
      "Interdental Brush",
      "Mouthwash",
      "Oral Rinse",
      "Dental Floss",
    ],
  };

  const DENTAL_ITEM_UNITS = {
    "Composite Resin": "Tube",
    "Composite Resins": "Tube",
    "Flowable Composite": "Syringe",
    "Flowable Composites": "Syringe",
    "Etching Gel": "Syringe",
    "Dental Bonding Agent": "Bottle",
    "Bonding Agent": "Bottle",
    "Universal Bond": "Bottle",
    "Glass Ionomer Cement": "Box",
    "Glass Ionomer": "Box",
    "Temporary Filling Material": "Box",
    "Dental Cement": "Box",
    "Zinc Oxide Eugenol": "Box",
    "Prophy Paste": "Jar",
    "Prophylaxis Paste": "Jar",
    "Fluoride Gel": "Syringe",
    "Fluoride Varnish": "Tube",
    "Fluoride Foam": "Can",
    "Pit and Fissure Sealant": "Syringe",
    "Dental Sealant": "Syringe",
    "Pumice Powder": "Jar",
    "Cotton Rolls": "Pack",
    "Sterile Gauze": "Pack",
    "Dental Bibs": "Pack",
    "Disposable Dental Cups": "Pack",
    "Dental Cups": "Pack",
    "Saliva Ejector": "Pack",
    "High-Volume Suction Tip": "Pack",
    "HVE Tip": "Pack",
    "Air-Water Syringe Tip": "Pack",
    "Three-Way Syringe Tip": "Pack",
    Microbrush: "Pack",
    "Micro Brushes": "Pack",
    "Cotton Swabs": "Pack",
    "Paper Towels": "Pack",
    "Dental Floss": "Pack",
    "Disposable Gloves": "Box",
    "Nitrile Gloves": "Box",
    "Latex Gloves": "Box",
    "Surgical Face Mask": "Box",
    "Face Mask": "Box",
    "Surface Disinfectant": "Bottle",
    "Dental Disinfectant": "Bottle",
    "Instrument Disinfectant": "Bottle",
    "Hand Sanitizer": "Bottle",
    "Alcohol Pads": "Pack",
    "Alcohol Swabs": "Pack",
    "Sterilization Pouch": "Pack",
    "Sterilization Pouches": "Pack",
    "Sterilization Wrap": "Pack",
    "Autoclave Indicator": "Pack",
    "Sterilization Indicator": "Pack",
    "Dental Mirror": "Piece",
    "Mouth Mirror": "Piece",
    "Dental Explorer": "Piece",
    "Dental Probe": "Piece",
    "Dental Tweezers": "Piece",
    "College Tweezers": "Piece",
    Scaler: "Piece",
    "Dental Scaler": "Piece",
    Curette: "Piece",
    "Dental Curette": "Piece",
    "Periodontal Probe": "Piece",
    Toothbrush: "Piece",
    "Interdental Brush": "Piece",
    Mouthwash: "Bottle",
    "Oral Rinse": "Bottle",
  };

  const COMMON_DENTAL_ITEM_SUGGESTIONS = [
    "Composite Resin",
    "Etching Gel",
    "Dental Bonding Agent",
    "Glass Ionomer Cement",
    "Prophy Paste",
    "Fluoride Gel",
  ];

  const DENTAL_ITEM_SUGGESTIONS = [
    ...new Set(Object.values(DENTAL_ITEM_CATEGORIES).flat()),
  ];

  function normalizeDentalItemName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function getAutomaticItemCategory(itemNameValue) {
    const normalizedName = normalizeDentalItemName(itemNameValue);

    if (!normalizedName) {
      return "";
    }

    for (const [category, itemNames] of Object.entries(
      DENTAL_ITEM_CATEGORIES,
    )) {
      const matched = itemNames.some(
        (name) => normalizeDentalItemName(name) === normalizedName,
      );

      if (matched) {
        return category;
      }
    }

    return "";
  }

  function getAutomaticItemUnit(itemNameValue) {
    const normalizedName = normalizeDentalItemName(itemNameValue);

    if (!normalizedName) {
      return "";
    }

    const matchedItem = Object.keys(DENTAL_ITEM_UNITS).find(
      (itemName) => normalizeDentalItemName(itemName) === normalizedName,
    );

    return matchedItem ? DENTAL_ITEM_UNITS[matchedItem] : "";
  }

  function ensureItemCategoryOption(category) {
    if (!itemCategory || !category) {
      return;
    }

    const existingOption = [...itemCategory.options].find(
      (option) =>
        normalizeDentalItemName(option.value) ===
          normalizeDentalItemName(category) ||
        normalizeDentalItemName(option.textContent) ===
          normalizeDentalItemName(category),
    );

    if (existingOption) {
      return;
    }

    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    itemCategory.appendChild(option);
  }

  function autoSetItemCategoryFromName() {
    if (!itemName || !itemCategory) {
      return;
    }

    const automaticCategory = getAutomaticItemCategory(itemName.value);

    if (!automaticCategory) {
      return;
    }

    ensureItemCategoryOption(automaticCategory);
    itemCategory.value = automaticCategory;
    updateExpiryFieldState();
  }

  function autoSetItemUnitFromName(force = false) {
    if (!itemName || !itemUnit) {
      return;
    }

    const automaticUnit = getAutomaticItemUnit(itemName.value);

    if (!automaticUnit) {
      return;
    }

    if (force || !itemUnitManuallyEdited) {
      itemUnit.value = automaticUnit;
    }
  }

  function setupDentalItemSuggestions() {
    if (!itemName) {
      return;
    }

    const datalistId = "dentalItemNameSuggestions";
    let datalist = document.getElementById(datalistId);

    if (!datalist) {
      datalist = document.createElement("datalist");
      datalist.id = datalistId;
      document.body.appendChild(datalist);
    }

    function updateItemNameSuggestions() {
      const query = normalizeDentalItemName(itemName.value);

      const suggestions = query
        ? DENTAL_ITEM_SUGGESTIONS.filter((item) =>
            normalizeDentalItemName(item).includes(query),
          )
        : COMMON_DENTAL_ITEM_SUGGESTIONS;

      datalist.innerHTML = "";

      suggestions.forEach((item) => {
        const option = document.createElement("option");
        option.value = item;
        datalist.appendChild(option);
      });
    }

    updateItemNameSuggestions();

    itemName.setAttribute("list", datalistId);
    itemName.setAttribute("autocomplete", "off");

    itemName.addEventListener("input", () => {
      updateItemNameSuggestions();
      autoSetItemCategoryFromName();
      autoSetItemUnitFromName();
    });

    itemName.addEventListener("change", () => {
      updateItemNameSuggestions();
      autoSetItemCategoryFromName();
      autoSetItemUnitFromName(true);
    });
  }

  setupDentalItemSuggestions();

  if (itemUnit) {
    itemUnit.addEventListener("input", () => {
      itemUnitManuallyEdited = true;
    });
  }

  const movementModal = document.getElementById("movementModal");
  const movementModalClose = document.getElementById("movementModalClose");
  const movementCancelBtn = document.getElementById("movementCancelBtn");
  const movementForm = document.getElementById("movementForm");
  const movementItem = document.getElementById("movementItem");
  const movementType = document.getElementById("movementType");
  const movementQuantity = document.getElementById("movementQuantity");
  const movementReason = document.getElementById("movementReason");
  const actionMenu = document.getElementById("actionMenu");
  let selectedActionItemId = null;
  const deleteItemModal = document.getElementById("deleteItemModal");
  const deleteItemCancelBtn = document.getElementById("deleteItemCancelBtn");
  const deleteItemConfirmBtn = document.getElementById("deleteItemConfirmBtn");
  const deleteItemMessage = document.getElementById("deleteItemMessage");
  const viewItemModal = document.getElementById("viewItemModal");
  const viewItemModalClose = document.getElementById("viewItemModalClose");
  const viewItemCloseBtn = document.getElementById("viewItemCloseBtn");
  const viewItemDetails = document.getElementById("viewItemDetails");

  if (itemCancelBtn) {
    itemCancelBtn.style.width = "82px";
    itemCancelBtn.style.minWidth = "82px";
    itemCancelBtn.style.padding = "0 10px";
  }

  if (movementCancelBtn) {
    movementCancelBtn.style.width = "82px";
    movementCancelBtn.style.minWidth = "82px";
    movementCancelBtn.style.padding = "0 10px";
  }

  let backendInventoryItems = [];
  let backendInventoryMovements = [];
  const DEMAND_FORECAST_PAGE_SIZE = 10;
  let demandForecastCurrentPage = 1;

  async function loadInventoryFromBackend() {
    try {
      const response = await fetch("../../api/inventory.php?action=list", {
        method: "GET",
        credentials: "same-origin",
      });
      const result = await response.json();

      if (!result?.success) {
        return { items: [], movements: [] };
      }

      backendInventoryItems = Array.isArray(result?.data?.items)
        ? result.data.items
        : [];
      backendInventoryMovements = Array.isArray(result?.data?.movements)
        ? result.data.movements
        : [];

      window.dentanueva_inventory_items = backendInventoryItems;
      window.dentanueva_inventory_movements = backendInventoryMovements;
      return {
        items: backendInventoryItems,
        movements: backendInventoryMovements,
      };
    } catch (error) {
      console.error("Unable to load inventory from backend:", error);
      return { items: [], movements: [] };
    }
  }

  async function loadDemandForecast() {
    const forecastBody = document.getElementById("demandForecastTableBody");
    const emptyState = document.getElementById("demandForecastEmpty");

    if (!forecastBody) return;

    try {
      const response = await fetch("../../api/inventory/forecast.php", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || "Unable to load inventory forecasts.",
        );
      }

      const forecastItems = Array.isArray(result?.forecasts)
        ? result.forecasts
        : [];

      forecastResults = forecastItems;

      forecastChartData = Array.isArray(result?.history) ? result.history : [];

      loadForecastChartItems(result.history_by_item || {});

      const inventoryItems = getItems();

      const normalizeItemName = (value) =>
        String(value || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");

      const forecastMap = new Map();

      forecastItems.forEach((item) => {
        const itemName = normalizeItemName(item?.item_name);

        if (itemName) {
          forecastMap.set(itemName, item);
        }
      });

      const historyItemNames = Object.keys(result.history_by_item || {});
      const mergedItems = [...forecastItems];
      const mergedMap = new Map();

      mergedItems.forEach((item) => {
        const normalizedName = normalizeItemName(item?.item_name);
        if (normalizedName) {
          mergedMap.set(normalizedName, item);
        }
      });

      historyItemNames.forEach((itemName) => {
        const normalizedName = normalizeItemName(itemName);
        if (!normalizedName || mergedMap.has(normalizedName)) {
          return;
        }
        const historyRecords = result.history_by_item[itemName] || [];
        mergedItems.push({
          item_name: itemName,
          forecast_date: null,
          model_name: null,
          sma_forecast: null,
          random_forest_forecast: null,
          selected_forecast: null,
          accuracy: null,
          mape: null,
          rmse: null,
          forecast_status:
            historyRecords.length > 0
              ? "insufficient_data"
              : "no_consumption_data",
          evaluation_available: false,
        });
        mergedMap.set(normalizedName, mergedItems[mergedItems.length - 1]);
      });

      inventoryItems.forEach((inventoryItem) => {
        const itemName = String(
          inventoryItem?.name ||
            inventoryItem?.item_name ||
            inventoryItem?.itemName ||
            inventoryItem?.item ||
            "",
        ).trim();

        if (!itemName) {
          return;
        }

        const normalizedName = normalizeItemName(itemName);

        if (mergedMap.has(normalizedName)) {
          return;
        }

        mergedItems.push({
          item_name: itemName,
          forecast_date: null,
          model_name: null,
          sma_forecast: null,
          random_forest_forecast: null,
          selected_forecast: null,
          accuracy: null,
          mape: null,
          rmse: null,
          forecast_status: "no_consumption_data",
          evaluation_available: false,
        });
        mergedMap.set(normalizedName, mergedItems[mergedItems.length - 1]);
      });

      forecastBody.innerHTML = mergedItems
        .map((item) => {
          const forecastStatus = String(item.forecast_status || "");

          const hasForecastData = forecastStatus !== "no_consumption_data";

          const forecastDate =
            item.forecast_date !== null && item.forecast_date !== undefined
              ? String(item.forecast_date)
              : null;

          const smaForecast =
            item.sma_forecast !== null && item.sma_forecast !== undefined
              ? Number(item.sma_forecast)
              : null;

          const rfForecast =
            item.random_forest_forecast !== null &&
            item.random_forest_forecast !== undefined
              ? Number(item.random_forest_forecast)
              : null;

          const accuracy =
            item.accuracy !== null && item.accuracy !== undefined
              ? Number(item.accuracy)
              : null;

          const mape =
            item.mape !== null && item.mape !== undefined
              ? Number(item.mape)
              : null;

          const rmse =
            item.rmse !== null && item.rmse !== undefined
              ? Number(item.rmse)
              : null;

          const selectedForecast =
            item.selected_forecast !== null &&
            item.selected_forecast !== undefined
              ? Number(item.selected_forecast)
              : null;

          let statusLabel = "No Consumption Data";

          const normalizedModelName = String(item.model_name || "")
            .trim()
            .toLowerCase();

          if (
            forecastStatus === "insufficient_historical_data" ||
            forecastStatus === "insufficient_data"
          ) {
            statusLabel = "Insufficient Data";
          } else if (
            forecastStatus === "random_forest_evaluation_available" ||
            (normalizedModelName === "randomforestregressor" &&
              item.evaluation_available)
          ) {
            statusLabel = "Random Forest";
          } else if (
            forecastStatus === "random_forest_below_accuracy_threshold"
          ) {
            statusLabel = "SMA Selected";
          } else if (normalizedModelName === "sma") {
            statusLabel = "SMA Selected";
          } else if (hasForecastData) {
            statusLabel = "Forecast Available";
          }

          const modelName = hasForecastData
            ? normalizedModelName === "randomforestregressor"
              ? "Random Forest"
              : normalizedModelName === "sma"
                ? "SMA"
                : String(item.model_name || "—")
            : "—";

          return `
        <tr>
          <td>
            ${escapeHTML(item.item_name || "Unknown item")}
          </td>

          <td>
            ${forecastDate ? escapeHTML(forecastDate) : "—"}
          </td>

          <td>
            ${smaForecast !== null ? smaForecast.toFixed(2) : "—"}
          </td>

          <td>
            ${rfForecast !== null ? rfForecast.toFixed(2) : "—"}
          </td>

          <td>
            ${
              mape !== null && item.evaluation_available
                ? mape.toFixed(2) + "%"
                : "—"
            }
          </td>

          <td>
            ${rmse !== null && item.evaluation_available ? rmse.toFixed(2) : "—"}
          </td>

          <td>
            ${
              accuracy !== null && item.evaluation_available
                ? accuracy.toFixed(2) + "%"
                : "—"
            }
          </td>

          <td>
            ${selectedForecast !== null ? selectedForecast.toFixed(2) : "—"}
          </td>

          <td>
            ${escapeHTML(modelName)}
          </td>

          <td>
    <span class="forecast-status-badge ${forecastStatus === "no_consumption_data" ? "forecast-status-no-data" : "forecast-status-insufficient"}">
      ${escapeHTML(statusLabel)}
    </span>
  </td>
        </tr>
      `;
        })
        .join("");

      if (emptyState) {
        emptyState.hidden = mergedItems.length > 0;
      }
      demandForecastCurrentPage = 1;
      initializeDemandForecastControls();
      renderDemandForecastPagination();
    } catch (error) {
      console.error("Unable to load demand forecast:", error);

      forecastBody.innerHTML = "";

      if (emptyState) {
        emptyState.hidden = false;
      }
    }
  }
  function renderDemandForecastPagination() {
    const forecastBody = document.getElementById("demandForecastTableBody");
    const searchInput = document.getElementById("demandForecastSearch");
    const pagination = document.getElementById("demandForecastPagination");
    const summary = document.getElementById("demandForecastPaginationSummary");
    const pageInfo = document.getElementById(
      "demandForecastPaginationPageInfo",
    );
    const prevButton = document.getElementById("demandForecastPrevPageBtn");
    const nextButton = document.getElementById("demandForecastNextPageBtn");
    const emptyState = document.getElementById("demandForecastEmpty");

    if (!forecastBody) {
      return;
    }

    const allRows = Array.from(forecastBody.querySelectorAll("tr"));

    const searchValue = String(searchInput?.value || "")
      .trim()
      .toLowerCase();

    const filteredRows = allRows.filter((row) => {
      const itemName = String(row.cells?.[0]?.textContent || "")
        .trim()
        .toLowerCase();

      return !searchValue || itemName.includes(searchValue);
    });

    const totalItems = filteredRows.length;
    const totalPages = Math.max(
      Math.ceil(totalItems / DEMAND_FORECAST_PAGE_SIZE),
      1,
    );

    if (demandForecastCurrentPage > totalPages) {
      demandForecastCurrentPage = totalPages;
    }

    if (demandForecastCurrentPage < 1) {
      demandForecastCurrentPage = 1;
    }

    allRows.forEach((row) => {
      row.style.display = "none";
    });

    const startIndex =
      (demandForecastCurrentPage - 1) * DEMAND_FORECAST_PAGE_SIZE;

    const endIndex = Math.min(
      startIndex + DEMAND_FORECAST_PAGE_SIZE,
      totalItems,
    );

    filteredRows.slice(startIndex, endIndex).forEach((row) => {
      row.style.display = "";
    });

    if (totalItems > 0) {
      pagination.style.display = "flex";

      summary.textContent = `Showing ${startIndex + 1}–${endIndex} of ${totalItems} items`;

      pageInfo.textContent = `Page ${demandForecastCurrentPage} of ${totalPages}`;

      prevButton.disabled = demandForecastCurrentPage <= 1;
      nextButton.disabled = demandForecastCurrentPage >= totalPages;
    } else {
      pagination.style.display = "none";
    }

    if (emptyState) {
      if (allRows.length === 0) {
        emptyState.hidden = false;

        const heading = emptyState.querySelector("h3");
        const paragraph = emptyState.querySelector("p");

        if (heading) {
          heading.textContent = "No historical usage data";
        }

        if (paragraph) {
          paragraph.textContent =
            "Record stock-out movements to build historical usage data for demand forecasting.";
        }
      } else if (filteredRows.length === 0 && searchValue) {
        emptyState.hidden = false;

        const heading = emptyState.querySelector("h3");
        const paragraph = emptyState.querySelector("p");

        if (heading) {
          heading.textContent = "No forecast items found";
        }

        if (paragraph) {
          paragraph.textContent = `No forecast item matches "${searchValue}".`;
        }
      } else {
        emptyState.hidden = true;
      }
    }
  }
  function initializeDemandForecastControls() {
    const searchInput = document.getElementById("demandForecastSearch");
    const prevButton = document.getElementById("demandForecastPrevPageBtn");
    const nextButton = document.getElementById("demandForecastNextPageBtn");

    if (searchInput && !searchInput.dataset.initialized) {
      searchInput.addEventListener("input", () => {
        demandForecastCurrentPage = 1;
        renderDemandForecastPagination();
      });

      searchInput.dataset.initialized = "true";
    }

    if (prevButton && !prevButton.dataset.initialized) {
      prevButton.addEventListener("click", () => {
        if (demandForecastCurrentPage > 1) {
          demandForecastCurrentPage--;
          renderDemandForecastPagination();
        }
      });

      prevButton.dataset.initialized = "true";
    }

    if (nextButton && !nextButton.dataset.initialized) {
      nextButton.addEventListener("click", () => {
        const forecastBody = document.getElementById("demandForecastTableBody");

        const searchInput = document.getElementById("demandForecastSearch");

        if (!forecastBody) {
          return;
        }

        const searchValue = String(searchInput?.value || "")
          .trim()
          .toLowerCase();

        const rows = Array.from(forecastBody.querySelectorAll("tr"));

        const filteredRows = rows.filter((row) => {
          const itemName = String(row.cells?.[0]?.textContent || "")
            .trim()
            .toLowerCase();

          return !searchValue || itemName.includes(searchValue);
        });

        const totalPages = Math.max(
          Math.ceil(filteredRows.length / DEMAND_FORECAST_PAGE_SIZE),
          1,
        );

        if (demandForecastCurrentPage < totalPages) {
          demandForecastCurrentPage++;
          renderDemandForecastPagination();
        }
      });

      nextButton.dataset.initialized = "true";
    }
  }
  window.refreshDemandForecast = loadDemandForecast;

  let forecastDemandChart = null;
  let forecastChartData = [];
  let forecastResults = [];

  function populateForecastChartItems() {
    const select = document.getElementById("forecastChartItem");

    if (!select) {
      return;
    }

    const currentValue = select.value;

    select.innerHTML = `
      <option value="">Select item</option>
    `;

    const itemNames = [
      ...new Set(
        forecastChartData
          .map((item) => String(item.item_name || "").trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));

    itemNames.forEach((itemName) => {
      const option = document.createElement("option");

      option.value = itemName;
      option.textContent = itemName;

      select.appendChild(option);
    });

    if (currentValue && itemNames.includes(currentValue)) {
      select.value = currentValue;
    }
  }

  function normalizeForecastChartItemName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function loadForecastChartItems(historyByItem) {
    const select = document.getElementById("forecastChartItem");

    if (!select) {
      return;
    }

    const itemNames = Object.keys(historyByItem || {}).sort((a, b) =>
      a.localeCompare(b),
    );

    const currentValue = select.value;

    select.innerHTML = `
      <option value="">Select item</option>
    `;

    itemNames.forEach((itemName) => {
      const option = document.createElement("option");

      option.value = itemName;
      option.textContent = itemName;

      select.appendChild(option);
    });

    if (currentValue && itemNames.includes(currentValue)) {
      select.value = currentValue;
    } else if (itemNames.length > 0) {
      select.value = itemNames[0];
    }
  }

  function getForecastChartItemHistory(itemName) {
    const normalizedName = normalizeForecastChartItemName(itemName);

    return forecastChartData.filter((record) => {
      return (
        normalizeForecastChartItemName(record.item_name) === normalizedName
      );
    });
  }

  function renderForecastDemandChart(itemName) {
    const canvas = document.getElementById("forecastDemandChart");
    const emptyState = document.getElementById("forecastChartEmpty");

    if (!canvas || !emptyState) {
      return;
    }

    if (forecastDemandChart) {
      forecastDemandChart.destroy();
      forecastDemandChart = null;
    }

    if (!itemName) {
      canvas.hidden = true;
      emptyState.hidden = false;

      emptyState.querySelector("h3").textContent = "No chart data available";

      emptyState.querySelector("p").textContent =
        "Select an inventory item with historical demand data to display the chart.";

      return;
    }

    const records = getForecastChartItemHistory(itemName);

    if (!records.length) {
      canvas.hidden = true;
      emptyState.hidden = false;

      emptyState.querySelector("h3").textContent = "No historical demand data";

      emptyState.querySelector("p").textContent =
        "This inventory item does not have recorded treatment consumption.";

      return;
    }

    const sortedRecords = [...records].sort((a, b) => {
      return String(a.demand_date).localeCompare(String(b.demand_date));
    });

    const actualLabels = sortedRecords.map((record) => record.demand_date);

    const actualDemand = sortedRecords.map((record) =>
      Number(record.total_used || 0),
    );

    const smaWindow = 3;

    const smaHistorical = actualDemand.map((value, index, values) => {
      const startIndex = Math.max(0, index - smaWindow + 1);

      const windowValues = values.slice(startIndex, index + 1);

      const total = windowValues.reduce((sum, current) => sum + current, 0);

      return total / windowValues.length;
    });

    const forecastItem = forecastResults.find(
      (item) =>
        normalizeForecastChartItemName(item.item_name) ===
        normalizeForecastChartItemName(itemName),
    );

    let forecastDate = null;
    let smaForecast = null;
    let rfForecast = null;

    if (forecastItem) {
      forecastDate = forecastItem.forecast_date;

      if (
        forecastItem.sma_forecast !== null &&
        forecastItem.sma_forecast !== undefined
      ) {
        smaForecast = Number(forecastItem.sma_forecast);
      }

      if (
        forecastItem.random_forest_forecast !== null &&
        forecastItem.random_forest_forecast !== undefined
      ) {
        rfForecast = Number(forecastItem.random_forest_forecast);
      }
    }

    const latestHistoricalDate =
      actualLabels.length > 0 ? actualLabels[actualLabels.length - 1] : null;

    let chartForecastDate = forecastDate;

    if (latestHistoricalDate) {
      const latestDate = new Date(`${latestHistoricalDate}T00:00:00`);

      const backendForecastDate = forecastDate
        ? new Date(`${forecastDate}T00:00:00`)
        : null;

      if (
        !backendForecastDate ||
        Number.isNaN(backendForecastDate.getTime()) ||
        backendForecastDate <= latestDate
      ) {
        const nextDate = new Date(latestDate);

        nextDate.setDate(nextDate.getDate() + 1);

        chartForecastDate = [
          nextDate.getFullYear(),
          String(nextDate.getMonth() + 1).padStart(2, "0"),
          String(nextDate.getDate()).padStart(2, "0"),
        ].join("-");
      }
    }

    const labels = [...actualLabels];

    if (chartForecastDate) {
      labels.push(chartForecastDate);
    }

    const historicalSmaData = [...smaHistorical];

    const smaForecastData = Array(sortedRecords.length).fill(null);

    const rfForecastData = Array(sortedRecords.length).fill(null);

    if (chartForecastDate) {
      smaForecastData.push(smaForecast);
      rfForecastData.push(rfForecast);
    }

    const historicalDemandData = [...actualDemand];

    if (chartForecastDate) {
      historicalDemandData.push(null);
    }

    canvas.hidden = false;
    emptyState.hidden = true;

    const chartContext = canvas.getContext("2d");

    const inventoryItem = getItems().find(
      (item) =>
        normalizeForecastChartItemName(item.name) ===
        normalizeForecastChartItemName(itemName),
    );

    const unit = inventoryItem?.unit ? String(inventoryItem.unit) : "units";

    forecastDemandChart = new Chart(chartContext, {
      type: "line",

      data: {
        labels,

        datasets: [
          {
            label: "Historical Demand",
            data: historicalDemandData,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointHitRadius: 12,
          },

          {
            label: "SMA",
            data: chartForecastDate
              ? historicalSmaData.concat(smaForecast)
              : historicalSmaData,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 6,
            pointHitRadius: 12,
          },

          {
            label: "Random Forest",
            data: rfForecastData,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointHitRadius: 12,
          },
        ],
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
            display: true,
          },

          tooltip: {
            enabled: true,

            filter: (context) => context.parsed.y !== null,

            callbacks: {
              label: (context) =>
                ` ${context.dataset.label}: ${Number(
                  context.parsed.y,
                ).toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })} ${unit}`,
            },
          },
        },

        scales: {
          x: {
            title: {
              display: true,
              text: "Date",
            },
          },

          y: {
            beginAtZero: true,

            title: {
              display: true,
              text: `Quantity Used (${unit})`,
            },
          },
        },
      },
    });
  }

  async function loadForecastChartData() {
    const select = document.getElementById("forecastChartItem");

    if (!select) {
      return;
    }

    try {
      const response = await fetch("../../api/inventory/forecast.php", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(
          result.message || "Unable to load forecast chart data.",
        );
      }

      forecastChartData = Array.isArray(result.history) ? result.history : [];

      forecastResults = Array.isArray(result.forecasts) ? result.forecasts : [];

      loadForecastChartItems(result.history_by_item || {});

      if (select.value) {
        renderForecastDemandChart(select.value);
      } else {
        renderForecastDemandChart("");
      }
    } catch (error) {
      console.error("Forecast chart error:", error);

      forecastChartData = [];

      select.innerHTML = `
        <option value="">
          Unable to load chart data
        </option>
      `;

      renderForecastDemandChart("");
    }
  }

  function initializeForecastChart() {
    const select = document.getElementById("forecastChartItem");

    if (!select) {
      return;
    }

    if (!select.dataset.forecastInitialized) {
      select.addEventListener("change", () => {
        renderForecastDemandChart(select.value);
      });
      select.dataset.forecastInitialized = "true";
    }

    loadForecastChartData();
  }

  function getItems() {
    if (backendInventoryItems.length) {
      return backendInventoryItems;
    }

    if (Array.isArray(window.dentanueva_inventory_items)) {
      backendInventoryItems = window.dentanueva_inventory_items;
      return backendInventoryItems;
    }

    return [];
  }

  async function saveInventoryItemToBackend(item) {
    const payload = {
      action: "save_item",
      name: item.name,
      category: item.category,
      unit: item.unit,
      stock: Number(item.stock) || 0,
      minimum: Number(item.minimum) || 0,
      expiry: item.expiry || "",
      unitCost: Number(item.unitCost) || 0,
    };

    if (item.databaseId) {
      payload.id = item.databaseId;
    }

    const response = await fetch("../../api/inventory.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result?.success) {
      throw new Error(result?.message || "Unable to save inventory item.");
    }

    return result.data;
  }

  function getMovements() {
    return Array.isArray(backendInventoryMovements)
      ? backendInventoryMovements
      : [];
  }
  function getTodayString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function escapeCsvValue(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportInventoryToCsv() {
    const movements = getMovements();

    if (!movements.length) {
      showInventoryMessage("No inventory movement records available.", "error");
      return;
    }

    const headers = [
      "Movement ID",
      "Date",
      "Patient ID",
      "Appointment ID",
      "Item ID",
      "Item",
      "Movement Type",
      "Source",
      "Quantity",
      "Unit",
      "Unit Cost",
      "Total Cost",
      "Previous Stock",
      "New Stock",
    ];

    const sortedMovements = [...movements].sort((a, b) => {
      const aPatient = String(a.patientId || "").trim();
      const aAppointment = String(a.appointmentId || "").trim();
      const aItemId = String(a.itemId || "").trim();
      const aItemName = String(a.itemName || "").trim();
      const aQuantity =
        a.quantity !== null && a.quantity !== undefined && a.quantity !== "";

      const bPatient = String(b.patientId || "").trim();
      const bAppointment = String(b.appointmentId || "").trim();
      const bItemId = String(b.itemId || "").trim();
      const bItemName = String(b.itemName || "").trim();
      const bQuantity =
        b.quantity !== null && b.quantity !== undefined && b.quantity !== "";

      const aComplete =
        aPatient && aAppointment && aItemId && aItemName && aQuantity;

      const bComplete =
        bPatient && bAppointment && bItemId && bItemName && bQuantity;

      if (aComplete !== bComplete) {
        return aComplete ? -1 : 1;
      }

      const aDate = new Date(a.date || 0).getTime();
      const bDate = new Date(b.date || 0).getTime();

      return bDate - aDate;
    });

    const rows = sortedMovements.map((movement) => {
      const quantity = Number(movement.quantity) || 0;
      const unitCost = Number(movement.unitCost ?? movement.unit_cost) || 0;
      const totalCost = quantity * unitCost;

      return [
        movement.movementId || movement.id || "",
        movement.date || "",
        movement.patientId || "Not Applicable",
        movement.appointmentId || "Not Applicable",
        movement.itemId || "",
        movement.itemName || "",
        movement.type || "",
        movement.source || movement.reason || "Not Specified",
        movement.quantity ?? "",
        movement.unit || "",
        unitCost.toFixed(2),
        totalCost.toFixed(2),
        movement.previousStock ?? "",
        movement.newStock ?? "",
      ]
        .map(escapeCsvValue)
        .join(",");
    });

    const csv = [headers.map(escapeCsvValue).join(","), ...rows].join("\r\n");

    const blob = new Blob(["\ufeff", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `denta-nueva-inventory-${getTodayString()}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    showInventoryMessage(
      `${movements.length} inventory movement${movements.length === 1 ? "" : "s"} exported successfully.`,
    );
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getStockStatus(item) {
    const stock = Number(item.stock) || 0;
    const minimum = Number(item.minimum) || 0;

    if (stock <= 0) {
      return "out";
    }

    if (stock <= minimum) {
      return "low";
    }

    return "normal";
  }

  function getStatusLabel(status) {
    if (status === "out") {
      return "Out of Stock";
    }

    if (status === "low") {
      return "Low Stock";
    }

    return "Normal";
  }

  function getDaysUntilExpiry(dateString) {
    if (!dateString) {
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(`${dateString}T00:00:00`);

    if (Number.isNaN(expiry.getTime())) {
      return null;
    }

    const difference = expiry.getTime() - today.getTime();

    return Math.ceil(difference / (1000 * 60 * 60 * 24));
  }

  function categoryHasExpiry(category) {
    const normalizedCategory = String(category || "")
      .trim()
      .toLowerCase();

    return (
      !normalizedCategory.includes("instrument") &&
      !normalizedCategory.includes("equipment")
    );
  }

  function getExpiryStatus(item) {
    if (!categoryHasExpiry(item.category) || !item.expiry) {
      return "no-expiry";
    }

    const days = getDaysUntilExpiry(item.expiry);

    if (days === null) {
      return "no-expiry";
    }

    if (days <= 0) {
      return "expired";
    }

    if (days <= 7) {
      return "expiring-soon";
    }

    return "normal";
  }

  function updateExpiryFieldState() {
    if (!itemExpiry || !itemCategory) {
      return;
    }

    const hasExpiry = categoryHasExpiry(itemCategory.value);

    itemExpiry.disabled = !hasExpiry;

    if (!hasExpiry) {
      itemExpiry.value = "";
    }
  }

  function formatExpiry(dateString) {
    if (!dateString) {
      return '<span class="no-expiry">No expiry</span>';
    }

    const days = getDaysUntilExpiry(dateString);
    const date = new Date(`${dateString}T00:00:00`);

    const formatted = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    if (days !== null && days <= 0) {
      return '<span class="expiry-danger">Expired</span>';
    }

    if (days !== null && days <= 7) {
      return `<span class="expiry-warning">${escapeHTML(formatted)}</span>`;
    }

    return `<span class="expiry-normal">${escapeHTML(formatted)}</span>`;
  }

  function renderCategoryFilter() {
    if (!categoryFilter) {
      return;
    }

    const items = getItems();
    const currentValue = categoryFilter.value || "all";

    const categories = [
      ...new Set([
        ...INVENTORY_CATEGORIES,
        ...items.map((item) => item.category).filter(Boolean),
      ]),
    ];

    categoryFilter.innerHTML = '<option value="all">All Categories</option>';

    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categoryFilter.appendChild(option);
    });

    if (categories.includes(currentValue)) {
      categoryFilter.value = currentValue;
    } else {
      categoryFilter.value = "all";
    }
  }

  function getFilteredItems() {
    const items = getItems();
    const searchValue = inventorySearch.value.trim().toLowerCase();
    const selectedCategory = categoryFilter.value;
    const selectedStatus = statusFilter.value;
    const selectedExpiry = expiryFilter ? expiryFilter.value : "all";
    const selectedSort = sortFilter.value;

    let filtered = items.filter((item) => {
      const itemName = String(item.name || "").toLowerCase();
      const itemCategory = String(item.category || "").toLowerCase();

      const matchesSearch =
        !searchValue ||
        itemName.includes(searchValue) ||
        itemCategory.includes(searchValue);

      const matchesCategory =
        selectedCategory === "all" || item.category === selectedCategory;

      const matchesStatus =
        selectedStatus === "all" || getStockStatus(item) === selectedStatus;

      const matchesExpiry =
        selectedExpiry === "all" || getExpiryStatus(item) === selectedExpiry;

      return matchesSearch && matchesCategory && matchesStatus && matchesExpiry;
    });

    filtered.sort((a, b) => {
      if (selectedSort === "name-asc") {
        return String(a.name || "").localeCompare(String(b.name || ""));
      }

      if (selectedSort === "name-desc") {
        return String(b.name || "").localeCompare(String(a.name || ""));
      }

      if (selectedSort === "stock-low") {
        return Number(a.stock || 0) - Number(b.stock || 0);
      }

      if (selectedSort === "stock-high") {
        return Number(b.stock || 0) - Number(a.stock || 0);
      }

      if (selectedSort === "expiry") {
        const aExpiry = a.expiry ? new Date(a.expiry).getTime() : Infinity;
        const bExpiry = b.expiry ? new Date(b.expiry).getTime() : Infinity;

        return aExpiry - bExpiry;
      }

      if (selectedSort === "id-asc") {
        const aId = Number(String(a.id || "").replace(/\D/g, "")) || 0;
        const bId = Number(String(b.id || "").replace(/\D/g, "")) || 0;

        return aId - bId;
      }

      return 0;
    });

    return filtered;
  }

  function renderInventoryPagination(totalItems, totalPages) {
    if (
      !inventoryPagination ||
      !inventoryPaginationSummary ||
      !inventoryPaginationPageInfo ||
      !inventoryPrevPageBtn ||
      !inventoryNextPageBtn
    ) {
      return;
    }

    if (totalItems <= INVENTORY_PAGE_SIZE) {
      inventoryPagination.style.display = "none";
      inventoryPrevPageBtn.disabled = true;
      inventoryNextPageBtn.disabled = true;
      return;
    }
    inventoryPagination.style.display = "flex";
    const startItem = (inventoryCurrentPage - 1) * INVENTORY_PAGE_SIZE + 1;
    const endItem = Math.min(
      inventoryCurrentPage * INVENTORY_PAGE_SIZE,
      totalItems,
    );
    inventoryPaginationSummary.textContent = `Showing ${startItem}–${endItem} of ${totalItems} items`;
    inventoryPaginationPageInfo.textContent = `Page ${inventoryCurrentPage} of ${totalPages}`;
    inventoryPrevPageBtn.disabled = inventoryCurrentPage <= 1;
    inventoryNextPageBtn.disabled = inventoryCurrentPage >= totalPages;
  }

  function renderInventoryTable() {
    if (!inventoryTableBody) {
      return;
    }

    const filteredItems = getFilteredItems();
    const allItems = getItems();
    const totalItems = filteredItems.length;
    const totalPages = Math.max(Math.ceil(totalItems / INVENTORY_PAGE_SIZE), 1);

    if (inventoryCurrentPage > totalPages) {
      inventoryCurrentPage = totalPages;
    }

    if (inventoryCurrentPage < 1) {
      inventoryCurrentPage = 1;
    }

    const startIndex = (inventoryCurrentPage - 1) * INVENTORY_PAGE_SIZE;
    const pageItems = filteredItems.slice(
      startIndex,
      startIndex + INVENTORY_PAGE_SIZE,
    );

    inventoryTableBody.innerHTML = "";

    const hasActiveFilter =
      inventorySearch.value.trim().length > 0 ||
      categoryFilter.value !== "all" ||
      statusFilter.value !== "all" ||
      expiryFilter.value !== "all";

    if (itemCount) {
      itemCount.textContent =
        hasActiveFilter && totalItems !== allItems.length
          ? `${totalItems} of ${allItems.length} items`
          : `${allItems.length} ${allItems.length === 1 ? "item" : "items"}`;
    }

    if (emptyState) {
      emptyState.hidden = true;
      emptyState.style.display = "none";
    }

    if (filteredItems.length === 0 && emptyState) {
      emptyState.hidden = false;
      emptyState.style.display = "flex";
    }

    renderInventoryPagination(totalItems, totalPages);

    pageItems.forEach((item) => {
      const status = getStockStatus(item);
      const row = document.createElement("tr");

      row.innerHTML = `
          <td>
            <div class="item-cell">
              <div class="item-avatar">
                <i class="fa-solid fa-box"></i>
              </div>
              <div class="item-info">
                <span
                  class="item-name"
                  title="${escapeHTML(item.name)}"
                >
                  ${escapeHTML(item.name)}
                </span>
                <span class="item-id" style="color: #4f6258;">
                  Item ID: ${escapeHTML(item.id)}
                </span>
              </div>
            </div>
          </td>
          <td>
            <span class="category-badge">
              ${escapeHTML(item.category)}
            </span>
          </td>
          <td>
            <span class="minimum-value">
              ${Number(item.minimum) || 0}
            </span>
          </td>
          <td>
            <span class="stock-value">
              ${Number(item.stock) || 0}
            </span>
          </td>
          <td>
            ${escapeHTML(item.unit)}
          </td>
                    <td>
            ₱${(Number(item.unitCost ?? item.unit_cost) || 0).toFixed(2)}
          </td>
          <td>
            <span class="stock-value">
              ₱${((Number(item.stock) || 0) * (Number(item.unitCost ?? item.unit_cost) || 0)).toFixed(2)}
            </span>
          </td>
          <td>
            ${formatExpiry(item.expiry)}
          </td>
          <td>
            <span class="status-badge status-${status}">
              ${getStatusLabel(status)}
            </span>
          </td>
          <td>
            <button
              type="button"
              class="action-button"
              data-item-id="${escapeHTML(item.id)}"
              aria-label="Item actions"
            >
              <i class="fa-solid fa-ellipsis"></i>
            </button>
          </td>
        `;

      inventoryTableBody.appendChild(row);
    });
  }

  function updateStatistics() {
    const items = getItems();

    const lowStockItems = items.filter(
      (item) => getStockStatus(item) === "low",
    );

    const outOfStockItems = items.filter(
      (item) => getStockStatus(item) === "out",
    );

    updateStockStatusIcon(lowStockItems.length, outOfStockItems.length);
  }

  function updateStockStatusIcon(lowCount, outCount) {
    if (!stockStatusIcon) {
      return;
    }

    const hasWarning = lowCount > 0 || outCount > 0;

    stockStatusIcon.classList.toggle("has-warning", hasWarning);

    if (outCount > 0) {
      stockStatusIcon.title = `${outCount} ${
        outCount === 1 ? "item is" : "items are"
      } out of stock${
        lowCount > 0
          ? ` and ${lowCount} ${
              lowCount === 1 ? "item is" : "items are"
            } low on stock.`
          : "."
      }`;

      return;
    }

    if (lowCount > 0) {
      stockStatusIcon.title = `${lowCount} ${
        lowCount === 1 ? "item needs" : "items need"
      } attention because stock is at or below the minimum level.`;

      return;
    }

    stockStatusIcon.title =
      "All inventory items are currently above their minimum stock levels.";
  }

  function openItemModal(item = null) {
    closeActionMenu();
    itemForm.reset();
    itemUnitManuallyEdited = false;

    if (item) {
      itemModalTitle.textContent = "Edit Inventory Item";
      itemId.value = item.id;
      itemName.value = item.name;
      itemName.readOnly = true;

      ensureItemCategoryOption(item.category);
      itemCategory.value = item.category;

      itemUnit.value = item.unit;
      itemStock.value = item.stock;
      itemStock.readOnly = true;
      itemMinimum.value = item.minimum;
      itemExpiry.value = item.expiry || "";
      itemUnitCost.value = Number(item.unitCost ?? item.unit_cost) || 0;
    } else {
      itemModalTitle.textContent = "Add Inventory Item";
      itemId.value = "";
      itemName.value = "";
      itemName.readOnly = false;

      itemStock.value = "0";
      itemStock.readOnly = true;
      itemMinimum.value = "5";
      itemUnitCost.value = "0.00";
    }

    updateExpiryFieldState();

    itemModal.classList.add("active");
    itemModal.setAttribute("aria-hidden", "false");

    setTimeout(() => {
      if (!itemName.readOnly) {
        itemName.focus();
      }
    }, 100);
  }

  function closeItemModal() {
    itemModal.classList.remove("active");
    itemModal.setAttribute("aria-hidden", "true");
  }

  itemForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = itemName.value.trim();
    const automaticCategory = getAutomaticItemCategory(name);

    if (automaticCategory) {
      ensureItemCategoryOption(automaticCategory);
      itemCategory.value = automaticCategory;
    }

    const category = itemCategory.value;
    const unit = itemUnit.value.trim();
    const stock = Number(itemStock.value);
    const minimum = Number(itemMinimum.value);
    const expiry = categoryHasExpiry(category) ? itemExpiry.value : "";
    const unitCost = Number(itemUnitCost.value);

    if (!name) {
      showInventoryMessage("Please enter the item name.", "error");
      return;
    }

    if (!category) {
      showInventoryMessage("Please select a category.", "error");
      return;
    }

    if (!unit) {
      showInventoryMessage("Please enter the unit.", "error");
      return;
    }

    if (Number.isNaN(stock) || stock < 0) {
      showInventoryMessage("Current stock cannot be negative.", "error");
      return;
    }

    if (Number.isNaN(minimum) || minimum < 0) {
      showInventoryMessage("Minimum stock cannot be negative.", "error");
      return;
    }

    if (Number.isNaN(unitCost) || unitCost < 0) {
      showInventoryMessage("Unit cost cannot be negative.", "error");
      return;
    }

    const items = getItems();
    const existingId = itemId.value;

    if (existingId) {
      const index = items.findIndex(
        (item) => String(item.id) === String(existingId),
      );

      if (index !== -1) {
        items[index] = {
          ...items[index],
          name,
          category,
          unit,
          stock,
          minimum,
          expiry,
          unitCost,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      const normalizedName = normalizeDentalItemName(name);
      const normalizedCategory = normalizeDentalItemName(category);
      const normalizedUnit = normalizeDentalItemName(unit);

      const duplicateItem = items.find(
        (item) =>
          normalizeDentalItemName(item.name) === normalizedName &&
          normalizeDentalItemName(item.category) === normalizedCategory &&
          normalizeDentalItemName(item.unit) === normalizedUnit,
      );

      if (duplicateItem) {
        showInventoryMessage(
          `"${duplicateItem.name}" already exists as ${duplicateItem.id}. Use Stock Movement to add or deduct stock.`,
          "error",
        );
        return;
      }

      items.push({
        name,
        category,
        unit,
        stock: 0,
        minimum,
        expiry,
        unitCost,
        createdAt: new Date().toISOString(),
      });
    }

    try {
      const currentIndex = existingId
        ? items.findIndex((item) => String(item.id) === String(existingId))
        : items.length - 1;

      if (currentIndex === -1) {
        throw new Error("Inventory item could not be found.");
      }

      const itemToSave = {
        ...items[currentIndex],
        name,
        category,
        unit,
        stock,
        minimum,
        expiry,
        unitCost,
      };

      if (existingId) {
        itemToSave.databaseId = existingId;
      }

      const savedItem = await saveInventoryItemToBackend(itemToSave);

      if (!savedItem) {
        throw new Error("The server did not return the saved inventory item.");
      }

      items[currentIndex] = {
        ...items[currentIndex],
        ...savedItem,
        databaseId: savedItem.id,
        id: savedItem.id,
        name: savedItem.name,
        category: savedItem.category,
        unit: savedItem.unit,
        stock: Number(savedItem.stock) || 0,
        minimum: Number(savedItem.minimum) || 0,
        expiry: savedItem.expiry || "",
        unitCost: Number(savedItem.unitCost ?? savedItem.unit_cost) || 0,
      };

      backendInventoryItems = items;
      window.dentanueva_inventory_items = backendInventoryItems;

      inventoryCurrentPage = 1;
      renderAll();

      if (inventoryCurrentSection === 2) {
        window.refreshInventoryForecast?.();
        window.refreshDemandForecast?.();
      }

      closeItemModal();

      if (existingId) {
        showInventoryMessage("Inventory item updated successfully.");
      } else {
        showInventoryMessage("Inventory item added successfully.");
      }
    } catch (error) {
      console.error("Unable to save inventory item:", error);
      showInventoryMessage(
        error.message || "Unable to save inventory item.",
        "error",
      );
    }
  });

  function openMovementModal(selectedItemId = "") {
    closeActionMenu();
    movementForm.reset();
    movementType.value = "stock-in";
    movementQuantity.value = "1";
    populateMovementItems(selectedItemId);

    if (selectedItemId) {
      movementItem.value = selectedItemId;
    }

    movementModal.classList.add("active");
    movementModal.setAttribute("aria-hidden", "false");

    setTimeout(() => {
      movementItem.focus();
    }, 100);
  }

  function closeMovementModal() {
    movementModal.classList.remove("active");
    movementModal.setAttribute("aria-hidden", "true");
  }

  function populateMovementItems(selectedItemId = "") {
    const items = getItems();

    movementItem.innerHTML = '<option value="">Select item</option>';

    const itemsToShow = selectedItemId
      ? items.filter((item) => String(item.id) === String(selectedItemId))
      : [...items].sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        );

    itemsToShow.forEach((item) => {
      const option = document.createElement("option");

      option.value = item.id;
      option.textContent = `${item.name} — ${item.stock} ${item.unit}`;

      movementItem.appendChild(option);
    });

    if (selectedItemId && itemsToShow.length > 0) {
      movementItem.value = selectedItemId;
    }
  }

  movementForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const selectedId = movementItem.value;
    const type = movementType.value;
    const quantity = Number(movementQuantity.value);
    const reason = movementReason.value.trim();

    if (!selectedId) {
      showInventoryMessage("Please select an inventory item.", "error");
      return;
    }

    if (Number.isNaN(quantity) || quantity <= 0) {
      showInventoryMessage("Please enter a valid quantity.", "error");
      return;
    }
    const items = getItems();

    const itemIndex = items.findIndex(
      (item) => String(item.id) === String(selectedId),
    );

    if (itemIndex === -1) {
      showInventoryMessage(
        "The selected inventory item could not be found.",
        "error",
      );
      return;
    }

    const item = items[itemIndex];
    const previousStock = Number(item.stock) || 0;
    let newStock = previousStock;

    if (type === "stock-in") {
      newStock = previousStock + quantity;
    }

    if (type === "stock-out") {
      if (quantity > previousStock) {
        showInventoryMessage(
          `Insufficient stock. Available: ${previousStock} ${item.unit}. Requested: ${quantity} ${item.unit}.`,
          "error",
        );
        return;
      }

      newStock = previousStock - quantity;
    }

    item.stock = newStock;
    item.updatedAt = new Date().toISOString();

    const movementPayload = {
      action: "record_movement",
      item_id: item.id,
      itemId: item.id,
      movement_type: type,
      type,
      quantity,
      unit: item.unit,
      previous_stock: previousStock,
      previousStock,
      new_stock: newStock,
      newStock,
      reason:
        reason ||
        (type === "stock-in" ? "Stock replenishment" : "Inventory usage"),
    };

    const movementResponse = await fetch("../../api/inventory.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(movementPayload),
    });

    const movementResult = await movementResponse.json();

    if (!movementResponse.ok || !movementResult?.success) {
      throw new Error(
        movementResult?.message || "Unable to record inventory movement.",
      );
    }

    await loadInventoryFromBackend();
    inventoryCurrentPage = 1;
    renderAll();

    if (inventoryCurrentSection === 2) {
      window.refreshInventoryForecast?.();
      window.refreshDemandForecast?.();
    }

    closeMovementModal();

    if (type === "stock-in") {
      showInventoryMessage(`${quantity} ${item.unit} added to ${item.name}.`);
    } else {
      showInventoryMessage(
        `${quantity} ${item.unit} deducted from ${item.name}.`,
      );
    }
  });

  function openActionMenu(button, id) {
    selectedActionItemId = id;

    const rect = button.getBoundingClientRect();

    actionMenu.classList.add("active");

    const menuWidth = actionMenu.offsetWidth;
    const menuHeight = actionMenu.offsetHeight;

    let left = rect.right - menuWidth;
    let top = rect.bottom + 6;

    if (left < 8) {
      left = 8;
    }

    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }

    if (top + menuHeight > window.innerHeight - 8) {
      top = rect.top - menuHeight - 6;
    }

    actionMenu.style.left = `${left}px`;
    actionMenu.style.top = `${top}px`;
  }

  function closeActionMenu() {
    actionMenu.classList.remove("active");
    selectedActionItemId = null;
  }

  function formatItemDateTime(value) {
    if (!value) {
      return "Not recorded";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Not recorded";
    }

    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getMovementLabel(type) {
    return type === "stock-in" ? "Stock In" : "Stock Out";
  }

  function getMovementQuantityPrefix(type) {
    return type === "stock-in" ? "+" : "-";
  }

  function getMovementTimestamp(movement, item) {
    return movement.createdAt || movement.date || item.updatedAt || "";
  }

  function openItemViewModal(item) {
    closeActionMenu();

    if (!viewItemModal || !viewItemDetails) {
      return;
    }

    const movements = getMovements()
      .filter((movement) => String(movement.itemId) === String(item.id))
      .sort((a, b) => {
        const aTime = new Date(getMovementTimestamp(a, item)).getTime();
        const bTime = new Date(getMovementTimestamp(b, item)).getTime();

        return bTime - aTime;
      });

    const status = getStockStatus(item);
    const expiryStatus = getExpiryStatus(item);
    const statusText = getStatusLabel(status);

    let expiryText = "No Expiry";

    if (expiryStatus === "expired") {
      expiryText = "Expired";
    } else if (expiryStatus === "expiring-soon") {
      expiryText = "Expiring Soon";

      if (item.expiry) {
        const expiryDate = new Date(`${item.expiry}T00:00:00`);

        if (!Number.isNaN(expiryDate.getTime())) {
          expiryText = `${expiryDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })} · Expiring Soon`;
        }
      }
    } else if (expiryStatus === "normal" && item.expiry) {
      const expiryDate = new Date(`${item.expiry}T00:00:00`);

      if (!Number.isNaN(expiryDate.getTime())) {
        expiryText = expiryDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    }

    const historyHTML = movements.length
      ? movements
          .map((movement) => {
            const typeClass =
              movement.type === "stock-in" ? "stock-in" : "stock-out";

            const quantityText = `${getMovementQuantityPrefix(movement.type)}${
              Number(movement.quantity) || 0
            } ${escapeHTML(item.unit)}`;

            const reason =
              movement.reason ||
              (movement.type === "stock-in"
                ? "Stock replenishment"
                : "Inventory usage");

            return `
                <div class="item-history-entry">
                  <div class="item-history-marker ${typeClass}">
                    <i class="fa-solid ${
                      movement.type === "stock-in"
                        ? "fa-arrow-up"
                        : "fa-arrow-down"
                    }"></i>
                  </div>
                  <div class="item-history-content">
                    <div class="item-history-topline">
                      <strong>
                        ${escapeHTML(getMovementLabel(movement.type))}
                      </strong>
                      <span>
                        ${escapeHTML(
                          formatItemDateTime(
                            getMovementTimestamp(movement, item),
                          ),
                        )}
                      </span>
                    </div>
                    <div class="item-history-quantity ${typeClass}">
                      ${quantityText}
                    </div>
                    <div class="item-history-reason">
                      ${escapeHTML(reason)}
                    </div>
                    <div class="item-history-stock">
                      Stock:
                      ${Number(movement.previousStock) || 0}
                      →
                      ${Number(movement.newStock) || 0}
                    </div>
                  </div>
                </div>
              `;
          })
          .join("")
      : `
            <div class="item-history-empty">
              <div class="item-history-empty-icon">
                <i class="fa-solid fa-clock-rotate-left"></i>
              </div>
              <strong>
                No stock movement history
              </strong>
              <p>
                Stock movements for this item will appear here.
              </p>
            </div>
          `;

    viewItemDetails.innerHTML = `
        <div class="view-item-hero">
          <div class="view-item-avatar">
            <i class="fa-solid fa-box"></i>
          </div>

          <div class="view-item-hero-content">
            <span class="view-item-id">
              ${escapeHTML(item.id)}
            </span>

            <h4>
              ${escapeHTML(item.name)}
            </h4>

            <span class="view-item-category">
              ${escapeHTML(item.category)}
            </span>
          </div>

          <span class="status-badge status-${status}">
            ${escapeHTML(statusText)}
          </span>
        </div>

        <div class="view-item-section">
          <div class="view-item-section-heading">
            <div>
              <span class="modal-eyebrow">
                CURRENT INFORMATION
              </span>

              <h4>
                Item Details
              </h4>
            </div>
          </div>

          <div class="view-item-details-grid">
            <div class="view-item-detail">
              <span>
                Current Stock
              </span>

              <strong>
                ${Number(item.stock) || 0}
                ${escapeHTML(item.unit)}
              </strong>
            </div>

            <div class="view-item-detail">
              <span>
                Minimum Stock
              </span>

              <strong>
                ${Number(item.minimum) || 0}
                ${escapeHTML(item.unit)}
              </strong>
            </div>

            <div class="view-item-detail">
              <span>
                Unit
              </span>

              <strong>
                ${escapeHTML(item.unit)}
              </strong>
            </div>

            <div class="view-item-detail">
              <span>
                Expiry
              </span>

              <strong>
                ${escapeHTML(expiryText)}
              </strong>
            </div>

            <div class="view-item-detail">
              <span>
                Created
              </span>

              <strong>
                ${escapeHTML(formatItemDateTime(item.createdAt))}
              </strong>
            </div>

            <div class="view-item-detail">
              <span>
                Last Updated
              </span>

              <strong>
                ${escapeHTML(
                  formatItemDateTime(item.updatedAt || item.createdAt),
                )}
              </strong>
            </div>
          </div>
        </div>

        <div class="view-item-section">
          <div class="view-item-section-heading history-heading">
            <div>
              <span class="modal-eyebrow">
                STOCK MOVEMENTS
              </span>

              <h4>
                Movement History
              </h4>
            </div>

            <span class="view-item-history-count">
              ${movements.length}
              ${movements.length === 1 ? "record" : "records"}
            </span>
          </div>

          <div class="item-history-list">
            ${historyHTML}
          </div>
        </div>
      `;

    viewItemModal.classList.add("active");
    viewItemModal.setAttribute("aria-hidden", "false");
  }

  function closeItemViewModal() {
    if (!viewItemModal) {
      return;
    }

    viewItemModal.classList.remove("active");
    viewItemModal.setAttribute("aria-hidden", "true");
  }
  function openDeleteItemModal(item) {
    closeActionMenu();

    if (!deleteItemModal) {
      return;
    }

    selectedDeleteItemId = item.id;

    if (deleteItemMessage) {
      deleteItemMessage.textContent = `"${item.name}" will be permanently deleted if it has no recorded inventory or treatment history. Items with existing history cannot be deleted.`;
    }

    deleteItemModal.classList.add("active");
    deleteItemModal.setAttribute("aria-hidden", "false");
  }

  function closeDeleteItemModal() {
    if (!deleteItemModal) {
      return;
    }

    deleteItemModal.classList.remove("active");
    deleteItemModal.setAttribute("aria-hidden", "true");
    selectedDeleteItemId = null;
  }

  async function confirmDeleteItem() {
    if (!selectedDeleteItemId) {
      return;
    }

    const items = getItems();

    const item = items.find(
      (inventoryItem) =>
        String(inventoryItem.id) === String(selectedDeleteItemId),
    );

    if (!item) {
      closeDeleteItemModal();

      showInventoryMessage(
        "The selected inventory item could not be found.",
        "error",
      );

      return;
    }

    try {
      const response = await fetch("../../api/inventory.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "delete_item",
          id: selectedDeleteItemId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Unable to delete inventory item.");
      }

      await loadInventoryFromBackend();
    } catch (error) {
      console.error("Unable to delete inventory item:", error);

      showInventoryMessage(
        error.message || "Unable to delete inventory item.",
        "error",
      );

      return;
    }

    closeDeleteItemModal();

    inventoryCurrentPage = 1;
    renderAll();

    if (inventoryCurrentSection === 2) {
      window.refreshInventoryForecast?.();
      window.refreshDemandForecast?.();
    }

    showInventoryMessage(`"${item.name}" was deleted successfully.`);
  }

  actionMenu.addEventListener("click", (event) => {
    const button = event.target.closest("button");

    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const id = selectedActionItemId;

    if (!id) {
      return;
    }

    const items = getItems();

    const item = items.find(
      (inventoryItem) => String(inventoryItem.id) === String(id),
    );

    if (!item) {
      closeActionMenu();
      return;
    }

    if (action === "view") {
      openItemViewModal(item);
      return;
    }

    if (action === "edit") {
      openItemModal(item);
      return;
    }

    if (action === "movement") {
      openMovementModal(id);
      return;
    }

    if (action === "delete") {
      openDeleteItemModal(item);
    }
  });

  inventoryTableBody.addEventListener("click", (event) => {
    const button = event.target.closest(".action-button");

    if (!button) {
      return;
    }

    const id = button.dataset.itemId;

    openActionMenu(button, id);
  });

  inventorySearch.addEventListener("input", () => {
    inventoryCurrentPage = 1;
    renderInventoryTable();
  });

  categoryFilter.addEventListener("change", () => {
    inventoryCurrentPage = 1;
    renderInventoryTable();
  });

  statusFilter.addEventListener("change", () => {
    inventoryCurrentPage = 1;
    renderInventoryTable();
  });

  if (expiryFilter) {
    expiryFilter.addEventListener("change", () => {
      inventoryCurrentPage = 1;
      renderInventoryTable();
    });
  }

  sortFilter.addEventListener("change", () => {
    inventoryCurrentPage = 1;
    renderInventoryTable();
  });

  itemCategory.addEventListener("change", updateExpiryFieldState);

  inventoryPrevPageBtn?.addEventListener("click", () => {
    if (inventoryCurrentPage > 1) {
      inventoryCurrentPage--;
      renderInventoryTable();
    }
  });

  inventoryNextPageBtn?.addEventListener("click", () => {
    const filteredItems = getFilteredItems();

    const totalPages = Math.max(
      Math.ceil(filteredItems.length / INVENTORY_PAGE_SIZE),
      1,
    );

    if (inventoryCurrentPage < totalPages) {
      inventoryCurrentPage++;
      renderInventoryTable();
    }
  });

  addItemBtn.addEventListener("click", () => {
    openItemModal();
  });

  emptyAddItemBtn.addEventListener("click", () => {
    openItemModal();
  });

  exportInventoryCsvBtn?.addEventListener("click", exportInventoryToCsv);

  stockMovementBtn.addEventListener("click", () => {
    openMovementModal();
  });

  itemModalClose.addEventListener("click", closeItemModal);

  itemCancelBtn.addEventListener("click", closeItemModal);

  movementModalClose.addEventListener("click", closeMovementModal);

  movementCancelBtn.addEventListener("click", closeMovementModal);

  deleteItemCancelBtn?.addEventListener("click", closeDeleteItemModal);

  deleteItemConfirmBtn?.addEventListener("click", confirmDeleteItem);

  viewItemModalClose?.addEventListener("click", closeItemViewModal);

  viewItemCloseBtn?.addEventListener("click", closeItemViewModal);

  itemModal.addEventListener("click", (event) => {
    if (event.target === itemModal) {
      closeItemModal();
    }
  });

  movementModal.addEventListener("click", (event) => {
    if (event.target === movementModal) {
      closeMovementModal();
    }
  });

  deleteItemModal?.addEventListener("click", (event) => {
    if (event.target === deleteItemModal) {
      closeDeleteItemModal();
    }
  });

  viewItemModal?.addEventListener("click", (event) => {
    if (event.target === viewItemModal) {
      closeItemViewModal();
    }
  });

  document.addEventListener("click", (event) => {
    if (
      actionMenu.classList.contains("active") &&
      !event.target.closest(".action-menu") &&
      !event.target.closest(".action-button")
    ) {
      closeActionMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    closeItemModal();
    closeMovementModal();
    closeDeleteItemModal();
    closeItemViewModal();
    closeActionMenu();
  });

  window.addEventListener("resize", () => {
    closeActionMenu();
  });

  function renderAll() {
    renderCategoryFilter();
    renderInventoryTable();
    updateStatistics();
    populateMovementItems();
  }
  await loadInventoryFromBackend();
  await loadDemandForecast();
  showInventorySection(inventoryCurrentSection);
  renderAll();
});
