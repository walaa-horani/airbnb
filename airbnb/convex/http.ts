// airbnb/convex/http.ts
import { httpRouter } from "convex/server";
import { clerkWebhook } from "./webhooks/clerk";
import { stripeWebhook } from "./webhooks/stripe";

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: clerkWebhook,
});

http.route({
  path: "/stripe-webhook",
  method: "POST",
  handler: stripeWebhook,
});

export default http;
