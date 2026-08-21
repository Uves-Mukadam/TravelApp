/**
 * Travel Planner Service
 *
 * Uses Gemini to generate structured trip itineraries.
 * Falls back to a mock itinerary when Gemini is unavailable.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const https = require("https");

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "tripPlanner.txt"),
  "utf-8"
);

/**
 * Geocode a city/place name to { lat, lng } using Nominatim (OpenStreetMap).
 * Returns null if geocoding fails.
 *
 * @param {string} name - Place name to geocode
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function geocodeCity(name) {
  return new Promise((resolve) => {
    const query = encodeURIComponent(name);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&addressdetails=0`;
    const options = {
      headers: {
        "User-Agent": "AITravelGuardian/1.0 (travel-app@localhost)",
        "Accept": "application/json",
      },
    };
    https.get(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const results = JSON.parse(data);
          if (results && results.length > 0) {
            resolve({
              lat: parseFloat(results[0].lat),
              lng: parseFloat(results[0].lon),
            });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    }).on("error", () => resolve(null));
  });
}

let model = null;

/**
 * Initialize the Gemini client for planning.
 * Reuses the same API key as risk analysis.
 */
function initialize() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn(
      "[TravelPlanner] GEMINI_API_KEY not set. Planning will return mock data."
    );
    return false;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  });

  console.log("[TravelPlanner] Initialized successfully.");
  return true;
}

/**
 * Generate a trip itinerary.
 *
 * @param {Object} params
 * @param {string} params.origin - Starting location name
 * @param {string} params.destination - Destination name
 * @param {number} params.days - Number of days
 * @param {number} params.budget - Budget in INR
 * @param {Object} [params.preferences] - Optional preferences
 * @returns {Object} Structured itinerary
 */
async function planTrip({ origin, destination, days, budget, preferences, originCoords, destCoords }) {
  if (!model) {
    console.log("[TravelPlanner] Using mock itinerary (no API key).");
    return getMockItinerary({ origin, destination, days, budget, preferences, originCoords, destCoords });
  }

  try {
    const userPrompt = `Plan a trip with the following parameters:\n\n${JSON.stringify(
      { origin, destination, days, budget, preferences },
      null,
      2
    )}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7, // Slightly creative for travel suggestions
      },
    });

    const responseText = result.response.text();
    const itinerary = JSON.parse(responseText);

    if (!itinerary.dailyPlans || !itinerary.tripName) {
      throw new Error("Gemini response missing required itinerary fields");
    }

    console.log(
      `[TravelPlanner] Itinerary generated: "${itinerary.tripName}" (${itinerary.dailyPlans.length} days)`
    );

    return itinerary;
  } catch (error) {
    console.error("[TravelPlanner] Planning failed:", error.message);
    console.log("[TravelPlanner] Falling back to mock itinerary.");
    return getMockItinerary({ origin, destination, days, budget, preferences, originCoords, destCoords });
  }
}

/**
 * Generate a mock itinerary when Gemini is unavailable.
 */
async function getMockItinerary({ origin, destination, days, budget, preferences, originCoords: preOriginCoords, destCoords: preDestCoords }) {
  const perDayBudget = Math.floor(budget / days);
  const transportCost = Math.floor(budget * 0.25);
  const accommodationCost = Math.floor(budget * 0.3);
  const foodCost = Math.floor(budget * 0.2);
  const activitiesCost = Math.floor(budget * 0.15);
  const emergencyReserve = Math.floor(budget * 0.1);

  // Known coordinates for common Indian cities/regions (fast-path cache)
  const cityCoords = {
    mumbai: { lat: 19.076, lng: 72.8777 },
    goa: { lat: 15.2993, lng: 74.124 },
    "new delhi": { lat: 28.6139, lng: 77.209 },
    delhi: { lat: 28.6139, lng: 77.209 },
    bangalore: { lat: 12.9716, lng: 77.5946 },
    bengaluru: { lat: 12.9716, lng: 77.5946 },
    chennai: { lat: 13.0827, lng: 80.2707 },
    jaipur: { lat: 26.9124, lng: 75.7873 },
    pune: { lat: 18.5204, lng: 73.8567 },
    kolkata: { lat: 22.5726, lng: 88.3639 },
    hyderabad: { lat: 17.385, lng: 78.4867 },
    udaipur: { lat: 24.5854, lng: 73.7125 },
    kochi: { lat: 9.9312, lng: 76.2673 },
    varanasi: { lat: 25.3176, lng: 82.9739 },
    agra: { lat: 27.1767, lng: 78.0081 },
    shimla: { lat: 31.1048, lng: 77.1734 },
    manali: { lat: 32.2396, lng: 77.1887 },
    // Additional common regions
    kashmir: { lat: 34.0837, lng: 74.7973 },
    srinagar: { lat: 34.0837, lng: 74.7973 },
    leh: { lat: 34.1526, lng: 77.5771 },
    ladakh: { lat: 34.1526, lng: 77.5771 },
    odisha: { lat: 20.2961, lng: 85.8245 },
    bhubaneswar: { lat: 20.2961, lng: 85.8245 },
    puri: { lat: 19.8135, lng: 85.8312 },
    amritsar: { lat: 31.634, lng: 74.8723 },
    chandigarh: { lat: 30.7333, lng: 76.7794 },
    lucknow: { lat: 26.8467, lng: 80.9462 },
    ahmedabad: { lat: 23.0225, lng: 72.5714 },
    surat: { lat: 21.1702, lng: 72.8311 },
    nagpur: { lat: 21.1458, lng: 79.0882 },
    bhopal: { lat: 23.2599, lng: 77.4126 },
    indore: { lat: 22.7196, lng: 75.8577 },
    coimbatore: { lat: 11.0168, lng: 76.9558 },
    madurai: { lat: 9.9252, lng: 78.1198 },
    mysore: { lat: 12.2958, lng: 76.6394 },
    mysuru: { lat: 12.2958, lng: 76.6394 },
    visakhapatnam: { lat: 17.6868, lng: 83.2185 },
    vizag: { lat: 17.6868, lng: 83.2185 },
    raipur: { lat: 21.2514, lng: 81.6296 },
    patna: { lat: 25.5941, lng: 85.1376 },
    ranchi: { lat: 23.3441, lng: 85.3096 },
    dehradun: { lat: 30.3165, lng: 78.0322 },
    rishikesh: { lat: 30.0869, lng: 78.2676 },
    haridwar: { lat: 29.9457, lng: 78.1642 },
    dharamshala: { lat: 32.2190, lng: 76.3234 },
    ooty: { lat: 11.4102, lng: 76.6950 },
    munnar: { lat: 10.0889, lng: 77.0595 },
    alleppey: { lat: 9.4981, lng: 76.3388 },
    alappuzha: { lat: 9.4981, lng: 76.3388 },
    kovalam: { lat: 8.4004, lng: 76.9787 },
    thiruvananthapuram: { lat: 8.5241, lng: 76.9366 },
    trivandrum: { lat: 8.5241, lng: 76.9366 },
    darjeeling: { lat: 27.0360, lng: 88.2627 },
    gangtok: { lat: 27.3389, lng: 88.6065 },
    sikkim: { lat: 27.5330, lng: 88.5122 },
    shillong: { lat: 25.5788, lng: 91.8933 },
    guwahati: { lat: 26.1445, lng: 91.7362 },
    imphal: { lat: 24.8170, lng: 93.9368 },
    aizawl: { lat: 23.7307, lng: 92.7173 },
    "port blair": { lat: 11.6234, lng: 92.7265 },
    andaman: { lat: 11.7401, lng: 92.6586 },
    lakshadweep: { lat: 10.5667, lng: 72.6417 },
    diu: { lat: 20.7151, lng: 70.9876 },
    daman: { lat: 20.3974, lng: 72.8328 },
    puducherry: { lat: 11.9416, lng: 79.8083 },
    pondicherry: { lat: 11.9416, lng: 79.8083 },
  };

  async function findCoords(name) {
    const key = name.toLowerCase().trim();
    // Fast-path: check built-in table
    for (const [city, coords] of Object.entries(cityCoords)) {
      if (key.includes(city) || city.includes(key)) return coords;
    }
    // Slow-path: call Nominatim geocoding API
    console.log(`[TravelPlanner] Geocoding unknown location: "${name}" via Nominatim`);
    const geocoded = await geocodeCity(name);
    if (geocoded) {
      console.log(`[TravelPlanner] Geocoded "${name}" → lat:${geocoded.lat}, lng:${geocoded.lng}`);
      return geocoded;
    }
    // Final fallback: center of India
    console.warn(`[TravelPlanner] Could not geocode "${name}", using India center fallback.`);
    return { lat: 20.5937, lng: 78.9629 };
  }

  // Use pre-supplied coords (from map picker) or geocode the name
  const originCoords = preOriginCoords || await findCoords(origin);
  const destCoords = preDestCoords || await findCoords(destination);

  const dailyPlans = [];
  for (let d = 1; d <= days; d++) {
    const isFirstDay = d === 1;
    const isLastDay = d === days;

    dailyPlans.push({
      day: d,
      title: isFirstDay
        ? `Departure from ${origin}`
        : isLastDay
          ? `Explore & Return from ${destination}`
          : `Day ${d} in ${destination}`,
      description: isFirstDay
        ? `Travel from ${origin} to ${destination}. Settle into accommodation.`
        : isLastDay
          ? `Final exploration and return journey.`
          : `Explore local attractions in ${destination}.`,
      activities: [
        {
          time: isFirstDay ? "06:00 AM" : "09:00 AM",
          activity: isFirstDay
            ? `Depart from ${origin}`
            : `Morning exploration`,
          location: isFirstDay ? origin : destination,
          estimatedCost: isFirstDay ? Math.floor(transportCost * 0.5) : 0,
          notes: isFirstDay
            ? "Start early to make the most of the day"
            : "Visit local markets and landmarks",
        },
        {
          time: "12:00 PM",
          activity: "Lunch at a local restaurant",
          location: destination,
          estimatedCost: Math.floor(foodCost / days / 3),
          notes: "Try local cuisine",
        },
        {
          time: "03:00 PM",
          activity: isLastDay
            ? `Begin return to ${origin}`
            : "Afternoon sightseeing",
          location: destination,
          estimatedCost: isLastDay ? Math.floor(transportCost * 0.5) : Math.floor(activitiesCost / days),
          notes: isLastDay
            ? "Ensure you've packed everything"
            : "Visit popular tourist spots",
        },
        {
          time: "07:00 PM",
          activity: "Dinner",
          location: isLastDay ? origin : destination,
          estimatedCost: Math.floor(foodCost / days / 3),
          notes: "Rest and recharge",
        },
      ],
      accommodation: isLastDay
        ? null
        : {
            name: `Budget ${d === 1 ? "Hotel" : "Guesthouse"} in ${destination}`,
            type: d === 1 ? "hotel" : "guesthouse",
            estimatedCost: Math.floor(accommodationCost / (days - 1)),
          },
      safetyCheckpoint: {
        time: isFirstDay ? "12:00 PM" : "06:00 PM",
        location: isFirstDay
          ? `Midway between ${origin} and ${destination}`
          : destination,
        notes: isFirstDay
          ? "Check in when you reach the halfway point"
          : "Evening check-in to confirm safe return to accommodation",
      },
      emergencyResources: [
        {
          type: "hospital",
          name: "District Hospital",
          location: destination,
        },
        {
          type: "police",
          name: "Local Police Station",
          location: destination,
        },
        {
          type: "fuel",
          name: "Fuel Station",
          location: isFirstDay
            ? `Highway between ${origin} and ${destination}`
            : destination,
        },
      ],
    });
  }

  // Build waypoints including intermediate stops
  const waypoints = [
    { name: origin, ...originCoords, day: 1, type: "origin" },
  ];

  if (days > 2) {
    // Add a midpoint waypoint
    waypoints.push({
      name: `Midway Checkpoint`,
      lat: (originCoords.lat + destCoords.lat) / 2,
      lng: (originCoords.lng + destCoords.lng) / 2,
      day: 1,
      type: "checkpoint",
    });
  }

  waypoints.push({
    name: destination,
    ...destCoords,
    day: 1,
    type: "destination",
  });

  return {
    tripName: `[MOCK] ${origin} → ${destination} (${days}-Day Trip)`,
    summary: `A ${days}-day trip from ${origin} to ${destination} within a budget of ₹${budget.toLocaleString("en-IN")}. Includes transport, accommodation, food, activities, and an emergency reserve.`,
    totalEstimatedCost: budget,
    costBreakdown: {
      transport: transportCost,
      accommodation: accommodationCost,
      food: foodCost,
      activities: activitiesCost,
      emergency_reserve: emergencyReserve,
    },
    safetyTips: [
      "Share your live location with a trusted contact",
      "Keep emergency numbers saved offline",
      "Carry a portable charger for your phone",
      "Check weather conditions before departure",
      `Register your trip details with local authorities if traveling to remote areas`,
      "Keep copies of important documents (ID, insurance) on your phone",
    ],
    dailyPlans,
    routeWaypoints: waypoints,
  };
}

module.exports = { initialize, planTrip };
