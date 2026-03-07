import 'dotenv/config';

const accessId = process.env.MOZ_ACCESS_ID;
const secretKey = process.env.MOZ_SECRET_KEY;

console.log('Moz credentials:', accessId ? 'OK' : 'MISSING', secretKey ? 'OK' : 'MISSING');

const auth = Buffer.from(`${accessId}:${secretKey}`).toString('base64');

const response = await fetch('https://lsapi.seomoz.com/v2/url_metrics', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    targets: ['ttos168.com'],
    metrics: ['domain_authority', 'page_authority', 'spam_score', 'pages_to_root_domain', 'root_domains_to_root_domain'],
  }),
});

const data = await response.json();
console.log('Moz API response for ttos168.com:');
console.log(JSON.stringify(data, null, 2));
