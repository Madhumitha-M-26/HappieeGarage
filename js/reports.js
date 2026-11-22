$(function () {
  const HIGH_STOCK = 100;
  const LOW_STOCK = 15;
  let categories = {}, products = [], customers = {}, lines = [];

  function fail(e) { alert("Error: " + e.message); }

  auth.onAuthStateChanged(user => {
    if (!user || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return (location.href = "index.html");
    }
    loadAll();
  });

  $("#btnLogout").click(() => auth.signOut().then(() => location.href = "index.html"));
  $("#btnPrint").click(() => window.print());

  // ---------- load all data once ----------
  function loadAll() {
    Promise.all([
      db.collection("categories").get(),
      db.collection("inventory").get(),
      db.collection("customers").get(),
      db.collection("salesLines").get()
    ]).then(([cats, inv, cust, sales]) => {
      let opts = "";
      cats.forEach(d => {
        categories[d.id] = d.data().name;
        opts += `<option value="${d.id}">${d.data().name}</option>`;
      });
      $("#repCat").html(opts);
      inv.forEach(d => products.push({ id: d.id, ...d.data() }));
      cust.forEach(d => customers[d.id] = d.data());
      sales.forEach(d => lines.push({ id: d.id, ...d.data() }));
    }).catch(fail);
  }

  $("#reportType").change(function () {
    $("#catWrap").toggle($(this).val() === "i_cat");
  });

  // ---------- helpers ----------
  function inRange(l) {
    if (!l.createdAt) return false;
    const d = l.createdAt.toDate();
    const f = $("#from").val(), t = $("#to").val();
    if (f && d < new Date(f + "T00:00:00")) return false;
    if (t && d > new Date(t + "T23:59:59")) return false;
    return true;
  }

  function rangeLines(mode) {
    return lines.filter(l => inRange(l) && (!mode || l.paymentMode === mode));
  }

  function group(list, keyFn) {
    const m = {};
    list.forEach(l => { const k = keyFn(l); (m[k] = m[k] || []).push(l); });
    return m;
  }

  function sum(list, f) { return list.reduce((s, l) => s + f(l), 0); }

  function table(head, rows, foot) {
    let h = "<tr>" + head.map(x => `<th>${x}</th>`).join("") + "</tr>";
    rows.forEach(r => h += "<tr>" + r.map(x => `<td>${x}</td>`).join("") + "</tr>");
    if (!rows.length) h += `<tr><td colspan="${head.length}">No data for this report</td></tr>`;
    return h + (foot || "");
  }

  // ---------- customer reports ----------
  function customerSummary(list) {
    const g = group(list, l => l.customerId);
    return Object.keys(g).map(id => {
      const c = customers[id] || { name: "(deleted)", email: "-" };
      return {
        name: c.name, email: c.email,
        orders: new Set(g[id].map(l => l.orderId)).size,
        total: sum(g[id], l => l.lineTotal)
      };
    }).sort((a, b) => b.total - a.total);
  }

  function summaryRows(arr) {
    return arr.map((c, i) => [i + 1, c.name, c.email, c.orders, "₹" + c.total]);
  }
  const summaryHead = ["#", "Customer", "Email", "Orders", "Total purchase"];

  // ---------- sales helpers ----------
  function lineTable(list) {
    const sorted = list.slice().sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
    const rows = sorted.map(l => [
      l.createdAt.toDate().toLocaleDateString(), l.orderId.slice(0, 6), l.title,
      categories[l.catId] || "-", l.qty, "₹" + l.price, "₹" + l.lineTotal, l.paymentMode
    ]);
    const foot = `<tr><th colspan="4">Total</th><th>${sum(list, l => l.qty)}</th><th></th>
                  <th>₹${sum(list, l => l.lineTotal)}</th><th></th></tr>`;
    return table(["Date", "Order", "Car", "Category", "Qty", "Price", "Amount", "Payment"], rows, foot);
  }

  function itemTotals(includeUnsold) {
    const m = {};
    if (includeUnsold) products.forEach(p => m[p.id] = { title: p.title, qty: 0, amount: 0 });
    rangeLines().forEach(l => {
      if (!m[l.productId]) m[l.productId] = { title: l.title, qty: 0, amount: 0 };
      m[l.productId].qty += l.qty;
      m[l.productId].amount += l.lineTotal;
    });
    return Object.values(m);
  }

  function stockTable(list) {
    const rows = list.map(p => [p.title, categories[p.catId] || "-", p.rarity, p.qty, "₹" + p.price,
                                p.active ? "Active" : "Inactive"]);
    return table(["Car", "Category", "Rarity", "Stock", "Price", "Status"], rows);
  }

  // ---------- the 14 reports ----------
  const R = {
    c_all: ["All customers", () => {
      const rows = Object.values(customers).map(c =>
        [c.name, c.email, c.mobile, "₹" + (c.creditLimit || 0), "₹" + (c.creditUsed || 0)]);
      return table(["Name", "Email", "Mobile", "Credit limit", "Credit used"], rows);
    }],
    c_top: ["Top 10 customers", () =>
      table(summaryHead, summaryRows(customerSummary(rangeLines()).slice(0, 10)))],
    c_cash: ["Cash purchases by customer", () =>
      table(summaryHead, summaryRows(customerSummary(rangeLines("cash"))))],
    c_credit: ["Credit purchases by customer", () =>
      table(summaryHead, summaryRows(customerSummary(rangeLines("credit"))))],

    i_all: ["Current stock: all cars", () => stockTable(products)],
    i_cat: ["Current stock: by category", () => stockTable(products.filter(p => p.catId === $("#repCat").val()))],
    i_high: ["High stock (more than " + HIGH_STOCK + ")", () => stockTable(products.filter(p => p.qty > HIGH_STOCK))],
    i_low: ["Low stock (less than " + LOW_STOCK + ")", () => stockTable(products.filter(p => p.qty < LOW_STOCK))],

    s_all: ["All sales", () => lineTable(rangeLines())],
    s_cat: ["Category-wise sales", () => {
      const g = group(rangeLines(), l => l.catId);
      const rows = Object.keys(g).map(id => [categories[id] || "-", sum(g[id], l => l.qty), "₹" + sum(g[id], l => l.lineTotal)]);
      return table(["Category", "Cars sold", "Sales amount"], rows);
    }],
    s_cash: ["Cash sales", () => lineTable(rangeLines("cash"))],
    s_credit: ["Credit sales", () => lineTable(rangeLines("credit"))],
    s_top: ["Top 10 selling cars", () => {
      const arr = itemTotals(false).sort((a, b) => b.qty - a.qty).slice(0, 10);
      return table(["#", "Car", "Qty sold", "Sales amount"], arr.map((x, i) => [i + 1, x.title, x.qty, "₹" + x.amount]));
    }],
    s_bottom: ["Bottom 10 selling cars", () => {
      const arr = itemTotals(true).sort((a, b) => a.qty - b.qty).slice(0, 10);
      return table(["#", "Car", "Qty sold", "Sales amount"], arr.map((x, i) => [i + 1, x.title, x.qty, "₹" + x.amount]));
    }]
  };

  $("#btnRun").click(() => {
    const r = R[$("#reportType").val()];
    $("#title").text(r[0]);
    $("#result").html(r[1]());
  });
});