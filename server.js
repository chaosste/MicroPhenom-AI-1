import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8080);
const DIST_DIR = path.join(__dirname, 'dist');
const INDEX_FILE = path.join(DIST_DIR, 'index.html');

const MIME_TYPES = {
  '.css': 'text/css',
  '.gif': 'image/gif',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

async function handleAnalyze(req, res) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';

  if (!endpoint || !apiKey || !deployment) {
    return sendJson(res, 500, {
      error: 'Missing AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, or AZURE_OPENAI_DEPLOYMENT'
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return sendJson(res, 400, { error: 'Field "text" is required' });
  }

  const cleanEndpoint = endpoint.replace(/\/$/, '');
  const url = `${cleanEndpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are an expert micro-phenomenology analyst. Return concise and structured output.'
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.2
      })
    });

    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) : {};

    if (!response.ok) {
      return sendJson(res, response.status, {
        error: 'Azure OpenAI request failed',
        details: parsed
      });
    }

    const content = parsed?.choices?.[0]?.message?.content ?? '';
    return sendJson(res, 200, {
      result: content,
      usage: parsed?.usage ?? null,
      model: parsed?.model ?? deployment
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: 'Unexpected analyze error',
      details: error.message
    });
  }
}

async function handleRealtimeClientSecret(req, res) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment =
    process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT ||
    process.env.AZURE_OPENAI_DEPLOYMENT_REALTIME;
  const voice = process.env.AZURE_OPENAI_REALTIME_VOICE || 'verse';

  if (!endpoint || !apiKey || !deployment) {
    return sendJson(res, 500, {
      error:
        'Missing AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, or AZURE_OPENAI_REALTIME_DEPLOYMENT'
    });
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const cleanEndpoint = endpoint.replace(/\/$/, '');
  const url = `${cleanEndpoint}/openai/v1/realtime/client_secrets`;
  const selectedVoice = typeof body.voice === 'string' && body.voice.trim().length > 0 ? body.voice : voice;
  const instructions = typeof body.instructions === 'string' ? body.instructions : '';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: deployment,
          instructions,
          audio: { output: { voice: selectedVoice } }
        }
      })
    });

    const parsed = await response.json().catch(() => ({}));
    if (!response.ok) {
      return sendJson(res, response.status, {
        error: parsed?.error?.message || 'Azure realtime token request failed'
      });
    }

    const token =
      parsed?.value ||
      parsed?.token ||
      parsed?.client_secret?.value ||
      parsed?.clientSecret?.value;
    if (!token) {
      return sendJson(res, 502, { error: 'Realtime token missing from Azure response' });
    }

    return sendJson(res, 200, {
      token,
      callsUrl: `${cleanEndpoint}/openai/v1/realtime/calls?webrtcfilter=on`,
      deployment
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: 'Unexpected realtime token error',
      details: error.message
    });
  }
}

function serveStatic(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(DIST_DIR, normalizedPath));

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (fileError, content) => {
    if (fileError) {
      fs.readFile(INDEX_FILE, (indexError, indexContent) => {
        if (indexError) {
          res.writeHead(500);
          res.end('Server misconfiguration: dist/index.html missing');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(indexContent);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url && req.url.startsWith('/api/health')) {
    const realtimeConfigured = Boolean(
      process.env.AZURE_OPENAI_ENDPOINT &&
        process.env.AZURE_OPENAI_API_KEY &&
        (process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT_REALTIME)
    );
    return sendJson(res, 200, {
      status: 'ok',
      service: 'microphenomai',
      realtimeConfigured,
      time: new Date().toISOString()
    });
  }

  if (req.method === 'POST' && req.url === '/api/analyze') {
    return handleAnalyze(req, res);
  }

  if (req.method === 'POST' && req.url === '/api/realtime/client-secret') {
    return handleRealtimeClientSecret(req, res);
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
