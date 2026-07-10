/* Atlas Libya Tourism — V2.5 Coordinate Linking */
import { CONFIG } from "./config.js?v=2.5.0";

import {
  fetchJson,
  prepareFeatures,
  normalizeText,
  haversineKm
} from "./data-service.js?v=2.5.0";

import {
  createMap,
  markerForItem
} from "./map-service.js?v=2.5.0";

import {
  uniqueSorted,
  fillSelect,
  escapeHtml
} from "./ui-service.js?v=2.5.0";

const state = {
  prepared: [],
  visible: [],
  categoryInfo: new Map(),
  activeCategories: new Set(),
  attractionIndex: new Map(),
  attractionByPointId: new Map(),
  attractionBindings: new Map(),
  featured: []
};

const dom = {
  total: document.getElementById("kpiTotal"),
  visible: document.getElementById("kpiVisible"),
  layers: document.getElementById("kpiLayers"),
  mapVisibleBadge: document.getElementById("mapVisibleBadge"),

  search: document.getElementById("searchInput"),
  suggestions: document.getElementById("suggestions"),
  quickSearches: document.getElementById("quickSearches"),

  category: document.getElementById("categoryFilter"),
  status: document.getElementById("statusFilter"),
  folder: document.getElementById("folderFilter"),
  boundsOnly: document.getElementById("boundsOnly"),

  lat: document.getElementById("latInput"),
  lng: document.getElementById("lngInput"),
  radius: document.getElementById("radiusInput"),

  layerGroups: document.getElementById("layerGroups"),
  unmappedBlock: document.getElementById("unmappedLayersBlock"),
  unmappedLayers: document.getElementById("unmappedLayers"),

  legendList: document.getElementById("legendList"),
  resultsList: document.getElementById("resultsList"),
  resultCount: document.getElementById("resultCount"),
  sortResults: document.getElementById("sortResults"),

  featuredList: document.getElementById("featuredList"),
  featuredCount: document.getElementById("featuredCount"),

  loading: document.getElementById("loadingOverlay"),
  loadingMessage: document.getElementById("loadingMessage"),

  drawer: document.getElementById("detailDrawer"),
  drawerContent: document.getElementById("drawerContent"),

  mouseCoordinates: document.getElementById("mouseCoordinates"),

  legend: document.getElementById("mapLegend"),
  toggleLegend: document.getElementById("toggleLegend"),

  lightbox: document.getElementById("imageLightbox"),
  lightboxImage: document.getElementById("lightboxImage"),
  lightboxCaption: document.getElementById("lightboxCaption")
};


const REQUIRED_DOM = {
  kpiTotal: dom.total,
  kpiVisible: dom.visible,
  kpiLayers: dom.layers,
  mapVisibleBadge: dom.mapVisibleBadge,
  searchInput: dom.search,
  suggestions: dom.suggestions,
  quickSearches: dom.quickSearches,
  categoryFilter: dom.category,
  statusFilter: dom.status,
  folderFilter: dom.folder,
  boundsOnly: dom.boundsOnly,
  latInput: dom.lat,
  lngInput: dom.lng,
  radiusInput: dom.radius,
  layerGroups: dom.layerGroups,
  unmappedLayersBlock: dom.unmappedBlock,
  unmappedLayers: dom.unmappedLayers,
  legendList: dom.legendList,
  resultsList: dom.resultsList,
  resultCount: dom.resultCount,
  sortResults: dom.sortResults,
  featuredList: dom.featuredList,
  featuredCount: dom.featuredCount,
  loadingOverlay: dom.loading,
  loadingMessage: dom.loadingMessage,
  detailDrawer: dom.drawer,
  drawerContent: dom.drawerContent,
  mouseCoordinates: dom.mouseCoordinates,
  mapLegend: dom.legend,
  toggleLegend: dom.toggleLegend,
  imageLightbox: dom.lightbox,
  lightboxImage: dom.lightboxImage,
  lightboxCaption: dom.lightboxCaption
};

function validateDom() {
  const missing = Object.entries(REQUIRED_DOM)
    .filter(([, element]) => !element)
    .map(([id]) => id);

  if (missing.length) {
    throw new Error(
      `عدم تطابق ملفات الإصدار 2.4.0. عناصر HTML مفقودة: ${missing.join(", ")}`
    );
  }
}

function activatePane(paneId) {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("is-active", tab.dataset.pane === paneId);
  });

  document.querySelectorAll(".pane").forEach(pane => {
    pane.classList.toggle("is-active", pane.id === paneId);
  });
}

function flashSidebar() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  sidebar.classList.remove("sidebar-return-flash");
  void sidebar.offsetWidth;
  sidebar.classList.add("sidebar-return-flash");

  window.setTimeout(() => {
    sidebar.classList.remove("sidebar-return-flash");
  }, 520);
}

function hasActiveSearch() {
  return Boolean(
    normalizeText(dom.search.value) ||
    dom.category.value ||
    dom.status.value ||
    dom.folder.value ||
    dom.boundsOnly.checked ||
    dom.lat.value ||
    dom.lng.value ||
    dom.radius.value
  );
}

let mapApi = null;
let currentDrawerItem = null;

function normalizeArabicKey(value) {
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


const MEDIA_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".JPG",
  ".JPEG",
  ".PNG",
  ".WEBP"
];

function mediaCandidates(image) {
  if (!image) return [];

  if (image.src) {
    return [image.src];
  }

  if (image.base) {
    const root = "assets/img/attractions/";
    return MEDIA_EXTENSIONS.map(extension => {
      return `${root}${image.base}${extension}`;
    });
  }

  return [];
}

function mediaImageMarkup(image, altText, className = "") {
  const candidates = mediaCandidates(image);
  const first = candidates[0] || "";

  if (!first) {
    return "";
  }

  const encodedCandidates = encodeURIComponent(
    JSON.stringify(candidates)
  );

  return `
    <img
      src="${escapeHtml(first)}"
      alt="${escapeHtml(altText || "")}"
      class="${escapeHtml(className)}"
      data-media-candidates="${escapeHtml(encodedCandidates)}"
      data-media-caption="${escapeHtml(image.caption_ar || "")}"
    >
  `;
}

function hydrateMediaImages(container) {
  if (!container) return;

  container
    .querySelectorAll("img[data-media-candidates]")
    .forEach(img => {
      let candidates = [];

      try {
        candidates = JSON.parse(
          decodeURIComponent(img.dataset.mediaCandidates || "")
        );
      } catch {
        candidates = [];
      }

      let index = Math.max(
        0,
        candidates.indexOf(img.getAttribute("src"))
      );

      const tryNext = () => {
        index += 1;

        if (index < candidates.length) {
          img.src = candidates[index];
          return;
        }

        const wrapper =
          img.closest(".gallery-button") ||
          img.closest(".featured-card") ||
          img.closest(".info-hero");

        if (wrapper) {
          wrapper.classList.add("media-missing");
        }

        img.remove();
      };

      img.addEventListener("error", tryNext);
    });
}

function resolvedImageForButton(button) {
  const img = button?.querySelector("img");
  if (!img) return null;

  return {
    src: img.currentSrc || img.src,
    caption_ar: img.dataset.mediaCaption || img.alt || ""
  };
}

function buildAttractionBindings(attractions) {
  state.attractionIndex.clear();
  state.attractionByPointId.clear();
  state.attractionBindings.clear();

  const pointBySourceId = new Map();
  const pointsByNormalizedName = new Map();

  state.prepared.forEach(point => {
    const sourceId = Number(point.props?.id);

    if (Number.isFinite(sourceId)) {
      pointBySourceId.set(sourceId, point);
    }

    const key = normalizeArabicKey(point.name);

    if (!pointsByNormalizedName.has(key)) {
      pointsByNormalizedName.set(key, []);
    }

    pointsByNormalizedName.get(key).push(point);
  });

  attractions.forEach(attraction => {
    const matched = new Map();
    const match = attraction.geojson_match || {};

    // 1) Stable feature IDs take priority.
    (match.feature_ids || []).forEach(featureId => {
      const point = pointBySourceId.get(Number(featureId));
      if (point) matched.set(point.id, point);
    });

    // 2) Exact names defined by governance data.
    (match.exact_names || []).forEach(name => {
      const candidates =
        pointsByNormalizedName.get(normalizeArabicKey(name)) || [];

      candidates.forEach(point => matched.set(point.id, point));
    });

    // 3) Alias/candidate modes may use approved names only.
    if (match.mode === "alias" || match.mode === "candidate") {
      (attraction.aliases || []).forEach(alias => {
        const candidates =
          pointsByNormalizedName.get(normalizeArabicKey(alias)) || [];

        candidates.forEach(point => matched.set(point.id, point));
      });
    }

    const matchedPoints = [...matched.values()];

    state.attractionBindings.set(
      attraction.id,
      matchedPoints.map(point => point.id)
    );

    state.attractionIndex.set(attraction.id, attraction);

    matchedPoints.forEach(point => {
      // Keep first binding deterministic if data governance later reveals overlaps.
      if (!state.attractionByPointId.has(point.id)) {
        state.attractionByPointId.set(point.id, attraction);
      }

      const aliasText = [
        attraction.name_ar,
        attraction.name_en,
        ...(attraction.aliases || [])
      ].join(" ");

      point.searchText = `${point.searchText} ${normalizeText(aliasText)}`;
    });
  });
}

function attractionForPoint(point) {
  return state.attractionByPointId.get(point.id) || null;
}

function matchedPointsForAttraction(attraction) {
  const ids = state.attractionBindings.get(attraction.id) || [];

  return ids
    .map(id => state.prepared.find(point => point.id === id))
    .filter(Boolean);
}

function matchStatusLabel(attraction) {
  const status = attraction?.geojson_match?.status;

  const labels = {
    matched: "مرتبط مكانيًا",
    matched_multiple: "مرتبط بعدة سجلات",
    pending_manual: "بانتظار الربط اليدوي",
    candidate_match: "مرشح ربط يحتاج تحقق"
  };

  return labels[status] || "حالة الربط غير محددة";
}

function initTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      activatePane(tab.dataset.pane);
    });
  });
}

function configureCategories() {
  const counts = {};

  state.prepared.forEach(item => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });

  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count], index) => {
      const info = {
        name,
        count,
        color: CONFIG.categoryColors[index % CONFIG.categoryColors.length]
      };

      state.categoryInfo.set(name, info);
      state.activeCategories.add(name);
    });
}

function renderQuickSearches() {
  dom.quickSearches.innerHTML = "";

  CONFIG.quickSearches.forEach(term => {
    const button = document.createElement("button");
    button.className = "quick-chip";
    button.type = "button";
    button.textContent = term;

    button.addEventListener("click", () => {
      dom.search.value = term;
      hideSuggestions();
      closeDrawer(false);
      applyFilters();
      activatePane("resultsPane");
      flashSidebar();
    });

    dom.quickSearches.appendChild(button);
  });
}

function groupCount(group) {
  return group.categories.reduce((sum, category) => {
    return sum + (state.categoryInfo.get(category)?.count || 0);
  }, 0);
}

function renderLayerGroups() {
  dom.layerGroups.innerHTML = "";
  dom.unmappedLayers.innerHTML = "";

  const mapped = new Set();

  CONFIG.layerGroups.forEach(group => {
    const existingCategories = group.categories.filter(category => {
      return state.categoryInfo.has(category);
    });

    if (!existingCategories.length) return;

    existingCategories.forEach(category => mapped.add(category));

    const wrapper = document.createElement("section");
    wrapper.className = "layer-group";

    const total = groupCount(group);

    wrapper.innerHTML = `
      <div class="layer-group__head">
        <input type="checkbox" checked data-group="${escapeHtml(group.id)}">

        <div class="layer-group__title">
          <strong>${escapeHtml(group.icon)} ${escapeHtml(group.title)}</strong>
          <small>${existingCategories.length} طبقات فرعية</small>
        </div>

        <span class="layer-group__count">${total}</span>

        <button type="button" class="layer-group__toggle" aria-label="طي المجموعة">⌄</button>
      </div>

      <div class="layer-group__children"></div>
    `;

    const children = wrapper.querySelector(".layer-group__children");

    existingCategories.forEach(category => {
      const info = state.categoryInfo.get(category);

      const row = document.createElement("label");
      row.className = "layer-child";

      row.innerHTML = `
        <input type="checkbox" checked data-category="${escapeHtml(category)}">

        <span class="layer-child__name">
          <i class="swatch" style="background:${info.color}"></i>
          ${escapeHtml(category)}
        </span>

        <span class="layer-child__count">${info.count}</span>
      `;

      const checkbox = row.querySelector("input");

      checkbox.addEventListener("change", event => {
        const categoryName = event.target.dataset.category;

        if (event.target.checked) {
          state.activeCategories.add(categoryName);
        } else {
          state.activeCategories.delete(categoryName);
        }

        syncGroupCheckbox(wrapper);
        applyFilters();
      });

      children.appendChild(row);
    });

    const groupCheckbox = wrapper.querySelector("[data-group]");

    groupCheckbox.addEventListener("change", () => {
      wrapper.querySelectorAll("[data-category]").forEach(input => {
        input.checked = groupCheckbox.checked;

        if (groupCheckbox.checked) {
          state.activeCategories.add(input.dataset.category);
        } else {
          state.activeCategories.delete(input.dataset.category);
        }
      });

      applyFilters();
    });

    const toggle = wrapper.querySelector(".layer-group__toggle");

    toggle.addEventListener("click", () => {
      const hidden = children.hidden;
      children.hidden = !hidden;
      toggle.textContent = hidden ? "⌄" : "›";
    });

    dom.layerGroups.appendChild(wrapper);
  });

  const unmapped = [...state.categoryInfo.keys()].filter(category => {
    return !mapped.has(category);
  });

  if (unmapped.length) {
    dom.unmappedBlock.hidden = false;

    unmapped.forEach(category => {
      const info = state.categoryInfo.get(category);

      const row = document.createElement("label");
      row.className = "layer-child";

      row.innerHTML = `
        <input type="checkbox" checked data-category="${escapeHtml(category)}">

        <span class="layer-child__name">
          <i class="swatch" style="background:${info.color}"></i>
          ${escapeHtml(category)}
        </span>

        <span class="layer-child__count">${info.count}</span>
      `;

      row.querySelector("input").addEventListener("change", event => {
        const categoryName = event.target.dataset.category;

        if (event.target.checked) {
          state.activeCategories.add(categoryName);
        } else {
          state.activeCategories.delete(categoryName);
        }

        applyFilters();
      });

      dom.unmappedLayers.appendChild(row);
    });
  } else {
    dom.unmappedBlock.hidden = true;
  }
}

function syncGroupCheckbox(wrapper) {
  const children = [...wrapper.querySelectorAll("[data-category]")];
  const groupCheckbox = wrapper.querySelector("[data-group]");

  const checkedCount = children.filter(input => input.checked).length;

  groupCheckbox.checked = checkedCount === children.length;
  groupCheckbox.indeterminate =
    checkedCount > 0 && checkedCount < children.length;
}

function renderLegend() {
  dom.legendList.innerHTML = "";

  [...state.categoryInfo.values()].forEach(info => {
    const row = document.createElement("div");
    row.className = "legend-row";

    row.innerHTML = `
      <span class="legend-name">
        <i class="swatch" style="background:${info.color}"></i>
        <span>${escapeHtml(info.name)}</span>
      </span>

      <strong>${info.count}</strong>
    `;

    dom.legendList.appendChild(row);
  });
}

function buildMarkers() {
  state.prepared.forEach(item => {
    const color =
      state.categoryInfo.get(item.category)?.color ||
      "#0B4F8A";

    item.marker = markerForItem(
      item,
      color,
      openDrawer
    );
  });
}

function getFilters() {
  const lat = parseFloat(dom.lat.value);
  const lng = parseFloat(dom.lng.value);
  const radius = parseFloat(dom.radius.value);

  return {
    q: normalizeText(dom.search.value),
    category: dom.category.value,
    status: dom.status.value,
    folder: dom.folder.value,
    boundsOnly: dom.boundsOnly.checked,
    spatial:
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Number.isFinite(radius) &&
      radius > 0
        ? { lat, lng, radius }
        : null
  };
}

function replaceClusterLayers(markers) {
  if (!mapApi?.cluster) return;

  if (typeof mapApi.cluster.clearLayers === "function") {
    mapApi.cluster.clearLayers();
  }

  if (typeof mapApi.cluster.addLayers === "function") {
    mapApi.cluster.addLayers(markers);
    return;
  }

  if (typeof mapApi.cluster.addLayer === "function") {
    markers.forEach(marker => {
      mapApi.cluster.addLayer(marker);
    });
  }
}

function applyFilters() {
  if (!mapApi) return;

  const filters = getFilters();
  const bounds = filters.boundsOnly ? mapApi.map.getBounds() : null;

  state.visible = state.prepared.filter(item => {
    if (!state.activeCategories.has(item.category)) return false;

    if (filters.q && !item.searchText.includes(filters.q)) {
      return false;
    }

    if (filters.category && item.category !== filters.category) {
      return false;
    }

    if (
      filters.status &&
      String(item.props.status || "") !== filters.status
    ) {
      return false;
    }

    if (
      filters.folder &&
      String(item.props.folders || "") !== filters.folder
    ) {
      return false;
    }

    if (
      bounds &&
      !bounds.contains([item.lat, item.lng])
    ) {
      return false;
    }

    if (filters.spatial) {
      const distance = haversineKm(
        filters.spatial.lat,
        filters.spatial.lng,
        item.lat,
        item.lng
      );

      if (distance > filters.spatial.radius) return false;
    }

    return true;
  });

  replaceClusterLayers(
    state.visible.map(item => item.marker)
  );

  updateCounters();
  renderResults();
}

function updateCounters() {
  dom.visible.textContent = state.visible.length;
  dom.resultCount.textContent = state.visible.length;
  dom.mapVisibleBadge.textContent = `${state.visible.length} نقطة`;
}

function getSortedVisible() {
  const items = [...state.visible];

  if (dom.sortResults.value === "category") {
    return items.sort((a, b) => {
      return a.category.localeCompare(b.category, "ar");
    });
  }

  return items.sort((a, b) => {
    return a.name.localeCompare(b.name, "ar");
  });
}

function renderResults() {
  const items = getSortedVisible();

  if (!items.length) {
    dom.resultsList.innerHTML = `
      <div class="result-card">
        <small>لا توجد نتائج مطابقة</small>
      </div>
    `;
    return;
  }

  dom.resultsList.innerHTML = items
    .slice(0, CONFIG.maxResultCards)
    .map(item => {
      const featured = attractionForPoint(item)?.is_featured;

      return `
        <article class="result-card" data-id="${item.id}">
          ${featured ? `<span class="result-card__featured">★ مميز</span>` : ""}

          <strong>${escapeHtml(item.name)}</strong>

          <small>${escapeHtml(item.category)}</small>
        </article>
      `;
    })
    .join("");

  dom.resultsList
    .querySelectorAll(".result-card[data-id]")
    .forEach(card => {
      card.addEventListener("click", () => {
        focusItem(Number(card.dataset.id));
      });
    });
}

function renderFeatured() {
  dom.featuredCount.textContent = state.featured.length;

  if (!state.featured.length) {
    dom.featuredList.innerHTML = `
      <div class="result-card">
        <small>لا توجد مواقع مميزة حالياً</small>
      </div>
    `;
    return;
  }

  dom.featuredList.innerHTML = state.featured
    .map(attraction => {
      const image = attraction.images?.[0] || null;
      const matchedPoints = matchedPointsForAttraction(attraction);
      const matchLabel = matchStatusLabel(attraction);

      return `
        <article
          class="featured-card"
          data-attraction-id="${escapeHtml(attraction.id)}"
        >
          ${
            image
              ? mediaImageMarkup(
                  image,
                  attraction.name_ar,
                  "featured-card__image"
                )
              : `<div class="featured-card__placeholder">لا توجد صورة موثقة بعد</div>`
          }

          <div class="featured-card__body">
            <strong>${escapeHtml(attraction.name_ar)}</strong>
            <small>${escapeHtml(attraction.subtitle_ar || attraction.category || "")}</small>

            <div class="featured-card__meta">
              <span>${escapeHtml(matchLabel)}</span>
              <span>${matchedPoints.length} سجل مكاني</span>
              <span>${(attraction.images || []).length} صورة</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  hydrateMediaImages(dom.featuredList);

  dom.featuredList
    .querySelectorAll(".featured-card[data-attraction-id]")
    .forEach(card => {
      card.addEventListener("click", () => {
        const attraction = state.attractionIndex.get(
          card.dataset.attractionId
        );

        if (!attraction) return;

        const matchedPoints = matchedPointsForAttraction(attraction);

        if (matchedPoints.length) {
          focusItem(matchedPoints[0].id);
        } else {
          openAttractionDrawer(attraction, null);
        }
      });
    });
}

function updateSuggestions() {
  const query = normalizeText(dom.search.value);

  if (!query || query.length < 2) {
    hideSuggestions();
    return;
  }

  const pointMatches = state.prepared
    .filter(item => item.searchText.includes(query))
    .slice(0, 6)
    .map(item => ({
      type: "point",
      id: item.id,
      title: item.name,
      subtitle: item.category
    }));

  const attractionMatches = state.featured
    .filter(attraction => {
      const text = normalizeText([
        attraction.name_ar,
        attraction.name_en,
        attraction.category,
        attraction.group,
        ...(attraction.aliases || [])
      ].join(" "));

      return text.includes(query);
    })
    .slice(0, 6)
    .map(attraction => ({
      type: "attraction",
      id: attraction.id,
      title: attraction.name_ar,
      subtitle: `${attraction.category} — ${matchStatusLabel(attraction)}`
    }));

  const combined = [...attractionMatches, ...pointMatches].slice(0, 10);

  if (!combined.length) {
    hideSuggestions();
    return;
  }

  dom.suggestions.innerHTML = combined
    .map(match => `
      <div
        class="suggestion"
        data-type="${escapeHtml(match.type)}"
        data-id="${escapeHtml(match.id)}"
      >
        <strong>${escapeHtml(match.title)}</strong>
        <small>${escapeHtml(match.subtitle)}</small>
      </div>
    `)
    .join("");

  dom.suggestions.hidden = false;

  dom.suggestions.querySelectorAll(".suggestion").forEach(row => {
    row.addEventListener("click", () => {
      hideSuggestions();

      if (row.dataset.type === "point") {
        const point = state.prepared.find(
          value => value.id === Number(row.dataset.id)
        );

        if (!point) return;

        dom.search.value = point.name;
        applyFilters();
        focusItem(point.id);
        return;
      }

      const attraction = state.attractionIndex.get(row.dataset.id);

      if (!attraction) return;

      dom.search.value = attraction.name_ar;

      const matchedPoints = matchedPointsForAttraction(attraction);

      if (matchedPoints.length) {
        applyFilters();
        focusItem(matchedPoints[0].id);
      } else {
        openAttractionDrawer(attraction, null);
      }
    });
  });
}

function hideSuggestions() {
  dom.suggestions.hidden = true;
  dom.suggestions.innerHTML = "";
}

function focusItem(id) {
  const item = state.prepared.find(
    value => value.id === id
  );

  if (!item || !mapApi) return;

  mapApi.map.setView(
    [item.lat, item.lng],
    12,
    { animate: true }
  );

  window.setTimeout(() => {
    item.marker.openPopup();
  }, 260);

  openDrawer(item);
}

function openDrawer(item) {
  const attraction = attractionForPoint(item);
  openAttractionDrawer(attraction, item);
}

function openAttractionDrawer(attraction, item = null) {
  currentDrawerItem = item;

  const title =
    attraction?.name_ar ||
    item?.name ||
    "موقع طبيعي";

  const subtitle =
    attraction?.subtitle_ar ||
    item?.category ||
    "موقع ضمن أطلس ليبيا السياحي";

  const description =
    attraction?.description_ar ||
    item?.props?.description ||
    "لا تتوفر نبذة تفصيلية معتمدة حتى الآن.";

  const images = attraction?.images || [];
  const heroImage = images[0] || null;
  const tags = attraction?.tourism_values || [];
  const metrics = attraction?.metrics || [];
  const verification = attraction?.verification || null;
  const matchedPoints = attraction
    ? matchedPointsForAttraction(attraction)
    : item
      ? [item]
      : [];

  const primaryPoint = item || matchedPoints[0] || null;

  dom.drawerContent.innerHTML = `
    <div class="info-hero">
      ${
        heroImage
          ? mediaImageMarkup(heroImage, title, "info-hero__image")
          : `<div class="hero-placeholder">بطاقة جاهزة لإضافة صورة حقيقية موثقة</div>`
      }

      <div class="info-hero__content">
        <span class="popup-tag">
          ${escapeHtml(attraction?.category || item?.category || "غير مصنف")}
        </span>

        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle)}</p>
      </div>
    </div>

    <div class="info-body">

      <div class="info-actions">
        ${
          primaryPoint
            ? `<button type="button" data-info-action="zoom">تكبير الموقع</button>`
            : `<button type="button" disabled>بانتظار الربط</button>`
        }

        ${
          primaryPoint
            ? `<button type="button" data-info-action="copy">نسخ الإحداثيات</button>`
            : `<button type="button" disabled>لا توجد إحداثيات معتمدة</button>`
        }

        <button type="button" data-info-action="close">إغلاق البطاقة</button>
      </div>

      ${
        attraction
          ? `
            <section class="info-section">
              <h3>حالة الربط المكاني</h3>

              <div class="match-status-card match-status-card--${escapeHtml(attraction.geojson_match?.status || "unknown")}">
                <strong>${escapeHtml(matchStatusLabel(attraction))}</strong>
                <span>طريقة الربط: ${escapeHtml(attraction.geojson_match?.mode || "غير محدد")}</span>
                <span>السجلات المرتبطة: ${matchedPoints.length}</span>
                <small>${escapeHtml(attraction.geojson_match?.note_ar || "")}</small>
              </div>
            </section>
          `
          : ""
      }

      ${
        tags.length
          ? `
            <section class="info-section">
              <h3>القيمة السياحية</h3>
              <div class="info-tags">
                ${tags
                  .map(tag => `<span class="info-tag">${escapeHtml(tag)}</span>`)
                  .join("")}
              </div>
            </section>
          `
          : ""
      }

      <section class="info-section">
        <h3>نبذة تعريفية</h3>
        <p class="info-description">${escapeHtml(description)}</p>
      </section>

      ${
        metrics.length
          ? `
            <section class="info-section">
              <h3>المؤشرات والمعلومات الأساسية</h3>
              <div class="metrics-grid">
                ${metrics
                  .map(metric => `
                    <div class="metric-card">
                      <strong>${escapeHtml(metric.value)}</strong>
                      <span>${escapeHtml(metric.label)}</span>
                    </div>
                  `)
                  .join("")}
              </div>
            </section>
          `
          : `
            <section class="info-section">
              <h3>المؤشرات والمعلومات الأساسية</h3>
              <div class="empty-ready-state">
                البطاقة جاهزة لإضافة المساحة، العمق، السعة، التدفق، الارتفاع أو أي مؤشرات فنية معتمدة حسب نوع الموقع.
              </div>
            </section>
          `
      }

      ${
        images.length
          ? `
            <section class="info-section">
              <h3>معرض الصور</h3>
              <div class="gallery-grid">
                ${images
                  .map((image, index) => `
                    <button
                      type="button"
                      class="gallery-button"
                      data-image-index="${index}"
                    >
                      ${mediaImageMarkup(
                        image,
                        image.caption_ar || title,
                        "gallery-image"
                      )}
                    </button>
                  `)
                  .join("")}
              </div>
            </section>
          `
          : `
            <section class="info-section">
              <h3>معرض الصور</h3>
              <div class="empty-ready-state">
                لا توجد صور موثقة مرتبطة بهذا السجل حتى الآن. مسار الصور جاهز للإضافة.
              </div>
            </section>
          `
      }

      ${
        attraction?.subsites?.length
          ? `
            <section class="info-section">
              <h3>الإحداثيات والسجلات المرتبطة</h3>

              <div class="coordinate-list">
                ${attraction.subsites
                  .map(subsite => `
                    <div class="coordinate-item">
                      <strong>${escapeHtml(subsite.name_ar || "سجل مرتبط")}</strong>
                      <span>${escapeHtml(subsite.status || "")}</span>
                      <code>${escapeHtml(subsite.latitude)}, ${escapeHtml(subsite.longitude)}</code>
                    </div>
                  `)
                  .join("")}
              </div>
            </section>
          `
          : ""
      }

      <section class="info-section">
        <h3>البيانات الوصفية والسياحية</h3>

        <div class="metadata-grid">
          ${metaItem("معرف الموقع المميز", attraction?.id || "غير متاح")}
          ${metaItem("المجموعة", attraction?.group || "غير محدد")}
          ${metaItem("المنطقة", attraction?.region_ar || "غير محدد")}
          ${metaItem("الموقع المحلي", attraction?.locality_ar || "غير محدد")}
          ${metaItem("مستوى الأهمية", attraction?.importance_level || "غير محدد")}
          ${metaItem("حالة الصور", attraction?.media_status || "غير محدد")}
          ${metaItem("الوصول", attraction?.metadata_template?.access || "قيد الاستكمال")}
          ${metaItem("أفضل موسم", attraction?.metadata_template?.best_visit_season || "قيد الاستكمال")}
          ${metaItem("الخدمات", attraction?.metadata_template?.services || "قيد الاستكمال")}
          ${metaItem("الحساسية البيئية", attraction?.metadata_template?.environmental_sensitivity || "قيد الاستكمال")}
        </div>
      </section>

      ${
        primaryPoint
          ? `
            <section class="info-section">
              <h3>البيانات المكانية من GeoJSON</h3>

              <div class="metadata-grid">
                ${metaItem("خط العرض", primaryPoint.lat.toFixed(6))}
                ${metaItem("خط الطول", primaryPoint.lng.toFixed(6))}
                ${metaItem("الحالة", primaryPoint.props.status || "غير محدد")}
                ${metaItem("المصدر", primaryPoint.props.source || "غير محدد")}
                ${metaItem("الأصل", primaryPoint.props.origin || "غير محدد")}
                ${metaItem("نوع المصدر", primaryPoint.props.source_type || "غير محدد")}
                ${metaItem("نوع الهندسة", primaryPoint.props.geometry_type || primaryPoint.feature.geometry?.type || "غير محدد")}
                ${metaItem("معرف السجل", primaryPoint.props.id ?? primaryPoint.id)}
              </div>
            </section>
          `
          : ""
      }

      ${
        verification
          ? `
            <section class="info-section">
              <h3>حالة التحقق</h3>
              <div class="verification">
                <span>⚠</span>
                <span>
                  <strong>${escapeHtml(verification.status || "قيد المراجعة")}</strong><br>
                  ${escapeHtml(verification.note_ar || "")}
                </span>
              </div>
            </section>
          `
          : ""
      }
    </div>
  `;

  dom.drawer.classList.add("is-open");
  dom.drawer.setAttribute("aria-hidden", "false");

  hydrateMediaImages(dom.drawerContent);
  bindUnifiedDrawerActions(primaryPoint, images);
}

function bindUnifiedDrawerActions(item, images) {
  dom.drawerContent
    .querySelector('[data-info-action="zoom"]')
    ?.addEventListener("click", () => {
      if (!item) return;

      mapApi.map.setView([item.lat, item.lng], 14, {
        animate: true
      });
    });

  dom.drawerContent
    .querySelector('[data-info-action="copy"]')
    ?.addEventListener("click", async () => {
      if (!item) return;

      const text = `${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}`;

      try {
        await navigator.clipboard.writeText(text);
        alert("تم نسخ الإحداثيات");
      } catch {
        alert(text);
      }
    });

  dom.drawerContent
    .querySelector('[data-info-action="close"]')
    ?.addEventListener("click", closeDrawer);

  dom.drawerContent
    .querySelectorAll(".gallery-button")
    .forEach(button => {
      button.addEventListener("click", () => {
        const resolved = resolvedImageForButton(button);

        if (resolved) {
          openLightbox(resolved);
        }
      });
    });
}

function metaItem(label, value) {
  return `
    <div class="meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}



function openLightbox(image) {
  dom.lightboxImage.src = image.src;
  dom.lightboxImage.alt = image.caption_ar || "";
  dom.lightboxCaption.textContent = image.caption_ar || "";
  dom.lightbox.hidden = false;
}

function closeLightbox() {
  dom.lightbox.hidden = true;
  dom.lightboxImage.src = "";
}

function closeDrawer(returnSidebar = true) {
  dom.drawer.classList.remove("is-open");
  dom.drawer.setAttribute("aria-hidden", "true");
  currentDrawerItem = null;

  if (returnSidebar) {
    activatePane(hasActiveSearch() ? "resultsPane" : "searchPane");
    flashSidebar();
  }
}

function zoomToVisible() {
  if (!mapApi || !state.visible.length) return;

  const markers = state.visible
    .map(item => item.marker)
    .filter(Boolean);

  if (!markers.length) return;

  const group = L.featureGroup(markers);
  const bounds = group.getBounds();

  if (bounds.isValid()) {
    mapApi.map.fitBounds(bounds.pad(0.18), {
      maxZoom: 12
    });
  }
}

function resetFilters() {
  closeDrawer(false);

  [dom.search, dom.lat, dom.lng, dom.radius].forEach(input => {
    input.value = "";
  });

  [dom.category, dom.status, dom.folder].forEach(select => {
    select.value = "";
  });

  dom.boundsOnly.checked = false;

  state.activeCategories.clear();

  document.querySelectorAll("[data-category]").forEach(input => {
    input.checked = true;
    state.activeCategories.add(input.dataset.category);
  });

  document.querySelectorAll("[data-group]").forEach(input => {
    input.checked = true;
    input.indeterminate = false;
  });

  hideSuggestions();
  applyFilters();
  activatePane("searchPane");
  flashSidebar();
}

function toggleAllLayers(show) {
  state.activeCategories.clear();

  document.querySelectorAll("[data-category]").forEach(input => {
    input.checked = show;

    if (show) {
      state.activeCategories.add(input.dataset.category);
    }
  });

  document.querySelectorAll("[data-group]").forEach(input => {
    input.checked = show;
    input.indeterminate = false;
  });

  applyFilters();
}

function locateUser() {
  if (!navigator.geolocation) {
    alert("خدمة تحديد الموقع غير مدعومة في هذا المتصفح");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      L.circleMarker([lat, lng], {
        radius: 8,
        color: "#fff",
        fillColor: "#d1495b",
        fillOpacity: 1,
        weight: 3
      })
        .addTo(mapApi.map)
        .bindPopup("موقعك الحالي")
        .openPopup();

      mapApi.map.setView([lat, lng], 12);
    },
    () => {
      alert("تعذر تحديد الموقع");
    }
  );
}

function bindEvents() {
  dom.search.addEventListener("input", () => {
    closeDrawer(false);
    activatePane("searchPane");
    updateSuggestions();
    applyFilters();
  });

  dom.search.addEventListener("blur", () => {
    window.setTimeout(hideSuggestions, 180);
  });

  [dom.category, dom.status, dom.folder].forEach(control => {
    control.addEventListener("change", () => {
      closeDrawer(false);
      applyFilters();
      activatePane("resultsPane");
      flashSidebar();
    });
  });

  dom.boundsOnly.addEventListener("change", () => {
    closeDrawer(false);
    applyFilters();
    activatePane("resultsPane");
    flashSidebar();
  });

  dom.sortResults.addEventListener("change", renderResults);

  document
    .getElementById("applySearch")
    .addEventListener("click", () => {
      closeDrawer(false);
      applyFilters();
      activatePane("resultsPane");
      flashSidebar();
    });

  document
    .getElementById("zoomVisible")
    .addEventListener("click", zoomToVisible);

  document
    .getElementById("resetFilters")
    .addEventListener("click", resetFilters);

  document
    .getElementById("showAllLayers")
    .addEventListener("click", () => toggleAllLayers(true));

  document
    .getElementById("hideAllLayers")
    .addEventListener("click", () => toggleAllLayers(false));

  document
    .getElementById("closeDrawer")
    .addEventListener("click", closeDrawer);

  document
    .getElementById("fitLibya")
    .addEventListener("click", zoomToVisible);

  document
    .getElementById("locateMe")
    .addEventListener("click", locateUser);

  document.querySelectorAll("[data-basemap]").forEach(button => {
    button.addEventListener("click", () => {
      mapApi?.setBasemap(button.dataset.basemap);
    });
  });

  dom.toggleLegend.addEventListener("click", () => {
    const list = dom.legendList;
    list.hidden = !list.hidden;
    dom.toggleLegend.textContent = list.hidden ? "+" : "−";
  });

  document
    .getElementById("closeLightbox")
    .addEventListener("click", closeLightbox);

  dom.lightbox.addEventListener("click", event => {
    if (event.target === dom.lightbox) closeLightbox();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (!dom.lightbox.hidden) {
        closeLightbox();
        return;
      }

      if (currentDrawerItem) {
        closeDrawer(true);
      }
    }
  });
}

function bindMapEvents() {
  mapApi.map.on("mousemove", event => {
    dom.mouseCoordinates.textContent =
      `${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`;
  });

  mapApi.map.on("moveend", () => {
    if (dom.boundsOnly.checked) {
      closeDrawer(false);
      applyFilters();
      activatePane("resultsPane");
    }
  });

  L.control.scale({
    position: "bottomleft",
    metric: true,
    imperial: false
  }).addTo(mapApi.map);
}

async function main() {
  try {
    validateDom();
    initTabs();
    bindEvents();
    renderQuickSearches();

    dom.loadingMessage.textContent = "تهيئة مكتبة الخريطة";
    mapApi = createMap(CONFIG.initialView);
    bindMapEvents();

    dom.loadingMessage.textContent = "تحميل ملف البيانات الجغرافية";

    const [geojson, attractions] = await Promise.all([
      fetchJson(CONFIG.dataUrl),

      fetchJson(CONFIG.attractionsUrl).catch(error => {
        console.warn(
          "تعذر تحميل attractions.json، سيتم المتابعة بدون بيانات إثرائية.",
          error
        );

        return { items: [] };
      })
    ]);

    state.prepared = prepareFeatures(geojson);

    state.featured = (attractions.items || []).filter(item => {
      return item.is_featured;
    });

    buildAttractionBindings(attractions.items || []);

    configureCategories();
    buildMarkers();
    renderLayerGroups();
    renderLegend();
    renderFeatured();

    fillSelect(
      dom.category,
      uniqueSorted(state.prepared.map(item => item.category)),
      "كل التصنيفات"
    );

    fillSelect(
      dom.status,
      uniqueSorted(state.prepared.map(item => item.props.status)),
      "كل الحالات"
    );

    fillSelect(
      dom.folder,
      uniqueSorted(state.prepared.map(item => item.props.folders)),
      "كل المسارات"
    );

    dom.total.textContent = state.prepared.length;
    dom.layers.textContent = state.categoryInfo.size;

    applyFilters();

    window.setTimeout(zoomToVisible, 450);

    dom.loading.style.display = "none";
  } catch (error) {
    console.error(error);

    if (dom.loading) {
      dom.loading.innerHTML = `
        <div class="loading-card">
          <strong style="color:var(--danger-600)">
            تعذر تشغيل الأطلس
          </strong>

          <small>
            ${escapeHtml(error.message)}
          </small>

          <small style="margin-top:8px">
            الإصدار المطلوب: 2.4.0 — تأكد من استبدال atlas.html وملفات assets معاً.
          </small>
        </div>
      `;
    } else {
      alert(`تعذر تشغيل الأطلس: ${error.message}`);
    }
  }
}

main();
