const ADMIN_EMAIL = "madhumithamanavazhgan@gmail.com";

const firebaseConfig = {
  apiKey: "AIzaSyB77d7dE5Sz2C7t3QTCu7qlXkEyhhGROcM",
  authDomain: "e-commerce-dfa6e.firebaseapp.com",
  projectId: "e-commerce-dfa6e",
  storageBucket: "e-commerce-dfa6e.firebasestorage.app",
  messagingSenderId: "935134164582",
  appId: "1:935134164582:web:64fe1983d42fc42433dfa7"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();