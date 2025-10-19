// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.24.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, getDocs, doc, setDoc
} from "https://www.gstatic.com/firebasejs/9.24.0/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCB9zVerEG3NV576aZlFo5J1LMsDipdtxA",
  authDomain: "chat-5c43d.firebaseapp.com",
  projectId: "chat-5c43d",
  storageBucket: "chat-5c43d.firebasestorage.app",
  messagingSenderId: "700137269779",
  appId: "1:700137269779:web:60a0374fb13083fadc6de6",
  measurementId: "G-8T9GVNH6LH"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Simple helper to export Firestore functions used in main.js
export {
  collection, addDoc, onSnapshot, query, orderBy, getDocs,
  doc, setDoc
};
