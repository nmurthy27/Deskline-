import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './src/server/routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // Mount API routes
  app.use('/api', createApiRouter());

  // Serve embeddable website chat widget script
  app.get('/widget.js', (req, res) => {
    const rawSlug = String(req.query.business || 'soma-wellness').replace(
      /[^a-zA-Z0-9_-]/g,
      ''
    );
    const origin =
      process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;

    res.type('application/javascript');
    res.send(`(function(){
  if (window.__desklineWidgetLoaded) return;
  window.__desklineWidgetLoaded = true;
  var slug = ${JSON.stringify(rawSlug)};
  var origin = ${JSON.stringify(origin)};
  var btn = document.createElement('button');
  btn.innerText = 'Book Appointment';
  btn.setAttribute('aria-label', 'Open AI Receptionist Chat');
  btn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;background:#0F766E;color:#fff;border:none;border-radius:9999px;padding:12px 20px;font:600 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(15,23,42,0.18);';
  var frame = null;
  btn.addEventListener('click', function(){
    if (frame) {
      frame.style.display = frame.style.display === 'none' ? 'block' : 'none';
      return;
    }
    frame = document.createElement('iframe');
    frame.src = origin + '/?widget=' + encodeURIComponent(slug);
    frame.style.cssText = 'position:fixed;bottom:84px;right:24px;width:390px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 110px);border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 16px 40px rgba(15,23,42,0.18);z-index:99999;background:#fff;';
    document.body.appendChild(frame);
  });
  document.body.appendChild(btn);
})();`);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Deskline server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
