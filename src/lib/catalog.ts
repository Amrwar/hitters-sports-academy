/** Static catalogues shared by validation, services and UI. */

export const FACILITIES = [
  { key: "parking", label: "Parking" },
  { key: "showers", label: "Showers" },
  { key: "lockers", label: "Lockers" },
  { key: "cafe", label: "Café" },
  { key: "pro_shop", label: "Pro shop" },
  { key: "coaching", label: "Coaching" },
  { key: "physio", label: "Physio" },
  { key: "kids_area", label: "Kids area" },
  { key: "equipment_rental", label: "Racket & ball rental" },
  { key: "indoor_ac", label: "Indoor air conditioning" },
  { key: "lounge", label: "Lounge" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "prayer_room", label: "Prayer room" },
  { key: "accessible", label: "Wheelchair accessible" },
] as const;

export type FacilityKey = (typeof FACILITIES)[number]["key"];
export const FACILITY_KEYS = FACILITIES.map((f) => f.key) as [FacilityKey, ...FacilityKey[]];
export const facilityLabel = (key: string) => FACILITIES.find((f) => f.key === key)?.label ?? key;

export const COURT_TYPES = [
  { value: "INDOOR", label: "Indoor" },
  { value: "OUTDOOR", label: "Outdoor" },
  { value: "PANORAMIC", label: "Panoramic" },
] as const;

export const COURT_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "MAINTENANCE", label: "Under maintenance" },
  { value: "INACTIVE", label: "Inactive" },
] as const;

export const LOCATION_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "COMING_SOON", label: "Coming soon" },
  { value: "INACTIVE", label: "Inactive" },
] as const;

export const PRICING_KINDS = [
  { value: "PEAK", label: "Peak hours", hint: "Higher rate during busy hours" },
  { value: "OFF_PEAK", label: "Off-peak", hint: "Lower rate during quiet hours" },
  { value: "WEEKEND", label: "Weekend", hint: "Applies on the selected days" },
  { value: "MEMBERSHIP_DISCOUNT", label: "Membership discount", hint: "Discount for members of a tier" },
  { value: "CUSTOM", label: "Custom", hint: "Any other adjustment" },
] as const;

export const PREFERRED_TIMES = [
  { key: "weekday_morning", label: "Weekday mornings" },
  { key: "weekday_afternoon", label: "Weekday afternoons" },
  { key: "weekday_evening", label: "Weekday evenings" },
  { key: "weekend_morning", label: "Weekend mornings" },
  { key: "weekend_afternoon", label: "Weekend afternoons" },
  { key: "weekend_evening", label: "Weekend evenings" },
] as const;
export const PREFERRED_TIME_KEYS = PREFERRED_TIMES.map((t) => t.key) as [string, ...string[]];
export const preferredTimeLabel = (key: string) => PREFERRED_TIMES.find((t) => t.key === key)?.label ?? key;

export const MATCH_TYPES = [
  { value: "ANY", label: "Any" },
  { value: "FRIENDLY", label: "Friendly" },
  { value: "COMPETITIVE", label: "Competitive" },
] as const;

export const TRAINING_KINDS = [
  { value: "PRIVATE", label: "Private session" },
  { value: "PROGRAM", label: "Program session" },
  { value: "CLINIC", label: "Clinic" },
  { value: "ASSESSMENT", label: "Assessment" },
] as const;

export const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180] as const;

export const TIMEZONES = ["Africa/Cairo", "Asia/Dubai", "Asia/Riyadh", "Europe/Madrid", "Europe/London", "America/New_York"] as const;

/** Brand photo library available to admins until object storage is connected. */
export const BRAND_PHOTOS = [
  { url: "/brand/court-net.jpg", alt: "Net and racket on a blue court" },
  { url: "/brand/court-rackets.jpg", alt: "Racket head, ball and court glow" },
  { url: "/brand/court-line.jpg", alt: "Court line and ball" },
  { url: "/brand/court-handles.jpg", alt: "Rackets and balls" },
] as const;
