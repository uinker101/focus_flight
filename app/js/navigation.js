// Bundled reference plans. A journey copies its plan so updates do not move
// an aircraft already in flight. No online navigation service is used.
let data;

export async function loadRoutes() {
  if (!data) {
    const response = await fetch('/assets/routes/reference.json');
    if (!response.ok) throw new Error('离线参考航路加载失败');
    data = await response.json();
  }
}

export function referenceRoute(origin, destination) {
  const route = data.routes[`${origin.iata}-${destination.iata}`];
  if (!route) return null; // Imported packs may contain airports outside this dataset.
  const airport = (a) => ({ name: a.iata, lat: a.lat, lon: a.lon });
  return {
    version: data.version,
    source: { ...(route.source === 'airfield' ? data.airfield_source : data.source) },
    note: route.note || null,
    points: [airport(origin), ...route.nodes.map((id) => {
      const [name, lat, lon] = data.nodes[id];
      return { name, lat, lon };
    }), airport(destination)],
    legs: [...route.legs],
  };
}
