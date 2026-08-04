import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const builderPath = path.join(
  root,
  "scripts",
  "build-natural-media-linkage-v2.mjs"
);

const attractionsPath = path.join(
  root,
  "data",
  "attractions.json"
);

let builder = fs.readFileSync(
  builderPath,
  "utf8"
);

const oldBlock = `  /*
   * Priority 2:
   * Governance-approved exact names.
   */
  for (
    const nameRecord of
    attractionNames(attraction)
  ) {
    for (
      const uniqueKey of
      indexes.byName.get(
        nameRecord.normalized
      ) || []
    ) {
      registerCandidate(
        uniqueKey,
        2,
        "exact_name",
        nameRecord.original
      );
    }
  }`;

const newBlock = `  /*
   * Manual feature_ids are authoritative.
   * When IDs are explicitly present, do not add
   * additional matches by name or alias.
   */
  const authoritativeFeatureIds =
    (governance.feature_ids || [])
      .map(value => Number(value))
      .filter(Number.isFinite);

  if (authoritativeFeatureIds.length > 0) {
    return [...candidates.values()]
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        return a.uniqueKey.localeCompare(
          b.uniqueKey
        );
      });
  }

  /*
   * Priority 2:
   * Governance-approved exact names.
   */
  for (
    const nameRecord of
    attractionNames(attraction)
  ) {
    for (
      const uniqueKey of
      indexes.byName.get(
        nameRecord.normalized
      ) || []
    ) {
      registerCandidate(
        uniqueKey,
        2,
        "exact_name",
        nameRecord.original
      );
    }
  }`;

if (!builder.includes(oldBlock)) {
  throw new Error(
    "لم يتم العثور على كتلة المطابقة المطلوبة داخل السكربت."
  );
}

builder = builder.replace(
  oldBlock,
  newBlock
);

fs.writeFileSync(
  builderPath,
  builder,
  "utf8"
);

/*
 * اعتماد جادور عين الزرقاء مع السجل 719:
 * الاسم الجغرافي هو:
 * عين الزرقاء أو عين أم اقديح
 */
const attractions = JSON.parse(
  fs.readFileSync(
    attractionsPath,
    "utf8"
  )
);

const item = (attractions.items || []).find(
  record => record.id === "LTA-FEAT-008"
);

if (!item) {
  throw new Error(
    "لم يتم العثور على LTA-FEAT-008."
  );
}

item.geojson_match ||= {};

item.geojson_match.feature_ids = [719];
item.geojson_match.mode = "exact";
item.geojson_match.status = "matched";
item.geojson_match.exact_names = [
  "عين الزرقاء أو عين أم اقديح"
];

item.geojson_match.review_note_ar =
  "تم اعتماد السجل 719 لارتباطه المباشر باسم عين الزرقاء، مع الإبقاء على اسم الموقع السياحي جادور عين الزرقاء.";

fs.writeFileSync(
  attractionsPath,
  JSON.stringify(
    attractions,
    null,
    2
  ),
  "utf8"
);

console.log("");
console.log("Authoritative feature IDs patch applied.");
console.log("- feature_ids now override name and alias matches.");
console.log("- LTA-FEAT-008 linked to feature 719.");
