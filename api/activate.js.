const MAX_BODY_BYTES = 4096;
const KEY_PATTERN = /^[A-Z0-9][A-Z0-9-]{6,63}$/;
const DEVICE_PATTERN = /^[0-9a-f-]{36}$/i;

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(JSON.stringify(body));
}

function getBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    if (Buffer.byteLength(req.body, "utf8") > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
    return JSON.parse(req.body);
  }
  return {};
}

async function supabaseRequest(path, options = {}) {
  const baseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) throw new Error("SERVER_CONFIG_MISSING");

  const url = new URL(`/rest/v1/${path}`, baseUrl);
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: options.prefer || "return=representation"
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store"
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (_) { throw new Error("INVALID_DATABASE_RESPONSE"); }
  }
  if (!response.ok) throw new Error("DATABASE_REQUEST_FAILED");
  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { message: "Метод не поддерживается" });
  }

  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return sendJson(res, 415, { message: "Ожидается JSON-запрос" });
  }

  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return sendJson(res, 413, { message: "Слишком большой запрос" });
  }

  let body;
  try {
    body = getBody(req);
  } catch (_) {
    return sendJson(res, 400, { message: "Некорректный запрос" });
  }

  const licenseKey = typeof body.license_key === "string" ? body.license_key.trim().toUpperCase() : "";
  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";

  if (!licenseKey || !deviceId) {
    return sendJson(res, 400, { message: "Введите ключ доступа и идентификатор устройства" });
  }
  if (!KEY_PATTERN.test(licenseKey) || !DEVICE_PATTERN.test(deviceId)) {
    return sendJson(res, 400, { message: "Некорректный ключ или идентификатор устройства" });
  }

  try {
    // PostgREST filter values are URLSearchParams-encoded; no SQL is assembled from user input.
    const licenseQuery = new URLSearchParams({
      select: "id,license_key,expires_at,max_devices,device_ids,is_active",
      license_key: `eq.${licenseKey}`,
      limit: "1"
    });
    const licenses = await supabaseRequest(`licenses?${licenseQuery.toString()}`);
    const license = Array.isArray(licenses) ? licenses[0] : null;

    if (!license || license.is_active !== true) {
      return sendJson(res, 401, { message: "Ключ не найден или отключён" });
    }

    const expiry = Date.parse(license.expires_at);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      return sendJson(res, 401, { message: "Срок действия ключа закончился" });
    }

    const devices = Array.isArray(license.device_ids) ? license.device_ids : [];
    const alreadyBound = devices.includes(deviceId);
    const maxDevices = Number.isInteger(license.max_devices) && license.max_devices > 0
      ? license.max_devices : 1;

    if (!alreadyBound) {
      if (devices.length >= maxDevices) {
        return sendJson(res, 403, { message: "Ключ уже привязан к другому устройству" });
      }

      // Compare-and-set update avoids overwriting a device list changed by a concurrent request.
      // The current schema stores text[]; PostgREST array filters allow matching the exact old value
      // only with extra encoding. This update is additionally guarded by id and current device array.
      const updateQuery = new URLSearchParams({
        id: `eq.${license.id}`,
        device_ids: `eq.{${devices.join(",")}}`,
        select: "id,device_ids"
      });
      const updated = await supabaseRequest(`licenses?${updateQuery.toString()}`, {
        method: "PATCH",
        prefer: "return=representation",
        body: { device_ids: [...devices, deviceId] }
      });

      if (!Array.isArray(updated) || updated.length !== 1) {
        // Another request may have bound a device concurrently. Re-read once and permit only if
        // this device is now present or the configured device limit still has room.
        const reread = await supabaseRequest(`licenses?${licenseQuery.toString()}`);
        const latest = Array.isArray(reread) ? reread[0] : null;
        const latestDevices = latest && Array.isArray(latest.device_ids) ? latest.device_ids : [];
        if (!latest || !latestDevices.includes(deviceId)) {
          return sendJson(res, 403, { message: "Ключ уже привязан к другому устройству" });
        }
      }
    }

    const serverQuery = new URLSearchParams({
      select: "name,location,app_url",
      is_active: "eq.true",
      order: "created_at.asc"
    });
    const serverRows = await supabaseRequest(`servers?${serverQuery.toString()}`);
    const servers = (Array.isArray(serverRows) ? serverRows : [])
      .filter((server) =>
        server &&
        typeof server.name === "string" &&
        typeof server.location === "string" &&
        typeof server.app_url === "string" &&
        /^(https:\/\/|vless:\/\/|happ:\/\/crypt5\/)/i.test(server.app_url) &&
        server.app_url.length <= 4096
      )
      .map((server) => ({
        name: server.name,
        location: server.location,
        app_url: server.app_url
      }));

    return sendJson(res, 200, {
      expires_at: new Date(expiry).toISOString(),
      remaining_seconds: Math.max(0, Math.floor((expiry - Date.now()) / 1000)),
      servers
    });
  } catch (_) {
    // Never return database details, credentials, or stack traces to the client.
    return sendJson(res, 500, { message: "Временная ошибка сервера" });
  }
};
