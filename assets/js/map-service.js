export function createMap(initialView) {
  if (typeof window.L === "undefined") {
    throw new Error(
      "تعذر تحميل مكتبة Leaflet. تحقق من الاتصال بالإنترنت أو من ملفات المكتبة المحلية."
    );
  }

  const map = L.map("map", {
    zoomControl: false,
    preferCanvas: true
  }).setView(
    [initialView.lat, initialView.lng],
    initialView.zoom
  );

  const baseLayers = {
    osm: L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }
    ),

    satellite: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri"
      }
    ),

    terrain: L.tileLayer(
      "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 17,
        attribution: "&copy; OpenTopoMap"
      }
    )
  };

  let currentBase = baseLayers.osm.addTo(map);

  L.control.zoom({
    position: "bottomright"
  }).addTo(map);

  // Fallback مهم:
  // إذا كانت مكتبة MarkerCluster متاحة نستخدمها.
  // إذا فشلت لأي سبب ننتقل تلقائياً إلى LayerGroup.
  const cluster =
    typeof L.markerClusterGroup === "function"
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          maxClusterRadius: 45,
          chunkedLoading: true
        })
      : L.layerGroup();

  map.addLayer(cluster);

  return {
    map,
    cluster,

    setBasemap(type) {
      if (currentBase && map.hasLayer(currentBase)) {
        map.removeLayer(currentBase);
      }

      currentBase = baseLayers[type] || baseLayers.osm;
      currentBase.addTo(map);
    }
  };
}

export function markerForItem(item, color, onOpen) {
  if (typeof window.L === "undefined") {
    throw new Error("Leaflet غير متاحة أثناء إنشاء العلامات.");
  }

  const icon = L.divIcon({
    className: "atlas-marker",
    iconSize: [30, 30],
    iconAnchor: [15, 15],

    html: `
      <div style="
        width:30px;
        height:30px;
        border-radius:50%;
        background:${color};
        color:#fff;
        border:3px solid #fff;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight:900;
        font-size:13px;
        box-shadow:0 5px 14px rgba(0,0,0,.28)
      ">•</div>
    `
  });

  const marker = L.marker(
    [item.lat, item.lng],
    { icon }
  );

  marker.bindPopup(
    `
      <div>
        <span class="popup-tag">
          ${escapeHtml(item.category)}
        </span>

        <h3 class="popup-title">
          ${escapeHtml(item.name)}
        </h3>

        <div class="popup-meta">
          <b>خط الطول:</b>
          ${item.lng.toFixed(6)}
          <br>

          <b>خط العرض:</b>
          ${item.lat.toFixed(6)}
          <br>

          <b>الحالة:</b>
          ${escapeHtml(item.props.status || "غير محدد")}
        </div>
      </div>
    `,
    {
      maxWidth: 320
    }
  );

  marker.on("click", () => {
    if (typeof onOpen === "function") {
      onOpen(item);
    }
  });

  return marker;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
  );
}
