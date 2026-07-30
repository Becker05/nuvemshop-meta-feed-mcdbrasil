# nuvemshop-meta-feed-mcdbrasil

Feed XML da Meta gerado a partir da Nuvemshop para a loja **MCD Brasil**.

## Uso local

```bash
npm install
cp .env.example .env   # preencher com as credenciais da loja
npm run generate
```

O arquivo gerado fica em `docs/feed-meta.xml`.

## Automação

O workflow `.github/workflows/generate-feed.yml` roda a cada hora via GitHub
Actions, gera o feed e faz commit automático em `docs/feed-meta.xml`. A URL
raw desse arquivo é a fonte de dados configurada no Meta Commerce Manager.
