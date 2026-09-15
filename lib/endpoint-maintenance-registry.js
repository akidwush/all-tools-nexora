"use strict";

const { endpointDefinition: mangaDex } = require("./comic-sources/mangadex");
const { endpointDefinition: shinigami } = require("./comic-sources/shinigami");
const { endpointDefinition: voratoon } = require("./comic-sources/voratoon");
const { endpointDefinition: ainzscans } = require("./comic-sources/ainzscans");
const { endpointDefinition: mangadotnet } = require("./comic-sources/mangadotnet");
const { multiAiEndpointDefinitions } = require("./kuroneko-multiai");
const { listUtilityEndpointDefinitions } = require("./external-endpoint-registry");

function listEndpointDefinitions() {
  return [
    mangaDex,
    shinigami,
    voratoon,
    ainzscans,
    mangadotnet,
    ...multiAiEndpointDefinitions(),
    ...listUtilityEndpointDefinitions()
  ].filter(Boolean);
}

function endpointRegistry() {
  return new Map(listEndpointDefinitions().map((item) => [item.id, item]));
}

function getEndpointDefinition(id) {
  return endpointRegistry().get(String(id || "").trim().toLowerCase()) || null;
}

module.exports = { endpointRegistry, getEndpointDefinition, listEndpointDefinitions };
