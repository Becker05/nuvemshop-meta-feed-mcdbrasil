const API_BASE = "https://api.nuvemshop.com.br/v1";

function getHeaders() {
  const token = process.env.NUVEMSHOP_ACCESS_TOKEN;
  const userAgent = process.env.NUVEMSHOP_USER_AGENT;

  if (!token) {
    throw new Error("NUVEMSHOP_ACCESS_TOKEN não definido.");
  }

  if (!userAgent) {
    throw new Error("NUVEMSHOP_USER_AGENT não definido.");
  }

  return {
    Authentication: `bearer ${token}`,
    "User-Agent": userAgent,
    "Content-Type": "application/json"
  };
}

function getStoreId() {
  const storeId = process.env.NUVEMSHOP_STORE_ID;

  if (!storeId) {
    throw new Error("NUVEMSHOP_STORE_ID não definido.");
  }

  return storeId;
}

async function requestJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders()
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Erro na API da Nuvemshop: ${response.status} - ${body}`);
  }

  return response.json();
}

export async function fetchProducts() {
  const storeId = getStoreId();
  const pageSize = Number(process.env.PAGE_SIZE || 200);

  let page = 1;
  let allProducts = [];

  while (true) {
    const url = `${API_BASE}/${storeId}/products?page=${page}&per_page=${pageSize}`;
    const batch = await requestJson(url);

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    allProducts = allProducts.concat(batch);

    if (batch.length < pageSize) {
      break;
    }

    page += 1;
  }

  return allProducts;
}
