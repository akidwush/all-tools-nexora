"use strict";

const crypto = require("node:crypto");
const models = require("../provider-models").runware;
const { dimensions, timedFetch, responseError } = require("../utils");

module.exports = {
  id: "runware",
  name: "Runware",
  envKey: "RUNWARE_API_KEY",
  model: models.model,
  capabilities: { textToImage: true, seed: true, aspectRatio: true },

  async generate(input, context = {}) {
    const size = dimensions(input.aspectRatio);
    const requestId = crypto.randomUUID();
    const task = {
      taskType: "imageInference",
      taskUUID: requestId,
      positivePrompt: input.prompt,
      model: process.env.RUNWARE_DEFAULT_MODEL || models.model,
      width: size.width,
      height: size.height,
      numberResults: input.variations || 1,
      outputType: ["URL"],
      outputFormat: "JPEG"
    };
    if (input.negativePrompt) task.negativePrompt = input.negativePrompt;
    if (Number.isInteger(input.seed)) task.seed = input.seed;

    const response = await timedFetch(models.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([task])
    }, context.timeoutMs, context.fetch);
    if (!response.ok) await responseError(response);

    const payload = await response.json();
    if (Array.isArray(payload.errors) && payload.errors.length) {
      const first = payload.errors[0] || {};
      const error = new Error(`Runware ${first.code || "error"}: ${first.message || first.error || "request failed"}`);
      error.status = Number(first.status || first.statusCode) || 400;
      throw error;
    }
    const rows = Array.isArray(payload.data) ? payload.data : [];
    return {
      model: task.model,
      requestId,
      seed: rows[0]?.seed,
      images: rows.filter((row) => row.imageURL).map((row) => ({
        url: row.imageURL,
        width: size.width,
        height: size.height
      }))
    };
  }
};
