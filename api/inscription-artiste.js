// api/inscription-artiste.js
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

  // ✅ Associations valides selon Shopify
  const associationsValides = ['UDA', 'GMMQ', 'AFM', 'Non-membre ou permissionaire', 'None'];

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
      numero_tvq,
      photo,
      cheque
    } = req.body;

    if (!first_name || !last_name || !email) {
      return res.status(400).json({ 
        error: 'Les champs prénom, nom et email sont requis' 
      });
    }

    const metafields = [];

    if (compagnie) metafields.push({ namespace: 'custom', key: 'compagnie', value: compagnie, type: 'single_line_text_field' });
    if (statut) metafields.push({ namespace: 'custom', key: 'statut', value: statut, type: 'single_line_text_field' });
    // ✅ Seulement si valeur valide
    if (association && associationsValides.includes(association)) {
      metafields.push({ namespace: 'custom', key: 'association', value: association, type: 'single_line_text_field' });
    }
    if (numero_membre) metafields.push({ namespace: 'custom', key: 'numero_membre', value: numero_membre, type: 'single_line_text_field' });
    if (numero_tps) metafields.push({ namespace: 'custom', key: 'numero_tps', value: numero_tps, type: 'single_line_text_field' });
    if (numero_tvq) metafields.push({ namespace: 'custom', key: 'numero_tvq', value: numero_tvq, type: 'single_line_text_field' });

    const customerData = {
      customer: {
        first_name,
        last_name,
        email,
        phone,
        tags: 'artiste',
        addresses: [{ address1, address2, city, country, province, zip }],
        metafields: metafields
      }
    };

    const shopifyResponse = await fetch(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/customers.json`,
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

    const customerId = responseData.customer.id;
    console.log('✅ Client créé:', customerId);

    // ✅ Upload photo si présente
    if (photo) {
      try {
        console.log('📤 Upload de la photo...');
        const photoUrl = await uploadFileToShopify(photo, `photo_${customerId}.jpg`, 'image/jpeg');
        if (photoUrl) {
          await updateCustomerMetafield(customerId, 'photo', photoUrl);
          console.log('✅ Photo uploadée et assignée:', photoUrl);
        }
      } catch (error) {
        console.error('❌ Error uploading photo:', error);
      }
    }

    // ✅ Upload chèque si présent
    if (cheque) {
      try {
        console.log('📤 Upload du chèque...');
        const chequeUrl = await uploadFileToShopify(cheque, `cheque_${customerId}.jpg`, 'image/jpeg');
        if (chequeUrl) {
          await updateCustomerMetafield(customerId, 'cheque', chequeUrl);
          console.log('✅ Chèque uploadé et assigné:', chequeUrl);
        }
      } catch (error) {
        console.error('❌ Error uploading cheque:', error);
      }
    }

    const accountActivationResponse = await fetch(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/customers/${customerId}/account_activation_url.json`,
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
};

async function uploadFileToShopify(fileBase64, filename, mimeType) {
  const FormData = require('form-data');
  const buffer = Buffer.from(fileBase64.split(',')[1], 'base64');

  const stagedUploadMutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `;

  const stagedResponse = await fetch(
    `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        query: stagedUploadMutation,
        variables: {
          input: [{ resource: "FILE", filename, mimeType, httpMethod: "POST" }]
        }
      })
    }
  );

  const stagedData = await stagedResponse.json();
  if (stagedData.data?.stagedUploadsCreate?.userErrors?.length > 0) {
    throw new Error(stagedData.data.stagedUploadsCreate.userErrors[0].message);
  }

  const stagedTarget = stagedData.data.stagedUploadsCreate.stagedTargets[0];
  const formData = new FormData();
  stagedTarget.parameters.forEach(param => formData.append(param.name, param.value));
  formData.append('file', buffer, filename);

  await fetch(stagedTarget.url, { method: 'POST', body: formData });

  const fileCreateMutation = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id }
        userErrors { field message }
      }
    }
  `;

  const fileCreateResponse = await fetch(
    `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        query: fileCreateMutation,
        variables: {
          files: [{ alt: filename, contentType: "IMAGE", originalSource: stagedTarget.resourceUrl }]
        }
      })
    }
  );

  const fileData = await fileCreateResponse.json();
  if (fileData.data?.fileCreate?.userErrors?.length > 0) {
    throw new Error(fileData.data.fileCreate.userErrors[0].message);
  }

  const fileGid = fileData.data.fileCreate.files[0].id;

  // ✅ Attendre le traitement Shopify
  await new Promise(resolve => setTimeout(resolve, 2000));

  // ✅ Récupérer l'URL publique
  const urlQuery = `
    query getFileUrl($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          image { url }
        }
      }
    }
  `;

  const urlResponse = await fetch(
    `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({ query: urlQuery, variables: { id: fileGid } })
    }
  );

  const urlData = await urlResponse.json();
  const publicUrl = urlData.data?.node?.image?.url;
  console.log('✅ URL publique:', publicUrl);
  return publicUrl;
}

async function updateCustomerMetafield(customerId, metafieldKey, fileUrl) {
  const getResponse = await fetch(
    `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/customers/${customerId}/metafields.json?namespace=custom&key=${metafieldKey}`,
    { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN } }
  );

  const getData = await getResponse.json();
  const existingMetafield = getData.metafields?.[0];

  // ✅ Type single_line_text_field pour stocker une URL
  const metafieldData = existingMetafield
    ? { id: existingMetafield.id, value: fileUrl }
    : { namespace: 'custom', key: metafieldKey, value: fileUrl, type: 'single_line_text_field' };

  await fetch(
    `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/customers/${customerId}.json`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({ customer: { id: customerId, metafields: [metafieldData] } })
    }
  );
}
