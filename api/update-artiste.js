const { Resend } = require('resend');

module.exports = async function handler(req, res) {
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
      photo,
      cheque
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id est requis' });
    }

    const metafields = [];
    
    if (compagnie !== undefined) {
      metafields.push({ namespace: 'custom', key: 'compagnie', value: compagnie || '', type: 'single_line_text_field' });
    }
    if (statut !== undefined) {
      metafields.push({ namespace: 'custom', key: 'statut', value: statut || '', type: 'single_line_text_field' });
    }
    if (association !== undefined) {
      metafields.push({ namespace: 'custom', key: 'association', value: association || '', type: 'single_line_text_field' });
    }
    if (numero_membre !== undefined) {
      metafields.push({ namespace: 'custom', key: 'numero_membre', value: numero_membre || '', type: 'single_line_text_field' });
    }
    if (numero_tps !== undefined) {
      metafields.push({ namespace: 'custom', key: 'numero_tps', value: numero_tps || '', type: 'single_line_text_field' });
    }
    if (numero_tvq !== undefined) {
      metafields.push({ namespace: 'custom', key: 'numero_tvq', value: numero_tvq || '', type: 'single_line_text_field' });
    }

    const customerData = {
      customer: {
        id: customer_id,
        first_name,
        last_name,
        email,
        phone,
        addresses: [{ address1, address2, city, country, province, zip }],
        metafields: metafields
      }
    };

    const updateResponse = await fetch(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/customers/${customer_id}.json`,
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
      return res.status(400).json({ error: 'Erreur lors de la mise à jour', details: updateData.errors });
    }

    if (photo) {
      try {
        const photoGid = await uploadFileToShopify(photo, `photo_${customer_id}.jpg`, 'image/jpeg');
        if (photoGid) {
          await updateCustomerMetafield(customer_id, 'photo', photoGid);
        }
      } catch (error) {
        console.error('Error uploading photo:', error);
      }
    }

    if (cheque) {
      try {
        const chequeGid = await uploadFileToShopify(cheque, `cheque_${customer_id}.jpg`, 'image/jpeg');
        if (chequeGid) {
          await updateCustomerMetafield(customer_id, 'cheque', chequeGid);
        }
      } catch (error) {
        console.error('Error uploading cheque:', error);
      }
    }

    // ✅ NOUVEAU - Envoi du courriel de confirmation
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'noreply@paiementmusique.ca',
        to: email,
        subject: 'Confirmation de mise à jour de votre profil artiste',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a4d5c;">Bonjour ${first_name} ${last_name},</h2>
            <p>Votre profil artiste a été mis à jour avec succès.</p>
            <hr style="border-color: #ddd;">
            <h3 style="color: #1a4d5c;">Informations mises à jour :</h3>
            <ul>
              <li><strong>Nom :</strong> ${first_name} ${last_name}</li>
              <li><strong>Courriel :</strong> ${email}</li>
              <li><strong>Téléphone :</strong> ${phone || '-'}</li>
              <li><strong>Adresse :</strong> ${address1}${address2 ? ', ' + address2 : ''}, ${city}, ${province}, ${zip}</li>
              ${compagnie ? `<li><strong>Compagnie :</strong> ${compagnie}</li>` : ''}
              ${statut ? `<li><strong>Statut :</strong> ${statut}</li>` : ''}
              ${association ? `<li><strong>Association :</strong> ${association}</li>` : ''}
            </ul>
            <hr style="border-color: #ddd;">
            <p style="color: #666; font-size: 0.9em;">
              Si vous n'êtes pas à l'origine de cette modification, 
              contactez-nous immédiatement à <a href="mailto:info@paiementmusique.ca">info@paiementmusique.ca</a>.
            </p>
            <p>L'équipe Paiement Musique</p>
          </div>
        `
      });
      console.log('✅ Courriel de confirmation envoyé à:', email);
    } catch (emailError) {
      console.error('❌ Erreur envoi courriel:', emailError);
      // On ne bloque pas la réponse si le courriel échoue
    }

    return res.status(200).json({ success: true, message: 'Profil mis à jour avec succès!' });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Une erreur est survenue', details: error.message });
  }
};

// ... fonctions uploadFileToShopify et updateCustomerMetafield identiques
