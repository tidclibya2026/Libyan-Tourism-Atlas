import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const geojson = JSON.parse(
  fs.readFileSync(
    path.join(root, "data", "atlasnatrual.geojson"),
    "utf8"
  )
);

const attractions = JSON.parse(
  fs.readFileSync(
    path.join(root, "data", "attractions.json"),
    "utf8"
  )
);

const unresolvedIds = new Set([
  "LTA-FEAT-003",
  "LTA-FEAT-005",
  "LTA-FEAT-010",
  "LTA-FEAT-011",
  "LTA-FEAT-013",
  "LTA-FEAT-014",
  "LTA-FEAT-017",
  "LTA-FEAT-018"
]);

function normalizeArabic(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokens(value) {
  return new Set(
    normalizeArabic(value)
      .split(" ")
      .filter(token => token.length >= 2)
  );
}

function tokenScore(left, right) {
  const a = tokens(left);
  const b = tokens(right);

  if (!a.size || !b.size) {
    return 0;
  }

  const intersection = [...a]
    .filter(token => b.has(token))
    .length;

  const union = new Set([...a, ...b]).size;

  return union ? intersection / union : 0;
}

function distanceHint(attraction, feature) {
  const locality = normalizeArabic(
    [
      attraction.region_ar,
      attraction.locality_ar,
      attraction.group,
      attraction.category
    ].filter(Boolean).join(" ")
  );

  const featureText = normalizeArabic(
    [
      feature.properties?.name,
      feature.properties?.description,
      feature.properties?.folders,
      feature.properties?.primary_category,
      feature.properties?.all_categories
    ].filter(Boolean).join(" ")
  );

  return tokenScore(locality, featureText);
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

const outputRows = [];

for (const attraction of attractions.items || []) {
  if (!unresolvedIds.has(attraction.id)) {
    continue;
  }

  const searchNames = [
    attraction.name_ar,
    attraction.geojson_name,
    ...(attraction.aliases || []),
    ...(attraction.geojson_match?.exact_names || [])
  ].filter(Boolean);

  const candidates = (geojson.features || [])
    .map((feature, index) => {
      const featureName =
        feature.properties?.name || "";

      const nameScore = Math.max(
        ...searchNames.map(name =>
          tokenScore(name, featureName)
        )
      );

      const contextScore =
        distanceHint(attraction, feature);

      const combinedScore =
        nameScore * 0.8 +
        contextScore * 0.2;

      return {
        attraction_id: attraction.id,
        attraction_name: attraction.name_ar || "",
        locality_ar: attraction.locality_ar || "",
        region_ar: attraction.region_ar || "",
        feature_id: feature.properties?.id ?? "",
        feature_name: featureName,
        primary_category:
          feature.properties?.primary_category || "",
        folders:
          feature.properties?.folders || "",
        longitude:
          feature.geometry?.coordinates?.[0] ?? "",
        latitude:
          feature.geometry?.coordinates?.[1] ?? "",
        name_score: nameScore.toFixed(4),
        context_score: contextScore.toFixed(4),
        combined_score: combinedScore.toFixed(4),
        feature_index: index
      };
    })
    .filter(row =>
      Number(row.name_score) > 0 ||
      Number(row.context_score) > 0
    )
    .sort((a, b) =>
      Number(b.combined_score) -
      Number(a.combined_score)
    )
    .slice(0, 15);

  outputRows.push(...candidates);
}

const columns = [
  "attraction_id",
  "attraction_name",
  "locality_ar",
  "region_ar",
  "feature_id",
  "feature_name",
  "primary_category",
  "folders",
  "longitude",
  "latitude",
  "name_score",
  "context_score",
  "combined_score",
  "feature_index"
];

const csv = [
  columns.join(","),
  ...outputRows.map(row =>
    columns
      .map(column => csvEscape(row[column]))
      .join(",")
  )
].join("\n");

const outputPath = path.join(
  root,
  "docs",
  "media-linkage-v2",
  "unresolved-detailed-candidates.csv"
);

fs.writeFileSync(
  outputPath,
  csv,
  "utf8"
);

console.log("");
console.log("Detailed unresolved-site report created.");
console.log(outputPath);
console.log(`Candidate rows: ${outputRows.length}`);
