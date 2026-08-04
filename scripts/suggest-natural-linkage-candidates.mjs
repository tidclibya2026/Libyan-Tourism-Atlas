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

function levenshtein(a, b) {
  const matrix = Array.from(
    { length: b.length + 1 },
    () => Array(a.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,
        matrix[j][i - 1] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

function similarity(a, b) {
  const left = normalizeArabic(a);
  const right = normalizeArabic(b);

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.9;
  }

  const distance = levenshtein(left, right);
  const maxLength = Math.max(left.length, right.length);

  return 1 - distance / maxLength;
}

const features = geojson.features || [];
const attractionItems = attractions.items || [];

const unresolved = attractionItems.filter(attraction => {
  const match = attraction.geojson_match || {};

  return (
    match.status === "pending_manual" ||
    match.status === "candidate_match" ||
    !match.feature_ids?.length
  );
});

const rows = [];

for (const attraction of unresolved) {
  const names = [
    attraction.geojson_name,
    attraction.name_ar,
    ...(attraction.aliases || []),
    ...(attraction.geojson_match?.exact_names || [])
  ].filter(Boolean);

  const candidates = features
    .map((feature, index) => {
      const featureName =
        feature.properties?.name || "";

      const score = Math.max(
        ...names.map(name =>
          similarity(name, featureName)
        )
      );

      return {
        attraction_id: attraction.id,
        attraction_name: attraction.name_ar || "",
        feature_id: feature.properties?.id ?? "",
        feature_name: featureName,
        longitude: feature.geometry?.coordinates?.[0] ?? "",
        latitude: feature.geometry?.coordinates?.[1] ?? "",
        score: Number(score.toFixed(4)),
        feature_index: index
      };
    })
    .filter(item => item.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  rows.push(...candidates);
}

const columns = [
  "attraction_id",
  "attraction_name",
  "feature_id",
  "feature_name",
  "longitude",
  "latitude",
  "score",
  "feature_index"
];

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

const lines = [
  columns.join(","),
  ...rows.map(row =>
    columns
      .map(column => csvEscape(row[column]))
      .join(",")
  )
];

const output = path.join(
  root,
  "docs",
  "media-linkage-v2",
  "suggested-candidates.csv"
);

fs.writeFileSync(
  output,
  lines.join("\n"),
  "utf8"
);

console.log("");
console.log("Candidate suggestions created.");
console.log(output);
console.log(`Rows: ${rows.length}`);
