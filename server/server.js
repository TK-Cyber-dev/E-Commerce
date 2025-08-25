import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY) {
  console.warn('⚠️ Missing STRIPE_SECRET_KEY in .env');
}
const stripe = new Stripe(STRIPE_SECRET_KEY || 'sk_test_placeholder');

// --- DB ---
const dbPath = path.join(__dirname, 'store.db');
const db = new Database(dbPath);

// Initialize schema if not exists
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// --- App ---
const app = express();
app.use(morgan('dev'));
app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// Serve static frontend (after client is built)
const staticPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(staticPath)) {
  app.use(express.static(staticPath));
}

// Images for demo (you can replace with CDN or uploads later)
app.use('/images', express.static(path.join(__dirname, 'images')));

// --- Helpers ---
function getProducts() {
  return db.prepare('SELECT * FROM products').all();
}

function createOrder({ email, total_cents, status }) {
  const info = db.prepare('INSERT INTO orders (email, total_cents, status) VALUES (?, ?, ?)')
    .run(email, total_cents, status);
  return info.lastInsertRowid;
}

function addOrderItem({ order_id, product_id, quantity, unit_price_cents }) {
  db.prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)')
    .run(order_id, product_id, quantity, unit_price_cents);
}

function listOrders() {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  return orders.map(o => ({ 
    ...o, 
    items: itemsStmt.all(o.id) 
  }));
}

// --- API ---
app.get('/api/products', (req, res) => {
  const products = getProducts();
  res.json({ products });
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { cart, email } = req.body; // cart: [{id, qty}]
    const products = getProducts();
    const idToProduct = Object.fromEntries(products.map(p => [String(p.id), p]));
    const line_items = [];
    let total_cents = 0;

    for (const item of cart || []) {
      const p = idToProduct[String(item.id)];
      if (!p) continue;
      const qty = Math.max(1, Math.min(50, parseInt(item.qty || 1)));
      total_cents += p.price_cents * qty;
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: p.name, images: [ `${req.protocol}://${req.get('host')}${p.image}` ] },
          unit_amount: p.price_cents
        },
        quantity: qty
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email || undefined,
      line_items,
      success_url: `${req.protocol}://${req.get('host')}/success`,
      cancel_url: `${req.protocol}://${req.get('host')}/cancel`,
      metadata: {
        cart: JSON.stringify(cart || []),
        total_cents: String(total_cents)
      }
    });

    res.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe webhook
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    if (!STRIPE_WEBHOOK_SECRET) {
      // No verification in dev without secret
      event = JSON.parse(req.body.toString());
    } else {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    }
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      const meta = session.metadata || {};
      const cart = JSON.parse(meta.cart || '[]');
      const total_cents = parseInt(meta.total_cents || '0', 10) || 0;
      const email = session.customer_details?.email || session.customer_email || null;

      // Create order
      const orderId = createOrder({ email, total_cents, status: 'paid' });

      // Add items
      const products = getProducts();
      const idToProduct = Object.fromEntries(products.map(p => [String(p.id), p]));
      for (const item of cart) {
        const p = idToProduct[String(item.id)];
        if (!p) continue;
        const qty = Math.max(1, Math.min(50, parseInt(item.qty || 1)));
        addOrderItem({ order_id: orderId, product_id: p.id, quantity: qty, unit_price_cents: p.price_cents });
      }

      console.log('✅ Order saved from webhook:', orderId);
    } catch (e) {
      console.error('Error handling checkout.session.completed', e);
    }
  }

  res.json({ received: true });
});

// Admin
app.post('/api/admin/seed', (req, res) => {
  try {
    const exists = db.prepare('SELECT COUNT(*) as cnt FROM products').get().cnt;
    if (exists > 0) return res.json({ message: 'Products already exist.' });
    const stmt = db.prepare('INSERT INTO products (name, description, image, price_cents) VALUES (?, ?, ?, ?)');
    stmt.run('Blue Tee', 'Soft cotton tee in blue', '/images/blue-tee.jpg', 1500);
    stmt.run('Red Hoodie', 'Cozy hoodie in red', '/images/red-hoodie.jpg', 4500);
    stmt.run('Canvas Tote', 'Sturdy tote bag', '/images/tote.jpg', 2500);
    stmt.run('Cap', 'Adjustable cap', '/images/cap.jpg', 1800);
    res.json({ message: 'Seeded sample products.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to seed products' });
  }
});

app.get('/api/admin/orders', (req, res) => {
  try {
    const orders = listOrders();
    res.json({ orders });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list orders' });
  }
});

// Fallback to SPA (if built)
app.get('*', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('Server running. Build the client to serve the storefront.');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!fs.existsSync(path.join(__dirname, 'images'))) {
    fs.mkdirSync(path.join(__dirname, 'images'));
  }
});
