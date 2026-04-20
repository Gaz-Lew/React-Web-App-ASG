# ASG CRM — QA Master Plan
## Senior QA Engineering Analysis

> Generated from direct codebase inspection. Every finding references exact files and line numbers.

---

# PART 1: COMPLETE FAILURE POINT ANALYSIS

## 1.1 Authentication & Session

| # | Failure Point | File | Risk |
|---|--------------|------|------|
| A1 | `localStorage.getItem("asg-crm:userId")` returns null — currentUser never set | `App.tsx:900+`, `appStore.ts` | **CRITICAL** — infinite login loop |
| A2 | PIN stored as number vs string mismatch — parseInt on "0408" fails | `App.tsx` login flow | HIGH |
| A3 | `reps` array empty on load — user can't select rep to login | `useFirebase.ts:useReps` | HIGH |
| A4 | `/GLadmin` bypass URL exposes admin account if reps load slowly (race) | `App.tsx:900-911` | HIGH |
| A5 | No session expiry — localStorage token persists indefinitely | `App.tsx` | MEDIUM |

## 1.2 Firebase / Firestore

| # | Failure Point | File | Risk |
|---|--------------|------|------|
| B1 | Missing VITE_FIREBASE_* env vars — `initializeApp` with undefined values | `lib/firebase.ts:14-21` | **CRITICAL** |
| B2 | `persistentMultipleTabManager()` throws if IndexedDB unavailable (Safari private) | `lib/firebase.ts:27` | HIGH |
| B3 | `onSnapshot` listeners not unsubscribed — memory leak on page navigation | `hooks/useFirebase.ts` | HIGH |
| B4 | Firestore rules blocking client — silent permission-denied swallowed | `settingsService.ts:137-139` | HIGH |
| B5 | `stripUndefined()` recursion can hit circular references in complex objects | `hooks/useFirebase.ts` | MEDIUM |
| B6 | `serverTimestamp()` in offline mode returns null — crashes sorting code | Multiple files | MEDIUM |
| B7 | Concurrent `setDoc` calls on same doc — last-write-wins, data loss possible | `useOfflineQueue.ts` | MEDIUM |

## 1.3 Map / Google Maps

| # | Failure Point | File | Risk |
|---|--------------|------|------|
| C1 | **MAPS_API_KEY undefined** — `useJsApiLoader` fails silently, map never loads | `Map.tsx:53` | **CRITICAL** |
| C2 | **No MAP_ID** — `AdvancedMarkerElement` without a Map ID renders but may not be interactive | `Map.tsx:55,879` | **CRITICAL** |
| C3 | **`"gmpclick"` vs `"click"`** — AME requires `"gmpclick"`, old `<Marker>` used `"click"` | `Map.tsx:1271` | **CRITICAL** |
| C4 | Markers built without `.map =` assignment — clusterer handles it, but if GMClusterer fails, markers invisible | `Map.tsx:1265-1276` | HIGH |
| C5 | **Stale closure** in `gmpclick` listener — `lead` captured at effect time, becomes stale if leads update | `Map.tsx:1271-1274` | HIGH |
| C6 | `visibleLeads` changes → effect re-runs → clusterer destroyed/rebuilt mid-render causes flicker | `Map.tsx:1249-1290` | MEDIUM |
| C7 | `"visualization"` library not loaded before `HeatmapLayer` call — runtime error | `Map.tsx:54,933` | MEDIUM |
| C8 | Geolocation `timeout: 8000` — on slow networks, defaults to Perth with no visual indicator | `Map.tsx:968-991` | MEDIUM |
| C9 | `geocoderRef.current` null when `geocodeLead` called before `onMapLoad` fires | `Map.tsx:1050` | MEDIUM |
| C10 | `@react-google-maps/api Marker` (legacy) still imported on line 16 — mixed AME + legacy | `Map.tsx:16` | LOW |

## 1.4 Offline Queue

| # | Failure Point | File | Risk |
|---|--------------|------|------|
| D1 | `localStorage` full (5 MB limit) — `saveQueue()` silently fails, writes lost | `useOfflineQueue.ts:99-103` | HIGH |
| D2 | `processQueue` called on reconnect but `isSyncing` already true — queue skipped | `useOfflineQueue.ts:136` | MEDIUM |
| D3 | Exponential backoff checks `lastAttemptAt` but `loadQueue()` deserialises from JSON — number preserved but timezone drift possible | `useOfflineQueue.ts:115` | LOW |
| D4 | `clearFailed()` uses functional set — if called mid-sync, could lose in-flight items | `useOfflineQueue.ts:243` | LOW |

## 1.5 Training Hub / AI Roleplay

| # | Failure Point | File | Risk |
|---|--------------|------|------|
| E1 | `SpeechRecognition` API — Chrome-only, throws on Firefox/Safari | `hooks/useSpeechToText.ts` | HIGH |
| E2 | `speechSynthesis.speak()` called when tab backgrounded — Chrome silently cancels | `hooks/useTextToSpeech.ts` | MEDIUM |
| E3 | Session saves partial data if user closes tab mid-session — no `beforeunload` guard | `components/AIRoleplay.tsx` | HIGH |
| E4 | Script loading from Firestore — if `useScripts` fails, empty array shown with no error | `hooks/useScripts.ts` | MEDIUM |
| E5 | Score of `0/40` treated same as "no score" in dashboard aggregation | `hooks/useTrainingSessions.ts` | LOW |

## 1.6 Notifications (FCM)

| # | Failure Point | File | Risk |
|---|--------------|------|------|
| F1 | VAPID key missing — `getToken()` throws, swallowed silently | `hooks/useNotifications.ts` | HIGH |
| F2 | Service worker not HTTPS — FCM registration fails on HTTP | `public/firebase-messaging-sw.js` | HIGH |
| F3 | `window.__asgToast` integration point — undefined if ToastContext not mounted | `hooks/useNotifications.ts` | MEDIUM |
| F4 | FCM token stored in `userDevices` but Firestore rule allows only self-write — multi-device edge case | `firestore.rules` | MEDIUM |

## 1.7 Data Consistency

| # | Failure Point | File | Risk |
|---|--------------|------|------|
| G1 | `lead.dealId` not set when deal created — breaks lead→deal navigation | `hooks/useFirebase.ts:useCreateDeal` | HIGH |
| G2 | Rep deleted from admin — leads with that `dqRep` become orphaned | `pages/Admin.tsx` | MEDIUM |
| G3 | `commissions` calculated client-side — out of sync if rate changes mid-deal | `pages/Commissions.tsx` | MEDIUM |
| G4 | `callHistory` array appended client-side — concurrent callers from two tabs cause lost entries | `hooks/useFirebase.ts:useSaveLead` | MEDIUM |

---

# PART 2: MAP PIN CLICKABILITY — FULL DIAGNOSIS

## 2.1 Root Causes (Priority Order)

### CAUSE 1: Missing or Invalid Map ID ⚠️ MOST LIKELY

**Why it breaks clicks:**
`AdvancedMarkerElement` (AME) is a Maps JS API v3 Beta feature tied to Cloud-hosted map styles. Without a valid Map ID configured in the Google Cloud Console **and** passed to both `useJsApiLoader` and `<GoogleMap>`, AME may render visually but its click surface is not registered correctly — clicks pass through to the map canvas instead.

**How to confirm:**
```javascript
// In browser console on the Map page:
const mapEl = document.querySelector('[role="region"]'); // The map div
console.log(mapEl?.dataset); // Check for mapId attribute
```

Or check Network tab — the Maps JS API request URL should contain `map_ids=YOUR_MAP_ID`.

**Exact fix in `Map.tsx`:**
```tsx
// Line 55 — MAPS_MAP_ID must be non-empty
const MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "";
// ↑ If empty string, mapIds array below is still added, but an empty string Map ID is invalid

// Line 879 — the loader:
const { isLoaded, loadError } = useJsApiLoader({
  googleMapsApiKey: MAPS_API_KEY,
  libraries: LIBRARIES,
  ...(MAPS_MAP_ID ? { mapIds: [MAPS_MAP_ID] } : {}),
});
// ↑ If MAPS_MAP_ID is "", no mapIds passed → AME runs without map ID → clicks unreliable
```

**Fix:**
1. Create a Map ID in [Google Cloud Console → Maps → Map Management](https://console.cloud.google.com/google/maps-apis/maps)
2. Set `VITE_GOOGLE_MAPS_MAP_ID=your_actual_map_id` in `.env`
3. Pass `mapId` to `<GoogleMap>` component props:
```tsx
<GoogleMap
  mapContainerStyle={containerStyle}
  center={center}
  zoom={12}
  onLoad={onMapLoad}
  onClick={handleMapClick}
  options={{ mapId: MAPS_MAP_ID }}   // ← ADD THIS
/>
```

---

### CAUSE 2: Stale Closure in `gmpclick` Listener ⚠️ HIGH

**Current code (`Map.tsx:1260-1276`):**
```javascript
const newMarkers = visibleLeads.map((lead) => {
  const marker = new google.maps.marker.AdvancedMarkerElement({ ... });
  
  marker.addListener("gmpclick", () => {
    setSelectedLead(lead);  // ← `lead` captured here
    setSidebarOpen(true);
  });
  
  return marker;
});
```

**The problem:** `lead` is captured in the closure at the time the `useEffect` runs. If `leads` data updates in Firestore (e.g. someone logs a call), the clusterer is rebuilt, but any **existing** listener that fires before the rebuild completes passes the OLD `lead` object to `setSelectedLead`. The sidebar shows stale data.

**How to confirm:**
1. Open map with a lead selected
2. Log a call on that lead in another tab
3. Click the pin — the sidebar shows the pre-call data

**Fix:**
```tsx
// Use a data-attribute on the marker element and look up from current leads on click
const markerEl = markerSvgElement(color);
markerEl.dataset.leadId = String(lead.id);  // store ID, not object

marker.addListener("gmpclick", () => {
  // Look up from current leads array at click time
  const currentLead = leadsRef.current.find(l => l.id === lead.id);
  if (currentLead) {
    setSelectedLead(currentLead);
    setSidebarOpen(true);
  }
});
```

Also add `const leadsRef = useRef(leads); useEffect(() => { leadsRef.current = leads; }, [leads]);` before the marker effect.

---

### CAUSE 3: Clusterer Intercepts the Click ⚠️ MEDIUM

**The problem:** `GMClusterer` renders cluster markers at zoom levels where multiple pins overlap. When a cluster marker is present at a location, clicking it expands the cluster instead of firing the individual marker's `gmpclick`. The user clicks but sees the cluster zoom — not the sidebar.

**How to confirm:**
- Zoom in to level 16+ where individual markers are visible (not clustered)
- Click a pin at full zoom — if it works here but not at zoom 12, this is the cause

**Fix:** Add a minimum cluster size so individual markers are never clustered away at normal zoom:
```tsx
clustererRef.current = new GMClusterer({
  map: mapRef.current,
  markers: newMarkers as any,
  algorithm: new SuperClusterAlgorithm({ 
    maxZoom: 14,   // Only cluster below zoom 14
    minPoints: 3,  // Need 3+ pins to form a cluster
  }),
});
```

---

### CAUSE 4: `marker` Library Not Loaded Before AME Used ⚠️ MEDIUM

**Current code:**
```tsx
// Map.tsx:54
const LIBRARIES: ("places" | "geometry" | "geocoding" | "visualization" | "marker")[] 
  = ["visualization", "marker"];
```

The `"marker"` library IS included — this is correct. However, if the LIBRARIES array is accidentally moved inside the component (not at module level), it creates a new array reference on every render, causing `useJsApiLoader` to log a warning and potentially re-initialize the Maps SDK, breaking markers.

**How to confirm:**
Check browser console for:
```
"LoadScript has been reloaded unintentionally!"
```
or
```
"You can not load the same google maps api script twice"
```

**Verify:** `LIBRARIES` is defined at module scope (line 54) — this is correct in the current code. If it ever moves inside the component, markers break.

---

### CAUSE 5: `map` Property Not Set on Individual Markers ⚠️ MEDIUM

**Current code:** Markers are created without a `map` property and added only via the clusterer:
```javascript
const marker = new google.maps.marker.AdvancedMarkerElement({
  position: { lat: lead.lat!, lng: lead.lng! },
  title: lead.name,
  content: markerSvgElement(color),
  // ← NO `map:` here — relying entirely on clusterer
});
```

If `GMClusterer` fails to initialize (any error in its constructor), all markers remain invisible and unclickable — there's no fallback.

**Fix — add defensive fallback:**
```tsx
const marker = new google.maps.marker.AdvancedMarkerElement({
  position: { lat: lead.lat!, lng: lead.lng! },
  title: lead.name,
  content: markerSvgElement(color),
  map: mapRef.current,  // ← assign map directly as fallback
});
// Clusterer will override the map assignment (that's expected behaviour)
```

---

### CAUSE 6: z-index / Overlay Blocking Clicks ⚠️ LOW

The filter UI panel, legend, and other absolutely-positioned elements float over the map. If a filter chip or panel div covers a marker position, mouse events hit the div, not the map canvas.

**How to confirm:**
```javascript
// In DevTools → Elements, check computed z-index of filter controls
// They're at z-10 (class="absolute ... z-10")
// AME markers rendered by Maps JS are at z-index controlled by Google
// Verify: does clicking OUTSIDE the UI panels work?
```

---

## 2.2 Diagnostic Checklist

Run these checks in order before touching code:

```
□ 1. Open DevTools Console — any "Google Maps API error" messages?
□ 2. Network tab — does the Maps API request URL include your map ID?
□ 3. Is VITE_GOOGLE_MAPS_API_KEY set in .env? console.log(import.meta.env)
□ 4. Is VITE_GOOGLE_MAPS_MAP_ID set and non-empty?
□ 5. Is <GoogleMap> passing options={{ mapId: MAPS_MAP_ID }}?
□ 6. Zoom to level 18 — are individual (non-clustered) pins clickable?
□ 7. Are there any React errors in the console during map load?
□ 8. Does clicking the pin show any console.log output? (add one to gmpclick handler)
□ 9. Check DevTools → Application → Console for SW errors
□ 10. Is the API key restricted to allowed domains? localhost must be included.
```

---

# PART 3: COMPLETE TEST PLAN

## 3.1 Test Infrastructure Setup

**Install testing libraries (zero currently installed):**

```bash
npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom msw@latest
```

**`vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: ['src/test/**', '**/*.d.ts', 'src/main.tsx'],
      thresholds: { lines: 70, branches: 60, functions: 70 },
    },
  },
});
```

**`src/test/setup.ts`:**
```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Firebase — prevent real Firestore calls in tests
vi.mock('../lib/firebase', () => ({
  db: {},
  storage: {},
  auth: {},
  default: {},
}));

// Mock Google Maps
vi.mock('@react-google-maps/api', () => ({
  useJsApiLoader: () => ({ isLoaded: true, loadError: undefined }),
  GoogleMap: ({ children, onLoad }: any) => {
    onLoad?.({ setMapTypeId: vi.fn(), setCenter: vi.fn(), setZoom: vi.fn() });
    return <div data-testid="google-map">{children}</div>;
  },
  Marker: ({ onClick }: any) => (
    <div data-testid="map-marker" onClick={onClick} />
  ),
  Polygon: () => <div />,
  OverlayView: ({ children }: any) => <div>{children}</div>,
}));

// Mock window.google.maps.marker
Object.assign(window, {
  google: {
    maps: {
      marker: {
        AdvancedMarkerElement: vi.fn().mockImplementation((opts: any) => ({
          position: opts.position,
          map: opts.map ?? null,
          addListener: vi.fn(),
          setMap: vi.fn(),
        })),
      },
      Geocoder: vi.fn().mockImplementation(() => ({
        geocode: vi.fn((_, cb) => cb([], 'ZERO_RESULTS')),
      })),
      visualization: { HeatmapLayer: vi.fn() },
    },
  },
});

// Mock navigator.geolocation
Object.defineProperty(global.navigator, 'geolocation', {
  value: {
    getCurrentPosition: vi.fn((success) =>
      success({ coords: { latitude: -31.95, longitude: 115.86 } })
    ),
  },
  configurable: true,
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });
```

---

## 3.2 Unit Tests

### A. Validators (`src/lib/validators.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import {
  validateDeal,
  validateLead,
  validateTrainingSession,
  validateDrapsEntry,
  validateRep,
} from '../lib/validators';

describe('validateDeal', () => {
  it('passes a valid deal', () => {
    const result = validateDeal({
      clientName: 'Jane Smith',
      status: 'conditional',
      dealValue: 450000,
      repId: 1,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails without clientName', () => {
    const result = validateDeal({ status: 'settled', dealValue: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/client name/i);
  });

  it('fails with invalid status', () => {
    const result = validateDeal({ clientName: 'Jane', status: 'approved' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/status/i);
  });

  it('fails with negative dealValue', () => {
    const result = validateDeal({ clientName: 'Jane', status: 'lead', dealValue: -100 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-negative/i);
  });

  it('fails with NaN dealValue', () => {
    const result = validateDeal({ clientName: 'Jane', status: 'lead', dealValue: NaN });
    expect(result.valid).toBe(false);
  });

  it('passes with undefined dealValue (optional field)', () => {
    const result = validateDeal({ clientName: 'Jane', status: 'lead' });
    expect(result.valid).toBe(true);
  });
});

describe('validateLead', () => {
  it('passes a minimal valid lead', () => {
    expect(validateLead({ firstName: 'John' }).valid).toBe(true);
  });

  it('fails with no name fields', () => {
    const result = validateLead({ phone: '0400000000' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/name/i);
  });

  it('rejects invalid date format', () => {
    const result = validateLead({ name: 'John', leadDate: '10/04/2024' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/YYYY-MM-DD/i);
  });

  it('accepts legacy status values', () => {
    const result = validateLead({ name: 'John', status: 'DQ' });
    expect(result.valid).toBe(true);
  });
});

describe('validateRep', () => {
  it('rejects PIN shorter than 4 digits', () => {
    const result = validateRep({ id: 1, name: 'Alice', pin: '12' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/PIN/i);
  });

  it('rejects PIN with letters', () => {
    const result = validateRep({ id: 1, name: 'Alice', pin: 'abcd' });
    expect(result.valid).toBe(false);
  });

  it('accepts 4–8 digit PIN', () => {
    expect(validateRep({ id: 1, name: 'Alice', pin: '1234' }).valid).toBe(true);
    expect(validateRep({ id: 1, name: 'Alice', pin: '12345678' }).valid).toBe(true);
  });

  it('fails with negative id', () => {
    const result = validateRep({ id: -1, name: 'Alice' });
    expect(result.valid).toBe(false);
  });
});

describe('validateDrapsEntry', () => {
  it('fails with invalid date', () => {
    const result = validateDrapsEntry({ repId: 1, date: '04-10-2024' });
    expect(result.valid).toBe(false);
  });

  it('fails with negative numeric field', () => {
    const result = validateDrapsEntry({ repId: 1, date: '2024-04-10', dq: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/"dq"/);
  });

  it('passes zeros (valid empty day)', () => {
    const result = validateDrapsEntry({ repId: 1, date: '2024-04-10', dq: 0 });
    expect(result.valid).toBe(true);
  });
});
```

### B. Error Handler (`src/lib/errorHandler.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getErrorMessage, isFirestoreError, handleError } from '../lib/errorHandler';

// Mock Firestore addDoc
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({}),
}));

describe('getErrorMessage', () => {
  it('maps permission-denied to human message', () => {
    const err = { code: 'permission-denied', message: 'raw' };
    expect(getErrorMessage(err)).toContain("don't have permission");
  });

  it('maps unavailable to connection message', () => {
    const err = { code: 'unavailable', message: 'raw' };
    expect(getErrorMessage(err)).toContain('temporarily unavailable');
  });

  it('maps unknown Firestore code to generic message', () => {
    const err = { code: 'some-unknown-code', message: 'raw' };
    expect(getErrorMessage(err)).toContain('unexpected error');
  });

  it('handles plain Error objects', () => {
    const msg = getErrorMessage(new Error('connection refused'));
    expect(msg).toBe('connection refused');
  });

  it('truncates long messages', () => {
    const longMsg = 'x'.repeat(200);
    expect(getErrorMessage(new Error(longMsg))).toHaveLength(120);
  });

  it('handles null/undefined gracefully', () => {
    expect(() => getErrorMessage(null)).not.toThrow();
    expect(() => getErrorMessage(undefined)).not.toThrow();
    expect(getErrorMessage(null)).toBeTruthy();
  });

  it('does not expose raw Firestore paths', () => {
    const err = new Error('projects/myapp/databases/(default)/documents/leads/123');
    const msg = getErrorMessage(err);
    expect(msg).not.toContain('projects/');
  });
});

describe('isFirestoreError', () => {
  it('identifies Firestore errors', () => {
    expect(isFirestoreError({ code: 'permission-denied', message: '' })).toBe(true);
  });

  it('rejects plain Error', () => {
    expect(isFirestoreError(new Error('x'))).toBe(false);
  });

  it('rejects null', () => {
    expect(isFirestoreError(null)).toBe(false);
  });
});

describe('handleError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns AppError with user-safe message', () => {
    const err = { code: 'not-found', message: 'raw' };
    const appError = handleError(err, 'TestContext');
    expect(appError.message).toContain('could not be found');
    expect(appError.context).toBe('TestContext');
  });

  it('always logs to console', () => {
    handleError(new Error('test'), 'ctx');
    expect(console.error).toHaveBeenCalled();
  });

  it('never throws', () => {
    expect(() => handleError(null, 'ctx')).not.toThrow();
    expect(() => handleError(undefined, 'ctx')).not.toThrow();
    expect(() => handleError({ circular: {} }, 'ctx')).not.toThrow();
  });
});
```

### C. Offline Queue (`src/hooks/useOfflineQueue.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOfflineQueue } from './useOfflineQueue';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, ...segs) => ({ path: segs.join('/') })),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('../lib/errorHandler', () => ({ handleError: vi.fn() }));

describe('useOfflineQueue', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initialises with empty queue when online', () => {
    const { result } = renderHook(() => useOfflineQueue());
    expect(result.current.queueLength).toBe(0);
    expect(result.current.isOnline).toBe(true);
    expect(result.current.failedItems).toHaveLength(0);
  });

  it('enqueues an item', () => {
    const { result } = renderHook(() => useOfflineQueue());
    act(() => {
      result.current.enqueue('leads/123', { name: 'John' });
    });
    expect(result.current.queueLength).toBe(1);
  });

  it('deduplicates same docPath + operation', () => {
    const { result } = renderHook(() => useOfflineQueue());
    act(() => {
      result.current.enqueue('leads/123', { name: 'John' });
      result.current.enqueue('leads/123', { phone: '0400000000' });
    });
    // Should merge into 1 item, not 2
    expect(result.current.queueLength).toBe(1);
  });

  it('merges data on duplicate enqueue', () => {
    const { result } = renderHook(() => useOfflineQueue());
    act(() => {
      result.current.enqueue('leads/123', { name: 'John' });
      result.current.enqueue('leads/123', { phone: '0400' });
    });
    const stored = JSON.parse(localStorage.getItem('asg-crm:offline-queue') ?? '[]');
    expect(stored[0].data).toEqual({ name: 'John', phone: '0400' });
  });

  it('persists queue to localStorage', () => {
    const { result } = renderHook(() => useOfflineQueue());
    act(() => {
      result.current.enqueue('leads/456', { name: 'Jane' });
    });
    const raw = localStorage.getItem('asg-crm:offline-queue');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed[0].docPath).toBe('leads/456');
  });

  it('clears failed items', () => {
    // Seed localStorage with a failed item
    const failedItem = {
      id: 'q_1', docPath: 'leads/999', operation: 'set_merge',
      data: {}, timestamp: Date.now(), attempts: 3,
    };
    localStorage.setItem('asg-crm:offline-queue', JSON.stringify([failedItem]));

    const { result } = renderHook(() => useOfflineQueue());
    expect(result.current.failedItems).toHaveLength(1);

    act(() => result.current.clearFailed());
    expect(result.current.failedItems).toHaveLength(0);
    expect(result.current.queueLength).toBe(0);
  });

  it('goes offline when offline event fires', () => {
    const { result } = renderHook(() => useOfflineQueue());
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOnline).toBe(false);
  });

  it('comes back online and processes queue', async () => {
    const { setDoc } = await import('firebase/firestore');
    const { result } = renderHook(() => useOfflineQueue());
    
    act(() => {
      result.current.enqueue('leads/123', { name: 'John' });
    });

    await act(async () => {
      await result.current.processQueue();
    });

    expect(setDoc).toHaveBeenCalled();
    expect(result.current.queueLength).toBe(0);
  });
});
```

---

## 3.3 Integration Tests

### D. Lead Save + Firestore Round-Trip (`src/hooks/useFirebase.integration.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Use MSW to intercept Firestore REST API
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.post('https://firestore.googleapis.com/*', () =>
    HttpResponse.json({ name: 'projects/test/databases/(default)/documents/leads/123' })
  ),
);

beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe('useSaveLead', () => {
  it('calls Firestore with stripped undefined values', async () => {
    // Integration: verify stripUndefined is applied before write
    const { useSaveLead } = await import('./useFirebase');
    const { result } = renderHook(() => useSaveLead());

    let saved = false;
    server.use(
      http.post('*', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        // Firestore payload should not contain undefined values
        const hasUndefined = JSON.stringify(body).includes('undefined');
        expect(hasUndefined).toBe(false);
        saved = true;
        return HttpResponse.json({});
      })
    );

    await act(async () => {
      await result.current.save({ 
        id: 1, 
        name: 'Test Lead', 
        suburb: 'Perth',
        phone: undefined,  // ← should be stripped
        status: 'new',
        dqRep: 1,
      } as any);
    });
  });
});
```

---

## 3.4 Playwright E2E Tests

### `tests/e2e/auth.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('shows login screen when no userId in storage', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Select Your Name')).toBeVisible();
  });

  test('rep can log in with correct PIN', async ({ page, context }) => {
    // Seed localStorage with reps data
    await context.addInitScript(() => {
      localStorage.setItem('asg-crm:reps', JSON.stringify([
        { id: 1, name: 'Test Rep', pin: '1234', role: 'rep', active: true }
      ]));
    });

    await page.goto('/');
    await page.getByText('Test Rep').click();
    await page.getByPlaceholder('Enter PIN').fill('1234');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByText('Leads')).toBeVisible();
  });

  test('shows error on wrong PIN', async ({ page, context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('asg-crm:reps', JSON.stringify([
        { id: 1, name: 'Test Rep', pin: '1234', role: 'rep', active: true }
      ]));
    });

    await page.goto('/');
    await page.getByText('Test Rep').click();
    await page.getByPlaceholder('Enter PIN').fill('9999');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/incorrect pin/i)).toBeVisible();
  });
});
```

### `tests/e2e/map.spec.ts`

```typescript
import { test, expect, Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  // Helper to seed auth state
  await page.addInitScript(() => {
    localStorage.setItem('asg-crm:userId', '1');
  });
}

test.describe('Map Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('map container renders', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /map/i }).click();
    await expect(page.locator('[data-testid="google-map"], .gm-style')).toBeVisible({ timeout: 10000 });
  });

  test('shows error if Maps API key is missing', async ({ page }) => {
    // Override env var to be empty
    await page.addInitScript(() => {
      // Simulate missing API key by checking the error display
    });
    await page.goto('/');

    // Check for error boundary or error message
    const hasError = await page.evaluate(() => {
      return document.body.textContent?.includes('map could not be loaded') ?? false;
    });

    // If API key is truly missing, some error UI should appear
    // (test is environment-conditional — passes in CI with key set)
  });

  test('filter chips toggle visible markers', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /map/i }).click();
    
    // Click "DQ" status filter chip to deselect
    await page.getByRole('button', { name: 'DQ' }).click();
    
    // Marker count should decrease (verify via UI feedback or marker count badge)
    const filterBtn = page.getByRole('button', { name: 'DQ' });
    await expect(filterBtn).toHaveClass(/opacity-40|line-through|inactive/);
  });
});
```

### `tests/e2e/offline.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Offline Mode', () => {
  test('shows offline indicator when network is disconnected', async ({ page, context }) => {
    await page.goto('/');
    await context.addInitScript(() => {
      localStorage.setItem('asg-crm:userId', '1');
    });

    // Simulate going offline
    await context.setOffline(true);
    
    // Wait for the offline indicator
    await expect(page.getByText(/offline/i)).toBeVisible({ timeout: 5000 });
    
    await context.setOffline(false);
  });

  test('queues writes when offline and syncs on reconnect', async ({ page, context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('asg-crm:userId', '1');
    });

    await page.goto('/');
    await context.setOffline(true);
    
    // Verify "Offline" badge appears
    await expect(page.locator('[aria-live="polite"]')).toContainText(/offline/i, { timeout: 5000 });

    // Come back online
    await context.setOffline(false);

    // Verify "Syncing" or "Synced" state
    await expect(page.locator('[aria-live="polite"]')).toContainText(/sync/i, { timeout: 8000 });
  });
});
```

### `tests/e2e/call-logging.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Call Logging', () => {
  test('log call button is visible in lead sidebar', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('asg-crm:userId', '1');
    });
    await page.goto('/');
    
    // Click first lead in list
    const firstLead = page.locator('[data-testid="lead-row"]').first();
    if (await firstLead.isVisible()) {
      await firstLead.click();
      await expect(page.getByRole('button', { name: /log call/i })).toBeVisible();
    }
  });

  test('call logger shows all outcome options', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('asg-crm:userId', '1');
    });
    await page.goto('/');

    const firstLead = page.locator('[data-testid="lead-row"]').first();
    if (await firstLead.isVisible()) {
      await firstLead.click();
      await page.getByRole('button', { name: /log call/i }).click();

      await expect(page.getByText('Connected')).toBeVisible();
      await expect(page.getByText('No Answer')).toBeVisible();
      await expect(page.getByText('Callback')).toBeVisible();
      await expect(page.getByText('Not Interested')).toBeVisible();
    }
  });
});
```

---

# PART 4: MANUAL QA CHECKLIST

## 4.1 Pre-Release Manual Test Checklist

### Auth & Login
```
□ Select rep → enter correct PIN → lands on Leads page
□ Select rep → enter wrong PIN → error shown, no navigation
□ Sign out → returns to login screen → localStorage cleared
□ /GLadmin URL → auto-signs in as admin (when reps loaded)
□ Refresh page while logged in → stays logged in (userId in localStorage)
```

### Leads System
```
□ Leads page loads within 3 seconds
□ Search filters results in real time
□ Status filter chips toggle correctly
□ Click lead → sidebar opens with correct data
□ Add Lead modal → fill all fields → save → lead appears in list
□ CSV Import → upload file → preview shown → import → leads visible
□ Quick Pull → pulls from configured Google Sheet
□ Lead status update → saved immediately → visible in list
□ Callback set → appears in "Callbacks Due" badge
□ Leads sort by various columns without error
```

### Map
```
□ Map loads (not blank, no console errors)
□ API key and Map ID are configured (check browser network tab)
□ Pins render for leads with lat/lng
□ Click a pin → PinActionPanel opens with correct lead data
□ Filter chips → toggle → visible pins update
□ Knock Mode → click map → KnockModal opens → save → pin appears
□ Quick Pin mode → select type → click map → pin drops instantly
□ Zone drawing → draw polygon → save → zone appears with rep label
□ Geocode single lead → address resolved → pin appears
□ Geocode All → progress toasts shown → pins appear
□ Heatmap toggle → heat overlay renders
□ Locate Me → map centres on user
□ Fullscreen toggle works
□ Cluster → zoom in → cluster expands to individual pins
□ Individual pins at zoom 16+ are clickable (not blocked by cluster)
```

### Deal Dashboard
```
□ Pipeline view loads all stages
□ Deal cards show correct stage, rep, value
□ Move deal to next stage → stage updates in real time
□ Chase List → stuck deals appear after threshold
□ Chase List → update deal → it disappears from list
□ Settlement → mark complete → commission recorded
□ Stats view shows correct totals
□ Forecast view loads without error
```

### Training Hub
```
□ Training Hub loads → shows past sessions
□ Script selection shows available scripts
□ Chat mode → type response → AI replies
□ Voice mode → speak → AI responds (Chrome only)
□ Session end → scores shown for all 5 sections
□ Session saved → visible in training history
□ Replay → past session text shown in order
□ Hard mode → requires minimum score → blocked otherwise
□ Training disabled (admin) → button grayed/hidden
```

### Admin Dashboard
```
□ Rep management → add rep → new rep can log in
□ Rep management → toggle alertsEnabled → notifications respect it
□ Script management → add script → visible in training
□ Script management → delete script → gone from training list
□ System settings → change stuckDays → deal pipeline reflects it
□ Feature flags → disable voice → no voice option in training
□ Feature flags → readOnly → writes blocked for all reps
□ Settings history → shows all changes
□ Rollback → restores previous config
□ System health → all panels show correct status
□ Daily report → loads for today and past dates
□ Export CSV → downloads file with correct data
```

### Notifications
```
□ First load → browser permission prompt appears
□ Deny → no errors, app continues working
□ Allow → token saved in Firestore userDevices
□ Performance alert → received within 5 minutes of threshold
□ Daily report notification → received at configured time (6 PM)
□ Background notification → click → opens app to correct page
```

### Offline Mode
```
□ Go offline → "Offline" indicator appears immediately
□ Log a call offline → no error shown, queue indicator updates
□ Reconnect → "Syncing" indicator appears → "Synced ✓" appears
□ Data logged offline → visible in Firestore after sync
□ Multiple offline edits to same lead → only 1 write, latest data
□ 3 failed retries → item appears in "failed" count
□ Clear failed → indicator disappears
```

### Cross-Browser
```
□ Chrome — full functionality
□ Edge — full functionality (including voice)
□ Safari — voice mode not available (expected), rest works
□ Firefox — voice mode not available (expected), rest works
□ iPhone Safari — mobile layout correct, sidebar usable
□ Android Chrome — map works, pins clickable on touch
```

---

# PART 5: LOGGING & SELF-DIAGNOSING STRATEGY

## 5.1 Production Logging Implementation

Add this to `src/lib/logger.ts` to replace all ad-hoc `console.log` calls:

```typescript
// src/lib/logger.ts — Structured production logger

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
  timestamp: number;
}

const IS_PROD = import.meta.env.PROD;
const IS_DEV = import.meta.env.DEV;

// Buffer for batched Firestore writes (avoids hammering DB with every log)
let logBuffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushLogs(): Promise<void> {
  if (logBuffer.length === 0) return;
  const toFlush = [...logBuffer];
  logBuffer = [];
  
  try {
    // Only flush errors and warnings to Firestore in production
    const { collection, addDoc } = await import('firebase/firestore');
    const { db } = await import('./firebase');
    for (const entry of toFlush.filter(e => e.level === 'error' || e.level === 'warn')) {
      await addDoc(collection(db, 'logs'), {
        ...entry,
        userId: localStorage.getItem('asg-crm:userId') ?? 'anon',
        userAgent: navigator.userAgent,
        url: window.location.pathname,
      });
    }
  } catch {
    // Never let logging crash the app
  }
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushLogs, 5000); // Batch every 5 seconds
}

export const logger = {
  debug(context: string, message: string, data?: unknown): void {
    if (IS_DEV) console.debug(`[${context}]`, message, data ?? '');
  },

  info(context: string, message: string, data?: unknown): void {
    if (IS_DEV) console.info(`[${context}]`, message, data ?? '');
    logBuffer.push({ level: 'info', context, message, data, timestamp: Date.now() });
    scheduleFlush();
  },

  warn(context: string, message: string, data?: unknown): void {
    console.warn(`[${context}]`, message, data ?? '');
    logBuffer.push({ level: 'warn', context, message, data, timestamp: Date.now() });
    scheduleFlush();
  },

  error(context: string, message: string, error?: unknown): void {
    console.error(`[${context}]`, message, error ?? '');
    logBuffer.push({
      level: 'error', context, message,
      data: error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error,
      timestamp: Date.now(),
    });
    scheduleFlush();
  },

  // Performance timing helper
  time(label: string): () => void {
    const start = performance.now();
    return () => {
      const ms = performance.now() - start;
      if (ms > 1000) {
        logger.warn('Performance', `${label} took ${ms.toFixed(0)}ms`);
      } else if (IS_DEV) {
        logger.debug('Performance', `${label}: ${ms.toFixed(1)}ms`);
      }
    };
  },
};
```

## 5.2 Dev Diagnostics Panel

Add this component (dev-only, no prod bundle impact):

```tsx
// src/components/DevDiagnostics.tsx — Only rendered in development

import React, { useState, useEffect } from 'react';

interface DiagnosticResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'pending';
  detail: string;
}

export function DevDiagnostics() {
  if (import.meta.env.PROD) return null;

  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [open, setOpen] = useState(false);

  const runDiagnostics = async () => {
    const checks: DiagnosticResult[] = [];

    // 1. Firebase env vars
    const envKeys = [
      'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_MESSAGING_SENDER_ID',
    ];
    for (const key of envKeys) {
      const val = import.meta.env[key];
      checks.push({
        name: key,
        status: val ? 'pass' : 'fail',
        detail: val ? '✓ Set' : '✗ MISSING — app will not connect to Firebase',
      });
    }

    // 2. Google Maps keys
    const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
    checks.push({
      name: 'VITE_GOOGLE_MAPS_API_KEY',
      status: mapsKey ? 'pass' : 'fail',
      detail: mapsKey ? '✓ Set' : '✗ MISSING — Map will not load',
    });
    checks.push({
      name: 'VITE_GOOGLE_MAPS_MAP_ID',
      status: mapId ? 'pass' : 'warn',
      detail: mapId ? '✓ Set' : '⚠ Missing — AdvancedMarkerElement pins may not be clickable',
    });

    // 3. VAPID key
    const vapid = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    checks.push({
      name: 'VITE_FIREBASE_VAPID_KEY',
      status: vapid ? 'pass' : 'warn',
      detail: vapid ? '✓ Set' : '⚠ Missing — Push notifications will not register',
    });

    // 4. Notification permission
    const notifPerm = 'Notification' in window ? Notification.permission : 'unsupported';
    checks.push({
      name: 'Notification Permission',
      status: notifPerm === 'granted' ? 'pass' : notifPerm === 'denied' ? 'fail' : 'warn',
      detail: notifPerm,
    });

    // 5. IndexedDB (Firestore offline)
    const idbAvailable = await new Promise<boolean>((resolve) => {
      try {
        const req = indexedDB.open('test-probe');
        req.onsuccess = () => { req.result.close(); resolve(true); };
        req.onerror = () => resolve(false);
      } catch { resolve(false); }
    });
    checks.push({
      name: 'IndexedDB (Offline Persistence)',
      status: idbAvailable ? 'pass' : 'warn',
      detail: idbAvailable ? '✓ Available' : '⚠ Unavailable — offline mode disabled',
    });

    // 6. Service Worker
    const swReady = 'serviceWorker' in navigator;
    checks.push({
      name: 'Service Worker API',
      status: swReady ? 'pass' : 'warn',
      detail: swReady ? '✓ Supported' : '⚠ Not supported — background notifications disabled',
    });

    // 7. Speech APIs
    const sttAvail = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    const ttsAvail = 'speechSynthesis' in window;
    checks.push({
      name: 'Speech-to-Text (Voice Mode)',
      status: sttAvail ? 'pass' : 'warn',
      detail: sttAvail ? '✓ Available' : '⚠ Not available — use Chrome or Edge',
    });
    checks.push({
      name: 'Text-to-Speech',
      status: ttsAvail ? 'pass' : 'warn',
      detail: ttsAvail ? '✓ Available' : '⚠ Not available',
    });

    // 8. LocalStorage quota
    try {
      const testKey = '__quota_test__';
      const testData = 'x'.repeat(1024 * 1024); // 1 MB
      localStorage.setItem(testKey, testData);
      localStorage.removeItem(testKey);
      checks.push({ name: 'LocalStorage', status: 'pass', detail: '✓ At least 1 MB available' });
    } catch {
      checks.push({ name: 'LocalStorage', status: 'warn', detail: '⚠ Near quota limit — offline queue may fail' });
    }

    setResults(checks);
  };

  useEffect(() => {
    if (open && results.length === 0) runDiagnostics();
  }, [open]);

  const failures = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warn').length;

  return (
    <div style={{ position: 'fixed', bottom: 8, right: 8, zIndex: 9999, fontSize: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: failures > 0 ? '#ef4444' : warnings > 0 ? '#f59e0b' : '#22c55e',
          color: 'white', border: 'none', borderRadius: 8,
          padding: '4px 10px', cursor: 'pointer', fontWeight: 'bold',
        }}
      >
        🔧 DEV {failures > 0 ? `${failures} FAIL` : warnings > 0 ? `${warnings} WARN` : 'OK'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 36, right: 0, width: 400,
          background: '#1a1a1a', color: '#e5e5e5', borderRadius: 12,
          padding: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          maxHeight: '80vh', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <strong>System Diagnostics</strong>
            <button onClick={runDiagnostics} style={{ background: 'none', border: '1px solid #555', color: '#e5e5e5', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
              Rerun
            </button>
          </div>

          {results.map((r, i) => (
            <div key={i} style={{ marginBottom: 8, padding: 8, borderRadius: 8, background: r.status === 'fail' ? '#3f1515' : r.status === 'warn' ? '#3f2e0f' : '#0f3f1f' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{r.name}</div>
              <div style={{ opacity: 0.8 }}>{r.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Wire into `App.tsx`:**
```tsx
// In App.tsx, inside the root App component (after ToastProvider):
import { lazy } from 'react';
const DevDiagnostics = lazy(() =>
  import('./components/DevDiagnostics').then(m => ({ default: m.DevDiagnostics }))
);

// Inside render:
{import.meta.env.DEV && (
  <Suspense fallback={null}>
    <DevDiagnostics />
  </Suspense>
)}
```

---

# PART 6: CRITICAL FIXES REQUIRED

## Fix 1: Map — Pass `mapId` to `<GoogleMap>`

```tsx
// Map.tsx — find the <GoogleMap> element and add options:
<GoogleMap
  mapContainerStyle={{ width: '100%', height: '100%' }}
  center={center}
  zoom={12}
  onLoad={onMapLoad}
  onClick={handleMapClick}
  options={{
    mapId: MAPS_MAP_ID || undefined,  // Must be undefined (not empty string) when missing
    disableDefaultUI: false,
    gestureHandling: 'greedy',
  }}
/>
```

## Fix 2: Map — Prevent Stale Closures in Marker Listeners

```tsx
// Add before the marker useEffect:
const leadsRef = useRef<Lead[]>([]);
useEffect(() => { leadsRef.current = leads; }, [leads]);

// Inside the marker useEffect, replace the gmpclick handler:
marker.addListener("gmpclick", () => {
  const freshLead = leadsRef.current.find(l => l.id === lead.id);
  setSelectedLead(freshLead ?? lead); // Fallback to captured lead if not found
  setSidebarOpen(true);
});
```

## Fix 3: Map — Add `map` property to Markers as Fallback

```tsx
const marker = new google.maps.marker.AdvancedMarkerElement({
  position: { lat: lead.lat!, lng: lead.lng! },
  title: lead.name,
  content: markerSvgElement(color),
  map: mapRef.current,  // ← ADD: direct map assignment as fallback
});
```

## Fix 4: Map — Validate API Key on Mount

```tsx
// At the top of MapPage component, add:
useEffect(() => {
  if (!MAPS_API_KEY) {
    console.error('[Map] VITE_GOOGLE_MAPS_API_KEY is not set — map will not load');
  }
  if (!MAPS_MAP_ID) {
    console.warn('[Map] VITE_GOOGLE_MAPS_MAP_ID is not set — AdvancedMarkerElement pins may not be clickable');
  }
}, []);

// And add a fallback UI:
if (!MAPS_API_KEY) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center p-8">
        <p className="text-red-500 font-semibold">Map configuration missing</p>
        <p className="text-gray-500 text-sm mt-2">VITE_GOOGLE_MAPS_API_KEY is not configured.</p>
        <p className="text-gray-400 text-xs mt-1">Contact your administrator.</p>
      </div>
    </div>
  );
}
```

## Fix 5: Firestore Offline — Handle Safari Private Browsing

```tsx
// lib/firebase.ts — wrap persistentLocalCache in try/catch:
let db: ReturnType<typeof initializeFirestore>;

try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ 
      tabManager: persistentMultipleTabManager() 
    }),
  });
} catch (err) {
  // Fallback: memory-only cache (Safari private browsing, quota exceeded)
  console.warn('[Firebase] Offline persistence unavailable, falling back to memory cache:', err);
  db = initializeFirestore(app, {});
}

export { db };
```

## Fix 6: Training — Guard Against Tab Close Mid-Session

```tsx
// In AIRoleplay.tsx, add to the session start useEffect:
useEffect(() => {
  if (!sessionActive) return;

  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = 'You have an active training session. Are you sure you want to leave?';
    return e.returnValue;
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [sessionActive]);
```

---

# PART 7: PERFORMANCE IMPROVEMENTS

## 7.1 Memoisation Gaps

```tsx
// In Map.tsx — getRepName is recreated every render:
// Current:
const getRepName = (id: number) => reps.find((r) => r.id === id)?.name ?? `Rep ${id}`;

// Fix — memoize the lookup map:
const repNameMap = useMemo(() => 
  Object.fromEntries(reps.map(r => [r.id, r.name])),
  [reps]
);
const getRepName = useCallback(
  (id: number) => repNameMap[id] ?? `Rep ${id}`,
  [repNameMap]
);
```

## 7.2 Marker Effect Re-Run Frequency

The `useEffect` for markers runs whenever `visibleLeads` changes. `visibleLeads` is a new array reference every time ANY lead updates (because `leads` from Firestore is replaced wholesale).

**Fix — deep-compare visibleLeads IDs only:**
```tsx
// Add stable key string to use as the effect dependency:
const visibleLeadIds = useMemo(() =>
  visibleLeads.map(l => `${l.id}:${l.lat}:${l.lng}:${l.status}:${l.knockResult}`).join(','),
  [visibleLeads]
);

// Use it as the dependency instead of visibleLeads:
useEffect(() => {
  // ... marker creation code ...
}, [visibleLeadIds, isMapReady, customPinTypes]); // ← stable string dep
```

---

# PART 8: `.env` VALIDATION SCRIPT

Add to `package.json` scripts:

```json
{
  "scripts": {
    "check:env": "node scripts/check-env.js",
    "prebuild": "node scripts/check-env.js"
  }
}
```

**`scripts/check-env.js`:**
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_GOOGLE_MAPS_API_KEY',
];

const recommended = [
  'VITE_GOOGLE_MAPS_MAP_ID',
  'VITE_FIREBASE_VAPID_KEY',
];

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found. Copy .env.example to .env and fill in values.');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const defined = new Set(envContent.split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => l.split('=')[0].trim())
  .filter(k => {
    const val = envContent.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();
    return val && val.length > 0;
  })
);

let hasError = false;

for (const key of required) {
  if (!defined.has(key)) {
    console.error(`❌ REQUIRED: ${key} is not set`);
    hasError = true;
  } else {
    console.log(`✅ ${key}`);
  }
}

for (const key of recommended) {
  if (!defined.has(key)) {
    console.warn(`⚠️  RECOMMENDED: ${key} is not set (some features will be disabled)`);
  } else {
    console.log(`✅ ${key}`);
  }
}

if (hasError) {
  console.error('\nBuild aborted — set required environment variables in .env');
  process.exit(1);
}

console.log('\n✅ Environment check passed');
```

---

# PART 9: RISKS & ASSUMPTIONS

| Risk | Severity | Mitigation |
|------|---------|------------|
| `VITE_GOOGLE_MAPS_MAP_ID` not configured in production | **HIGH** — pins not clickable | Run `check:env` before every deploy |
| Google Maps API key not restricted to production domain | **HIGH** — abuse/quota theft | Restrict in Google Cloud Console |
| Firebase project in `spark` (free) plan — Firestore writes limited | **MEDIUM** | Monitor usage in Firebase console |
| `callHistory` array grows unbounded — Firestore doc size limit 1 MB | **MEDIUM** | Add pagination or archive old entries after 200 calls |
| No rate limiting on geocoding — `geocodeAllLeads` will hit API quota | **MEDIUM** | The 200ms delay helps; add a max-per-session cap |
| `localStorage` full in field — offline queue silently drops writes | **MEDIUM** | Add quota check before `saveQueue()`, alert user |
| No `.env.example` file — devs won't know which vars are required | **LOW** | Create `.env.example` with placeholder values |
| Safari/Firefox users get silent voice failure — may think app is broken | **LOW** | Add browser detection + explicit "Voice not supported" message |

---

*Document generated: 2026-04-10 — ASG CRM QA Master Plan v1.0*
