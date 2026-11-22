$(function () {

  function show(id) {
    $("#loginForm, #signupForm, #resetForm").hide();
    $(id).show();
    $("#msg").text("");
  }
  $("#showSignup").click(e => { e.preventDefault(); show("#signupForm"); });
  $("#showReset").click(e => { e.preventDefault(); show("#resetForm"); });
  $(".showLogin").click(e => { e.preventDefault(); show("#loginForm"); });

  function msg(text, ok) {
    $("#msg").css("color", ok ? "green" : "#dc2626").text(text);
  }

  function isAdmin(email) {
    return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  }

  function redirect(user) {
    window.location.href = isAdmin(user.email) ? "admin.html" : "shop.html";
  }

  // ---------- SIGN UP ----------
  $("#btnSignup").click(function () {
    const name = $("#suName").val().trim();
    const email = $("#suEmail").val().trim();
    const mobile = $("#suMobile").val().trim();
    const password = $("#suPassword").val();

    if (name.length < 3) return msg("Name must be at least 3 characters");
    if (!/^\S+@\S+\.\S+$/.test(email)) return msg("Enter a valid email");
    if (!/^[6-9]\d{9}$/.test(mobile)) return msg("Enter a valid 10-digit mobile number");
    if (password.length < 6) return msg("Password must be at least 6 characters");

    auth.createUserWithEmailAndPassword(email, password)
      .then(cred => {
        if (isAdmin(email)) return cred;     // admin is not a customer
        return db.collection("customers").doc(cred.user.uid).set({
          id: cred.user.uid,
          name: name,
          email: email,
          mobile: mobile,
          creditLimit: 0,
          creditUsed: 0
        }).then(() => cred);
      })
      .then(cred => redirect(cred.user))
      .catch(err => msg(err.message));
  });

  // ---------- SIGN IN ----------
  $("#btnLogin").click(function () {
    const email = $("#loginEmail").val().trim();
    const password = $("#loginPassword").val();
    if (!email || !password) return msg("Enter email and password");

    auth.signInWithEmailAndPassword(email, password)
      .then(cred => redirect(cred.user))
      .catch(() => msg("Invalid email or password"));
  });

  // ---------- RESET PASSWORD ----------
  $("#btnReset").click(function () {
    const email = $("#resetEmail").val().trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return msg("Enter a valid email");

    auth.sendPasswordResetEmail(email)
      .then(() => msg("Reset email sent. Check your inbox and spam.", true))
      .catch(err => msg(err.message));
  });
});