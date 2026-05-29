const STORAGE_DATA_KEY = "vinted_stocks_data_v1";
const STORAGE_SESSION_KEY = "vinted_stocks_session_v1";
const DEFAULT_LOW_THRESHOLD = 3;
const DEFAULT_SYNC_PATH = "vinted-stocks/shared/products";
const SELLER_ANTHONY = "anthony";
const SELLER_JULIEN = "julien";
const SELLER_BOTH = "both";

const USERS = {
  anthony: {
    username: "anthony",
    displayName: "Anthony",
    badgeClass: "seller-anthony"
  },
  julien: {
    username: "julien",
    displayName: "Julien",
    badgeClass: "seller-julien"
  }
};

const state = {
  products: [],
  user: null,
  search: "",
  sellerFilter: "all",
  excludeAnthony: false,
  excludeJulien: false,
  stockZeroMode: "all",
  lowOnly: false,
  sort: "updatedDesc",
  sync: {
    mode: "local",
    ready: false,
    error: "",
    firebaseRef: null
  }
};

const refs = {
  loginView: document.getElementById("loginView"),
  dashboardView: document.getElementById("dashboardView"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  sessionBadge: document.getElementById("sessionBadge"),
  syncBadge: document.getElementById("syncBadge"),
  logoutBtn: document.getElementById("logoutBtn"),
  addProductForm: document.getElementById("addProductForm"),
  searchInput: document.getElementById("searchInput"),
  sellerFilter: document.getElementById("sellerFilter"),
  excludeAnthony: document.getElementById("excludeAnthony"),
  excludeJulien: document.getElementById("excludeJulien"),
  stockZeroFilter: document.getElementById("stockZeroFilter"),
  lowOnly: document.getElementById("lowOnly"),
  sortSelect: document.getElementById("sortSelect"),
  productsBody: document.getElementById("productsBody"),
  emptyState: document.getElementById("emptyState"),
  statusMessage: document.getElementById("statusMessage"),
  statProducts: document.getElementById("statProducts"),
  statAvailable: document.getElementById("statAvailable"),
  statLow: document.getElementById("statLow"),
  statListed: document.getElementById("statListed")
};

void init();

async function init() {
  state.products = loadProductsFromCache();
  bindEvents();
  restoreSession();
  render();
  await setupSync();
}

function bindEvents() {
  refs.loginForm.addEventListener("submit", handleLogin);
  refs.logoutBtn.addEventListener("click", handleLogout);
  refs.addProductForm.addEventListener("submit", handleAddProduct);

  refs.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderTable();
  });

  refs.sellerFilter.addEventListener("change", (event) => {
    state.sellerFilter = event.target.value;
    renderTable();
  });

  refs.excludeAnthony.addEventListener("change", (event) => {
    state.excludeAnthony = event.target.checked;
    renderTable();
  });

  refs.excludeJulien.addEventListener("change", (event) => {
    state.excludeJulien = event.target.checked;
    renderTable();
  });

  refs.stockZeroFilter.addEventListener("change", (event) => {
    state.stockZeroMode = event.target.value;
    renderTable();
  });

  refs.lowOnly.addEventListener("change", (event) => {
    state.lowOnly = event.target.checked;
    renderTable();
  });

  refs.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderTable();
  });

  refs.productsBody.addEventListener("submit", (event) => {
    void handleTableSubmit(event);
  });

  refs.productsBody.addEventListener("click", (event) => {
    void handleTableClick(event);
  });
}

function restoreSession() {
  const saved = localStorage.getItem(STORAGE_SESSION_KEY);
  if (!saved) {
    return;
  }

  if (USERS[saved]) {
    state.user = USERS[saved];
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();

  const user = USERS[username];

  if (!user) {
    refs.loginError.textContent = "Utilisateur inconnu (utilise anthony ou julien).";
    refs.loginError.classList.remove("hidden");
    return;
  }

  if (!window.APP_CONFIG || !window.APP_CONFIG.users) {
    refs.loginError.textContent = "Config absente: verifie le fichier config.js.";
    refs.loginError.classList.remove("hidden");
    return;
  }

  const expectedHash = getPasswordHashForUser(username);

  if (!expectedHash) {
    refs.loginError.textContent = `Hash manquant pour ${username}: complete config.js puis redeploie.`;
    refs.loginError.classList.remove("hidden");
    return;
  }

  if (!isValidSha256Hex(expectedHash)) {
    refs.loginError.textContent = "Configuration mot de passe invalide.";
    refs.loginError.classList.remove("hidden");
    return;
  }

  let submittedHash = "";
  try {
    submittedHash = await sha256Hex(password);
  } catch {
    refs.loginError.textContent = "Impossible de verifier le mot de passe sur ce navigateur.";
    refs.loginError.classList.remove("hidden");
    return;
  }

  if (submittedHash !== expectedHash) {
    refs.loginError.textContent = "Identifiants invalides.";
    refs.loginError.classList.remove("hidden");
    return;
  }

  state.user = user;
  localStorage.setItem(STORAGE_SESSION_KEY, user.username);
  refs.loginError.classList.add("hidden");
  refs.loginForm.reset();
  render();
}

function handleLogout() {
  state.user = null;
  localStorage.removeItem(STORAGE_SESSION_KEY);
  render();
}

async function handleAddProduct(event) {
  event.preventDefault();

  if (!state.user) {
    return;
  }

  const form = event.currentTarget;
  const formData = new FormData(form);

  const name = String(formData.get("name") || "").trim();
  const totalStock = Math.max(0, Number(formData.get("totalStock") || 0));
  const listedQuantity = Math.max(0, Number(formData.get("listedQuantity") || 0));
  const listedBy = normalizeListedByValue(String(formData.get("listedBy") || "").trim().toLowerCase());
  const lowThreshold = Math.max(0, Number(formData.get("lowThreshold") || DEFAULT_LOW_THRESHOLD));
  const articleLink = String(formData.get("articleLink") || "").trim();
  const photoUrl = String(formData.get("photoUrl") || "").trim();
  const photoFile = formData.get("photoFile");

  if (!name) {
    showStatus("Le nom du produit est obligatoire.", "error");
    return;
  }

  if (listedQuantity > totalStock) {
    showStatus("La quantite en vente ne peut pas depasser le stock total.", "error");
    return;
  }

  if (listedQuantity > 0 && !listedBy) {
    showStatus("Choisis Anthony, Julien ou Nous deux pour un article en vente.", "error");
    return;
  }

  if (articleLink && !isValidHttpUrl(articleLink)) {
    showStatus("Le lien article doit commencer par http:// ou https://.", "error");
    return;
  }

  let photo = photoUrl;

  if (photoFile instanceof File && photoFile.size > 0) {
    try {
      photo = await fileToDataUrl(photoFile);
    } catch {
      showStatus("Impossible de lire la photo importee.", "error");
      return;
    }
  }

  const now = new Date().toISOString();

  const product = {
    id: makeId(),
    name,
    totalStock,
    listedQuantity,
    listedBy: listedQuantity > 0 ? listedBy : "",
    lowThreshold,
    articleLink,
    photo,
    createdBy: state.user.username,
    createdAt: now,
    updatedAt: now
  };

  state.products.unshift(product);
  persistProductsCache();
  await syncUpsertProduct(product);

  form.reset();
  form.elements.totalStock.value = "0";
  form.elements.listedQuantity.value = "0";
  form.elements.lowThreshold.value = String(DEFAULT_LOW_THRESHOLD);
  showStatus("Produit ajoute.", "info");
  render();
}

async function handleTableSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const productId = form.dataset.id;
  const action = form.dataset.action;

  if (!productId || !action) {
    return;
  }

  const product = state.products.find((item) => item.id === productId);

  if (!product) {
    showStatus("Produit introuvable.", "error");
    return;
  }

  if (action === "addStock") {
    const quantityInput = form.querySelector("input[name='stockToAdd']");
    const quantity = Math.max(0, Number(quantityInput?.value || 0));

    if (quantity <= 0) {
      showStatus("La quantite a ajouter doit etre > 0.", "error");
      return;
    }

    product.totalStock += quantity;
    product.updatedAt = new Date().toISOString();
    persistProductsCache();
    await syncUpsertProduct(product);
    showStatus(`Stock ajoute (+${quantity}) pour ${product.name}.`, "info");
    render();
    return;
  }

  if (action === "updateSale") {
    const seller = normalizeListedByValue(String(form.querySelector("select[name='saleSeller']")?.value || "").trim().toLowerCase());
    const listedQuantity = Math.max(0, Number(form.querySelector("input[name='saleQty']")?.value || 0));

    if (listedQuantity > product.totalStock) {
      showStatus("La quantite en vente depasse le stock total.", "error");
      return;
    }

    if (listedQuantity > 0 && !seller) {
      showStatus("Choisis Anthony, Julien ou Nous deux pour la mise en vente.", "error");
      return;
    }

    product.listedQuantity = listedQuantity;
    product.listedBy = listedQuantity > 0 ? seller : "";
    product.updatedAt = new Date().toISOString();
    persistProductsCache();
    await syncUpsertProduct(product);
    showStatus(`Mise en vente mise a jour pour ${product.name}.`, "info");
    render();
  }
}

async function handleTableClick(event) {
  const button = event.target.closest("button[data-action='delete']");
  if (!button) {
    return;
  }

  const productId = button.dataset.id;

  const product = state.products.find((item) => item.id === productId);
  if (!product) {
    return;
  }

  const confirmed = window.confirm(`Supprimer ${product.name} ?`);
  if (!confirmed) {
    return;
  }

  state.products = state.products.filter((item) => item.id !== productId);
  persistProductsCache();
  await syncDeleteProduct(productId);
  showStatus(`Produit supprime: ${product.name}.`, "info");
  render();
}

function render() {
  const isLogged = Boolean(state.user);

  refs.loginView.classList.toggle("hidden", isLogged);
  refs.dashboardView.classList.toggle("hidden", !isLogged);

  if (!isLogged) {
    return;
  }

  refs.sessionBadge.textContent = state.user.displayName;
  refs.sessionBadge.className = `seller-badge ${state.user.badgeClass}`;

  renderSyncBadge();
  renderStats();
  renderTable();
}

function renderSyncBadge() {
  if (!refs.syncBadge) {
    return;
  }

  if (state.sync.mode !== "firebase") {
    refs.syncBadge.textContent = "Sync local";
    refs.syncBadge.className = "sync-badge sync-local";
    return;
  }

  if (state.sync.error) {
    refs.syncBadge.textContent = "Sync erreur";
    refs.syncBadge.className = "sync-badge sync-error";
    return;
  }

  if (!state.sync.ready) {
    refs.syncBadge.textContent = "Sync...";
    refs.syncBadge.className = "sync-badge sync-pending";
    return;
  }

  refs.syncBadge.textContent = "Sync partage";
  refs.syncBadge.className = "sync-badge sync-ok";
}

function renderStats() {
  const totalProducts = state.products.length;
  const totalAvailable = state.products.reduce((sum, product) => sum + getAvailableStock(product), 0);
  const totalLow = state.products.filter((product) => isLowStock(product)).length;
  const totalListed = state.products.reduce((sum, product) => sum + Number(product.listedQuantity || 0), 0);

  refs.statProducts.textContent = String(totalProducts);
  refs.statAvailable.textContent = String(totalAvailable);
  refs.statLow.textContent = String(totalLow);
  refs.statListed.textContent = String(totalListed);
}

function renderTable() {
  const products = getVisibleProducts();

  refs.emptyState.classList.toggle("hidden", products.length > 0);

  refs.productsBody.innerHTML = products
    .map((product) => {
      const availableStock = getAvailableStock(product);
      const outOfStockClass = availableStock === 0 ? "out-of-stock-row" : "";
      const availableClass = isLowStock(product) ? "stock-low-value" : "";
      const sellerBadge = renderSellerBadge(product.listedBy);
      const photoCell = product.photo
        ? `<img class="product-photo" src="${escapeHtml(product.photo)}" alt="Photo ${escapeHtml(product.name)}">`
        : '<div class="no-photo">Pas photo</div>';

      const articleCell = product.articleLink
        ? `<a href="${escapeHtml(product.articleLink)}" target="_blank" rel="noopener noreferrer">Ouvrir</a>`
        : "-";

      return `
        <tr class="${outOfStockClass}">
          <td>${photoCell}</td>
          <td>
            <strong>${escapeHtml(product.name)}</strong><br>
            <small>Ajoute par ${escapeHtml(product.createdBy || "-")}</small>
          </td>
          <td>${sellerBadge}</td>
          <td>${product.totalStock}</td>
          <td>${product.listedQuantity}</td>
          <td class="${availableClass}">${availableStock}</td>
          <td>${product.lowThreshold}</td>
          <td>${articleCell}</td>
          <td>
            <div class="actions">
              <form class="inline-form" data-action="addStock" data-id="${product.id}">
                <input class="tiny" type="number" min="1" name="stockToAdd" value="1" required>
                <button class="btn btn-main btn-small" type="submit">+ Stock</button>
              </form>

              <form class="inline-form" data-action="updateSale" data-id="${product.id}">
                <select name="saleSeller">
                  <option value="" ${product.listedBy ? "" : "selected"}>Personne</option>
                  <option value="anthony" ${product.listedBy === "anthony" ? "selected" : ""}>Anthony</option>
                  <option value="julien" ${product.listedBy === "julien" ? "selected" : ""}>Julien</option>
                  <option value="both" ${product.listedBy === "both" ? "selected" : ""}>Nous deux</option>
                </select>
                <input class="tiny" type="number" min="0" name="saleQty" value="${product.listedQuantity}" required>
                <button class="btn btn-outline btn-small" type="submit">Maj vente</button>
              </form>

              <button class="btn btn-danger btn-small" type="button" data-action="delete" data-id="${product.id}">Supprimer</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function getVisibleProducts() {
  const filtered = state.products.filter((product) => {
    const haystack = `${product.name} ${product.articleLink} ${getSellerSearchTokens(product.listedBy)}`.toLowerCase();

    const matchesSearch = !state.search || haystack.includes(state.search);
    const matchesSeller = listedByMatchesFilter(product.listedBy, state.sellerFilter);
    const matchesExclusion = !isSellerExcluded(product.listedBy);
    const matchesStockZero = matchesStockZeroMode(product, state.stockZeroMode);
    const matchesLow = !state.lowOnly || isLowStock(product);

    return matchesSearch && matchesSeller && matchesExclusion && matchesStockZero && matchesLow;
  });

  filtered.sort((a, b) => compareProducts(a, b, state.sort));
  return filtered;
}

function compareProducts(a, b, sort) {
  if (sort === "nameAsc") {
    return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  }

  if (sort === "availableAsc") {
    return getAvailableStock(a) - getAvailableStock(b);
  }

  if (sort === "availableDesc") {
    return getAvailableStock(b) - getAvailableStock(a);
  }

  if (sort === "listedDesc") {
    return b.listedQuantity - a.listedQuantity;
  }

  return String(b.updatedAt).localeCompare(String(a.updatedAt));
}

function getAvailableStock(product) {
  const total = Math.max(0, Number(product.totalStock || 0));
  const listed = Math.max(0, Number(product.listedQuantity || 0));
  return Math.max(total - listed, 0);
}

function isLowStock(product) {
  return getAvailableStock(product) <= Number(product.lowThreshold || DEFAULT_LOW_THRESHOLD);
}

function renderSellerBadge(sellerKey) {
  if (sellerKey === SELLER_BOTH) {
    return '<div class="seller-badges"><span class="seller-badge seller-anthony">Anthony</span><span class="seller-badge seller-julien">Julien</span></div>';
  }

  if (sellerKey === SELLER_ANTHONY) {
    return '<span class="seller-badge seller-anthony">Anthony</span>';
  }

  if (sellerKey === SELLER_JULIEN) {
    return '<span class="seller-badge seller-julien">Julien</span>';
  }

  return '<span class="seller-badge seller-none">Personne</span>';
}

function normalizeProductsFromRemote(raw) {
  if (!raw) {
    return [];
  }

  const source = Array.isArray(raw) ? raw : Object.values(raw);
  return source.map(normalizeProduct).filter(Boolean);
}

function loadProductsFromCache() {
  const raw = localStorage.getItem(STORAGE_DATA_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeProduct).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeProduct(rawProduct) {
  if (!rawProduct || typeof rawProduct !== "object") {
    return null;
  }

  const totalStock = Math.max(0, Number(rawProduct.totalStock || 0));
  const listedQuantity = Math.max(0, Number(rawProduct.listedQuantity || 0));

  return {
    id: String(rawProduct.id || makeId()),
    name: String(rawProduct.name || "Produit sans nom").trim(),
    totalStock,
    listedQuantity: Math.min(listedQuantity, totalStock),
    listedBy: normalizeListedByValue(rawProduct.listedBy),
    lowThreshold: Math.max(0, Number(rawProduct.lowThreshold || DEFAULT_LOW_THRESHOLD)),
    articleLink: String(rawProduct.articleLink || "").trim(),
    photo: String(rawProduct.photo || "").trim(),
    createdBy: String(rawProduct.createdBy || "").trim(),
    createdAt: String(rawProduct.createdAt || new Date().toISOString()),
    updatedAt: String(rawProduct.updatedAt || rawProduct.createdAt || new Date().toISOString())
  };
}

function normalizeListedByValue(value) {
  if (value === SELLER_ANTHONY || value === SELLER_JULIEN || value === SELLER_BOTH) {
    return value;
  }

  if (Array.isArray(value)) {
    const normalizedValues = value.map((item) => String(item).trim().toLowerCase());
    const hasAnthony = normalizedValues.includes(SELLER_ANTHONY);
    const hasJulien = normalizedValues.includes(SELLER_JULIEN);
    if (hasAnthony && hasJulien) {
      return SELLER_BOTH;
    }
    if (hasAnthony) {
      return SELLER_ANTHONY;
    }
    if (hasJulien) {
      return SELLER_JULIEN;
    }
    return "";
  }

  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === SELLER_ANTHONY) {
      return SELLER_ANTHONY;
    }
    if (lower === SELLER_JULIEN) {
      return SELLER_JULIEN;
    }
    if (lower === SELLER_BOTH || lower === "nous deux") {
      return SELLER_BOTH;
    }
    if (lower === `${SELLER_ANTHONY},${SELLER_JULIEN}` || lower === `${SELLER_JULIEN},${SELLER_ANTHONY}`) {
      return SELLER_BOTH;
    }
    if (lower === `${SELLER_ANTHONY} ${SELLER_JULIEN}` || lower === `${SELLER_JULIEN} ${SELLER_ANTHONY}`) {
      return SELLER_BOTH;
    }
  }

  return "";
}

function getSellerSearchTokens(listedBy) {
  if (listedBy === SELLER_BOTH) {
    return `${SELLER_ANTHONY} ${SELLER_JULIEN} nous deux`;
  }
  if (listedBy === SELLER_ANTHONY || listedBy === SELLER_JULIEN) {
    return listedBy;
  }
  return "";
}

function listedByMatchesFilter(listedBy, filterValue) {
  if (filterValue === "all") {
    return true;
  }

  if (filterValue === SELLER_BOTH) {
    return listedBy === SELLER_BOTH;
  }

  if (filterValue === SELLER_ANTHONY) {
    return listedBy === SELLER_ANTHONY || listedBy === SELLER_BOTH;
  }

  if (filterValue === SELLER_JULIEN) {
    return listedBy === SELLER_JULIEN || listedBy === SELLER_BOTH;
  }

  return listedBy === filterValue;
}

function isSellerExcluded(listedBy) {
  const includesAnthony = listedBy === SELLER_ANTHONY || listedBy === SELLER_BOTH;
  const includesJulien = listedBy === SELLER_JULIEN || listedBy === SELLER_BOTH;

  if (state.excludeAnthony && includesAnthony) {
    return true;
  }

  if (state.excludeJulien && includesJulien) {
    return true;
  }

  return false;
}

function matchesStockZeroMode(product, mode) {
  const isZero = getAvailableStock(product) === 0;

  if (mode === "onlyZero") {
    return isZero;
  }

  if (mode === "hideZero") {
    return !isZero;
  }

  return true;
}

function persistProductsCache() {
  localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(state.products));
}

function getSyncConfig() {
  const sync = window.APP_CONFIG && window.APP_CONFIG.sync ? window.APP_CONFIG.sync : null;
  if (!sync || sync.provider !== "firebase" || !sync.enabled) {
    return { enabled: false };
  }

  return {
    enabled: true,
    path: String(sync.path || DEFAULT_SYNC_PATH),
    firebase: sync.firebase || {}
  };
}

function isFirebaseConfigValid(firebaseConfig) {
  if (!firebaseConfig || typeof firebaseConfig !== "object") {
    return false;
  }

  const requiredKeys = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];
  return requiredKeys.every((key) => typeof firebaseConfig[key] === "string" && firebaseConfig[key].trim().length > 0);
}

function sanitizeSyncPath(path) {
  const clean = String(path || DEFAULT_SYNC_PATH).trim().replace(/^\/+|\/+$/g, "");
  return clean || DEFAULT_SYNC_PATH;
}

function toRemoteProductMap(products) {
  const entries = products.map((product) => [product.id, product]);
  return Object.fromEntries(entries);
}

async function setupSync() {
  const syncConfig = getSyncConfig();

  if (!syncConfig.enabled) {
    state.sync.mode = "local";
    state.sync.ready = true;
    state.sync.error = "";
    renderSyncBadge();
    return;
  }

  if (!window.firebase || !window.firebase.database) {
    state.sync.mode = "local";
    state.sync.ready = false;
    state.sync.error = "firebase_sdk_missing";
    renderSyncBadge();
    showStatus("Sync cloud indisponible: SDK Firebase non charge.", "error");
    return;
  }

  if (!isFirebaseConfigValid(syncConfig.firebase)) {
    state.sync.mode = "local";
    state.sync.ready = false;
    state.sync.error = "firebase_config_invalid";
    renderSyncBadge();
    showStatus("Sync cloud desactive: configuration Firebase incomplete.", "error");
    return;
  }

  try {
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(syncConfig.firebase);
    }

    const db = window.firebase.database();
    const ref = db.ref(sanitizeSyncPath(syncConfig.path));

    state.sync.mode = "firebase";
    state.sync.ready = false;
    state.sync.error = "";
    state.sync.firebaseRef = ref;
    renderSyncBadge();

    const snapshot = await ref.once("value");

    if (!snapshot.exists()) {
      if (state.products.length > 0) {
        await ref.set(toRemoteProductMap(state.products));
      } else {
        await ref.set({});
      }
    } else {
      state.products = normalizeProductsFromRemote(snapshot.val());
      persistProductsCache();
      render();
    }

    ref.on(
      "value",
      (liveSnapshot) => {
        state.products = normalizeProductsFromRemote(liveSnapshot.val());
        persistProductsCache();
        state.sync.ready = true;
        state.sync.error = "";
        render();
      },
      () => {
        state.sync.ready = false;
        state.sync.error = "firebase_read_failed";
        renderSyncBadge();
        showStatus("Sync cloud en erreur: lecture impossible.", "error");
      }
    );

    state.sync.ready = true;
    state.sync.error = "";
    renderSyncBadge();
  } catch {
    state.sync.mode = "local";
    state.sync.ready = false;
    state.sync.error = "firebase_init_failed";
    state.sync.firebaseRef = null;
    renderSyncBadge();
    showStatus("Sync cloud en erreur: verifie la config Firebase.", "error");
  }
}

async function syncUpsertProduct(product) {
  if (state.sync.mode !== "firebase" || !state.sync.firebaseRef) {
    return;
  }

  try {
    await state.sync.firebaseRef.child(product.id).set(product);
    state.sync.error = "";
    state.sync.ready = true;
    renderSyncBadge();
  } catch {
    state.sync.ready = false;
    state.sync.error = "firebase_write_failed";
    renderSyncBadge();
    showStatus("Sync cloud en erreur: ecriture impossible.", "error");
  }
}

async function syncDeleteProduct(productId) {
  if (state.sync.mode !== "firebase" || !state.sync.firebaseRef) {
    return;
  }

  try {
    await state.sync.firebaseRef.child(productId).remove();
    state.sync.error = "";
    state.sync.ready = true;
    renderSyncBadge();
  } catch {
    state.sync.ready = false;
    state.sync.error = "firebase_delete_failed";
    renderSyncBadge();
    showStatus("Sync cloud en erreur: suppression impossible.", "error");
  }
}

function showStatus(message, kind) {
  refs.statusMessage.textContent = message;
  refs.statusMessage.className = `message ${kind}`;
  refs.statusMessage.classList.remove("hidden");

  window.clearTimeout(showStatus.timeoutId);
  showStatus.timeoutId = window.setTimeout(() => {
    refs.statusMessage.classList.add("hidden");
  }, 3500);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("file_read_error"));
    reader.readAsDataURL(file);
  });
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidHttpUrl(text) {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getPasswordHashForUser(username) {
  const configUsers = window.APP_CONFIG && window.APP_CONFIG.users ? window.APP_CONFIG.users : {};
  const hash = configUsers[username] && typeof configUsers[username].passwordHash === "string"
    ? configUsers[username].passwordHash.trim().toLowerCase()
    : "";
  return hash;
}

function isValidSha256Hex(value) {
  return /^[a-f0-9]{64}$/.test(value);
}

async function sha256Hex(value) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error("crypto_subtle_unavailable");
  }

  const input = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", input);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
