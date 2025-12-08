import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
	ResultCalculationMethod,
	calculateResultsForApplications,
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
