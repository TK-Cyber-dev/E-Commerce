# E-Commerce Starter (Stripe Visa Payments)

A full-stack demo shop you can host. Uses Stripe (accepts Visa, Mastercard, etc.) via Checkout.

## Quick Start
1. **Server**
```bash
cd server
npm install
cp .env.example .env   # fill keys
```
2. **Client**
```bash
cd ../client
npm install
npm run build
```
3. **Run**
```bash
cd ../server
npm run dev
```
4. **Seed products**
```bash
npm run seed
```
5. **Webhook**
```bash
stripe listen --forward-to localhost:3000/webhook
# put the displayed signing secret into STRIPE_WEBHOOK_SECRET in .env
```

Read more details in server and client files.
