var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../packages/domain-retrieval/fixtures.ts
var placeFixturesByDestination = {
  recife: [
    {
      name: "Marco Zero",
      location: "Recife Antigo, Recife, PE",
      source: "mock-guide:recife-v1",
      confidence: 0.96
    },
    {
      name: "Praia de Boa Viagem",
      location: "Boa Viagem, Recife, PE",
      source: "mock-guide:recife-v1",
      confidence: 0.95
    },
    {
      name: "Parque Dona Lindu",
      location: "Boa Viagem, Recife, PE",
      source: "mock-guide:recife-v1",
      confidence: 0.88
    },
    {
      name: "Instituto Ricardo Brennand",
      location: "V\xE1rzea, Recife, PE",
      source: "mock-guide:recife-v1",
      confidence: 0.94
    },
    {
      name: "Oficina Ceramica Francisco Brennand",
      location: "V\xE1rzea, Recife, PE",
      source: "mock-guide:recife-v1",
      confidence: 0.9
    },
    {
      name: "Cais do Sertao",
      location: "Recife Antigo, Recife, PE",
      source: "mock-guide:recife-v1",
      confidence: 0.91
    },
    {
      name: "Paco do Frevo",
      location: "Recife Antigo, Recife, PE",
      source: "mock-guide:recife-v1",
      confidence: 0.9
    }
  ]
};

// ../../packages/domain-memory/index.ts
var storedPreferencesText;
function resolveEffectivePreferencesText(explicitPreferencesText) {
  if (explicitPreferencesText !== void 0) {
    storedPreferencesText = explicitPreferencesText;
    return explicitPreferencesText;
  }
  return storedPreferencesText;
}
__name(resolveEffectivePreferencesText, "resolveEffectivePreferencesText");

// ../../packages/domain-trip/plan-trip.ts
function buildPlanTripResult(input) {
  if (input.places.length === 0) {
    return {
      days: [],
      warnings: ["No grounded places available for planning."]
    };
  }
  const dayCount = Math.max(1, Math.min(input.days, input.places.length));
  const days = createEmptyDays(dayCount);
  input.places.forEach((place, index) => {
    days[index % dayCount].items.push(place);
  });
  const warnings = input.places.length < input.days ? ["Not enough grounded places to fill all requested days."] : void 0;
  return {
    days,
    warnings
  };
}
__name(buildPlanTripResult, "buildPlanTripResult");
function createEmptyDays(dayCount) {
  return Array.from({ length: dayCount }, (_, index) => ({
    day: index + 1,
    items: []
  }));
}
__name(createEmptyDays, "createEmptyDays");

// ../../packages/domain-trip/rank-by-preferences.ts
function rankPlacesByPreferences(input) {
  if (!input.preferencesText) {
    return input.places;
  }
  const tokens = tokenizePreferences(input.preferencesText);
  if (tokens.length === 0) {
    return input.places;
  }
  const withScore = input.places.map((place, index) => {
    const haystack = `${place.name} ${place.location}`.toLowerCase();
    const matched = tokens.filter((token) => haystack.includes(token)).length;
    return {
      place,
      index,
      matched
    };
  });
  const hasAnyMatch = withScore.some((entry) => entry.matched > 0);
  if (!hasAnyMatch) {
    return input.places;
  }
  return [...withScore].sort((a, b) => {
    if (a.matched !== b.matched) {
      return b.matched - a.matched;
    }
    if (a.place.confidence !== b.place.confidence) {
      return b.place.confidence - a.place.confidence;
    }
    return a.index - b.index;
  }).map((entry) => entry.place);
}
__name(rankPlacesByPreferences, "rankPlacesByPreferences");
function tokenizePreferences(preferencesText) {
  return preferencesText.toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/i).map((token) => token.trim()).filter((token) => token.length >= 3);
}
__name(tokenizePreferences, "tokenizePreferences");

// plan-trip.ts
function handlePlanTrip(requestBody) {
  const input = parsePlanTripInput(requestBody);
  if (!input) {
    return {
      status: 400,
      body: {
        error: {
          code: "invalid_request",
          message: "Request body must match PlanTripInput."
        }
      }
    };
  }
  const effectivePreferencesText = resolveEffectivePreferencesText(
    input.preferencesText
  );
  const destinationKey = normalizeDestination(input.destination);
  const places = placeFixturesByDestination[destinationKey];
  if (!places || places.length === 0) {
    return {
      status: 404,
      body: {
        error: {
          code: "fixtures_not_found",
          message: `No grounded fixtures found for destination "${input.destination}".`
        }
      }
    };
  }
  const rankedPlaces = rankPlacesByPreferences({
    places,
    preferencesText: effectivePreferencesText
  });
  const result = buildPlanTripResult({
    days: input.days,
    places: rankedPlaces
  });
  return {
    status: 200,
    body: {
      ...result,
      effectivePreferencesText
    }
  };
}
__name(handlePlanTrip, "handlePlanTrip");
function parsePlanTripInput(value) {
  if (!isRecord(value)) {
    return null;
  }
  const { origin, destination, days, preferencesText } = value;
  if (typeof origin !== "string" || origin.trim() === "") {
    return null;
  }
  if (typeof destination !== "string" || destination.trim() === "") {
    return null;
  }
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1) {
    return null;
  }
  if (preferencesText !== void 0 && typeof preferencesText !== "string") {
    return null;
  }
  return {
    origin: origin.trim(),
    destination: destination.trim(),
    days,
    preferencesText: preferencesText?.trim() || void 0
  };
}
__name(parsePlanTripInput, "parsePlanTripInput");
function normalizeDestination(destination) {
  return destination.trim().toLowerCase();
}
__name(normalizeDestination, "normalizeDestination");
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
__name(isRecord, "isRecord");

// worker.ts
var CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type"
};
var worker_default = {
  async fetch(request, env) {
    const corsHeaders = {
      ...CORS_HEADERS,
      "access-control-allow-origin": env.API_ALLOWED_ORIGIN ?? "*"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    const url = new URL(request.url);
    const isPlanTripRoute = url.pathname === "/plan-trip" || url.pathname === "/api/plan-trip";
    if (!isPlanTripRoute || request.method !== "POST") {
      return jsonResponse(
        {
          error: {
            code: "not_found",
            message: "Route not found."
          }
        },
        404,
        corsHeaders
      );
    }
    const requestBody = await parseJsonBody(request);
    if (requestBody === null) {
      return jsonResponse(
        {
          error: {
            code: "invalid_request",
            message: "Request body must be valid JSON."
          }
        },
        400,
        corsHeaders
      );
    }
    const response = handlePlanTrip(requestBody);
    return jsonResponse(response.body, response.status, corsHeaders);
  }
};
async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
__name(parseJsonBody, "parseJsonBody");
function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8"
    }
  });
}
__name(jsonResponse, "jsonResponse");

// ../../node_modules/.pnpm/wrangler@4.76.0/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/.pnpm/wrangler@4.76.0/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-sEpI0r/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../node_modules/.pnpm/wrangler@4.76.0/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-sEpI0r/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
