// api/update-artiste.js
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

  const associationsValides = ['UDA', 'GMMQ', 'AFM', 'Non-membre ou permissionaire', 'None'];

  try {
    const {
      customer_id, first_name, last_name, email, phone,
      address1, address2, city, country, province, zip,
      compagnie, statut, association, numero_membre,
      numero_tps, numero_tvq, photo, cheque
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id est requis' });
    }

    const existingMetafields = await getExistingMetafields(customer_id);
    const findExisting = (key) => existingMetafields.find(m => m.key === key);

    const metafields = [];

    if (compagnie !== undefined) {
      const ex = findExisting('compagnie');
      metafields.push(ex
        ? { id: ex.id, value: compagnie || '' }
        : { namespace: 'custom', key: 'compagnie', value: compagnie || '', type: 'single_line_text_field' });
    }
    if (statut !== undefined) {
      const ex = findExisting('statut');
      metafields.push(ex
        ? { id: ex.id, value: statut || '' }
        : { namespace: 'custom', key: 'statut', value: statut || '', type: 'single_line_text_field' });
    }
    if (association !== undefined && associationsValides.includes(association)) {
      const ex = findExisting('association');
      metafields.push(ex
        ? { id: ex.id, value: association || '' }
        : { namespace: 'custom', key: 'association', value: association || '', type: 'single_line_text_field' });
    }
    if (numero_membre !== undefined) {
      const ex = findExisting('numero_membre');
      metafields.push(ex
        ? { id: ex.id, value: numero_membre || '' }
        : { namespace: 'custom', key: 'numero_membre', value: numero_membre || '', type: 'single_line_text_field' });
    }
    if (numero_tps !== undefined) {
      const ex = findExisting('numero_tps');
      metafields.push(ex
        ? { id: ex.id, value: numero_tps || '' }
        : { namespace: 'custom', key: 'numero_tps', value: numero_tps || '', type: 'single_line_text_field' });
    }
    if (numero_tvq !== undefined) {
      const ex = findExisting('numero_tvq');
      metafields.push(ex
        ? { id: ex.id, value: numero_tvq || '' }
        : { namespace: 'custom', key: 'numero_tvq', value: numero_tvq || '', type: 'single_line_text_field' });
    }

    const customerData = {
      customer: {
        id: customer_id, first_name, last_name, email, phone,
        addresses: [{ address1, address2, city, country, province, zip }],
        metafields
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
        const photoUrl = await uploadFileToShopify(photo, `photo_${customer_id}.jpg`, 'image/jpeg');
        if (photoUrl) {
          await updateCustomerMetafield(customer_id, 'photo', photoUrl);
          console.log('✅ Photo uploadée:', photoUrl);
        }
      } catch (error) {
        console.error('Error uploading photo:', error);
      }
    }

    if (cheque) {
      try {
        const chequeUrl = await uploadFileToShopify(cheque, `cheque_${customer_id}.jpg`, 'image/jpeg');
        if (chequeUrl) {
          await updateCustomerMetafield(customer_id, 'cheque', chequeUrl);
          console.log('✅ Chèque uploadé:', chequeUrl);
        }
      } catch (error) {
        console.error('Error uploading cheque:', error);
      }
    }

    return res.status(200).json({ success: true, message: 'Profil mis à jour avec succès!' });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Une erreur est survenue', details: error.message });
  }
};

async function getExistingMetafields(customerId) {
  const response = await fetch(
    `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/customers/${customerId}/metafields.json?namespace=custom`,
    { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN } }
  );
  const data = await response.json();
  return data.metafields || [];
}

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
          input: [{ resource: "IMAGE", filename, mimeType, httpMethod: "POST" }]
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
  console.log('🔍 fileGid:', fileGid);

  // ✅ Polling jusqu'à ce que l'URL soit disponible (max 10 tentatives x 2s = 20s)
  const urlQuery = `
    query getFileUrl($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          image { url }
        }
      }
    }
  `;

  let publicUrl = null;
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));

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
    console.log('🔍 urlData brut:', JSON.stringify(urlData.data?.node, null, 2)); // ✅ AJOUT
    publicUrl = urlData.data?.node?.image?.url;
    console.log(`🔍 Tentative ${i + 1} - URL:`, publicUrl);

    if (publicUrl) break; // ✅ URL disponible
  }

  if (!publicUrl) {
    console.error('❌ URL non disponible après 10 tentatives');
  }

  return publicUrl;
}

async function updateCustomerMetafield(customerId, metafieldKey, fileUrl) {
  const getResponse = await fetch(
    `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/customers/${customerId}/metafields.json?namespace=custom&key=${metafieldKey}`,
    { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN } }
  );

  const getData = await getResponse.json();
  const existingMetafield = getData.metafields?.[0];

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
