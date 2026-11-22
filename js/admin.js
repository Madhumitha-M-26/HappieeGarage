$(function () {
  const PAGE_SIZE = 5;
  const MAX_CREDIT = 1000;
  let allProducts = [];
  let categories = {};
  let page = 0;

  function fail(err) { alert("Error: " + err.message); }

  // only the admin can open this page
  auth.onAuthStateChanged(user => {
    if (!user || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      window.location.href = "index.html";
    } else {
      loadCategories().then(loadProducts).catch(fail);
      loadCustomers();
    }
  });

  $("#btnLogout").click(() => auth.signOut().then(() => window.location.href = "index.html"));

  // ================= CUSTOMER CREDIT LIMIT =================
  function loadCustomers() {
    db.collection("customers").get().then(snap => {
      let html = `<tr><th>Name</th><th>Email</th><th>Mobile</th><th>Limit</th>
                  <th>Used</th><th>Available</th><th>Set new limit</th></tr>`;
      snap.forEach(d => {
        const c = d.data();
        const limit = c.creditLimit || 0, used = c.creditUsed || 0;
        html += `<tr><td>${c.name}</td><td>${c.email}</td><td>${c.mobile}</td>
          <td>₹${limit}</td><td>₹${used}</td><td>₹${Math.max(0, limit - used)}</td>
          <td>
            <input type="number" id="lim_${d.id}" min="0" max="${MAX_CREDIT}" value="${limit}" style="width:90px">
            <button class="small saveLim" data-id="${d.id}">Save</button>
            <button class="small dark resetLim" data-id="${d.id}">Reset limit</button>
            <button class="small gray settleLim" data-id="${d.id}">Settle used</button>
          </td></tr>`;
      });
      if (snap.empty) html += '<tr><td colspan="7">No customers yet</td></tr>';
      $("#custTable").html(html);
    }).catch(fail);
  }

  // UPDATE limit (cannot go below what is already used)
  $(document).on("click", ".saveLim", function () {
    const id = $(this).data("id");
    const v = parseInt($("#lim_" + id).val());
    if (isNaN(v) || v < 0 || v > MAX_CREDIT) return alert("Limit must be between 0 and " + MAX_CREDIT);
    db.collection("customers").doc(id).get().then(d => {
      const used = d.data().creditUsed || 0;
      if (v < used) return alert("Customer has already used ₹" + used + ". Limit cannot be lower than that.");
      return db.collection("customers").doc(id).update({ creditLimit: v }).then(loadCustomers);
    }).catch(fail);
  });

  // DELETE (reset) limit to 0, only if nothing is owed
  $(document).on("click", ".resetLim", function () {
    const id = $(this).data("id");
    db.collection("customers").doc(id).get().then(d => {
      const used = d.data().creditUsed || 0;
      if (used > 0) return alert("Customer still owes ₹" + used + ". Settle it first.");
      if (confirm("Reset this customer's credit limit to 0?")) {
        return db.collection("customers").doc(id).update({ creditLimit: 0 }).then(loadCustomers);
      }
    }).catch(fail);
  });

  // SETTLE: customer paid back, so used credit goes to 0
  $(document).on("click", ".settleLim", function () {
    const id = $(this).data("id");
    db.collection("customers").doc(id).get().then(d => {
      const used = d.data().creditUsed || 0;
      if (used === 0) return alert("Nothing to settle");
      if (!confirm("Customer paid ₹" + used + "? Mark credit as settled?")) return;
      const batch = db.batch();
      batch.update(db.collection("customers").doc(id), { creditUsed: 0 });
      batch.set(db.collection("creditTransactions").doc(), {
        customerId: id, orderId: null, amount: used, type: "credit",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return batch.commit().then(loadCustomers);
    }).catch(fail);
  });

  // ================= CATEGORIES =================
  function loadCategories() {
    return db.collection("categories").get().then(snap => {
      categories = {};
      let html = "<tr><th>Id</th><th>Name</th><th>Action</th></tr>";
      let opts = "";
      snap.forEach(doc => {
        const c = doc.data();
        categories[doc.id] = c.name;
        html += `<tr><td>${doc.id}</td><td>${c.name}</td>
                 <td><button class="small dark delCat" data-id="${doc.id}">Delete</button></td></tr>`;
        opts += `<option value="${doc.id}">${c.name}</option>`;
      });
      $("#catTable").html(html);
      $("#prodCat").html(opts);
      $("#filterCat").html('<option value="">All categories</option>' + opts);
    });
  }

  $("#btnAddCat").click(() => {
    const name = $("#catName").val().trim();
    if (!name) return alert("Enter category name");
    db.collection("categories").add({ name: name })
      .then(() => { $("#catName").val(""); return loadCategories(); })
      .catch(fail);
  });

  $(document).on("click", ".delCat", function () {
    if (confirm("Delete this category?")) {
      db.collection("categories").doc($(this).data("id")).delete()
        .then(loadCategories).catch(fail);
    }
  });

  // ================= CARS =================
  function loadProducts() {
    return db.collection("inventory").get().then(snap => {
      allProducts = [];
      snap.forEach(doc => allProducts.push({ docId: doc.id, ...doc.data() }));
      page = 0;
      render();
    });
  }

  // CREATE and UPDATE
  $("#btnSaveProd").click(() => {
    const data = {
      catId: $("#prodCat").val(),
      title: $("#prodTitle").val().trim(),
      des: $("#prodDes").val().trim(),
      rarity: $("#prodRarity").val(),
      qty: parseInt($("#prodQty").val()),
      price: parseFloat($("#prodPrice").val()),
      img: $("#prodImg").val().trim()
    };
    if (!data.catId) return alert("Add a category first");
    if (!data.title) return alert("Enter car name");
    if (isNaN(data.qty) || data.qty < 0) return alert("Enter a valid quantity");
    if (isNaN(data.price) || data.price <= 0) return alert("Enter a valid price");
    if (data.img && !/^https?:\/\//.test(data.img)) return alert("Image link must start with http");

    const editId = $("#prodDocId").val();
    if (editId) {
      db.collection("inventory").doc(editId).update(data).then(afterSave).catch(fail);
    } else {
      data.active = true;
      db.collection("inventory").add(data).then(afterSave).catch(fail);
    }
  });

  function afterSave() { resetForm(); loadProducts(); }

  function resetForm() {
    $("#prodDocId").val("");
    $("#prodTitle, #prodDes, #prodQty, #prodPrice, #prodImg").val("");
    $("#btnSaveProd").text("Add Car");
    $("#btnCancelEdit").hide();
  }
  $("#btnCancelEdit").click(resetForm);

  // READ with filter and pagination
  function filtered() {
    const cat = $("#filterCat").val();
    return cat ? allProducts.filter(p => p.catId === cat) : allProducts;
  }

  function render() {
    const list = filtered();
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (page >= totalPages) page = totalPages - 1;
    const items = list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    let html = `<tr><th>Id</th><th>Image</th><th>Category</th><th>Name</th><th>Description</th>
                <th>Rarity</th><th>Qty</th><th>Price</th><th>Status</th><th>Actions</th></tr>`;
    items.forEach(p => {
      const img = p.img ? `<img class="thumb" src="${p.img}" onerror="this.onerror=null;this.src='assets/car-placeholder.svg'">` : `<img class="thumb" src="assets/car-placeholder.svg" alt="${p.title}">`;
      html += `<tr class="${p.active ? "" : "inactive"}">
        <td>${p.docId}</td><td>${img}</td><td>${categories[p.catId] || "-"}</td>
        <td>${p.title}</td><td>${p.des}</td>
        <td><span class="badge ${p.rarity}">${p.rarity}</span></td>
        <td>${p.qty}</td><td>${p.price}</td>
        <td>${p.active ? "Active" : "Inactive"}</td>
        <td>
          <button class="small editProd" data-id="${p.docId}">Edit</button>
          <button class="small gray togProd" data-id="${p.docId}">${p.active ? "Deactivate" : "Activate"}</button>
          <button class="small dark delProd" data-id="${p.docId}">Delete</button>
        </td></tr>`;
    });
    if (!items.length) html += '<tr><td colspan="10">No cars found</td></tr>';
    $("#prodTable").html(html);
    $("#pageInfo").text(`Page ${page + 1} of ${totalPages}`);
  }

  $("#filterCat").change(() => { page = 0; render(); });
  $("#btnPrev").click(() => { if (page > 0) { page--; render(); } });
  $("#btnNext").click(() => { page++; render(); });

  // find one car by its Id
  $("#btnFind").click(() => {
    const id = $("#searchId").val().trim();
    if (!id) return alert("Paste an item Id first");
    allProducts = allProducts.filter(p => p.docId === id);
    page = 0;
    render();
  });
  $("#btnReset").click(() => { $("#searchId").val(""); loadProducts(); });

  // UPDATE: fill the form with the selected car
  $(document).on("click", ".editProd", function () {
    const p = allProducts.find(x => x.docId === $(this).data("id"));
    $("#prodDocId").val(p.docId);
    $("#prodCat").val(p.catId);
    $("#prodTitle").val(p.title);
    $("#prodDes").val(p.des);
    $("#prodRarity").val(p.rarity);
    $("#prodQty").val(p.qty);
    $("#prodPrice").val(p.price);
    $("#prodImg").val(p.img || "");
    $("#btnSaveProd").text("Update Car");
    $("#btnCancelEdit").show();
    window.scrollTo(0, 0);
  });

  // ACTIVATE / DEACTIVATE
  $(document).on("click", ".togProd", function () {
    const p = allProducts.find(x => x.docId === $(this).data("id"));
    db.collection("inventory").doc(p.docId).update({ active: !p.active })
      .then(loadProducts).catch(fail);
  });

  // DELETE with confirmation
  $(document).on("click", ".delProd", function () {
    if (confirm("Are you sure you want to delete this car?")) {
      db.collection("inventory").doc($(this).data("id")).delete()
        .then(loadProducts).catch(fail);
    }
  });
});