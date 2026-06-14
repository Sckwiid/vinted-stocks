(async () => {
  try {
    await wait(120);
    const items = await scanTemuOrderItems();

    return {
      ok: true,
      pageUrl: window.location.href,
      items
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "Erreur inconnue pendant le scan Temu."
    };
  }
})();

async function scanTemuOrderItems() {
  const originalX = window.scrollX;
  const originalY = window.scrollY;
  const itemsByMergeKey = new Map();
  const imagePool = [];

  try {
    for (const position of buildScanPositions()) {
      if (Math.abs(window.scrollY - position) > 24) {
        window.scrollTo({ top: position, left: originalX, behavior: "auto" });
        await wait(140);
      }

      for (const imageUrl of collectProductImageUrls()) {
        if (!imagePool.includes(imageUrl)) {
          imagePool.push(imageUrl);
        }
      }

      for (const item of [...collectVisibleOrderItems(), ...collectTextOrderItems()]) {
        addCandidateItem(itemsByMergeKey, item);
      }
    }
  } finally {
    window.scrollTo({ top: originalY, left: originalX, behavior: "auto" });
  }

  const items = Array.from(itemsByMergeKey.values());
  hydrateMissingImages(items, imagePool);

  return items.map((item) => ({
    ...item,
    importKey: buildItemKey(item)
  }));
}

function buildScanPositions() {
  const maxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
    document.body.scrollHeight - window.innerHeight
  );

  if (maxScroll <= 0) {
    return [0];
  }

  const positions = [0];
  const step = Math.max(360, Math.round(window.innerHeight * 0.55));

  for (let position = step; position < maxScroll; position += step) {
    positions.push(position);
  }

  positions.push(maxScroll);
  return [...new Set(positions.map((position) => Math.max(0, Math.min(maxScroll, position))))];
}

function addCandidateItem(itemsByMergeKey, item) {
  if (!item || !item.title || item.purchasePrice === null) {
    return;
  }

  const key = buildMergeKey(item);
  if (!key) {
    return;
  }

  const existing = itemsByMergeKey.get(key);
  if (!existing) {
    itemsByMergeKey.set(key, item);
    return;
  }

  existing.imageUrl = existing.imageUrl || item.imageUrl || "";
  existing.productUrl = existing.productUrl || item.productUrl || "";
  existing.orderPageUrl = existing.orderPageUrl || item.orderPageUrl || "";
  existing.orderId = existing.orderId || item.orderId || "";
  existing.orderDate = existing.orderDate || item.orderDate || "";
  existing.variant = existing.variant || item.variant || "";
  existing.color = existing.color || item.color || "";
}

function hydrateMissingImages(items, imagePool) {
  items.forEach((item, index) => {
    if (!item.imageUrl && imagePool[index]) {
      item.imageUrl = imagePool[index];
    }
  });
}

function collectVisibleOrderItems() {
  const titleNodes = Array.from(document.querySelectorAll('[class*="_2CzqyEwl"]'));
  const orderId = findOrderIdFromUrl();
  const itemsByKey = new Map();

  for (const titleNode of titleNodes) {
    if (isAfterStopBoundary(titleNode)) {
      continue;
    }

    const title = cleanTitle(titleNode.innerText || titleNode.textContent || "");
    if (!title) {
      continue;
    }

    const row = findProductRow(titleNode);
    if (!row || isAfterStopBoundary(row)) {
      continue;
    }

    const priceElement = findScopedElementAfter(row, titleNode, '[class*="_3QXWbu8N"]', (element) => {
      return findPurchasePrice(element.innerText || element.textContent || "") !== null;
    });
    const quantityElement = findScopedElementAfter(row, titleNode, '[class*="_3kmrz08e"]', (element) => {
      return findQuantity(element.innerText || element.textContent || "") > 0;
    });
    const variantElement = findScopedElementAfter(row, titleNode, '[class*="_2mokkSXY"], [class*="_30Hvc4DA"]', (element) => {
      return Boolean(cleanVariant(element.innerText || element.textContent || "", title));
    });
    const imageElement = findProductImage(row, titleNode);

    const purchasePrice = priceElement ? findPurchasePrice(priceElement.innerText || priceElement.textContent || "") : null;
    const quantity = quantityElement ? findQuantity(quantityElement.innerText || quantityElement.textContent || "") : findQuantity(row.innerText || row.textContent || "");
    const variant = cleanVariant(variantElement ? variantElement.innerText || variantElement.textContent || "" : findVariantLine(row), title);
    const color = extractColorFromVariant(variant);
    const imageUrl = imageElement ? normalizeImageUrl(
      imageElement.currentSrc
        || imageElement.src
        || imageElement.getAttribute("data-src")
        || imageElement.getAttribute("data-original")
        || imageElement.getAttribute("data-lazy-src")
        || ""
    ) : "";
    const productUrl = findProductUrl(row);

    if (!title || purchasePrice === null) {
      continue;
    }

    const item = {
      title,
      purchasePrice,
      quantity,
      imageUrl,
      productUrl,
      orderPageUrl: window.location.href,
      orderId,
      orderDate: "",
      variant,
      color,
      importKey: "",
      currency: "EUR"
    };

    item.importKey = buildItemKey(item);

    if (!itemsByKey.has(item.importKey)) {
      itemsByKey.set(item.importKey, item);
    }
  }

  return Array.from(itemsByKey.values());
}

function collectTextOrderItems() {
  const lines = getOrderTextLines();
  const orderId = findOrderIdFromUrl();
  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    const priceIndex = findNextLineIndex(lines, index + 1, index + 6, isStandalonePriceLine);
    if (priceIndex === -1) {
      continue;
    }

    const title = cleanTitle(lines.slice(index, priceIndex).join(" "));
    if (!title) {
      continue;
    }

    const variantIndex = findNextLineIndex(lines, priceIndex + 1, priceIndex + 5, looksLikeVariantLine);
    const quantityIndex = variantIndex === -1
      ? -1
      : findNextLineIndex(lines, variantIndex + 1, variantIndex + 4, looksLikeQuantityLine);
    const sellerIndex = quantityIndex === -1
      ? -1
      : findNextLineIndex(lines, quantityIndex + 1, quantityIndex + 9, isSellerLine);

    if (variantIndex === -1 || quantityIndex === -1 || sellerIndex === -1) {
      continue;
    }

    const variant = cleanVariant(lines[variantIndex], title);
    const purchasePrice = findPurchasePrice(lines[priceIndex]);
    const quantity = findQuantity(lines[quantityIndex]);

    if (!variant || purchasePrice === null) {
      continue;
    }

    const item = {
      title,
      purchasePrice,
      quantity,
      imageUrl: "",
      productUrl: "",
      orderPageUrl: window.location.href,
      orderId,
      orderDate: "",
      variant,
      color: extractColorFromVariant(variant),
      importKey: "",
      currency: "EUR"
    };

    items.push(item);
    index = sellerIndex;
  }

  return items;
}

function getOrderTextLines() {
  const lines = cleanText(document.body.innerText || document.body.textContent || "")
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);
  const stopIndex = lines.findIndex((line) => {
    return /^(d[eé]tails de paiement|moyen de paiement|vous aimerez aussi|articles similaires|produits recommand[eé]s|recommandations?|pour vous|s[eé]lectionn[eé] pour vous|d[eé]couvrez aussi)$/i.test(line);
  });

  return stopIndex === -1 ? lines : lines.slice(0, stopIndex);
}

function findNextLineIndex(lines, start, end, predicate) {
  const max = Math.min(lines.length, end);

  for (let index = start; index < max; index += 1) {
    if (predicate(lines[index])) {
      return index;
    }
  }

  return -1;
}

function findProductRow(titleNode) {
  let current = titleNode.parentElement;

  for (let depth = 0; current && depth < 12; depth += 1) {
    if (isAfterStopBoundary(current)) {
      return null;
    }

    const text = cleanText(current.innerText || current.textContent || "");
    const hasPrice = Boolean(current.querySelector('[class*="_3QXWbu8N"]')) || findPurchasePrice(text) !== null;
    const hasQuantity = Boolean(current.querySelector('[class*="_3kmrz08e"]')) || /[x×]\s*\d+/i.test(text);
    const hasImage = Array.from(current.querySelectorAll("img")).some(isTemuProductImage);
    const titleCount = current.querySelectorAll('[class*="_2CzqyEwl"]').length;
    const isReasonableSize = text.length > 8 && text.length < 2200;

    if (hasPrice && hasQuantity && hasImage && titleCount <= 1 && isReasonableSize) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function findScopedElementAfter(scope, source, selector, predicate) {
  const candidates = Array.from(scope.querySelectorAll(selector))
    .filter((element) => !predicate || predicate(element));

  if (candidates.length === 0) {
    return null;
  }

  const following = candidates.filter((element) => {
    return source.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING;
  });

  return following[0] || candidates[0];
}

function findProductImage(scope, source) {
  const candidates = Array.from(scope.querySelectorAll("img")).filter(isTemuProductImage);

  if (candidates.length === 0) {
    return null;
  }

  const beforeTitle = candidates.filter((image) => {
    return image.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING;
  });

  return beforeTitle[beforeTitle.length - 1] || candidates[0];
}

function collectProductImageUrls() {
  return Array.from(document.querySelectorAll("img"))
    .filter(isTemuProductImage)
    .map((image) => normalizeImageUrl(
      image.currentSrc
        || image.src
        || image.getAttribute("data-src")
        || image.getAttribute("data-original")
        || image.getAttribute("data-lazy-src")
        || ""
    ))
    .filter(Boolean);
}

function findProductUrl(scope) {
  if (!scope || !scope.querySelectorAll) {
    return "";
  }

  const link = Array.from(scope.querySelectorAll("a[href]")).find((anchor) => {
    return isLikelyProductUrl(anchor.href);
  });

  return link ? normalizeAbsoluteUrl(link.href) : "";
}

function findVariantLine(scope) {
  const text = cleanText(scope.innerText || scope.textContent || "");
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

  return lines.find((line) => looksLikeVariantLine(line)) || "";
}

function cleanTitle(value) {
  const line = cleanText(value || "")
    .replace(/^photo de l['’]article\s*/i, "")
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean) || "";

  if (line.length < 5 || line.length > 340) {
    return "";
  }

  if (looksLikeUiLine(line) || looksLikePriceLine(line) || isStandaloneQuantityLine(line)) {
    return "";
  }

  return line;
}

function cleanVariant(value, title) {
  const text = cleanText(value || "")
    .replace(/[【】]/g, "")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s*\/\s*/g, " / ")
    .trim();

  if (!text || text.length > 140) {
    return "";
  }

  if (title && normalizeComparableText(text).includes(normalizeComparableText(title).slice(0, 40))) {
    return "";
  }

  if (looksLikeUiLine(text) || looksLikePriceLine(text) || looksLikeQuantityLine(text)) {
    return "";
  }

  return text;
}

function extractColorFromVariant(variant) {
  if (!variant) {
    return "";
  }

  return variant.split("/")[0]
    .replace(/[【】]/g, "")
    .replace(/^couleur\s+/i, "")
    .replace(/^color\s+/i, "")
    .trim();
}

function findPurchasePrice(text) {
  const value = cleanText(text || "");
  const patterns = [
    /(?:€\s*)(\d+(?:[,.]\d{1,2})?)/g,
    /(\d+(?:[,.]\d{1,2})?)\s*(?:€|\beur\b)/gi
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(value);
    while (match) {
      const price = parsePrice(match[1]);
      if (price !== null) {
        return price;
      }
      match = pattern.exec(value);
    }
  }

  return null;
}

function isStandalonePriceLine(line) {
  return /^\d+(?:[,.]\d{1,2})?\s*(?:€|\beur\b)$/i.test(cleanText(line || ""));
}

function isStandaloneQuantityLine(line) {
  return /^[x×]\s*\d+\b/i.test(cleanText(line || ""));
}

function findQuantity(text) {
  const value = cleanText(text || "");
  const patterns = [
    /[x×]\s*(\d+)\b/i,
    /\bqt[eé]\s*[:x]?\s*(\d+)\b/i,
    /\bquantit[eé]\s*[:x]?\s*(\d+)\b/i,
    /\b(\d+)\s*(?:pcs?|pi[eè]ces?|articles?)\b/i
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      const quantity = Number(match[1]);
      if (Number.isFinite(quantity) && quantity > 0) {
        return Math.floor(quantity);
      }
    }
  }

  return 1;
}

function findOrderIdFromUrl() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("parent_order_sn")
      || url.searchParams.get("order_sn")
      || url.searchParams.get("parentOrderSn")
      || "";
  } catch {
    return "";
  }
}

function buildItemKey(item) {
  const urlKey = normalizeUrlKey(item.productUrl);
  const parts = urlKey
    ? [urlKey, item.variant || item.color || "", item.imageUrl || "", item.purchasePrice === null ? "" : String(item.purchasePrice)]
    : [
      item.orderId || "",
      item.title || "",
      item.variant || "",
      item.color || "",
      item.imageUrl || "",
      item.purchasePrice === null ? "" : String(item.purchasePrice),
      item.quantity || 1
    ];

  return parts.map(normalizeComparableText).join("|");
}

function buildMergeKey(item) {
  const urlKey = normalizeUrlKey(item.productUrl);
  const parts = urlKey
    ? [urlKey, item.variant || item.color || "", item.purchasePrice === null ? "" : String(item.purchasePrice)]
    : [
      item.orderId || "",
      item.title || "",
      item.variant || "",
      item.color || "",
      item.purchasePrice === null ? "" : String(item.purchasePrice),
      item.quantity || 1
    ];

  return parts.map(normalizeComparableText).join("|");
}

function looksLikeUiLine(line) {
  const text = cleanText(line || "");

  return /^(aper[cç]u|voir|ouvrir|details?|d[eé]tails|commande|remboursement|retour|suivi|livr[eé]e?|exp[eé]di[eé]|annuler|acheter|avis|total|sous-total|payer|recommander)$/i.test(text)
    || /(livraison|service client|politique|conditions|coupon|cr[eé]dit|message|panier|vendu par|exp[eé]di[eé]|ce qui est inclus|ajustement des prix|retourner\/rembourser|donner un avis|suivre la commande|voir le re[cç]u|moyen de paiement|d[eé]tails de paiement)/i.test(text);
}

function looksLikePriceLine(line) {
  return /(?:€|\beur\b|\btotal\b|\bprix\b)/i.test(line || "") && /\d/.test(line || "");
}

function looksLikeQuantityLine(line) {
  return /(?:\bx\s*\d+\b|×\s*\d+\b|quantit[eé]|qt[eé]|pcs?|pi[eè]ces?)/i.test(line || "");
}

function looksLikeVariantLine(line) {
  return /(taille de l['’]?[eé]tiquette|taille\s*:|couleur\s+|\/\s*taille|asian\s*[xsml]+)/i.test(line || "");
}

function isSellerLine(line) {
  return /exp[eé]di[eé].*vendu par/i.test(line || "") || /vendu par/i.test(line || "");
}

function isTemuProductImage(image) {
  const url = normalizeImageUrl(
    image.currentSrc
      || image.src
      || image.getAttribute("data-src")
      || image.getAttribute("data-original")
      || image.getAttribute("data-lazy-src")
      || ""
  );

  return /(?:^https?:\/\/)?(?:img|aimg)\.kwcdn\.com/i.test(url)
    && /thumbnail/i.test(url)
    && !/upload_aimg\/hangyerw\/759016b3-9024-40c1-add7-bfcdd900456e/i.test(url)
    && !/(icon|sprite|logo)/i.test(url);
}

function isAfterStopBoundary(element) {
  const boundary = getStopBoundary();

  if (!boundary || !element) {
    return false;
  }

  if (boundary === element || boundary.contains(element)) {
    return true;
  }

  const position = boundary.compareDocumentPosition(element);
  return Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING);
}

function getStopBoundary() {
  if (getStopBoundary.cached && document.contains(getStopBoundary.cached)) {
    return getStopBoundary.cached;
  }

  const selectors = "h1,h2,h3,h4,[role='heading'],section,div,span";
  const boundary = Array.from(document.querySelectorAll(selectors)).find((element) => {
    const text = cleanText(element.innerText || element.textContent || "");

    return text.length >= 4
      && text.length <= 100
      && /^(d[eé]tails de paiement|moyen de paiement|vous aimerez aussi|articles similaires|produits recommand[eé]s|recommandations?|pour vous|s[eé]lectionn[eé] pour vous|d[eé]couvrez aussi)/i.test(text);
  }) || null;

  if (boundary) {
    getStopBoundary.cached = boundary;
  }

  return boundary;
}

function isLikelyProductUrl(url) {
  const normalized = normalizeAbsoluteUrl(url);

  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const href = parsed.href.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    const isTemuHost = host === "temu.com"
      || host.endsWith(".temu.com")
      || host === "temu.fr"
      || host.endsWith(".temu.fr");

    if (!isTemuHost || /(cart|checkout|order|orders|support|search|category|login|account)/i.test(path)) {
      return false;
    }

    return href.includes("goods_id=")
      || href.includes("product_id=")
      || href.includes("sku_id=")
      || href.includes("/goods")
      || href.includes("/product");
  } catch {
    return false;
  }
}

function normalizeAbsoluteUrl(url) {
  const value = String(url || "").trim();
  if (!value || value.startsWith("javascript:")) {
    return "";
  }

  try {
    return new URL(value, window.location.href).href;
  } catch {
    return "";
  }
}

function normalizeUrlKey(url) {
  const normalized = normalizeAbsoluteUrl(url);
  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    parsed.hash = "";
    parsed.searchParams.sort();
    return parsed.href.replace(/\/+$/g, "").toLowerCase();
  } catch {
    return normalized.replace(/\/+$/g, "").toLowerCase();
  }
}

function normalizeImageUrl(url) {
  const value = String(url || "").trim();
  if (!value || value.startsWith("data:")) {
    return "";
  }

  try {
    return new URL(value, window.location.href).href;
  } catch {
    return "";
  }
}

function parsePrice(value) {
  const price = Number(String(value || "").replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(price) && price > 0 ? price : null;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeComparableText(value) {
  return cleanText(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
