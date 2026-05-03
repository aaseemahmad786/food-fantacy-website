import { useCallback, useEffect, useMemo, useState } from "react";

const AUTH_KEY = "foodFantacyAuth";
const CART_KEY = "foodFantacyCart";
const KITCHEN_WHATSAPP_NUMBER = "9128336105";
const KITCHEN_UPI_ID = "foodfantacy@upi";
const statuses = ["New", "Preparing", "Out for Delivery", "Delivered", "Cancelled"];

const money = (value) => `₹${value}`;

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

async function apiRequest(path, options = {}) {
  const { token, ...fetchOptions } = options;
  const response = await fetch(`/api${path}`, {
    ...fetchOptions,
    headers: {
      ...(fetchOptions.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...fetchOptions.headers,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.error || "Request failed.");
  }

  return payload;
}

export default function App() {
  const [hash, setHash] = useState(window.location.hash || "#home");
  const [auth, setAuth] = useState(() => loadJson(AUTH_KEY, null));
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState(() => loadJson(CART_KEY, {}));
  const [orders, setOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [isMenuLoading, setIsMenuLoading] = useState(true);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [isMyOrdersLoading, setIsMyOrdersLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [toast, setToast] = useState("");

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  }, []);

  const logout = useCallback(() => {
    setAuth(null);
    setOrders([]);
    setMyOrders([]);
    showToast("Logged out");

    if (["#orders", "#account"].includes(window.location.hash)) {
      window.location.hash = "#home";
    }
  }, [showToast]);

  const loadMenu = useCallback(async () => {
    setIsMenuLoading(true);
    try {
      setMenuItems(await apiRequest("/menu"));
      setApiError("");
    } catch (error) {
      setApiError("Backend API is not running. Start it with npm run dev or npm run server.");
      showToast(error.message);
    } finally {
      setIsMenuLoading(false);
    }
  }, [showToast]);

  const loadOrders = useCallback(async () => {
    if (auth?.user?.role !== "admin") {
      setOrders([]);
      return;
    }

    setIsOrdersLoading(true);
    try {
      setOrders(await apiRequest("/orders", { token: auth.token }));
      setApiError("");
    } catch (error) {
      setApiError("Could not load kitchen orders from the backend.");
      showToast(error.message);
    } finally {
      setIsOrdersLoading(false);
    }
  }, [auth, showToast]);

  const loadMyOrders = useCallback(async () => {
    if (!auth?.token) {
      setMyOrders([]);
      return;
    }

    setIsMyOrdersLoading(true);
    try {
      setMyOrders(await apiRequest("/my-orders", { token: auth.token }));
      setApiError("");
    } catch (error) {
      showToast(error.message);
    } finally {
      setIsMyOrdersLoading(false);
    }
  }, [auth, showToast]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash || "#home");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (auth) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
  }, [auth]);

  useEffect(() => {
    if (!auth?.token) return;

    let isCancelled = false;
    apiRequest("/auth/me", { token: auth.token })
      .then((user) => {
        if (!isCancelled) {
          setAuth((currentAuth) => (currentAuth?.token === auth.token ? { ...currentAuth, user } : currentAuth));
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setAuth(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [auth?.token]);

  useEffect(() => {
    if (hash === "#orders") {
      loadOrders();
      return;
    }

    if (hash === "#account") {
      loadMyOrders();
      return;
    }

    setTimeout(() => {
      document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  }, [hash, loadMyOrders, loadOrders]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => {
          const item = menuItems.find((menuItem) => menuItem.id === Number(id));
          return item ? { ...item, quantity, lineTotal: item.price * quantity } : null;
        })
        .filter(Boolean),
    [cart, menuItems],
  );

  const cartTotal = useMemo(
    () => cartLines.reduce((sum, item) => sum + item.lineTotal, 0),
    [cartLines],
  );

  function addToCart(itemId) {
    setCart((currentCart) => ({
      ...currentCart,
      [itemId]: (currentCart[itemId] || 0) + 1,
    }));
    showToast("Item added to cart");
  }

  function changeQuantity(itemId, delta) {
    setCart((currentCart) => {
      const nextCart = { ...currentCart };
      nextCart[itemId] = (nextCart[itemId] || 0) + delta;
      if (nextCart[itemId] <= 0) delete nextCart[itemId];
      return nextCart;
    });
  }

  async function handleAuthSuccess(nextAuth) {
    setAuth(nextAuth);
    showToast(`Welcome, ${nextAuth.user.name}`);

    if (nextAuth.user.role === "admin") {
      window.location.hash = "#orders";
    } else {
      window.location.hash = "#checkout";
    }
  }

  async function submitOrder(customer) {
    if (!auth?.token) {
      showToast("Please login as a customer before ordering.");
      window.location.hash = "#login";
      return false;
    }

    if (!cartLines.length) {
      showToast("Please add at least one item");
      return false;
    }

    try {
      const order = await apiRequest("/orders", {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({
          customer,
          items: cartLines.map((item) => ({ id: item.id, quantity: item.quantity })),
        }),
      });

      setOrders((currentOrders) => [order, ...currentOrders.filter((currentOrder) => currentOrder.id !== order.id)]);
      setMyOrders((currentOrders) => [order, ...currentOrders.filter((currentOrder) => currentOrder.id !== order.id)]);
      setCart({});
      sendOrderToWhatsApp(order);
      showToast(`Order received: ${order.id}`);
      return true;
    } catch (error) {
      showToast(error.message);
      return false;
    }
  }

  async function updateOrderStatus(orderId, status) {
    try {
      const updatedOrder = await apiRequest(`/orders/${orderId}/status`, {
        method: "PATCH",
        token: auth?.token,
        body: JSON.stringify({ status }),
      });

      setOrders((currentOrders) =>
        currentOrders.map((order) => (order.id === orderId ? updatedOrder : order)),
      );
      showToast("Order status updated");
    } catch (error) {
      showToast(error.message);
    }
  }

  async function clearOrders() {
    if (!confirm("Clear all saved orders?")) return;

    try {
      await apiRequest("/orders", { method: "DELETE", token: auth?.token });
      setOrders([]);
      showToast("All orders cleared");
    } catch (error) {
      showToast(error.message);
    }
  }

  return (
    <>
      <Header auth={auth} isDashboard={hash === "#orders"} onLogout={logout} />
      {hash === "#orders" ? (
        auth?.user?.role === "admin" ? (
          <OrdersDashboard
            isLoading={isOrdersLoading}
            orders={orders}
            onClearOrders={clearOrders}
            onStatusChange={updateOrderStatus}
            showToast={showToast}
          />
        ) : (
          <AuthPage defaultRole="admin" onAuthSuccess={handleAuthSuccess} showToast={showToast} />
        )
      ) : hash === "#admin-login" ? (
        <AuthPage defaultRole="admin" onAuthSuccess={handleAuthSuccess} showToast={showToast} />
      ) : hash === "#login" ? (
        <AuthPage defaultRole="user" onAuthSuccess={handleAuthSuccess} showToast={showToast} />
      ) : hash === "#account" ? (
        auth ? (
          <MyOrders isLoading={isMyOrdersLoading} orders={myOrders} user={auth.user} />
        ) : (
          <AuthPage defaultRole="user" onAuthSuccess={handleAuthSuccess} showToast={showToast} />
        )
      ) : (
        <MainSite
          apiError={apiError}
          auth={auth}
          cartLines={cartLines}
          cartTotal={cartTotal}
          isMenuLoading={isMenuLoading}
          menuItems={menuItems}
          onAddToCart={addToCart}
          onQuantityChange={changeQuantity}
          onSubmitOrder={submitOrder}
        />
      )}
      <Toast message={toast} />
    </>
  );
}

function Header({ auth, isDashboard, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const navLinks = isDashboard
    ? [
        ["#home", "Home"],
        ["#menu", "Menu"],
      ]
    : [
        ["#menu", "Menu"],
        ["#cloud-kitchen", "Cloud Kitchen"],
        ["#checkout", "Order Now"],
      ];

  return (
    <header className="site-header">
      <nav className="navbar">
        <a className="brand" href="#home" onClick={() => setIsOpen(false)}>
          <span className="brand-mark">FF</span>
          <span>Food Fantacy</span>
        </a>
        <button className="nav-toggle" aria-label="Open menu" onClick={() => setIsOpen((open) => !open)}>
          ☰
        </button>
        <div className={`nav-links ${isOpen ? "open" : ""} ${isDashboard ? "visible" : ""}`}>
          {navLinks.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setIsOpen(false)}>
              {label}
            </a>
          ))}
          {auth?.user?.role === "admin" ? (
            <a href="#orders" onClick={() => setIsOpen(false)}>Kitchen Orders</a>
          ) : null}
          {auth ? (
            <>
              {auth.user.role === "user" ? (
                <a href="#account" onClick={() => setIsOpen(false)}>My Orders</a>
              ) : null}
              <button className="link-button" onClick={onLogout} type="button">
                Logout {auth.user.name}
              </button>
            </>
          ) : (
            <>
              <a href="#login" onClick={() => setIsOpen(false)}>User Login</a>
              <a href="#admin-login" onClick={() => setIsOpen(false)}>Admin Login</a>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

function MainSite({
  apiError,
  auth,
  cartLines,
  cartTotal,
  isMenuLoading,
  menuItems,
  onAddToCart,
  onQuantityChange,
  onSubmitOrder,
}) {
  return (
    <main id="home">
      <Hero />
      {apiError ? <ApiBanner message={apiError} /> : null}
      <CloudKitchen />
      <Menu isLoading={isMenuLoading} menuItems={menuItems} onAddToCart={onAddToCart} />
      <Checkout
        auth={auth}
        cartLines={cartLines}
        cartTotal={cartTotal}
        onQuantityChange={onQuantityChange}
        onSubmitOrder={onSubmitOrder}
      />
      <Footer />
    </main>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-content">
        <p className="eyebrow">Fresh • Spicy • Delivered Hot</p>
        <h1>Non-veg favourites from your cloud kitchen.</h1>
        <p className="hero-copy">
          Chicken, mutton, fish, prawns, biryani, kebabs and more — cooked fresh after every order.
        </p>
        <div className="hero-actions">
          <a className="btn primary" href="#menu">Explore Menu</a>
          <a className="btn secondary" href="#checkout">Place Order</a>
        </div>
        <div className="hero-stats">
          <span><strong>35+</strong> dishes</span>
          <span><strong>30-45</strong> min delivery</span>
          <span><strong>4.8★</strong> taste rating</span>
        </div>
      </div>
      <div className="hero-card">
        <span className="badge">Chef Special</span>
        <h2>Chicken Dum Biryani</h2>
        <p>Long grain rice, tender chicken and signature masala.</p>
        <strong>₹249</strong>
      </div>
    </section>
  );
}

function ApiBanner({ message }) {
  return (
    <section className="api-banner">
      <strong>Backend needed:</strong> {message}
    </section>
  );
}

function CloudKitchen() {
  const features = [
    ["🔥", "Freshly Cooked", "Every dish is prepared after your order is received."],
    ["🥡", "Secure Packing", "Leak-safe containers keep food hot and travel-ready."],
    ["🛵", "Delivery Ready", "Orders are stored in your SQLite backend database."],
  ];

  return (
    <section className="section" id="cloud-kitchen">
      <div className="section-heading">
        <p className="eyebrow">Cloud Kitchen</p>
        <h2>Made for fast online orders</h2>
        <p>No dine-in, no waiting line. We focus only on fresh cooking, hygienic packing and quick delivery.</p>
      </div>
      <div className="features">
        {features.map(([emoji, title, text]) => (
          <article key={title}>
            <span>{emoji}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Menu({ isLoading, menuItems, onAddToCart }) {
  const categories = useMemo(() => ["All", ...new Set(menuItems.map((item) => item.category))], [menuItems]);
  const [activeCategory, setActiveCategory] = useState("All");
  const visibleItems = activeCategory === "All"
    ? menuItems
    : menuItems.filter((item) => item.category === activeCategory);

  useEffect(() => {
    if (activeCategory !== "All" && !categories.includes(activeCategory)) {
      setActiveCategory("All");
    }
  }, [activeCategory, categories]);

  return (
    <section className="section menu-section" id="menu">
      <div className="section-heading">
        <p className="eyebrow">Full Non-Veg Menu</p>
        <h2>Choose your favourite dishes</h2>
        <p>Add items to cart, login, fill delivery details and submit the order.</p>
      </div>

      {isLoading ? <div className="state-card">Loading menu from database...</div> : null}

      {!isLoading && !menuItems.length ? (
        <div className="state-card">No menu items found in the database.</div>
      ) : null}

      {!isLoading && menuItems.length ? (
        <>
          <div className="filters">
            {categories.map((category) => (
              <button
                className={`filter-btn ${category === activeCategory ? "active" : ""}`}
                key={category}
                onClick={() => setActiveCategory(category)}
                type="button"
              >
                {category}
              </button>
            ))}
          </div>
          <div className="menu-grid">
            {visibleItems.map((item) => (
              <article className="menu-card" key={item.id}>
                <MenuPhoto item={item} />
                <div>
                  <p className="eyebrow">{item.category}</p>
                  <h3>{item.name}</h3>
                </div>
                <p>{item.desc}</p>
                <div className="menu-meta">
                  <span className="menu-price">{money(item.price)}</span>
                  <button className="btn primary" onClick={() => onAddToCart(item.id)} type="button">
                    Add
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function MenuPhoto({ item }) {
  const [hasImageError, setHasImageError] = useState(false);

  return (
    <div className="menu-img">
      {item.imageUrl && !hasImageError ? (
        <img
          alt={item.name}
          loading="lazy"
          onError={() => setHasImageError(true)}
          src={item.imageUrl}
        />
      ) : (
        <span className="menu-fallback" aria-hidden="true">{item.emoji}</span>
      )}
    </div>
  );
}

function Checkout({ auth, cartLines, cartTotal, onQuantityChange, onSubmitOrder }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [upiCopied, setUpiCopied] = useState(false);
  const [form, setForm] = useState({
    name: auth?.user?.name || "",
    phone: auth?.user?.phone || "",
    address: "",
    payment: "Cash on Delivery",
    upiRef: "",
    notes: "",
  });

  useEffect(() => {
    if (!auth?.user) return;

    setForm((currentForm) => ({
      ...currentForm,
      name: currentForm.name || auth.user.name,
      phone: currentForm.phone || auth.user.phone,
    }));
  }, [auth]);

  function updateField(event) {
    setForm((currentForm) => ({
      ...currentForm,
      [event.target.name]: event.target.value,
    }));
  }

  function copyUpiId() {
    navigator.clipboard.writeText(KITCHEN_UPI_ID).then(() => {
      setUpiCopied(true);
      setTimeout(() => setUpiCopied(false), 2000);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    if (form.payment === "Razorpay") {
      try {
        const orderData = await apiRequest("/payment/razorpay", {
          method: "POST",
          token: auth?.token,
          body: JSON.stringify({ amount: cartTotal }),
        });

        const options = {
          key: orderData.key_id,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "Food Fantacy",
          description: "Online Food Order",
          order_id: orderData.id,
          handler: async function (response) {
            const rzpNote = `${form.notes.trim()} [Razorpay: ${response.razorpay_payment_id}]`.trim();
            const isSubmitted = await onSubmitOrder({
              name: form.name.trim(),
              phone: form.phone.trim(),
              address: form.address.trim(),
              payment: form.payment,
              notes: rzpNote,
            });
            setIsSubmitting(false);
            if (isSubmitted) resetForm();
          },
          prefill: {
            name: form.name,
            contact: form.phone,
            email: auth?.user?.email || "",
          },
          theme: { color: "#ff5a1f" },
          modal: { ondismiss: () => setIsSubmitting(false) }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response){
          alert("Payment failed: " + response.error.description);
          setIsSubmitting(false);
        });
        rzp.open();
        return;
      } catch (error) {
        alert("Could not initialize Razorpay: " + error.message);
        setIsSubmitting(false);
        return;
      }
    }

    const upiNote = form.payment === "UPI" && form.upiRef.trim()
      ? `${form.notes.trim()} [UPI Ref: ${form.upiRef.trim()}]`.trim()
      : form.notes.trim();
    const isSubmitted = await onSubmitOrder({
      name: form.name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      payment: form.payment,
      notes: upiNote,
    });
    setIsSubmitting(false);

    if (isSubmitted) resetForm();
  }

  function resetForm() {
    setForm((currentForm) => ({
      ...currentForm,
      address: "",
      payment: "Cash on Delivery",
      upiRef: "",
      notes: "",
    }));
  }

  return (
    <section className="section order-layout" id="checkout">
      <div>
        <div className="section-heading left">
          <p className="eyebrow">Checkout</p>
          <h2>Your cart</h2>
          <p>Review items before submitting the order.</p>
        </div>
        <Cart cartLines={cartLines} cartTotal={cartTotal} onQuantityChange={onQuantityChange} />
      </div>

      <form className="checkout-form" onSubmit={handleSubmit}>
        <h3>Customer details</h3>
        {!auth ? (
          <div className="login-required">
            <strong>Login required</strong>
            <p>Create a customer account or login before placing an order.</p>
            <a className="btn secondary full" href="#login">User Login / Register</a>
          </div>
        ) : null}
        <label>
          Full name
          <input name="name" onChange={updateField} placeholder="Customer name" required type="text" value={form.name} />
        </label>
        <label>
          Mobile number
          <input
            name="phone"
            onChange={updateField}
            pattern="[0-9]{10}"
            placeholder="10 digit mobile number"
            required
            type="tel"
            value={form.phone}
          />
        </label>
        <label>
          Delivery address
          <textarea
            name="address"
            onChange={updateField}
            placeholder="House no, street, area, city"
            required
            rows="4"
            value={form.address}
          />
        </label>
        <label>
          Payment method
          <select name="payment" onChange={updateField} required value={form.payment}>
            <option value="Cash on Delivery">💵 Cash on Delivery</option>
            <option value="UPI on Delivery">📱 UPI on Delivery</option>
            <option value="UPI">⚡ Pay Now via UPI</option>
            <option value="Razorpay">💳 Pay via Razorpay</option>
          </select>
        </label>
        {form.payment === "UPI" ? (
          <div className="upi-payment-panel">
            <div className="upi-panel-header">
              <span className="upi-icon">⚡</span>
              <div>
                <h4>Pay via UPI</h4>
                <p>Send {cartTotal > 0 ? money(cartTotal) : "the total amount"} to the UPI ID below</p>
              </div>
            </div>
            <div className="upi-id-row">
              <span className="upi-id-value">{KITCHEN_UPI_ID}</span>
              <button className={`btn upi-copy-btn ${upiCopied ? "copied" : ""}`} onClick={copyUpiId} type="button">
                {upiCopied ? "✓ Copied" : "Copy"}
              </button>
            </div>

            <div className="upi-qr-code">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${KITCHEN_UPI_ID}&pn=Food%20Fantacy&am=${cartTotal}&cu=INR&tn=FoodFantacy%20Order`)}`} 
                alt="UPI QR Code" 
                width="200"
                height="200"
              />
              <p>Scan with any UPI App</p>
            </div>

            <a
              className="btn primary full upi-pay-link"
              href={`upi://pay?pa=${KITCHEN_UPI_ID}&pn=Food%20Fantacy&am=${cartTotal}&cu=INR&tn=FoodFantacy%20Order`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open UPI App & Pay {cartTotal > 0 ? money(cartTotal) : ""}
            </a>
            <label>
              UPI Transaction / Reference ID
              <input
                name="upiRef"
                onChange={updateField}
                placeholder="Enter 12-digit UTR or UPI ref number"
                type="text"
                value={form.upiRef}
              />
            </label>
            <p className="upi-hint">After paying, enter the transaction reference so we can verify your payment quickly.</p>
          </div>
        ) : null}
        <label>
          Notes
          <input name="notes" onChange={updateField} placeholder="Less spicy, extra chutney, etc." type="text" value={form.notes} />
        </label>
        <button className="btn primary full" disabled={isSubmitting || !auth} type="submit">
          {isSubmitting ? "Submitting..." : "Submit Order"}
        </button>
        <p className="form-note">
          Orders are saved under your user account and visible to the admin dashboard.
        </p>
      </form>
    </section>
  );
}

function Cart({ cartLines, cartTotal, onQuantityChange }) {
  return (
    <div className="cart-card">
      {!cartLines.length ? (
        <div className="cart-items empty">Your cart is empty.</div>
      ) : (
        <div className="cart-items">
          {cartLines.map((item) => (
            <div className="cart-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <div className="qty-controls">
                  <button onClick={() => onQuantityChange(item.id, -1)} type="button">−</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => onQuantityChange(item.id, 1)} type="button">+</button>
                </div>
              </div>
              <strong>{money(item.lineTotal)}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="cart-total">
        <span>Total</span>
        <strong>{money(cartTotal)}</strong>
      </div>
    </div>
  );
}

function AuthPage({ defaultRole, onAuthSuccess, showToast }) {
  const isAdmin = defaultRole === "admin";
  const [mode, setMode] = useState(isAdmin ? "login" : "login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: isAdmin ? "admin@foodfantacy.com" : "",
    phone: "",
    password: isAdmin ? "Admin@12345" : "",
    identifier: isAdmin ? "admin@foodfantacy.com" : "",
  });

  function updateField(event) {
    setForm((currentForm) => ({
      ...currentForm,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSocialLogin(provider) {
    setIsSubmitting(true);
    try {
      const mockEmail = prompt(`[Demo] Enter your ${provider} email to continue:`, "social@example.com");
      if (!mockEmail) return;

      const authResponse = await apiRequest("/auth/social", {
        method: "POST",
        body: JSON.stringify({
          provider,
          email: mockEmail,
          name: `${provider} User`,
        }),
      });

      await onAuthSuccess(authResponse);
    } catch (error) {
      showToast(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const body = mode === "register"
        ? {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            password: form.password,
          }
        : {
            identifier: form.identifier.trim(),
            password: form.password,
            role: defaultRole,
          };

      const authResponse = await apiRequest(mode === "register" ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });

      await onAuthSuccess(authResponse);
    } catch (error) {
      showToast(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">{isAdmin ? "Admin Access" : "Customer Access"}</p>
        <h1>{isAdmin ? "Admin login" : mode === "register" ? "Create user account" : "User login"}</h1>
        <p>
          {isAdmin
            ? "Login as admin to view all kitchen orders and update delivery status."
            : "Login or register as a customer to place orders and see your order history."}
        </p>

        {!isAdmin ? (
          <div className="auth-tabs">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} type="button">
              Login
            </button>
            <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")} type="button">
              Register
            </button>
          </div>
        ) : null}

        <form className="checkout-form auth-form" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <>
              <label>
                Full name
                <input name="name" onChange={updateField} placeholder="Your name" required type="text" value={form.name} />
              </label>
              <label>
                Mobile number
                <input
                  name="phone"
                  onChange={updateField}
                  pattern="[0-9]{10}"
                  placeholder="10 digit mobile number"
                  required
                  type="tel"
                  value={form.phone}
                />
              </label>
              <label>
                Email
                <input name="email" onChange={updateField} placeholder="you@example.com" required type="email" value={form.email} />
              </label>
            </>
          ) : (
            <label>
              Email or Mobile Number
              <input name="identifier" onChange={updateField} placeholder="Email or 10-digit number" required type="text" value={form.identifier} />
            </label>
          )}
          <label>
            Password
            <input
              minLength="8"
              name="password"
              onChange={updateField}
              placeholder="Minimum 8 characters"
              required
              type="password"
              value={form.password}
            />
          </label>
          <button className="btn primary full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Please wait..." : isAdmin ? "Admin Login" : mode === "register" ? "Create Account" : "User Login"}
          </button>
          {isAdmin ? (
            <p className="form-note">Default admin: admin@foodfantacy.com / Admin@12345. Change it with environment variables before going live.</p>
          ) : null}
        </form>

        {!isAdmin && mode === "login" && (
          <div className="social-login">
            <p className="social-divider"><span>or continue with</span></p>
            <div className="social-buttons">
              <button className="btn social-btn google" onClick={() => handleSocialLogin("Google")} type="button" disabled={isSubmitting}>
                <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google
              </button>
              <button className="btn social-btn facebook" onClick={() => handleSocialLogin("Facebook")} type="button" disabled={isSubmitting}>
                <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg"><path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.593 1.323-1.325V1.325C24 .593 23.407 0 22.675 0z" fill="#1877F2"/></svg>
                Facebook
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function MyOrders({ isLoading, orders, user }) {
  return (
    <main className="orders-page">
      <section className="section">
        <div className="section-heading">
          <p className="eyebrow">Customer Account</p>
          <h1>My Orders</h1>
          <p>Welcome, {user.name}. Track orders placed from your account.</p>
        </div>
        <OrderList isLoading={isLoading} orders={orders} emptyText="No orders yet. Place your first order from the menu." />
      </section>
    </main>
  );
}

function OrdersDashboard({ isLoading, orders, onStatusChange, onClearOrders, showToast }) {
  function exportOrders() {
    if (!orders.length) {
      showToast("No orders to export");
      return;
    }

    const rows = [["Order ID", "Date", "Status", "Name", "Phone", "Address", "Items", "Total", "Payment", "Notes"]];
    orders.forEach((order) =>
      rows.push([
        order.id,
        new Date(order.createdAt).toLocaleString(),
        order.status,
        order.customer.name,
        order.customer.phone,
        order.customer.address,
        order.items.map((item) => `${item.quantity}x ${item.name}`).join(" | "),
        order.total,
        order.customer.payment,
        order.customer.notes,
      ]),
    );

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "food-fantacy-orders.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="orders-page">
      <section className="section">
        <div className="section-heading">
          <p className="eyebrow">Cloud Kitchen Dashboard</p>
          <h1>Kitchen Orders</h1>
          <p>View received orders, update status and export order data.</p>
        </div>
        <div className="dashboard-actions">
          <button className="btn secondary" onClick={exportOrders} type="button">Export CSV</button>
          <button className="btn danger" onClick={onClearOrders} type="button">Clear All Orders</button>
        </div>
        <OrderList isAdmin isLoading={isLoading} onStatusChange={onStatusChange} orders={orders} />
      </section>
    </main>
  );
}

function OrderList({ emptyText = "No orders yet. New database orders will appear here.", isAdmin = false, isLoading, onStatusChange, orders }) {
  return (
    <div className="orders-list">
      {isLoading ? (
        <article className="order-card">
          <p>Loading orders from database...</p>
        </article>
      ) : null}

      {!isLoading && !orders.length ? (
        <article className="order-card">
          <p>{emptyText}</p>
        </article>
      ) : null}

      {!isLoading
        ? orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div className="order-card-header">
                <div>
                  <p className="eyebrow">{order.id}</p>
                  <h3>{order.customer.name} • {order.customer.phone}</h3>
                  <p>{new Date(order.createdAt).toLocaleString()} • {order.customer.payment}</p>
                </div>
                {isAdmin ? (
                  <select
                    className="status-select"
                    onChange={(event) => onStatusChange(order.id, event.target.value)}
                    value={order.status}
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                ) : (
                  <span className="status-pill">{order.status}</span>
                )}
              </div>
              <p><strong>Address:</strong> {order.customer.address}</p>
              {order.customer.notes ? <p><strong>Notes:</strong> {order.customer.notes}</p> : null}
              <ul>
                {order.items.map((item) => (
                  <li key={`${order.id}-${item.id}`}>{item.quantity} × {item.name} — {money(item.lineTotal)}</li>
                ))}
              </ul>
              <p className="order-total">Total: {money(order.total)}</p>
            </article>
          ))
        : null}
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <p>© 2026 Food Fantacy Cloud Kitchen</p>
      <p>Call/WhatsApp: <a href={`tel:+${KITCHEN_WHATSAPP_NUMBER}`}>+{KITCHEN_WHATSAPP_NUMBER}</a></p>
    </footer>
  );
}

function Toast({ message }) {
  return (
    <div className={`toast ${message ? "show" : ""}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}

function sendOrderToWhatsApp(order) {
  const itemSummary = order.items
    .map((item) => `${item.quantity} x ${item.name} = ${money(item.lineTotal)}`)
    .join("\n");
  const message = [
    `New Food Fantacy Order: ${order.id}`,
    "",
    `Name: ${order.customer.name}`,
    `Phone: ${order.customer.phone}`,
    `Address: ${order.customer.address}`,
    `Payment: ${order.customer.payment}`,
    order.customer.notes ? `Notes: ${order.customer.notes}` : "",
    "",
    "Items:",
    itemSummary,
    "",
    `Total: ${money(order.total)}`,
  ]
    .filter(Boolean)
    .join("\n");

  window.open(`https://wa.me/${KITCHEN_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank");
}
