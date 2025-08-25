import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'store.db');
const db = new Database(dbPath);

// Ensure schema exists
const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
db.exec(schema);

// Seed products
db.exec(`
DELETE FROM products;
INSERT INTO products (name, description, image, price_cents) VALUES
('Blue Tee', 'Soft cotton tee in blue', '/images/blue-tee.jpg', 1500),
('Red Hoodie', 'Cozy hoodie in red', '/images/red-hoodie.jpg', 4500),
('Canvas Tote', 'Sturdy tote bag', '/images/tote.jpg', 2500),
('Cap', 'Adjustable cap', '/images/cap.jpg', 1800)
;
`);

console.log('Seeded products.');
