// api/create-draft-order.js
export default async function handler(req, res) {
  // Autoriser les requêtes depuis votre domaine Shopify uniquement
  res.setHeader('Access-Control-Allow-Origin', 'https://ick3df-yk.myshopify.com');
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
    
    // Validation
    if (!productId || !price || !properties) {
      return res.status(400).json({ 
        success: false, 
        error: 'Données manquantes' 
      });
    }

    // Configuration Shopify
    const SHOPIFY_STORE = 'ick3df-yk.myshopify.com';
    const ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN; // Votre token ici
    const API_VERSION = '2024-10';

    // Préparer les line item properties pour Shopify
    const lineItemProperties = Object.entries(properties).map(([key, value]) => ({
      name: key,
      value: value
    }));

    // Créer la draft order via l'API Shopify
    const draftOrderPayload = {
      draft_order: {
        line_items: [
          {
            title: productTitle,
            price: price,
            quantity: 1,
            properties: lineItemProperties
          }
        ],
        email: customerEmail || null,
        note: `Commande créée via formulaire personnalisé - ${new Date().toISOString()}`,
        tags: ['prestation-musicien', 'formulaire-custom']
      }
    };

    // Appel API Shopify
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/draft_orders.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': ADMIN_API_TOKEN
        },
        body: JSON.stringify(draftOrderPayload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Shopify API Error:', data);
      return res.status(500).json({ 
        success: false, 
        error: 'Erreur lors de la création de la commande',
        details: data.errors 
      });
    }

    // Récupérer l'URL de l'invoice
    const draftOrder = data.draft_order;
    const invoiceUrl = draftOrder.invoice_url;

    return res.status(200).json({
      success: true,
      invoiceUrl: invoiceUrl,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name
    });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur',
      message: error.message 
    });
  }
}
