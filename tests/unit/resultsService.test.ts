import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
	ResultCalculationMethod,
	calculateResultsForApplications,
	normalizeImportedResults,
} from "$app/services/resultsService.ts";

Deno.test("median calculation preserves decimal precision", () => {
	const ballots = [
		{ "app-1": 1 },
		{ "app-1": 2 },
	];

	const results = calculateResultsForApplications(
		["app-1"],
		ballots,
		ResultCalculationMethod.MEDIAN,
	);

	assertEquals(results["app-1"], 1.5);
});

Deno.test("average calculation preserves decimal precision", () => {
	const ballots = [
		{ "app-1": 4 },
		{ "app-1": 1 },
	];

	const results = calculateResultsForApplications(
		["app-1"],
		ballots,
		ResultCalculationMethod.AVG,
	);

	assertEquals(results["app-1"], 2.5);
});

Deno.test("sum calculation accepts fractional votes", () => {
	const ballots = [
		{ "app-1": 1.25 },
		{ "app-1": 2.75 },
	];

	const results = calculateResultsForApplications(
		["app-1"],
		ballots,
		ResultCalculationMethod.SUM,
	);

	assertEquals(results["app-1"], 4);
});

Deno.test("normalizeImportedResults fills missing application IDs with zeros", () => {
	const normalized = normalizeImportedResults(
		["app-1", "app-2", "app-3"],
		{ "app-2": 42 },
	);

	assertEquals(normalized, {
		"app-1": 0,
		"app-2": 42,
		"app-3": 0,
	});
});
