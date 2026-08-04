import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const paths = {
  geojson: path.join(ROOT, "data", "atlasnatrual.geojson"),
  attractions: path.join(ROOT, "data", "attractions.json"),
  manifest: path.join(ROOT, "data", "media-manifest.json"),
  imageRoot: path.join(ROOT, "assets", "img", "attractions"),

  outputGeojson: path.join(
    ROOT,
    "data",
    "atlasnatrual-with-media.geojson"
  ),

  reportDir: path.join(
    ROOT,
    "docs",
    "media-linkage-v2"
  )
};

const IMAGE_EXTENSIONS = [
  ".webp",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif"
];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );
}

function normalizeArabic(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function writeCsv(filePath, rows, columns) {
  const lines = [
    columns.join(","),
    ...rows.map(row =>
      columns
        .map(column => escapeCsv(row[column]))
        .join(",")
    )
  ];

  fs.writeFileSync(
    filePath,
    lines.join("\n"),
    "utf8"
  );
}

function uniqueBy(items, keyFunction) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = keyFunction(item);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function findImageFile(baseName) {
  if (!baseName || !fs.existsSync(paths.imageRoot)) {
    return null;
  }

  const normalizedRequestedBase =
    normalizeArabic(baseName);

  const files = fs.readdirSync(
    paths.imageRoot,
    { withFileTypes: true }
  );

  for (const file of files) {
    if (!file.isFile()) {
      continue;
    }

    const parsed = path.parse(file.name);

    if (
      !IMAGE_EXTENSIONS.includes(
        parsed.ext.toLowerCase()
      )
    ) {
      continue;
    }

    if (
      normalizeArabic(parsed.name) ===
      normalizedRequestedBase
    ) {
      return {
        base: baseName,
        fileName: file.name,
        src:
          `assets/img/attractions/${file.name}`
      };
    }
  }

  return null;
}

function featureSourceId(feature) {
  const rawId = feature?.properties?.id;
  const numericId = Number(rawId);

  return Number.isFinite(numericId)
    ? numericId
    : null;
}

function featureName(feature) {
  return String(
    feature?.properties?.name ?? ""
  ).trim();
}

function featureUniqueKey(feature, index) {
  const sourceId = featureSourceId(feature);

  if (sourceId !== null) {
    return `source-id:${sourceId}`;
  }

  const coordinates =
    feature?.geometry?.coordinates || [];

  return [
    "fallback",
    normalizeArabic(featureName(feature)),
    JSON.stringify(coordinates),
    index
  ].join(":");
}

function buildGeojsonIndexes(features) {
  const bySourceId = new Map();
  const byName = new Map();
  const featureMeta = new Map();

  features.forEach((feature, index) => {
    const uniqueKey =
      featureUniqueKey(feature, index);

    const sourceId =
      featureSourceId(feature);

    const normalizedName =
      normalizeArabic(featureName(feature));

    featureMeta.set(uniqueKey, {
      feature,
      index,
      uniqueKey,
      sourceId,
      normalizedName
    });

    if (sourceId !== null) {
      if (!bySourceId.has(sourceId)) {
        bySourceId.set(sourceId, []);
      }

      bySourceId
        .get(sourceId)
        .push(uniqueKey);
    }

    if (normalizedName) {
      if (!byName.has(normalizedName)) {
        byName.set(normalizedName, []);
      }

      byName
        .get(normalizedName)
        .push(uniqueKey);
    }
  });

  return {
    bySourceId,
    byName,
    featureMeta
  };
}

function attractionNames(attraction) {
  return uniqueBy(
    [
      attraction.geojson_name,
      attraction.name_ar,
      ...(attraction.geojson_match?.exact_names || [])
    ]
      .filter(Boolean)
      .map(value => ({
        original: String(value),
        normalized: normalizeArabic(value)
      })),
    item => item.normalized
  );
}

function attractionAliases(attraction) {
  return uniqueBy(
    (attraction.aliases || [])
      .filter(Boolean)
      .map(value => ({
        original: String(value),
        normalized: normalizeArabic(value)
      })),
    item => item.normalized
  );
}

function collectCandidates(
  attraction,
  indexes
) {
  const candidates = new Map();

  function registerCandidate(
    uniqueKey,
    priority,
    matchType,
    matchValue
  ) {
    if (!indexes.featureMeta.has(uniqueKey)) {
      return;
    }

    const existing = candidates.get(uniqueKey);

    if (
      !existing ||
      priority < existing.priority
    ) {
      candidates.set(uniqueKey, {
        uniqueKey,
        priority,
        matchType,
        matchValue
      });
    }
  }

  const governance =
    attraction.geojson_match || {};

  /*
   * Priority 1:
   * Stable source feature IDs.
   */
  for (
    const rawFeatureId of
    governance.feature_ids || []
  ) {
    const featureId = Number(rawFeatureId);

    if (!Number.isFinite(featureId)) {
      continue;
    }

    for (
      const uniqueKey of
      indexes.bySourceId.get(featureId) || []
    ) {
      registerCandidate(
        uniqueKey,
        1,
        "feature_id",
        featureId
      );
    }
  }

  /*
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
  }

  /*
   * Priority 3:
   * Approved aliases.
   */
  const mode =
    governance.mode || "exact";

  if (
    mode === "alias" ||
    mode === "candidate" ||
    mode === "exact" ||
    !governance.mode
  ) {
    for (
      const aliasRecord of
      attractionAliases(attraction)
    ) {
      for (
        const uniqueKey of
        indexes.byName.get(
          aliasRecord.normalized
        ) || []
      ) {
        registerCandidate(
          uniqueKey,
          3,
          "alias",
          aliasRecord.original
        );
      }
    }
  }

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

function resolveAttractionImages(
  attraction,
  assignmentsBySiteId
) {
  const requestedImages = [];

  for (const image of attraction.images || []) {
    requestedImages.push({
      base: image.base,
      caption_ar:
        image.caption_ar || "",
      source_status:
        image.source_status ||
        "attractions_json"
    });
  }

  for (
    const assignment of
    assignmentsBySiteId.get(
      attraction.id
    ) || []
  ) {
    requestedImages.push({
      base: assignment.base,
      caption_ar:
        assignment.caption_ar || "",
      source_status:
        "media_manifest"
    });
  }

  const deduplicatedRequested =
    uniqueBy(
      requestedImages,
      image => normalizeArabic(image.base)
    );

  const resolved = [];
  const missing = [];

  for (
    const requested of
    deduplicatedRequested
  ) {
    const found =
      findImageFile(requested.base);

    if (!found) {
      missing.push(requested);
      continue;
    }

    resolved.push({
      src: found.src,
      base: requested.base,
      caption_ar:
        requested.caption_ar,
      source_status:
        requested.source_status
    });
  }

  return {
    resolved,
    missing
  };
}

function applyAttractionToFeature(
  feature,
  attraction,
  media,
  match
) {
  const properties =
    feature.properties || {};

  properties.attraction_id =
    attraction.id;

  properties.name_en =
    attraction.name_en || "";

  properties.category_enriched =
    attraction.category ||
    properties.primary_category ||
    "";

  properties.group_enriched =
    attraction.group || "";

  properties.region_ar =
    attraction.region_ar || "";

  properties.locality_ar =
    attraction.locality_ar || "";

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
    media.resolved;

  properties.images_json =
    JSON.stringify(media.resolved);

  properties.image_count =
    media.resolved.length;

  properties.missing_images =
    media.missing;

  properties.media_status =
    media.resolved.length
      ? "linked"
      : "matched_without_local_media";

  properties.media_match_type =
    match.matchType;

  properties.media_match_value =
    match.matchValue;

  properties.media_linkage_version =
    "2.0.0";

  feature.properties = properties;
}

const geojson =
  readJson(paths.geojson);

const attractionsDocument =
  readJson(paths.attractions);

const manifest =
  readJson(paths.manifest);

const features =
  geojson.features || [];

const attractions =
  attractionsDocument.items || [];

const assignmentsBySiteId =
  new Map();

for (
  const assignment of
  manifest.confirmed_assignments || []
) {
  if (
    !assignmentsBySiteId.has(
      assignment.site_id
    )
  ) {
    assignmentsBySiteId.set(
      assignment.site_id,
      []
    );
  }

  assignmentsBySiteId
    .get(assignment.site_id)
    .push(assignment);
}

const indexes =
  buildGeojsonIndexes(features);

/*
 * Tracks deterministic ownership.
 * One GeoJSON feature must not be silently
 * assigned to two attraction records.
 */
const featureOwner =
  new Map();

const linkageRows = [];
const duplicateRows = [];
const unresolvedRows = [];
const missingMediaRows = [];
const attractionSummaryRows = [];

let linkedFeatureCount = 0;
let linkedImageCount = 0;
let attractionsWithMatches = 0;
let attractionsWithMedia = 0;

for (const attraction of attractions) {
  const candidates =
    collectCandidates(
      attraction,
      indexes
    );

  const media =
    resolveAttractionImages(
      attraction,
      assignmentsBySiteId
    );

  const acceptedCandidates = [];
  const rejectedConflicts = [];

  for (const candidate of candidates) {
    const existingOwner =
      featureOwner.get(
        candidate.uniqueKey
      );

    if (
      existingOwner &&
      existingOwner !== attraction.id
    ) {
      rejectedConflicts.push({
        ...candidate,
        existingOwner
      });

      continue;
    }

    featureOwner.set(
      candidate.uniqueKey,
      attraction.id
    );

    acceptedCandidates.push(
      candidate
    );
  }

  if (acceptedCandidates.length) {
    attractionsWithMatches += 1;
  }

  if (
    acceptedCandidates.length &&
    media.resolved.length
  ) {
    attractionsWithMedia += 1;
  }

  for (const candidate of acceptedCandidates) {
    const meta =
      indexes.featureMeta.get(
        candidate.uniqueKey
      );

    applyAttractionToFeature(
      meta.feature,
      attraction,
      media,
      candidate
    );

    linkedFeatureCount += 1;
    linkedImageCount +=
      media.resolved.length;

    linkageRows.push({
      attraction_id:
        attraction.id,
      attraction_name:
        attraction.name_ar || "",
      feature_id:
        meta.sourceId ?? "",
      feature_name:
        featureName(meta.feature),
      feature_index:
        meta.index,
      match_type:
        candidate.matchType,
      match_value:
        candidate.matchValue,
      image_count:
        media.resolved.length,
      missing_image_count:
        media.missing.length,
      status:
        media.resolved.length
          ? "linked_with_media"
          : "linked_without_media"
    });
  }

  /*
   * Multiple accepted GeoJSON records may be
   * valid duplicates, for example identical
   * names at separate records or coordinates.
   */
  if (acceptedCandidates.length > 1) {
    for (const candidate of acceptedCandidates) {
      const meta =
        indexes.featureMeta.get(
          candidate.uniqueKey
        );

      duplicateRows.push({
        attraction_id:
          attraction.id,
        attraction_name:
          attraction.name_ar || "",
        feature_id:
          meta.sourceId ?? "",
        feature_name:
          featureName(meta.feature),
        feature_index:
          meta.index,
        longitude:
          meta.feature.geometry
            ?.coordinates?.[0] ?? "",
        latitude:
          meta.feature.geometry
            ?.coordinates?.[1] ?? "",
        match_type:
          candidate.matchType,
        duplicate_group_size:
          acceptedCandidates.length,
        review_status:
          "requires_spatial_review"
      });
    }
  }

  for (const conflict of rejectedConflicts) {
    const meta =
      indexes.featureMeta.get(
        conflict.uniqueKey
      );

    duplicateRows.push({
      attraction_id:
        attraction.id,
      attraction_name:
        attraction.name_ar || "",
      feature_id:
        meta.sourceId ?? "",
      feature_name:
        featureName(meta.feature),
      feature_index:
        meta.index,
      longitude:
        meta.feature.geometry
          ?.coordinates?.[0] ?? "",
      latitude:
        meta.feature.geometry
          ?.coordinates?.[1] ?? "",
      match_type:
        conflict.matchType,
      duplicate_group_size:
        "",
      review_status:
        `conflict_owned_by_${conflict.existingOwner}`
    });
  }

  if (!acceptedCandidates.length) {
    unresolvedRows.push({
      attraction_id:
        attraction.id,
      attraction_name:
        attraction.name_ar || "",
      geojson_name:
        attraction.geojson_name || "",
      match_mode:
        attraction.geojson_match
          ?.mode || "",
      match_status:
        attraction.geojson_match
          ?.status || "",
      feature_ids:
        (
          attraction.geojson_match
            ?.feature_ids || []
        ).join("|"),
      exact_names:
        (
          attraction.geojson_match
            ?.exact_names || []
        ).join("|"),
      aliases:
        (
          attraction.aliases || []
        ).join("|"),
      image_count:
        media.resolved.length,
      action:
        "manual_geojson_link_required"
    });
  }

  for (const missing of media.missing) {
    missingMediaRows.push({
      attraction_id:
        attraction.id,
      attraction_name:
        attraction.name_ar || "",
      image_base:
        missing.base,
      caption_ar:
        missing.caption_ar || "",
      expected_root:
        "assets/img/attractions",
      action:
        "verify_filename_or_add_image"
    });
  }

  attractionSummaryRows.push({
    attraction_id:
      attraction.id,
    attraction_name:
      attraction.name_ar || "",
    candidate_count:
      candidates.length,
    accepted_feature_count:
      acceptedCandidates.length,
    conflict_count:
      rejectedConflicts.length,
    resolved_image_count:
      media.resolved.length,
    missing_image_count:
      media.missing.length,
    linkage_status:
      acceptedCandidates.length
        ? (
            media.resolved.length
              ? "linked_with_media"
              : "linked_without_media"
          )
        : (
            media.resolved.length
              ? "media_ready_geojson_unresolved"
              : "unresolved"
          )
  });
}

fs.writeFileSync(
  paths.outputGeojson,
  JSON.stringify(
    geojson,
    null,
    2
  ),
  "utf8"
);

writeCsv(
  path.join(
    paths.reportDir,
    "expanded-linkage-report.csv"
  ),
  linkageRows,
  [
    "attraction_id",
    "attraction_name",
    "feature_id",
    "feature_name",
    "feature_index",
    "match_type",
    "match_value",
    "image_count",
    "missing_image_count",
    "status"
  ]
);

writeCsv(
  path.join(
    paths.reportDir,
    "duplicate-and-conflict-review.csv"
  ),
  duplicateRows,
  [
    "attraction_id",
    "attraction_name",
    "feature_id",
    "feature_name",
    "feature_index",
    "longitude",
    "latitude",
    "match_type",
    "duplicate_group_size",
    "review_status"
  ]
);

writeCsv(
  path.join(
    paths.reportDir,
    "unresolved-attractions.csv"
  ),
  unresolvedRows,
  [
    "attraction_id",
    "attraction_name",
    "geojson_name",
    "match_mode",
    "match_status",
    "feature_ids",
    "exact_names",
    "aliases",
    "image_count",
    "action"
  ]
);

writeCsv(
  path.join(
    paths.reportDir,
    "missing-media.csv"
  ),
  missingMediaRows,
  [
    "attraction_id",
    "attraction_name",
    "image_base",
    "caption_ar",
    "expected_root",
    "action"
  ]
);

writeCsv(
  path.join(
    paths.reportDir,
    "attraction-linkage-summary.csv"
  ),
  attractionSummaryRows,
  [
    "attraction_id",
    "attraction_name",
    "candidate_count",
    "accepted_feature_count",
    "conflict_count",
    "resolved_image_count",
    "missing_image_count",
    "linkage_status"
  ]
);

const uniqueLinkedAttractions =
  new Set(
    linkageRows.map(
      row => row.attraction_id
    )
  );

const uniqueLinkedSitesWithMedia =
  new Set(
    linkageRows
      .filter(
        row => row.image_count > 0
      )
      .map(
        row => row.attraction_id
      )
  );

const summary = {
  version: "2.0.0",
  total_geojson_features:
    features.length,
  attraction_records:
    attractions.length,
  manifest_assignments:
    (
      manifest.confirmed_assignments || []
    ).length,

  linked_geojson_features:
    linkedFeatureCount,

  linked_attractions:
    uniqueLinkedAttractions.size,

  linked_attractions_with_media:
    uniqueLinkedSitesWithMedia.size,

  total_image_references_applied:
    linkedImageCount,

  unresolved_attractions:
    unresolvedRows.length,

  duplicate_or_conflict_rows:
    duplicateRows.length,

  missing_media_files:
    missingMediaRows.length,

  output_geojson:
    path.relative(
      ROOT,
      paths.outputGeojson
    ),

  reports: {
    linkage:
      "docs/media-linkage-v2/expanded-linkage-report.csv",
    duplicates:
      "docs/media-linkage-v2/duplicate-and-conflict-review.csv",
    unresolved:
      "docs/media-linkage-v2/unresolved-attractions.csv",
    missing_media:
      "docs/media-linkage-v2/missing-media.csv",
    attraction_summary:
      "docs/media-linkage-v2/attraction-linkage-summary.csv"
  }
};

fs.writeFileSync(
  path.join(
    paths.reportDir,
    "expanded-linkage-summary.json"
  ),
  JSON.stringify(
    summary,
    null,
    2
  ),
  "utf8"
);

console.log("");
console.log(
  "Expanded natural media linkage completed."
);

console.table(summary);
