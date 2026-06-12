const STORAGE_DATA_KEY = "vinted_stocks_data_v1";
const STORAGE_SESSION_KEY = "vinted_stocks_session_v1";
const STORAGE_API_TOKEN_KEY = "vinted_stocks_api_token_v1";
const DEFAULT_LOW_THRESHOLD = 3;
const DEFAULT_API_POLL_INTERVAL_MS = 12000;
const SELLER_ANTHONY = "anthony";
const SELLER_JULIEN = "julien";
const SELLER_COMPTE_PRO = "compte-pro";
const SELLER_BOTH = "both";
const SELLER_KEYS = [SELLER_ANTHONY, SELLER_JULIEN, SELLER_COMPTE_PRO];

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
  },
  "compte-pro": {
    username: "compte-pro",
    displayName: "Compte pro",
    badgeClass: "seller-compte-pro"
  }
};

const state = {
  products: [],
  user: null,
  view: "home",
  selectedProductId: null,
  selectedImageIndex: 0,
  editingProductId: null,
  apiToken: "",
  search: "",
  sellerFilter: "all",
  excludeAnthony: false,
  excludeJulien: false,
  excludeComptePro: false,
  stockZeroMode: "all",
  lowOnly: false,
  sort: "updatedDesc",
  sync: {
    mode: "local",
    ready: false,
    error: "",
    apiBaseUrl: "",
    pollTimerId: null
  }
};

const refs = {
  loginView: document.getElementById("loginView"),
  dashboardView: document.getElementById("dashboardView"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  sessionBadge: document.getElementById("sessionBadge"),
  syncBadge: document.getElementById("syncBadge"),
  manualSyncBtn: document.getElementById("manualSyncBtn"),
  goAddBtn: document.getElementById("goAddBtn"),
  homeView: document.getElementById("homeView"),
  addView: document.getElementById("addView"),
  detailView: document.getElementById("detailView"),
  detailBody: document.getElementById("detailBody"),
  backHomeFromAdd: document.getElementById("backHomeFromAdd"),
  logoutBtn: document.getElementById("logoutBtn"),
  addProductForm: document.getElementById("addProductForm"),
  searchInput: document.getElementById("searchInput"),
  sellerFilter: document.getElementById("sellerFilter"),
  excludeAnthony: document.getElementById("excludeAnthony"),
  excludeJulien: document.getElementById("excludeJulien"),
  excludeComptePro: document.getElementById("excludeComptePro"),
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
  refs.goAddBtn.addEventListener("click", () => {
    showView("add");
  });
  refs.backHomeFromAdd.addEventListener("click", () => {
    showView("home");
  });
  refs.manualSyncBtn.addEventListener("click", () => {
    void manualSyncProducts();
  });
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

  refs.excludeComptePro.addEventListener("change", (event) => {
    state.excludeComptePro = event.target.checked;
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

  refs.productsBody.addEventListener("click", (event) => {
    void handleTableClick(event);
  });

  refs.detailBody.addEventListener("submit", (event) => {
    void handleDetailSubmit(event);
  });

  refs.detailBody.addEventListener("click", (event) => {
    void handleDetailClick(event);
  });
}

function restoreSession() {
  const saved = localStorage.getItem(STORAGE_SESSION_KEY);
  if (!saved) {
    return;
  }

  const username = normalizeUsername(saved);
  if (USERS[username]) {
    state.user = USERS[username];
    state.apiToken = localStorage.getItem(STORAGE_API_TOKEN_KEY) || "";
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const username = normalizeUsername(formData.get("username"));
  const password = String(formData.get("password") || "").trim();

  const user = USERS[username];

  if (!user) {
    refs.loginError.textContent = "Utilisateur inconnu (utilise anthony, julien ou compte pro).";
    refs.loginError.classList.remove("hidden");
    return;
  }

  if (isApiSyncEnabled()) {
    try {
      const token = await apiLogin(username, password);
      state.user = user;
      state.apiToken = token;
      localStorage.setItem(STORAGE_SESSION_KEY, user.username);
      localStorage.setItem(STORAGE_API_TOKEN_KEY, token);
      refs.loginError.classList.add("hidden");
      refs.loginForm.reset();
      await setupSync();
      render();
      return;
    } catch (error) {
      refs.loginError.textContent = error.message || "Connexion API impossible.";
      refs.loginError.classList.remove("hidden");
      return;
    }
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
  state.apiToken = "";
  localStorage.removeItem(STORAGE_SESSION_KEY);
  localStorage.removeItem(STORAGE_API_TOKEN_KEY);
  stopApiPolling();
  render();
}

function showView(view, productId = null) {
  state.view = view;
  state.selectedProductId = productId;
  state.selectedImageIndex = 0;
  state.editingProductId = null;
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
  const listedBy = normalizeListedByValue(formData.getAll("listedBy"));
  const lowThreshold = Math.max(0, Number(formData.get("lowThreshold") || DEFAULT_LOW_THRESHOLD));
  const articleLink = String(formData.get("articleLink") || "").trim();
  let images = [];

  try {
    images = await collectImagesFromForm(formData, "imageUrls", "imageFiles");
  } catch {
    return;
  }

  if (!name) {
    showStatus("Le nom du produit est obligatoire.", "error");
    return;
  }

  if (listedQuantity > totalStock) {
    showStatus("La quantite en vente ne peut pas depasser le stock total.", "error");
    return;
  }

  if (listedQuantity > 0 && !listedBy) {
    showStatus("Choisis au moins une personne pour un article en vente.", "error");
    return;
  }

  if (articleLink && !isValidHttpUrl(articleLink)) {
    showStatus("Le lien article doit commencer par http:// ou https://.", "error");
    return;
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
    photo: images[0] || "",
    images,
    saleHistory: [],
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
  showView("home");
}

async function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const productId = button.dataset.id;

  if (action === "adjustStock") {
    const delta = Number(button.dataset.delta || 0);
    await adjustProductStock(productId, delta);
    return;
  }

  if (action === "soldItem") {
    await markProductSold(productId);
    return;
  }

  if (action === "edit") {
    showView("detail", productId);
    return;
  }

  if (action === "cancelEdit") {
    state.editingProductId = null;
    renderTable();
    return;
  }

  if (action !== "delete") {
    return;
  }

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

async function handleDetailSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const productId = form.dataset.id;
  const action = form.dataset.action;
  const product = state.products.find((item) => item.id === productId);

  if (!product) {
    showStatus("Produit introuvable.", "error");
    return;
  }

  if (action === "saveDetailProduct") {
    const updatedProduct = await buildDetailProductUpdate(product, form);
    if (!updatedProduct) {
      return;
    }

    Object.assign(product, updatedProduct, {
      id: product.id,
      createdBy: product.createdBy,
      createdAt: product.createdAt,
      updatedAt: new Date().toISOString()
    });

    persistProductsCache();
    await syncUpsertProduct(product);
    showStatus(`Article modifie: ${product.name}.`, "info");
    render();
    return;
  }

  if (action === "recordSale") {
    const salePriceInput = form.querySelector("input[name='salePrice']")?.value || "";
    const soldBy = normalizeSoldByValue(form.querySelector("select[name='soldBy']")?.value || "");
    const salePrice = salePriceInput.trim() ? parseSalePrice(salePriceInput) : null;

    if (!soldBy) {
      showStatus("Choisis qui a vendu l'article.", "error");
      return;
    }

    if (salePriceInput.trim() && salePrice === null) {
      showStatus("Indique un prix de vente valide.", "error");
      return;
    }

    await markProductSold(product.id, salePrice, soldBy);
  }
}

async function handleDetailClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;

  if (action === "backHome") {
    showView("home");
    return;
  }

  if (action === "selectImage") {
    state.selectedImageIndex = Number(button.dataset.index || 0);
    renderDetailView();
    return;
  }

  if (action === "adjustStock") {
    await adjustProductStock(button.dataset.id, Number(button.dataset.delta || 0));
  }
}

async function buildDetailProductUpdate(product, form) {
  const formData = new FormData(form);
  const name = String(formData.get("detailName") || "").trim();
  const totalStock = Math.max(0, Number(formData.get("detailTotalStock") || 0));
  const listedQuantity = Math.max(0, Number(formData.get("detailListedQuantity") || 0));
  const listedBy = normalizeListedByValue(formData.getAll("detailListedBy"));
  const lowThreshold = Math.max(0, Number(formData.get("detailLowThreshold") || DEFAULT_LOW_THRESHOLD));
  const articleLink = String(formData.get("detailArticleLink") || "").trim();
  let newImages = [];

  try {
    newImages = await collectImagesFromForm(formData, "detailImageUrls", "detailImageFiles");
  } catch {
    return null;
  }

  const images = newImages.length > 0
    ? [...new Set([...getProductImages(product), ...newImages])]
    : getProductImages(product);

  if (!name) {
    showStatus("Le nom du produit est obligatoire.", "error");
    return null;
  }

  if (listedQuantity > totalStock) {
    showStatus("La quantite en vente ne peut pas depasser le stock total.", "error");
    return null;
  }

  if (listedQuantity > 0 && !listedBy) {
    showStatus("Choisis au moins une personne pour la mise en vente.", "error");
    return null;
  }

  if (articleLink && !isValidHttpUrl(articleLink)) {
    showStatus("Le lien article doit commencer par http:// ou https://.", "error");
    return null;
  }

  return {
    name,
    totalStock,
    listedQuantity,
    listedBy: listedQuantity > 0 ? listedBy : "",
    lowThreshold,
    articleLink,
    images,
    photo: images[0] || ""
  };
}

async function adjustProductStock(productId, delta) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) {
    showStatus("Produit introuvable.", "error");
    return;
  }

  if (delta !== 1) {
    return;
  }

  const nextTotalStock = product.totalStock + delta;

  product.totalStock = nextTotalStock;
  product.updatedAt = new Date().toISOString();
  persistProductsCache();
  await syncUpsertProduct(product);
  showStatus(`Stock ajoute pour ${product.name}.`, "info");
  render();
}

async function markProductSold(productId, salePrice = null, soldByValue = "") {
  const product = state.products.find((item) => item.id === productId);
  if (!product) {
    showStatus("Produit introuvable.", "error");
    return;
  }

  if (product.listedQuantity <= 0) {
    showStatus("Aucun article en vente a marquer comme vendu.", "error");
    return;
  }

  const soldBy = normalizeSoldByValue(soldByValue) || requestSoldBy();
  if (!soldBy) {
    return;
  }

  product.listedQuantity -= 1;
  product.listedBy = removeSellerTagAfterSale(product.listedBy, soldBy, product.listedQuantity);
  if (salePrice !== null) {
    product.saleHistory = Array.isArray(product.saleHistory) ? product.saleHistory : [];
    product.saleHistory.unshift({
      price: salePrice,
      soldBy,
      soldAt: new Date().toISOString()
    });
  }
  product.updatedAt = new Date().toISOString();
  persistProductsCache();
  await syncUpsertProduct(product);
  showStatus(`Vendu par ${getSellerDisplayName(soldBy)}: 1 retire de la quantite en vente pour ${product.name}.`, "info");
  render();
}

function requestSoldBy() {
  const availableSellers = [SELLER_ANTHONY, SELLER_JULIEN, SELLER_COMPTE_PRO];
  const defaultSeller = availableSellers[0];
  const sellerChoices = availableSellers.map(getSellerDisplayName).join(" ou ");
  const answer = window.prompt(
    `Qui l'a vendu ? Tape ${sellerChoices}.`,
    getSellerDisplayName(defaultSeller)
  );

  if (answer === null) {
    return "";
  }

  const soldBy = normalizeSoldByValue(answer);

  if (!soldBy) {
    showStatus("Choisis Anthony, Julien ou Compte pro.", "error");
    return "";
  }

  return soldBy;
}

function getDefaultSoldBy(product) {
  const listedSellers = getListedSellers(product.listedBy);
  const currentUsername = normalizeUsername(state.user && state.user.username);

  if (listedSellers.includes(currentUsername)) {
    return currentUsername;
  }

  if (listedSellers.length > 0) {
    return listedSellers[0];
  }

  if (currentUsername === SELLER_ANTHONY || currentUsername === SELLER_JULIEN || currentUsername === SELLER_COMPTE_PRO) {
    return currentUsername;
  }

  return SELLER_ANTHONY;
}

function normalizeSoldByValue(value) {
  const normalized = normalizeUsername(value);
  if (normalized === SELLER_ANTHONY || normalized === "a") {
    return SELLER_ANTHONY;
  }
  if (normalized === SELLER_JULIEN || normalized === "j") {
    return SELLER_JULIEN;
  }
  if (normalized === SELLER_COMPTE_PRO || normalized === "c" || normalized === "cp" || normalized === "pro") {
    return SELLER_COMPTE_PRO;
  }
  return "";
}

function getListedSellers(listedBy) {
  return normalizeListedSellers(listedBy);
}

function removeSellerTagAfterSale(listedBy, soldBy, remainingListedQuantity) {
  if (remainingListedQuantity <= 0) {
    return "";
  }

  const nextSellers = getListedSellers(listedBy).filter((seller) => seller !== soldBy);
  return normalizeListedByValue(nextSellers);
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
  renderCurrentView();
}

function renderCurrentView() {
  refs.homeView.classList.toggle("hidden", state.view !== "home");
  refs.addView.classList.toggle("hidden", state.view !== "add");
  refs.detailView.classList.toggle("hidden", state.view !== "detail");

  if (state.view === "home") {
    renderTable();
  }

  if (state.view === "detail") {
    renderDetailView();
  }
}

function renderSyncBadge() {
  if (!refs.syncBadge) {
    return;
  }

  renderManualSyncButton();

  if (state.sync.error) {
    refs.syncBadge.textContent = "Sync erreur";
    refs.syncBadge.className = "sync-badge sync-error";
    return;
  }

  if (!isCloudSyncMode()) {
    refs.syncBadge.textContent = "Sync local";
    refs.syncBadge.className = "sync-badge sync-local";
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

function renderManualSyncButton() {
  if (!refs.manualSyncBtn) {
    return;
  }

  if (isCloudSyncMode()) {
    refs.manualSyncBtn.textContent = "Pousser stock";
    refs.manualSyncBtn.title = "Forcer l'envoi de tout le stock vers la base cloud.";
    return;
  }

  if (state.sync.error) {
    refs.manualSyncBtn.textContent = "Voir erreur sync";
    refs.manualSyncBtn.title = getSyncErrorMessage(state.sync.error);
    return;
  }

  refs.manualSyncBtn.textContent = "Sync non configuree";
  refs.manualSyncBtn.title = "Configure API_BASE_URL pour synchroniser le stock entre les appareils.";
}

function getSyncErrorMessage(errorCode) {
  const messages = {
    api_config_invalid: "Configuration API incomplete. Verifie API_BASE_URL.",
    api_auth_missing: "Connexion API manquante. Deconnecte-toi puis reconnecte-toi.",
    api_login_failed: "Connexion API refusee. Verifie l'utilisateur et le mot de passe.",
    api_read_failed: "Lecture API impossible. Verifie l'API Netlify.",
    api_write_failed: "Ecriture API impossible. Verifie l'API Netlify.",
    api_delete_failed: "Suppression API impossible. Verifie l'API Netlify.",
    api_manual_push_failed: "Push manuel API impossible. Verifie l'API Netlify."
  };

  return messages[errorCode] || "Erreur de sync cloud.";
}

function isCloudSyncMode() {
  return state.sync.mode === "api";
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
      const productImages = getProductImages(product);
      const coverImage = productImages[0] || "";
      const photoCell = coverImage
        ? `<img class="product-photo" src="${escapeHtml(coverImage)}" alt="Photo ${escapeHtml(product.name)}">`
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
              <button class="btn btn-outline btn-small" type="button" data-action="edit" data-id="${product.id}">Modifier</button>
              <button class="btn btn-danger btn-small" type="button" data-action="delete" data-id="${product.id}">Supprimer</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderDetailView() {
  const product = state.products.find((item) => item.id === state.selectedProductId);

  if (!product) {
    refs.detailBody.innerHTML = `
      <section class="panel page-heading">
        <div>
          <h3>Article introuvable</h3>
          <p class="subtitle">Il a peut-etre ete supprime.</p>
        </div>
        <button class="btn btn-outline" type="button" data-action="backHome">Retour</button>
      </section>
    `;
    return;
  }

  const images = getProductImages(product);
  const activeIndex = Math.min(state.selectedImageIndex, Math.max(images.length - 1, 0));
  const activeImage = images[activeIndex] || "";
  const listedSellers = getListedSellers(product.listedBy);
  const defaultSoldBy = getDefaultSoldBy(product);

  refs.detailBody.innerHTML = `
    <section class="panel page-heading">
      <div>
        <h3>${escapeHtml(product.name)}</h3>
        <p class="subtitle">Gestion complete de l'article</p>
      </div>
      <button class="btn btn-outline" type="button" data-action="backHome">Retour</button>
    </section>

    <section class="product-detail-shell">
      <div class="detail-gallery panel">
        <div class="detail-thumbs">
          ${images.length > 0 ? images.map((image, index) => `
            <button class="detail-thumb ${index === activeIndex ? "active" : ""}" type="button" data-action="selectImage" data-index="${index}">
              <img src="${escapeHtml(image)}" alt="Image ${index + 1} ${escapeHtml(product.name)}">
            </button>
          `).join("") : '<div class="no-photo large">Pas image</div>'}
        </div>
        <div class="detail-main-image">
          ${activeImage ? `<img src="${escapeHtml(activeImage)}" alt="Image principale ${escapeHtml(product.name)}">` : '<div class="no-photo large">Pas image</div>'}
        </div>
      </div>

      <aside class="detail-side panel">
        <form class="detail-product-form" data-action="saveDetailProduct" data-id="${product.id}">
          <label>
            Produit
            <input name="detailName" type="text" value="${escapeHtml(product.name)}" required>
          </label>
          <div class="detail-number-grid">
            <label>
              Stock total
              <input name="detailTotalStock" type="number" min="0" value="${product.totalStock}" required>
            </label>
            <label>
              En vente
              <input name="detailListedQuantity" type="number" min="0" value="${product.listedQuantity}" required>
            </label>
          </div>
          <fieldset class="seller-picker">
            <legend>Mis en vente par</legend>
            <div class="seller-checkboxes">
              ${renderSellerCheckbox("detailListedBy", SELLER_ANTHONY, listedSellers)}
              ${renderSellerCheckbox("detailListedBy", SELLER_JULIEN, listedSellers)}
              ${renderSellerCheckbox("detailListedBy", SELLER_COMPTE_PRO, listedSellers)}
            </div>
          </fieldset>
          <label>
            Seuil stock bas
            <input name="detailLowThreshold" type="number" min="0" value="${product.lowThreshold}" required>
          </label>
          <label>
            Lien Vinted
            <input name="detailArticleLink" type="url" value="${escapeHtml(product.articleLink)}" placeholder="https://www.vinted.fr/...">
          </label>
          <label>
            Ajouter images URL
            <textarea name="detailImageUrls" rows="3" placeholder="https://image-1...&#10;https://image-2..."></textarea>
          </label>
          <label>
            Ajouter images fichier
            <input name="detailImageFiles" type="file" accept="image/*" multiple>
          </label>
          <button class="btn btn-main" type="submit">Enregistrer les modifications</button>
        </form>

        <div class="stock-manager">
          <div class="stock-manager-grid">
            <article>
              <span>Dispo</span>
              <strong class="${isLowStock(product) ? "stock-low-value" : ""}">${getAvailableStock(product)}</strong>
            </article>
            <article>
              <span>En vente</span>
              <strong>${product.listedQuantity}</strong>
            </article>
          </div>
          <button class="btn btn-main" type="button" data-action="adjustStock" data-delta="1" data-id="${product.id}">+ Stock</button>
        </div>

        <form class="sale-form" data-action="recordSale" data-id="${product.id}">
          <label>
            Vendu par
            <select name="soldBy" required>
              <option value="anthony" ${defaultSoldBy === SELLER_ANTHONY ? "selected" : ""}>Anthony</option>
              <option value="julien" ${defaultSoldBy === SELLER_JULIEN ? "selected" : ""}>Julien</option>
              <option value="compte-pro" ${defaultSoldBy === SELLER_COMPTE_PRO ? "selected" : ""}>Compte pro</option>
            </select>
          </label>
          <label>
            Prix de vente
            <input name="salePrice" type="number" min="0" step="0.01" placeholder="Optionnel">
          </label>
          <button class="btn btn-outline" type="submit" ${product.listedQuantity <= 0 ? "disabled" : ""}>Vendu</button>
        </form>
      </aside>
    </section>

    <section class="panel price-history-panel">
      <h3>Historique des prix vendus</h3>
      ${renderSaleHistory(product)}
    </section>
  `;
}

function renderSaleHistory(product) {
  const history = Array.isArray(product.saleHistory) ? product.saleHistory : [];

  if (history.length === 0) {
    return '<p class="message">Aucune vente enregistree.</p>';
  }

  return `
    <div class="price-history-list">
      ${history.map((sale) => `
        <article class="price-history-item">
          <strong>${formatPrice(sale.price)}</strong>
          <span>${getSellerDisplayName(sale.soldBy)} - ${formatDateTime(sale.soldAt)}</span>
        </article>
      `).join("")}
    </div>
  `;
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
  const sellers = getListedSellers(sellerKey);

  if (sellers.length === 0) {
    return '<span class="seller-badge seller-none">Personne</span>';
  }

  return `<div class="seller-badges">${sellers.map(renderSingleSellerBadge).join("")}</div>`;
}

function renderSingleSellerBadge(sellerKey) {
  const user = USERS[sellerKey];
  if (!user) {
    return "";
  }

  return `<span class="seller-badge ${user.badgeClass}">${escapeHtml(user.displayName)}</span>`;
}

function renderSellerCheckbox(name, sellerKey, selectedSellers) {
  const checked = selectedSellers.includes(sellerKey) ? "checked" : "";

  return `
    <label class="seller-option">
      <input type="checkbox" name="${escapeHtml(name)}" value="${sellerKey}" ${checked}>
      ${renderSingleSellerBadge(sellerKey)}
    </label>
  `;
}

function getSellerDisplayName(sellerKey) {
  if (sellerKey === SELLER_ANTHONY) {
    return "Anthony";
  }
  if (sellerKey === SELLER_JULIEN) {
    return "Julien";
  }
  if (sellerKey === SELLER_COMPTE_PRO) {
    return "Compte pro";
  }
  if (sellerKey === SELLER_BOTH) {
    return "Nous deux";
  }
  return "Personne";
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
  const images = normalizeImages(rawProduct);

  return {
    id: String(rawProduct.id || makeId()),
    name: String(rawProduct.name || "Produit sans nom").trim(),
    totalStock,
    listedQuantity: Math.min(listedQuantity, totalStock),
    listedBy: normalizeListedByValue(rawProduct.listedBy),
    lowThreshold: Math.max(0, Number(rawProduct.lowThreshold || DEFAULT_LOW_THRESHOLD)),
    articleLink: String(rawProduct.articleLink || "").trim(),
    photo: images[0] || "",
    images,
    saleHistory: normalizeSaleHistory(rawProduct.saleHistory),
    createdBy: String(rawProduct.createdBy || "").trim(),
    createdAt: String(rawProduct.createdAt || new Date().toISOString()),
    updatedAt: String(rawProduct.updatedAt || rawProduct.createdAt || new Date().toISOString())
  };
}

function normalizeImages(rawProduct) {
  const images = Array.isArray(rawProduct.images) ? rawProduct.images : [];
  const legacyPhoto = String(rawProduct.photo || "").trim();
  const normalized = images
    .map((image) => String(image || "").trim())
    .filter(Boolean);

  if (legacyPhoto) {
    normalized.unshift(legacyPhoto);
  }

  return [...new Set(normalized)];
}

function normalizeSaleHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) {
    return [];
  }

  return rawHistory
    .map((sale) => ({
      price: Number(sale && sale.price ? sale.price : 0),
      soldBy: normalizeSoldByValue(sale && sale.soldBy ? sale.soldBy : ""),
      soldAt: String(sale && sale.soldAt ? sale.soldAt : "")
    }))
    .filter((sale) => sale.price > 0);
}

function getProductImages(product) {
  const images = Array.isArray(product.images) ? product.images : [];
  const normalized = images.map((image) => String(image || "").trim()).filter(Boolean);

  if (normalized.length > 0) {
    return normalized;
  }

  return product.photo ? [product.photo] : [];
}

function normalizeListedByValue(value) {
  return normalizeListedSellers(value).join(",");
}

function normalizeListedSellers(value) {
  const sellers = [];
  const rawValues = Array.isArray(value) ? value : [value];

  for (const rawValue of rawValues) {
    collectListedSellers(rawValue, sellers);
  }

  return SELLER_KEYS.filter((sellerKey) => sellers.includes(sellerKey));
}

function collectListedSellers(value, sellers) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return;
  }

  const normalized = normalizeUsername(text);
  if (normalized === SELLER_BOTH || text === "nous deux") {
    addSellerKey(sellers, SELLER_ANTHONY);
    addSellerKey(sellers, SELLER_JULIEN);
    return;
  }

  if (SELLER_KEYS.includes(normalized)) {
    addSellerKey(sellers, normalized);
    return;
  }

  const parts = text.split(/[,\n;/|]+/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const partNormalized = normalizeUsername(part);

    if (partNormalized === SELLER_BOTH || part === "nous deux") {
      addSellerKey(sellers, SELLER_ANTHONY);
      addSellerKey(sellers, SELLER_JULIEN);
      continue;
    }

    if (SELLER_KEYS.includes(partNormalized)) {
      addSellerKey(sellers, partNormalized);
      continue;
    }

    if (part.includes(SELLER_ANTHONY) || part === "a") {
      addSellerKey(sellers, SELLER_ANTHONY);
    }
    if (part.includes(SELLER_JULIEN) || part === "j") {
      addSellerKey(sellers, SELLER_JULIEN);
    }
    if ((part.includes("compte") && part.includes("pro")) || partNormalized === "pro" || partNormalized === "cp") {
      addSellerKey(sellers, SELLER_COMPTE_PRO);
    }
  }
}

function addSellerKey(sellers, sellerKey) {
  if (SELLER_KEYS.includes(sellerKey) && !sellers.includes(sellerKey)) {
    sellers.push(sellerKey);
  }
}

function getSellerSearchTokens(listedBy) {
  const sellers = getListedSellers(listedBy);
  const tokens = sellers.flatMap((sellerKey) => [sellerKey, getSellerDisplayName(sellerKey).toLowerCase()]);

  if (sellers.includes(SELLER_ANTHONY) && sellers.includes(SELLER_JULIEN)) {
    tokens.push("nous deux", "both");
  }

  if (sellers.includes(SELLER_COMPTE_PRO)) {
    tokens.push("compte pro", "compte_pro", "pro");
  }

  return tokens.join(" ");
}

function listedByMatchesFilter(listedBy, filterValue) {
  if (filterValue === "all") {
    return true;
  }

  const sellers = getListedSellers(listedBy);

  if (filterValue === SELLER_BOTH) {
    return sellers.includes(SELLER_ANTHONY) && sellers.includes(SELLER_JULIEN);
  }

  if (SELLER_KEYS.includes(filterValue)) {
    return sellers.includes(filterValue);
  }

  return listedBy === filterValue;
}

function isSellerExcluded(listedBy) {
  const sellers = getListedSellers(listedBy);
  const includesAnthony = sellers.includes(SELLER_ANTHONY);
  const includesJulien = sellers.includes(SELLER_JULIEN);
  const includesComptePro = sellers.includes(SELLER_COMPTE_PRO);

  if (state.excludeAnthony && includesAnthony) {
    return true;
  }

  if (state.excludeJulien && includesJulien) {
    return true;
  }

  if (state.excludeComptePro && includesComptePro) {
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
  if (!sync || !sync.enabled) {
    return { enabled: false };
  }

  if (sync.provider === "api") {
    const baseUrl = sync.api && typeof sync.api.baseUrl === "string"
      ? normalizeApiBaseUrl(sync.api.baseUrl)
      : "";

    return {
      enabled: true,
      provider: "api",
      apiBaseUrl: baseUrl
    };
  }

  return { enabled: false };
}

function normalizeApiBaseUrl(value) {
  let url = String(value || "").trim();

  if (!url) {
    return "";
  }

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  url = url.replace(/\/+$/g, "");

  if (!/\/api$/i.test(url)) {
    url = `${url}/api`;
  }

  return url;
}

function isApiSyncEnabled() {
  const syncConfig = getSyncConfig();
  return syncConfig.enabled && syncConfig.provider === "api" && Boolean(syncConfig.apiBaseUrl);
}

async function manualSyncProducts() {
  if (state.sync.error) {
    showSyncDiagnostic(getSyncErrorMessage(state.sync.error));
    return;
  }

  if (state.sync.mode === "api") {
    try {
      state.sync.ready = false;
      state.sync.error = "";
      renderSyncBadge();
      await apiRequest("/products", {
        method: "PUT",
        body: { products: state.products }
      });
      state.sync.ready = true;
      renderSyncBadge();
      showStatus("Stock pousse sur la sync API.", "info");
    } catch {
      state.sync.ready = false;
      state.sync.error = "api_manual_push_failed";
      renderSyncBadge();
      showSyncDiagnostic(getSyncErrorMessage(state.sync.error));
    }
    return;
  }

  showSyncDiagnostic(getSyncNotConfiguredMessage());
}

function showSyncDiagnostic(message) {
  showStatus(message, "error");
  window.alert(message);
}

function getSyncNotConfiguredMessage() {
  const sync = window.APP_CONFIG && window.APP_CONFIG.sync ? window.APP_CONFIG.sync : null;

  if (!sync) {
    return "Sync non configuree: APP_CONFIG.sync est absent du config.js publie.";
  }

  if (sync.provider === "api") {
    if (!sync.enabled) {
      return "Sync non configuree: APP_CONFIG.sync.enabled vaut false.";
    }

    return "Sync non configuree: APP_CONFIG.sync.api.baseUrl est manquant.";
  }

  if (sync.provider !== "api") {
    return "Sync non configuree: APP_CONFIG.sync.provider doit etre \"api\".";
  }

  return "Sync non configuree: API non initialisee.";
}

async function apiLogin(username, password) {
  const syncConfig = getSyncConfig();
  if (!syncConfig.enabled || syncConfig.provider !== "api" || !syncConfig.apiBaseUrl) {
    throw new Error("API non configuree.");
  }

  const response = await fetch(`${syncConfig.apiBaseUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw new Error(getSyncErrorMessage("api_login_failed"));
  }

  const data = await response.json();
  const token = data && typeof data.token === "string" ? data.token : "";

  if (!token) {
    throw new Error("Reponse API invalide: token manquant.");
  }

  return token;
}

async function setupApiSync(syncConfig) {
  state.sync.mode = "api";
  state.sync.ready = false;
  state.sync.error = "";
  state.sync.apiBaseUrl = syncConfig.apiBaseUrl;

  if (!syncConfig.apiBaseUrl) {
    state.sync.mode = "local";
    state.sync.error = "api_config_invalid";
    renderSyncBadge();
    showStatus(getSyncErrorMessage(state.sync.error), "error");
    return;
  }

  if (!state.apiToken) {
    state.sync.mode = "local";
    state.sync.error = state.user ? "api_auth_missing" : "";
    renderSyncBadge();
    return;
  }

  try {
    await refreshProductsFromApi();
    state.sync.ready = true;
    state.sync.error = "";
    renderSyncBadge();
    startApiPolling();
  } catch {
    state.sync.ready = false;
    state.sync.error = "api_read_failed";
    renderSyncBadge();
    showStatus(getSyncErrorMessage(state.sync.error), "error");
  }
}

async function refreshProductsFromApi() {
  const data = await apiRequest("/products");
  const rawProducts = Array.isArray(data) ? data : data.products;
  state.products = normalizeProductsFromRemote(rawProducts);
  persistProductsCache();
  render();
}

function startApiPolling() {
  stopApiPolling();
  state.sync.pollTimerId = window.setInterval(() => {
    if (state.sync.mode !== "api" || !state.apiToken) {
      return;
    }

    refreshProductsFromApi().catch(() => {
      state.sync.ready = false;
      state.sync.error = "api_read_failed";
      renderSyncBadge();
    });
  }, DEFAULT_API_POLL_INTERVAL_MS);
}

function stopApiPolling() {
  if (state.sync.pollTimerId) {
    window.clearInterval(state.sync.pollTimerId);
    state.sync.pollTimerId = null;
  }
}

async function apiRequest(path, options = {}) {
  const baseUrl = state.sync.apiBaseUrl || getSyncConfig().apiBaseUrl || "";
  if (!baseUrl) {
    throw new Error("api_base_url_missing");
  }

  const headers = {
    ...(options.headers || {})
  };

  if (state.apiToken) {
    headers.Authorization = `Bearer ${state.apiToken}`;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 401 || response.status === 403) {
    state.apiToken = "";
    localStorage.removeItem(STORAGE_API_TOKEN_KEY);
    throw new Error("api_unauthorized");
  }

  if (!response.ok) {
    throw new Error(`api_http_${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function setupSync() {
  const syncConfig = getSyncConfig();
  stopApiPolling();

  if (!syncConfig.enabled) {
    state.sync.mode = "local";
    state.sync.ready = true;
    state.sync.error = "";
    renderSyncBadge();
    return;
  }

  if (syncConfig.provider === "api") {
    await setupApiSync(syncConfig);
    return;
  }
}

async function syncUpsertProduct(product) {
  if (state.sync.mode === "api") {
    try {
      await apiRequest(`/products/${encodeURIComponent(product.id)}`, {
        method: "PUT",
        body: product
      });
      state.sync.error = "";
      state.sync.ready = true;
      renderSyncBadge();
    } catch {
      state.sync.ready = false;
      state.sync.error = "api_write_failed";
      renderSyncBadge();
      showStatus(getSyncErrorMessage(state.sync.error), "error");
    }
    return;
  }
}

async function syncDeleteProduct(productId) {
  if (state.sync.mode === "api") {
    try {
      await apiRequest(`/products/${encodeURIComponent(productId)}`, {
        method: "DELETE"
      });
      state.sync.error = "";
      state.sync.ready = true;
      renderSyncBadge();
    } catch {
      state.sync.ready = false;
      state.sync.error = "api_delete_failed";
      renderSyncBadge();
      showStatus(getSyncErrorMessage(state.sync.error), "error");
    }
    return;
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

async function collectImagesFromForm(formData, urlsFieldName, filesFieldName) {
  const images = [];
  const imageUrls = parseImageUrls(String(formData.get(urlsFieldName) || ""));

  for (const imageUrl of imageUrls) {
    if (!isValidHttpUrl(imageUrl)) {
      showStatus("Une URL image est invalide.", "error");
      throw new Error("invalid_image_url");
    }
    images.push(imageUrl);
  }

  const imageFiles = formData
    .getAll(filesFieldName)
    .filter((file) => file instanceof File && file.size > 0);

  for (const imageFile of imageFiles) {
    try {
      images.push(await fileToDataUrl(imageFile));
    } catch {
      showStatus("Impossible de lire une image importee.", "error");
      throw new Error("file_read_error");
    }
  }

  return [...new Set(images)];
}

function parseImageUrls(value) {
  return value
    .split(/\n|,/)
    .map((url) => url.trim())
    .filter(Boolean);
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

function isValidPhotoValue(text) {
  return isValidHttpUrl(text) || text.startsWith("data:image/");
}

function parseSalePrice(value) {
  const normalized = String(value || "").trim().replace(",", ".");
  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function formatPrice(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function normalizeUsername(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, "");

  if (compact === "comptepro") {
    return SELLER_COMPTE_PRO;
  }

  return normalized;
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
