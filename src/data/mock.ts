import type { Level } from "@/lib/tokens";

/**
 * Static mock data used to render UI shells.
 * Replaced by the database layer in a later phase; shapes mirror the planned schema.
 */

export type Location = {
  slug: string;
  name: string;
  city: string;
  area: string;
  address: string;
  courts: number;
  indoorCourts: number;
  rating: number;
  reviews: number;
  priceFrom: number;
  image: string;
  hours: string;
  amenities: string[];
  distanceKm?: number;
};

export type Court = { id: string; locationSlug: string; name: string; type: "Indoor" | "Outdoor" | "Panoramic"; status: "available" | "maintenance" };

export type Player = {
  id: string;
  name: string;
  level: Level;
  city: string;
  matches: number;
  wins: number;
  rating: number;
  online?: boolean;
  side: "Left" | "Right" | "Both";
  bio: string;
  memberSince: string;
  homeClub: string;
};

export type Match = {
  id: string;
  title: string;
  locationSlug: string;
  court: string;
  date: string;
  time: string;
  levels: Level[];
  playerIds: string[];
  organizerId: string;
  status: "open" | "full" | "live" | "completed";
  type: "Friendly" | "Competitive" | "Training";
  pricePerPlayer: number;
  /** Matching mode the organiser opened the session with. */
  mode: "Solo" | "Pair" | "3+1";
};

export type Trainer = {
  id: string;
  name: string;
  title: string;
  rating: number;
  reviews: number;
  locationSlugs: string[];
  specialties: string[];
  pricePerHour: number;
  bio: string;
  years: number;
  languages: string[];
};

export type Program = {
  id: string;
  name: string;
  locationSlug: string;
  trainerId: string;
  levels: Level[];
  weeks: number;
  sessionsPerWeek: number;
  price: number;
  startDate: string;
  spotsLeft: number;
  capacity: number;
  description: string;
  schedule: string;
  tag?: "New" | "Popular" | "Last spots";
};

export type Booking = {
  id: string;
  playerId: string;
  locationSlug: string;
  court: string;
  date: string;
  time: string;
  durationMin: number;
  status: "confirmed" | "pending" | "cancelled" | "completed";
  price: number;
};

export type Notification = {
  id: string;
  kind: "match" | "booking" | "program" | "system" | "payment";
  title: string;
  body: string;
  time: string;
  read: boolean;
  href: string;
};

export const CURRENCY = "EGP";
export const money = (n: number) => `${CURRENCY} ${n.toLocaleString("en")}`;

export const currentUser: Player = {
  id: "p-me",
  name: "Amr Hefny",
  level: "B",
  city: "Cairo",
  matches: 48,
  wins: 29,
  rating: 4.8,
  side: "Right",
  bio: "Right-side player who loves a fast net game. Looking for competitive doubles on weekday evenings.",
  memberSince: "Mar 2025",
  homeClub: "new-cairo",
};

export const locations: Location[] = [
  {
    slug: "new-cairo",
    name: "HITTERS New Cairo",
    city: "Cairo",
    area: "Fifth Settlement",
    address: "90th St, Fifth Settlement, New Cairo",
    courts: 8,
    indoorCourts: 4,
    rating: 4.9,
    reviews: 312,
    priceFrom: 450,
    image: "/brand/court-net.jpg",
    hours: "07:00 – 01:00",
    amenities: ["Pro shop", "Café", "Lockers", "Parking", "Showers", "Coaching"],
    distanceKm: 3.2,
  },
  {
    slug: "sheikh-zayed",
    name: "HITTERS Sheikh Zayed",
    city: "Giza",
    area: "Sheikh Zayed",
    address: "Arkan Plaza, Sheikh Zayed",
    courts: 6,
    indoorCourts: 6,
    rating: 4.8,
    reviews: 204,
    priceFrom: 500,
    image: "/brand/court-rackets.jpg",
    hours: "08:00 – 00:00",
    amenities: ["Indoor AC", "Café", "Lockers", "Parking", "Physio"],
    distanceKm: 21.5,
  },
  {
    slug: "maadi",
    name: "HITTERS Maadi",
    city: "Cairo",
    area: "Degla",
    address: "Road 233, Degla, Maadi",
    courts: 4,
    indoorCourts: 0,
    rating: 4.7,
    reviews: 158,
    priceFrom: 400,
    image: "/brand/court-line.jpg",
    hours: "07:00 – 23:00",
    amenities: ["Outdoor", "Café", "Lockers", "Kids academy"],
    distanceKm: 9.8,
  },
  {
    slug: "north-coast",
    name: "HITTERS North Coast",
    city: "Marassi",
    area: "Sidi Abdel Rahman",
    address: "Marassi Marina, North Coast",
    courts: 5,
    indoorCourts: 0,
    rating: 4.9,
    reviews: 96,
    priceFrom: 600,
    image: "/brand/court-handles.jpg",
    hours: "Seasonal · 09:00 – 02:00",
    amenities: ["Beach side", "Panoramic courts", "Lounge", "Parking"],
    distanceKm: 268,
  },
];

export const courts: Court[] = [
  { id: "c1", locationSlug: "new-cairo", name: "Court 1", type: "Panoramic", status: "available" },
  { id: "c2", locationSlug: "new-cairo", name: "Court 2", type: "Panoramic", status: "available" },
  { id: "c3", locationSlug: "new-cairo", name: "Court 3", type: "Indoor", status: "available" },
  { id: "c4", locationSlug: "new-cairo", name: "Court 4", type: "Indoor", status: "maintenance" },
  { id: "c5", locationSlug: "new-cairo", name: "Court 5", type: "Outdoor", status: "available" },
  { id: "c6", locationSlug: "new-cairo", name: "Court 6", type: "Outdoor", status: "available" },
];

export const players: Player[] = [
  { id: "p1", name: "Omar Farouk", level: "A", city: "Cairo", matches: 132, wins: 91, rating: 4.9, online: true, side: "Left", bio: "Former tennis player, aggressive baseline.", memberSince: "Jan 2024", homeClub: "new-cairo" },
  { id: "p2", name: "Nour El Din", level: "B", city: "Cairo", matches: 64, wins: 35, rating: 4.7, online: true, side: "Right", bio: "Weekend warrior, consistent lobs.", memberSince: "Jun 2024", homeClub: "maadi" },
  { id: "p3", name: "Laila Mansour", level: "B", city: "Giza", matches: 71, wins: 40, rating: 4.8, side: "Both", bio: "Plays both sides, loves long rallies.", memberSince: "Feb 2025", homeClub: "sheikh-zayed" },
  { id: "p4", name: "Karim Adel", level: "C", city: "Cairo", matches: 22, wins: 9, rating: 4.5, online: true, side: "Right", bio: "Improving fast, open to coaching tips.", memberSince: "Aug 2025", homeClub: "new-cairo" },
  { id: "p5", name: "Salma Youssef", level: "A", city: "Cairo", matches: 150, wins: 108, rating: 5.0, side: "Left", bio: "Club champion 2025.", memberSince: "Nov 2023", homeClub: "new-cairo" },
  { id: "p6", name: "Youssef Tarek", level: "D", city: "Giza", matches: 6, wins: 2, rating: 4.2, side: "Right", bio: "New to padel, very keen.", memberSince: "Sep 2026", homeClub: "sheikh-zayed" },
  { id: "p7", name: "Hana Sherif", level: "C", city: "Cairo", matches: 30, wins: 14, rating: 4.6, online: true, side: "Left", bio: "Early morning sessions preferred.", memberSince: "Apr 2026", homeClub: "maadi" },
];

export const matches: Match[] = [
  { id: "m1", title: "Evening doubles", locationSlug: "new-cairo", court: "Court 2", date: "Today", time: "19:00", levels: ["B"], playerIds: ["p1", "p2", "p3"], organizerId: "p1", status: "open", type: "Competitive", pricePerPlayer: 125, mode: "3+1" },
  { id: "m2", title: "Friendly mix", locationSlug: "new-cairo", court: "Court 5", date: "Today", time: "21:00", levels: ["B", "C"], playerIds: ["p4", "p7"], organizerId: "p4", status: "open", type: "Friendly", pricePerPlayer: 110, mode: "Pair" },
  { id: "m3", title: "Level A ladder", locationSlug: "sheikh-zayed", court: "Court 1", date: "Tomorrow", time: "18:30", levels: ["A"], playerIds: ["p5", "p1", "p3", "p2"], organizerId: "p5", status: "full", type: "Competitive", pricePerPlayer: 140, mode: "Solo" },
  { id: "m4", title: "Beginners social", locationSlug: "maadi", court: "Court 3", date: "Sat 4 Oct", time: "10:00", levels: ["C", "D"], playerIds: ["p6"], organizerId: "p6", status: "open", type: "Friendly", pricePerPlayer: 100, mode: "Solo" },
  { id: "m5", title: "Live now · Court 1", locationSlug: "new-cairo", court: "Court 1", date: "Today", time: "17:00", levels: ["A", "B"], playerIds: ["p5", "p1", "p-me", "p3"], organizerId: "p5", status: "live", type: "Competitive", pricePerPlayer: 125, mode: "Solo" },
];

export const trainers: Trainer[] = [
  { id: "t1", name: "Coach Ahmed Samir", title: "Head Coach · Level A certified", rating: 4.9, reviews: 188, locationSlugs: ["new-cairo", "maadi"], specialties: ["Technique", "Match tactics", "Competition prep"], pricePerHour: 900, bio: "12 years on the professional circuit in Spain. Builds complete players from footwork up.", years: 12, languages: ["Arabic", "English", "Spanish"] },
  { id: "t2", name: "Coach Dina Hassan", title: "Performance Coach", rating: 4.8, reviews: 121, locationSlugs: ["sheikh-zayed"], specialties: ["Beginners", "Women's padel", "Fitness"], pricePerHour: 700, bio: "Specialises in taking new players from first serve to their first tournament.", years: 7, languages: ["Arabic", "English"] },
  { id: "t3", name: "Coach Marco Ruiz", title: "Technical Director", rating: 5.0, reviews: 94, locationSlugs: ["new-cairo", "north-coast"], specialties: ["Advanced", "Bandeja & víbora", "Junior elite"], pricePerHour: 1200, bio: "Ex-World Padel Tour player. Runs the HITTERS elite pathway.", years: 15, languages: ["Spanish", "English"] },
];

export const programs: Program[] = [
  { id: "pr1", name: "Foundations", locationSlug: "new-cairo", trainerId: "t2", levels: ["D", "C"], weeks: 6, sessionsPerWeek: 2, price: 4800, startDate: "13 Oct", spotsLeft: 3, capacity: 8, description: "Grip, positioning, serve and the wall game. Everything you need to play your first real match.", schedule: "Mon & Wed · 18:00 – 19:30", tag: "Popular" },
  { id: "pr2", name: "Competitive Edge", locationSlug: "new-cairo", trainerId: "t1", levels: ["B"], weeks: 8, sessionsPerWeek: 2, price: 7200, startDate: "20 Oct", spotsLeft: 1, capacity: 6, description: "Tactical doubles, pressure drills and video analysis for players ready to climb to level A.", schedule: "Tue & Thu · 20:00 – 21:30", tag: "Last spots" },
  { id: "pr3", name: "Elite Pathway", locationSlug: "sheikh-zayed", trainerId: "t3", levels: ["A"], weeks: 12, sessionsPerWeek: 3, price: 14500, startDate: "3 Nov", spotsLeft: 4, capacity: 4, description: "Tournament preparation with the technical director. Includes fitness and sparring partners.", schedule: "Mon, Wed & Fri · 07:00 – 09:00", tag: "New" },
  { id: "pr4", name: "Junior Academy", locationSlug: "maadi", trainerId: "t1", levels: ["D", "C"], weeks: 10, sessionsPerWeek: 2, price: 5500, startDate: "11 Oct", spotsLeft: 6, capacity: 12, description: "Ages 8 to 14. Fun, structured coaching with end-of-term mini tournaments.", schedule: "Sat & Sun · 10:00 – 11:30" },
];

export const bookings: Booking[] = [
  { id: "b1", playerId: "p-me", locationSlug: "new-cairo", court: "Court 2", date: "Today", time: "19:00", durationMin: 90, status: "confirmed", price: 675 },
  { id: "b2", playerId: "p-me", locationSlug: "sheikh-zayed", court: "Court 1", date: "Sat 4 Oct", time: "11:00", durationMin: 60, status: "pending", price: 500 },
  { id: "b3", playerId: "p-me", locationSlug: "new-cairo", court: "Court 5", date: "28 Sep", time: "20:00", durationMin: 90, status: "completed", price: 675 },
  { id: "b4", playerId: "p-me", locationSlug: "maadi", court: "Court 3", date: "21 Sep", time: "09:00", durationMin: 60, status: "cancelled", price: 400 },
];

export const notifications: Notification[] = [
  { id: "n1", kind: "match", title: "Omar accepted your join request", body: "You're in for Evening doubles · Court 2 · 19:00 today.", time: "5m", read: false, href: "/app/play" },
  { id: "n2", kind: "booking", title: "Booking confirmed", body: "HITTERS New Cairo · Court 2 · Today 19:00 – 20:30.", time: "1h", read: false, href: "/app/profile" },
  { id: "n3", kind: "match", title: "A fourth player is needed", body: "Nour's session tonight at 21:00 matches your level. Tap to join.", time: "2h", read: false, href: "/app/play" },
  { id: "n4", kind: "program", title: "Competitive Edge · 1 spot left", body: "Your saved program is almost full. Secure your place.", time: "Yesterday", read: true, href: "/app/programs/pr2" },
  { id: "n5", kind: "payment", title: "Receipt available", body: "EGP 675 paid for Court 5 · 28 Sep.", time: "3d", read: true, href: "/app/profile" },
  { id: "n6", kind: "system", title: "Level assessment complete", body: "You've been placed at Level B. Keep climbing.", time: "1w", read: true, href: "/app/profile" },
];

export const timeSlots = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"];

/** Deterministic pseudo-availability so the booking grid looks real without a backend. */
export function slotStatus(courtId: string, slot: string, dayIndex: number): "available" | "booked" | "peak" {
  const h = parseInt(slot.slice(0, 2), 10);
  const seed = (courtId.charCodeAt(1) * 7 + h * 13 + dayIndex * 17) % 10;
  if (seed < 3) return "booked";
  if (h >= 18 && h <= 21) return "peak";
  return "available";
}

export const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id);
export const locationBySlug = (slug: string) => locations.find((l) => l.slug === slug);
