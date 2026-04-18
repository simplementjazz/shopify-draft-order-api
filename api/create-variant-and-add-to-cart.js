module.exports = async (req, res) => {
  console.log('🔍 SHOPIFY_STORE_URL:', process.env.SHOPIFY_STORE_URL);
  console.log('🔍 Token présent:', process.env.SHOPIFY_ACCESS_TOKEN ? 'OUI' : 'NON');
  console.log('🔍 Token début:', process.env.SHOPIFY_ACCESS_TOKEN?.substring(0, 10));

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

    const shopDomain = process.env.SHOPIFY_STORE_URL;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!shopDomain || !accessToken) {
      return res.status(500).json({ 
        error: 'Configuration serveur incorrecte',
        details: 'SHOPIFY_STORE_URL ou SHOPIFY_ACCESS_TOKEN non configuré'
      });
    }

    const secteur = properties['Secteur'] || '';
    const priceFloat = parseFloat(price);

    console.log('🔍 Recherche de variant existant avec prix:', priceFloat);

    // ========================================
    // ÉTAPE 1 : Récupérer tous les variants du produit
    // ========================================
    const getVariantsResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-10/products/${productId}/variants.json?limit=250`,
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
      console.error('❌ Erreur récupération variants:', variantsData);
      return res.status(getVariantsResponse.status).json({
        error: 'Erreur lors de la récupération des variants',
        details: variantsData
      });
    }

    // ========================================
    // ÉTAPE 2 : Chercher un variant avec le même prix
    // ========================================
    let existingVariant = null;
    
    if (variantsData.variants && variantsData.variants.length > 0) {
      existingVariant = variantsData.variants.find(variant => {
        const variantPrice = parseFloat(variant.price);
        return Math.abs(variantPrice - priceFloat) < 0.01;
      });
    }

    let variantId;
    let variantTitle;
    let isNewVariant = false;

    if (existingVariant) {
      // ========================================
      // ÉTAPE 3A : Variant trouvé, on le réutilise
      // ========================================
      variantId = existingVariant.id;
      variantTitle = existingVariant.title;
      console.log('✅ Variant existant trouvé:', variantId, '-', variantTitle);

    } else {
      // ========================================
      // ÉTAPE 3B : Aucun variant trouvé, on en crée un nouveau
      // ========================================
      console.log('➕ Création d\'un nouveau variant...');
      
      variantTitle = `${secteur} - ${priceFloat.toFixed(2)} $`;
      const variantSKU = `Prestation-${Date.now()}`;

      const variantData = {
        variant: {
          product_id: productId,
          option1: variantTitle,
          price: price,
          sku: variantSKU,
          inventory_management: null,   // ✅ Stock non suivi
          inventory_policy: 'continue',
          requires_shipping: false       // ✅ Pas un produit physique
        }
      };

      console.log('📦 Création du variant:', JSON.stringify(variantData, null, 2));

      const createVariantResponse = await fetch(
        `https://${shopDomain}/admin/api/2024-10/products/${productId}/variants.json`,
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
        console.error('❌ Erreur création variant:', variantResponseData);
        return res.status(createVariantResponse.status).json({
          error: 'Erreur lors de la création du variant',
          details: variantResponseData
        });
      }

      variantId = variantResponseData.variant.id;
      variantTitle = variantResponseData.variant.title;
      isNewVariant = true;
      console.log('✅ Nouveau variant créé:', variantId, '-', variantTitle);

      // ========================================
      // ÉTAPE 3C : Forcer tracked:false sur l'inventory_item
      // ========================================
      const inventoryItemId = variantResponseData.variant.inventory_item_id;

      try {
        const inventoryPatchResponse = await fetch(
          `https://${shopDomain}/admin/api/2024-10/inventory_items/${inventoryItemId}.json`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken
            },
            body: JSON.stringify({
              inventory_item: {
                id: inventoryItemId,
                tracked: false,
                requires_shipping: false
              }
            })
          }
        );

        if (inventoryPatchResponse.ok) {
          console.log('✅ inventory_item mis à jour: tracked=false, requires_shipping=false');
        } else {
          const inventoryError = await inventoryPatchResponse.json();
          console.warn('⚠️ Avertissement mise à jour inventory_item:', inventoryError);
        }
      } catch (inventoryErr) {
        // Non bloquant : on continue même si ce PATCH échoue
        console.warn('⚠️ Erreur non bloquante inventory_item:', inventoryErr.message);
      }
    }

    // ========================================
    // ÉTAPE 4 : Préparer les properties pour le panier
    // ========================================
    const cartProperties = {};
    Object.entries(properties || {}).forEach(([key, value]) => {
      cartProperties[key] = String(value);
    });

    // ========================================
    // ÉTAPE 5 : Retourner les informations
    // ========================================
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
    console.error('❌ Erreur serveur:', error);
    return res.status(500).json({
      error: 'Erreur serveur',
      details: error.message
    });
  }
};
