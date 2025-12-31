module.exports = async (req, res) => {
  // Configuration CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Gérer les requêtes OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { productId, productTitle, price, properties, customerEmail } = req.body;

    // Validation des données
    if (!productId || !productTitle || !price) {
      return res.status(400).json({ 
        error: 'Données manquantes',
        details: 'productId, productTitle et price sont requis'
      });
    }

    // Configuration de l'API Shopify
    const shopDomain = 'ick3df-yk.myshopify.com';
    const accessToken = process.env.SHOPIFY_ADMIN_TOKEN;

    if (!accessToken) {
      console.error('Token Shopify manquant');
      return res.status(500).json({ 
        error: 'Configuration serveur incorrecte',
        details: 'Token Shopify non configuré'
      });
    }

    // Préparer les custom attributes (properties)
    const customAttributes = Object.entries(properties || {}).map(([key, value]) => ({
      key,
      value: String(value)
    }));

    // Créer la draft order via l'API Shopify
    const draftOrderData = {
      draft_order: {
        line_items: [
          {
            title: productTitle,
            price: price,
            quantity: 1,
            custom_attributes: customAttributes
          }
        ],
        customer: customerEmail ? { email: customerEmail } : undefined,
        tags: 'draft-order, custom-pricing',
        note: 'Commande créée via formulaire personnalisé'
      }
    };

    console.log('Envoi à Shopify:', JSON.stringify(draftOrderData, null, 2));

    const response = await fetch(`https://${shopDomain}/admin/api/2024-01/draft_orders.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify(draftOrderData)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Shopify API Error:', responseData);
      return res.status(response.status).json({
        error: 'Erreur lors de la création de la commande',
        details: responseData
      });
    }

    console.log('Draft order créée:', responseData);

    // Retourner l'URL de l'invoice
    return res.status(200).json({
      success: true,
      draftOrderId: responseData.draft_order.id,
      invoiceUrl: responseData.draft_order.invoice_url,
      data: responseData.draft_order
    });

  } catch (error) {
    console.error('Erreur serveur:', error);
    return res.status(500).json({
      error: 'Erreur serveur',
      details: error.message
    });
  }
};
