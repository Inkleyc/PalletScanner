const chromeJsonUrl = "http://127.0.0.1:9222/json";
const appBaseUrl = process.argv[2] ?? "http://localhost:8081";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestJson = async (url, init) => {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
};

const getPageTarget = async () => {
  const targets = await requestJson(chromeJsonUrl);
  const page = targets.find((target) => target.type === "page");
  if (!page?.webSocketDebuggerUrl) {
    throw new Error("No Chrome page target with a DevTools websocket was found.");
  }
  return page;
};

const createCdpClient = (webSocketDebuggerUrl) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    let nextId = 1;
    const pending = new Map();

    socket.addEventListener("open", () => {
      const client = {
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((sendResolve, sendReject) => {
            pending.set(id, { resolve: sendResolve, reject: sendReject });
          });
        },
        close() {
          socket.close();
        },
      };
      resolve(client);
    });

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (!payload.id || !pending.has(payload.id)) {
        return;
      }
      const callbacks = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) {
        callbacks.reject(new Error(payload.error.message));
        return;
      }
      callbacks.resolve(payload.result);
    });

    socket.addEventListener("error", reject);
  });

const evaluate = async (client, expression) => {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Evaluation failed.");
  }
  return result.result.value;
};

const waitForBody = async (client) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evaluate(
      client,
      `Boolean(document.body && document.body.innerText.trim().length > 0)`,
    );
    if (ready) {
      return;
    }
    await delay(500);
  }
  throw new Error("Timed out waiting for body text.");
};

const navigate = async (client, path) => {
  await client.send("Page.navigate", { url: `${appBaseUrl}${path}` });
  await delay(1200);
  await waitForBody(client);
  await delay(500);
};

const getPageState = async (client) =>
  evaluate(
    client,
    `(() => ({
      url: location.href,
      title: document.title,
      bodyText: document.body.innerText,
      hasFatalError: /Maximum update depth|Uncaught Error|Render Error|Cannot read properties|ReferenceError|TypeError/i.test(document.body.innerText),
      buttonTexts: Array.from(document.querySelectorAll('button,[role="button"]')).map((el) => el.innerText || el.textContent || '').filter(Boolean).slice(0, 20)
    }))()`,
  );

const assertIncludes = (state, expectedText, label) => {
  if (!state.bodyText.includes(expectedText)) {
    throw new Error(`${label} did not include expected text: ${expectedText}`);
  }
};

const clickByText = async (client, text) =>
  evaluate(
    client,
    `(() => {
      const candidates = Array.from(document.querySelectorAll('button,[role="button"],div,span'));
      const target = candidates.find((el) => (el.innerText || el.textContent || '').trim() === ${JSON.stringify(text)});
      if (!target) return false;
      target.click();
      return true;
    })()`,
  );

const routeChecks = [
  { path: "/onboarding", text: "Scan any item from a pallet or lot", label: "Onboarding" },
  { path: "/(tabs)", text: "Pallet Scanner", label: "Home" },
  { path: "/(tabs)/explore", text: "Inventory", label: "Inventory" },
  { path: "/(tabs)/pallets", text: "Pallets", label: "Pallets" },
  { path: "/(tabs)/analytics", text: "Pallet Stats", label: "Analytics" },
  { path: "/(tabs)/settings", text: "Settings", label: "Settings" },
  { path: "/capture", text: "Capture Item", label: "Capture" },
  { path: "/scan-barcode", text: "Open Scanner", label: "Barcode" },
];

const main = async () => {
  const target = await getPageTarget();
  const client = await createCdpClient(target.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  const results = [];
  try {
    for (const check of routeChecks) {
      await navigate(client, check.path);
      const state = await getPageState(client);
      if (state.hasFatalError) {
        throw new Error(`${check.label} rendered a fatal error screen.`);
      }
      assertIncludes(state, check.text, check.label);
      results.push(`${check.label}: OK`);
    }

    await navigate(client, "/(tabs)");
    let clicked = await clickByText(client, "Create Your First Pallet");
    if (!clicked) {
      clicked = await clickByText(client, "Create New Pallet");
    }
    await delay(500);
    const homeAfterClick = await getPageState(client);
    assertIncludes(homeAfterClick, "Create New Pallet", "Create pallet modal");
    results.push("Home create pallet modal: OK");

    await navigate(client, "/(tabs)/explore");
    await clickByText(client, "Show");
    await delay(500);
    const inventoryAfterClick = await getPageState(client);
    assertIncludes(inventoryAfterClick, "All Inventory", "Inventory filters");
    results.push("Inventory filters toggle: OK");
  } finally {
    client.close();
  }

  console.log(results.join("\n"));
};

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
