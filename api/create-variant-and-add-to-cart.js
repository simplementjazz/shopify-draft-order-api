module.exports = async (req, res) => {
  // Configuration CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { productId, productTitle, price, properties } = req.body;

    if (!productId || !price) {
      return res.status(400).json({ 
        error: 'Données manquantes',
        details: 'productId et price sont requis'
      });
    }

    const shopDomain = 'ick3df-yk.myshopify.com';
    const accessToken = process.env.SHOPIFY_ADMIN_TOKEN;

    if (!accessToken) {
      return res.status(500).json({ 
        error: 'Configuration serveur incorrecte',
        details: 'Token Shopify non configuré'
      });
    }

    // Créer un titre unique pour le variant
    const secteur = properties['Secteur'] || '';
    const total = properties['_Total à payer'] || price;
    const timestamp = Date.now();
    
    // Titre unique avec timestamp pour éviter les doublons
    const variantTitle = `${secteur} - ${total} - ${timestamp}`;
    const variantSKU = `CUSTOM-${timestamp}`;

    // Créer le variant via l'API Shopify
    const variantData = {
      variant: {
        product_id: productId,
        option1: variantTitle,
        price: price,
        sku: variantSKU,
        inventory_management: null,
        inventory_policy: 'continue'
      }
    };

    console.log('Création du variant:', JSON.stringify(variantData, null, 2));

    const createVariantResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/products/${productId}/variants.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify(variantData)
      }
    );

    const variantResponseData = await createVariantResponse.json();

    if (!createVariantResponse.ok) {
      console.error('Erreur création variant:', variantResponseData);
      return res.status(createVariantResponse.status).json({
        error: 'Erreur lors de la création du variant',
        details: variantResponseData
      });
    }

    const variantId = variantResponseData.variant.id;
    console.log('Variant créé avec succès:', variantId);

    // Préparer les properties pour le panier
    const cartProperties = {};
    Object.entries(properties || {}).forEach(([key, value]) => {
      cartProperties[key] = String(value);
    });

    // Retourner les informations pour ajouter au panier côté client
    return res.status(200).json({
      success: true,
      variantId: variantId,
      variantTitle: variantTitle,
      price: price,
      properties: cartProperties,
      message: 'Variant créé avec succès'
    });

  } catch (error) {
    console.error('Erreur serveur:', error);
    return res.status(500).json({
      error: 'Erreur serveur',
      details: error.message
    });
  }
};
