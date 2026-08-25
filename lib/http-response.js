"use strict";

function sendJson(response, status, payload, options = {}) {
  response.setHeader("Cache-Control", options.cacheControl || "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

module.exports = { sendJson };
