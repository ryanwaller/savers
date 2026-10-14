const tokenInput = document.getElementById("token");
const status = document.getElementById("status");
const savedToken = document.getElementById("saved-token");
const testButton = document.getElementById("test-token");
const DEFAULT_APP_URL = "https://savers-production.up.railway.app";

function showSavedToken(token) {
  savedToken.textContent = token ? `Saved in Chrome: svr_…${token.slice(-4)}` : "No token saved in Chrome.";
  tokenInput.placeholder = token ? "Paste a new token to replace the saved one" : "svr_…";
  testButton.disabled = !token;
}

async function testConnection() {
  const { saversApiToken: token } = await chrome.storage.local.get(["saversApiToken"]);
  showSavedToken(token);
  if (!token) {
    status.textContent = "Add a token to connect Savers.";
    return;
  }
  status.textContent = "Checking connection to Savers…";
  try {
    const { saversAppUrl } = await chrome.storage.sync.get(["saversAppUrl"]);
    const appUrl = saversAppUrl && saversAppUrl !== "http://localhost:3000" ? saversAppUrl.replace(/\/+$/, "") : DEFAULT_APP_URL;
    const response = await fetch(`${appUrl}/api/tokens`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    status.textContent = response.ok
      ? "Connected. Open a normal website and click the Savers toolbar icon to save it."
      : response.status === 401
        ? "Token was saved in Chrome, but Savers rejected it. Create a new token in Savers Settings."
        : `Token was saved in Chrome, but Savers returned HTTP ${response.status}. Try again.`;
  } catch {
    status.textContent = "Token was saved in Chrome, but Savers could not be reached. Check your connection and try again.";
  }
}

chrome.storage.local.get(["saversApiToken"]).then((stored) => {
  showSavedToken(stored.saversApiToken);
  status.textContent = stored.saversApiToken ? "Token saved in Chrome. Test the connection or click the toolbar icon on a website." : "Add a token to connect Savers.";
});

document.getElementById("token-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (!/^svr_[A-Za-z0-9_-]+$/.test(token)) {
    status.textContent = "Paste a Savers token beginning with svr_.";
    return;
  }
  await chrome.storage.local.set({ saversApiToken: token });
  tokenInput.value = "";
  showSavedToken(token);
  await testConnection();
});

testButton.addEventListener("click", testConnection);

document.getElementById("clear-token").addEventListener("click", async () => {
  await chrome.storage.local.remove("saversApiToken");
  tokenInput.value = "";
  showSavedToken("");
  status.textContent = "Token removed.";
});
