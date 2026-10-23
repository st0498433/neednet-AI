const SUPABASE_URL = "https://ziwjldaafcfzamlmmeew.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_pN_ztbpn8-ol5jKxgeJlFA_1x_dLbr3";

if (!window.supabase) {
  alert("Supabase library missing. Check the script tags in index.html.");
  throw new Error("Supabase library not loaded.");
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let inventory = [];
let hospitals = [];
let requests = [];

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function normalizeHospital(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bhospital\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveHospitalName(value) {
  const normalized = normalizeHospital(value);

  return hospitals.find(
    (hospital) => normalizeHospital(hospital.name) === normalized
  )?.name || null;
}

function normalizeItem(value) {
  const item = String(value || "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (item.includes("glove")) return "surgical gloves";
  if (item.includes("mask")) return "face masks";
  if (item.includes("gauze")) return "gauze packs";

  return item;
}

function hospitalNameFor(id) {
  const hospital = hospitals.find(
    (entry) => String(entry.id) === String(id)
  );

  return hospital ? hospital.name : `Unknown hospital (ID: ${id})`;
}

function getSurplus(entry) {
  return Math.max(
    0,
    (Number(entry.stock) || 0) - (Number(entry.reserve) || 0)
  );
}

// Populate hospital and item dropdowns using Supabase records.
function populateRequestDropdowns() {
  const hospitalSelect = $("hospitalInput");
  const itemSelect = $("itemInput");

  if (hospitalSelect) {
    const previousHospital = hospitalSelect.value;

    hospitalSelect.innerHTML =
      '<option value="">Select a registered hospital</option>';

    hospitals.forEach((hospital) => {
      const option = document.createElement("option");
      option.value = hospital.name;
      option.textContent = hospital.name;
      hospitalSelect.appendChild(option);
    });

    if (hospitals.some((h) => h.name === previousHospital)) {
      hospitalSelect.value = previousHospital;
    }

    hospitalSelect.disabled = hospitals.length === 0;

    if (hospitals.length === 0) {
      hospitalSelect.innerHTML =
        '<option value="">No registered hospitals found</option>';
    }
  }

  if (itemSelect) {
    const previousItem = itemSelect.value;

    // Only offer items recorded in the inventory table.
    // Keep one canonical database item for each normalized item.
    const uniqueItems = new Map();

    inventory.forEach((entry) => {
      const item = String(entry.item || "").trim();
      if (!item) return;

      const key = normalizeItem(item);

      if (key && !uniqueItems.has(key)) {
        uniqueItems.set(key, item);
      }
    });

    itemSelect.innerHTML =
      '<option value="">Select a medical item</option>';

    [...uniqueItems.values()].sort().forEach((item) => {
      const option = document.createElement("option");
      option.value = item;
      option.textContent = item;
      itemSelect.appendChild(option);
    });

    if ([...uniqueItems.values()].includes(previousItem)) {
      itemSelect.value = previousItem;
    }

    itemSelect.disabled = uniqueItems.size === 0;

    if (uniqueItems.size === 0) {
      itemSelect.innerHTML =
        '<option value="">No inventory items found</option>';
    }
  }
}

function renderInventory() {
  const body = $("inventoryBody");

  if (body) {
    if (!inventory.length) {
      body.innerHTML =
        '<tr><td colspan="4">No inventory records found.</td></tr>';
    } else {
      body.innerHTML = inventory.map((entry) => {
        const stock = Number(entry.stock) || 0;
        const surplus = getSurplus(entry);

        const status = surplus > 0
          ? '<span class="badge good">Available</span>'
          : '<span class="badge warning">Reserve only</span>';

        return `
          <tr>
            <td>${escapeHTML(entry.item)}</td>
            <td>${escapeHTML(hospitalNameFor(entry.hospital_id))}</td>
            <td>${stock} units</td>
            <td>${status}</td>
          </tr>
        `;
      }).join("");
    }
  }

  if ($("hospitalCount")) {
    $("hospitalCount").textContent = hospitals.length;
  }

  if ($("requestCount")) {
    $("requestCount").textContent = requests.length;
  }

  if ($("surplusCount")) {
    const total = inventory.reduce(
      (sum, entry) => sum + getSurplus(entry),
      0
    );

    $("surplusCount").textContent = total.toLocaleString();
  }

  if ($("transferCount")) {
    $("transferCount").textContent = "0";
  }
}

function renderRequests() {
  const list = $("requestList");
  if (!list) return;

  if (!requests.length) {
    list.innerHTML = "<p>No supply requests yet.</p>";
  } else {
    list.innerHTML = requests.map((request) => `
      <div class="request-row">
        <div class="request-mark normal">+</div>
        <div class="request-info">
          <strong>${escapeHTML(request.item)}</strong>
          <small>
            ${escapeHTML(request.hospital)} ·
            ${Number(request.quantity) || 0} units needed
          </small>
        </div>
        <span class="badge info">Supply request</span>
      </div>
    `).join("");
  }

  if ($("requestCount")) {
    $("requestCount").textContent = requests.length;
  }
}

async function loadInventory() {
  const [inventoryResult, hospitalsResult] = await Promise.all([
    supabaseClient.from("inventory").select("*"),
    supabaseClient.from("hospitals").select("id,name,city")
  ]);

  if (inventoryResult.error) throw inventoryResult.error;
  if (hospitalsResult.error) throw hospitalsResult.error;

  inventory = inventoryResult.data || [];
  hospitals = hospitalsResult.data || [];

  populateRequestDropdowns();
  renderInventory();
}

async function loadRequests() {
  const { data, error } = await supabaseClient
    .from("requests")
    .select("*")
    .order("id", { ascending: false });

  if (error) throw error;

  requests = data || [];

  renderRequests();
  renderInventory();
}

async function refreshDatabaseData() {
  await loadInventory();
  await loadRequests();
}

// Show/hide request form
if ($("showRequestForm") && $("requestForm")) {
  $("showRequestForm").addEventListener("click", () => {
    const form = $("requestForm");
    form.classList.toggle("hidden");

    $("showRequestForm").textContent =
      form.classList.contains("hidden")
        ? "+ Create supply request"
        : "- Close request form";
  });
}

// Save a request using only registered hospitals and inventory items.
if ($("requestForm")) {
  $("requestForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const selectedHospital = $("hospitalInput").value;
    const selectedItem = $("itemInput").value;
    const quantity = Number($("quantityInput").value);

    if (
      !selectedHospital ||
      !selectedItem ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      alert("Please select a hospital, select an item and enter a valid quantity.");
      return;
    }

    // Validate selections against the records currently loaded from Supabase.
    const hospitalName = resolveHospitalName(selectedHospital);

    if (!hospitalName) {
      alert("Invalid hospital. Please select a registered hospital.");
      return;
    }

    const validItem = inventory.some(
      (entry) => entry.item === selectedItem
    );

    if (!validItem) {
      alert("Invalid medical item. Please select an inventory item.");
      return;
    }

    const button = $("requestForm").querySelector(
      'button[type="submit"]'
    );

    if (button) {
      button.disabled = true;
      button.textContent = "Submitting...";
    }

    try {
      const { error } = await supabaseClient
        .from("requests")
        .insert([{
          hospital: hospitalName,
          item: selectedItem,
          quantity: quantity
        }]);

      if (error) throw error;

      await loadRequests();

      $("requestForm").reset();
      $("requestForm").classList.add("hidden");

      if ($("showRequestForm")) {
        $("showRequestForm").textContent = "+ Create supply request";
      }

      alert("Supply request successfully saved!");
    } catch (error) {
      console.error("Request save error:", error);
      alert("Request save nahi hui: " + error.message);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Submit Supply Request";
      }
    }
  });
}

// Ask Gemini to explain a possible database-based match.
async function getNeedNetAIAnalysis(
  request,
  donor,
  surplus,
  suggestedQuantity
) {
  const button = $("neednetAiButton");
  const output = $("neednetAiResult");

  if (!button || !output) return;

  button.disabled = true;
  button.textContent = "AI is analysing...";
  output.classList.remove("hidden");
  output.textContent = "Gemini is preparing the analysis...";

  try {
    const response = await fetch("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestingHospital: request.hospital,
        donorHospital: hospitalNameFor(donor.hospital_id),
        item: donor.item,
        quantity: suggestedQuantity,
        availableSurplus: surplus
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "AI analysis request failed.");
    }

    output.innerHTML = `
      <h3>NeedNet AI Decision Support</h3>
      <p>${escapeHTML(data.analysis || "No analysis was returned.")}</p>
      <p><strong>Important:</strong> This is decision support only.
      A human coordinator must verify stock, expiry, storage,
      transport and hospital authorization before any transfer.</p>
    `;
  } catch (error) {
    console.error("NeedNet AI error:", error);

    output.textContent =
      "AI analysis failed: " + error.message +
      ". Check that your Gemini server is running on port 3000 " +
      "and has the /api/analyze endpoint.";
  } finally {
    button.disabled = false;
    button.textContent = "Get AI Analysis";
  }
}

// Match the latest saved request against available inventory.
if ($("reviewMatch")) {
  $("reviewMatch").addEventListener("click", async () => {
    const result = $("matchResult");
    if (!result) return;

    result.classList.remove("hidden");
    result.textContent = "Checking saved requests and inventory...";

    try {
      await refreshDatabaseData();

      if (!requests.length) {
        result.textContent = "No saved supply requests found.";
        return;
      }

      const request = requests[0];
      const requestedItem = normalizeItem(request.item);
      const recipientName = normalizeHospital(request.hospital);
      const requestedQuantity = Number(request.quantity) || 0;

      const matchingInventory = inventory.filter((entry) => {
        const donorName = normalizeHospital(
          hospitalNameFor(entry.hospital_id)
        );

        return normalizeItem(entry.item) === requestedItem &&
          donorName !== recipientName &&
          getSurplus(entry) > 0;
      });

      matchingInventory.sort(
        (a, b) => getSurplus(b) - getSurplus(a)
      );

      result.innerHTML = `
        <strong>Latest request checked</strong><br>
        Recipient: ${escapeHTML(request.hospital)}<br>
        Item: ${escapeHTML(request.item)}<br>
        Requested quantity: ${requestedQuantity} units<br><br>
      `;

      if (!matchingInventory.length) {
        result.innerHTML += `
          <strong>No matching donor found.</strong><br>
          No other hospital has a matching item with recorded stock
          above its reserve. Check the inventory records and hospital IDs.
        `;
        return;
      }

      const donor = matchingInventory[0];
      const surplus = getSurplus(donor);
      const suggestedQuantity = Math.min(surplus, requestedQuantity);

      result.innerHTML += `
        <strong>Potential donor match</strong><br>
        Donor: ${escapeHTML(hospitalNameFor(donor.hospital_id))}<br>
        Recipient: ${escapeHTML(request.hospital)}<br>
        Item: ${escapeHTML(donor.item)}<br>
        Available above reserve: ${surplus} units<br>
        Suggested quantity: ${suggestedQuantity} units<br><br>
        <strong>Status: Awaiting human coordinator approval.</strong><br>
        This is a suggested match, not a confirmed transfer.
        Verify all details before acting.<br><br>
        <button id="neednetAiButton" type="button">Get AI Analysis</button>
        <div id="neednetAiResult" class="hidden"></div>
      `;

      $("neednetAiButton").addEventListener("click", () => {
        getNeedNetAIAnalysis(
          request,
          donor,
          surplus,
          suggestedQuantity
        );
      });
    } catch (error) {
      console.error("Review Match error:", error);
      result.textContent = "Database check failed: " + error.message;
    }
  });
}

// Supplier-delay simulation
if ($("simulateBtn")) {
  $("simulateBtn").addEventListener("click", async () => {
    const result = $("recoveryResult");
    if (!result) return;

    result.classList.remove("hidden");
    result.textContent = "Checking inventory for the simulation...";

    try {
      await refreshDatabaseData();

      const greenValley = hospitals.find(
        (entry) => normalizeHospital(entry.name) === "green valley"
      );

      if (!greenValley) {
        result.textContent =
          "Green Valley was not found in the hospitals table.";
        return;
      }

      const greenValleyMasks = inventory.find(
        (entry) =>
          String(entry.hospital_id) === String(greenValley.id) &&
          normalizeItem(entry.item) === "face masks"
      );

      const donors = inventory.filter((entry) =>
        normalizeItem(entry.item) === "face masks" &&
        String(entry.hospital_id) !== String(greenValley.id) &&
        getSurplus(entry) > 0
      );

      const stock = greenValleyMasks
        ? Number(greenValleyMasks.stock) || 0
        : 0;

      result.innerHTML = `
        <h3>Supplier-delay simulation</h3>
        <p><strong>Scenario:</strong> Green Valley's face-mask delivery is delayed.</p>
        <p><strong>Recorded stock:</strong> ${stock} units.</p>
        <p><strong>Example demand:</strong> 200 units.</p>
        <p><strong>Illustrative shortfall:</strong> ${Math.max(0, 200 - stock)} units.</p>
        <p><strong>Potential donor records:</strong> ${donors.length}.</p>
        <ul>
          <li>Verify current stock and expected usage.</li>
          <li>Check expiry and storage requirements.</li>
          <li>Obtain coordinator approval.</li>
          <li>Confirm the supplier's revised delivery estimate.</li>
        </ul>
        <p><strong>AI status:</strong> This is a rule-based simulation,
        not an AI prediction.</p>
      `;

      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      console.error("Simulation error:", error);
      result.textContent = "Simulation failed: " + error.message;
    }
  });
}

// Initial database load
async function initializeDashboard() {
  try {
    await refreshDatabaseData();
  } catch (error) {
    console.error("Dashboard loading error:", error);
    alert("Database data load nahi hua: " + error.message);
  }
}

initializeDashboard();
