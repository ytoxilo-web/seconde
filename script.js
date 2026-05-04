import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
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
const tagAdminPanel = document.querySelector("#tagAdminPanel");
const tagAdminStatus = document.querySelector("#tagAdminStatus");
const tagForm = document.querySelector("#tagForm");
const editingTagId = document.querySelector("#editingTagId");
const tagName = document.querySelector("#tagName");
const tagColor = document.querySelector("#tagColor");
const tagDescription = document.querySelector("#tagDescription");
const saveTag = document.querySelector("#saveTag");
const cancelTagEdit = document.querySelector("#cancelTagEdit");
const tagList = document.querySelector("#tagList");
const userTagList = document.querySelector("#userTagList");

let currentUser = null;
let currentUserProfile = null;
let latestMessagesSnapshot = null;
let userProfiles = {};
let tagDefinitions = {};
const DEFAULT_USERNAME_COLOR = "#b9ecff";
const DEFAULT_TAG_COLOR = "#64748b";

function setForumStatus(message, isError = false) {
  forumStatus.textContent = message;
  forumStatus.classList.toggle("is-error", isError);
}

function setProfileStatus(message, isError = false) {
  profileStatus.textContent = message;
  profileStatus.classList.toggle("is-error", isError);
}

function setTagAdminStatus(message, isError = false) {
  tagAdminStatus.textContent = message;
  tagAdminStatus.classList.toggle("is-error", isError);
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

function getSafeTagColor(color) {
  return isValidHexColor(color) ? color : DEFAULT_TAG_COLOR;
}

function setProfileUsernameColor(color) {
  const safeColor = getSafeUsernameColor(color);
  usernameColorPicker.value = safeColor;
  document.querySelector("#authUserName").style.color = safeColor;
}

function isCurrentUserAdmin() {
  return currentUser && currentUserProfile?.role === "admin";
}

function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.filter((tagId) => typeof tagId === "string") : [];
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
  currentUserProfile = null;
  sendMessage.disabled = !user;
  messageInput.disabled = !user;
  usernameColorPicker.disabled = !user;
  renderAdminVisibility();

  if (user) {
    loadUserProfile(user);
    setForumStatus(`Connecte en tant que ${getPseudo(user)}.`);
  } else {
    setProfileUsernameColor(DEFAULT_USERNAME_COLOR);
    setProfileStatus("Connecte-toi pour changer la couleur du pseudo.");
    setForumStatus("Connecte-toi pour envoyer un message.");
    setTagAdminStatus("Reserve aux administrateurs Firebase.");
  }
});

async function loadUserProfile(user) {
  try {
    const userRef = doc(db, "users", user.uid);
    const userSnapshot = await getDoc(userRef);
    let userData = userSnapshot.exists() ? userSnapshot.data() : {};

    if (!userSnapshot.exists()) {
      userData = {
        userId: user.uid,
        email: user.email,
        username: getPseudo(user),
        pseudo: getPseudo(user),
        usernameColor: DEFAULT_USERNAME_COLOR,
        role: "user",
        tags: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(userRef, userData, { merge: true });
    }

    const usernameColor = getSafeUsernameColor(userData.usernameColor);

    currentUserProfile = {
      ...userData,
      tags: normalizeTags(userData.tags),
      role: userData.role === "admin" ? "admin" : "user"
    };
    setProfileUsernameColor(usernameColor);
    setProfileStatus("Couleur de pseudo chargee.");
    renderAdminVisibility();
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

function renderAdminVisibility() {
  tagAdminPanel.classList.toggle("is-visible", isCurrentUserAdmin());

  if (isCurrentUserAdmin()) {
    setTagAdminStatus("Mode admin actif.");
    renderTagList();
    renderUserTagList();
  }
}

function resetTagForm() {
  tagForm.reset();
  editingTagId.value = "";
  tagColor.value = "#ffcc00";
  saveTag.textContent = "Creer le tag";
}

function renderTagList() {
  const tags = Object.entries(tagDefinitions);
  tagList.innerHTML = "";

  if (tags.length === 0) {
    tagList.innerHTML = '<div class="empty-courses">Aucun tag pour le moment.</div>';
    return;
  }

  tags.forEach(([tagId, tag]) => {
    const item = document.createElement("article");
    item.className = "tag-admin-item";
    item.innerHTML = `
      <h4><span class="chat-tag" style="background:${getSafeTagColor(tag.color)}">${escapeHtml(tag.name || tagId)}</span></h4>
      <p>${escapeHtml(tag.description || "Pas de description.")}</p>
      <div class="tag-admin-actions">
        <button class="btn secondary" type="button" data-edit-tag="${escapeHtml(tagId)}">Modifier</button>
        <button class="btn danger" type="button" data-delete-tag="${escapeHtml(tagId)}">Supprimer</button>
      </div>
    `;
    tagList.appendChild(item);
  });
}

function renderUserTagList() {
  const users = Object.entries(userProfiles);
  const tags = Object.entries(tagDefinitions);
  userTagList.innerHTML = "";

  if (users.length === 0) {
    userTagList.innerHTML = '<div class="empty-courses">Aucun utilisateur trouve.</div>';
    return;
  }

  users.forEach(([userId, user]) => {
    const userTags = normalizeTags(user.tags);
    const item = document.createElement("article");
    item.className = "tag-admin-item";
    const tagControls = tags.length
      ? tags.map(([tagId, tag]) => `
          <label>
            <input type="checkbox" data-user-id="${escapeHtml(userId)}" data-user-tag="${escapeHtml(tagId)}" ${userTags.includes(tagId) ? "checked" : ""}>
            <span class="chat-tag" style="background:${getSafeTagColor(tag.color)}">${escapeHtml(tag.name || tagId)}</span>
          </label>
        `).join("")
      : '<p>Aucun tag a attribuer.</p>';

    item.innerHTML = `
      <h4>${escapeHtml(user.username || user.pseudo || user.email || userId)}</h4>
      <p>${escapeHtml(user.email || "")}${user.role === "admin" ? " - admin" : ""}</p>
      <div class="user-tag-options">${tagControls}</div>
    `;
    userTagList.appendChild(item);
  });
}

tagForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isCurrentUserAdmin()) {
    setTagAdminStatus("Action refusee: tu n'es pas admin.", true);
    return;
  }

  const name = tagName.value.trim();
  const color = tagColor.value;
  const description = tagDescription.value.trim();

  if (!name) {
    setTagAdminStatus("Le nom du tag est obligatoire.", true);
    return;
  }

  if (!isValidHexColor(color)) {
    setTagAdminStatus("La couleur du tag doit etre au format #RRGGBB.", true);
    return;
  }

  try {
    const tagData = {
      name,
      color,
      description,
      updatedAt: serverTimestamp()
    };

    if (editingTagId.value) {
      await setDoc(doc(db, "tags", editingTagId.value), tagData, { merge: true });
      setTagAdminStatus("Tag modifie.");
    } else {
      await addDoc(collection(db, "tags"), {
        ...tagData,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
      setTagAdminStatus("Tag cree.");
    }

    resetTagForm();
  } catch (error) {
    console.error("Erreur tag:", error);
    setTagAdminStatus(`Impossible d'enregistrer le tag: ${firebaseErrorText(error)}`, true);
  }
});

cancelTagEdit.addEventListener("click", resetTagForm);

tagList.addEventListener("click", async (event) => {
  if (!isCurrentUserAdmin()) return;

  const editButton = event.target.closest("[data-edit-tag]");
  const deleteButton = event.target.closest("[data-delete-tag]");

  if (editButton) {
    const tagId = editButton.dataset.editTag;
    const tag = tagDefinitions[tagId];
    if (!tag) return;

    editingTagId.value = tagId;
    tagName.value = tag.name || "";
    tagColor.value = getSafeTagColor(tag.color);
    tagDescription.value = tag.description || "";
    saveTag.textContent = "Modifier le tag";
  }

  if (deleteButton) {
    const tagId = deleteButton.dataset.deleteTag;

    try {
      await deleteDoc(doc(db, "tags", tagId));

      await Promise.all(Object.entries(userProfiles).map(([userId, user]) => {
        const nextTags = normalizeTags(user.tags).filter((item) => item !== tagId);
        return setDoc(doc(db, "users", userId), {
          tags: nextTags,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }));

      setTagAdminStatus("Tag supprime.");
    } catch (error) {
      console.error("Erreur suppression tag:", error);
      setTagAdminStatus(`Impossible de supprimer le tag: ${firebaseErrorText(error)}`, true);
    }
  }
});

userTagList.addEventListener("change", async (event) => {
  const checkbox = event.target.closest("[data-user-tag]");
  if (!checkbox || !isCurrentUserAdmin()) return;

  const userId = checkbox.dataset.userId;
  const tagId = checkbox.dataset.userTag;
  const user = userProfiles[userId];
  if (!user || !tagDefinitions[tagId]) return;

  const currentTags = normalizeTags(user.tags);
  const nextTags = checkbox.checked
    ? [...new Set([...currentTags, tagId])]
    : currentTags.filter((item) => item !== tagId);

  try {
    await setDoc(doc(db, "users", userId), {
      tags: nextTags,
      updatedAt: serverTimestamp()
    }, { merge: true });
    setTagAdminStatus("Tags utilisateur mis a jour.");
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    console.error("Erreur attribution tag:", error);
    setTagAdminStatus(`Impossible d'attribuer le tag: ${firebaseErrorText(error)}`, true);
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
    const userTags = normalizeTags(profile.tags)
      .map((tagId) => tagDefinitions[tagId])
      .filter(Boolean);
    const article = document.createElement("article");
    const tagHtml = userTags.map((tag) => {
      return `<span class="chat-tag" style="background:${getSafeTagColor(tag.color)}">${escapeHtml(tag.name)}</span>`;
    }).join("");

    article.className = "forum-message";
    article.dataset.initial = getInitial(pseudo);
    article.innerHTML = `
      <div class="forum-message-body">
        <div class="forum-message-head">
          <span class="username" style="color: ${usernameColor};">${escapeHtml(pseudo)}</span>
          ${tagHtml}
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
    currentUserProfile = {
      ...userProfiles[currentUser.uid],
      tags: normalizeTags(userProfiles[currentUser.uid].tags),
      role: userProfiles[currentUser.uid].role === "admin" ? "admin" : "user"
    };
    setProfileUsernameColor(currentUserProfile.usernameColor);
    renderAdminVisibility();
  }

  if (latestMessagesSnapshot) {
    renderMessages(latestMessagesSnapshot);
  }
}, (error) => {
  console.error("Erreur lecture profils:", error);
  setProfileStatus(`Impossible de lire les profils: ${firebaseErrorText(error)}`, true);
});

onSnapshot(collection(db, "tags"), (snapshot) => {
  tagDefinitions = {};

  snapshot.forEach((doc) => {
    tagDefinitions[doc.id] = doc.data();
  });

  if (isCurrentUserAdmin()) {
    renderTagList();
    renderUserTagList();
  }

  if (latestMessagesSnapshot) {
    renderMessages(latestMessagesSnapshot);
  }
}, (error) => {
  console.error("Erreur lecture tags:", error);
  setTagAdminStatus(`Impossible de lire les tags: ${firebaseErrorText(error)}`, true);
});

onSnapshot(messagesQuery, (snapshot) => {
  latestMessagesSnapshot = snapshot;
  renderMessages(snapshot);
}, (error) => {
  console.error("Erreur lecture messages:", error);
  messagesList.innerHTML = `<div class="empty-courses">Impossible de charger les messages: ${escapeHtml(firebaseErrorText(error))}</div>`;
});
