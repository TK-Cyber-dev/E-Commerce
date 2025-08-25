import React, { useEffect, useState } from 'react'

function useCart() {
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cart') || '[]')
    } catch {
      return []
    }
  })
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart))
  }, [cart])
  const add = (id) => setCart(prev => {
    const found = prev.find(i => i.id === id)
    if (found) return prev.map(i => i.id === id ? { ...i, qty: i.qty + 1 } : i)
    return [...prev, { id, qty: 1 }]
  })
  const remove = (id) => setCart(prev => prev.filter(i => i.id !== id))
  const inc = (id) => setCart(prev => prev.map(i => i.id === id ? { ...i, qty: i.qty + 1 } : i))
  const dec = (id) => setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty - 1) } : i))
  const clear = () => setCart([])
  return { cart, add, remove, inc, dec, clear }
}

export default function App() {
  const [products, setProducts] = useState([])
  const [email, setEmail] = useState('')
  const { cart, add, remove, inc, dec, clear } = useCart()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(d => setProducts(d.products || []))
  }, [])

  const totals = cart.reduce((acc, item) => {
    const p = products.find(p => p.id === item.id)
    if (!p) return acc
    acc.subtotal += p.price_cents * item.qty
    acc.items.push({ ...item, product: p })
    return acc
  }, { subtotal: 0, items: [] })

  const format = cents => `$${(cents/100).toFixed(2)}`

  const checkout = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart, email })
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setMessage('Failed to start checkout.')
      }
    } catch (e) {
      setMessage('Checkout error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1000, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>My Shop</h1>
        <a href="/" style={{ textDecoration: 'none' }}>Home</a>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <section>
          <h2>Products</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
            {products.map(p => (
              <div key={p.id} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
                <img src={p.image} alt={p.name} style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8 }} />
                <h3 style={{ margin: '8px 0 4px' }}>{p.name}</h3>
                <div style={{ opacity: .8, fontSize: 14 }}>{p.description}</div>
                <div style={{ marginTop: 8, fontWeight: 600 }}>{format(p.price_cents)}</div>
                <button onClick={() => add(p.id)} style={{ marginTop: 8, width: '100%' }}>Add to cart</button>
              </div>
            ))}
          </div>
        </section>
        <aside>
          <h2>Cart</h2>
          {totals.items.length === 0 && <div>Cart is empty.</div>}
          {totals.items.map(({ id, qty, product }) => (
            <div key={id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <img src={product.image} alt={product.name} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }} />
              <div>
                <div style={{ fontWeight: 600 }}>{product.name}</div>
                <div style={{ fontSize: 12, opacity: .8 }}>{format(product.price_cents)} × {qty}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button onClick={() => dec(id)}>-</button>
                  <span>{qty}</span>
                  <button onClick={() => inc(id)}>+</button>
                  <button onClick={() => remove(id)} style={{ marginLeft: 8 }}>Remove</button>
                </div>
              </div>
              <div style={{ fontWeight: 600 }}>{format(product.price_cents * qty)}</div>
            </div>
          ))}
          <hr />
          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0' }}>
            <div>Subtotal</div>
            <div>{format(totals.subtotal)}</div>
          </div>
          <div style={{ fontSize: 12, opacity: .7, marginBottom: 8 }}>Taxes and shipping calculated at checkout.</div>
          <input placeholder="Email for receipt" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
          <button disabled={loading || totals.items.length===0} onClick={checkout} style={{ width: '100%', padding: 10 }}>
            {loading ? 'Redirecting…' : 'Checkout'}
          </button>
          <button onClick={clear} style={{ width: '100%', marginTop: 8 }}>Clear cart</button>
          {message && <div style={{ marginTop: 8, color: 'crimson' }}>{message}</div>}
        </aside>
      </div>

      <footer style={{ marginTop: 40 }}>
        <p><a href="/success">Success page</a> · <a href="/cancel">Cancel page</a></p>
      </footer>
    </div>
  )
}
