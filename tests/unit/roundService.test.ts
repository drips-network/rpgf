import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateSchedule } from "../../src/services/roundService.ts";
import { BadRequestError } from "../../src/errors/generic.ts";

Deno.test("validateSchedule should return true for a valid schedule", () => {
  const now = new Date();
  const schedule = {
    applicationPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 24),
    applicationPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 48),
    votingPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 72),
    votingPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 96),
    resultsPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 120),
  };
  assertEquals(validateSchedule(schedule), true);
});

Deno.test("validateSchedule should throw if application end is before start", () => {
  const now = new Date();
  const schedule = {
    applicationPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 48),
    applicationPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 24),
    votingPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 72),
    votingPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 96),
    resultsPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 120),
  };
  assertThrows(
    () => validateSchedule(schedule),
    BadRequestError,
    "Application period start must be before end.",
  );
  assertEquals(validateSchedule(schedule, false), false);
});

Deno.test("validateSchedule should throw if voting start is before application end", () => {
  const now = new Date();
  const schedule = {
    applicationPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 24),
    applicationPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 72),
    votingPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 48),
    votingPeriodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 96),
    resultsPeriodStart: new Date(now.getTime() + 1000 * 60 * 60 * 120),
  };
  assertThrows(
    () => validateSchedule(schedule),
    BadRequestError,
    "Voting period must start after application period ends.",
  );
  assertEquals(validateSchedule(schedule, false), false);
});

Deno.test("validateSchedule should throw if dates are in the past", () => {
  const now = new Date();
  const schedule = {
    applicationPeriodStart: new Date(now.getTime() - 1000 * 60 * 60 * 120),
    applicationPeriodEnd: new Date(now.getTime() - 1000 * 60 * 60 * 96),
    votingPeriodStart: new Date(now.getTime() - 1000 * 60 * 60 * 72),
    votingPeriodEnd: new Date(now.getTime() - 1000 * 60 * 60 * 48),
    resultsPeriodStart: new Date(now.getTime() - 1000 * 60 * 60 * 24),
  };
  assertThrows(
    () => validateSchedule(schedule),
    BadRequestError,
    "All dates must be in the future.",
  );
  assertEquals(validateSchedule(schedule, false), false);
});
