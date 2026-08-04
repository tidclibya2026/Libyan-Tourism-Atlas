import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const attractionsPath = path.join(
  root,
  "data",
  "attractions.json"
);

const manifestPath = path.join(
  root,
  "data",
  "media-manifest.json"
);

const attractions = JSON.parse(
  fs.readFileSync(attractionsPath, "utf8")
);

const manifest = JSON.parse(
  fs.readFileSync(manifestPath, "utf8")
);

function findAttraction(id) {
  const item = (attractions.items || []).find(
    record => record.id === id
  );

  if (!item) {
    throw new Error(
      `Attraction not found: ${id}`
    );
  }

  item.geojson_match ||= {};
  item.geojson_match.feature_ids ||= [];
  item.geojson_match.exact_names ||= [];

  return item;
}

/*
 * 1. بحيرة أم الماء
 * السجلان 529 و530 يمثلان نفس النقطة تقريبًا.
 * نعتمد السجل 529 الأكثر دقة.
 */
{
  const item = findAttraction("LTA-FEAT-015");

  item.geojson_match.feature_ids = [529];
  item.geojson_match.mode = "exact";
  item.geojson_match.status = "matched";
  item.geojson_match.review_note_ar =
    "تم اعتماد السجل 529 واستبعاد السجل 530 بوصفه تكرارًا إحداثيًا شبه مطابق.";
}

/*
 * 2. عين الدبوسية
 * النقطتان 709 و710 متباعدتان مكانيًا.
 * يتم الإبقاء عليهما حتى التحقق الحقلي.
 */
{
  const item = findAttraction("LTA-FEAT-004");

  item.geojson_match.feature_ids = [709, 710];
  item.geojson_match.mode = "exact";
  item.geojson_match.status = "matched_multiple";
  item.geojson_match.review_note_ar =
    "تم الإبقاء على السجلين 709 و710 لوجود فرق مكاني واضح بينهما، إلى حين التحقق الحقلي.";
}

/*
 * 3. مجموعة LTA-FEAT-020
 * اعتماد بحيرات نطاق الجغبوب المتقاربة،
 * واستبعاد السجل 542 البعيد جغرافيًا.
 */
{
  const item = findAttraction("LTA-FEAT-020");

  item.geojson_match.feature_ids = [
    535,
    536,
    541,
    545
  ];

  item.geojson_match.mode = "exact";
  item.geojson_match.status = "matched_multiple";
  item.geojson_match.review_note_ar =
    "تم اعتماد السجلات 535 و536 و541 و545 ضمن المجموعة المكانية المتقاربة، واستبعاد السجل 542 لبعده الجغرافي الواضح.";
}

/*
 * 4. تصحيح صورة بحيرة طرونة
 * lak-throna1 غير موجود، والملف الفعلي هو lak-throna2.
 */
{
  const item = findAttraction("LTA-FEAT-016");

  for (const image of item.images || []) {
    if (image.base === "lak-throna1") {
      image.base = "lak-throna2";
      image.source_status =
        "filename_corrected_after_local_inventory";
    }
  }
}

for (
  const assignment of
  manifest.confirmed_assignments || []
) {
  if (
    assignment.site_id === "LTA-FEAT-016" &&
    assignment.base === "lak-throna1"
  ) {
    assignment.base = "lak-throna2";
    assignment.caption_ar =
      assignment.caption_ar ||
      "مشهد إضافي لبحيرة طرونة";
  }
}

manifest.version = "2.5.1";
manifest.updated_at = "2026-08-05";

manifest.notes ||= [];

const note =
  "تم تصحيح اسم صورة بحيرة طرونة من lak-throna1 إلى lak-throna2 بعد مطابقة الجرد المحلي.";

if (!manifest.notes.includes(note)) {
  manifest.notes.push(note);
}

fs.writeFileSync(
  attractionsPath,
  JSON.stringify(attractions, null, 2),
  "utf8"
);

fs.writeFileSync(
  manifestPath,
  JSON.stringify(manifest, null, 2),
  "utf8"
);

console.log("");
console.log("Manual linkage decisions applied.");
console.log("Updated:");
console.log("- data/attractions.json");
console.log("- data/media-manifest.json");
