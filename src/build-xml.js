import fs from "node:fs/promises";
import path from "node:path";

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function itemToXml(item) {
  const currency = process.env.CURRENCY || "BRL";
  const productTypeLines = Array.isArray(item.productTypes) && item.productTypes.length > 0
    ? item.productTypes.map((t) => `<g:product_type>${escapeXml(t)}</g:product_type>`).join("\n      ")
    : "";

  return `
    <item>
      <g:id>${escapeXml(item.id)}</g:id>
      <g:title>${escapeXml(item.title)}</g:title>
      <g:description>${escapeXml(item.description || "")}</g:description>
      <g:availability>${escapeXml(item.availability)}</g:availability>
      <g:quantity_to_sell_on_facebook>${escapeXml(String(item.quantity ?? 0))}</g:quantity_to_sell_on_facebook>
      <g:condition>${escapeXml(item.condition)}</g:condition>
      <g:price>${escapeXml(`${item.price} ${currency}`)}</g:price>
      ${item.salePrice ? `<g:sale_price>${escapeXml(`${item.salePrice} ${currency}`)}</g:sale_price>` : ""}
      <g:link>${escapeXml(item.link)}</g:link>
      <g:image_link>${escapeXml(item.imageLink)}</g:image_link>
      <g:brand>${escapeXml(item.brand || "")}</g:brand>
      ${item.itemGroupId ? `<g:item_group_id>${escapeXml(item.itemGroupId)}</g:item_group_id>` : ""}
      ${item.size ? `<g:size>${escapeXml(item.size)}</g:size>` : ""}
      ${item.color ? `<g:color>${escapeXml(item.color)}</g:color>` : ""}
      ${item.gtin ? `<g:gtin>${escapeXml(item.gtin)}</g:gtin>` : ""}
      ${item.identifierExists ? `<g:identifier_exists>${escapeXml(item.identifierExists)}</g:identifier_exists>` : ""}
      ${productTypeLines}
    </item>
  `.trim();
}

export async function buildXml(items) {
  const storeName = process.env.STORE_NAME || "Minha Loja";
  const storeUrl = process.env.STORE_URL || "https://www.exemplo.com.br";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${escapeXml(storeName)}</title>
    <link>${escapeXml(storeUrl)}</link>
    <description>${escapeXml(`Feed de produtos de ${storeName} para Meta`)}</description>
    ${items.map(itemToXml).join("\n    ")}
  </channel>
</rss>
`;

  const outputDir = path.resolve("docs");
  const outputFile = path.join(outputDir, "feed-meta.xml");

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputFile, xml, "utf8");

  return outputFile;
}
