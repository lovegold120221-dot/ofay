const baseUrl = (process.env.WHATSAPP_API_URL || 'http://127.0.0.1:4200').replace(/\/+$/, '');

const response = await fetch(`${baseUrl}/api/health`);
const text = await response.text();

if (!response.ok) {
  throw new Error(`Health check failed with ${response.status}: ${text}`);
}

const data = JSON.parse(text);

if (data.status !== 'ok') {
  throw new Error(`Unexpected health payload: ${text}`);
}

console.log(`WhatsApp backend healthy at ${baseUrl}`);
