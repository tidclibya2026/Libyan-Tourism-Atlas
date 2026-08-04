import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const attractionsPath = path.join(
  root,
  "data",
  "attractions.json"
);

const attractions = JSON.parse(
  fs.readFileSync(attractionsPath, "utf8")
);

const item = (attractions.items || []).find(
  record => record.id === "LTA-FEAT-017"
);

if (!item) {
  throw new Error(
    "لم يتم العثور على LTA-FEAT-017."
  );
}

item.name_ar = "خليج البردي";
item.geojson_name = "خليج بمبة";

item.aliases = [
  "خليج البردي",
  "البردي",
  "خليج بمبة",
  "بمبة",
  "بومبا"
];

item.geojson_match ||= {};
item.geojson_match.feature_ids = [667];
item.geojson_match.mode = "exact";
item.geojson_match.status = "matched";
item.geojson_match.exact_names = [
  "خليج بمبة"
];

item.geojson_match.review_note_ar =
  "تم ربط خليج البردي بالسجل 667؛ حقل الاسم في المصدر هو خليج بمبة، بينما الوصف التفصيلي للسجل يعرّف الموقع بخليج البردي أقصى شمال شرق ليبيا.";

fs.writeFileSync(
  attractionsPath,
  JSON.stringify(attractions, null, 2),
  "utf8"
);

console.log("");
console.log("تم اعتماد خليج البردي.");
console.log("- Attraction: LTA-FEAT-017");
console.log("- Feature ID: 667");
console.log("- Source name: خليج بمبة");
console.log("- Tourism name: خليج البردي");
