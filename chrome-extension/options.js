const tokenInput = document.getElementById("token");
const status = document.getElementById("status");

chrome.storage.local.get(["saversApiToken"]).then((stored) => {
  status.textContent = stored.saversApiToken ? "Token saved. The toolbar button is ready." : "Add a token to connect Savers.";
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
  status.textContent = "Token saved. Click the Savers toolbar button on any webpage.";
});

document.getElementById("clear-token").addEventListener("click", async () => {
  await chrome.storage.local.remove("saversApiToken");
  tokenInput.value = "";
  status.textContent = "Token removed.";
});
