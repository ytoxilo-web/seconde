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
import {
  getStorage,
  getDownloadURL,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

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
const storage = getStorage(app);

const messageForm = document.querySelector("#messageForm");
const messageInput = document.querySelector("#messageInput");
const messagesList = document.querySelector("#messagesList");
const forumStatus = document.querySelector("#forumStatus");
const sendMessage = document.querySelector("#sendMessage");
const profileAvatar = document.querySelector("#profileAvatar");
const profileAvatarFallback = document.querySelector("#profileAvatarFallback");
const profilePictureInput = document.querySelector("#profilePictureInput");
const uploadProfilePicture = document.querySelector("#uploadProfilePicture");
const profilePictureStatus = document.querySelector("#profilePictureStatus");

let currentUser = null;
let latestMessagesSnapshot = null;
let userProfiles = {};

function setForumStatus(message, isError = false) {
  forumStatus.textContent = message;
  forumStatus.classList.toggle("is-error", isError);
}

function setProfileStatus(message, isError = false) {
  profilePictureStatus.textContent = message;
  profilePictureStatus.classList.toggle("is-error", isError);
}

function getPseudo(user) {
  if (user.displayName) return user.displayName;
  if (user.email) return user.email.split("@")[0];
  return "Utilisateur";
}

function getInitial(name) {
  return String(name || "U").trim().charAt(0).toUpperCase() || "U";
}

function showAvatar(url, fallbackText) {
  profileAvatarFallback.textContent = getInitial(fallbackText);

  if (url) {
    profileAvatar.src = url;
    profileAvatar.hidden = false;
    profileAvatarFallback.hidden = true;
    return;
  }

  profileAvatar.removeAttribute("src");
  profileAvatar.hidden = true;
  profileAvatarFallback.hidden = false;
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
  uploadProfilePicture.disabled = !user;
  profilePictureInput.disabled = !user;

  if (user) {
    loadUserProfile(user);
    setForumStatus(`Connecte en tant que ${getPseudo(user)}.`);
  } else {
    showAvatar("", "?");
    profilePictureInput.value = "";
    setProfileStatus("Connecte-toi pour ajouter une photo de profil.");
    setForumStatus("Connecte-toi pour envoyer un message.");
  }
});

async function loadUserProfile(user) {
  showAvatar(user.photoURL, getPseudo(user));

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnapshot = await getDoc(userRef);
    const userData = userSnapshot.exists() ? userSnapshot.data() : {};
    const photoURL = userData.photoURL || user.photoURL || "";

    showAvatar(photoURL, userData.pseudo || getPseudo(user));
    setProfileStatus(photoURL ? "Photo de profil chargee." : "Choisis une image pour afficher un avatar rond.");
  } catch (error) {
    setProfileStatus("Impossible de charger la photo de profil.", true);
  }
}

profilePictureInput.addEventListener("change", () => {
  const file = profilePictureInput.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    profilePictureInput.value = "";
    setProfileStatus("Le fichier choisi doit etre une image.", true);
    return;
  }

  showAvatar(URL.createObjectURL(file), currentUser ? getPseudo(currentUser) : "?");
  setProfileStatus("Apercu pret. Clique sur Changer la photo pour l'envoyer.");
});

uploadProfilePicture.addEventListener("click", async () => {
  if (!currentUser) {
    setProfileStatus("Tu dois etre connecte pour changer ta photo.", true);
    return;
  }

  const file = profilePictureInput.files[0];

  if (!file) {
    setProfileStatus("Choisis d'abord une image.", true);
    return;
  }

  if (!file.type.startsWith("image/")) {
    setProfileStatus("Le fichier choisi doit etre une image.", true);
    return;
  }

  try {
    uploadProfilePicture.disabled = true;
    setProfileStatus("Upload de la photo...");

    const avatarRef = ref(storage, `profilePictures/${currentUser.uid}/avatar`);
    await uploadBytes(avatarRef, file, { contentType: file.type });
    const downloadURL = await getDownloadURL(avatarRef);

    await setDoc(doc(db, "users", currentUser.uid), {
      userId: currentUser.uid,
      email: currentUser.email,
      pseudo: getPseudo(currentUser),
      photoURL: downloadURL,
      updatedAt: serverTimestamp()
    }, { merge: true });

    showAvatar(downloadURL, getPseudo(currentUser));
    profilePictureInput.value = "";
    setProfileStatus("Photo de profil mise a jour.");
  } catch (error) {
    setProfileStatus("Impossible d'envoyer la photo. Verifie Storage et ses regles.", true);
  } finally {
    uploadProfilePicture.disabled = false;
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
    setForumStatus("Le message n'a pas pu etre envoye. Verifie Firestore.", true);
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
    const avatar = profile.photoURL || "";
    const article = document.createElement("article");

    article.className = "forum-message";
    article.dataset.initial = getInitial(pseudo);
    if (avatar) {
      article.classList.add("has-avatar");
      article.style.setProperty("--avatar-url", `url("${avatar}")`);
    }
    article.innerHTML = `
      <div class="forum-message-body">
        <div class="forum-message-head">
          <span>${escapeHtml(pseudo)}</span>
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

  if (latestMessagesSnapshot) {
    renderMessages(latestMessagesSnapshot);
  }
}, () => {
  setProfileStatus("Impossible de lire les profils. Verifie les regles Firestore users.", true);
});

onSnapshot(messagesQuery, (snapshot) => {
  latestMessagesSnapshot = snapshot;
  renderMessages(snapshot);
}, () => {
  messagesList.innerHTML = '<div class="empty-courses">Impossible de charger les messages. Verifie Firestore et ses regles.</div>';
});
