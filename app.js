const STORAGE_DATA_KEY = "vinted_stocks_data_v1";
const STORAGE_SESSION_KEY = "vinted_stocks_session_v1";
const DEFAULT_LOW_THRESHOLD = 3;
const DEFAULT_SYNC_PATH = "vinted-stocks/shared/products";
const SELLER_ANTHONY = "anthony";
const SELLER_JULIEN = "julien";
const SELLER_COMPTE_PRO = "compte-pro";
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
  const listedBy = normalizeListedByValue(String(formData.get("listedBy") || "").trim().toLowerCase());
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
    showStatus("Choisis Anthony, Julien, Compte pro ou Nous deux pour un article en vente.", "error");
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
    const salePrice = salePriceInput.trim() ? parseSalePrice(salePriceInput) : null;
    if (salePriceInput.trim() && salePrice === null) {
      showStatus("Indique un prix de vente valide.", "error");
      return;
    }

    await markProductSold(product.id, salePrice);
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
  const listedBy = normalizeListedByValue(String(formData.get("detailListedBy") || "").trim().toLowerCase());
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
    showStatus("Choisis Anthony, Julien, Compte pro ou Nous deux pour la mise en vente.", "error");
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

async function markProductSold(productId, salePrice = null) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) {
    showStatus("Produit introuvable.", "error");
    return;
  }

  if (product.listedQuantity <= 0) {
    showStatus("Aucun article en vente a marquer comme vendu.", "error");
    return;
  }

  const soldBy = requestSoldBy(product);
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

function requestSoldBy(product) {
  const taggedSellers = getListedSellers(product.listedBy);
  const availableSellers = taggedSellers.length > 0
    ? taggedSellers
    : [SELLER_ANTHONY, SELLER_JULIEN, SELLER_COMPTE_PRO];

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

  if (!soldBy || !availableSellers.includes(soldBy)) {
    showStatus("Ce vendeur n'est pas marque en vente pour cet article.", "error");
    return "";
  }

  return soldBy;
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
  if (listedBy === SELLER_BOTH) {
    return [SELLER_ANTHONY, SELLER_JULIEN];
  }
  if (listedBy === SELLER_ANTHONY || listedBy === SELLER_JULIEN || listedBy === SELLER_COMPTE_PRO) {
    return [listedBy];
  }
  return [];
}

function removeSellerTagAfterSale(listedBy, soldBy, remainingListedQuantity) {
  if (remainingListedQuantity <= 0) {
    return "";
  }

  if (listedBy === SELLER_BOTH && soldBy === SELLER_ANTHONY) {
    return SELLER_JULIEN;
  }

  if (listedBy === SELLER_BOTH && soldBy === SELLER_JULIEN) {
    return SELLER_ANTHONY;
  }

  if (listedBy === soldBy) {
    return "";
  }

  return listedBy;
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
          <label>
            Mis en vente par
            <select name="detailListedBy">
              <option value="" ${product.listedBy ? "" : "selected"}>Personne</option>
              <option value="anthony" ${product.listedBy === "anthony" ? "selected" : ""}>Anthony</option>
              <option value="julien" ${product.listedBy === "julien" ? "selected" : ""}>Julien</option>
              <option value="compte-pro" ${product.listedBy === "compte-pro" ? "selected" : ""}>Compte pro</option>
              <option value="both" ${product.listedBy === "both" ? "selected" : ""}>Nous deux</option>
            </select>
          </label>
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
  if (sellerKey === SELLER_BOTH) {
    return '<div class="seller-badges"><span class="seller-badge seller-anthony">Anthony</span><span class="seller-badge seller-julien">Julien</span></div>';
  }

  if (sellerKey === SELLER_ANTHONY) {
    return '<span class="seller-badge seller-anthony">Anthony</span>';
  }

  if (sellerKey === SELLER_JULIEN) {
    return '<span class="seller-badge seller-julien">Julien</span>';
  }

  if (sellerKey === SELLER_COMPTE_PRO) {
    return '<span class="seller-badge seller-compte-pro">Compte pro</span>';
  }

  return '<span class="seller-badge seller-none">Personne</span>';
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
  if (value === SELLER_ANTHONY || value === SELLER_JULIEN || value === SELLER_COMPTE_PRO || value === SELLER_BOTH) {
    return value;
  }

  if (Array.isArray(value)) {
    const normalizedValues = value.map(normalizeUsername);
    const hasAnthony = normalizedValues.includes(SELLER_ANTHONY);
    const hasJulien = normalizedValues.includes(SELLER_JULIEN);
    const hasComptePro = normalizedValues.includes(SELLER_COMPTE_PRO);
    if (hasAnthony && hasJulien) {
      return SELLER_BOTH;
    }
    if (hasAnthony) {
      return SELLER_ANTHONY;
    }
    if (hasJulien) {
      return SELLER_JULIEN;
    }
    if (hasComptePro) {
      return SELLER_COMPTE_PRO;
    }
    return "";
  }

  if (typeof value === "string") {
    const lower = normalizeUsername(value);
    if (lower === SELLER_ANTHONY) {
      return SELLER_ANTHONY;
    }
    if (lower === SELLER_JULIEN) {
      return SELLER_JULIEN;
    }
    if (lower === SELLER_COMPTE_PRO) {
      return SELLER_COMPTE_PRO;
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
  if (listedBy === SELLER_COMPTE_PRO) {
    return "compte pro compte-pro compte_pro pro";
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

  if (filterValue === SELLER_COMPTE_PRO) {
    return listedBy === SELLER_COMPTE_PRO;
  }

  return listedBy === filterValue;
}

function isSellerExcluded(listedBy) {
  const includesAnthony = listedBy === SELLER_ANTHONY || listedBy === SELLER_BOTH;
  const includesJulien = listedBy === SELLER_JULIEN || listedBy === SELLER_BOTH;
  const includesComptePro = listedBy === SELLER_COMPTE_PRO;

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
