(() => {
  "use strict";

  const translations = {
    ru: {
      personalAccess: "ЛИЧНЫЙ ДОСТУП", heroCopy: "Простой доступ к твоему серверу.",
      personalCabinet: "ЛИЧНЫЙ КАБИНЕТ", privateAccess: "Приватный доступ",
      activateAccess: "Активировать доступ", activateCopy: "Введи ключ, который получил у администратора.",
      accessKey: "КЛЮЧ ДОСТУПА", keyHint: "Ключ привязывается к этому устройству при первой активации.",
      checkKey: "ПРОВЕРИТЬ", accessActive: "ДОСТУП АКТИВЕН", expiresAt: "СРОК ДЕЙСТВИЯ ДО",
      remaining: "ОСТАЛОСЬ", serverAvailable: "СЕРВЕР ДОСТУПЕН", open: "ОТКРЫТЬ",
      openHint: "Открытие зависит от поддержки ссылки приложением и браузером.",
      getKey: "Получить ключ в Telegram", featureFast: "Быстрый доступ",
      featureFastCopy: "Проверка ключа за несколько секунд.", featureDevice: "Одно устройство",
      featureDeviceCopy: "Защита ключа привязкой к устройству.", featureSupport: "Поддержка 24/7",
      featureSupportCopy: "Связь с администратором через Telegram.",
      footerNote: "Личный доступ · защищённая проверка",
      enterKey: "Введите ключ доступа", invalidKey: "Ключ не найден или отключён",
      expiredKey: "Срок действия ключа закончился", deviceLimit: "Ключ уже привязан к другому устройству",
      serverError: "Сервер временно недоступен", apiError: "Не удалось подключиться к API",
      offline: "Нет подключения к интернету. Проверь соединение и повтори попытку.",
      genericError: "Не удалось проверить ключ. Попробуй ещё раз позже.",
      noServer: "Для этого ключа сейчас нет доступного сервера.",
      openError: "Установи приложение Happ или открой сайт в обычном Chrome.",
      expiredNow: "Срок действия ключа закончился", checking: "ПРОВЕРЯЕМ…",
      days: "д", hours: "ч", minutes: "м", seconds: "с",
      dateLocale: "ru-RU"
    },
    en: {
      personalAccess: "PERSONAL ACCESS", heroCopy: "Simple access to your server.",
      personalCabinet: "PERSONAL CABINET", privateAccess: "Private access",
      activateAccess: "Activate access", activateCopy: "Enter the key you received from the administrator.",
      accessKey: "ACCESS KEY", keyHint: "The key is linked to this device on first activation.",
      checkKey: "VERIFY KEY", accessActive: "ACCESS ACTIVE", expiresAt: "ACCESS EXPIRES",
      remaining: "TIME LEFT", serverAvailable: "SERVER AVAILABLE", open: "OPEN",
      openHint: "Opening depends on support for the link in your app and browser.",
      getKey: "Get a key on Telegram", featureFast: "Fast access",
      featureFastCopy: "Verify your key in seconds.", featureDevice: "One device",
      featureDeviceCopy: "Device binding helps protect your key.", featureSupport: "24/7 support",
      featureSupportCopy: "Contact the administrator on Telegram.",
      footerNote: "Personal access · secure verification",
      enterKey: "Enter your access key", invalidKey: "Key not found or disabled",
      expiredKey: "This key has expired", deviceLimit: "This key is already linked to another device",
      serverError: "The server is temporarily unavailable", apiError: "Could not connect to the API",
      offline: "You are offline. Check your connection and try again.",
      genericError: "Could not verify the key. Please try again later.",
      noServer: "No server is currently available for this key.",
      openError: "Install Happ or open this site in the regular Chrome browser.",
      expiredNow: "This key has expired", checking: "VERIFYING…",
      days: "d", hours: "h", minutes: "m", seconds: "s",
      dateLocale: "en-GB"
    }
  };

  const form = document.getElementById("activate-form");
  const keyInput = document.getElementById("license-key");
  const checkButton = document.getElementById("check-button");
  const message = document.getElementById("message");
  const result = document.getElementById("activation-result");
  const expiresAtEl = document.getElementById("expires-at");
  const countdownEl = document.getElementById("countdown");
  const serverNameEl = document.getElementById("server-name");
  const serverLocationEl = document.getElementById("server-location");
  const openButton = document.getElementById("open-button");
  const openHint = document.getElementById("open-hint");
  const buttonLabel = checkButton.querySelector(".button-label");

  let language = "ru";
  let activeServerUrl = null;
  let expiresAtMs = 0;
  let countdownTimer = null;
  let messageTimer = null;

  function t(key) {
    return (translations[language] && translations[language][key]) || translations.ru[key] || key;
  }

  function getDeviceId() {
    const storageKey = "felix_device_id";
    try {
      let deviceId = localStorage.getItem(storageKey);
      if (deviceId && /^[0-9a-f-]{36}$/i.test(deviceId)) return deviceId;
      if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
        throw new Error("Secure UUID generation unavailable");
      }
      deviceId = globalThis.crypto.randomUUID();
      localStorage.setItem(storageKey, deviceId);
      return deviceId;
    } catch (_) {
      throw new Error("DEVICE_ID_UNAVAILABLE");
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function showMessage(text, type = "error") {
    window.clearTimeout(messageTimer);
    message.textContent = text;
    message.classList.toggle("success", type === "success");
    message.hidden = false;
  }

  function clearMessage() {
    window.clearTimeout(messageTimer);
    message.hidden = true;
    message.textContent = "";
    message.classList.remove("success");
  }

  function setLoading(loading) {
    checkButton.disabled = loading;
    keyInput.disabled = loading;
    buttonLabel.textContent = loading ? t("checking") : t("checkKey");
    checkButton.setAttribute("aria-busy", String(loading));
  }

  function formatDate(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(t("dateLocale"), {
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function formatRemaining(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${days}${t("days")} ${String(hours).padStart(2, "0")}${t("hours")} ${String(minutes).padStart(2, "0")}${t("minutes")} ${String(secs).padStart(2, "0")}${t("seconds")}`;
  }

  function updateCountdown() {
    if (!expiresAtMs) return;
    const remaining = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
    countdownEl.textContent = formatRemaining(remaining);
    if (remaining <= 0) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
      openButton.disabled = true;
      showMessage(t("expiredNow"));
    }
  }

  function startCountdown(expiresAt) {
    if (countdownTimer) window.clearInterval(countdownTimer);
    expiresAtMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      expiresAtMs = 0;
      countdownEl.textContent = "—";
      return;
    }
    updateCountdown();
    countdownTimer = window.setInterval(updateCountdown, 1000);
  }

  function hideResult() {
    result.hidden = true;
    activeServerUrl = null;
    expiresAtMs = 0;
    openButton.disabled = true;
    if (countdownTimer) window.clearInterval(countdownTimer);
    countdownTimer = null;
  }

  function messageForStatus(status, serverMessage) {
    if (status === 401) {
      if (serverMessage === "Срок действия ключа закончился") return t("expiredKey");
      return t("invalidKey");
    }
    if (status === 403) return t("deviceLimit");
    if (status >= 500) return t("serverError");
    return t("genericError");
  }

  function isAllowedAppUrl(value) {
    if (typeof value !== "string" || value.length > 4096) return false;
    // Do not rewrite custom schemes. Only permit known import schemes.
    return /^(https:\/\/|vless:\/\/|happ:\/\/crypt5\/)/i.test(value);
  }

  async function activate(event) {
    event.preventDefault();
    clearMessage();
    hideResult();

    const licenseKey = keyInput.value.trim().toUpperCase();
    if (!licenseKey) {
      showMessage(t("enterKey"));
      keyInput.focus();
      return;
    }
    if (licenseKey.length < 8 || licenseKey.length > 64) {
      showMessage(t("invalidKey"));
      keyInput.focus();
      return;
    }
    if (!navigator.onLine) {
      showMessage(t("offline"));
      return;
    }

    let deviceId;
    try {
      deviceId = getDeviceId();
    } catch (_) {
      showMessage(t("apiError"));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ license_key: licenseKey, device_id: deviceId }),
        cache: "no-store",
        credentials: "same-origin"
      });

      let payload;
      try {
        payload = await response.json();
      } catch (_) {
        payload = {};
      }

      if (!response.ok) {
        showMessage(messageForStatus(response.status, payload.message));
        return;
      }

      if (!payload || !payload.expires_at || !Array.isArray(payload.servers)) {
        showMessage(t("genericError"));
        return;
      }

      const server = payload.servers.find((item) =>
        item && typeof item.name === "string" &&
        typeof item.location === "string" &&
        isAllowedAppUrl(item.app_url)
      );

      if (!server) {
        showMessage(t("noServer"));
        return;
      }

      serverNameEl.textContent = server.name;
      serverLocationEl.textContent = server.location;
      expiresAtEl.textContent = formatDate(payload.expires_at);
      activeServerUrl = server.app_url;
      result.hidden = false;
      openButton.disabled = false;
      startCountdown(payload.expires_at);
      showMessage(language === "ru" ? "Ключ успешно проверен." : "Key verified successfully.", "success");
    } catch (_) {
      showMessage(navigator.onLine ? t("apiError") : t("offline"));
    } finally {
      setLoading(false);
    }
  }

  function openServer() {
    if (!activeServerUrl || !expiresAtMs || Date.now() >= expiresAtMs) {
      showMessage(t("expiredNow"));
      openButton.disabled = true;
      return;
    }
    if (!isAllowedAppUrl(activeServerUrl)) {
      showMessage(t("openError"));
      return;
    }
    // Custom app schemes must be passed through unchanged; browsers may block them.
    try {
      window.location.href = activeServerUrl;
      openHint.textContent = t("openError");
    } catch (_) {
      showMessage(t("openError"));
    }
  }

  function setLanguage(nextLanguage) {
    if (!translations[nextLanguage]) return;
    language = nextLanguage;
    document.documentElement.lang = language;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.getAttribute("data-i18n");
      if (translations[language][key]) element.textContent = translations[language][key];
    });
    document.querySelectorAll(".lang-button").forEach((button) => {
      const selected = button.dataset.lang === language;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    buttonLabel.textContent = checkButton.disabled ? t("checking") : t("checkKey");
    if (result.hidden === false && expiresAtMs) {
      expiresAtEl.textContent = formatDate(expiresAtMs);
      updateCountdown();
    }
  }

  form.addEventListener("submit", activate);
  openButton.addEventListener("click", openServer);
  document.querySelectorAll(".lang-button").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.lang));
  });
  keyInput.addEventListener("input", () => {
    keyInput.value = keyInput.value.toUpperCase().replace(/\s+/g, "");
    if (!message.hidden) clearMessage();
  });
  window.addEventListener("offline", () => showMessage(t("offline")));
  window.addEventListener("online", () => {
    if (!message.hidden && message.textContent === t("offline")) clearMessage();
  });

  // Kept available for safe text rendering if more dynamic fields are added later.
  void escapeHtml;
})();
