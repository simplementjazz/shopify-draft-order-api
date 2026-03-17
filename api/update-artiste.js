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
      numero_tvq,
      specimen_cheque_url,
      photo_profil_url
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID requis' });
    }

    // Récupérer d'abord les données actuelles du client
    const getCustomerResponse = await fetch(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customer_id}.json`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    const currentCustomerData = await getCustomerResponse.json();
    const defaultAddressId = currentCustomerData.customer.default_address?.id;

    // Mettre à jour les informations de base du client (seulement si fournies)
    if (first_name || last_name || email) {
      const customerData = {
        customer: {
          id: customer_id
        }
      };

      if (first_name) customerData.customer.first_name = first_name;
      if (last_name) customerData.customer.last_name = last_name;
      if (email) customerData.customer.email = email;

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
    }

    // Mettre à jour l'adresse séparément (avec le téléphone)
    if (address1 || city || country || province || zip || phone) {
      if (defaultAddressId) {
        const addressData = {
          address: {}
        };

        if (address1) addressData.address.address1 = address1;
        if (address2 !== undefined) addressData.address.address2 = address2;
        if (city) addressData.address.city = city;
        if (country) addressData.address.country = country;
        if (province) addressData.address.province = province;
        if (zip) addressData.address.zip = zip;
        if (phone) addressData.address.phone = phone;

        const addressResponse = await fetch(
          `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customer_id}/addresses/${defaultAddressId}.json`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
            },
            body: JSON.stringify(addressData)
          }
        );

        if (!addressResponse.ok) {
          const addressError = await addressResponse.json();
          console.error('Address update error:', addressError);
        }
      } else {
        // Si pas d'adresse par défaut, en créer une
        await fetch(
          `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customer_id}/addresses.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
            },
            body: JSON.stringify({
              address: {
                address1,
                address2,
                city,
                country,
                province,
                zip,
                phone,
                default: true
              }
            })
          }
        );
      }
    }

    // Préparer les métachamps à mettre à jour
    const metafields = [];
    
    if (compagnie !== undefined) metafields.push({ key: 'compagnie', value: compagnie || '' });
    if (statut !== undefined) metafields.push({ key: 'statut', value: statut || '' });
    if (association !== undefined) metafields.push({ key: 'association', value: association || '' });
    if (numero_membre !== undefined) metafields.push({ key: 'numero_membre', value: numero_membre || '' });
    if (numero_tps !== undefined) metafields.push({ key: 'numero_tps', value: numero_tps || '' });
    if (numero_tvq !== undefined) metafields.push({ key: 'numero_tvq', value: numero_tvq || '' });
    if (specimen_cheque_url !== undefined) metafields.push({ key: 'specimen_cheque_url', value: specimen_cheque_url || '' });
    if (photo_profil_url !== undefined) metafields.push({ key: 'photo_profil_url', value: photo_profil_url || '' });

    // Récupérer les métachamps existants
    if (metafields.length > 0) {
      const metafieldsResponse = await fetch(
        `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customer_id}/metafields.json`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
          }
        }
      );

      const existingMetafields = await metafieldsResponse.json();
      const metafieldsMap = {};
      
      if (existingMetafields.metafields) {
        existingMetafields.metafields.forEach(mf => {
          if (mf.namespace === 'custom') {
            metafieldsMap[mf.key] = mf.id;
          }
        });
      }

      // Mettre à jour ou créer chaque métachamp
      for (const field of metafields) {
        const metafieldId = metafieldsMap[field.key];
        
        if (metafieldId) {
          // Mettre à jour le métachamp existant
          await fetch(
            `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customer_id}/metafields/${metafieldId}.json`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
              },
              body: JSON.stringify({
                metafield: {
                  id: metafieldId,
                  value: field.value,
                  type: 'single_line_text_field'
                }
              })
            }
          );
        } else {
          // Créer un nouveau métachamp
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
      }
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
