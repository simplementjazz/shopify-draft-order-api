import { google } from 'googleapis';
import crypto from 'crypto';

// ── Validation HMAC Shopify ──────────────────────────────
function validateHmac(req, rawBody) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('base64');
  return hmac === digest;
}

// ── Appel Admin GraphQL ──────────────────────────────────
async function shopifyGraphQL(query, variables) {
  const res = await fetch(
    `https://paiementmusique.myshopify.com/admin/api/2025-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  const { data } = await res.json();
  return data;
}

// ── Récupérer le CustomerId depuis le produit ────────────
async function getProductCustomerId(productId) {
  const data = await shopifyGraphQL(`
    query($id: ID!) {
      product(id: $id) {
        metafields(first: 20) {
          edges { node { namespace key value } }
        }
      }
    }
  `, { id: `gid://shopify/Product/${productId}` });

  const metas = data.product.metafields.edges.map(e => e.node);
  const field = metas.find(m => m.key === 'customer_id'); // ← adapte le key
  return field?.value || null;
}

// ── Récupérer les métadonnées client ─────────────────────
async function getCustomerMetafields(customerId) {
  const data = await shopifyGraphQL(`
    query($id: ID!) {
      customer(id: $id) {
        metafields(first: 20) {
          edges { node { namespace key value } }
        }
      }
    }
  `, { id: `gid://shopify/Customer/${customerId}` });

  return Object.fromEntries(
    data.customer.metafields.edges.map(e => [
      `${e.node.namespace}.${e.node.key}`,
      e.node.value
    ])
  );
}

// ── Append Google Sheets ─────────────────────────────────
async function appendToSheet(rows) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Sheet1!A1',
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

// ── Handler principal ────────────────────────────────────
export default async function handler(req, res) {
  const rawBody = await getRawBody(req); // ex: avec 'raw-body' npm
  if (!validateHmac(req, rawBody)) {
    return res.status(401).json({ error: 'Invalid HMAC' });
  }

  const checkout = JSON.parse(rawBody);
  const rows = [];

  for (const item of checkout.line_items) {
    const props = Object.fromEntries(
      (item.properties || []).map(p => [p.name, p.value])
    );

    // 1. Récupérer le customer_id depuis le produit
    const customerId = await getProductCustomerId(item.product_id);

    // 2. Récupérer les métadonnées client
    let clientMeta = {};
    if (customerId) {
      clientMeta = await getCustomerMetafields(customerId);
    }

    // 3. Assembler la ligne
    rows.push([
      clientMeta['custom.association']       || '',  // Client.Association
      props['Production']                    || '',  // Prestation.Production
      props['Date de la prestation']         || '',  // Prestation.Date
      props['Secteur']                       || '',  // Prestation.Secteur
      props['Cachet']                        || '',  // Prestation.Cachet
      props['Taux horaire']                  || '',  // Répétition.TauxHoraire
      props["Nombre d'heures"]               || '',  // Répétition.NombreHeures
      item.title                             || '',  // Produit.Nom
      clientMeta['custom.producteur']        || '',  // Client.Producteur
      clientMeta['custom.numero_de_membre']  || '',  // Client.NumeroMembre
    ]);
  }

  await appendToSheet(rows);
  res.status(200).json({ ok: true });
}

