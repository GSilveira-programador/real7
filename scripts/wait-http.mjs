const endpoint = process.env.HEALTH_URL || "http://localhost:3000/api/health";
let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(endpoint);
    if (r.ok && (await r.json()).database === "ok") {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
if (!ready) {
  console.error("Application did not become ready.");
  process.exitCode = 1;
}
