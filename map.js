mapboxgl.accessToken = 'pk.eyJ1IjoicmlhanVuZWphIiwiYSI6ImNtN2VndWVzMzBlMGIybXB3cXV3eHRpaDAifQ.uSIdWxsT-hrbOAI8IwqDng';
const INPUT_BLUEBIKES_CSV_URL = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
const TRAFFIC_DATA_URL = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18
});

const svg = d3.select('#map').select('svg');

let stations = [];
let trips = [];
let circles;

// Define a quantize scale for departure ratio (for circle color)
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

// Time filter elements
let timeFilter = -1;
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value);
  if (timeFilter === -1) {
    selectedTime.textContent = '';
    anyTimeLabel.style.display = 'block';
  } else {
    selectedTime.textContent = formatTime(timeFilter);
    anyTimeLabel.style.display = 'none';
  }
  filterTripsByTime();
}

timeSlider.addEventListener('input', updateTimeDisplay);
updateTimeDisplay();

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterTripsByTime() {
  let filteredTrips = (timeFilter === -1)
    ? trips
    : trips.filter(trip => {
        const started = minutesSinceMidnight(trip.started_at);
        const ended = minutesSinceMidnight(trip.ended_at);
        return (
          Math.abs(started - timeFilter) <= 60 ||
          Math.abs(ended - timeFilter) <= 60
        );
      });

  let filteredArrivals = d3.rollup(
    filteredTrips,
    v => v.length,
    d => d.end_station_id
  );
  let filteredDepartures = d3.rollup(
    filteredTrips,
    v => v.length,
    d => d.start_station_id
  );

  let filteredStations = stations.map(station => {
    let clone = { ...station };
    let id = clone.short_name;
    clone.arrivals = filteredArrivals.get(id) ?? 0;
    clone.departures = filteredDepartures.get(id) ?? 0;
    clone.totalTraffic = clone.arrivals + clone.departures;
    return clone;
  });

  const radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(filteredStations, d => d.totalTraffic)])
    .range(timeFilter === -1 ? [0, 25] : [3, 50]);

  circles = svg.selectAll('circle')
    .data(filteredStations, d => d.short_name)
    .join('circle')
    .attr('r', d => radiusScale(d.totalTraffic))
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('opacity', 0.6)
    .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));

  circles.each(function(d) {
    d3.select(this).selectAll('title').remove();
    d3.select(this)
      .append('title')
      .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
  });
  updatePositions();
}

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

function updatePositions() {
  if (!circles) return;
  circles
    .attr('cx', d => getCoords(d).cx)
    .attr('cy', d => getCoords(d).cy);
}

map.on('load', () => {
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
  });
  map.addLayer({
    id: 'boston-bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6
    }
  });

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });
  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6
    }
  });

  d3.json(INPUT_BLUEBIKES_CSV_URL).then(jsonData => {
    stations = jsonData.data.stations;
    d3.csv(TRAFFIC_DATA_URL).then(rawTrips => {
      for (let trip of rawTrips) {
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);
      }
      trips = rawTrips;
      filterTripsByTime();
    }).catch(error => {
      console.error('Error loading traffic CSV:', error);
    });
  }).catch(error => {
    console.error('Error loading station JSON:', error);
  });
});

map.on('move', updatePositions);
map.on('zoom', updatePositions);
map.on('resize', updatePositions);
map.on('moveend', updatePositions);
