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

    const secteur = properties['Secteur'] || '';
    const total = properties['_Total à payer'] || price;
    const priceFloat = parseFloat(price);

    console.log('Recherche de variant existant avec prix:', priceFloat);

    // ÉTAPE 1 : Récupérer tous les variants du produit
    const getVariantsResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/products/${productId}/variants.json?limit=250`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        }
      }
    );

    const variantsData = await getVariantsResponse.json();

    if (!getVariantsResponse.ok) {
      console.error('Erreur récupération variants:', variantsData);
      return res.status(getVariantsResponse.status).json({
        error: 'Erreur lors de la récupération des variants',
        details: variantsData
      });
    }

    // ÉTAPE 2 : Chercher un variant avec le même prix
    let existingVariant = null;
    
    if (variantsData.variants && variantsData.variants.length > 0) {
      existingVariant = variantsData.variants.find(variant => {
        const variantPrice = parseFloat(variant.price);
        return Math.abs(variantPrice - priceFloat) < 0.01; // Comparaison avec tolérance de 1 cent
      });
    }

    let variantId;
    let variantTitle;
    let isNewVariant = false;

    if (existingVariant) {
      // ÉTAPE 3A : Variant trouvé, on le réutilise
      variantId = existingVariant.id;
      variantTitle = existingVariant.title;
      console.log('✅ Variant existant trouvé:', variantId, '-', variantTitle);
    } else {
      // ÉTAPE 3B : Aucun variant trouvé, on en crée un nouveau
      console.log('❌ Aucun variant trouvé avec ce prix, création d\'un nouveau...');
      
      variantTitle = `${secteur} - ${total}`;
      const variantSKU = `CUSTOM-${Date.now()}`;

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

      variantId = variantResponseData.variant.id;
      variantTitle = variantResponseData.variant.title;
      isNewVariant = true;
      console.log('✅ Nouveau variant créé:', variantId, '-', variantTitle);
    }

    // ÉTAPE 4 : Préparer les properties pour le panier
    const cartProperties = {};
    Object.entries(properties || {}).forEach(([key, value]) => {
      cartProperties[key] = String(value);
    });

    // ÉTAPE 5 : Retourner les informations pour ajouter au panier
    return res.status(200).json({
      success: true,
      variantId: variantId,
      variantTitle: variantTitle,
      price: price,
      properties: cartProperties,
      isNewVariant: isNewVariant,
      message: isNewVariant ? 'Nouveau variant créé' : 'Variant existant réutilisé'
    });

  } catch (error) {
    console.error('Erreur serveur:', error);
    return res.status(500).json({
      error: 'Erreur serveur',
      details: error.message
    });
  }
};
