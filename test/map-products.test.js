import test from "node:test";
import assert from "node:assert/strict";
import { mapProductsToFeedItems } from "../src/map-products.js";

process.env.STORE_URL = "https://loja.exemplo";

const cats = [
  { id: 1, parent: null, name: { pt: "Shop" } },
  { id: 2, parent: 1, name: { pt: "Camisetas" } },
  { id: 3, parent: 2, name: { pt: "T-Shirts" } },
  { id: 9, parent: null, name: { pt: "PROMO 30% - Categoria" } },
  { id: 10, parent: null, name: { pt: "Oferta Relâmpago" } },
  { id: 11, parent: 10, name: { pt: "R$ 59" } }
];
const variant = (id, stock) => ({ id, stock, price: "99.00", values: [{ pt: String(id) }] });
const product = (id, variants, categories = cats) => ({
  id, name: { pt: "Camiseta" }, handle: { pt: "camiseta" }, categories,
  images: [{ src: "https://img/1.jpg" }], variants
});

test("labels de campanha sem acento, product_type em caminho sem PROMO", () => {
  const [item] = mapProductsToFeedItems([product(1, [variant(101, 5), variant(102, 5)])]);
  assert.equal(item.customLabel0, "Oferta Relampago");
  assert.equal(item.customLabel1, "R$ 59");
  assert.deepEqual(item.productTypes, ["Shop > Camisetas > T-Shirts"]);
  // faixa sem parent apontando para a campanha (caso real do feed de 06/11)
  const solta = cats.map((c) => (c.id === 11 ? { ...c, parent: 99 } : c));
  const [item2] = mapProductsToFeedItems([product(4, [variant(103, 5)], solta)]);
  assert.equal(item2.customLabel1, "R$ 59");
  assert.deepEqual(item2.productTypes, ["Shop > Camisetas > T-Shirts"]);
});

test("saúde da grade", () => {
  const grade = (vs) => mapProductsToFeedItems([product(2, vs, cats.slice(0, 3))])[0].customLabel2;
  assert.equal(grade([variant(1, 0)]), "sem_estoque"); // variante única sem estoque (correção de 31/10)
  assert.equal(grade([variant(1, 3)]), "grade_ok");
  assert.equal(grade([variant(1, 0), variant(2, 0)]), "sem_estoque");
  assert.equal(grade([variant(1, 2), variant(2, 0), variant(3, 0), variant(4, 0)]), "grade_quebrada");
  assert.equal(grade([variant(1, 2), variant(2, 2), variant(3, 0), variant(4, 0)]), "grade_ok");
  const [item] = mapProductsToFeedItems([product(3, [variant(1, 1)], cats.slice(0, 3))]);
  assert.equal(item.customLabel0, undefined);
});
