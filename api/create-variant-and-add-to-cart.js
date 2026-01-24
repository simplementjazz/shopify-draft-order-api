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
    const { productId, productTitle, variant, line_items, note } = req.body;

    if (!productId || !variant || !variant.price) {
      return res.status(400).json({ 
        error: 'Données manquantes',
        details: 'productId, variant et variant.price sont requis'
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

    const priceFloat = parseFloat(variant.price);

    console.log('🔍 Recherche de variant existant avec prix:', priceFloat);

    // ========================================
    // ÉTAPE 1 : Récupérer tous les variants du produit
    // ========================================
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
      existingVariant = variantsData.variants.find(v => {
        const variantPrice = parseFloat(v.price);
        return Math.abs(variantPrice - priceFloat) < 0.01;
      });
    }

    let variantId;
    let variantTitle;

    if (existingVariant) {
      // Variant trouvé, on le réutilise
      variantId = existingVariant.id;
      variantTitle = existingVariant.title;
      console.log('✅ Variant existant trouvé:', variantId, '-', variantTitle);
    } else {
      // ========================================
      // ÉTAPE 3 : Créer un nouveau variant
      // ========================================
      console.log('➕ Création d\'un nouveau variant...');
      
      variantTitle = variant.title || `Prestation - ${priceFloat.toFixed(2)} $`;
      const variantSKU = `Prestation-${Date.now()}`;

      const variantData = {
        variant: {
          product_id: productId,
          option1: variantTitle,
          price: variant.price,
          sku: variantSKU,
          inventory_management: null,
          inventory_policy: 'continue'
        }
      };

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
        console.error('❌ Erreur création variant:', variantResponseData);
        return res.status(createVariantResponse.status).json({
          error: 'Erreur lors de la création du variant',
          details: variantResponseData
        });
      }

      variantId = variantResponseData.variant.id;
      variantTitle = variantResponseData.variant.title;
      console.log('✅ Nouveau variant créé:', variantId, '-', variantTitle);
    }

    // ========================================
    // ÉTAPE 4 : Créer le Draft Order
    // ========================================
    console.log('📝 Création du Draft Order...');

    // Préparer les properties pour le line item
    const properties = [];
    if (line_items && line_items[0] && line_items[0].properties) {
      line_items[0].properties.forEach(prop => {
        properties.push({
          name: prop.name,
          value: prop.value
        });
      });
    }

    // Calculer les frais d'administration (3% du sous-total)
    const subtotal = priceFloat;
    const adminFees = subtotal * 0.03;

    // Créer le Draft Order avec le variant + frais admin
    const draftOrderData = {
      draft_order: {
        line_items: [
          {
            variant_id: variantId,
            quantity: 1,
            properties: properties
          },
          {
            title: 'Frais d\'administration (3%)',
            price: adminFees.toFixed(2),
            quantity: 1,
            taxable: false
          }
        ],
        note: note || 'Commande musicien',
        use_customer_default_address: false
      }
    };

    console.log('📦 Données Draft Order:', JSON.stringify(draftOrderData, null, 2));

    const createDraftOrderResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/draft_orders.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify(draftOrderData)
      }
    );

    const draftOrderResponseData = await createDraftOrderResponse.json();

    if (!createDraftOrderResponse.ok) {
      console.error('❌ Erreur création Draft Order:', draftOrderResponseData);
      return res.status(createDraftOrderResponse.status).json({
        error: 'Erreur lors de la création du Draft Order',
        details: draftOrderResponseData
      });
    }

    const draftOrder = draftOrderResponseData.draft_order;
    console.log('✅ Draft Order créé:', draftOrder.id);
    console.log('💰 Sous-total:', subtotal.toFixed(2), '$');
    console.log('💰 Frais admin (3%):', adminFees.toFixed(2), '$');
    console.log('💰 Total:', (subtotal + adminFees).toFixed(2), '$');

    // ========================================
    // ÉTAPE 5 : Retourner l'URL de l'invoice
    // ========================================
    return res.status(200).json({
      success: true,
      variantId: variantId,
      variantTitle: variantTitle,
      draftOrderId: draftOrder.id,
      invoiceUrl: draftOrder.invoice_url,
      subtotal: subtotal.toFixed(2),
      adminFees: adminFees.toFixed(2),
      total: (subtotal + adminFees).toFixed(2),
      message: 'Draft Order créé avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur serveur:', error);
    return res.status(500).json({
      error: 'Erreur serveur',
      details: error.message
    });
  }
};
