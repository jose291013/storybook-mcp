export const NARRATIVE_BENCHMARK_VARIANT_IDS = Object.freeze([
  "sol",
  "terra",
  "luna",
]);

const USAGE = "Usage: npm run benchmark:narrative-models -- "
  + "<synthetic-fixtures.json> (--fixture <id> | --all) "
  + "--variant <sol|terra|luna|all>";

function optionValue(options, index, name) {
  const value = String(options[index + 1] || "").trim();
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}\n${USAGE}`);
  }
  return value;
}

function setOnce(current, value, name) {
  if (current) throw new Error(`${name} may be provided only once`);
  if (!value) throw new Error(`Missing value for ${name}\n${USAGE}`);
  return value;
}

export function parseNarrativeBenchmarkCli(argv = []) {
  const [fixturePath, ...options] = Array.isArray(argv) ? argv : [];
  if (!fixturePath || String(fixturePath).startsWith("--")) {
    throw new Error(USAGE);
  }

  let allFixtures = false;
  let fixtureId = "";
  let variant = "";
  for (let index = 0; index < options.length; index += 1) {
    const option = String(options[index] || "");
    if (option === "--all") {
      if (allFixtures) throw new Error("--all may be provided only once");
      allFixtures = true;
      continue;
    }
    if (option === "--fixture") {
      fixtureId = setOnce(
        fixtureId,
        optionValue(options, index, "--fixture"),
        "--fixture",
      );
      index += 1;
      continue;
    }
    if (option.startsWith("--fixture=")) {
      fixtureId = setOnce(
        fixtureId,
        option.slice("--fixture=".length).trim(),
        "--fixture",
      );
      continue;
    }
    if (option === "--variant") {
      variant = setOnce(
        variant,
        optionValue(options, index, "--variant").toLowerCase(),
        "--variant",
      );
      index += 1;
      continue;
    }
    if (option.startsWith("--variant=")) {
      variant = setOnce(
        variant,
        option.slice("--variant=".length).trim().toLowerCase(),
        "--variant",
      );
      continue;
    }
    throw new Error(`Unknown benchmark option: ${option || "(empty)"}\n${USAGE}`);
  }

  if (allFixtures && fixtureId) {
    throw new Error("Choose either --fixture <id> or --all, not both");
  }
  if (!allFixtures && !fixtureId) {
    throw new Error(
      "Choose one paid synthetic case with --fixture <id>, "
      + "or acknowledge the full corpus cost with --all",
    );
  }
  if (!variant) {
    throw new Error(
      "Choose exactly which model is billable with "
      + "--variant <sol|terra|luna|all>",
    );
  }
  if (variant !== "all" && !NARRATIVE_BENCHMARK_VARIANT_IDS.includes(variant)) {
    throw new Error(
      `Unknown benchmark variant: ${variant}. `
      + "Expected sol, terra, luna or all",
    );
  }

  return {
    fixturePath: String(fixturePath),
    allFixtures,
    fixtureId,
    variantIds: variant === "all"
      ? [...NARRATIVE_BENCHMARK_VARIANT_IDS]
      : [variant],
  };
}
