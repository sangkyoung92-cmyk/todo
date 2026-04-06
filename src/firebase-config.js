import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBKpgGUc7No1ZQ4RsVowYWeUpxAH90TgUU",
  authDomain: "todo-b13b9.firebaseapp.com",
  projectId: "todo-b13b9",
  storageBucket: "todo-b13b9.firebasestorage.app",
  messagingSenderId: "270806970924",
  appId: "1:270806970924:web:ae2973270bc876b8781789",
  measurementId: "G-FPBNNVKT7F",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
