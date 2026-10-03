"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayerLevel } from "@prisma/client";
import { CalendarCheck, Check, Eye, EyeOff, Inbox, LogOut, MapPin, Navigation, Pencil, Receipt, Send, Share2, UserPlus, Users, X, XCircle } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button, IconButton } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch, ProgressBar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { money } from "@/components/patterns/booking-status";
import { GameStatusBadge, costLabel } from "@/components/patterns/game-card";
import { PlayerPicker, type PickedPlayer } from "@/components/patterns/player-picker";
import { MatchReasons, RequestStatusBadge } from "@/components/patterns/match-reasons";
import { RequestReviewCard } from "@/components/patterns/request-card";
import type { MatchResult } from "@/lib/matching";
import type { RequestReview, RequestView } from "@/server/services/matchmaking";
import { decideRequestAction, requestToJoinAction, withdrawRequestAction } from "@/server/actions/matchmaking";
import { GAME_COST_MODES, GAME_JOIN_POLICIES, GAME_LEVEL_POLICIES, GAME_VISIBILITY, MATCH_TYPES, gameFormatLabel } from "@/lib/catalog";
import { formatInZone } from "@/lib/time";
import type { GameView } from "@/server/services/game-sessions";
import { cancelGameAction, confirmGameAction, inviteToGameAction, leaveGameAction, publishGameAction, removeParticipantAction, respondToInviteAction, updateGameAction } from "@/server/actions/game-sessions";

type Compat = (MatchResult & { waitlist: boolean }) | null;
type Props = {
  game: GameView;
  viewerId: string;
  staffCanManage: boolean;
  levels: Record<string, string>;
  compat: { solo: Compat; pair: Compat };
  pairs: { id: string; label: string }[];
  /** Organizer (or staff) review list; null for everyone else. */
  requests: RequestReview[] | null;
  myRequest: RequestView | null;
};

const ERROR_TITLES: Record<string, string> = { SESSION_FULL: "Game is full", INVALID_TRANSITION: "Not possible right now", FORBIDDEN: "Not allowed", NOT_ELIGIBLE: "Not eligible", CONFLICT: "Already there" };

const PARTICIPANT_TONE = { ACCEPTED: "success", INVITED: "warning", DECLINED: "neutral", LEFT: "neutral", REMOVED: "neutral" } as const;
const PARTICIPANT_LABEL = { ACCEPTED: "In", INVITED: "Invited", DECLINED: "Declined", LEFT: "Left", REMOVED: "Removed" } as const;

export function GameDetail({ game, viewerId, staffCanManage, levels, compat, pairs, requests, myRequest }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<"SOLO" | "PAIR" | null>(null);
  const [askPair, setAskPair] = useState(pairs[0]?.id ?? "");
  const [invite, setInvite] = useState(false);
  const [picked, setPicked] = useState<PickedPlayer[]>([]);
  const [edit, setEdit] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [confirmLineup, setConfirmLineup] = useState(false);
  const [leave, setLeave] = useState(false);
  const [remove, setRemove] = useState<{ userId: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tz = game.location.timezone;
  const start = new Date(game.startsAt);
  const end = new Date(game.endsAt);
  const organizer = game.organizerId === viewerId;
  const me = game.participants.find((p) => p.userId === viewerId) ?? null;
  const live = ["DRAFT", "OPEN", "FULL", "CONFIRMED"].includes(game.status);
  const editable = ["DRAFT", "OPEN", "FULL"].includes(game.status);
  const invitable = organizer && ["DRAFT", "OPEN"].includes(game.status) && game.acceptedCount + game.invitedCount < game.maxPlayers;
  const lineup = game.participants.filter((p) => ["ACCEPTED", "INVITED"].includes(p.status));
  const past = game.participants.filter((p) => !["ACCEPTED", "INVITED"].includes(p.status));
  const heroTone = game.status === "CANCELLED" ? "default" : live || game.status === "IN_PROGRESS" ? "brand" : "default";
  const openRequest = myRequest && (myRequest.status === "PENDING" || myRequest.status === "WAITLISTED") ? myRequest : null;
  const canAskSolo = !!compat.solo && (compat.solo.eligible || compat.solo.waitlist);
  const canAskPair = !!compat.pair && (compat.pair.eligible || compat.pair.waitlist);
  const showAsk = !organizer && !openRequest && (!me || !["ACCEPTED", "INVITED"].includes(me.status)) && live && game.visibility === "PUBLIC";
  const openRequests = (requests ?? []).filter((r) => r.status === "PENDING" || r.status === "WAITLISTED");
  const decidedRequests = (requests ?? []).filter((r) => !["PENDING", "WAITLISTED"].includes(r.status));
  const teamLabel = (pairId: string | null) => (pairId ? (pairId === game.pairId ? (game.pair?.name?.trim() || "Team A") : lineup.find((p) => p.pairId === pairId && p.userId !== viewerId)?.user.name.split(" ")[0] ? `Pair ${[...new Set(lineup.filter((p) => p.pairId === pairId).map((p) => p.user.name.split(" ")[0]))].join(" & ")}` : "Pair") : null);

  async function sendRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ask) return;
    const message = String(new FormData(e.currentTarget).get("message") ?? "");
    const ok = await act("Request sent", () => requestToJoinAction(game.id, { kind: ask, pairId: ask === "PAIR" ? askPair : undefined, message: message || undefined }), "request");
    if (ok) setAsk(null);
  }

  async function decide(requestId: string, decision: "ACCEPT" | "DECLINE", note?: string) {
    return act(decision === "ACCEPT" ? "Added to the lineup" : "Request declined", () => decideRequestAction(requestId, { decision, note }), `req-${requestId}`);
  }

  async function act(label: string, fn: () => Promise<{ ok: boolean; message?: string; code?: string }>, key = label) {
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      toast({ tone: "success", title: label });
      router.refresh();
      return true;
    }
    toast({ tone: "danger", title: (res.code && ERROR_TITLES[res.code]) ?? "Action failed", description: res.message });
    setError(res.message ?? null);
    return false;
  }

  async function submitEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const costMode = String(f.get("costMode"));
    const ok = await act("Game updated", () =>
      updateGameAction(game.id, {
        matchType: String(f.get("matchType")),
        joinPolicy: String(f.get("joinPolicy")),
        levelPolicy: String(f.get("levelPolicy")),
        costMode,
        costPerPlayerCents: costMode === "FIXED_PER_PLAYER" ? Math.round(Number(f.get("costPerPlayer") || 0) * 100) : null,
        description: String(f.get("description") ?? ""),
        notes: String(f.get("notes") ?? ""),
        ...(game.format === "OPEN" ? { maxPlayers: Number(f.get("maxPlayers")) } : {}),
      }),
    );
    if (ok) setEdit(false);
  }

  function share() {
    const url = `${window.location.origin}/app/play/${game.code}`;
    if (navigator.share) void navigator.share({ title: "HITTERS game", text: `Join my padel game at ${game.location.name}`, url }).catch(() => undefined);
    else {
      void navigator.clipboard?.writeText(url);
      toast({ title: "Link copied", description: game.code });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back="/app/play"
        eyebrow={game.code}
        title={game.description?.trim() || `${gameFormatLabel(game.format)} at ${game.location.name.replace("HITTERS ", "")}`}
        action={
          <div className="flex items-center gap-2">
            <IconButton variant="ghost" size="sm" label="Share" onClick={share}>
              <Share2 />
            </IconButton>
            <GameStatusBadge status={game.status} />
          </div>
        }
      />

      <Card variant={heroTone} padding="lg" className={heroTone === "brand" ? "court-line" : ""}>
        <div className="relative">
          <div className={`text-overline uppercase ${heroTone === "brand" ? "text-white/80" : "text-fg-subtle"}`}>{formatInZone(start, tz, { weekday: "long", day: "numeric", month: "long" })}</div>
          <div className="mt-2 text-display tabular">
            {formatInZone(start, tz, { hour: "2-digit", minute: "2-digit" })}
            <span className={`text-h3 ${heroTone === "brand" ? "text-white/70" : "text-fg-muted"}`}> – {formatInZone(end, tz, { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div className="mt-1 text-body-lg font-semibold">{game.location.name}</div>
          <div className={`flex items-center gap-1 text-body-sm ${heroTone === "brand" ? "text-white/80" : "text-fg-muted"}`}>
            <MapPin size={14} /> {game.court.name} · {game.booking.durationMinutes} min · {game.location.address}
          </div>
          <div className="mt-4">
            <ProgressBar value={game.acceptedCount} max={game.maxPlayers} tone={game.spotsLeft === 0 ? "success" : "volt"} label={`${game.acceptedCount} of ${game.maxPlayers} players · ${game.spotsLeft === 0 ? "full" : `${game.spotsLeft} spot${game.spotsLeft === 1 ? "" : "s"} left`}`} />
          </div>
          {live && (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" className={heroTone === "brand" ? "border-transparent bg-white text-blue-700 hover:bg-blue-50" : ""} href={`https://maps.google.com/?q=${encodeURIComponent(game.location.address)}`} leftIcon={<Navigation />}>
                Directions
              </Button>
              {organizer ? (
                <Button variant="outline" className={heroTone === "brand" ? "border-white/40 text-white hover:bg-white/10" : ""} href={`/app/bookings/${game.bookingId}`} leftIcon={<CalendarCheck />}>
                  Booking
                </Button>
              ) : (
                <Button variant="outline" className={heroTone === "brand" ? "border-white/40 text-white hover:bg-white/10" : ""} onClick={share} leftIcon={<Share2 />}>
                  Share
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {me?.status === "INVITED" && live && (
        <Card variant="glass" padding="md">
          <div className="text-h4">{game.organizer.name.split(" ")[0]} invited you</div>
          <p className="mt-1 text-body-sm text-fg-muted">Only you can accept this invitation. {game.spotsLeft === 0 ? "The game is currently full; you can still decline." : `${game.spotsLeft} spot${game.spotsLeft === 1 ? "" : "s"} left.`}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" leftIcon={<X />} loading={busy === "decline"} onClick={() => act("Invitation declined", () => respondToInviteAction(game.id, "DECLINE"), "decline")}>
              Can&apos;t make it
            </Button>
            <Button leftIcon={<Check />} loading={busy === "accept"} onClick={() => act("You're in", () => respondToInviteAction(game.id, "ACCEPT"), "accept")}>
              I&apos;m in
            </Button>
          </div>
        </Card>
      )}

      {openRequest && (
        <Card variant="glass" padding="md">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-h4">
                {openRequest.kind === "PAIR" ? "Your pair asked to join" : "You asked to join"} <RequestStatusBadge status={openRequest.status} />
              </div>
              <p className="mt-1 text-body-sm text-fg-muted">{openRequest.status === "WAITLISTED" ? "The game is full right now. You move back to pending if a spot opens." : "The organizer reviews your level and profile and decides. You will be notified."}</p>
            </div>
            <Button size="sm" variant="secondary" loading={busy === "withdraw"} onClick={() => act("Request withdrawn", () => withdrawRequestAction(openRequest.id), "withdraw")}>
              Withdraw
            </Button>
          </div>
          <MatchReasons reasons={openRequest.reasons} compact className="mt-3" />
        </Card>
      )}
      {myRequest && !openRequest && myRequest.status !== "ACCEPTED" && !me && (
        <Alert tone={myRequest.status === "DECLINED" ? "warning" : "info"} title={`Your request was ${myRequest.status.toLowerCase()}`}>
          {myRequest.decisionNote ? `Organizer: ${myRequest.decisionNote}` : myRequest.status === "EXPIRED" ? "The game started or the request timed out." : "You can ask again if a spot is still open."}
        </Alert>
      )}
      {showAsk && (compat.solo || compat.pair) && (
        <Card variant="glass" padding="md">
          {canAskSolo || canAskPair ? (
            <>
              <div className="text-h4">{compat.solo?.waitlist && !compat.solo.eligible ? "Game is full. Join the waitlist?" : "Ask to join this game"}</div>
              <p className="mt-1 text-body-sm text-fg-muted">The organizer sees your official level, profile and these reasons, then accepts or declines. Nobody is added automatically.</p>
              <MatchReasons reasons={(compat.solo?.eligible || compat.solo?.waitlist ? compat.solo : compat.pair)!.reasons} compact className="mt-3" />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {canAskSolo && (
                  <Button leftIcon={<Send />} onClick={() => setAsk("SOLO")}>
                    {compat.solo!.eligible ? "Request 1 spot" : "Join waitlist"}
                  </Button>
                )}
                {canAskPair && (
                  <Button variant={canAskSolo ? "secondary" : "primary"} leftIcon={<Users />} onClick={() => setAsk("PAIR")}>
                    {compat.pair!.eligible ? "Request both spots as a pair" : "Waitlist as a pair"}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="text-h4">Not a match for you</div>
              <ul className="mt-1 list-disc pl-5 text-body-sm text-fg-muted">
                {[...new Set([...(compat.solo?.blockers ?? []), ...(game.joinPolicy === "PAIRS_ONLY" ? (compat.pair?.blockers ?? []) : [])])].slice(0, 3).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              {game.joinPolicy === "PAIRS_ONLY" && pairs.length === 0 && (
                <Button size="sm" variant="secondary" className="mt-3" href="/app/play/pairs">
                  Create a pair
                </Button>
              )}
            </>
          )}
        </Card>
      )}

      {game.status === "CANCELLED" && (
        <Alert tone="danger" title="This game was cancelled">
          {game.cancelReason ?? "No reason recorded."}
        </Alert>
      )}
      {game.status === "DRAFT" && organizer && (
        <Alert tone="info" title="Draft: only you and invited players can see this game">
          Invite players, then publish to open it. {game.visibility === "PUBLIC" ? "It will be listed in Discover once published." : "It stays private unless you make it discoverable."}
        </Alert>
      )}
      {error && (
        <Alert tone="danger" title="Something went wrong">
          {error}
        </Alert>
      )}

      {organizer && live && (
        <section className="space-y-2">
          <SectionHeader eyebrow="Organizer" title="Manage" />
          <div className="grid grid-cols-2 gap-2">
            {game.status === "DRAFT" && (
              <Button leftIcon={<Eye />} loading={busy === "publish"} onClick={() => act("Game published", () => publishGameAction(game.id), "publish")}>
                Publish
              </Button>
            )}
            {game.status === "FULL" && (
              <Button leftIcon={<CalendarCheck />} onClick={() => setConfirmLineup(true)}>
                Confirm lineup
              </Button>
            )}
            {game.status === "OPEN" && (
              <Button variant="secondary" disabled leftIcon={<CalendarCheck />} title="Fill every spot first">
                Confirm lineup
              </Button>
            )}
            <Button variant="secondary" leftIcon={<UserPlus />} disabled={!invitable} onClick={() => setInvite(true)}>
              Invite players
            </Button>
            {editable && (
              <Button variant="secondary" leftIcon={<Pencil />} onClick={() => setEdit(true)}>
                Edit details
              </Button>
            )}
            <Button variant="ghost" leftIcon={<XCircle />} className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setCancel(true)}>
              Cancel game
            </Button>
          </div>
          {editable && (
            <Card padding="md" className="space-y-4">
              <Switch
                checked={game.visibility === "PUBLIC"}
                disabled={busy === "visibility"}
                onChange={(v) => act(v ? "Game is discoverable" : "Game is private", () => updateGameAction(game.id, { visibility: v ? "PUBLIC" : "PRIVATE" }), "visibility")}
                label="Discoverable"
                description={game.visibility === "PUBLIC" ? "Listed in Play for players at this club once published." : "Only invited players can find it."}
              />
              <Switch
                checked={game.openToRequests}
                disabled={busy === "requests"}
                onChange={(v) => act(v ? "Spots opened to requests" : "Requests closed", () => updateGameAction(game.id, { openToRequests: v }), "requests")}
                label="Open remaining spots"
                description={game.joinPolicy === "PAIRS_ONLY" ? "Opposing pairs can request both spots; you approve the challenge." : "Compatible players ask for a spot; you approve each one."}
              />
            </Card>
          )}
        </section>
      )}

      {requests && (openRequests.length > 0 || decidedRequests.length > 0) && (
        <section>
          <SectionHeader eyebrow={organizer ? "Decide who joins" : "Requests"} title={openRequests.length ? `${openRequests.length} request${openRequests.length === 1 ? "" : "s"} waiting` : "Requests"} />
          <div className="space-y-3">
            {openRequests.map((r) => (
              <RequestReviewCard key={r.id} request={r} levels={levels} spotsLeft={game.spotsLeft} onDecide={organizer ? decide : async () => false} busy={busy === `req-${r.id}`} />
            ))}
            {decidedRequests.length > 0 && (
              <details className="text-caption text-fg-subtle">
                <summary className="cursor-pointer py-1">{decidedRequests.length} earlier request{decidedRequests.length === 1 ? "" : "s"}</summary>
                <ul className="mt-1 space-y-1">
                  {decidedRequests.map((r) => (
                    <li key={r.id} className="flex items-center justify-between">
                      <span>{r.members.map((m) => m.name).join(" & ")}</span>
                      <RequestStatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </section>
      )}
      {organizer && live && game.openToRequests && openRequests.length === 0 && (
        <Card variant="outline" padding="sm" className="flex items-center gap-3 text-caption text-fg-subtle">
          <Inbox size={16} /> Open to requests: compatible players at Level {game.levels.length ? game.levels.join("/") : "any"} can ask to join. You decide each one.
        </Card>
      )}

      {!organizer && staffCanManage && live && (
        <Button variant="ghost" fullWidth leftIcon={<XCircle />} className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setCancel(true)}>
          Cancel game (staff)
        </Button>
      )}

      <Card padding="sm">
        <ul className="divide-y divide-line/10 text-body-sm">
          <li className="flex items-center gap-3 py-2.5">
            <Users size={16} className="text-blue-300" /> <span className="text-fg-muted">Format</span>
            <span className="ml-auto font-semibold">
              {gameFormatLabel(game.format)} · {game.maxPlayers} players{game.matchType !== "ANY" ? ` · ${game.matchType === "FRIENDLY" ? "friendly" : "competitive"}` : ""}
            </span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <span className="text-fg-muted">Levels</span>
            <span className="ml-auto flex items-center gap-1">{game.levels.length ? game.levels.map((l) => <LevelBadge key={l} level={l} size="sm" label={levels[l]} />) : <Badge size="sm">Any level</Badge>}</span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Receipt size={16} className="text-blue-300" /> <span className="text-fg-muted">Cost</span>
            <span className="ml-auto text-right font-semibold tabular">
              {costLabel(game)}
              <span className="block text-caption font-normal text-fg-subtle">
                {game.costMode === "SPLIT_EVENLY" ? `${money(game.booking.priceCents, game.booking.currency)} court ÷ ${game.maxPlayers}, paid at the venue` : GAME_COST_MODES.find((c) => c.value === game.costMode)?.label}
              </span>
            </span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            {game.visibility === "PUBLIC" ? <Eye size={16} className="text-blue-300" /> : <EyeOff size={16} className="text-blue-300" />} <span className="text-fg-muted">Visibility</span>
            <span className="ml-auto font-semibold">
              {GAME_VISIBILITY.find((v) => v.value === game.visibility)?.label}
              {game.openToRequests ? " · open to requests" : ""}
            </span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Users size={16} className="text-blue-300" /> <span className="text-fg-muted">Who can ask</span>
            <span className="ml-auto text-right font-semibold">
              {GAME_JOIN_POLICIES.find((j) => j.value === game.joinPolicy)?.label}
              <span className="block text-caption font-normal text-fg-subtle">{GAME_LEVEL_POLICIES.find((l) => l.value === game.levelPolicy)?.label}</span>
            </span>
          </li>
        </ul>
      </Card>

      <section>
        <SectionHeader title="Players" eyebrow={`${game.acceptedCount} of ${game.maxPlayers}`} action={invitable ? <Button size="sm" variant="link" leftIcon={<UserPlus />} onClick={() => setInvite(true)}>Invite</Button> : undefined} />
        <div className="space-y-2">
          {lineup.map((p) => (
            <Card key={p.id} padding="sm">
              <div className="flex items-center gap-3">
                <Avatar name={p.user.name} size="sm" ring={p.userId === viewerId} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-body-sm font-bold">{p.user.name}</span>
                    {p.user.playerProfile?.level && <LevelBadge level={p.user.playerProfile.level as PlayerLevel} size="sm" label={levels[p.user.playerProfile.level]} />}
                  </div>
                  <div className="text-caption capitalize text-fg-muted">
                    {p.role === "ORGANIZER" ? "Organizer" : p.user.playerProfile?.side ? `${p.user.playerProfile.side.toLowerCase()} side` : "Player"}
                    {p.pairId && <span className="normal-case text-blue-300"> · {teamLabel(p.pairId)}</span>}
                  </div>
                </div>
                <Badge size="sm" tone={PARTICIPANT_TONE[p.status]}>
                  {PARTICIPANT_LABEL[p.status]}
                </Badge>
                {organizer && p.role !== "ORGANIZER" && live && (
                  <IconButton variant="ghost" size="sm" label={p.status === "INVITED" ? "Withdraw invitation" : "Remove player"} onClick={() => setRemove({ userId: p.userId, name: p.user.name })}>
                    <X />
                  </IconButton>
                )}
              </div>
            </Card>
          ))}
          {Array.from({ length: game.spotsLeft - Math.max(0, Math.min(game.spotsLeft, game.invitedCount)) }).map((_, i) => (
            <Card key={`open-${i}`} variant="outline" padding="sm" className="flex items-center justify-between text-caption text-fg-subtle">
              <span>Open spot</span>
              {game.openToRequests && game.visibility === "PUBLIC" ? <Badge size="sm" tone="info">Discoverable</Badge> : organizer ? <Badge size="sm">Invite someone</Badge> : null}
            </Card>
          ))}
          {past.length > 0 && (
            <details className="text-caption text-fg-subtle">
              <summary className="cursor-pointer py-1">{past.length} earlier response{past.length === 1 ? "" : "s"}</summary>
              <ul className="mt-1 space-y-1">
                {past.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>{p.user.name}</span>
                    <span>{PARTICIPANT_LABEL[p.status]}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>

      {game.notes && (
        <Card padding="md">
          <div className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Notes for players</div>
          <p className="mt-1 text-body-sm text-fg-muted">{game.notes}</p>
        </Card>
      )}

      {me?.status === "ACCEPTED" && !organizer && live && (
        <Button variant="ghost" fullWidth leftIcon={<LogOut />} className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setLeave(true)}>
          Leave game
        </Button>
      )}

      {/* ---------------------------------------------------------------- Dialogs */}
      <Modal
        open={invite}
        onClose={() => setInvite(false)}
        title="Invite players"
        description={`${Math.max(0, game.maxPlayers - game.acceptedCount - game.invitedCount)} invitation${game.maxPlayers - game.acceptedCount - game.invitedCount === 1 ? "" : "s"} available. Players accept themselves.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setInvite(false)}>
              Close
            </Button>
            <Button
              disabled={picked.length === 0}
              loading={busy === "invite"}
              onClick={async () => {
                const ok = await act(`${picked.length} invitation${picked.length === 1 ? "" : "s"} sent`, () => inviteToGameAction(game.id, picked.map((p) => p.id)), "invite");
                if (ok) {
                  setPicked([]);
                  setInvite(false);
                }
              }}
            >
              Send invitations
            </Button>
          </>
        }
      >
        <PlayerPicker value={picked} onChange={setPicked} max={Math.max(0, game.maxPlayers - game.acceptedCount - game.invitedCount)} exclude={lineup.map((p) => p.userId)} />
      </Modal>

      <Modal open={edit} onClose={() => setEdit(false)} title="Edit game" description="Court and time come from the booking. Reschedule the booking to move the game.">
        <form onSubmit={submitEdit} className="space-y-4 pb-2">
          {game.format === "OPEN" && (
            <Field label="Players (including you)" hint={`At least ${game.acceptedCount + game.invitedCount} (current lineup and invitations).`}>
              {(id) => <Input id={id} name="maxPlayers" type="number" min={Math.max(2, game.acceptedCount + game.invitedCount)} max={16} defaultValue={game.maxPlayers} />}
            </Field>
          )}
          <Field label="Game type">{(id) => <Select id={id} name="matchType" defaultValue={game.matchType} options={MATCH_TYPES.map((m) => ({ value: m.value, label: m.label }))} />}</Field>
          <Field label="Who can ask to join" hint={game.pairId ? "Your game is set up as a pair; a challenge takes an opposing pair." : undefined}>{(id) => <Select id={id} name="joinPolicy" defaultValue={game.joinPolicy} options={GAME_JOIN_POLICIES.filter((j) => game.pairId || j.value !== "PAIRS_ONLY").map((j) => ({ value: j.value, label: j.label }))} />}</Field>
          <Field label="Levels" hint="Adjacent levels only apply when the academy allows them.">{(id) => <Select id={id} name="levelPolicy" defaultValue={game.levelPolicy} options={GAME_LEVEL_POLICIES.map((l) => ({ value: l.value, label: l.label }))} />}</Field>
          <Field label="Cost">{(id) => <Select id={id} name="costMode" defaultValue={game.costMode} options={GAME_COST_MODES.map((c) => ({ value: c.value, label: c.label }))} />}</Field>
          <Field label="Amount per player (EGP), for fixed cost">{(id) => <Input id={id} name="costPerPlayer" type="number" min={0} step={10} defaultValue={game.costPerPlayerCents ? game.costPerPlayerCents / 100 : ""} />}</Field>
          <Field label="Title or description">{(id) => <Input id={id} name="description" maxLength={500} defaultValue={game.description ?? ""} />}</Field>
          <Field label="Notes for players">{(id) => <Textarea id={id} name="notes" maxLength={500} defaultValue={game.notes ?? ""} />}</Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEdit(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy === "Game updated"}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmLineup}
        onClose={() => setConfirmLineup(false)}
        title="Confirm this lineup?"
        description="Every player will be told the game is on. If someone drops out later the spot reopens."
        confirmLabel="Confirm game"
        loading={busy === "confirm"}
        onConfirm={async () => {
          const ok = await act("Game confirmed", () => confirmGameAction(game.id), "confirm");
          if (ok) setConfirmLineup(false);
        }}
      />
      <ConfirmDialog
        open={leave}
        onClose={() => setLeave(false)}
        title="Leave this game?"
        description="The organizer will be notified and your spot reopens."
        confirmLabel="Leave"
        tone="danger"
        loading={busy === "leave"}
        onConfirm={async () => {
          const ok = await act("You left the game", () => leaveGameAction(game.id), "leave");
          if (ok) setLeave(false);
        }}
      />
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title={remove ? `Remove ${remove.name.split(" ")[0]}?` : ""}
        description="They will be notified. You can invite them again later."
        confirmLabel="Remove"
        tone="danger"
        loading={busy === "remove"}
        onConfirm={async () => {
          if (!remove) return;
          const ok = await act("Player removed", () => removeParticipantAction(game.id, remove.userId), "remove");
          if (ok) setRemove(null);
        }}
      />
      <Modal open={cancel} onClose={() => setCancel(false)} title="Cancel this game?" description="Players are notified. Your court booking stays reserved; cancel it separately if you no longer need the court." size="sm">
        <form
          className="space-y-4 pb-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
            const ok = await act("Game cancelled", () => cancelGameAction(game.id, reason || undefined), "cancel");
            if (ok) setCancel(false);
          }}
        >
          <Field label="Reason (optional)">{(id) => <Textarea id={id} name="reason" maxLength={500} placeholder="Let players know why" />}</Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCancel(false)}>
              Keep game
            </Button>
            <Button type="submit" variant="danger" loading={busy === "cancel"}>
              Cancel game
            </Button>
          </div>
        </form>
      </Modal>
      <RequestModal open={!!ask} kind={ask ?? "SOLO"} pairs={pairs} pairId={askPair} onPair={setAskPair} onClose={() => setAsk(null)} onSubmit={sendRequest} busy={busy === "request"} reasons={(ask === "PAIR" ? compat.pair : compat.solo)?.reasons ?? []} />
    </div>
  );
}

export function RequestModal({ open, kind, pairs, pairId, onPair, onClose, onSubmit, busy, reasons }: { open: boolean; kind: "SOLO" | "PAIR"; pairs: { id: string; label: string }[]; pairId: string; onPair: (id: string) => void; onClose: () => void; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; busy: boolean; reasons: MatchResult["reasons"] }) {
  return (
    <Modal open={open} onClose={onClose} title={kind === "PAIR" ? "Request both spots as a pair" : "Request to join"} description="The organizer sees your level, profile and these reasons before deciding." size="sm">
      <form onSubmit={onSubmit} className="space-y-4 pb-2">
        <MatchReasons reasons={reasons} />
        {kind === "PAIR" && <Field label="Pair">{(id) => <Select id={id} value={pairId} onChange={(e) => onPair(e.target.value)} options={pairs.map((p) => ({ value: p.id, label: p.label }))} />}</Field>}
        <Field label="Message to the organizer (optional)">{(id) => <Textarea id={id} name="message" maxLength={300} placeholder="Left side, steady, happy to split the court" />}</Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Send request
          </Button>
        </div>
      </form>
    </Modal>
  );
}
