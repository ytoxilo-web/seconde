import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDzyz3FXGXQMKnRNneXuvcWB_m5sLCFx6M",
  authDomain: "nd-64612.firebaseapp.com",
  projectId: "nd-64612",
  storageBucket: "nd-64612.firebasestorage.app",
  messagingSenderId: "665169411169",
  appId: "1:665169411169:web:60a1b0e7f33e4bce6b7e20",
  measurementId: "G-1TSX99RNLS"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const messageForm = document.querySelector("#messageForm");
const messageInput = document.querySelector("#messageInput");
const messagesList = document.querySelector("#messagesList");
const forumStatus = document.querySelector("#forumStatus");
const sendMessage = document.querySelector("#sendMessage");
const profileStatus = document.querySelector("#profileStatus");
const usernameColorPicker = document.querySelector("#usernameColorPicker");

let currentUser = null;
let latestMessagesSnapshot = null;
let userProfiles = {};
const DEFAULT_USERNAME_COLOR = "#b9ecff";

function setForumStatus(message, isError = false) {
  forumStatus.textContent = message;
  forumStatus.classList.toggle("is-error", isError);
}

function setProfileStatus(message, isError = false) {
  profileStatus.textContent = message;
  profileStatus.classList.toggle("is-error", isError);
}

function firebaseErrorText(error) {
  return error?.code ? `${error.code} - ${error.message}` : "Erreur Firebase inconnue.";
}

function getPseudo(user) {
  if (user.displayName) return user.displayName;
  if (user.email) return user.email.split("@")[0];
  return "Utilisateur";
}

function getInitial(name) {
  return String(name || "U").trim().charAt(0).toUpperCase() || "U";
}

function isValidHexColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(String(color || ""));
}

function getSafeUsernameColor(color) {
  return isValidHexColor(color) ? color : DEFAULT_USERNAME_COLOR;
}

function setProfileUsernameColor(color) {
  const safeColor = getSafeUsernameColor(color);
  usernameColorPicker.value = safeColor;
  document.querySelector("#authUserName").style.color = safeColor;
}

function formatDate(date) {
  if (!date) return "A l'instant";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  sendMessage.disabled = !user;
  messageInput.disabled = !user;
  usernameColorPicker.disabled = !user;

  if (user) {
    loadUserProfile(user);
    setForumStatus(`Connecte en tant que ${getPseudo(user)}.`);
  } else {
    setProfileUsernameColor(DEFAULT_USERNAME_COLOR);
    setProfileStatus("Connecte-toi pour changer la couleur du pseudo.");
    setForumStatus("Connecte-toi pour envoyer un message.");
  }
});

async function loadUserProfile(user) {
  try {
    const userRef = doc(db, "users", user.uid);
    const userSnapshot = await getDoc(userRef);
    const userData = userSnapshot.exists() ? userSnapshot.data() : {};
    const usernameColor = getSafeUsernameColor(userData.usernameColor);

    setProfileUsernameColor(usernameColor);
    setProfileStatus("Couleur de pseudo chargee.");
  } catch (error) {
    console.error("Erreur chargement profil:", error);
    setProfileStatus(`Impossible de charger le profil: ${firebaseErrorText(error)}`, true);
  }
}

usernameColorPicker.addEventListener("change", async () => {
  if (!currentUser) {
    setProfileStatus("Tu dois etre connecte pour changer la couleur du pseudo.", true);
    setProfileUsernameColor(DEFAULT_USERNAME_COLOR);
    return;
  }

  const usernameColor = usernameColorPicker.value;

  if (!isValidHexColor(usernameColor)) {
    setProfileStatus("La couleur doit etre au format hex: #RRGGBB.", true);
    setProfileUsernameColor(DEFAULT_USERNAME_COLOR);
    return;
  }

  try {
    setProfileUsernameColor(usernameColor);
    await setDoc(doc(db, "users", currentUser.uid), {
      userId: currentUser.uid,
      email: currentUser.email,
      username: getPseudo(currentUser),
      pseudo: getPseudo(currentUser),
      usernameColor,
      updatedAt: serverTimestamp()
    }, { merge: true });

    setProfileStatus("Couleur du pseudo mise a jour.");
  } catch (error) {
    console.error("Erreur couleur pseudo:", error);
    setProfileStatus(`Impossible de changer la couleur: ${firebaseErrorText(error)}`, true);
  }
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) {
    setForumStatus("Tu dois etre connecte pour envoyer un message.", true);
    return;
  }

  const texte = messageInput.value.trim();

  if (!texte) {
    setForumStatus("Impossible d'envoyer un message vide.", true);
    return;
  }

  try {
    await addDoc(collection(db, "messages"), {
      userId: currentUser.uid,
      email: currentUser.email,
      pseudo: getPseudo(currentUser),
      texte,
      date: serverTimestamp()
    });

    messageForm.reset();
    setForumStatus("Message envoye.");
  } catch (error) {
    console.error("Erreur envoi message:", error);
    setForumStatus(`Le message n'a pas pu etre envoye: ${firebaseErrorText(error)}`, true);
  }
});

const messagesQuery = query(collection(db, "messages"), orderBy("date", "asc"));

function renderMessages(snapshot) {
  messagesList.innerHTML = "";

  if (snapshot.empty) {
    messagesList.innerHTML = '<div class="empty-courses">Aucun message pour le moment.</div>';
    return;
  }

  snapshot.forEach((doc) => {
    const message = doc.data();
    const date = message.date?.toDate ? message.date.toDate() : null;
    const profile = userProfiles[message.userId] || {};
    const pseudo = profile.pseudo || message.pseudo || message.email || "Utilisateur";
    const usernameColor = getSafeUsernameColor(profile.usernameColor);
    const article = document.createElement("article");

    article.className = "forum-message";
    article.dataset.initial = getInitial(pseudo);
    article.innerHTML = `
      <div class="forum-message-body">
        <div class="forum-message-head">
          <span class="username" style="color: ${usernameColor};">${escapeHtml(pseudo)}</span>
          <span class="forum-message-date">${escapeHtml(formatDate(date))}</span>
        </div>
        <p>${escapeHtml(message.texte)}</p>
      </div>
    `;

    messagesList.appendChild(article);
  });
}

onSnapshot(collection(db, "users"), (snapshot) => {
  userProfiles = {};

  snapshot.forEach((doc) => {
    userProfiles[doc.id] = doc.data();
  });

  if (currentUser && userProfiles[currentUser.uid]) {
    setProfileUsernameColor(userProfiles[currentUser.uid].usernameColor);
  }

  if (latestMessagesSnapshot) {
    renderMessages(latestMessagesSnapshot);
  }
}, (error) => {
  console.error("Erreur lecture profils:", error);
  setProfileStatus(`Impossible de lire les profils: ${firebaseErrorText(error)}`, true);
});

onSnapshot(messagesQuery, (snapshot) => {
  latestMessagesSnapshot = snapshot;
  renderMessages(snapshot);
}, (error) => {
  console.error("Erreur lecture messages:", error);
  messagesList.innerHTML = `<div class="empty-courses">Impossible de charger les messages: ${escapeHtml(firebaseErrorText(error))}</div>`;
});
