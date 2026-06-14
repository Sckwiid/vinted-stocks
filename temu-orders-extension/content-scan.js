(async () => {
  try {
    const items = await scanTemuOrderItemsWithScroll();

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

async function scanTemuOrderItemsWithScroll() {
  const originalY = window.scrollY;
  const itemsByKey = new Map();
  const maxScrolls = 14;
  const step = Math.max(520, Math.floor(window.innerHeight * 0.72));

  const collectVisibleItems = () => {
    for (const item of scanTemuOrderItems()) {
      const key = buildItemKey(item.productUrl, item);
      if (key && !itemsByKey.has(key)) {
        itemsByKey.set(key, item);
      }
    }
  };

  collectVisibleItems();

  for (let index = 0; index < maxScrolls; index += 1) {
    window.scrollBy(0, step);
    await wait(220);
    collectVisibleItems();

    const boundary = getRecommendationBoundary();
    if (boundary && boundary.getBoundingClientRect().top < window.innerHeight * 1.25) {
      break;
    }

    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8) {
      break;
    }
  }

  window.scrollTo(0, originalY);
  await wait(120);

  return Array.from(itemsByKey.values());
}

async function autoScrollForLazyContent() {
  const originalY = window.scrollY;
  const maxScrolls = 10;
  const step = Math.max(520, Math.floor(window.innerHeight * 0.75));

  for (let index = 0; index < maxScrolls; index += 1) {
    window.scrollBy(0, step);
    await wait(180);

    const boundary = getRecommendationBoundary();
    if (boundary && boundary.getBoundingClientRect().top < window.innerHeight * 1.25) {
      break;
    }

    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8) {
      break;
    }
  }

  window.scrollTo(0, originalY);
  await wait(120);
}

function scanTemuOrderItems() {
  const orderCards = findOrderItemCards();
  const cardItems = scanOrderCards(orderCards);

  if (cardItems.length > 0) {
    return cardItems;
  }

  const anchors = Array.from(document.querySelectorAll("a[href]"))
    .filter((anchor) => isLikelyProductUrl(anchor.href) && !isAfterRecommendationBoundary(anchor));
  const itemsByKey = new Map();

  for (const anchor of anchors) {
    const productUrl = normalizeAbsoluteUrl(anchor.href);

    if (!productUrl) {
      continue;
    }

    const card = findProductCard(anchor);
    if (!isCardInOrderContext(card)) {
      continue;
    }

    const item = extractItemFromCard(anchor, card, productUrl);
    const key = buildItemKey(productUrl, item);

    if (item && key && !itemsByKey.has(key)) {
      itemsByKey.set(key, item);
    }
  }

  return Array.from(itemsByKey.values());
}

function scanOrderCards(orderCards) {
  const itemsByKey = new Map();

  for (const card of orderCards) {
    const sourceElement = findPrimaryProductElement(card);
    const productUrl = findProductUrl(card);
    const item = extractItemFromCard(sourceElement, card, productUrl);
    const key = buildItemKey(productUrl, item);

    if (item && key && !itemsByKey.has(key)) {
      itemsByKey.set(key, item);
    }
  }

  return Array.from(itemsByKey.values());
}

function findOrderItemCards() {
  const candidates = [
    ...Array.from(document.querySelectorAll('[class*="_2NFJ2jka"]')),
    ...Array.from(document.querySelectorAll("img"))
      .filter((image) => isTemuProductImage(image))
      .map(findClosestOrderItemCard),
    ...Array.from(document.querySelectorAll("[aria-label]"))
      .filter((element) => isArticlePhotoLabel(element.getAttribute("aria-label")))
      .map(findClosestOrderItemCard)
  ];

  return [...new Set(candidates)]
    .filter((card) => card && isOrderProductCard(card));
}

function findClosestOrderItemCard(element) {
  let current = element;

  for (let depth = 0; current && depth < 7; depth += 1) {
    if (isOrderProductCard(current)) {
      return current;
    }

    current = current.parentElement;
  }

  return element.closest('[class*="_2NFJ2jka"]') || element;
}

function isOrderProductCard(element) {
  if (!element || isAfterRecommendationBoundary(element)) {
    return false;
  }

  const text = cleanText(element.innerText || element.textContent || "");
  const hasPhotoLabel = Boolean(element.querySelector && Array.from(element.querySelectorAll("[aria-label]")).some((item) => {
    return isArticlePhotoLabel(item.getAttribute("aria-label"));
  })) || isArticlePhotoLabel(element.getAttribute && element.getAttribute("aria-label"));
  const hasProductImage = Boolean(element.querySelector && Array.from(element.querySelectorAll("img")).some(isTemuProductImage));
  const hasPrice = findPurchasePrice(text) !== null;
  const hasQuantity = /[x×]\s*\d+/i.test(text);
  const hasOrderMarker = /(vendu par|exp[eé]di[eé]|suivre la commande|voir le re[cç]u|retourner\/rembourser|ajustement des prix)/i.test(text)
    || isOnOrderDetailPage();
  const isReasonableSize = text.length > 8 && text.length < 5200;

  return (hasPhotoLabel || hasProductImage) && hasPrice && hasQuantity && hasOrderMarker && isReasonableSize;
}

function isCardInOrderContext(card) {
  if (!card || isAfterRecommendationBoundary(card)) {
    return false;
  }

  const text = cleanText(card.innerText || card.textContent || "");
  return /(vendu par|exp[eé]di[eé]|suivre la commande|voir le re[cç]u|retourner\/rembourser|ajustement des prix|[x×]\s*\d+)/i.test(text);
}

function extractItemFromCard(sourceElement, card, productUrl) {
  const cardText = cleanText(card ? card.innerText || card.textContent : sourceElement.innerText || sourceElement.textContent);
  const imageUrl = findImageUrl(sourceElement, card);
  const title = findTitle(sourceElement, card, cardText, imageUrl);
  const variant = findVariant(cardText);
  const color = extractColorFromVariant(variant);
  const purchasePrice = findPurchasePrice(cardText);
  const quantity = findQuantity(cardText);

  if (!title && !productUrl) {
    return null;
  }

  const orderInfo = findOrderInfo(card || sourceElement);

  return {
    title: title || "Article Temu",
    purchasePrice,
    quantity,
    imageUrl,
    productUrl,
    orderPageUrl: window.location.href,
    orderId: orderInfo.orderId,
    orderDate: orderInfo.orderDate,
    variant,
    color,
    importKey: buildItemKey(productUrl, {
      title,
      imageUrl,
      purchasePrice,
      quantity,
      orderId: orderInfo.orderId,
      variant,
      color
    }),
    currency: "EUR"
  };
}

function findProductCard(anchor) {
  let current = anchor;
  let best = anchor;

  for (let depth = 0; current && depth < 8; depth += 1) {
    if (isAfterRecommendationBoundary(current)) {
      break;
    }

    const text = cleanText(current.innerText || "");
    const hasImage = Boolean(current.querySelector && current.querySelector("img"));
    const hasProductLink = Boolean(current.querySelector && Array.from(current.querySelectorAll("a[href]")).some((link) => isLikelyProductUrl(link.href)));
    const isTooLarge = text.length > 2400;

    if (hasImage && hasProductLink && text.length >= 8 && !isTooLarge) {
      best = current;
    }

    if (hasImage && hasProductLink && (findPurchasePrice(text) !== null || findQuantity(text) > 1) && !isTooLarge) {
      return current;
    }

    current = current.parentElement;
  }

  return best;
}

function findPrimaryProductElement(card) {
  if (!card || !card.querySelector) {
    return card;
  }

  return Array.from(card.querySelectorAll("[aria-label]")).find((element) => {
    return isArticlePhotoLabel(element.getAttribute("aria-label"));
  }) || card.querySelector('[class*="_2CzqyEwl"]') || card;
}

function findProductUrl(card) {
  if (!card || !card.querySelectorAll) {
    return "";
  }

  const directLink = Array.from(card.querySelectorAll("a[href]")).find((link) => {
    return isLikelyProductUrl(link.href);
  });

  if (directLink) {
    return normalizeAbsoluteUrl(directLink.href);
  }

  const elements = [card, ...Array.from(card.querySelectorAll("*")).slice(0, 140)];
  const urlAttributes = ["href", "data-href", "data-url", "data-link", "data-product-url", "data-target-url"];

  for (const element of elements) {
    for (const attribute of urlAttributes) {
      const value = element.getAttribute && element.getAttribute(attribute);
      if (value && isLikelyProductUrl(value)) {
        return normalizeAbsoluteUrl(value);
      }
    }
  }

  return "";
}

function findImageUrl(anchor, card) {
  const imageCandidates = [
    ...(anchor ? Array.from(anchor.querySelectorAll("img")) : []),
    ...(card ? Array.from(card.querySelectorAll("img")) : [])
  ];

  for (const image of imageCandidates) {
    const url = normalizeImageUrl(
      image.currentSrc
        || image.src
        || image.getAttribute("data-src")
        || image.getAttribute("data-original")
        || image.getAttribute("data-lazy-src")
        || ""
    );

    if (url) {
      return url;
    }
  }

  return "";
}

function findTitle(anchor, card, cardText, imageUrl) {
  const directCandidates = [
    ...findTextCandidates(card, '[class*="_2CzqyEwl"]'),
    ...findTextCandidates(card, "[data-title]"),
    findLikelyTitleLine(cardText),
    anchor.getAttribute("aria-label"),
    anchor.getAttribute("title"),
    anchor.innerText,
    card && card.getAttribute("aria-label")
  ];

  const image = imageUrl && card ? Array.from(card.querySelectorAll("img")).find((img) => {
    return normalizeImageUrl(img.currentSrc || img.src || "") === imageUrl;
  }) : null;

  if (image) {
    directCandidates.push(image.getAttribute("alt"));
  }

  for (const candidate of directCandidates) {
    const title = cleanTitle(candidate);
    if (title) {
      return title;
    }
  }

  const lines = cardText
    .split("\n")
    .map(cleanTitle)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  return lines[0] || "";
}

function cleanTitle(value) {
  const text = cleanText(value || "")
    .replace(/^photo de l['’]article\s*/i, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => {
      return line.length >= 5
        && line.length <= 180
        && !looksLikeUiLine(line)
        && !looksLikePriceLine(line)
        && !looksLikeQuantityLine(line)
        && !looksLikeVariantLine(line);
    });

  return text || "";
}

function looksLikeUiLine(line) {
  return /^(voir|ouvrir|details?|commande|remboursement|retour|suivi|livr[eé]e?|exp[eé]di[eé]|annuler|acheter|avis|total|sous-total|payer|recommander)$/i.test(line)
    || /(livraison|service client|politique|conditions|coupon|credit|message|panier|vendu par|exp[eé]di[eé]|ce qui est inclus|ajustement des prix|retourner\/rembourser|donner un avis|suivre la commande|voir le re[cç]u)/i.test(line);
}

function looksLikePriceLine(line) {
  return /(?:€|\beur\b|\btotal\b|\bprix\b)/i.test(line) && /\d/.test(line);
}

function looksLikeQuantityLine(line) {
  return /(?:\bx\s*\d+\b|quantit[eé]|qt[eé]|pcs?|pi[eè]ces?)/i.test(line);
}

function looksLikeVariantLine(line) {
  return /(taille de l['’]?[eé]tiquette|taille\s*:|couleur\s+|\/\s*taille|asian\s*[xsml]+)/i.test(line);
}

function findLikelyTitleLine(text) {
  const lines = cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const priceIndex = lines.findIndex(looksLikePriceLine);
  const searchLines = priceIndex > 0 ? lines.slice(0, priceIndex) : lines;

  return searchLines.find((line) => cleanTitle(line)) || "";
}

function findVariant(text) {
  const lines = cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const variantLine = lines.find((line) => {
    return /(taille de l['’]?[eé]tiquette|taille\s*:|couleur\s+|\/\s*taille|asian\s*[xsml]+)/i.test(line)
      && !looksLikePriceLine(line)
      && !looksLikeUiLine(line);
  });

  return cleanVariant(variantLine || "");
}

function cleanVariant(value) {
  return cleanText(value)
    .replace(/[【】]/g, "")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s*\/\s*/g, " / ")
    .trim();
}

function extractColorFromVariant(variant) {
  if (!variant) {
    return "";
  }

  const firstPart = variant.split("/")[0].trim();
  return firstPart
    .replace(/[【】]/g, "")
    .replace(/^couleur\s+/i, "")
    .replace(/^color\s+/i, "")
    .trim();
}

function findPurchasePrice(text) {
  const prices = [];
  const patterns = [
    /(?:€\s*)(\d+(?:[,.]\d{1,2})?)/g,
    /(\d+(?:[,.]\d{1,2})?)\s*(?:€|\beur\b)/gi
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(text);
    while (match) {
      const price = parsePrice(match[1]);
      if (price !== null) {
        prices.push(price);
      }
      match = pattern.exec(text);
    }
  }

  if (prices.length === 0) {
    return null;
  }

  return prices
    .filter((price) => price > 0)
    .sort((a, b) => a - b)[0] ?? null;
}

function findQuantity(text) {
  const patterns = [
    /[x×]\s*(\d+)\b/i,
    /\bqt[eé]\s*[:x]?\s*(\d+)\b/i,
    /\bquantit[eé]\s*[:x]?\s*(\d+)\b/i,
    /\b(\d+)\s*(?:pcs?|pi[eè]ces?|articles?)\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const quantity = Number(match[1]);
      if (Number.isFinite(quantity) && quantity > 0) {
        return Math.floor(quantity);
      }
    }
  }

  return 1;
}

function findOrderInfo(anchor) {
  let current = anchor;

  for (let depth = 0; current && depth < 10; depth += 1) {
    const text = cleanText(current.innerText || "");
    const orderId = findOrderId(text);
    const orderDate = findOrderDate(text);

    if (orderId || orderDate) {
      return { orderId, orderDate };
    }

    current = current.parentElement;
  }

  return { orderId: "", orderDate: "" };
}

function findOrderId(text) {
  const patterns = [
    /(?:commande|order)\s*(?:n[°o.]|id|#|:)?\s*([a-z0-9-]{6,})/i,
    /\bpo[-\s]?([a-z0-9-]{6,})\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return "";
}

function buildItemKey(productUrl, item) {
  const urlKey = normalizeUrlKey(productUrl);

  if (urlKey) {
    return [
      urlKey,
      item && (item.variant || item.color || ""),
      item && (item.imageUrl || ""),
      item && (item.purchasePrice === null ? "" : String(item.purchasePrice))
    ].join("|").toLowerCase();
  }

  if (!item) {
    return "";
  }

  return [
    item.orderId || "",
    item.title || "",
    item.variant || "",
    item.color || "",
    item.imageUrl || "",
    item.purchasePrice === null ? "" : String(item.purchasePrice),
    item.quantity || 1
  ].join("|").toLowerCase();
}

function findTextCandidates(root, selector) {
  if (!root || !root.querySelectorAll) {
    return [];
  }

  return Array.from(root.querySelectorAll(selector))
    .map((element) => element.getAttribute("data-title") || element.innerText || element.textContent || "")
    .filter(Boolean);
}

function isArticlePhotoLabel(value) {
  return /photo de l['’]article/i.test(String(value || ""));
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
    && !/upload_aimg\/hangyerw\/759016b3-9024-40c1-add7-bfcdd900456e/i.test(url);
}

function isOnOrderDetailPage() {
  return /order/i.test(window.location.pathname)
    || /parent_order_sn|order_sn|order_id/i.test(window.location.search);
}

function findOrderDate(text) {
  const patterns = [
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
    /\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/,
    /\b\d{1,2}\s+(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+\d{4}\b/i,
    /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return "";
}

function isAfterRecommendationBoundary(element) {
  const boundary = getRecommendationBoundary();

  if (!boundary || !element) {
    return false;
  }

  if (boundary === element || boundary.contains(element)) {
    return true;
  }

  const position = boundary.compareDocumentPosition(element);
  return Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING);
}

function getRecommendationBoundary() {
  if (getRecommendationBoundary.cached && document.contains(getRecommendationBoundary.cached)) {
    return getRecommendationBoundary.cached;
  }

  const selectors = [
    "h1",
    "h2",
    "h3",
    "h4",
    "[role='heading']",
    "section",
    "div",
    "span"
  ].join(",");
  const elements = Array.from(document.querySelectorAll(selectors));
  const boundary = elements.find((element) => {
    const text = cleanText(element.innerText || element.textContent || "");

    return text.length >= 4
      && text.length <= 90
      && isRecommendationHeading(text);
  }) || null;

  if (boundary) {
    getRecommendationBoundary.cached = boundary;
  }

  return boundary;
}

function isRecommendationHeading(text) {
  return /^(vous aimerez aussi|articles similaires|produits recommand[eé]s|recommandations?|pour vous|s[eé]lectionn[eé] pour vous|d[eé]couvrez aussi|les clients ont aussi|inspir[eé] de vos)/i.test(text)
    || /(vous aimerez aussi|articles similaires|produits recommand[eé]s|recommandations pour vous|s[eé]lectionn[eé] pour vous)/i.test(text);
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

    const isTemuHost = host === "temu.com"
      || host.endsWith(".temu.com")
      || host === "temu.fr"
      || host.endsWith(".temu.fr");

    if (!isTemuHost) {
      return false;
    }

    if (/(cart|checkout|order|orders|support|search|category|login|account)/i.test(parsed.pathname)) {
      return false;
    }

    return href.includes("goods_id=")
      || href.includes("product_id=")
      || href.includes("sku_id=")
      || href.includes("/goods")
      || href.includes("/product")
      || href.includes(".html");
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

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
