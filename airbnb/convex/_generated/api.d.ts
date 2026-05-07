/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bookings from "../bookings.js";
import type * as http from "../http.js";
import type * as properties from "../properties.js";
import type * as propertyImages from "../propertyImages.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";
import type * as webhooks_clerk from "../webhooks/clerk.js";
import type * as webhooks_clerkNode from "../webhooks/clerkNode.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  bookings: typeof bookings;
  http: typeof http;
  properties: typeof properties;
  propertyImages: typeof propertyImages;
  seed: typeof seed;
  users: typeof users;
  "webhooks/clerk": typeof webhooks_clerk;
  "webhooks/clerkNode": typeof webhooks_clerkNode;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
