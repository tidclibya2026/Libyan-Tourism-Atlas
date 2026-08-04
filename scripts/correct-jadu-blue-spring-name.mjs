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
  record => record.id === "LTA-FEAT-008"
);

if (!item) {
  throw new Error(
    "لم يتم العثور على السجل LTA-FEAT-008."
  );
}

/*
 * الاسم السياحي الرسمي المعتمد.
 */
item.name_ar = "عين الزرقاء جادو";
item.geojson_name = "عين الزرقاء أو عين أم اقديح";

item.aliases = [
  "عين الزرقاء جادو",
  "عين الزرقاء",
  "عين الزرقاء أو عين أم اقديح",
  "جادو عين الزرقاء",
  "جادور عين الزرقاء"
];

/*
 * الإبقاء على الربط الجغرافي المعتمد.
 */
item.geojson_match ||= {};
item.geojson_match.feature_ids = [719];
item.geojson_match.mode = "exact";
item.geojson_match.status = "matched";
item.geojson_match.exact_names = [
  "عين الزرقاء أو عين أم اقديح"
];

item.geojson_match.review_note_ar =
  "تم اعتماد الاسم السياحي الصحيح: عين الزرقاء جادو، مع الربط بالسجل الجغرافي 719 الذي يحمل اسم عين الزرقاء أو عين أم اقديح.";

/*
 * لا نعتمد أي صورة غير مؤكدة.
 */
item.images = [];

item.media_status = "awaiting_confirmed_image";
item.media_note_ar =
  "لا توجد حاليًا صورة محلية مؤكدة ومعتمدة للموقع.";

fs.writeFileSync(
  attractionsPath,
  JSON.stringify(attractions, null, 2),
  "utf8"
);

console.log("");
console.log("تم تصحيح الاسم بنجاح:");
console.log("- الاسم: عين الزرقاء جادو");
console.log("- السجل الجغرافي: 719");
console.log("- الصور: لا توجد صورة مؤكدة");
