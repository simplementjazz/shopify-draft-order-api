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

    return res.status(200).json({ success: true, message: 'Profil mis à jour avec succès!' });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Une erreur est survenue', details: error.message });
  }
};

async function uploadFileToShopify(fileBase64, filename, mimeType) {
  const FormData = require('form-data'); // ✅ GARDER - nécessaire
  // ❌ SUPPRIMÉ: const fetch = require('node-fetch');
  
  const buffer = Buffer.from(fileBase64.split(',')[1], 'base64');

  const stagedUploadMutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
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
          input: [{
            resource: "FILE",
            filename: filename,
            mimeType: mimeType,
            httpMethod: "POST"
          }]
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
  stagedTarget.parameters.forEach(param => {
    formData.append(param.name, param.value);
  });
  formData.append('file', buffer, filename);

  await fetch(stagedTarget.url, {
    method: 'POST',
    body: formData
  });

  const fileCreateMutation = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
        }
        userErrors {
          field
          message
        }
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
          files: [{
            alt: filename,
            contentType: "IMAGE",
            originalSource: stagedTarget.resourceUrl
          }]
        }
      })
    }
  );

  const fileData = await fileCreateResponse.json();
  
  if (fileData.data?.fileCreate?.userErrors?.length > 0) {
    throw new Error(fileData.data.fileCreate.userErrors[0].message);
  }

  return fileData.data.fileCreate.files[0].id;
}

async function updateCustomerMetafield(customerId, metafieldKey, fileGid) {
  // ❌ SUPPRIMÉ: const fetch = require('node-fetch');
  
  await fetch(
    `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-10/customers/${customerId}.json`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        customer: {
          id: customerId,
          metafields: [{
            namespace: 'custom',
            key: metafieldKey,
            value: fileGid,
            type: 'file_reference'
          }]
        }
      })
    }
  );
}
