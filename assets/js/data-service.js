export async function fetchJson(url){
  const response = await fetch(url, { cache: 'no-store' });
  if(!response.ok) throw new Error(`HTTP ${response.status} عند تحميل ${url}`);
  return response.json();
}

export function normalizeText(value){
  return String(value ?? '').toLowerCase().trim();
}

export function getFeatureLatLng(feature){
  const geometry = feature?.geometry;
  if(!geometry?.coordinates) return null;

  if(geometry.type === 'Point'){
    const [lng, lat] = geometry.coordinates;
    return Number.isFinite(+lat) && Number.isFinite(+lng) ? { lat:+lat, lng:+lng } : null;
  }

  const coords = [];
  function flatten(value){
    if(!Array.isArray(value)) return;
    if(typeof value[0] === 'number' && typeof value[1] === 'number'){
      coords.push([+value[0], +value[1]]);
    } else {
      value.forEach(flatten);
    }
  }
  flatten(geometry.coordinates);
  if(!coords.length) return null;

  const lng = coords.reduce((sum, pair) => sum + pair[0], 0) / coords.length;
  const lat = coords.reduce((sum, pair) => sum + pair[1], 0) / coords.length;
  return { lat, lng };
}

export function haversineKm(lat1, lng1, lat2, lng2){
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI / 180;
  const dLng = (lng2-lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function prepareFeatures(featureCollection){
  const features = featureCollection?.features ?? [];
  return features.map((feature, index) => {
    const props = feature.properties ?? {};
    const ll = getFeatureLatLng(feature);
    const category = props.primary_category || props.category || props.all_categories || 'غير مصنف';
    const name = props.name || props.Name || `نقطة ${index+1}`;

    return {
      id:index+1,
      feature,
      props,
      name,
      category,
      lat:ll?.lat ?? null,
      lng:ll?.lng ?? null,
      searchText:normalizeText([
        name, category, props.all_categories, props.description,
        props.folders, props.source, props.status, props.origin
      ].join(' '))
    };
  }).filter(item => item.lat !== null && item.lng !== null);
}
