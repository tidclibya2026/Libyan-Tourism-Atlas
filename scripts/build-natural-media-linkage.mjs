import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const geojsonPath = path.join(ROOT, "data", "atlasnatrual.geojson");
const attractionsPath = path.join(ROOT, "data", "attractions.json");
const manifestPath = path.join(ROOT, "data", "media-manifest.json");
const imageRoot = path.join(ROOT, "assets", "img", "attractions");
const outputPath = path.join(ROOT, "data", "atlasnatrual-with-media.geojson");
const reportPath = path.join(
  ROOT,
  "docs",
  "media-linkage",
  "natural-media-linkage-report.csv"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ـ]/g, "")
    .replace(/\s+/g, " ");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function findImageFile(baseName) {
  const supported = [".webp", ".jpg", ".jpeg", ".png", ".gif"];

  for (const extension of supported) {
    const directPath = path.join(imageRoot, `${baseName}${extension}`);

    if (fs.existsSync(directPath)) {
      return {
        absolutePath: directPath,
        webPath: `assets/img/attractions/${baseName}${extension}`
      };
    }
  }

  if (!fs.existsSync(imageRoot)) {
    return null;
  }

  const normalizedBase = normalizeText(baseName);

  for (const fileName of fs.readdirSync(imageRoot)) {
    const parsed = path.parse(fileName);

    if (
      supported.includes(parsed.ext.toLowerCase()) &&
      normalizeText(parsed.name) === normalizedBase
    ) {
      return {
        absolutePath: path.join(imageRoot, fileName),
        webPath: `assets/img/attractions/${fileName}`
      };
    }
  }

  return null;
}

function buildAttractionIndexes(items) {
  const byExactName = new Map();
  const byAlias = new Map();

  for (const item of items) {
    const names = [
      item.geojson_name,
      item.name_ar,
      item.name_en
    ].filter(Boolean);

    for (const name of names) {
      byExactName.set(normalizeText(name), item);
    }

    for (const alias of item.aliases || []) {
      byAlias.set(normalizeText(alias), item);
    }
  }

  return { byExactName, byAlias };
}

const geojson = readJson(geojsonPath);
const attractionsDocument = readJson(attractionsPath);
const manifest = readJson(manifestPath);

const attractionItems = attractionsDocument.items || [];
const confirmedAssignments = manifest.confirmed_assignments || [];

const { byExactName, byAlias } =
  buildAttractionIndexes(attractionItems);

const assignmentsBySiteId = new Map();

for (const assignment of confirmedAssignments) {
  if (!assignmentsBySiteId.has(assignment.site_id)) {
    assignmentsBySiteId.set(assignment.site_id, []);
  }

  assignmentsBySiteId.get(assignment.site_id).push(assignment);
}

const reportRows = [];
let linkedFeatures = 0;
let linkedImages = 0;
let missingImages = 0;

for (const feature of geojson.features || []) {
  const properties = feature.properties || {};
  const featureName = properties.name || "";

  let attraction =
    byExactName.get(normalizeText(featureName)) ||
    byAlias.get(normalizeText(featureName)) ||
    null;

  let matchType = attraction
    ? byExactName.has(normalizeText(featureName))
      ? "exact"
      : "alias"
    : "unmatched";

  if (!attraction) {
    reportRows.push({
      feature_name: featureName,
      feature_id: properties.id ?? "",
      attraction_id: "",
      match_type: "unmatched",
      image_count: 0,
      missing_image_count: 0,
      status: "no_attraction_record"
    });

    continue;
  }

  const manifestAssignments =
    assignmentsBySiteId.get(attraction.id) || [];

  const attractionImages = attraction.images || [];

  const combinedImages = [];

  for (const image of attractionImages) {
    combinedImages.push({
      base: image.base,
      caption_ar: image.caption_ar || "",
      source_status: image.source_status || "attractions_json"
    });
  }

  for (const assignment of manifestAssignments) {
    if (
      !combinedImages.some(
        image => normalizeText(image.base) ===
          normalizeText(assignment.base)
      )
    ) {
      combinedImages.push({
        base: assignment.base,
        caption_ar: assignment.caption_ar || "",
        source_status: "media_manifest"
      });
    }
  }

  const resolvedImages = [];
  const unresolvedImages = [];

  for (const image of combinedImages) {
    const found = findImageFile(image.base);

    if (found) {
      resolvedImages.push({
        src: found.webPath,
        caption_ar: image.caption_ar,
        base: image.base,
        source_status: image.source_status
      });

      linkedImages += 1;
    } else {
      unresolvedImages.push({
        base: image.base,
        caption_ar: image.caption_ar
      });

      missingImages += 1;
    }
  }

  properties.attraction_id = attraction.id;
  properties.name_en = attraction.name_en || "";
  properties.category_enriched =
    attraction.category || properties.primary_category || "";
  properties.group_enriched = attraction.group || "";
  properties.region_ar = attraction.region_ar || "";
  properties.locality_ar = attraction.locality_ar || "";
  properties.importance_level =
    attraction.importance_level || "";
  properties.is_featured =
    Boolean(attraction.is_featured);
  properties.subtitle_ar =
    attraction.subtitle_ar || "";
  properties.description_enriched =
    attraction.description_ar ||
    properties.description ||
    "";
  properties.tourism_values =
    attraction.tourism_values || [];
  properties.metrics =
    attraction.metrics || [];
  properties.images =
    resolvedImages;
  properties.images_json =
    JSON.stringify(resolvedImages);
  properties.image_count =
    resolvedImages.length;
  properties.missing_images =
    unresolvedImages;
  properties.media_status =
    resolvedImages.length > 0
      ? "linked"
      : "no_local_media";

  if (resolvedImages.length > 0) {
    linkedFeatures += 1;
  }

  feature.properties = properties;

  reportRows.push({
    feature_name: featureName,
    feature_id: properties.id ?? "",
    attraction_id: attraction.id,
    match_type: matchType,
    image_count: resolvedImages.length,
    missing_image_count: unresolvedImages.length,
    status:
      resolvedImages.length > 0
        ? "linked"
        : "matched_without_local_image"
  });
}

fs.writeFileSync(
  outputPath,
  JSON.stringify(geojson, null, 2),
  "utf8"
);

const csvHeader = [
  "feature_name",
  "feature_id",
  "attraction_id",
  "match_type",
  "image_count",
  "missing_image_count",
  "status"
];

const csvLines = [
  csvHeader.join(","),
  ...reportRows.map(row =>
    csvHeader
      .map(field => escapeCsv(row[field]))
      .join(",")
  )
];

fs.writeFileSync(
  reportPath,
  csvLines.join("\n"),
  "utf8"
);

const summary = {
  total_geojson_features:
    geojson.features?.length || 0,
  attraction_records:
    attractionItems.length,
  manifest_assignments:
    confirmedAssignments.length,
  linked_features:
    linkedFeatures,
  linked_images:
    linkedImages,
  missing_images:
    missingImages,
  output_geojson:
    path.relative(ROOT, outputPath),
  report:
    path.relative(ROOT, reportPath)
};

fs.writeFileSync(
  path.join(
    ROOT,
    "docs",
    "media-linkage",
    "natural-media-linkage-summary.json"
  ),
  JSON.stringify(summary, null, 2),
  "utf8"
);

console.log("");
console.log("Natural media linkage completed.");
console.table(summary);
