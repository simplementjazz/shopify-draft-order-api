// api/upload-file.js
const FormData = require('form-data');
const fetch = require('node-fetch');

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
    const { file_data, file_name, file_type } = req.body;

    // Décoder le fichier base64
    const buffer = Buffer.from(file_data.split(',')[1], 'base64');

    // ÉTAPE 1: Créer un staged upload
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
              filename: file_name,
              mimeType: file_type,
              httpMethod: "POST"
            }]
          }
        })
      }
    );

    const stagedData = await stagedResponse.json();
    
    if (stagedData.data?.stagedUploadsCreate?.userErrors?.length > 0) {
      console.error('Staged Upload Error:', stagedData.data.stagedUploadsCreate.userErrors);
      return res.status(400).json({ 
        error: 'Erreur lors de la préparation de l\'upload',
        details: stagedData.data.stagedUploadsCreate.userErrors
      });
    }

    const stagedTarget = stagedData.data.stagedUploadsCreate.stagedTargets[0];

    // ÉTAPE 2: Upload le fichier vers l'URL staged
    const formData = new FormData();
    
    stagedTarget.parameters.forEach(param => {
      formData.append(param.name, param.value);
    });
    formData.append('file', buffer, file_name);

    const uploadResponse = await fetch(stagedTarget.url, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      console.error('Upload Error:', await uploadResponse.text());
      return res.status(400).json({ 
        error: 'Erreur lors de l\'upload du fichier'
      });
    }

    // ÉTAPE 3: Créer le fichier dans Shopify
    const fileCreateMutation = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            alt
            createdAt
            ... on MediaImage {
              image {
                url
              }
            }
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
              alt: file_name,
              contentType: "IMAGE",
              originalSource: stagedTarget.resourceUrl
            }]
          }
        })
      }
    );

    const fileData = await fileCreateResponse.json();
    
    if (fileData.data?.fileCreate?.userErrors?.length > 0) {
      console.error('File Create Error:', fileData.data.fileCreate.userErrors);
      return res.status(400).json({ 
        error: 'Erreur lors de la création du fichier',
        details: fileData.data.fileCreate.userErrors
      });
    }

    const createdFile = fileData.data.fileCreate.files[0];

    // Retourner le GID du fichier (nécessaire pour le metafield)
    return res.status(200).json({ 
      success: true,
      file_gid: createdFile.id, // C'est ce GID qu'il faut utiliser dans le metafield
      file_url: createdFile.image?.url,
      file_alt: createdFile.alt
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Une erreur est survenue',
      details: error.message 
    });
  }
};
