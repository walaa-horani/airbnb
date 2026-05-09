// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run daily at midnight UTC to mark past confirmed bookings as completed
crons.cron(
  "complete old bookings",
  "0 0 * * *",
  internal.bookings.completeOldBookings,
  {},
);

export default crons;
