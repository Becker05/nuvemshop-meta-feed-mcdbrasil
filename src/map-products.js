import he from "he";

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function getLocalizedValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;

  if (typeof value === "object") {
    return (
      value.pt ||
      value["pt-BR"] ||
      value.pt_BR ||
      value.es ||
      value.en ||
      Object.values(value).find((v) => typeof v === "string") ||
      ""
    );
  }

  return "";
}

function stripHtml(html = "") {
  return he.decode(String(html).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePrice(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return null;
  return number.toFixed(2);
}

function normalizeAvailability(stock) {
  const qty = Number(stock || 0);
  return qty > 0 ? "in stock" : "out of stock";
}

function buildProductUrl(handle) {
  const storeUrl = process.env.STORE_URL?.replace(/\/$/, "");

  if (!storeUrl) {
    throw new Error("STORE_URL não definido.");
  }

  const normalizedHandle = getLocalizedValue(handle);

  if (!normalizedHandle) return storeUrl;

  const productPath = (process.env.PRODUCT_URL_PATH || "produtos").replace(/^\/+|\/+$/g, "");

  return `${storeUrl}/${productPath}/${normalizedHandle}`;
}

function buildVariantUrl(productLink, variant) {
  const variantId = firstDefined(variant?.id, variant?.variant_id);
  if (!productLink || !variantId) return productLink;

  const separator = productLink.includes("?") ? "&" : "?";
  return `${productLink}${separator}variant=${variantId}`;
}

function getMainImage(product, variant) {
  const variantImage = firstDefined(
    variant?.image?.src,
    variant?.image?.url,
    variant?.image?.https
  );

  if (variantImage) return variantImage;

  const firstProductImage = Array.isArray(product.images) ? product.images[0] : null;

  return firstDefined(
    firstProductImage?.src,
    firstProductImage?.url,
    firstProductImage?.https,
    product.featured_image?.src,
    product.featured_image?.url
  );
}

function collectAllImages(product, variant) {
  const images = [];

  const pushIfString = (value) => {
    if (typeof value === "string" && value.trim()) {
      images.push(value.trim());
    }
  };

  pushIfString(variant?.image?.src);
  pushIfString(variant?.image?.url);
  pushIfString(variant?.image?.https);

  if (Array.isArray(variant?.images)) {
    for (const img of variant.images) {
      pushIfString(img?.src);
      pushIfString(img?.url);
      pushIfString(img?.https);
    }
  }

  if (Array.isArray(product?.images)) {
    for (const img of product.images) {
      pushIfString(img?.src);
      pushIfString(img?.url);
      pushIfString(img?.https);
    }
  }

  pushIfString(product?.featured_image?.src);
  pushIfString(product?.featured_image?.url);

  return [...new Set(images)];
}

function getAdditionalImageLinks(product, variant, mainImage) {
  return collectAllImages(product, variant).filter((image) => image !== mainImage);
}

const SIZE_ATTRIBUTE_REGEX = /tamanho|tamaño|talla|talle|\bsize\b/i;
const COLOR_ATTRIBUTE_REGEX = /\bcor\b|\bcolou?r\b/i;

function getAttributeLocalizedStrings(attr) {
  if (!attr) return [];
  if (typeof attr === "string") return [attr];
  if (typeof attr === "object") return Object.values(attr).filter((v) => typeof v === "string");
  return [];
}

function findAttributeIndex(product, regex) {
  if (!Array.isArray(product?.attributes)) return -1;
  return product.attributes.findIndex((attr) =>
    getAttributeLocalizedStrings(attr).some((str) => regex.test(str))
  );
}

function getVariantAttributeValue(product, variant, regex) {
  const index = findAttributeIndex(product, regex);
  if (index === -1 || !Array.isArray(variant?.values)) return null;
  return getLocalizedValue(variant.values[index]) || null;
}

function getVariantSize(product, variant) {
  return getVariantAttributeValue(product, variant, SIZE_ATTRIBUTE_REGEX);
}

function getVariantColor(product, variant) {
  return getVariantAttributeValue(product, variant, COLOR_ATTRIBUTE_REGEX);
}

function getVariantGtin(variant) {
  const barcode = String(variant?.barcode || "").trim();
  return barcode || null;
}

function buildVariantTitle(productName, variant) {
  const parts = [];

  if (Array.isArray(variant?.values)) {
    for (const value of variant.values) {
      const localized = getLocalizedValue(value);
      if (localized) parts.push(localized);
    }
  }

  const uniqueParts = [...new Set(parts.filter(Boolean))];

  return uniqueParts.length
    ? `${productName} (${uniqueParts.join(" / ")})`
    : productName;
}

function buildDescription(product, productName) {
  const description = stripHtml(
    getLocalizedValue(
      firstDefined(product.description, product.description_html, product.seo_description)
    )
  );

  if (description) return description;

  const triggerRegex = process.env.CUSTOM_DESCRIPTION_TRIGGER_REGEX;
  const customText = process.env.CUSTOM_DESCRIPTION_TEXT;

  if (triggerRegex && customText && new RegExp(triggerRegex, "i").test(productName || "")) {
    return customText;
  }

  return description;
}

function getBrand(product) {
  return firstDefined(
    product.brand,
    product.vendor,
    product.manufacturer,
    process.env.DEFAULT_BRAND,
    "Sem marca"
  );
}

// Categorias de desconto ocultas (ex.: "PROMO 30% - Categoria") não descrevem o produto: ficam fora do product_type.
const HIDDEN_CATEGORY_REGEX = new RegExp(process.env.HIDDEN_CATEGORY_REGEX || "^PROMO\\b|teste", "i");
// Categorias de campanha (ex.: "Oferta Relampago", "R$ 59", "Black Friday") viram custom_label_0 / custom_label_1,
// para os conjuntos de produtos do Meta filtrarem a ação sem lista manual.
const CAMPAIGN_CATEGORY_REGEX = new RegExp(process.env.CAMPAIGN_CATEGORY_REGEX || "^(oferta|black friday|bf\\b)", "i");
// Subcategoria da campanha (faixa de preço), usada quando a árvore da Nuvemshop não liga a faixa à categoria da campanha.
const SUBCAMPAIGN_CATEGORY_REGEX = new RegExp(process.env.SUBCAMPAIGN_CATEGORY_REGEX || "^R\\$\\s*\\d", "i");
let loggedSub = false;

function categoryNames(product) {
  if (!Array.isArray(product.categories)) return [];
  return product.categories.map((cat) => ({ id: cat.id, parent: cat.parent, subcategories: cat.subcategories, name: getLocalizedValue(cat.name) }))
    .filter((c) => c.name);
}

// Um único product_type, no formato de caminho que o Meta e o Google esperam ("Shop > Camisetas > T-Shirts"):
// a categoria mais profunda fora de PROMO e de campanha.
function getProductTypes(product) {
  const cats = categoryNames(product).filter((c) => !HIDDEN_CATEGORY_REGEX.test(c.name) && !CAMPAIGN_CATEGORY_REGEX.test(c.name) && !SUBCAMPAIGN_CATEGORY_REGEX.test(c.name));
  const byId = new Map(cats.map((c) => [c.id, c]));
  const pathOf = (c) => {
    const parts = [];
    let cur = c;
    for (let i = 0; cur && i < 6; i += 1) { parts.unshift(cur.name); cur = byId.get(cur.parent); }
    return parts;
  };
  const paths = cats.map(pathOf).sort((a, b) => b.length - a.length);
  return paths.length ? [paths[0].join(" > ")] : [];
}

// Saúde da grade: anúncio de produto com 1 tamanho converte pouco. "grade_ok" = 2+ tamanhos e pelo menos metade da grade
// com estoque; "grade_quebrada" = tem estoque, mas abaixo disso. Use no conjunto do Meta: custom_label_2 = grade_ok.
const MIN_SIZES = Number(process.env.MIN_SIZES_IN_STOCK || 2);
function getGradeLabel(product) {
  const vs = Array.isArray(product.variants) && product.variants.length > 0 ? product.variants : [product];
  const ok = vs.filter((v) => Number(firstDefined(v.stock, v.inventory, 0)) > 0).length;
  if (ok === 0) return "sem_estoque";
  if (vs.length === 1) return "grade_ok";
  return ok >= MIN_SIZES && ok >= vs.length / 2 ? "grade_ok" : "grade_quebrada";
}

// Rótulo sem acento ("Oferta Relâmpago" vira "Oferta Relampago"), igual ao do feed suplementar de 30/10:
// os conjuntos de produtos do Meta filtram pelo texto exato e não podem mudar na troca de fonte.
function toLabel(name) {
  return name ? name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : null;
}

function getCampaignLabels(product) {
  const all = categoryNames(product);
  const camp = all.find((c) => CAMPAIGN_CATEGORY_REGEX.test(c.name) && !c.parent) || all.find((c) => CAMPAIGN_CATEGORY_REGEX.test(c.name));
  if (!camp) return {};
  // ponytail: no feed de 06/11 as faixas "R$ 59/99/149/199" vieram sem parent igual ao id da "Oferta Relâmpago";
  // o fallback pega a faixa de preço pelo nome. Categoria de campanha com subcategoria de outro formato: ajustar o regex.
  const sub = all.find((c) => String(c.parent) === String(camp.id) || (camp.subcategories || []).map(String).includes(String(c.id)))
    || all.find((c) => c !== camp && SUBCAMPAIGN_CATEGORY_REGEX.test(c.name));
  if (sub && !loggedSub) {
    loggedSub = true;
    console.log(`Subcategoria de campanha: "${sub.name}" (parent ${sub.parent}) de "${camp.name}" (id ${camp.id}, parent ${camp.parent})`);
  }
  return { customLabel0: toLabel(camp.name), customLabel1: sub ? toLabel(sub.name) : null };
}

function buildBaseItem(product) {
  const name = getLocalizedValue(product.name);
  const description = buildDescription(product, name);
  const link = buildProductUrl(product.handle);
  const brand = getBrand(product);
  const productTypes = getProductTypes(product);

  return {
    productId: String(product.id),
    title: name,
    description,
    link,
    brand,
    condition: "new",
    itemGroupId: String(product.id),
    productTypes,
    customLabel2: getGradeLabel(product),
    ...getCampaignLabels(product)
  };
}

function mapSimpleProduct(product, baseItem) {
  const imageLink = getMainImage(product, null);
  const additionalImageLinks = getAdditionalImageLinks(product, null, imageLink);
  const price = normalizePrice(firstDefined(product.promotional_price, product.price));
  const stock = firstDefined(product.stock, product.inventory, 0);

  if (!baseItem.title || !imageLink || !price) return null;

  return {
    id: baseItem.productId,
    title: baseItem.title,
    description: baseItem.description,
    availability: normalizeAvailability(stock),
    quantity: Number(stock) || 0,
    condition: baseItem.condition,
    price,
    salePrice: product.promotional_price ? normalizePrice(product.promotional_price) : null,
    link: baseItem.link,
    imageLink,
    additionalImageLinks,
    brand: baseItem.brand,
    itemGroupId: null,
    identifierExists: "no",
    productTypes: baseItem.productTypes,
    customLabel0: baseItem.customLabel0,
    customLabel1: baseItem.customLabel1,
    customLabel2: baseItem.customLabel2
  };
}

function mapVariantProduct(product, baseItem, variant) {
  const imageLink = getMainImage(product, variant);
  const additionalImageLinks = getAdditionalImageLinks(product, variant, imageLink);
  const price = normalizePrice(firstDefined(variant.price, product.price));
  const stock = firstDefined(variant.stock, variant.inventory, 0);

  if (!imageLink || !price) return null;

  const variantId = firstDefined(variant.id, variant.variant_id);
  const gtin = getVariantGtin(variant);

  return {
    id: String(variantId ?? `${product.id}-variant`),
    title: buildVariantTitle(baseItem.title, variant),
    description: baseItem.description,
    availability: normalizeAvailability(stock),
    quantity: Number(stock) || 0,
    size: getVariantSize(product, variant),
    color: getVariantColor(product, variant),
    gtin,
    identifierExists: gtin ? null : "no",
    condition: baseItem.condition,
    price,
    salePrice: variant.promotional_price ? normalizePrice(variant.promotional_price) : null,
    link: buildVariantUrl(baseItem.link, variant),
    imageLink,
    additionalImageLinks,
    brand: baseItem.brand,
    itemGroupId: baseItem.itemGroupId,
    productTypes: baseItem.productTypes,
    customLabel0: baseItem.customLabel0,
    customLabel1: baseItem.customLabel1,
    customLabel2: baseItem.customLabel2
  };
}

function isVisibleProduct(product) {
  if (product.published === false) return false;
  if (product.visible === false) return false;
  if (product.active === false) return false;
  return true;
}

export function mapProductsToFeedItems(products) {
  const items = [];

  for (const product of products) {
    if (!isVisibleProduct(product)) continue;

    const baseItem = buildBaseItem(product);
    const variants = Array.isArray(product.variants) ? product.variants : [];

    if (variants.length > 0) {
      for (const variant of variants) {
        const item = mapVariantProduct(product, baseItem, variant);
        if (item) items.push(item);
      }
    } else {
      const item = mapSimpleProduct(product, baseItem);
      if (item) items.push(item);
    }
  }

  return items;
}
