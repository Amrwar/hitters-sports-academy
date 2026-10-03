import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { getMyProfile } from "@/server/services/profiles";
import { listPublicLocations } from "@/server/services/locations";
import { listMyBookings } from "@/server/services/bookings";
import { ProfileView } from "./profile-view";

export default async function ProfilePage() {
  const actor = await requireActorOrRedirect("/app/profile");
  const [profile, locations, upcoming] = await Promise.all([getMyProfile(actor), listPublicLocations(), listMyBookings(actor, "upcoming")]);
  return <ProfileView profile={profile} locations={locations.map((l) => ({ id: l.id, name: l.name }))} isStaff={!!actor.globalRole || actor.memberships.length > 0} upcoming={upcoming} />;
}
