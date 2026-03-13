// api/update-artiste.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.paiementmusique.ca');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      customer_id,
      first_name,
      last_name,
      email,
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

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID requis' });
    }

    // Mettre à jour les informations de base du client
    const customerData = {
      customer: {
        id: customer_id,
        first_name,
        last_name,
        email,
        phone,
        addresses: [{
          address1,
          address2,
          city,
          country,
          province,
          zip
        }]
      }
    };

    const updateResponse = await fetch(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customer_id}.json`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify(customerData)
      }
    );

    const updateData = await updateResponse.json();

    if (!updateResponse.ok) {
      console.error('Shopify API Error:', updateData);
      return res.status(400).json({ 
        error: 'Erreur lors de la mise à jour',
        details: updateData.errors 
      });
    }

    // Mettre à jour les métachamps
    const metafields = [
      { key: 'compagnie', value: compagnie || '' },
      { key: 'statut', value: statut || '' },
      { key: 'association', value: association || '' },
      { key: 'numero_membre', value: numero_membre || '' },
      { key: 'numero_tps', value: numero_tps || '' },
      { key: 'numero_tvq', value: numero_tvq || '' }
    ];

    for (const field of metafields) {
      await fetch(
        `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customer_id}/metafields.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
          },
          body: JSON.stringify({
            metafield: {
              namespace: 'custom',
              key: field.key,
              value: field.value,
              type: 'single_line_text_field'
            }
          })
        }
      );
    }

    return res.status(200).json({ 
      success: true,
      message: 'Profil mis à jour avec succès!'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Une erreur est survenue',
      details: error.message 
    });
  }
};
