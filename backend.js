/**
 * OAU Transit — Supabase Backend Engine v2
 * Real-time powered by Supabase Realtime + BroadcastChannel fallback
 *
 * SETUP: Replace the two constants below with your Supabase project credentials.
 * Get them from: Supabase Dashboard → Settings → API
 */

// ─── SUPABASE CONFIG ─────────────────────────────────────────────────────────
const SUPABASE_URL     = 'https://ljfaqadyitxyweazjpjx.supabase.co';   // ← replace
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqZmFxYWR5aXR4eXdlYXpqcGp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTQ2NTYsImV4cCI6MjA5NDk3MDY1Nn0.cK7bdxqEAR8A5u4EZk2M0wZAF3sF1f3HQTIv23d8oSs';                     // ← replace

// ─── CAMPUS LOCATIONS ────────────────────────────────────────────────────────
const OAU_LOCATIONS = {
  'Main Gate':                   { lat: 7.5115, lng: 4.5212, icon: '🚪' },
  'Hezekiah Oluwasanmi Library': { lat: 7.5185, lng: 4.5238, icon: '📚' },
  'Faculty of Science':          { lat: 7.5202, lng: 4.5255, icon: '🔬' },
  'Faculty of Arts':             { lat: 7.5178, lng: 4.5275, icon: '🎨' },
  'Faculty of Law':              { lat: 7.5165, lng: 4.5290, icon: '⚖️' },
  'Faculty of Education':        { lat: 7.5220, lng: 4.5220, icon: '🎓' },
  'Sports Complex':              { lat: 7.5142, lng: 4.5260, icon: '🏟️' },
  'Moremi Hall':                 { lat: 7.5230, lng: 4.5245, icon: '🏠' },
  'Angola Hall':                 { lat: 7.5210, lng: 4.5290, icon: '🏠' },
  'Fajuyi Hall':                 { lat: 7.5155, lng: 4.5300, icon: '🏠' },
  'OAUTHC Hospital':             { lat: 7.5110, lng: 4.5250, icon: '🏥' },
  'Mozambique Hall':             { lat: 7.5240, lng: 4.5270, icon: '🏠' },
};

const LOCATION_NAMES = Object.keys(OAU_LOCATIONS);
const MIN_STUDENTS_FOR_DISPATCH = 10;
const BUS_SPEED = 0.00012;
const TICK_MS = 800;

// ─── DEMO ACCOUNTS (fallback when Supabase is unreachable) ───────────────────
const DEMO_ACCOUNTS = {
  students: {
    '170405001': { password: 'pass', name: 'Adebayo Okonkwo', level: '400L', dept: 'Computer Science' },
    '170405002': { password: 'pass', name: 'Fatima Aliyu', level: '300L', dept: 'Electrical Engineering' },
    '170405003': { password: 'pass', name: 'Chukwuemeka Obi', level: '200L', dept: 'Medicine' },
    '170405004': { password: 'pass', name: 'Ngozi Eze', level: '500L', dept: 'Law' },
    '170405005': { password: 'pass', name: 'Taiwo Adeyemi', level: '100L', dept: 'Economics' },
    'student':   { password: 'pass', name: 'Demo Student', level: '300L', dept: 'Computer Science' },
  },
  drivers: {
    'driver1': { password: 'pass', name: 'Mr. Adekunle Bello', bus: 'OAU-BUS-01', plate: 'OY 123 AA' },
    'driver2': { password: 'pass', name: 'Mr. Emeka Nwosu',    bus: 'OAU-BUS-02', plate: 'OY 456 BB' },
    'driver3': { password: 'pass', name: 'Mr. Kabir Musa',     bus: 'OAU-BUS-03', plate: 'OY 789 CC' },
    'driver4': { password: 'pass', name: 'Mr. Seun Adegoke',   bus: 'OAU-BUS-04', plate: 'OY 012 DD' },
  },
  admins: {
    'admin': { password: 'pass', name: 'Prof. Adewale Oyewole', title: 'Director of Transport' },
  }
};

// ─── SUPABASE CLIENT ─────────────────────────────────────────────────────────
let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;
  if (typeof window !== 'undefined' && window.supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } }
    });
    return _supabase;
  }
  return null;
}

// Check if Supabase is configured (not using placeholder values)
function isSupabaseConfigured() {
  return SUPABASE_URL !== 'https://YOUR_PROJECT.supabase.co' &&
         SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY';
}

// ─── BROADCAST CHANNEL ───────────────────────────────────────────────────────
let bc;
try { bc = new BroadcastChannel('oau_transit'); } catch(e) { bc = null; }

function broadcast(type, payload) {
  if (bc) bc.postMessage({ type, payload, ts: Date.now() });
}

// ─── LOCAL FALLBACK STORAGE ───────────────────────────────────────────────────
function getDB(key, fallback = {}) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function setDB(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
  broadcast('db_update', { key });
}

// ─── AUTHENTICATION ───────────────────────────────────────────────────────────

/**
 * Authenticate a user against Supabase accounts table.
 * Falls back to DEMO_ACCOUNTS if Supabase is not configured or unreachable.
 *
 * @param {string} id - Matric number / driver ID / admin ID
 * @param {string} password - Plain text password
 * @param {string} role - 'student' | 'driver' | 'admin'
 * @returns {{ success: boolean, user?: object, error?: string }}
 */
async function authenticate(id, password, role) {
  // Try Supabase first
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      if (sb) {
        const { data, error } = await sb
          .from('accounts')
          .select('*')
          .eq('id', id)
          .eq('password', password)  // In production, use hashed passwords!
          .eq('role', role)
          .single();

        if (error || !data) {
          // Fall through to local fallback
        } else {
          return { success: true, user: data };
        }
      }
    } catch (e) {
      console.warn('Supabase auth failed, using local fallback:', e.message);
    }
  }

  // Local demo fallback
  const roleMap = { student: 'students', driver: 'drivers', admin: 'admins' };
  const db = DEMO_ACCOUNTS[roleMap[role]];
  const user = db?.[id];
  if (!user || user.password !== password) {
    return { success: false, error: 'Invalid credentials. Check the demo hints.' };
  }
  return { success: true, user: { id, role, ...user } };
}

// ─── SUPABASE DATA LAYER — BUSES ─────────────────────────────────────────────

async function sbGetBuses() {
  if (!isSupabaseConfigured()) return getDB('oau_buses', {});
  try {
    const sb = getSupabase();
    if (!sb) throw new Error('no client');
    const { data, error } = await sb.from('buses').select('*');
    if (error) throw error;
    // Normalise snake_case to camelCase for local compat
    const obj = {};
    data.forEach(b => {
      obj[b.id] = {
        id: b.id,
        driverId: b.driver_id,
        driverName: b.driver_name,
        plate: b.plate,
        lat: b.lat,
        lng: b.lng,
        status: b.status,
        capacity: b.capacity,
        passengers: b.passengers,
        route: b.route,
        destination: b.destination,
        destinationCoords: b.destination_coords,
        currentTrip: b.current_trip,
        tripStudents: b.trip_students,
        lastUpdate: b.last_update,
      };
    });
    // Mirror to localStorage for offline fallback
    setDB('oau_buses', obj);
    return obj;
  } catch(e) {
    console.warn('sbGetBuses fallback:', e.message);
    return getDB('oau_buses', {});
  }
}

async function sbSaveBus(busId, updates) {
  // Always update localStorage immediately
  const buses = getDB('oau_buses', {});
  if (buses[busId]) {
    Object.assign(buses[busId], updates, { lastUpdate: Date.now() });
    setDB('oau_buses', buses);
  }

  if (!isSupabaseConfigured()) return;
  try {
    const sb = getSupabase();
    if (!sb) return;
    // Convert camelCase updates to snake_case
    const snaked = {};
    const map = {
      driverId: 'driver_id', driverName: 'driver_name',
      destinationCoords: 'destination_coords', currentTrip: 'current_trip',
      tripStudents: 'trip_students', lastUpdate: 'last_update',
    };
    for (const [k, v] of Object.entries(updates)) {
      snaked[map[k] || k] = v;
    }
    snaked.last_update = Date.now();
    await sb.from('buses').update(snaked).eq('id', busId);
  } catch(e) {
    console.warn('sbSaveBus error:', e.message);
  }
}

// ─── SUPABASE DATA LAYER — RIDE REQUESTS ─────────────────────────────────────

async function sbGetRequests() {
  if (!isSupabaseConfigured()) return getDB('oau_requests', {});
  try {
    const sb = getSupabase();
    if (!sb) throw new Error('no client');
    const { data, error } = await sb
      .from('ride_requests')
      .select('*')
      .neq('status', 'completed');
    if (error) throw error;
    const obj = {};
    data.forEach(r => {
      obj[r.location] = {
        location: r.location,
        destination: r.destination,
        students: r.students || [],
        status: r.status,
        assignedBus: r.assigned_bus,
        dispatchTime: r.dispatch_time,
        createdAt: new Date(r.created_at).getTime(),
        coords: OAU_LOCATIONS[r.location],
      };
    });
    setDB('oau_requests', obj);
    return obj;
  } catch(e) {
    console.warn('sbGetRequests fallback:', e.message);
    return getDB('oau_requests', {});
  }
}

async function sbSaveRequest(locationKey, reqData) {
  // Always update localStorage
  const requests = getDB('oau_requests', {});
  requests[locationKey] = reqData;
  setDB('oau_requests', requests);

  if (!isSupabaseConfigured()) return;
  try {
    const sb = getSupabase();
    if (!sb) return;
    const payload = {
      location: locationKey,
      destination: reqData.destination,
      students: reqData.students,
      status: reqData.status,
      assigned_bus: reqData.assignedBus || null,
      dispatch_time: reqData.dispatchTime || null,
      updated_at: new Date().toISOString(),
    };
    const { data: existing } = await sb
      .from('ride_requests').select('id').eq('location', locationKey).single();
    if (existing) {
      await sb.from('ride_requests').update(payload).eq('location', locationKey);
    } else {
      await sb.from('ride_requests').insert(payload);
    }
  } catch(e) {
    console.warn('sbSaveRequest error:', e.message);
  }
}

async function sbDeleteRequest(locationKey) {
  const requests = getDB('oau_requests', {});
  delete requests[locationKey];
  setDB('oau_requests', requests);

  if (!isSupabaseConfigured()) return;
  try {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('ride_requests').delete().eq('location', locationKey);
  } catch(e) {
    console.warn('sbDeleteRequest error:', e.message);
  }
}

// ─── SUPABASE DATA LAYER — STUDENT PINS ──────────────────────────────────────

async function sbGetStudentPins() {
  if (!isSupabaseConfigured()) {
    return getDB('oau_student_pins', []).filter(p => Date.now() - p.ts < 5 * 60 * 1000);
  }
  try {
    const sb = getSupabase();
    if (!sb) throw new Error('no client');
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data, error } = await sb
      .from('student_pins').select('*').gt('created_at', cutoff);
    if (error) throw error;
    return data || [];
  } catch(e) {
    console.warn('sbGetStudentPins fallback:', e.message);
    return getDB('oau_student_pins', []).filter(p => Date.now() - p.ts < 5 * 60 * 1000);
  }
}

async function sbSaveStudentPin(pin) {
  // localStorage
  const pins = getDB('oau_student_pins', [])
    .filter(p => p.studentId !== pin.student_id && Date.now() - (p.ts||0) < 5 * 60 * 1000);
  pins.push({ studentId: pin.student_id, name: pin.name, lat: pin.lat, lng: pin.lng, ts: Date.now() });
  setDB('oau_student_pins', pins);

  if (!isSupabaseConfigured()) return;
  try {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('student_pins').upsert(
      { student_id: pin.student_id, name: pin.name, lat: pin.lat, lng: pin.lng, created_at: new Date().toISOString() },
      { onConflict: 'student_id' }
    );
  } catch(e) {
    console.warn('sbSaveStudentPin error:', e.message);
  }
}

async function sbRemoveStudentPin(studentId) {
  const pins = getDB('oau_student_pins', []).filter(p => p.studentId !== studentId);
  setDB('oau_student_pins', pins);

  if (!isSupabaseConfigured()) return;
  try {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('student_pins').delete().eq('student_id', studentId);
  } catch(e) {
    console.warn('sbRemoveStudentPin error:', e.message);
  }
}

// ─── BUS MANAGEMENT ──────────────────────────────────────────────────────────

function getBuses() { return getDB('oau_buses', {}); }
function saveBuses(b) { setDB('oau_buses', b); }

function updateBusPosition(busId, lat, lng) {
  const buses = getBuses();
  if (buses[busId]) {
    buses[busId].lat = lat; buses[busId].lng = lng; buses[busId].lastUpdate = Date.now();
    saveBuses(buses);
    sbSaveBus(busId, { lat, lng });
  }
}

function setBusStatus(busId, status, extra = {}) {
  const buses = getBuses();
  if (buses[busId]) {
    buses[busId].status = status;
    Object.assign(buses[busId], extra, { lastUpdate: Date.now() });
    saveBuses(buses);
    sbSaveBus(busId, { status, ...extra });
  }
}

// ─── RIDE REQUESTS ───────────────────────────────────────────────────────────

function getRequests() { return getDB('oau_requests', {}); }
function saveRequests(r) { setDB('oau_requests', r); }

async function submitRideRequest(studentId, studentName, from, to) {
  const requests = getRequests();
  const key = from;
  if (!requests[key]) {
    requests[key] = {
      location: from, destination: to, students: [],
      status: 'waiting', assignedBus: null,
      createdAt: Date.now(), coords: OAU_LOCATIONS[from],
    };
  }
  const exists = requests[key].students.find(s => s.id === studentId);
  if (exists) return { success: false, msg: 'You already have a pending request from this location.' };

  requests[key].students.push({
    id: studentId, name: studentName, destination: to,
    requestTime: Date.now(), status: 'waiting'
  });

  const count = requests[key].students.length;
  saveRequests(requests);
  await sbSaveRequest(key, requests[key]);

  if (count >= MIN_STUDENTS_FOR_DISPATCH && requests[key].status === 'waiting') {
    autoDispatch(key);
  }

  return {
    success: true, count,
    threshold: MIN_STUDENTS_FOR_DISPATCH,
    msg: `Request submitted! ${count}/${MIN_STUDENTS_FOR_DISPATCH} students at ${from}.`
  };
}

function autoDispatch(locationKey) {
  const requests = getRequests();
  const req = requests[locationKey];
  if (!req || req.status !== 'waiting') return;

  const buses = getBuses();
  const loc = OAU_LOCATIONS[locationKey];
  if (!loc) return;

  let closest = null, minDist = Infinity;
  for (const [id, bus] of Object.entries(buses)) {
    if (bus.status !== 'idle') continue;
    const d = Math.hypot(bus.lat - loc.lat, bus.lng - loc.lng);
    if (d < minDist) { minDist = d; closest = id; }
  }

  if (!closest) {
    requests[locationKey].status = 'pending_bus';
    saveRequests(requests);
    sbSaveRequest(locationKey, requests[locationKey]);
    return;
  }

  requests[locationKey].status = 'dispatched';
  requests[locationKey].assignedBus = closest;
  requests[locationKey].dispatchTime = Date.now();
  saveRequests(requests);
  sbSaveRequest(locationKey, requests[locationKey]);

  setBusStatus(closest, 'en_route_pickup', {
    destination: locationKey,
    destinationCoords: loc,
    tripStudents: req.students.length,
    currentTrip: locationKey,
  });

  logTrip({ busId: closest, from: locationKey, to: req.students[0]?.destination, students: req.students.length, status: 'pickup' });
  broadcast('dispatch', { busId: closest, location: locationKey, students: req.students.length });
}

// ─── TRIP LOG ────────────────────────────────────────────────────────────────

function getTrips() { return getDB('oau_trips', []); }

function logTrip(trip) {
  const trips = getTrips();
  trips.unshift({ ...trip, id: Date.now(), time: new Date().toLocaleTimeString() });
  if (trips.length > 100) trips.pop();
  setDB('oau_trips', trips);

  // Save to Supabase trips table
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      if (sb) {
        sb.from('trips').insert({
          bus_id: trip.busId,
          from_loc: trip.from,
          to_loc: trip.to,
          students: trip.students,
          status: trip.status,
        }).then(() => {}).catch(() => {});
      }
    } catch {}
  }
}

// ─── STATS ───────────────────────────────────────────────────────────────────

function getStats() { return getDB('oau_stats', { studentsServed: 0, tripsCompleted: 0 }); }

async function incrementStats(students = 0) {
  const s = getStats();
  s.studentsServed += students;
  s.tripsCompleted += 1;
  setDB('oau_stats', s);

  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabase();
      if (sb) {
        await sb.rpc('increment_stat', { stat_key: 'students_served', amount: students });
        await sb.rpc('increment_stat', { stat_key: 'trips_completed', amount: 1 });
      }
    } catch {}
  }
}

async function getGlobalStats() {
  if (!isSupabaseConfigured()) return getStats();
  try {
    const sb = getSupabase();
    if (!sb) throw new Error('no client');
    const { data } = await sb.from('stats').select('*');
    if (!data) throw new Error('no data');
    const out = { studentsServed: 0, tripsCompleted: 0 };
    data.forEach(row => {
      if (row.key === 'students_served') out.studentsServed = row.value;
      if (row.key === 'trips_completed') out.tripsCompleted = row.value;
    });
    return out;
  } catch {
    return getStats();
  }
}

// ─── MOVEMENT ────────────────────────────────────────────────────────────────

function moveBusTowards(bus, targetLat, targetLng) {
  const dLat = targetLat - bus.lat, dLng = targetLng - bus.lng;
  const dist = Math.hypot(dLat, dLng);
  if (dist < 0.0003) return { arrived: true, lat: targetLat, lng: targetLng };
  return {
    arrived: false,
    lat: bus.lat + (dLat / dist) * BUS_SPEED,
    lng: bus.lng + (dLng / dist) * BUS_SPEED
  };
}

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── SESSION ─────────────────────────────────────────────────────────────────

function getSession() {
  try { return JSON.parse(localStorage.getItem('oau_session')); } catch { return null; }
}

function requireSession(role) {
  const session = getSession();
  if (!session) { window.location.href = 'index.html'; return null; }
  if (role && session.role !== role) { window.location.href = 'index.html'; return null; }
  return session;
}

function logout() {
  localStorage.removeItem('oau_session');
  window.location.href = 'index.html';
}

// ─── SUPABASE REALTIME SUBSCRIPTION ─────────────────────────────────────────

let _realtimeChannel = null;

async function subscribeRealtime(onUpdate) {
  if (!isSupabaseConfigured()) return;
  try {
    const sb = getSupabase();
    if (!sb) return;

    // Unsubscribe from any existing channel first
    if (_realtimeChannel) {
      sb.removeChannel(_realtimeChannel);
    }

    // Wrapper: re-fetch fresh data from Supabase THEN call the page's render function.
    // This is critical — without it, onUpdate reads stale localStorage after a realtime event.
    async function onRealtimeChange(table) {
      try {
        if (table === 'buses') await sbGetBuses();
        else if (table === 'requests') await sbGetRequests();
        // pins and stats are fetched directly by the page in their own render calls
      } catch(e) {
        console.warn('[OAU Transit] Realtime re-fetch failed:', e.message);
      }
      onUpdate(table);
    }

    _realtimeChannel = sb.channel('oau-transit-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buses' },         () => onRealtimeChange('buses'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests' }, () => onRealtimeChange('requests'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_pins' },  () => onRealtimeChange('pins'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stats' },         () => onRealtimeChange('stats'))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[OAU Transit] Supabase Realtime connected ✅');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[OAU Transit] Realtime issue:', status, '— polling fallback active');
        }
      });
  } catch(e) {
    console.warn('[OAU Transit] Realtime subscription failed:', e.message);
  }
}

// ─── INIT: seed localStorage buses if not present ─────────────────────────────

function initLocalBuses() {
  if (localStorage.getItem('oau_buses')) return; // already seeded
  const buses = {
    'OAU-BUS-01': { id:'OAU-BUS-01', driverId:'driver1', driverName:'Mr. Adekunle Bello', plate:'OY 123 AA', lat:7.5190, lng:4.5220, status:'offline', capacity:30, passengers:0, route:'Main Gate ↔ Library' },
    'OAU-BUS-02': { id:'OAU-BUS-02', driverId:'driver2', driverName:'Mr. Emeka Nwosu',    plate:'OY 456 BB', lat:7.5160, lng:4.5250, status:'offline', capacity:30, passengers:0, route:'Sports ↔ Main Gate' },
    'OAU-BUS-03': { id:'OAU-BUS-03', driverId:'driver3', driverName:'Mr. Kabir Musa',     plate:'OY 789 CC', lat:7.5200, lng:4.5270, status:'offline', capacity:30, passengers:0, route:'Moremi ↔ Main Gate' },
    'OAU-BUS-04': { id:'OAU-BUS-04', driverId:'driver4', driverName:'Mr. Seun Adegoke',   plate:'OY 012 DD', lat:7.5145, lng:4.5230, status:'offline', capacity:30, passengers:0, route:'Fajuyi ↔ Library' },
  };
  localStorage.setItem('oau_buses', JSON.stringify(buses));
  localStorage.setItem('oau_requests', JSON.stringify({}));
  localStorage.setItem('oau_trips', JSON.stringify([]));
  localStorage.setItem('oau_stats', JSON.stringify({ studentsServed: 0, tripsCompleted: 0 }));
  localStorage.setItem('oau_student_pins', JSON.stringify([]));
}

// Run init immediately when script loads
initLocalBuses();

// ─── SYNC FROM SUPABASE ON LOAD ──────────────────────────────────────────────

/**
 * Pull fresh data from Supabase into localStorage on page load.
 * Call this once per page after DOM is ready.
 */
async function syncFromSupabase(andRender) {
  if (!isSupabaseConfigured()) {
    if (andRender) andRender();
    return;
  }
  try {
    await sbGetBuses();
    await sbGetRequests();
    console.log('[OAU Transit] Synced from Supabase ✅');
  } catch(e) {
    console.warn('[OAU Transit] Supabase sync failed, using local data:', e.message);
  }
  if (andRender) andRender();
}
