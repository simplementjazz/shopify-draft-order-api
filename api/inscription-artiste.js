// api/inscription-artiste.js
export default async function handler(req, res) {
  // Autoriser les requêtes CORS depuis votre domaine
  res.setHeader('Access-Control-Allow-Origin', 'https://www.paiementmusique.ca');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      first_name,
      last_name,
      email,
      password,
      phone,
      address1,
      address2,
      city,
      country,
      province,
      zip,
      compagnie,
      statut,
      association,
      numero_membre,
      numero_tps,
      numero_tvq
    } = req.body;

    // Validation basique
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ 
        error: 'Les champs prénom, nom, email et mot de passe sont requis' 
      });
    }

    // Préparer les données du client
    const customerData = {
      customer: {
        first_name,
        last_name,
        email,
        phone,
        tags: 'artiste',
        addresses: [{
          address1,
          address2,
          city,
          country,
          province,
          zip
        }],
        metafields: [
          {
            namespace: 'custom',
            key: 'compagnie',
            value: compagnie || '',
            type: 'single_line_text_field'
          },
          {
            namespace: 'custom',
            key: 'statut',
            value: statut || '',
            type: 'single_line_text_field'
          },
          {
            namespace: 'custom',
            key: 'association',
            value: association || '',
            type: 'single_line_text_field'
          },
          {
            namespace: 'custom',
            key: 'numero_membre',
            value: numero_membre || '',
            type: 'single_line_text_field'
          },
          {
            namespace: 'custom',
            key: 'numero_tps',
            value: numero_tps || '',
            type: 'single_line_text_field'
          },
          {
            namespace: 'custom',
            key: 'numero_tvq',
            value: numero_tvq || '',
            type: 'single_line_text_field'
          }
        ]
      }
    };

    // Appel à l'API Shopify pour créer le client
    const shopifyResponse = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/customers.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify(customerData)
      }
    );

    const responseData = await shopifyResponse.json();

    if (!shopifyResponse.ok) {
      console.error('Shopify API Error:', responseData);
      return res.status(400).json({ 
        error: 'Erreur lors de la création du compte',
        details: responseData.errors 
      });
    }

    // Créer le compte avec mot de passe (nécessite une requête séparée)
    const customerId = responseData.customer.id;
    
    const accountActivationResponse = await fetch(
      ``${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customerId}/account_activation_url.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    const activationData = await accountActivationResponse.json();

    return res.status(200).json({ 
      success: true,
      message: 'Inscription réussie! Vérifiez votre email pour activer votre compte.',
      customer_id: customerId,
      activation_url: activationData.account_activation_url
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Une erreur est survenue lors de l\'inscription',
      details: error.message 
    });
  }
}
