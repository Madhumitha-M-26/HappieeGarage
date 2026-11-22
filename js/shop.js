$(function () {
  const PAGE_SIZE = 8;
  const EMAILJS_SERVICE = "service_xlne95s";
  const EMAILJS_TEMPLATE = "template_etbo7t9";
  const EMAILJS_KEY = "wHDHRfpadOxU_NAFB";

  let user, products = [], categories = {}, cart = {}, page = 0;

  emailjs.init({ publicKey: EMAILJS_KEY });

  function fail(e) { alert("Error: " + e.message); }

  auth.onAuthStateChanged(u => {
    if (!u) return (location.href = "index.html");
    if (u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return (location.href = "admin.html");
    user = u;
    $("#who").text(u.email);
    init();
  });

  $("#btnLogout").click(() => auth.signOut().then(() => location.href = "index.html"));

  // ---------- load data ----------
  function init() {
    Promise.all([
      db.collection("categories").get(),
      db.collection("inventory").get(),
      db.collection("carts").doc(user.uid).get()
    ]).then(([cats, inv, c]) => {
      let opts = "";
      cats.forEach(d => {
        categories[d.id] = d.data().name;
        opts += `<option value="${d.id}">${d.data().name}</option>`;
      });
      $("#filterCat").append(opts);

      products = [];
      inv.forEach(d => { const p = { id: d.id, ...d.data() }; if (p.active) products.push(p); });

      cart = {};
      if (c.exists) (c.data().items || []).forEach(i => cart[i.productId] = i.qty);

      render(); renderCart(); showCredit();
    }).catch(fail);
  }

  function showCredit() {
    db.collection("customers").doc(user.uid).get().then(d => {
      const c = d.data() || {};
      const avail = Math.max(0, (c.creditLimit || 0) - (c.creditUsed || 0));
      $("#creditInfo").text("Available credit: ₹" + avail);
    });
  }

  // ---------- list, search, filter, pagination ----------
  function filtered() {
    const q = $("#search").val().toLowerCase().trim();
    const cat = $("#filterCat").val();
    return products.filter(p =>
      (!cat || p.catId === cat) &&
      (!q || p.title.toLowerCase().includes(q) || (p.des || "").toLowerCase().includes(q)));
  }

  function carAssetFor(id) {
    const text = String(id || "car");
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    const n = (Math.abs(hash) % 12) + 1;
    return `assets/cars/car-${String(n).padStart(2, "0")}.svg`;
  }

  function render() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (page >= pages) page = pages - 1;
    const items = list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    let html = "";
    items.forEach(p => {
      const fallback = carAssetFor(p.id);
      const img = p.img ? `<img src="${p.img}" alt="${p.title}" onerror="this.onerror=null;this.src='${fallback}'">` : `<img src="${fallback}" alt="${p.title}">`;
      html += `<div class="car">${img}
        <span class="badge ${p.rarity}">${p.rarity}</span>
        <h3>${p.title}</h3>
        <p>${categories[p.catId] || ""}</p><p>${p.des || ""}</p>
        <p class="price">₹${p.price}</p>
        <p>${p.qty > 0 ? p.qty + " left" : "Out of stock"}</p>
        ${p.qty > 0 ? `<div class="qtybox"><input type="number" min="1" max="${p.qty}" value="1" id="q_${p.id}">
        <button class="small addCart" data-id="${p.id}">Add</button></div>` : ""}
      </div>`;
    });
    if (!items.length) html = "<p>No cars found</p>";
    $("#grid").html(html);
    $("#pageInfo").text(`Page ${page + 1} of ${pages}`);
  }

  $("#search").on("input", () => { page = 0; render(); });
  $("#filterCat").change(() => { page = 0; render(); });
  $("#btnPrev").click(() => { if (page > 0) { page--; render(); } });
  $("#btnNext").click(() => { page++; render(); });

  // ---------- cart ----------
  $(document).on("click", ".addCart", function () {
    const id = $(this).data("id");
    const p = products.find(x => x.id === id);
    const q = parseInt($("#q_" + id).val());
    if (isNaN(q) || q < 1) return alert("Enter a valid quantity");
    const total = (cart[id] || 0) + q;
    if (total > p.qty) return alert("Only " + p.qty + " in stock");
    cart[id] = total;
    saveCart(); renderCart();
  });

  $(document).on("click", ".rmCart", function () {
    delete cart[$(this).data("id")];
    saveCart(); renderCart();
  });

  function saveCart() {
    const items = Object.keys(cart).map(id => ({ productId: id, qty: cart[id] }));
    db.collection("carts").doc(user.uid).set({
      customerId: user.uid, items: items, status: "open",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(fail);
  }

  function renderCart() {
    let html = "", total = 0;
    Object.keys(cart).forEach(id => {
      const p = products.find(x => x.id === id);
      if (!p) return;
      const line = p.price * cart[id];
      total += line;
      html += `<div class="cart-line"><span>${p.title} x ${cart[id]}</span>
        <span>₹${line} <button class="small dark rmCart" data-id="${id}">x</button></span></div>`;
    });
    $("#cartItems").html(html || "<p>Cart is empty</p>");
    $("#cartTotal").text(total);
  }

  // ---------- send confirmation email ----------
  function sendEmail(orderId, cust, lines, total, mode) {
    const params = {
      to_email: cust.email,
      customer_name: cust.name,
      order_id: orderId,
      payment_mode: mode.toUpperCase(),
      items: lines.map(l => l.title + " x" + l.qty).join(", "),
      total: total
    };
    return emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, params)
      .then(() => "sent")
      .catch(err => { console.log("Email failed", err); return "failed"; });
  }

  // ---------- checkout ----------
  $("#btnCheckout").click(function () {
    const ids = Object.keys(cart);
    if (!ids.length) return alert("Cart is empty");
    const mode = $("#payMode").val();
    const btn = $(this).prop("disabled", true);

    const custRef = db.collection("customers").doc(user.uid);
    const orderRef = db.collection("orders").doc();
    const notifRef = db.collection("orderNotifications").doc();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    let result = {};

    db.runTransaction(async tx => {
      // all reads first
      const cust = (await tx.get(custRef)).data();
      const snaps = [];
      for (const id of ids) snaps.push(await tx.get(db.collection("inventory").doc(id)));

      // validate
      let total = 0;
      const lines = [];
      snaps.forEach(s => {
        if (!s.exists) throw new Error("A car in your cart no longer exists");
        const p = s.data(), q = cart[s.id];
        if (!p.active) throw new Error(p.title + " is no longer available");
        if (p.qty < q) throw new Error(p.title + ": only " + p.qty + " left");
        total += p.price * q;
        lines.push({ id: s.id, title: p.title, catId: p.catId, price: p.price, qty: q, left: p.qty - q });
      });
      if (mode === "credit") {
        const avail = Math.max(0, (cust.creditLimit || 0) - (cust.creditUsed || 0));
        if (total > avail) throw new Error("Not enough credit. Available ₹" + avail + ", order ₹" + total);
      }

      // writes
      tx.set(orderRef, {
        customerId: user.uid, customerName: cust.name, email: cust.email,
        items: lines.map(l => ({ productId: l.id, title: l.title, price: l.price, qty: l.qty })),
        total: total, paymentMode: mode, status: "placed", createdAt: now
      });
      lines.forEach(l => {
        tx.update(db.collection("inventory").doc(l.id), { qty: l.left });
        tx.set(db.collection("salesLines").doc(), {
          orderId: orderRef.id, productId: l.id, title: l.title, catId: l.catId,
          qty: l.qty, price: l.price, lineTotal: l.price * l.qty,
          paymentMode: mode, customerId: user.uid, createdAt: now
        });
      });
      if (mode === "credit") {
        tx.update(custRef, { creditUsed: (cust.creditUsed || 0) + total });
        tx.set(db.collection("creditTransactions").doc(), {
          customerId: user.uid, orderId: orderRef.id, amount: total, type: "debit", createdAt: now
        });
      }
      tx.set(notifRef, { orderId: orderRef.id, email: cust.email, status: "pending", createdAt: now });
      tx.set(db.collection("carts").doc(user.uid), { customerId: user.uid, items: [], status: "open", updatedAt: now });

      result = { cust, lines, total };
    }).then(() => {
      // order is saved; now send the email and record the result
      return sendEmail(orderRef.id, result.cust, result.lines, result.total, mode)
        .then(status => notifRef.update({ status: status }));
    }).then(() => {
      location.href = "bill.html?id=" + orderRef.id;
    }).catch(e => { alert(e.message); btn.prop("disabled", false); });
  });
});