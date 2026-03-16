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
    const { file_data, file_name, file_type, customer_id } = req.body;

    // Décoder le fichier base64
    const buffer = Buffer.from(file_data.split(',')[1], 'base64');

    // Créer le FormData pour Shopify
    const formData = new FormData();
    formData.append('file', buffer, {
      filename: file_name,
      contentType: file_type
    });

    // Upload vers Shopify Files
    const uploadResponse = await fetch(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/files.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          ...formData.getHeaders()
        },
        body: formData
      }
    );

    const uploadData = await uploadResponse.json();

    if (!uploadResponse.ok) {
      console.error('Shopify Upload Error:', uploadData);
      return res.status(400).json({ 
        error: 'Erreur lors de l\'upload',
        details: uploadData.errors 
      });
    }

    // Retourner l'URL du fichier uploadé
    return res.status(200).json({ 
      success: true,
      file_url: uploadData.file?.url || uploadData.file?.preview_image?.url,
      file_id: uploadData.file?.id
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Une erreur est survenue',
      details: error.message 
    });
  }
};
