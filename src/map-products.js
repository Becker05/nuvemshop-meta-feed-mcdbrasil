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

function getAttributeLocalizedStrings(attr) {
  if (!attr) return [];
  if (typeof attr === "string") return [attr];
  if (typeof attr === "object") return Object.values(attr).filter((v) => typeof v === "string");
  return [];
}

function findSizeAttributeIndex(product) {
  if (!Array.isArray(product?.attributes)) return -1;
  return product.attributes.findIndex((attr) =>
    getAttributeLocalizedStrings(attr).some((str) => SIZE_ATTRIBUTE_REGEX.test(str))
  );
}

function getVariantSize(product, variant) {
  const index = findSizeAttributeIndex(product);
  if (index === -1 || !Array.isArray(variant?.values)) return null;
  return getLocalizedValue(variant.values[index]) || null;
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

function getProductTypes(product) {
  if (!Array.isArray(product.categories) || product.categories.length === 0) return [];
  return product.categories
    .map((cat) => getLocalizedValue(cat.name))
    .filter(Boolean);
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
    productTypes
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
    productTypes: baseItem.productTypes
  };
}

function mapVariantProduct(product, baseItem, variant) {
  const imageLink = getMainImage(product, variant);
  const additionalImageLinks = getAdditionalImageLinks(product, variant, imageLink);
  const price = normalizePrice(firstDefined(variant.price, product.price));
  const stock = firstDefined(variant.stock, variant.inventory, 0);

  if (!imageLink || !price) return null;

  const variantId = firstDefined(variant.id, variant.variant_id);

  return {
    id: String(variantId ?? `${product.id}-variant`),
    title: buildVariantTitle(baseItem.title, variant),
    description: baseItem.description,
    availability: normalizeAvailability(stock),
    quantity: Number(stock) || 0,
    size: getVariantSize(product, variant),
    condition: baseItem.condition,
    price,
    salePrice: variant.promotional_price ? normalizePrice(variant.promotional_price) : null,
    link: buildVariantUrl(baseItem.link, variant),
    imageLink,
    additionalImageLinks,
    brand: baseItem.brand,
    itemGroupId: baseItem.itemGroupId,
    productTypes: baseItem.productTypes
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
